import { supabase } from "./supabase";

const livekitUrl = import.meta.env.VITE_LIVEKIT_URL as string | undefined;
const missingLiveKitCredentials = !livekitUrl;

if (missingLiveKitCredentials) {
  console.error("❌ Missing LiveKit credentials!");
  console.error("Required environment variables:");
  console.error("  - VITE_LIVEKIT_URL (WebSocket URL like wss://your-project.livekit.cloud)");
  console.error("Please add this to your .env file");
}

export async function roomToken(room: string) {
  if (missingLiveKitCredentials) {
    throw new Error("LiveKit is not configured. Media features are unavailable. Please configure VITE_LIVEKIT_URL in your .env file.");
  }
  
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
export function hasLiveKitCredentials() { return !missingLiveKitCredentials; }
