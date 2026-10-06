/* =========================================================
   MegChatBox - script.js
   Authentication / Signup / Login / Password Reset
========================================================= */

"use strict";


/* =========================================================
   GLOBAL
========================================================= */

const supabase = window.supabaseClient;


/* =========================================================
   DOM HELPERS
========================================================= */

function $(selector) {
    return document.querySelector(selector);
}

function $$(selector) {
    return [...document.querySelectorAll(selector)];
}


/* =========================================================
   ELEMENTS
========================================================= */

const loginView = $("#loginView");
const signupView = $("#signupView");
const forgotView = $("#forgotView");
const resetView = $("#resetView");

const loginForm = $("#loginForm");
const signupForm = $("#signupForm");
const forgotForm = $("#forgotForm");
const resetForm = $("#resetForm");

const loginButton = $("#loginButton");
const signupButton = $("#signupButton");
const forgotButton = $("#forgotButton");
const resetButton = $("#resetButton");

const loginMessage = $("#loginMessage");
const signupMessage = $("#signupMessage");
const forgotMessage = $("#forgotMessage");
const resetMessage = $("#resetMessage");

const showSignupButton = $("#showSignupButton");
const showLoginButton = $("#showLoginButton");
const forgotPasswordButton = $("#forgotPasswordButton");
const backToLoginButton = $("#backToLoginButton");

const termsButton = $("#termsButton");
const termsModal = $("#termsModal");
const termsBackdrop = $("#termsBackdrop");
const closeTermsButton = $("#closeTermsButton");
const acceptTermsButton = $("#acceptTermsButton");

const authLoadingOverlay = $("#authLoadingOverlay");
const authLoadingText = $("#authLoadingText");

const currentYear = $("#currentYear");


/* =========================================================
   CURRENT YEAR
========================================================= */

if (currentYear) {
    currentYear.textContent = new Date().getFullYear();
}


/* =========================================================
   SAFETY CHECK
========================================================= */

if (!supabase) {
    console.error("MegChatBox: Supabase client not found.");

    showFatalError(
        "Supabase connection could not be initialized. Check supabase.js."
    );
}


/* =========================================================
   BASIC UTILITIES
========================================================= */

function normalizeUsername(username) {
    return String(username || "")
        .trim()
        .toLowerCase()
        .replace(/^@+/, "");
}


function isValidUsername(username) {
    return /^[a-z0-9_]{5,32}$/.test(username);
}


function isValidFullName(name) {
    const value = String(name || "").trim();

    return value.length >= 2 && value.length <= 60;
}


function isValidEmail(email) {
    const value = String(email || "").trim();

    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}


function getErrorMessage(error) {
    if (!error) {
        return "Something went wrong.";
    }

    const message = String(
        error.message ||
        error.error_description ||
        error.msg ||
        "Something went wrong."
    );

    const lower = message.toLowerCase();

    if (lower.includes("invalid login credentials")) {
        return "Email yoki password noto‘g‘ri.";
    }

    if (lower.includes("email not confirmed")) {
        return "Avval email manzilingizni tasdiqlang.";
    }

    if (lower.includes("user already registered")) {
        return "Bu email bilan account allaqachon mavjud.";
    }

    if (lower.includes("password should be at least")) {
        return "Password kamida 6 ta belgidan iborat bo‘lishi kerak.";
    }

    if (lower.includes("duplicate key") && lower.includes("username")) {
        return "Bu username allaqachon band.";
    }

    if (lower.includes("unique") && lower.includes("username")) {
        return "Bu username allaqachon band.";
    }

    if (lower.includes("row-level security")) {
        return "Profile yaratish uchun Supabase RLS policy kerak.";
    }

    return message;
}


/* =========================================================
   MESSAGE UI
========================================================= */

function setMessage(element, message, type = "error") {
    if (!element) return;

    element.textContent = message || "";

    element.classList.remove(
        "success",
        "error",
        "info",
        "show"
    );

    if (!message) {
        return;
    }

    element.classList.add(type, "show");
}


