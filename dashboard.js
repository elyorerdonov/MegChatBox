(async function () {

    // =========================
    // LOGINNI TEKSHIRISH
    // =========================

    const { data: { session }, error: sessionError } =
        await supabaseClient.auth.getSession();

    if (sessionError || !session) {
        window.location.href = "index.html";
        return;
    }

    const currentUser = session.user;


    // =========================
    // ELEMENTLAR
    // =========================

    const userList = document.getElementById("userList");
    const searchInput = document.getElementById("searchInput");

    const myAvatar = document.getElementById("myAvatar");
    const myName = document.getElementById("myName");
    const myUsername = document.getElementById("myUsername");
    const myVerified = document.getElementById("myVerified");

    const chatName = document.getElementById("chatName");
    const chatAvatar = document.getElementById("chatAvatar");
    const chatStatus = document.getElementById("chatStatus");

    const messages = document.getElementById("messages");
    const messageForm = document.getElementById("messageForm");
    const messageInput = document.getElementById("messageInput");
    const sendButton = document.getElementById("sendButton");

    const contactActions = document.getElementById("contactActions");
    const addContactBtn = document.getElementById("addContactBtn");
    const acceptContactBtn = document.getElementById("acceptContactBtn");
    const declineContactBtn = document.getElementById("declineContactBtn");


    let selectedUser = null;
    let currentContactRequest = null;


    // =========================
    // O'Z PROFILIMIZ
    // =========================

    async function loadMyProfile() {

        const { data, error } = await supabaseClient
            .from("profiles")
            .select("username, full_name, role, is_verified")
            .eq("id", currentUser.id)
            .single();


        if (error) {

            console.error("Profile error:", error);

            myName.textContent = "Profile error";
            myUsername.textContent = "";

            return;
        }


        console.log("My profile:", data);


        myName.textContent = data.full_name;

        myUsername.textContent =
            "@" + data.username;


        // VERIFIED BADGE

        if (data.is_verified === true) {

            myVerified.style.display =
                "inline-flex";

        } else {

            myVerified.style.display =
                "none";
        }


        if (data.full_name) {

            myAvatar.textContent =
                data.full_name
                    .charAt(0)
                    .toUpperCase();
        }
    }


    // =========================
    // CONTACT BUTTONLARINI YASHIRISH
    // =========================

    function hideContactButtons() {

        addContactBtn.style.display = "none";

        acceptContactBtn.style.display = "none";

        declineContactBtn.style.display = "none";

        contactActions.style.display = "none";
    }


    // =========================
    // CONTACT STATUSNI TEKSHIRISH
    // =========================

    async function checkContactStatus() {

        if (!selectedUser) {
            hideContactButtons();
            return null;
        }


        const { data, error } = await supabaseClient
            .from("contact_requests")
            .select("*")
            .or(
                `and(sender_id.eq.${currentUser.id},receiver_id.eq.${selectedUser.id}),and(sender_id.eq.${selectedUser.id},receiver_id.eq.${currentUser.id})`
            )
            .order("created_at", {
                ascending: false
            })
            .limit(1);


        if (error) {

            console.error(
                "Contact request error:",
                error
            );

            hideContactButtons();

            return null;
        }


        currentContactRequest =
            data && data.length > 0
                ? data[0]
                : null;


        hideContactButtons();


        // =========================
        // HECH QANDAY REQUEST YO'Q
        // =========================

        if (!currentContactRequest) {

            contactActions.style.display =
                "flex";

            addContactBtn.style.display =
                "inline-flex";

            chatStatus.textContent =
                "Not a contact yet";

            disableChat();

            return null;
        }


        // =========================
        // ACCEPTED
        // =========================

        if (
            currentContactRequest.status ===
            "accepted"
        ) {

            chatStatus.textContent =
                "Contact";

            enableChat();

            return "accepted";
        }


        // =========================
        // PENDING
        // =========================

        if (
            currentContactRequest.status ===
            "pending"
        ) {

            contactActions.style.display =
                "flex";


            // Men yuborganman
            if (
                currentContactRequest.sender_id ===
                currentUser.id
            ) {

                addContactBtn.style.display =
                    "inline-flex";

                addContactBtn.disabled = true;

                addContactBtn.innerHTML = `
                    <i class="fa-solid fa-clock"></i>
                    Pending
                `;

                chatStatus.textContent =
                    "Contact request pending";

            }

            // Menga yuborilgan
            else {

                acceptContactBtn.style.display =
                    "inline-flex";

                declineContactBtn.style.display =
                    "inline-flex";

                chatStatus.textContent =
                    "Wants to add you";

            }


            disableChat();

            return "pending";
        }


        // =========================
        // DECLINED
        // =========================

        if (
            currentContactRequest.status ===
            "declined"
        ) {

            contactActions.style.display =
                "flex";

            addContactBtn.style.display =
                "inline-flex";

            addContactBtn.disabled = false;

            addContactBtn.innerHTML = `
                <i class="fa-solid fa-user-plus"></i>
                Add Contact
            `;

            chatStatus.textContent =
                "Contact request declined";

            disableChat();

            return "declined";
        }


        return null;
    }


    // =========================
    // CHATNI OCHISH
    // =========================

    async function openChat(user) {

        selectedUser = user;

        chatName.textContent =
            user.full_name;

        chatAvatar.textContent =
            user.full_name
                ? user.full_name
                    .charAt(0)
                    .toUpperCase()
                : "?";


        messageInput.value = "";

        messages.innerHTML = `
            <div class="welcome-message">
                <h2>Checking contact...</h2>
                <p>Please wait</p>
            </div>
        `;


        const status =
            await checkContactStatus();


        // Accepted bo'lsa xabarlarni yuklash
        if (status === "accepted") {

            await loadMessages();

        } else {

            messages.innerHTML = `
                <div class="welcome-message">

                    <h2>
                        Contact required
                    </h2>

                    <p>
                        Accept the contact request
                        before chatting.
                    </p>

                </div>
            `;
        }
    }


    // =========================
    // CHATNI OCHISH
    // =========================

    function enableChat() {

        messageInput.disabled = false;

        sendButton.disabled = false;
    }


    function disableChat() {

        messageInput.disabled = true;

        sendButton.disabled = true;
    }


    // =========================
    // CONTACT REQUEST YUBORISH
    // =========================

    async function sendContactRequest() {

        if (!selectedUser) return;


        addContactBtn.disabled = true;


        // Eski declined request bo'lsa
        // uni pendingga qaytaramiz

        if (
            currentContactRequest &&
            currentContactRequest.status ===
            "declined"
        ) {

            const { error } = await supabaseClient
                .from("contact_requests")
                .update({
                    status: "pending"
                })
                .eq(
                    "id",
                    currentContactRequest.id
                );


            if (error) {

                console.error(
                    "Request update error:",
                    error
                );

                alert(
                    "Could not send contact request."
                );

                addContactBtn.disabled = false;

                return;
            }

        } else {

            // Yangi request

            const { error } =
                await supabaseClient
                    .from("contact_requests")
                    .insert({
                        sender_id:
                            currentUser.id,

                        receiver_id:
                            selectedUser.id,

                        status: "pending"
                    });


            if (error) {

                console.error(
                    "Request insert error:",
                    error
                );

                alert(
                    "Could not send contact request."
                );

                addContactBtn.disabled = false;

                return;
            }
        }


        await checkContactStatus();
    }


    // =========================
    // REQUESTNI ACCEPT QILISH
    // =========================

    async function acceptContactRequest() {

        if (!currentContactRequest)
            return;


        acceptContactBtn.disabled = true;


        const { error } = await supabaseClient
            .from("contact_requests")
            .update({
                status: "accepted"
            })
            .eq(
                "id",
                currentContactRequest.id
            );


        if (error) {

            console.error(
                "Accept error:",
                error
            );

            alert(
                "Could not accept request."
            );

            acceptContactBtn.disabled = false;

            return;
        }


        await checkContactStatus();

        await loadMessages();
    }


    // =========================
    // REQUESTNI DECLINE QILISH
    // =========================

    async function declineContactRequest() {

        if (!currentContactRequest)
            return;


        declineContactBtn.disabled = true;


        const { error } = await supabaseClient
            .from("contact_requests")
            .update({
                status: "declined"
            })
            .eq(
                "id",
                currentContactRequest.id
            );


        if (error) {

            console.error(
                "Decline error:",
                error
            );

            alert(
                "Could not decline request."
            );

            declineContactBtn.disabled = false;

            return;
        }


        await checkContactStatus();
    }


    // =========================
    // XABARLARNI YUKLASH
    // =========================

    async function loadMessages() {

        if (!selectedUser)
            return;


        messages.innerHTML = "";


        const { data, error } =
            await supabaseClient
                .from("messages")
                .select("*")
                .or(
                    `and(sender_id.eq.${currentUser.id},receiver_id.eq.${selectedUser.id}),and(sender_id.eq.${selectedUser.id},receiver_id.eq.${currentUser.id})`
                )
                .order("created_at", {
                    ascending: true
                });


        if (error) {

            console.error(
                "Messages error:",
                error
            );

            messages.innerHTML = `
                <div class="welcome-message">
                    <h2>
                        Could not load messages
                    </h2>
                </div>
            `;

            return;
        }


        if (!data || data.length === 0) {

            messages.innerHTML = `
                <div class="welcome-message">
                    <h2>
                        No messages yet
                    </h2>

                    <p>
                        Send the first message!
                    </p>
                </div>
            `;

            return;
        }


        data.forEach(message => {

            const messageDiv =
                document.createElement("div");


            const isMine =
                message.sender_id ===
                currentUser.id;


            messageDiv.className =
                "message " +
                (
                    isMine
                        ? "sent"
                        : "received"
                );


            messageDiv.innerHTML =
                escapeHtml(
                    message.content
                );


            messages.appendChild(
                messageDiv
            );
        });


        messages.scrollTop =
            messages.scrollHeight;
    }


    // =========================
    // XABAR YUBORISH
    // =========================

    messageForm.addEventListener(
        "submit",
        async function (e) {

            e.preventDefault();


            if (!selectedUser)
                return;


            const text =
                messageInput.value.trim();


            if (!text)
                return;


            // Contact acceptedligini tekshiramiz

            const status =
                await checkContactStatus();


            if (status !== "accepted") {

                alert(
                    "You can only message accepted contacts."
                );

                return;
            }


            sendButton.disabled = true;


            const { error } =
                await supabaseClient
                    .from("messages")
                    .insert({
                        sender_id:
                            currentUser.id,

                        receiver_id:
                            selectedUser.id,

                        content: text
                    });


            if (error) {

                console.error(
                    "Send message error:",
                    error
                );

                alert(
                    "Message could not be sent."
                );

                sendButton.disabled = false;

                return;
            }


            messageInput.value = "";

            sendButton.disabled = false;

            await loadMessages();

            messageInput.focus();
        }
    );


    // =========================
    // CONTACT TUGMALARI
    // =========================

    addContactBtn.addEventListener(
        "click",
        sendContactRequest
    );


    acceptContactBtn.addEventListener(
        "click",
        acceptContactRequest
    );


    declineContactBtn.addEventListener(
        "click",
        declineContactRequest
    );


    // =========================
    // USER QIDIRISH
    // =========================

    async function searchUsers(
        username = ""
    ) {

        userList.innerHTML = "";

        const searchText =
            username.trim();


        if (searchText === "") {

            userList.innerHTML = `
                <p class="no-users">
                    Search for users by username
                </p>
            `;

            return;
        }


        const { data, error } =
            await supabaseClient
                .from("profiles")
                .select(
                    "id, username, full_name, role, is_verified"
                )
                .neq(
                    "id",
                    currentUser.id
                )
                .ilike(
                    "username",
                    `%${searchText}%`
                )
                .limit(20);


        if (error) {

            console.error(
                "Search error:",
                error
            );

            userList.innerHTML = `
                <p class="no-users">
                    Error searching users
                </p>
            `;

            return;
        }


        if (!data || data.length === 0) {

            userList.innerHTML = `
                <p class="no-users">
                    User not found
                </p>
            `;

            return;
        }


        data.forEach(user => {

            const item =
                document.createElement("div");


            item.className =
                "chat-item";


            const firstLetter =
                user.full_name
                    ? user.full_name
                        .charAt(0)
                        .toUpperCase()
                    : "?";


            item.innerHTML = `
                <div class="avatar">
                    ${escapeHtml(firstLetter)}
                </div>

                <div class="chat-info">

                    <h4>
                        ${escapeHtml(
                            user.full_name
                        )}
                    </h4>

                    <p>
                        @${escapeHtml(
                            user.username
                        )}
                    </p>

                </div>
            `;


            item.addEventListener(
                "click",
                () => {
                    openChat(user);
                }
            );


            userList.appendChild(item);
        });
    }


    // =========================
    // SEARCH EVENT
    // =========================

    searchInput.addEventListener(
        "input",
        function () {

            searchUsers(
                this.value
            );
        }
    );


    // =========================
    // REAL-TIME MESSAGES
    // =========================

    supabaseClient
        .channel("messages-channel")
        .on(
            "postgres_changes",
            {
                event: "INSERT",
                schema: "public",
                table: "messages"
            },
            async (payload) => {

                const message =
                    payload.new;


                if (!selectedUser)
                    return;


                const isThisChat =
                    (
                        message.sender_id ===
                        currentUser.id

                        &&

                        message.receiver_id ===
                        selectedUser.id
                    )
                    ||
                    (
                        message.sender_id ===
                        selectedUser.id

                        &&

                        message.receiver_id ===
                        currentUser.id
                    );


                if (isThisChat) {

                    await loadMessages();
                }
            }
        )
        .subscribe();


    // =========================
    // LOGOUT
    // =========================

    async function logout() {

        await supabaseClient
            .auth
            .signOut();


        localStorage.removeItem(
            "messageAppLoggedIn"
        );


        window.location.href =
            "index.html";
    }


    window.logout = logout;


    // =========================
    // HTML XAVFSIZLIGI
    // =========================

    function escapeHtml(text) {

        const div =
            document.createElement("div");

        div.textContent =
            text ?? "";

        return div.innerHTML;
    }


    // =========================
    // START
    // =========================

    hideContactButtons();

    disableChat();

    await loadMyProfile();

    await searchUsers("");

})();