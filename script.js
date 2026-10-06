document.addEventListener("DOMContentLoaded", () => {

    const loginContainer = document.getElementById("loginContainer");
    const signupContainer = document.getElementById("signupContainer");
    const forgotContainer = document.getElementById("forgotContainer");

    const showSignupBtn = document.getElementById("showSignupBtn");
    const showLoginBtn = document.getElementById("showLoginBtn");
    const forgotPasswordBtn = document.getElementById("forgotPasswordBtn");
    const backToLoginBtn = document.getElementById("backToLoginBtn");

    const termsBtn = document.getElementById("termsBtn");
    const privacyBtn = document.getElementById("privacyBtn");

    const termsModal = document.getElementById("termsModal");
    const privacyModal = document.getElementById("privacyModal");

    const closeTermsBtn = document.getElementById("closeTermsBtn");
    const closePrivacyBtn = document.getElementById("closePrivacyBtn");

    const loginForm = document.getElementById("loginForm");
    const signupForm = document.getElementById("signupForm");
    const forgotForm = document.getElementById("forgotForm");

    const currentYear = document.getElementById("currentYear");

    if (currentYear) {
        currentYear.textContent = new Date().getFullYear();
    }

    function showOnly(container) {
        [loginContainer, signupContainer, forgotContainer].forEach(el => {
            if (!el) return;

            el.hidden = el !== container;
            el.classList.toggle("active", el === container);
        });
    }

    showSignupBtn?.addEventListener("click", () => {
        showOnly(signupContainer);
    });

    showLoginBtn?.addEventListener("click", () => {
        showOnly(loginContainer);
    });

    forgotPasswordBtn?.addEventListener("click", () => {
        showOnly(forgotContainer);
    });

    backToLoginBtn?.addEventListener("click", () => {
        showOnly(loginContainer);
    });

    function setupPasswordToggle(buttonId, inputId) {

        const button = document.getElementById(buttonId);
        const input = document.getElementById(inputId);

        if (!button || !input) return;

        button.addEventListener("click", () => {

            const isPassword = input.type === "password";

            input.type = isPassword ? "text" : "password";

            const icon = button.querySelector("i");

            if (icon) {
                icon.className = isPassword
                    ? "fa-solid fa-eye-slash"
                    : "fa-solid fa-eye";
            }
        });
    }

    setupPasswordToggle(
        "loginPasswordToggle",
        "loginPassword"
    );

    setupPasswordToggle(
        "signupPasswordToggle",
        "signupPassword"
    );

    setupPasswordToggle(
        "signupConfirmPasswordToggle",
        "signupPasswordConfirm"
    );


    // Password strength
    const password = document.getElementById("signupPassword");
    const strengthBar = document.querySelector(".strength-bar span");
    const strengthText = document.querySelector(".strength-text");

    password?.addEventListener("input", () => {

        const value = password.value;

        let score = 0;

        if (value.length >= 6) score++;
        if (value.length >= 10) score++;
        if (/[A-Z]/.test(value)) score++;
        if (/[0-9]/.test(value)) score++;
        if (/[^A-Za-z0-9]/.test(value)) score++;

        const percentage = Math.min(score * 20, 100);

        if (strengthBar) {
            strengthBar.style.width = `${percentage}%`;
        }

        if (strengthText) {

            if (!value) {
                strengthText.textContent = "Password strength";
            } else if (score <= 2) {
                strengthText.textContent = "Weak password";
            } else if (score <= 3) {
                strengthText.textContent = "Medium password";
            } else {
                strengthText.textContent = "Strong password";
            }
        }
    });


    // Modals
    termsBtn?.addEventListener("click", () => {
        termsModal.hidden = false;
    });

    privacyBtn?.addEventListener("click", () => {
        privacyModal.hidden = false;
    });

    closeTermsBtn?.addEventListener("click", () => {
        termsModal.hidden = true;
    });

    closePrivacyBtn?.addEventListener("click", () => {
        privacyModal.hidden = true;
    });

    [termsModal, privacyModal].forEach(modal => {

        modal?.addEventListener("click", event => {

            if (event.target === modal) {
                modal.hidden = true;
            }

        });

    });


    function setLoading(prefix, state) {

        const button = document.getElementById(
            `${prefix}Button`
        );

        const loading = document.getElementById(
            `${prefix}Loading`
        );

        if (button) {
            button.disabled = state;
        }

        if (loading) {
            loading.hidden = !state;
        }
    }


    function showMessage(id, message) {

        const element = document.getElementById(id);

        if (!element) return;

        const span = element.querySelector("span");

        if (span) {
            span.textContent = message;
        }

        element.hidden = false;
    }


    function hideMessage(id) {

        const element = document.getElementById(id);

        if (element) {
            element.hidden = true;
        }
    }


    // LOGIN
    loginForm?.addEventListener("submit", async event => {

        event.preventDefault();

        hideMessage("loginError");

        const email =
            document.getElementById("loginEmail").value.trim();

        const password =
            document.getElementById("loginPassword").value;

        if (!window.supabaseClient) {
            showMessage(
                "loginError",
                "Supabase client topilmadi."
            );
            return;
        }

        setLoading("login", true);

        try {

            const { data, error } =
                await window.supabaseClient.auth.signInWithPassword({
                    email,
                    password
                });

            if (error) {
                throw error;
            }

            if (!data.session) {
                throw new Error("Session yaratilmadi.");
            }

            window.location.href = "dashboard.html";

        } catch (error) {

            showMessage(
                "loginError",
                error.message || "Login amalga oshmadi."
            );

        } finally {

            setLoading("login", false);

        }
    });


    // SIGN UP
    signupForm?.addEventListener("submit", async event => {

        event.preventDefault();

        hideMessage("signupError");
        hideMessage("signupSuccess");

        const name =
            document.getElementById("signupName").value.trim();

        const username =
            document.getElementById("signupUsername").value
                .trim()
                .toLowerCase();

        const email =
            document.getElementById("signupEmail").value.trim();

        const password =
            document.getElementById("signupPassword").value;

        const confirm =
            document.getElementById("signupPasswordConfirm").value;

        if (password !== confirm) {

            showMessage(
                "signupError",
                "Passwords do not match."
            );

            return;
        }

        if (!/^[a-z0-9_]+$/i.test(username)) {

            showMessage(
                "signupError",
                "Username faqat harf, raqam va _ dan iborat bo‘lishi kerak."
            );

            return;
        }

        if (username.length < 5) {

            showMessage(
                "signupError",
                "Oddiy username kamida 5 ta belgidan iborat bo‘lishi kerak."
            );

            return;
        }

        if (!window.supabaseClient) {

            showMessage(
                "signupError",
                "Supabase client topilmadi."
            );

            return;
        }

        setLoading("signup", true);

        try {

            // Unique username check
            const { data: existing } =
                await window.supabaseClient
                    .from("profiles")
                    .select("id")
                    .eq("username", username)
                    .maybeSingle();

            if (existing) {
                throw new Error("Bu username allaqachon mavjud.");
            }

            const { data, error } =
                await window.supabaseClient.auth.signUp({
                    email,
                    password,
                    options: {
                        data: {
                            full_name: name,
                            username: username
                        }
                    }
                });

            if (error) {
                throw error;
            }

            if (data.session) {

                window.location.href = "dashboard.html";

            } else {

                showMessage(
                    "signupSuccess",
                    "Account yaratildi. Emailingizni tasdiqlang."
                );

                signupForm.reset();
            }

        } catch (error) {

            showMessage(
                "signupError",
                error.message || "Account yaratilmadi."
            );

        } finally {

            setLoading("signup", false);

        }
    });


    // FORGOT PASSWORD
    forgotForm?.addEventListener("submit", async event => {

        event.preventDefault();

        hideMessage("forgotError");
        hideMessage("forgotSuccess");

        const email =
            document.getElementById("forgotEmail").value.trim();

        if (!window.supabaseClient) {

            showMessage(
                "forgotError",
                "Supabase client topilmadi."
            );

            return;
        }

        try {

            const { error } =
                await window.supabaseClient.auth
                    .resetPasswordForEmail(email, {
                        redirectTo:
                            `${window.location.origin}/index.html`
                    });

            if (error) {
                throw error;
            }

            showMessage(
                "forgotSuccess",
                "Password reset link emailingizga yuborildi."
            );

        } catch (error) {

            showMessage(
                "forgotError",
                error.message || "Reset amalga oshmadi."
            );

        }
    });


    // Existing session
    async function checkExistingSession() {

        if (!window.supabaseClient) return;

        const {
            data: { session }
        } = await window.supabaseClient.auth.getSession();

        if (session) {
            window.location.href = "dashboard.html";
        }
    }

    checkExistingSession();

});