function clearMessages() {
    [
        loginMessage,
        signupMessage,
        forgotMessage,
        resetMessage
    ].forEach((element) => {
        setMessage(element, "");
    });
}


/* =========================================================
   LOADING BUTTON
========================================================= */

function setButtonLoading(button, loading) {
    if (!button) return;

    button.disabled = loading;

    button.classList.toggle("loading", loading);

    const text = button.querySelector(".button-text");
    const loader = button.querySelector(".button-loader");

    if (text) {
        text.style.display = loading ? "none" : "";
    }

    if (loader) {
        loader.style.display = loading ? "inline-flex" : "none";
    }
}


/* =========================================================
   AUTH OVERLAY
========================================================= */

function showAuthLoading(text = "Loading MegChatBox...") {
    if (!authLoadingOverlay) return;

    if (authLoadingText) {
        authLoadingText.textContent = text;
    }

    authLoadingOverlay.classList.remove("hidden");
    authLoadingOverlay.setAttribute("aria-hidden", "false");
}


function hideAuthLoading() {
    if (!authLoadingOverlay) return;

    authLoadingOverlay.classList.add("hidden");
    authLoadingOverlay.setAttribute("aria-hidden", "true");
}


/* =========================================================
   FATAL ERROR
========================================================= */

function showFatalError(message) {
    console.error(message);

    document.body.setAttribute(
        "data-megchatbox-error",
        message
    );
}


/* =========================================================
   AUTH VIEW SWITCHING
========================================================= */

function hideAllAuthViews() {
    [
        loginView,
        signupView,
        forgotView,
        resetView
    ].forEach((view) => {
        if (!view) return;

        view.classList.add("hidden");
    });
}


function showAuthView(view) {
    hideAllAuthViews();

    if (!view) return;

    view.classList.remove("hidden");

    clearMessages();
}


function showLogin() {
    showAuthView(loginView);

    const input = $("#loginEmail");

    if (input) {
        setTimeout(() => input.focus(), 100);
    }
}


function showSignup() {
    showAuthView(signupView);

    const input = $("#signupName");

    if (input) {
        setTimeout(() => input.focus(), 100);
    }
}


function showForgot() {
    showAuthView(forgotView);

    const sourceEmail = $("#loginEmail");
    const forgotEmail = $("#forgotEmail");

    if (
        sourceEmail &&
        forgotEmail &&
        sourceEmail.value.trim()
    ) {
        forgotEmail.value = sourceEmail.value.trim();
    }

    if (forgotEmail) {
        setTimeout(() => forgotEmail.focus(), 100);
    }
}


function showReset() {
    showAuthView(resetView);

    const input = $("#newPassword");

    if (input) {
        setTimeout(() => input.focus(), 100);
    }
}


/* =========================================================
   PASSWORD TOGGLE
========================================================= */

$$(".password-toggle").forEach((button) => {

    button.addEventListener("click", () => {

        const targetId = button.dataset.target;
        const input = document.getElementById(targetId);

        if (!input) return;

        const icon = button.querySelector("i");

        if (input.type === "password") {

            input.type = "text";

            button.setAttribute(
                "aria-label",
                "Hide password"
            );

            button.setAttribute(
                "title",
                "Hide password"
            );

            if (icon) {
                icon.classList.remove("fa-eye");
                icon.classList.add("fa-eye-slash");
            }

        } else {

            input.type = "password";

            button.setAttribute(
                "aria-label",
                "Show password"
            );

            button.setAttribute(
                "title",
                "Show password"
            );

            if (icon) {
                icon.classList.remove("fa-eye-slash");
                icon.classList.add("fa-eye");
            }

        }

    });

});


/* =========================================================
   TERMS MODAL
========================================================= */

