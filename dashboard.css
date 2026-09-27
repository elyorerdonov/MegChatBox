const loginPanel = document.querySelector(".login-panel");
const signupPanel = document.querySelector(".signup-panel");


// =========================
// LOGIN / SIGNUP PANELS
// =========================

function showSignup() {
    loginPanel.style.display = "none";
    signupPanel.style.display = "block";
}

function showLogin() {
    signupPanel.style.display = "none";
    loginPanel.style.display = "block";
}


// =========================
// PASSWORD SHOW / HIDE
// =========================

function togglePassword(inputId, button) {

    const input = document.getElementById(inputId);
    const icon = button.querySelector("i");

    if (input.type === "password") {

        input.type = "text";

        icon.classList.remove("fa-eye");
        icon.classList.add("fa-eye-slash");

    } else {

        input.type = "password";

        icon.classList.remove("fa-eye-slash");
        icon.classList.add("fa-eye");

    }
}


// =========================
// SIGN UP
// =========================

document
    .getElementById("signupForm")
    .addEventListener("submit", async function(event) {

        event.preventDefault();


        const name =
            document
                .getElementById("signupName")
                .value
                .trim();


        const username =
            document
                .getElementById("signupUsername")
                .value
                .trim()
                .toLowerCase();


        const email =
            document
                .getElementById("signupEmail")
                .value
                .trim()
                .toLowerCase();


        const password =
            document.getElementById("signupPassword").value;


        const confirmPassword =
            document.getElementById("confirmPassword").value;


        // Password tekshirish

        if (password !== confirmPassword) {

            alert("Passwords do not match!");

            return;
        }


        // Username tekshirish

        if (!/^[a-z0-9_]+$/.test(username)) {

            alert(
                "Username can only contain letters, numbers and _"
            );

            return;
        }


        if (username.length < 3) {

            alert(
                "Username must be at least 3 characters."
            );

            return;
        }


        try {

            // =========================
            // CREATE SUPABASE ACCOUNT
            // =========================

            const { data, error } =
                await supabaseClient.auth.signUp({

                    email: email,

                    password: password

                });


            if (error) {

                alert(error.message);

                return;
            }


            const user = data.user;


            if (!user) {

                alert(
                    "Account could not be created."
                );

                return;
            }


            // =========================
            // CREATE PROFILE
            // =========================

            const { error: profileError } =
                await supabaseClient
                    .from("profiles")
                    .insert({

                        id: user.id,

                        username: username,

                        full_name: name

                    });


            if (profileError) {

                if (profileError.code === "23505") {

                    alert(
                        "This username is already taken."
                    );

                } else {

                    alert(
                        profileError.message
                    );

                }

                return;
            }


            // =========================
            // SUCCESS
            // =========================

            alert(
                "Account created successfully!"
            );


            document
                .getElementById("signupForm")
                .reset();


            showLogin();


        } catch (error) {

            alert(
                "Something went wrong: " +
                error.message
            );

        }

    });


// =========================
// LOGIN
// =========================

document
    .getElementById("loginForm")
    .addEventListener("submit", async function(event) {

        event.preventDefault();


        const email =
            document
                .getElementById("loginEmail")
                .value
                .trim()
                .toLowerCase();


        const password =
            document
                .getElementById("loginPassword")
                .value;


        try {

            // =========================
            // SUPABASE LOGIN
            // =========================

            const { data, error } =
                await supabaseClient.auth
                    .signInWithPassword({

                        email: email,

                        password: password

                    });


            if (error) {

                alert(
                    "Incorrect email or password."
                );

                return;
            }


            // Login muvaffaqiyatli

            localStorage.setItem(
                "messageAppLoggedIn",
                "true"
            );


            // Dashboardga o'tish

            window.location.href =
                "dashboard.html";


        } catch (error) {

            alert(
                "Something went wrong: " +
                error.message
            );

        }

    });
