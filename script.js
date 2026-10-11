(() => {
  const client = () => window.supabaseClient;
  const $ = (id) => document.getElementById(id);
  const status = $("authStatus");

  function showStatus(message, error = false) {
    if (!status) return;
    status.textContent = message || "";
    status.classList.toggle("error", error);
    status.classList.toggle("success", !error && !!message);
  }

  function switchForm(which) {
    $("loginForm").classList.toggle("hidden", which !== "login");
    $("signupForm").classList.toggle("hidden", which !== "signup");
    $("showLogin").classList.toggle("active", which === "login");
    $("showSignup").classList.toggle("active", which === "signup");
    showStatus("");
  }

  $("showLogin")?.addEventListener("click", () => switchForm("login"));
  $("showSignup")?.addEventListener("click", () => switchForm("signup"));

  async function ensureProfile(user, fullName, username) {
    const db = client();
    const { data: existing, error: readError } = await db
      .from("profiles").select("id").eq("id", user.id).maybeSingle();
    if (readError) throw readError;
    if (existing) return;

    const { error } = await db.from("profiles").insert({
      id: user.id,
      full_name: fullName,
      username: username.toLowerCase(),
      bio: "",
      role: "user",
      is_verified: false,
      show_online: true,
      show_last_seen: true
    });
    if (error) throw error;
  }

  $("loginForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!window.megSupabaseReady) return showStatus("Set your Supabase URL and anon key in supabase.js first.", true);
    const db = client();
    const email = $("loginEmail").value.trim();
    const password = $("loginPassword").value;
    const button = $("loginForm").querySelector('button[type="submit"]');
    button.disabled = true;
    showStatus("Signing in…");
    const { error } = await db.auth.signInWithPassword({ email, password });
    button.disabled = false;
    if (error) return showStatus(error.message, true);
    location.href = "dashboard.html";
  });

  $("signupForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!window.megSupabaseReady) return showStatus("Set your Supabase URL and anon key in supabase.js first.", true);
    const db = client();
    const fullName = $("signupName").value.trim();
    const username = $("signupUsername").value.trim().toLowerCase();
    const email = $("signupEmail").value.trim();
    const password = $("signupPassword").value;
    if (username.length < 5) return showStatus("Username must be at least 5 characters.", true);
    if (!/^[a-z0-9_]+$/.test(username)) return showStatus("Username may contain letters, numbers, and underscores only.", true);

    const button = $("signupForm").querySelector('button[type="submit"]');
    button.disabled = true;
    showStatus("Creating account…");
    const { data, error } = await db.auth.signUp({ email, password });
    if (error) {
      button.disabled = false;
      return showStatus(error.message, true);
    }
    if (data.user && data.session) {
      try {
        await ensureProfile(data.user, fullName, username);
        location.href = "dashboard.html";
      } catch (e) {
        showStatus("Account created, but profile setup failed: " + e.message + ". Run schema.sql and try logging in.", true);
      }
    } else {
      showStatus("Check your email to confirm the account, then log in. If email confirmation is disabled, try logging in now.");
    }
    button.disabled = false;
  });

  async function redirectIfSignedIn() {
    if (!window.megSupabaseReady) return;
    const { data } = await client().auth.getSession();
    if (data.session) location.href = "dashboard.html";
  }
  redirectIfSignedIn();
})();