function openTerms() {
    if (!termsModal) return;

    termsModal.classList.remove("hidden");
    termsModal.setAttribute("aria-hidden", "false");

    document.body.classList.add("modal-open");
}


function closeTerms() {
    if (!termsModal) return;

    termsModal.classList.add("hidden");
    termsModal.setAttribute("aria-hidden", "true");

    document.body.classList.remove("modal-open");
}


termsButton?.addEventListener("click", openTerms);
termsBackdrop?.addEventListener("click", closeTerms);
closeTermsButton?.addEventListener("click", closeTerms);

acceptTermsButton?.addEventListener("click", () => {

    const checkbox = $("#acceptTerms");

    if (checkbox) {
        checkbox.checked = true;
    }

    closeTerms();

});


document.addEventListener("keydown", (event) => {

    if (event.key === "Escape") {
        closeTerms();
    }

});


/* =========================================================
   NAVIGATION BUTTONS
========================================================= */

showSignupButton?.addEventListener("click", showSignup);
showLoginButton?.addEventListener("click", showLogin);
forgotPasswordButton?.addEventListener("click", showForgot);
backToLoginButton?.addEventListener("click", showLogin);


/* =========================================================
   PROFILE HELPERS
========================================================= */

async function getProfileByUserId(userId) {

    if (!supabase || !userId) {
        return {
            profile: null,
            error: new Error("Missing Supabase client or user ID.")
        };
    }

    const result = await supabase
        .from("profiles")
        .select(`
            id,
            username,
            full_name,
            bio,
            avatar_url,
            role,
            is_verified,
            verified_until,
            verified_given_at,
            verified_given_by,
            last_seen,
            account_blocked,
            account_blocked_until,
            messaging_blocked,
            messaging_blocked_until,
            show_online,
            show_last_seen,
            created_at
        `)
        .eq("id", userId)
        .maybeSingle();

    return {
        profile: result.data || null,
        error: result.error || null
    };
}


async function usernameExists(username) {

    const normalized = normalizeUsername(username);

    const { data, error } = await supabase
        .from("profiles")
        .select("id")
        .eq("username", normalized)
        .maybeSingle();

    if (error) {
        throw error;
    }

    return Boolean(data);
}


/* =========================================================
   CREATE PROFILE
========================================================= */

async function createProfile(user, {
    username,
    fullName
}) {

    const profilePayload = {
        id: user.id,
        username: normalizeUsername(username),
        full_name: String(fullName).trim(),
        bio: "",
        role: "user",
        is_verified: false,
        show_online: true,
        show_last_seen: true
    };

    const { data, error } = await supabase
        .from("profiles")
        .insert(profilePayload)
        .select()
        .single();

    if (error) {
        throw error;
    }

    return data;
}


/* =========================================================
   FIND / ENSURE PROFILE
========================================================= */

async function ensureProfile(user) {

    if (!user) {
        throw new Error("User session not found.");
    }

    const existing = await getProfileByUserId(user.id);

    if (existing.error) {
        throw existing.error;
    }

    if (existing.profile) {
        return existing.profile;
    }

    const metadata = user.user_metadata || {};

    const metadataUsername = normalizeUsername(
        metadata.username
    );

    const metadataFullName =
        String(
            metadata.full_name ||
            metadata.name ||
            ""
        ).trim();

    if (!metadataUsername || !metadataFullName) {
        throw new Error(
            "Profile ma'lumotlari topilmadi."
        );
    }

    return await createProfile(user, {
        username: metadataUsername,
        fullName: metadataFullName
    });
}


/* =========================================================
   ACCOUNT BLOCK CHECK
========================================================= */

function isDateStillActive(dateValue) {

    if (!dateValue) {
        return false;
    }

    const time = new Date(dateValue).getTime();

    if (Number.isNaN(time)) {
        return false;
    }

    return time > Date.now();
}


