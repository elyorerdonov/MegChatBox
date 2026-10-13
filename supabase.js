
/*
 * MegChatBox — Supabase Configuration
 * V6: Safe client initialization
 *
 * IMPORTANT:
 * 1. Use your Supabase Project URL.
 * 2. Use your sb_publishable_ key.
 * 3. NEVER put service_role or sb_secret keys in frontend code.
 */

(() => {
  "use strict";

  const SUPABASE_URL =
    "https://gvabfjcmllglwqgnotxn.supabase.co";

  const SUPABASE_ANON_KEY =
    "BU_YERGA_TOLIQ_sb_publishable_KALITINGIZNI_QOYING";

  // Prevent initialization twice
  if (window.supabaseClient) {
    console.info("MegChatBox: Supabase client already initialized.");
    window.megSupabaseReady = true;
    return;
  }

  // Check that Supabase JS loaded
  if (!window.supabase || typeof window.supabase.createClient !== "function") {
    console.error(
      "MegChatBox: Supabase JS failed to load. Check the CDN script."
    );
    window.megSupabaseReady = false;
    return;
  }

  // Check configuration
  if (
    !SUPABASE_URL.startsWith("https://") ||
    SUPABASE_ANON_KEY.startsWith("BU_YERGA_") ||
    !SUPABASE_ANON_KEY.startsWith("sb_publishable_")
  ) {
    console.error(
      "MegChatBox: Supabase URL or publishable key is missing or invalid."
    );
    window.megSupabaseReady = false;
    return;
  }

  try {
    window.supabaseClient = window.supabase.createClient(
      SUPABASE_URL,
      SUPABASE_ANON_KEY
    );

    window.megSupabaseReady = true;

    console.info("MegChatBox: Supabase connected successfully. 🦅");
  } catch (error) {
    window.megSupabaseReady = false;

    console.error(
      "MegChatBox: Supabase initialization failed:",
      error.message
    );
  }
})();
