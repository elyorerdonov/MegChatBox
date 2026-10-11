
/* =====================================================
   MegChatBox — supabase.js
   Supabase connection
===================================================== */

(function initializeMegChatBoxSupabase() {
    "use strict";

    // Prevent duplicate initialization.
    if (window.supabaseClient) {
        return;
    }

    const SUPABASE_URL =
        "https://gvabfjcmllglwqgnotxn.supabase.co";

    const SUPABASE_KEY =
        "sb_publishable_ufIhFVR7n63H2agQXPsa_g_Kr2lwb7l";

    if (
        !window.supabase ||
        typeof window.supabase.createClient !== "function"
    ) {
        console.error(
            "MegChatBox: Supabase library failed to load."
        );
        return;
    }

    window.supabaseClient =
        window.supabase.createClient(
            SUPABASE_URL,
            SUPABASE_KEY
        );

    console.log("MegChatBox: Supabase connected.");
})();