function isProfileAccountBlocked(profile) {

    if (!profile) {
        return false;
    }

    if (!profile.account_blocked) {
        return false;
    }

    if (!profile.account_blocked_until) {
        return true;
    }

    return isDateStillActive(
        profile.account_blocked_until
    );
}


/* =========================================================
   SAVE / UPDATE LAST SEEN
========================================================= */

async function updateLastSeen(userId) {

    if (!userId || !supabase) {
        return;
    }

    try {

        await supabase
            .from("profiles")
            .update({
                last_seen: new Date().toISOString()
            })
            .eq("id", userId);

    } catch (error) {
        console.warn(
            "Could not update last_seen:",
            error
        );
    }

}


/* =========================================================
   REDIRECT
========================================================= */

function redirectToDashboard() {

    showAuthLoading(
        "Opening your MegChatBox dashboard..."
    );

    window.location.replace("dashboard.html");
}


/* =========================================================
   LOGIN
========================================================= */

async function handleLogin(event) {

    event.preventDefault();

    clearMessages();

    if (!supabase) {
        setMessage(
            loginMessage,
            "Supabase ulanishi topilmadi."
        );

        return;
    }

    const emailInput = $("#loginEmail");
    const passwordInput = $("#loginPassword");
    const rememberInput = $("#rememberMe");

    const email = emailInput?.value.trim() || "";
    const password = passwordInput?.value || "";

    if (!isValidEmail(email)) {

        setMessage(
            loginMessage,
            "To‘g‘ri email kiriting."
        );

        emailInput?.focus();

        return;
    }

    if (!password) {

        setMessage(
            loginMessage,
            "Password kiriting."
        );

        passwordInput?.focus();

        return;
    }

    setButtonLoading(loginButton, true);

    try {

        const { data, error } =
            await supabase.auth.signInWithPassword({
                email,
                password
            });

        if (error) {
            throw error;
        }

        const user = data?.user;

        if (!user) {
            throw new Error(
                "Login bajarildi, lekin user session topilmadi."
            );
        }


        /* -----------------------------------------
           CHECK PROFILE
        ----------------------------------------- */

        let profile = null;

        try {

            const profileResult =
                await getProfileByUserId(user.id);

            if (profileResult.error) {
                throw profileResult.error;
            }

            profile = profileResult.profile;

        } catch (profileError) {

            console.error(profileError);

            await supabase.auth.signOut();

            throw new Error(
                "Profile ma'lumotlarini olishda xatolik yuz berdi."
            );
        }


        /* -----------------------------------------
           BLOCK CHECK
        ----------------------------------------- */

        if (isProfileAccountBlocked(profile)) {

            await supabase.auth.signOut();

            throw new Error(
                "Bu account hozir bloklangan."
            );
        }


        /* -----------------------------------------
           LAST SEEN
        ----------------------------------------- */

        await updateLastSeen(user.id);


        /* -----------------------------------------
           REMEMBER ME
        ----------------------------------------- */

        try {

            localStorage.setItem(
                "megchatbox_remember",
                rememberInput?.checked ? "true" : "false"
            );

        } catch (storageError) {
            console.warn(
                "Remember preference could not be saved.",
                storageError
            );
        }


        setMessage(
            loginMessage,
            "Login muvaffaqiyatli. Dashboard ochilmoqda...",
            "success"
        );

        setTimeout(() => {
            redirectToDashboard();
        }, 250);

    } catch (error) {

        console.error(
            "MegChatBox login error:",
            error
        );

        setMessage(
            loginMessage,
            getErrorMessage(error),
            "error"
        );

    } finally {

        setButtonLoading(
            loginButton,
            false
        );

    }

}


/* =========================================================
   SIGN UP VALIDATION
========================================================= */

