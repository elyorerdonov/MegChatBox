
/*
 * MegChatBox — Supabase Configuration
 * V8 — Project configuration and client initialization
 */

(() => {
  "use strict";

  const SUPABASE_URL =
    "https://gvabfjcmllglwqgnotxn.supabase.co";

  // Supabase Dashboard'dagi Publishable key'ni shu yerga qo'ying.
  const SUPABASE_PUBLISHABLE_KEY =
    "sb_publishable_ufIhFVR7n63H2agQXPsa_g_Kr2lwb7l";

  // Reset readiness state before checking configuration.
  window.megSupabaseReady = false;

  // Check whether the Supabase JS library loaded.
  if (
    !window.supabase ||
    typeof window.supabase.createClient !== "function"
  ) {
    console.error(
      "MegChatBox: Supabase JS library not loaded. Check script order in HTML."
    );
    return;
  }

  // Validate the project URL and public key.
  if (
    !SUPABASE_URL.startsWith("https://") ||
    !SUPABASE_PUBLISHABLE_KEY.startsWith("sb_publishable_")
  ) {
    console.error(
      "MegChatBox: Add the correct Supabase project URL and publishable key."
    );
    return;
  }

  try {
    // Create the client once.
    window.supabaseClient = window.supabase.createClient(
      SUPABASE_URL,
      SUPABASE_PUBLISHABLE_KEY
    );

    window.megSupabaseReady = true;

    console.info("MegChatBox: Supabase client initialized successfully.");
  } catch (error) {
    window.megSupabaseReady = false;
    console.error("MegChatBox: Supabase initialization failed:", error);
  }
})();
