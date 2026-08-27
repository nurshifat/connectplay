import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
if (!url || !key) console.warn("Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY");
export const supabase = createClient(url || "https://invalid.local", key || "invalid", {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