function validateSignupData() {

    const nameInput = $("#signupName");
    const usernameInput = $("#signupUsername");
    const emailInput = $("#signupEmail");
    const passwordInput = $("#signupPassword");
    const confirmInput = $("#signupConfirmPassword");
    const termsInput = $("#acceptTerms");

    const fullName = nameInput?.value.trim() || "";
    const username = normalizeUsername(
        usernameInput?.value || ""
    );
    const email = emailInput?.value.trim() || "";
    const password = passwordInput?.value || "";
    const confirmPassword = confirmInput?.value || "";
    const acceptedTerms = Boolean(
        termsInput?.checked
    );

    if (!isValidFullName(fullName)) {

        throw new Error(
            "Full name 2–60 ta belgidan iborat bo‘lishi kerak."
        );
    }

    if (!isValidUsername(username)) {

        throw new Error(
            "Username 5–32 ta belgidan iborat bo‘lishi va faqat a-z, 0-9, _ ishlatishi kerak."
        );
    }

    if (!isValidEmail(email)) {

        throw new Error(
            "To‘g‘ri email kiriting."
        );
    }

    if (password.length < 6) {

        throw new Error(
            "Password kamida 6 ta belgidan iborat bo‘lishi kerak."
        );
    }

    if (password !== confirmPassword) {

        throw new Error(
            "Passwordlar bir xil emas."
        );
    }

    if (!acceptedTerms) {

        throw new Error(
            "Avval MegChatBox qoidalarini qabul qiling."
        );
    }

    return {
        fullName,
        username,
        email,
        password
    };
}


/* =========================================================
   SIGN UP
========================================================= */

async function handleSignup(event) {

    event.preventDefault();

    clearMessages();

    if (!supabase) {

        setMessage(
            signupMessage,
            "Supabase ulanishi topilmadi."
        );

        return;
    }


    /* -----------------------------------------
       VALIDATE
    ----------------------------------------- */

    let formData;

    try {

        formData = validateSignupData();

    } catch (error) {

        setMessage(
            signupMessage,
            getErrorMessage(error)
        );

        return;
    }


    setButtonLoading(
        signupButton,
        true
    );


    try {

        /* -----------------------------------------
           CHECK USERNAME
        ----------------------------------------- */

        let taken = false;

        try {

            taken = await usernameExists(
                formData.username
            );

        } catch (usernameError) {

            console.error(
                "Username check error:",
                usernameError
            );

            throw new Error(
                "Username mavjudligini tekshirib bo‘lmadi. Supabase RLS/policy ni tekshirish kerak."
            );
        }

        if (taken) {

            throw new Error(
                `@${formData.username} username allaqachon band.`
            );
        }


        /* -----------------------------------------
           CREATE AUTH USER
        ----------------------------------------- */

        const redirectUrl =
            `${window.location.origin}${window.location.pathname}`;


        const {
            data,
            error
        } = await supabase.auth.signUp({

            email: formData.email,

            password: formData.password,

            options: {

                emailRedirectTo: redirectUrl,

                data: {
                    username: formData.username,
                    full_name: formData.fullName
                }

            }

        });


        if (error) {
            throw error;
        }


        const user = data?.user;

        if (!user) {
            throw new Error(
                "Account yaratildi, lekin user topilmadi."
            );
        }


        /* -----------------------------------------
           EMAIL CONFIRMATION CASE
        ----------------------------------------- */

        const needsEmailConfirmation =
            Boolean(
                user.identities &&
                user.identities.length === 0
            ) === false &&
            !data.session;


        /* -----------------------------------------
           CREATE PROFILE
        ----------------------------------------- */

        if (data.session) {

            try {

                await createProfile(
                    user,
                    {
                        username: formData.username,
                        fullName: formData.fullName
                    }
                );

            } catch (profileError) {

                console.error(
                    "Profile creation error:",
                    profileError
                );

                /*
                 * Auth user already exists.
                 * Do not delete it from client.
                 * Show the actual profile/RLS issue.
                 */

                throw new Error(
                    `Account yaratildi, lekin profile yaratilmadi: ${getErrorMessage(profileError)}`
                );
            }


            await updateLastSeen(
                user.id
            );


            setMessage(
                signupMessage,
                "Account yaratildi. Dashboard ochilmoqda...",
                "success"
            );


            setTimeout(() => {
                redirectToDashboard();
            }, 500);

            return;
        }


        /* -----------------------------------------
           EMAIL CONFIRMATION REQUIRED
        ----------------------------------------- */

        if (needsEmailConfirmation || !data.session) {

            setMessage(
                signupMessage,
                "Account yaratildi. Emailingizni tasdiqlang, keyin Login qiling.",
                "success"
            );


            /* Reset password fields */
            const passwordInput =
                $("#signupPassword");

            const confirmInput =
                $("#signupConfirmPassword");

            if (passwordInput) {
                passwordInput.value = "";
            }

            if (confirmInput) {
                confirmInput.value = "";
            }

            return;
        }


    } catch (error) {

        console.error(
            "MegChatBox signup error:",
            error
        );

        setMessage(
            signupMessage,
            getErrorMessage(error),
            "error"
        );

    } finally {

        setButtonLoading(
            signupButton,
            false
        );

    }

}


