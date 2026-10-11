
(function () {
    "use strict";

    const client = window.supabaseClient;

    const $ = (selector) => document.querySelector(selector);

    const views = [
        $("#loginView"),
        $("#signupView"),
        $("#forgotView"),
        $("#resetView")
    ];

    function showView(view) {
        views.forEach((item) => item?.classList.add("hidden"));
        view?.classList.remove("hidden");
        clearMessages();
    }

    function clearMessages() {
        [
            "#loginMessage",
            "#signupMessage",
            "#forgotMessage",
            "#resetMessage"
        ].forEach((selector) => setMessage($(selector), ""));
    }

    function setMessage(element, message, type = "error") {
        if (!element) return;

        element.textContent = message || "";
        element.classList.remove("show", "error", "success", "info");

        if (message) element.classList.add("show", type);
    }

    function loading(button, value) {
        if (!button) return;

        button.disabled = value;

        const text = button.querySelector(".button-text");
        const spinner = button.querySelector(".button-loader");

        if (text) text.style.display = value ? "none" : "";
        if (spinner) spinner.style.display = value ? "inline-flex" : "none";
    }

    function showOverlay(message = "Opening MegChatBox...") {
        if ($("#authLoadingText")) {
            $("#authLoadingText").textContent = message;
        }

        $("#authLoadingOverlay")?.classList.remove("hidden");
    }

    function hideOverlay() {
        $("#authLoadingOverlay")?.classList.add("hidden");
    }

    function usernameOf(value) {
        return String(value || "")
            .trim()
            .toLowerCase()
            .replace(/^@+/, "");
    }

    function validUsername(value) {
        return /^[a-z0-9_]{5,32}$/.test(value);
    }

    function validEmail(value) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
            String(value || "").trim()
        );
    }

    function errorText(error) {
        const message = String(error?.message || "Noma'lum xatolik.");
        const lower = message.toLowerCase();

        if (lower.includes("invalid login credentials")) {
            return "Email yoki password noto‘g‘ri.";
        }

        if (lower.includes("email not confirmed")) {
            return "Emailingizni avval tasdiqlang.";
        }

        if (lower.includes("user already registered")) {
            return "Bu email bilan account allaqachon mavjud.";
        }

        if (
            lower.includes("row-level security") ||
            lower.includes("permission denied")
        ) {
            return "Supabase ruxsat xatosi. SQL policylarni tekshirish kerak.";
        }

        if (
            lower.includes("duplicate key") ||
            lower.includes("unique constraint")
        ) {
            return "Bu username band. Boshqa username tanlang.";
        }

        return message;
    }

    function redirectDashboard() {
        showOverlay();

        window.location.replace(
            new URL("./dashboard.html", window.location.href).href
        );
    }

    async function getProfile(userId) {
        const { data, error } = await client
            .from("profiles")
            .select("*")
            .eq("id", userId)
            .maybeSingle();

        if (error) throw error;

        return data;
    }

    async function ensureProfile(user, supplied = {}) {
        let profile = await getProfile(user.id);

        if (profile) return profile;

        const meta = user.user_metadata || {};
        const username = usernameOf(
            supplied.username || meta.username
        );
        const fullName = String(
            supplied.full_name ||
            meta.full_name ||
            meta.name ||
            ""
        ).trim();

        if (!validUsername(username) || fullName.length < 2) {
            throw new Error(
                "Profil ma'lumotlari topilmadi. Username va full name tekshirilishi kerak."
            );
        }

        const { data, error } = await client
            .from("profiles")
            .insert({
                id: user.id,
                username,
                full_name: fullName,
                bio: "",
                role: "user",
                is_verified: false,
                show_online: true,
                show_last_seen: true
            })
            .select()
            .single();

        if (error) {
            // Another process or database trigger may already have
            // created this user's profile.
            profile = await getProfile(user.id).catch(() => null);
            if (profile) return profile;
            throw error;
        }

        return data;
    }

    function accountBlocked(profile) {
        if (!profile?.account_blocked) return false;

        if (!profile.account_blocked_until) return true;

        const expiry = new Date(
            profile.account_blocked_until
        ).getTime();

        return !Number.isNaN(expiry) && expiry > Date.now();
    }

    async function openAuthenticatedDashboard(user) {
        const profile = await ensureProfile(user);

        if (accountBlocked(profile)) {
            await client.auth.signOut();
            throw new Error("Bu account bloklangan.");
        }

        // Updating last_seen is optional; an RLS issue here must
        // not prevent an otherwise valid login.
        await client
            .from("profiles")
            .update({ last_seen: new Date().toISOString() })
            .eq("id", user.id)
            .then(({ error }) => {
                if (error) console.warn("last_seen:", error.message);
            });

        redirectDashboard();
    }

    if (!client || !client.auth) {
        hideOverlay();
        setMessage(
            $("#loginMessage"),
            "Supabase ulanmagan. supabase.js yuklanishini tekshiring."
        );
        console.error("MegChatBox: Supabase client unavailable.");
        return;
    }

    // Password show/hide
    document.querySelectorAll(".password-toggle").forEach((button) => {
        button.addEventListener("click", () => {
            const input = document.getElementById(button.dataset.target);
            if (!input) return;

            const show = input.type === "password";
            input.type = show ? "text" : "password";

            const icon = button.querySelector("i");
            if (icon) {
                icon.classList.toggle("fa-eye", !show);
                icon.classList.toggle("fa-eye-slash", show);
            }
        });
    });

    // Switch authentication views
    $("#showSignupButton")?.addEventListener("click", () => {
        showView($("#signupView"));
    });

    $("#showLoginButton")?.addEventListener("click", () => {
        showView($("#loginView"));
    });

    $("#forgotPasswordButton")?.addEventListener("click", () => {
        const email = $("#loginEmail")?.value.trim() || "";
        if (email && $("#forgotEmail")) $("#forgotEmail").value = email;
        showView($("#forgotView"));
    });

    $("#backToLoginButton")?.addEventListener("click", () => {
        showView($("#loginView"));
    });

    // Terms modal
    function closeTerms() {
        $("#termsModal")?.classList.add("hidden");
        $("#termsModal")?.setAttribute("aria-hidden", "true");
        document.body.classList.remove("modal-open");
    }

    $("#termsButton")?.addEventListener("click", () => {
        $("#termsModal")?.classList.remove("hidden");
        $("#termsModal")?.setAttribute("aria-hidden", "false");
        document.body.classList.add("modal-open");
    });

    $("#termsBackdrop")?.addEventListener("click", closeTerms);
    $("#closeTermsButton")?.addEventListener("click", closeTerms);

    $("#acceptTermsButton")?.addEventListener("click", () => {
        if ($("#acceptTerms")) $("#acceptTerms").checked = true;
        closeTerms();
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") closeTerms();
    });

    // Username field cleanup
    $("#signupUsername")?.addEventListener("input", (event) => {
        event.target.value = event.target.value
            .toLowerCase()
            .replace(/^@+/, "")
            .replace(/[^a-z0-9_]/g, "")
            .slice(0, 32);
    });

    // Login
    $("#loginForm")?.addEventListener("submit", async (event) => {
        event.preventDefault();
        clearMessages();

        const button = $("#loginButton");
        const email = $("#loginEmail")?.value.trim() || "";
        const password = $("#loginPassword")?.value || "";

        if (!validEmail(email)) {
            setMessage($("#loginMessage"), "To‘g‘ri email kiriting.");
            return;
        }

        if (!password) {
            setMessage($("#loginMessage"), "Password kiriting.");
            return;
        }

        loading(button, true);

        try {
            const { data, error } = await client.auth.signInWithPassword({
                email,
                password
            });

            if (error) throw error;
            if (!data.user) throw new Error("User sessiyasi topilmadi.");

            try {
                localStorage.setItem(
                    "megchatbox_remember",
                    $("#rememberMe")?.checked ? "true" : "false"
                );
            } catch (_) {}

            await openAuthenticatedDashboard(data.user);
        } catch (error) {
            hideOverlay();
            console.error("Login error:", error);
            setMessage($("#loginMessage"), errorText(error));
        } finally {
            loading(button, false);
        }
    });

    // Signup
    $("#signupForm")?.addEventListener("submit", async (event) => {
        event.preventDefault();
        clearMessages();

        const fullName = $("#signupName")?.value.trim() || "";
        const username = usernameOf($("#signupUsername")?.value);
        const email = $("#signupEmail")?.value.trim().toLowerCase() || "";
        const password = $("#signupPassword")?.value || "";
        const confirm = $("#signupConfirmPassword")?.value || "";

        if (fullName.length < 2 || fullName.length > 60) {
            setMessage($("#signupMessage"), "Full name 2–60 belgi bo‘lsin.");
            return;
        }

        if (!validUsername(username)) {
            setMessage(
                $("#signupMessage"),
                "Username 5–32 belgi bo‘lsin: faqat a-z, 0-9 va _."
            );
            return;
        }

        if (!validEmail(email)) {
            setMessage($("#signupMessage"), "To‘g‘ri email kiriting.");
            return;
        }

        if (password.length < 6) {
            setMessage(
                $("#signupMessage"),
                "Password kamida 6 ta belgi bo‘lsin."
            );
            return;
        }

        if (password !== confirm) {
            setMessage($("#signupMessage"), "Passwordlar mos emas.");
            return;
        }

        if (!$("#acceptTerms")?.checked) {
            setMessage(
                $("#signupMessage"),
                "Avval MegChatBox qoidalarini qabul qiling."
            );
            return;
        }

        loading($("#signupButton"), true);

        try {
            const { data: existing, error: lookupError } = await client
                .from("profiles")
                .select("id")
                .eq("username", username)
                .maybeSingle();

            if (lookupError) throw lookupError;

            if (existing) throw new Error("Bu username allaqachon band.");

            const { data, error } = await client.auth.signUp({
                email,
                password,
                options: {
                    emailRedirectTo: window.location.href.split("#")[0],
                    data: {
                        username,
                        full_name: fullName
                    }
                }
            });

            if (error) throw error;
            if (!data.user) throw new Error("Account yaratilmadi.");

            if (data.session) {
                await ensureProfile(data.user, {
                    username,
                    full_name: fullName
                });
                redirectDashboard();
            } else {
                setMessage(
                    $("#signupMessage"),
                    "Account yaratildi. Emailingizni tasdiqlang, keyin login qiling.",
                    "success"
                );
            }
        } catch (error) {
            console.error("Signup error:", error);
            setMessage($("#signupMessage"), errorText(error));
        } finally {
            loading($("#signupButton"), false);
        }
    });

    // Forgot password
    $("#forgotForm")?.addEventListener("submit", async (event) => {
        event.preventDefault();
        clearMessages();

        const email = $("#forgotEmail")?.value.trim() || "";

        if (!validEmail(email)) {
            setMessage($("#forgotMessage"), "To‘g‘ri email kiriting.");
            return;
        }

        loading($("#forgotButton"), true);

        try {
            const redirectTo = window.location.href.split("#")[0];

            const { error } = await client.auth.resetPasswordForEmail(
                email,
                { redirectTo }
            );

            if (error) throw error;

            setMessage(
                $("#forgotMessage"),
                "Agar email account bilan bog‘langan bo‘lsa, reset link yuborildi.",
                "success"
            );
        } catch (error) {
            setMessage($("#forgotMessage"), errorText(error));
        } finally {
            loading($("#forgotButton"), false);
        }
    });

    // Change password
    $("#resetForm")?.addEventListener("submit", async (event) => {
        event.preventDefault();
        clearMessages();

        const password = $("#newPassword")?.value || "";
        const confirm = $("#confirmNewPassword")?.value || "";

        if (password.length < 6) {
            setMessage($("#resetMessage"), "Password kamida 6 ta belgi bo‘lsin.");
            return;
        }

        if (password !== confirm) {
            setMessage($("#resetMessage"), "Passwordlar mos emas.");
            return;
        }

        loading($("#resetButton"), true);

        try {
            const { error } = await client.auth.updateUser({ password });
            if (error) throw error;

            setMessage(
                $("#resetMessage"),
                "Password o‘zgartirildi. Endi qayta login qiling.",
                "success"
            );

            setTimeout(async () => {
                await client.auth.signOut().catch(() => {});
                window.history.replaceState(
                    {},
                    document.title,
                    window.location.pathname
                );
                showView($("#loginView"));
            }, 1200);
        } catch (error) {
            setMessage($("#resetMessage"), errorText(error));
        } finally {
            loading($("#resetButton"), false);
        }
    });

    // Initial startup
    async function start() {
        if ($("#currentYear")) {
            $("#currentYear").textContent = new Date().getFullYear();
        }

        try {
            $("#rememberMe").checked =
                localStorage.getItem("megchatbox_remember") === "true";
        } catch (_) {}

        if (
            window.location.hash.includes("type=recovery") ||
            window.location.search.includes("type=recovery")
        ) {
            hideOverlay();
            showView($("#resetView"));
            return;
        }

        try {
            const { data, error } = await client.auth.getSession();
            if (error) throw error;

            if (data.session?.user) {
                await openAuthenticatedDashboard(data.session.user);
                return;
            }
        } catch (error) {
            console.error("Session check error:", error);
        }

        hideOverlay();
        showView($("#loginView"));
    }

    start();
})();
