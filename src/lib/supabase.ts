import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

const missingCredentials = !url || !key;
if (missingCredentials) {
  console.error("❌ Missing Supabase credentials!");
  console.error("Required environment variables:");
  if (!url) console.error("  - VITE_SUPABASE_URL");
  if (!key) console.error("  - VITE_SUPABASE_PUBLISHABLE_KEY");
  console.error("Please add these to your .env file");
}

const fetchWithTimeout: typeof fetch = async (input, init = {}) => {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 15000);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timeout);
  }
};

export const supabase = createClient(url || "https://invalid.local", key || "invalid", {
  global: { fetch: fetchWithTimeout },
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

export const hasSupabaseCredentials = !missingCredentials;