/* =========================================================
   FORGOT PASSWORD
========================================================= */

async function handleForgotPassword(event) {

    event.preventDefault();

    clearMessages();

    if (!supabase) {

        setMessage(
            forgotMessage,
            "Supabase ulanishi topilmadi."
        );

        return;
    }

    const emailInput = $("#forgotEmail");

    const email =
        emailInput?.value.trim() || "";


    if (!isValidEmail(email)) {

        setMessage(
            forgotMessage,
            "To‘g‘ri email kiriting."
        );

        emailInput?.focus();

        return;
    }


    setButtonLoading(
        forgotButton,
        true
    );


    try {

        /*
         * User will return to index.html after
         * changing the password through Supabase.
         */

        const redirectTo =
            `${window.location.origin}${window.location.pathname}`;


        const { error } =
            await supabase.auth.resetPasswordForEmail(
                email,
                {
                    redirectTo
                }
            );


        if (error) {
            throw error;
        }


        setMessage(
            forgotMessage,
            "Password reset link emailingizga yuborildi.",
            "success"
        );

        if (emailInput) {
            emailInput.value = "";
        }


    } catch (error) {

        console.error(
            "Password reset request error:",
            error
        );

        setMessage(
            forgotMessage,
            getErrorMessage(error)
        );

    } finally {

        setButtonLoading(
            forgotButton,
            false
        );

    }

}


/* =========================================================
   UPDATE PASSWORD
========================================================= */

async function handleResetPassword(event) {

    event.preventDefault();

    clearMessages();

    if (!supabase) {

        setMessage(
            resetMessage,
            "Supabase ulanishi topilmadi."
        );

        return;
    }


    const passwordInput =
        $("#newPassword");

    const confirmInput =
        $("#confirmNewPassword");


    const password =
        passwordInput?.value || "";

    const confirmPassword =
        confirmInput?.value || "";


    if (password.length < 6) {

        setMessage(
            resetMessage,
            "Password kamida 6 ta belgidan iborat bo‘lishi kerak."
        );

        passwordInput?.focus();

        return;
    }


    if (password !== confirmPassword) {

        setMessage(
            resetMessage,
            "Passwordlar bir xil emas."
        );

        confirmInput?.focus();

        return;
    }


    setButtonLoading(
        resetButton,
        true
    );


    try {

        const { error } =
            await supabase.auth.updateUser({
                password
            });


        if (error) {
            throw error;
        }


        setMessage(
            resetMessage,
            "Password muvaffaqiyatli o‘zgartirildi. Login sahifasiga qayting.",
            "success"
        );


        if (passwordInput) {
            passwordInput.value = "";
        }

        if (confirmInput) {
            confirmInput.value = "";
        }


        setTimeout(async () => {

            try {
                await supabase.auth.signOut();
            } catch (error) {
                console.warn(error);
            }

            showLogin();

        }, 1200);


    } catch (error) {

        console.error(
            "Update password error:",
            error
        );

        setMessage(
            resetMessage,
            getErrorMessage(error)
        );

    } finally {

        setButtonLoading(
            resetButton,
            false
        );

    }

}


