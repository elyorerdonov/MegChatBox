/*
  MegChatBox V5 configuration.
  Paste your Supabase project URL and anon/public key below.
  NEVER put a service_role key in browser code.
*/
(() => {
  const SUPABASE_URL = "PASTE_YOUR_SUPABASE_PROJECT_URL_HERE";
  const SUPABASE_ANON_KEY = "PASTE_YOUR_SUPABASE_ANON_KEY_HERE";

  if (!window.supabase) {
    console.error("Supabase JS did not load. Check the CDN connection.");
    window.megSupabaseReady = false;
    return;
  }
  if (SUPABASE_URL.startsWith("PASTE_") || SUPABASE_ANON_KEY.startsWith("PASTE_")) {
    console.warn("MegChatBox: add your Supabase URL and anon key in supabase.js.");
    window.megSupabaseReady = false;
    return;
  }
  window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  window.megSupabaseReady = true;
})();
