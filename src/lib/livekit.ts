import { supabase } from "./supabase";

export async function roomToken(room: string) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Please sign in again.");
  const response = await fetch("/api/livekit/token", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ room }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Media token failed");
  return data as { token: string; url: string };
}

export function dmRoom(conversationId: string) { return `dm-${conversationId}`; }
export function channelRoom(channelId: string) { return `channel-${channelId}`; }