/* =========================================================
   FORM EVENTS
========================================================= */

loginForm?.addEventListener(
    "submit",
    handleLogin
);

signupForm?.addEventListener(
    "submit",
    handleSignup
);

forgotForm?.addEventListener(
    "submit",
    handleForgotPassword
);

resetForm?.addEventListener(
    "submit",
    handleResetPassword
);


/* =========================================================
   USERNAME INPUT CLEANUP
========================================================= */

const signupUsernameInput =
    $("#signupUsername");


signupUsernameInput?.addEventListener(
    "input",
    () => {

        const original =
            signupUsernameInput.value;

        const cleaned =
            original
                .toLowerCase()
                .replace(/^@+/, "")
                .replace(/[^a-z0-9_]/g, "")
                .slice(0, 32);

        if (
            signupUsernameInput.value !==
            cleaned
        ) {
            signupUsernameInput.value =
                cleaned;
        }

    }
);


/* =========================================================
   EMAIL INPUT NORMALIZATION
========================================================= */

[
    "#loginEmail",
    "#signupEmail",
    "#forgotEmail"
].forEach((selector) => {

    const input = $(selector);

    input?.addEventListener(
        "blur",
        () => {
            input.value =
                input.value.trim().toLowerCase();
        }
    );

});


/* =========================================================
   SIGNUP REAL-TIME BASIC VALIDATION
========================================================= */

signupUsernameInput?.addEventListener(
    "blur",
    async () => {

        const username =
            normalizeUsername(
                signupUsernameInput.value
            );


        if (!username) {
            return;
        }


        if (!isValidUsername(username)) {
            return;
        }


        if (!supabase) {
            return;
        }


        try {

            const exists =
                await usernameExists(username);


            if (exists) {

                signupUsernameInput.setCustomValidity(
                    "Username already taken."
                );

            } else {

                signupUsernameInput.setCustomValidity("");

            }

        } catch (error) {

            console.warn(
                "Username availability check failed:",
                error
            );

        }

    }
);


signupUsernameInput?.addEventListener(
    "input",
    () => {

        signupUsernameInput.setCustomValidity("");

    }
);


/* =========================================================
   SESSION CHECK
========================================================= */

async function getCurrentSession() {

    if (!supabase) {
        return null;
    }

    const {
        data,
        error
    } = await supabase.auth.getSession();

    if (error) {
        console.error(
            "Session error:",
            error
        );

        return null;
    }

    return data?.session || null;
}


/* =========================================================
   HANDLE EXISTING SESSION
========================================================= */

async function handleExistingSession() {

    if (!supabase) {
        return;
    }


    try {

        const session =
            await getCurrentSession();


        if (!session?.user) {
            return;
        }


        /* -----------------------------------------
           PASSWORD RESET FLOW
        ----------------------------------------- */

        const hash =
            window.location.hash || "";

        const search =
            window.location.search || "";


        const resetFlow =
            hash.includes("type=recovery") ||
            search.includes("type=recovery");


        if (resetFlow) {

            showReset();

            return;
        }


        /* -----------------------------------------
           NORMAL LOGIN SESSION
        ----------------------------------------- */

        const profileResult =
            await getProfileByUserId(
                session.user.id
            );


        if (profileResult.error) {
            throw profileResult.error;
        }


        const profile =
            profileResult.profile;


        if (!profile) {

            /*
             * A newly signed-up user may have a session
             * before profile creation depending on the
             * project's Supabase settings.
             */

            const metadata =
                session.user.user_metadata || {};


            const username =
                normalizeUsername(
                    metadata.username
                );


            const fullName =
                String(
                    metadata.full_name ||
                    metadata.name ||
                    ""
                ).trim();


            if (
                username &&
                isValidUsername(username) &&
                fullName
            ) {

                try {

                    await createProfile(
                        session.user,
                        {
                            username,
                            fullName
                        }
                    );

                } catch (profileError) {

                    console.error(
                        "Automatic profile creation failed:",
                        profileError
                    );

                    return;
                }

            } else {

                return;
            }

        }


        const finalProfile =
            profile || (
                await getProfileByUserId(
                    session.user.id
                )
            ).profile;


        if (isProfileAccountBlocked(finalProfile)) {

            await supabase.auth.signOut();

            setMessage(
                loginMessage,
                "Bu account hozir bloklangan."
            );

            return;
        }


        /*
         * User is already logged in.
         * Go straight to dashboard.
         */

        redirectToDashboard();


    } catch (error) {

        console.error(
            "Existing session error:",
            error
        );

    }

}


