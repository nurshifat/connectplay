import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { AccessToken } from "livekit-server-sdk";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: "1mb" }));

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const livekitApiKey = process.env.LIVEKIT_API_KEY;
const livekitApiSecret = process.env.LIVEKIT_API_SECRET;
const livekitUrl = process.env.LIVEKIT_URL;

if (livekitUrl && !/^wss?:\/\//i.test(livekitUrl)) throw new Error("LIVEKIT_URL must start with ws:// or wss://");

function userClient(token: string) {
  if (!supabaseUrl || !supabaseAnonKey) throw new Error("Supabase server configuration is missing");
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

async function requireUser(req: express.Request) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) throw Object.assign(new Error("Unauthorized"), { status: 401 });
  const client = userClient(token);
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) throw Object.assign(new Error("Unauthorized"), { status: 401 });
  return { client, user: data.user };
}

function roomId(room: unknown) {
  if (typeof room !== "string" || room.length < 4 || room.length > 120) throw new Error("Invalid room");
  if (!/^dm-[0-9a-f-]{36}$/i.test(room) && !/^channel-[0-9a-f-]{36}$/i.test(room)) throw new Error("Invalid room");
  return room;
}

app.get("/api/health", (_req, res) => res.json({ ok: true, service: "connectplay" }));

app.post("/api/livekit/token", async (req, res) => {
  try {
    if (!livekitApiKey || !livekitApiSecret || !livekitUrl) return res.status(503).json({ error: "LiveKit is not configured" });
    const { client, user } = await requireUser(req);
    const room = roomId(req.body?.room);
    const [scope, ...idParts] = room.split("-");
    const id = idParts.join("-");

    if (scope === "dm") {
      const { data: member, error } = await client
        .from("conversation_members")
        .select("conversation_id")
        .eq("conversation_id", id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      if (!member) return res.status(403).json({ error: "You are not a member of this conversation" });
    } else {
      const { data: channel, error } = await client.from("channels").select("community_id").eq("id", id).maybeSingle();
      if (error) throw error;
      if (!channel) return res.status(404).json({ error: "Channel not found" });
      const { data: member, error: memberError } = await client
        .from("community_members")
        .select("community_id")
        .eq("community_id", channel.community_id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (memberError) throw memberError;
      if (!member) return res.status(403).json({ error: "You are not a community member" });
    }

    const { data: profile } = await client.from("profiles").select("display_name,avatar_url").eq("id", user.id).maybeSingle();
    const token = new AccessToken(livekitApiKey, livekitApiSecret, {
      identity: user.id,
      name: profile?.display_name || user.email?.split("@")[0] || "Player",
      ttl: "2h",
      metadata: JSON.stringify({ avatarUrl: profile?.avatar_url ?? null }),
    });
    token.addGrant({ roomJoin: true, room, canPublish: true, canSubscribe: true, canPublishData: true });
    res.json({ token: await token.toJwt(), url: livekitUrl });
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500;
    res.status(status).json({ error: error instanceof Error ? error.message : "Media service unavailable" });
  }
});

const dist = path.resolve(__dirname, "../dist");
if (process.env.NODE_ENV === "production") {
  app.use(express.static(dist));
  app.get(/.*/, (_req, res) => res.sendFile(path.join(dist, "index.html")));
}

const port = Number(process.env.PORT || 8787);
app.listen(port, () => console.log(`ConnectPlay server listening on http://localhost:${port}`));
