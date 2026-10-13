
/*
 * MegChatBox — Supabase Configuration
 */

(() => {
  "use strict";

  const SUPABASE_URL =
    "https://gvabfjcmllglwqgnotxn.supabase.co";

  const SUPABASE_ANON_KEY =
    "sb_publishable_ufIhFVR7n63H2agQXPsa_g_Kr2lwb7l";

  window.megSupabaseReady = false;

  if (
    !window.supabase ||
    typeof window.supabase.createClient !== "function"
  ) {
    console.error(
      "MegChatBox: Supabase library did not load. Check HTML script order."
    );
    return;
  }

  try {
    window.supabaseClient = window.supabase.createClient(
      SUPABASE_URL,
      SUPABASE_ANON_KEY
    );

    window.megSupabaseReady = true;
    console.info("MegChatBox: Supabase initialized successfully.");
  } catch (error) {
    console.error("MegChatBox: Supabase initialization failed:", error);
  }
})();