/* =========================================================
   AUTH STATE CHANGE
========================================================= */

function setupAuthListener() {

    if (!supabase) {
        return;
    }


    supabase.auth.onAuthStateChange(
        async (event, session) => {

            console.log(
                "MegChatBox auth event:",
                event
            );


            if (
                event === "SIGNED_OUT"
            ) {
                hideAuthLoading();
                showLogin();
                return;
            }


            if (
                event === "PASSWORD_RECOVERY"
            ) {
                hideAuthLoading();
                showReset();
                return;
            }


            if (
                event === "SIGNED_IN" &&
                session?.user
            ) {

                /*
                 * Only redirect when the session is on
                 * the login/auth page.
                 */

                const currentPage =
                    window.location.pathname
                        .split("/")
                        .pop()
                        .toLowerCase();


                if (
                    currentPage === "" ||
                    currentPage === "index.html"
                ) {

                    try {

                        const profileResult =
                            await getProfileByUserId(
                                session.user.id
                            );


                        if (
                            profileResult.profile &&
                            isProfileAccountBlocked(
                                profileResult.profile
                            )
                        ) {

                            await supabase.auth.signOut();

                            hideAuthLoading();

                            setMessage(
                                loginMessage,
                                "Bu account hozir bloklangan."
                            );

                            return;
                        }


                        redirectToDashboard();

                    } catch (error) {

                        console.error(
                            "SIGNED_IN redirect error:",
                            error
                        );

                    }

                }

            }

        }
    );

}


/* =========================================================
   REMEMBER ME
========================================================= */

function loadRememberedState() {

    try {

        const remembered =
            localStorage.getItem(
                "megchatbox_remember"
            );

        const checkbox =
            $("#rememberMe");


        if (
            checkbox &&
            remembered === "true"
        ) {
            checkbox.checked = true;
        }

    } catch (error) {

        console.warn(
            "Could not load remember state:",
            error
        );

    }

}


/* =========================================================
   INITIALIZATION
========================================================= */

async function initMegChatBoxAuth() {

    hideAuthLoading();

    loadRememberedState();

    setupAuthListener();


    /*
     * Detect Supabase recovery link first.
     */

    const hash =
        window.location.hash || "";

    const search =
        window.location.search || "";


    const recoveryFlow =
        hash.includes("type=recovery") ||
        search.includes("type=recovery");


    if (recoveryFlow) {

        showReset();

        return;
    }


    /*
     * Otherwise check existing login.
     */

    await handleExistingSession();


    /*
     * Default view remains Login.
     */

    if (
        loginView &&
        !loginView.classList.contains("hidden")
    ) {
        const emailInput =
            $("#loginEmail");

        emailInput?.focus();
    }

}


/* =========================================================
   START APP
========================================================= */

if (
    document.readyState === "loading"
) {

    document.addEventListener(
        "DOMContentLoaded",
        initMegChatBoxAuth
    );

} else {

    initMegChatBoxAuth();

}
