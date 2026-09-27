/* =========================================================
   MSGBOX V2 — DASHBOARD.JS
   ========================================================= */

const supabase = supabaseClient;

/* =========================================================
   GLOBAL STATE
   ========================================================= */

let currentUser = null;
let currentProfile = null;

let selectedUser = null;
let selectedContactStatus = null;
let selectedContactRequest = null;

let realtimeChannel = null;
let searchTimer = null;

let currentTab = "chats";

const $ = (id) => document.getElementById(id);


/* =========================================================
   DOM HELPERS
   ========================================================= */

function show(el) {
    if (el) el.style.display = "";
}

function hide(el) {
    if (el) el.style.display = "none";
}

function setText(id, value) {
    const el = $(id);
    if (el) el.textContent = value ?? "";
}

function escapeHtml(value = "") {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function formatTime(date) {
    if (!date) return "";

    return new Date(date).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit"
    });
}

function formatLastSeen(date) {
    if (!date) return "Offline";

    const d = new Date(date);
    const diff = Date.now() - d.getTime();

    if (diff < 60 * 1000) return "online";

    if (diff < 60 * 60 * 1000) {
        return `${Math.floor(diff / 60000)} min ago`;
    }

    if (diff < 24 * 60 * 60 * 1000) {
        return `${Math.floor(diff / 3600000)}h ago`;
    }

    return d.toLocaleDateString();
}

function showToast(message, type = "normal") {
    const toast = $("toast");

    if (!toast) {
        console.log(message);
        return;
    }

    toast.textContent = message;
    toast.className = `toast ${type}`;

    show(toast);

    clearTimeout(showToast.timer);

    showToast.timer = setTimeout(() => {
        hide(toast);
    }, 3000);
}


/* =========================================================
   AVATAR
   ========================================================= */

function avatarHtml(user, className = "avatar") {
    if (!user) {
        return `<div class="${className}">?</div>`;
    }

    const name = user.full_name || user.username || "?";
    const letter = escapeHtml(name.charAt(0).toUpperCase());

    if (user.avatar_url) {
        return `
            <div class="${className}">
                <img
                    src="${escapeHtml(user.avatar_url)}"
                    alt="${escapeHtml(name)}"
                >
            </div>
        `;
    }

    return `
        <div class="${className}">
            ${letter}
        </div>
    `;
}


/* =========================================================
   VERIFIED BADGE
   ========================================================= */

function verifiedBadge(user) {
    if (!user?.is_verified) return "";

    return `
        <span class="verified-badge" title="Verified">
            ✓
        </span>
    `;
}


/* =========================================================
   SESSION
   ========================================================= */

async function checkSession() {
    const { data, error } = await supabase.auth.getSession();

    if (error || !data.session) {
        window.location.href = "index.html";
        return false;
    }

    currentUser = data.session.user;

    return true;
}


/* =========================================================
   LOAD PROFILE
   ========================================================= */

async function loadMyProfile() {
    const { data, error } = await supabase
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
            last_seen,
            account_blocked,
            account_blocked_until,
            messaging_blocked,
            messaging_blocked_until
        `)
        .eq("id", currentUser.id)
        .single();

    if (error) {
        console.error(error);
        showToast("Profile yuklanmadi", "error");
        return;
    }

    currentProfile = data;

    if (isCurrentlyBlocked(data)) {
        await supabase.auth.signOut();

        localStorage.removeItem("messageAppLoggedIn");

        alert("Your account is currently blocked.");

        window.location.href = "index.html";
        return;
    }

    renderMyProfile();
    setupRoleUI();
}


/* =========================================================
   BLOCK STATUS
   ========================================================= */

function isCurrentlyBlocked(profile) {
    if (!profile?.account_blocked) return false;

    if (!profile.account_blocked_until) {
        return true;
    }

    return new Date(profile.account_blocked_until) > new Date();
}

function isMessagingBlocked(profile) {
    if (!profile?.messaging_blocked) return false;

    if (!profile.messaging_blocked_until) {
        return true;
    }

    return new Date(profile.messaging_blocked_until) > new Date();
}


/* =========================================================
   MY PROFILE UI
   ========================================================= */

function renderMyProfile() {
    if (!currentProfile) return;

    const name =
        currentProfile.full_name ||
        currentProfile.username ||
        "User";

    const username =
        currentProfile.username || "";

    setText("myName", name);
    setText("myUsername", `@${username}`);

    const myAvatar = $("myAvatar");

    if (myAvatar) {
        if (currentProfile.avatar_url) {
            myAvatar.innerHTML = `
                <img
                    src="${escapeHtml(currentProfile.avatar_url)}"
                    alt="${escapeHtml(name)}"
                >
            `;
        } else {
            myAvatar.textContent =
                name.charAt(0).toUpperCase();
        }
    }

    const myVerified = $("myVerified");

    if (myVerified) {
        if (currentProfile.is_verified) {
            show(myVerified);
        } else {
            hide(myVerified);
        }
    }

    const profileEditAvatar = $("profileEditAvatar");

    if (profileEditAvatar) {
        if (currentProfile.avatar_url) {
            profileEditAvatar.innerHTML = `
                <img
                    src="${escapeHtml(currentProfile.avatar_url)}"
                    alt="Avatar"
                >
            `;
        } else {
            profileEditAvatar.textContent =
                name.charAt(0).toUpperCase();
        }
    }
}


/* =========================================================
   ROLE UI
   ========================================================= */

function setupRoleUI() {
    const role = currentProfile?.role;

    const ownerSettings = $("ownerSettings");
    const adminSettings = $("adminSettings");

    if (ownerSettings) {
        role === "owner"
            ? show(ownerSettings)
            : hide(ownerSettings);
    }

    if (adminSettings) {
        role === "admin" || role === "owner"
            ? show(adminSettings)
            : hide(adminSettings);
    }

    const ownerPanelButton = $("ownerPanelButton");
    const adminPanelButton = $("adminPanelButton");

    if (ownerPanelButton) {
        role === "owner"
            ? show(ownerPanelButton)
            : hide(ownerPanelButton);
    }

    if (adminPanelButton) {
        role === "admin" || role === "owner"
            ? show(adminPanelButton)
            : hide(adminPanelButton);
    }
}


/* =========================================================
   USER SEARCH
   ========================================================= */

async function searchUsers(username) {
    username = username.trim().toLowerCase();

    const list = $("userList");

    if (!list) return;

    if (!username) {
        await loadDefaultList();
        return;
    }

    const { data, error } = await supabase
        .from("profiles")
        .select(`
            id,
            username,
            full_name,
            role,
            is_verified,
            avatar_url,
            last_seen
        `)
        .ilike("username", `%${username}%`)
        .neq("id", currentUser.id)
        .order("username")
        .limit(30);

    if (error) {
        console.error(error);

        list.innerHTML = `
            <div class="empty-state">
                Search failed
            </div>
        `;

        return;
    }

    renderUserList(data || []);
}


/* =========================================================
   DEFAULT SIDEBAR LIST
   ========================================================= */

async function loadDefaultList() {
    if (currentTab === "groups") {
        await loadGroups();
        return;
    }

    if (currentTab === "channels") {
        await loadChannels();
        return;
    }

    const { data, error } = await supabase
        .from("contact_requests")
        .select(`
            sender_id,
            receiver_id,
            status,
            created_at
        `)
        .or(
            `sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`
        )
        .eq("status", "accepted")
        .order("created_at", { ascending: false })
        .limit(50);

    if (error) {
        console.error(error);
        return;
    }

    const ids = [];

    for (const item of data || []) {
        const otherId =
            item.sender_id === currentUser.id
                ? item.receiver_id
                : item.sender_id;

        if (!ids.includes(otherId)) {
            ids.push(otherId);
        }
    }

    if (!ids.length) {
        renderUserList([]);
        return;
    }

    const { data: users, error: userError } =
        await supabase
            .from("profiles")
            .select(`
                id,
                username,
                full_name,
                role,
                is_verified,
                avatar_url,
                last_seen
            `)
            .in("id", ids);

    if (userError) {
        console.error(userError);
        return;
    }

    renderUserList(users || []);
}


/* =========================================================
   RENDER USER LIST
   ========================================================= */

function renderUserList(users) {
    const list = $("userList");

    if (!list) return;

    if (!users.length) {
        list.innerHTML = `
            <div class="empty-state">
                No users found
            </div>
        `;

        return;
    }

    list.innerHTML = users.map(user => `
        <div
            class="user-item"
            data-user-id="${escapeHtml(user.id)}"
        >
            ${avatarHtml(user, "user-avatar")}

            <div class="user-info">
                <div class="user-name-row">
                    <strong>
                        ${escapeHtml(user.full_name || user.username)}
                    </strong>

                    ${verifiedBadge(user)}
                </div>

                <span>
                    @${escapeHtml(user.username)}
                </span>
            </div>
        </div>
    `).join("");

    list.querySelectorAll(".user-item").forEach(item => {
        item.addEventListener("click", async () => {
            const userId = item.dataset.userId;

            const user = users.find(
                u => u.id === userId
            );

            if (user) {
                await openUserChat(user);
            }
        });
    });
}


/* =========================================================
   OPEN USER CHAT
   ========================================================= */

async function openUserChat(user) {
    selectedUser = user;

    document
        .querySelector(".app")
        ?.classList.add("chat-open");

    renderChatHeader();

    await checkContactStatus();

    if (selectedContactStatus === "accepted") {
        await loadMessages();
    } else {
        renderWelcomeMessage();
    }
}


/* =========================================================
   CHAT HEADER
   ========================================================= */

function renderChatHeader() {
    if (!selectedUser) return;

    const avatar = $("chatAvatar");

    if (avatar) {
        if (selectedUser.avatar_url) {
            avatar.innerHTML = `
                <img
                    src="${escapeHtml(selectedUser.avatar_url)}"
                    alt=""
                >
            `;
        } else {
            avatar.textContent =
                (
                    selectedUser.full_name ||
                    selectedUser.username ||
                    "?"
                ).charAt(0).toUpperCase();
        }
    }

    setText(
        "chatName",
        selectedUser.full_name ||
        selectedUser.username
    );

    const chatVerified = $("chatVerified");

    if (chatVerified) {
        selectedUser.is_verified
            ? show(chatVerified)
            : hide(chatVerified);
    }

    const chatStatus = $("chatStatus");

    if (chatStatus) {
        chatStatus.textContent =
            selectedUser.last_seen
                ? formatLastSeen(selectedUser.last_seen)
                : "Offline";
    }
}


/* =========================================================
   CONTACT STATUS
   ========================================================= */

async function checkContactStatus() {
    if (!selectedUser) return;

    selectedContactStatus = null;
    selectedContactRequest = null;

    const { data, error } = await supabase
        .from("contact_requests")
        .select(`
            id,
            sender_id,
            receiver_id,
            status,
            created_at
        `)
        .or(
            `and(sender_id.eq.${currentUser.id},receiver_id.eq.${selectedUser.id}),and(sender_id.eq.${selectedUser.id},receiver_id.eq.${currentUser.id})`
        )
        .order("created_at", { ascending: false })
        .limit(1);

    if (error) {
        console.error(error);
        updateContactButtons();
        return;
    }

    if (data?.length) {
        selectedContactStatus = data[0].status;
        selectedContactRequest = data[0];
    }

    updateContactButtons();
}


/* =========================================================
   CONTACT REQUEST
   ========================================================= */

function updateContactButtons() {
    const addBtn = $("addContactBtn");
    const acceptBtn = $("acceptContactBtn");
    const declineBtn = $("declineContactBtn");
    const form = $("messageForm");

    if (!selectedUser) {
        hide(addBtn);
        hide(acceptBtn);
        hide(declineBtn);

        if (form) {
            form.style.opacity = "0.5";
        }

        return;
    }

    hide(addBtn);
    hide(acceptBtn);
    hide(declineBtn);

    if (selectedContactStatus === "accepted") {
        if (form) {
            form.style.opacity = "1";
            show(form);
        }

        return;
    }

    if (selectedContactStatus === "pending") {

        if (
            selectedContactRequest &&
            selectedContactRequest.receiver_id === currentUser.id
        ) {
            show(acceptBtn);
            show(declineBtn);
        }

        if (form) {
            form.style.opacity = "0.5";
        }

        return;
    }

    show(addBtn);

    if (form) {
        form.style.opacity = "0.5";
    }
}


/* =========================================================
   SEND CONTACT REQUEST
   ========================================================= */

async function sendContactRequest() {
    if (!selectedUser) return;

    const { error } = await supabase
        .from("contact_requests")
        .insert({
            sender_id: currentUser.id,
            receiver_id: selectedUser.id,
            status: "pending"
        });

    if (error) {
        if (error.code === "23505") {
            showToast("Contact request already exists");
        } else {
            console.error(error);
            showToast(error.message, "error");
        }

        return;
    }

    showToast("Contact request sent");

    await checkContactStatus();
}


/* =========================================================
   ACCEPT REQUEST
   ========================================================= */

async function acceptContactRequest() {
    if (!selectedContactRequest) return;

    const { error } = await supabase
        .from("contact_requests")
        .update({
            status: "accepted"
        })
        .eq("id", selectedContactRequest.id)
        .eq("receiver_id", currentUser.id);

    if (error) {
        console.error(error);
        showToast(error.message, "error");
        return;
    }

    showToast("Contact accepted");

    await checkContactStatus();

    if (selectedContactStatus === "accepted") {
        await loadMessages();
    }
}


/* =========================================================
   DECLINE REQUEST
   ========================================================= */

async function declineContactRequest() {
    if (!selectedContactRequest) return;

    const { error } = await supabase
        .from("contact_requests")
        .update({
            status: "declined"
        })
        .eq("id", selectedContactRequest.id)
        .eq("receiver_id", currentUser.id);

    if (error) {
        console.error(error);
        showToast(error.message, "error");
        return;
    }

    showToast("Contact request declined");

    await checkContactStatus();
}


/* =========================================================
   WELCOME MESSAGE
   ========================================================= */

function renderWelcomeMessage() {
    const messages = $("messages");

    if (!messages) return;

    if (!selectedUser) {
        messages.innerHTML = `
            <div class="welcome-message">
                <i class="fa-solid fa-comments"></i>
                <h2>Welcome to MsgBox</h2>
                <p>Select a contact to start chatting.</p>
            </div>
        `;

        return;
    }

    if (selectedContactStatus === "pending") {

        const incoming =
            selectedContactRequest?.receiver_id === currentUser.id;

        messages.innerHTML = `
            <div class="welcome-message">
                <i class="fa-solid fa-user-plus"></i>

                <h2>
                    ${incoming
                        ? "Contact request"
                        : "Request sent"}
                </h2>

                <p>
                    ${
                        incoming
                            ? "Accept the request to start chatting."
                            : "Waiting for the user to accept your request."
                    }
                </p>
            </div>
        `;

        return;
    }

    messages.innerHTML = `
        <div class="welcome-message">
            <i class="fa-solid fa-lock"></i>

            <h2>Contact required</h2>

            <p>
                Add this user first to start chatting.
            </p>
        </div>
    `;
}


/* =========================================================
   LOAD MESSAGES
   ========================================================= */

async function loadMessages() {
    if (!selectedUser) return;

    if (selectedContactStatus !== "accepted") {
        renderWelcomeMessage();
        return;
    }

    const { data, error } = await supabase
        .from("messages")
        .select(`
            id,
            sender_id,
            receiver_id,
            content,
            created_at,
            message_type,
            image_url,
            sticker_url,
            edited_at,
            deleted_at,
            delivered_at,
            seen_at
        `)
        .or(
            `and(sender_id.eq.${currentUser.id},receiver_id.eq.${selectedUser.id}),and(sender_id.eq.${selectedUser.id},receiver_id.eq.${currentUser.id})`
        )
        .order("created_at", {
            ascending: true
        });

    if (error) {
        console.error(error);
        showToast(
            "Messages could not be loaded",
            "error"
        );
        return;
    }

    renderMessages(data || []);

    /* Mark received messages as delivered */
    await markMessagesDelivered();

    /* Mark currently opened chat as seen */
    await markMessagesSeen();
}


/* =========================================================
   MESSAGE STATUS
   ========================================================= */

function messageStatusHtml(message, mine) {
    if (!mine) return "";

    if (message.seen_at) {
        return `
            <span
                class="message-status seen"
                title="Seen"
            >
                ✓✓
            </span>
        `;
    }

    if (message.delivered_at) {
        return `
            <span
                class="message-status delivered"
                title="Delivered"
            >
                ✓✓
            </span>
        `;
    }

    return `
        <span
            class="message-status sent"
            title="Sent"
        >
            ✓
        </span>
    `;
}


/* =========================================================
   RENDER MESSAGES
   ========================================================= */

function renderMessages(messages) {
    const container = $("messages");

    if (!container) return;

    if (!messages.length) {
        container.innerHTML = `
            <div class="welcome-message">
                <i class="fa-regular fa-message"></i>

                <h2>No messages yet</h2>

                <p>
                    Start the conversation.
                </p>
            </div>
        `;

        return;
    }

    container.innerHTML = messages.map(message => {

        const mine =
            message.sender_id === currentUser.id;

        let content = "";

        /* -----------------------------------------
           DELETED MESSAGE
           ----------------------------------------- */

        if (message.deleted_at) {

            content = `
                <span class="deleted-message">
                    This message was deleted
                </span>
            `;

        }

        /* -----------------------------------------
           IMAGE
           ----------------------------------------- */

        else if (message.message_type === "image") {

            content = `
                <div
                    class="image-message"
                    data-image-path="${escapeHtml(
                        message.image_url || ""
                    )}"
                >
                    <span>
                        Image
                    </span>
                </div>
            `;

        }

        /* -----------------------------------------
           STICKER
           ----------------------------------------- */

        else if (message.message_type === "sticker") {

            content = `
                <div class="sticker-message">
                    Sticker
                </div>
            `;

        }

        /* -----------------------------------------
           TEXT
           ----------------------------------------- */

        else {

            content = `
                <span>
                    ${escapeHtml(message.content || "")}
                </span>
            `;
        }

        /* -----------------------------------------
           EDIT / DELETE ACTIONS
           ----------------------------------------- */

        let actions = "";

        if (mine && !message.deleted_at) {

            actions = `
                <div class="message-actions">

                    ${
                        message.message_type === "text"
                            ? `
                                <button
                                    type="button"
                                    class="message-action-btn"
                                    data-message-action="edit"
                                    data-message-id="${message.id}"
                                    title="Edit"
                                >
                                    <i class="fa-solid fa-pen"></i>
                                </button>
                            `
                            : ""
                    }

                    <button
                        type="button"
                        class="message-action-btn"
                        data-message-action="delete"
                        data-message-id="${message.id}"
                        title="Delete"
                    >
                        <i class="fa-solid fa-trash"></i>
                    </button>

                </div>
            `;
        }

        return `
            <div
                class="message-row ${mine ? "sent" : "received"}"
                data-message-id="${message.id}"
            >

                <div class="message-bubble">

                    ${content}

                    <div class="message-meta">

                        <span>
                            ${formatTime(message.created_at)}
                        </span>

                        ${
                            message.edited_at
                                ? `
                                    <small>
                                        edited
                                    </small>
                                `
                                : ""
                        }

                        ${messageStatusHtml(message, mine)}

                    </div>

                    ${actions}

                </div>

            </div>
        `;

    }).join("");

    container.scrollTop = container.scrollHeight;
}


/* =========================================================
   EDIT MESSAGE
   ========================================================= */

async function editMessage(messageId) {

    const { data: message, error: loadError } =
        await supabase
            .from("messages")
            .select(`
                id,
                sender_id,
                receiver_id,
                content,
                message_type,
                deleted_at
            `)
            .eq("id", messageId)
            .single();

    if (loadError || !message) {
        console.error(loadError);
        showToast(
            "Message could not be found",
            "error"
        );
        return;
    }

    if (message.sender_id !== currentUser.id) {
        showToast(
            "You can only edit your own messages",
            "error"
        );
        return;
    }

    if (message.deleted_at) {
        showToast(
            "Deleted messages cannot be edited",
            "error"
        );
        return;
    }

    if (message.message_type !== "text") {
        showToast(
            "Only text messages can be edited",
            "error"
        );
        return;
    }

    const newContent =
        prompt(
            "Edit your message:",
            message.content || ""
        );

    if (newContent === null) return;

    const content = newContent.trim();

    if (!content) {
        showToast(
            "Message cannot be empty",
            "error"
        );
        return;
    }

    const { error } = await supabase
        .from("messages")
        .update({
            content,
            edited_at: new Date().toISOString()
        })
        .eq("id", messageId)
        .eq("sender_id", currentUser.id);

    if (error) {
        console.error(error);
        showToast(
            error.message,
            "error"
        );
        return;
    }

    showToast("Message edited");

    await loadMessages();
}


/* =========================================================
   DELETE MESSAGE
   ========================================================= */

async function deleteMessage(messageId) {

    const confirmed =
        confirm(
            "Delete this message?"
        );

    if (!confirmed) return;

    const { error } = await supabase
        .from("messages")
        .update({
            content: "",
            image_url: null,
            sticker_url: null,
            deleted_at: new Date().toISOString(),
            edited_at: null
        })
        .eq("id", messageId)
        .eq("sender_id", currentUser.id);

    if (error) {
        console.error(error);
        showToast(
            error.message,
            "error"
        );
        return;
    }

    showToast("Message deleted");

    await loadMessages();
}


/* =========================================================
   MARK DELIVERED
   ========================================================= */

async function markMessagesDelivered() {

    if (!selectedUser) return;

    const { data, error } =
        await supabase
            .from("messages")
            .select("id")
            .eq("sender_id", selectedUser.id)
            .eq("receiver_id", currentUser.id)
            .is("delivered_at", null);

    if (error) {
        console.error(error);
        return;
    }

    for (const message of data || []) {

        const { error: rpcError } =
            await supabase.rpc(
                "mark_message_delivered",
                {
                    message_id: message.id
                }
            );

        if (rpcError) {
            console.error(rpcError);
        }
    }
}


/* =========================================================
   MARK SEEN
   ========================================================= */

async function markMessagesSeen() {

    if (!selectedUser) return;

    const { data, error } =
        await supabase
            .from("messages")
            .select("id")
            .eq("sender_id", selectedUser.id)
            .eq("receiver_id", currentUser.id)
            .is("seen_at", null);

    if (error) {
        console.error(error);
        return;
    }

    for (const message of data || []) {

        const { error: rpcError } =
            await supabase.rpc(
                "mark_message_seen",
                {
                    message_id: message.id
                }
            );

        if (rpcError) {
            console.error(rpcError);
        }
    }
}


/* =========================================================
   MESSAGE ACTION EVENTS
   ========================================================= */

function setupMessageActions() {

    const container = $("messages");

    if (!container) return;

    container.addEventListener(
        "click",
        async event => {

            const button =
                event.target.closest(
                    "[data-message-action]"
                );

            if (!button) return;

            const action =
                button.dataset.messageAction;

            const messageId =
                Number(button.dataset.messageId);

            if (!messageId) return;

            if (action === "edit") {
                await editMessage(messageId);
            }

            if (action === "delete") {
                await deleteMessage(messageId);
            }

        }
    );
}


/* =========================================================
   SEND MESSAGE
   ========================================================= */

async function sendMessage(event) {
    event?.preventDefault();

    if (!selectedUser) {
        showToast(
            "Select a contact first"
        );
        return;
    }

    if (selectedContactStatus !== "accepted") {
        showToast(
            "Accept the contact request first"
        );
        return;
    }

    if (isMessagingBlocked(currentProfile)) {
        showToast(
            "Messaging is blocked for your account",
            "error"
        );
        return;
    }

    const input = $("messageInput");

    if (!input) return;

    const content =
        input.value.trim();

    if (!content) return;

    const { error } =
        await supabase
            .from("messages")
            .insert({
                sender_id: currentUser.id,
                receiver_id: selectedUser.id,
                content,
                message_type: "text"
            });

    if (error) {
        console.error(error);
        showToast(
            error.message,
            "error"
        );
        return;
    }

    input.value = "";

    await loadMessages();
}


/* =========================================================
   IMAGE UPLOAD
   ========================================================= */

async function sendImage(file) {

    if (!file) return;

    if (!selectedUser) {
        showToast(
            "Select a contact first"
        );
        return;
    }

    if (selectedContactStatus !== "accepted") {
        showToast(
            "Accept the contact request first"
        );
        return;
    }

    if (isMessagingBlocked(currentProfile)) {
        showToast(
            "Messaging is blocked",
            "error"
        );
        return;
    }

    const allowedTypes = [
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/gif"
    ];

    if (!allowedTypes.includes(file.type)) {
        showToast(
            "Unsupported image type",
            "error"
        );
        return;
    }

    if (file.size > 8 * 1024 * 1024) {
        showToast(
            "Image must be smaller than 8MB",
            "error"
        );
        return;
    }

    const extension =
        file.name.split(".").pop() || "jpg";

    const fileName =
        `${crypto.randomUUID()}.${extension}`;

    const path =
        `${currentUser.id}/${fileName}`;

    showToast(
        "Uploading image..."
    );

    const { error: uploadError } =
        await supabase.storage
            .from("chat-media")
            .upload(
                path,
                file,
                {
                    cacheControl: "3600",
                    upsert: false
                }
            );

    if (uploadError) {
        console.error(uploadError);

        showToast(
            uploadError.message,
            "error"
        );

        return;
    }

    /*
     * IMPORTANT:
     * chat-media is PRIVATE.
     *
     * Store the storage path, not a public URL.
     *
     * Signed URL support will use this path.
     */

    const { error } =
        await supabase
            .from("messages")
            .insert({
                sender_id: currentUser.id,
                receiver_id: selectedUser.id,
                content: "",
                message_type: "image",
                image_url: path
            });

    if (error) {
        console.error(error);

        showToast(
            error.message,
            "error"
        );

        return;
    }

    showToast(
        "Image sent"
    );

    await loadMessages();
}


/* =========================================================
   EMOJI
   ========================================================= */

const emojis = [
    "😀", "😃", "😄", "😁", "😆",
    "😅", "😂", "🤣", "😊", "😇",
    "🙂", "🙃", "😉", "😌", "😍",
    "🥰", "😘", "😎", "🤩", "🤔",
    "😐", "😑", "😶", "🙄", "😏",
    "😴", "😭", "😡", "🤬", "😱",
    "👍", "👎", "👏", "🙏", "❤️",
    "🔥", "🎉", "💯", "😂", "💀"
];

function setupEmojiPanel() {

    const panel = $("emojiPanel");

    if (!panel) return;

    panel.innerHTML =
        emojis.map(emoji => `
            <button
                type="button"
                class="emoji-item"
                data-emoji="${emoji}"
            >
                ${emoji}
            </button>
        `).join("");

    panel.querySelectorAll(".emoji-item")
        .forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    const input =
                        $("messageInput");

                    if (!input) return;

                    input.value +=
                        button.dataset.emoji;

                    input.focus();
                }
            );

        });
}

function toggleEmojiPanel() {

    const panel =
        $("emojiPanel");

    if (!panel) return;

    if (
        panel.style.display === "none" ||
        !panel.style.display
    ) {
        show(panel);
    } else {
        hide(panel);
    }
}


/* =========================================================
   SETTINGS MODAL
   ========================================================= */

function openSettings() {

    const modal =
        $("settingsModal");

    if (!modal) return;

    show(modal);
}

function closeSettings() {
    hide($("settingsModal"));
}


/* =========================================================
   PROFILE MODAL
   ========================================================= */

function openProfileModal() {

    const modal =
        $("profileModal");

    if (!modal) return;

    const fullName =
        $("profileFullName");

    const username =
        $("profileUsername");

    const bio =
        $("profileBio");

    if (fullName) {
        fullName.value =
            currentProfile?.full_name || "";
    }

    if (username) {
        username.value =
            currentProfile?.username || "";
    }

    if (bio) {
        bio.value =
            currentProfile?.bio || "";
    }

    show(modal);
}

function closeProfileModal() {
    hide($("profileModal"));
}


/* =========================================================
   AVATAR UPLOAD
   ========================================================= */

async function uploadAvatar(file) {

    if (!file) return;

    const allowed = [
        "image/jpeg",
        "image/png",
        "image/webp"
    ];

    if (!allowed.includes(file.type)) {
        showToast(
            "Unsupported image type",
            "error"
        );
        return;
    }

    if (file.size > 5 * 1024 * 1024) {
        showToast(
            "Avatar must be smaller than 5MB",
            "error"
        );
        return;
    }

    const extension =
        file.name.split(".").pop() || "jpg";

    const path =
        `${currentUser.id}/${crypto.randomUUID()}.${extension}`;

    const { error: uploadError } =
        await supabase.storage
            .from("avatars")
            .upload(
                path,
                file,
                {
                    cacheControl: "3600",
                    upsert: false
                }
            );

    if (uploadError) {
        console.error(uploadError);

        showToast(
            uploadError.message,
            "error"
        );

        return;
    }

    const {
        data: publicData
    } = supabase.storage
        .from("avatars")
        .getPublicUrl(path);

    const avatarUrl =
        publicData?.publicUrl;

    if (!avatarUrl) {
        showToast(
            "Avatar URL failed",
            "error"
        );
        return;
    }

    const { error } =
        await supabase
            .from("profiles")
            .update({
                avatar_url: avatarUrl
            })
            .eq("id", currentUser.id);

    if (error) {
        console.error(error);

        showToast(
            error.message,
            "error"
        );

        return;
    }

    currentProfile.avatar_url =
        avatarUrl;

    renderMyProfile();

    showToast(
        "Avatar updated"
    );
}


/* =========================================================
   SAVE PROFILE
   ========================================================= */

async function saveProfile(event) {

    event?.preventDefault();

    const fullName =
        $("profileFullName")?.value.trim();

    const username =
        $("profileUsername")?.value
            .trim()
            .toLowerCase();

    const bio =
        $("profileBio")?.value.trim();

    if (!fullName) {
        showToast(
            "Full name is required",
            "error"
        );
        return;
    }

    if (!/^[a-z0-9_]{3,32}$/.test(username)) {
        showToast(
            "Username: 3-32 characters, a-z, 0-9 and _ only",
            "error"
        );
        return;
    }

    if (
        username === "owner" &&
        currentProfile.username !== "owner"
    ) {
        showToast(
            "This username is protected",
            "error"
        );
        return;
    }

    const { error } =
        await supabase
            .from("profiles")
            .update({
                full_name: fullName,
                username,
                bio: bio || ""
            })
            .eq("id", currentUser.id);

    if (error) {

        if (error.code === "23505") {
            showToast(
                "Username already exists",
                "error"
            );
        } else {
            console.error(error);

            showToast(
                error.message,
                "error"
            );
        }

        return;
    }

    currentProfile.full_name =
        fullName;

    currentProfile.username =
        username;

    currentProfile.bio =
        bio || "";

    renderMyProfile();

    closeProfileModal();

    showToast(
        "Profile updated"
    );
}


/* =========================================================
   OWNER PANEL
   ========================================================= */

function openOwnerPanel() {

    if (currentProfile?.role !== "owner") {
        showToast(
            "Owner access only",
            "error"
        );
        return;
    }

    show($("ownerModal"));

    loadOwnerReports();
}

function closeOwnerPanel() {
    hide($("ownerModal"));
}


/* =========================================================
   OWNER USER SEARCH
   ========================================================= */

async function findUserByUsername(username) {

    username =
        username.trim().toLowerCase();

    if (!username) return null;

    const { data, error } =
        await supabase
            .from("profiles")
            .select(`
                id,
                username,
                full_name,
                role,
                is_verified,
                verified_until,
                account_blocked,
                account_blocked_until,
                messaging_blocked,
                messaging_blocked_until,
                avatar_url
            `)
            .eq("username", username)
            .maybeSingle();

    if (error) {
        console.error(error);
        return null;
    }

    return data;
}


/* =========================================================
   OWNER VERIFIED SEARCH
   ========================================================= */

async function ownerSearchVerified() {

    const username =
        $("ownerVerifiedUsername")?.value.trim();

    if (!username) return;

    const user =
        await findUserByUsername(username);

    const result =
        $("ownerVerifiedResult");

    if (!result) return;

    if (!user) {

        result.innerHTML = `
            <div class="empty-state">
                User not found
            </div>
        `;

        return;
    }

    result.innerHTML = `
        <div class="owner-user-card">

            ${avatarHtml(user, "user-avatar")}

            <div class="user-info">

                <strong>
                    ${escapeHtml(user.full_name)}
                    ${verifiedBadge(user)}
                </strong>

                <span>
                    @${escapeHtml(user.username)}
                </span>

            </div>

            <div class="owner-actions">

                ${
                    user.is_verified
                        ? `
                            <button
                                class="danger-btn"
                                data-action="remove-verified"
                            >
                                Remove
                            </button>
                        `
                        : `
                            <button
                                class="primary-btn"
                                data-action="give-verified"
                            >
                                Give ✓
                            </button>
                }

            </div>

        </div>
    `;

    result
        .querySelectorAll("[data-action]")
        .forEach(button => {

            button.addEventListener(
                "click",
                async () => {

                    if (
                        button.dataset.action ===
                        "remove-verified"
                    ) {
                        await setVerified(
                            user.id,
                            false
                        );
                    }

                    if (
                        button.dataset.action ===
                        "give-verified"
                    ) {
                        await setVerified(
                            user.id,
                            true
                        );
                    }

                }
            );

        });
}


/* =========================================================
   SET VERIFIED
   ========================================================= */

async function setVerified(
    userId,
    give
) {

    if (currentProfile?.role !== "owner") {
        showToast(
            "Owner access only",
            "error"
        );
        return;
    }

    let durationDays = null;

    if (give) {

        const duration =
            $("verifiedDuration")?.value ||
            "permanent";

        if (duration !== "permanent") {
            durationDays =
                Number(duration);
        }
    }

    const { error } =
        await supabase.rpc(
            "owner_set_verified",
            {
                target_user_id: userId,
                give_verified: give,
                duration_days: durationDays
            }
        );

    if (error) {
        console.error(error);

        showToast(
            error.message,
            "error"
        );

        return;
    }

    showToast(
        give
            ? "Verified badge given ✓"
            : "Verified badge removed"
    );

    await ownerSearchVerified();
}


/* =========================================================
   OWNER MODERATION SEARCH
   ========================================================= */

async function ownerSearchModeration() {

    const username =
        $("ownerModerationUsername")?.value.trim();

    if (!username) return;

    const user =
        await findUserByUsername(username);

    renderModerationUser(
        user,
        $("ownerModerationResult")
    );
}


/* =========================================================
   ADMIN MODERATION SEARCH
   ========================================================= */

async function adminSearchModeration() {

    const username =
        $("adminModerationUsername")?.value.trim();

    if (!username) return;

    const user =
        await findUserByUsername(username);

    renderModerationUser(
        user,
        $("adminModerationResult")
    );
}


/* =========================================================
   RENDER MODERATION USER
   ========================================================= */

function renderModerationUser(
    user,
    result
) {

    if (!result) return;

    if (!user) {

        result.innerHTML = `
            <div class="empty-state">
                User not found
            </div>
        `;

        return;
    }

    const owner =
        user.role === "owner";

    if (owner) {

        result.innerHTML = `
            <div class="empty-state">
                Owner cannot be moderated.
            </div>
        `;

        return;
    }

    result.innerHTML = `
        <div class="owner-user-card">

            ${avatarHtml(
                user,
                "user-avatar"
            )}

            <div class="user-info">

                <strong>
                    ${escapeHtml(user.full_name)}
                    ${verifiedBadge(user)}
                </strong>

                <span>
                    @${escapeHtml(user.username)}
                </span>

                <small>
                    Role: ${escapeHtml(user.role)}
                </small>

            </div>

            <div class="owner-actions">

                <button
                    class="danger-btn"
                    data-moderate="account"
                >
                    ${
                        user.account_blocked
                            ? "Unblock Account"
                            : "Block Account"
                    }
                </button>

                <button
                    class="danger-btn"
                    data-moderate="messaging"
                >
                    ${
                        user.messaging_blocked
                            ? "Unblock Messages"
                            : "Block Messages"
                    }
                </button>

            </div>

        </div>
    `;

    result
        .querySelectorAll("[data-moderate]")
        .forEach(button => {

            button.addEventListener(
                "click",
                async () => {

                    const type =
                        button.dataset.moderate;

                    const blocked =
                        type === "account"
                            ? user.account_blocked
                            : user.messaging_blocked;

                    if (blocked) {

                        await moderateUser(
                            user.id,
                            type,
                            false
                        );

                        return;
                    }

                    const reason =
                        prompt(
                            "Reason for this action:"
                        );

                    if (reason === null) return;

                    const durationText =
                        prompt(
                            "Duration in days. Leave empty for permanent:"
                        );

                    let durationDays = null;

                    if (durationText?.trim()) {

                        durationDays =
                            Number(durationText);

                        if (
                            !Number.isInteger(
                                durationDays
                            ) ||
                            durationDays <= 0
                        ) {
                            showToast(
                                "Invalid duration",
                                "error"
                            );
                            return;
                        }
                    }

                    await moderateUser(
                        user.id,
                        type,
                        true,
                        reason,
                        durationDays
                    );

                }
            );

        });
}


/* =========================================================
   MODERATE USER
   ========================================================= */

async function moderateUser(
    userId,
    blockType,
    active,
    reason = "",
    durationDays = null
) {

    if (
        currentProfile?.role !== "owner" &&
        currentProfile?.role !== "admin"
    ) {
        showToast(
            "Admin access only",
            "error"
        );
        return;
    }

    const { error } =
        await supabase.rpc(
            "owner_set_user_block",
            {
                target_user_id: userId,
                block_type: blockType,
                reason_text: reason,
                duration_days: durationDays,
                make_active: active
            }
        );

    if (error) {
        console.error(error);

        showToast(
            error.message,
            "error"
        );

        return;
    }

    showToast(
        active
            ? `${blockType} block applied`
            : `${blockType} block removed`
    );

    if (
        currentProfile.role === "owner"
    ) {
        await ownerSearchModeration();
    } else {
        await adminSearchModeration();
    }
}


/* =========================================================
   ADMIN MANAGEMENT
   ========================================================= */

async function ownerSearchAdmin() {

    const username =
        $("ownerAdminUsername")?.value.trim();

    if (!username) return;

    const user =
        await findUserByUsername(username);

    const result =
        $("ownerAdminResult");

    if (!result) return;

    if (!user) {

        result.innerHTML = `
            <div class="empty-state">
                User not found
            </div>
        `;

        return;
    }

    if (user.role === "owner") {

        result.innerHTML = `
            <div class="empty-state">
                Owner cannot be changed.
            </div>
        `;

        return;
    }

    const isAdmin =
        user.role === "admin";

    result.innerHTML = `
        <div class="owner-user-card">

            ${avatarHtml(
                user,
                "user-avatar"
            )}

            <div class="user-info">

                <strong>
                    ${escapeHtml(user.full_name)}
                </strong>

                <span>
                    @${escapeHtml(user.username)}
                </span>

            </div>

            <button
                class="${isAdmin
                    ? "danger-btn"
                    : "primary-btn"}"
                id="toggleAdminBtn"
            >
                ${
                    isAdmin
                        ? "Remove Admin"
                        : "Make Admin"
                }
            </button>

        </div>
    `;

    $("toggleAdminBtn")
        ?.addEventListener(
            "click",
            async () => {

                await setAdmin(
                    user.id,
                    !isAdmin
                );

            }
        );
}


/* =========================================================
   SET ADMIN
   ========================================================= */

async function setAdmin(
    userId,
    makeAdmin
) {

    if (currentProfile?.role !== "owner") {
        showToast(
            "Only Owner can manage admins",
            "error"
        );
        return;
    }

    const { error } =
        await supabase.rpc(
            "owner_set_admin",
            {
                target_user_id: userId,
                make_admin: makeAdmin
            }
        );

    if (error) {
        console.error(error);

        showToast(
            error.message,
            "error"
        );

        return;
    }

    showToast(
        makeAdmin
            ? "Admin added"
            : "Admin removed"
    );

    await ownerSearchAdmin();
}


/* =========================================================
   REPORTS
   ========================================================= */

async function loadOwnerReports() {

    if (
        currentProfile?.role !== "owner" &&
        currentProfile?.role !== "admin"
    ) {
        return;
    }

    const { data, error } =
        await supabase
            .from("reports")
            .select(`
                id,
                reporter_id,
                reported_user_id,
                reason,
                description,
                status,
                created_at
            `)
            .order("created_at", {
                ascending: false
            })
            .limit(50);

    if (error) {
        console.error(error);
        return;
    }

    renderReports(
        data || [],
        $("ownerReportsList") ||
        $("adminReportsList")
    );
}


/* =========================================================
   RENDER REPORTS
   ========================================================= */

function renderReports(
    reports,
    container
) {

    if (!container) return;

    if (!reports.length) {

        container.innerHTML = `
            <div class="empty-state">
                No reports
            </div>
        `;

        return;
    }

    container.innerHTML =
        reports.map(report => `

        <div class="report-card">

            <div>

                <strong>
                    Report #${report.id}
                </strong>

                <span>
                    Reason:
                    ${escapeHtml(report.reason)}
                </span>

                <span>
                    ${escapeHtml(
                        report.description || ""
                    )}
                </span>

                <small>
                    ${formatTime(
                        report.created_at
                    )}
                    ·
                    ${escapeHtml(
                        report.status
                    )}
                </small>

            </div>

            <div class="owner-actions">

                ${
                    report.status === "pending"
                        ? `
                            <button
                                class="primary-btn"
                                data-report-action="reviewed"
                                data-report-id="${report.id}"
                            >
                                Review
                            </button>

                            <button
                                class="danger-btn"
                                data-report-action="dismissed"
                                data-report-id="${report.id}"
                            >
                                Dismiss
                            </button>
                        `
                        : ""
                }

            </div>

        </div>

    `).join("");

    container
        .querySelectorAll(
            "[data-report-action]"
        )
        .forEach(button => {

            button.addEventListener(
                "click",
                async () => {

                    await updateReport(
                        Number(
                            button.dataset.reportId
                        ),
                        button.dataset.reportAction
                    );

                }
            );

        });
}


/* =========================================================
   UPDATE REPORT
   ========================================================= */

async function updateReport(
    reportId,
    status
) {

    const { error } =
        await supabase.rpc(
            "admin_update_report",
            {
                report_id: reportId,
                new_status: status
            }
        );

    if (error) {
        console.error(error);

        showToast(
            error.message,
            "error"
        );

        return;
    }

    showToast(
        "Report updated"
    );

    await loadOwnerReports();
}


/* =========================================================
   CREATE GROUP
   ========================================================= */

async function createGroup(event) {

    event?.preventDefault();

    const name =
        $("groupName")?.value.trim();

    const username =
        $("groupUsername")?.value
            .trim()
            .toLowerCase();

    const bio =
        $("groupBio")?.value.trim();

    if (!name || !username) {
        showToast(
            "Group name and username are required",
            "error"
        );
        return;
    }

    if (!/^[a-z0-9_]{3,32}$/.test(username)) {
        showToast(
            "Invalid group username",
            "error"
        );
        return;
    }

    const { data, error } =
        await supabase
            .from("groups")
            .insert({
                owner_id: currentUser.id,
                name,
                username,
                bio: bio || ""
            })
            .select()
            .single();

    if (error) {

        console.error(error);

        if (error.code === "23505") {
            showToast(
                "Group username already exists",
                "error"
            );
        } else {
            showToast(
                error.message,
                "error"
            );
        }

        return;
    }

    const { error: memberError } =
        await supabase
            .from("group_members")
            .insert({
                group_id: data.id,
                user_id: currentUser.id,
                role: "owner"
            });

    if (memberError) {

        console.error(memberError);

        showToast(
            memberError.message,
            "error"
        );

        return;
    }

    $("groupName").value = "";
    $("groupUsername").value = "";
    $("groupBio").value = "";

    hide(
        $("createGroupModal")
    );

    showToast(
        "Group created"
    );

    if (currentTab === "groups") {
        await loadGroups();
    }
}


/* =========================================================
   CREATE CHANNEL
   ========================================================= */

async function createChannel(event) {

    event?.preventDefault();

    const name =
        $("channelName")?.value.trim();

    const username =
        $("channelUsername")?.value
            .trim()
            .toLowerCase();

    const bio =
        $("channelBio")?.value.trim();

    if (!name || !username) {
        showToast(
            "Channel name and username are required",
            "error"
        );
        return;
    }

    if (!/^[a-z0-9_]{3,32}$/.test(username)) {
        showToast(
            "Invalid channel username",
            "error"
        );
        return;
    }

    const { data, error } =
        await supabase
            .from("channels")
            .insert({
                owner_id: currentUser.id,
                name,
                username,
                bio: bio || ""
            })
            .select()
            .single();

    if (error) {

        console.error(error);

        if (error.code === "23505") {
            showToast(
                "Channel username already exists",
                "error"
            );
        } else {
            showToast(
                error.message,
                "error"
            );
        }

        return;
    }

    const { error: memberError } =
        await supabase
            .from("channel_members")
            .insert({
                channel_id: data.id,
                user_id: currentUser.id,
                role: "owner"
            });

    if (memberError) {

        console.error(memberError);

        showToast(
            memberError.message,
            "error"
        );

        return;
    }

    $("channelName").value = "";
    $("channelUsername").value = "";
    $("channelBio").value = "";

    hide(
        $("createChannelModal")
    );

    showToast(
        "Channel created"
    );

    if (currentTab === "channels") {
        await loadChannels();
    }
}


/* =========================================================
   GROUPS
   ========================================================= */

async function loadGroups() {

    const list =
        $("userList");

    if (!list) return;

    const {
        data: memberships,
        error
    } = await supabase
        .from("group_members")
        .select(`
            group_id,
            role
        `)
        .eq(
            "user_id",
            currentUser.id
        );

    if (error) {
        console.error(error);
        return;
    }

    const ids =
        (memberships || [])
            .map(
                item => item.group_id
            );

    if (!ids.length) {

        list.innerHTML = `
            <div class="empty-state">
                No groups yet
            </div>
        `;

        return;
    }

    const {
        data: groups,
        error: groupError
    } = await supabase
        .from("groups")
        .select(`
            id,
            name,
            username,
            bio,
            avatar_url
        `)
        .in(
            "id",
            ids
        );

    if (groupError) {
        console.error(groupError);
        return;
    }

    list.innerHTML =
        (groups || [])
            .map(group => `

        <div
            class="user-item"
            data-group-id="${group.id}"
        >

            ${avatarHtml(
                {
                    full_name: group.name,
                    username: group.username,
                    avatar_url: group.avatar_url
                },
                "user-avatar"
            )}

            <div class="user-info">

                <strong>
                    ${escapeHtml(
                        group.name
                    )}
                </strong>

                <span>
                    @${escapeHtml(
                        group.username
                    )}
                </span>

            </div>

        </div>

    `).join("");

    list
        .querySelectorAll(
            "[data-group-id]"
        )
        .forEach(item => {

            item.addEventListener(
                "click",
                () => {

                    showToast(
                        "Group chat will be connected next"
                    );

                }
            );

        });
}


/* =========================================================
   CHANNELS
   ========================================================= */

async function loadChannels() {

    const list =
        $("userList");

    if (!list) return;

    const {
        data: memberships,
        error
    } = await supabase
        .from("channel_members")
        .select(`
            channel_id,
            role
        `)
        .eq(
            "user_id",
            currentUser.id
        );

    if (error) {
        console.error(error);
        return;
    }

    const ids =
        (memberships || [])
            .map(
                item => item.channel_id
            );

    if (!ids.length) {

        list.innerHTML = `
            <div class="empty-state">
                No channels yet
            </div>
        `;

        return;
    }

    const {
        data: channels,
        error: channelError
    } = await supabase
        .from("channels")
        .select(`
            id,
            name,
            username,
            bio,
            avatar_url
        `)
        .in(
            "id",
            ids
        );

    if (channelError) {
        console.error(channelError);
        return;
    }

    list.innerHTML =
        (channels || [])
            .map(channel => `

        <div
            class="user-item"
            data-channel-id="${channel.id}"
        >

            ${avatarHtml(
                {
                    full_name: channel.name,
                    username: channel.username,
                    avatar_url: channel.avatar_url
                },
                "user-avatar"
            )}

            <div class="user-info">

                <strong>
                    ${escapeHtml(
                        channel.name
                    )}
                </strong>

                <span>
                    @${escapeHtml(
                        channel.username
                    )}
                </span>

            </div>

        </div>

    `).join("");

    list
        .querySelectorAll(
            "[data-channel-id]"
        )
        .forEach(item => {

            item.addEventListener(
                "click",
                () => {

                    showToast(
                        "Channel view will be connected next"
                    );

                }
            );

        });
}


/* =========================================================
   TABS
   ========================================================= */

function setupTabs() {

    document
        .querySelectorAll(
            "[data-tab]"
        )
        .forEach(tab => {

            tab.addEventListener(
                "click",
                async () => {

                    document
                        .querySelectorAll(
                            "[data-tab]"
                        )
                        .forEach(item =>
                            item.classList.remove(
                                "active"
                            )
                        );

                    tab.classList.add(
                        "active"
                    );

                    currentTab =
                        tab.dataset.tab;

                    const searchInput =
                        $("searchInput");

                    if (searchInput) {
                        searchInput.value = "";
                    }

                    if (
                        currentTab === "groups"
                    ) {
                        await loadGroups();

                    } else if (
                        currentTab === "channels"
                    ) {
                        await loadChannels();

                    } else {
                        await loadDefaultList();
                    }

                }
            );

        });
}


/* =========================================================
   MOBILE
   ========================================================= */

function setupMobile() {

    const backBtn =
        $("mobileBackBtn");

    if (!backBtn) return;

    backBtn.addEventListener(
        "click",
        () => {

            document
                .querySelector(".app")
                ?.classList.remove(
                    "chat-open"
                );

            selectedUser = null;

        }
    );
}


/* =========================================================
   LOGOUT
   ========================================================= */

async function logout() {

    await supabase.auth.signOut();

    localStorage.removeItem(
        "messageAppLoggedIn"
    );

    localStorage.removeItem(
        "messageAppUser"
    );

    window.location.href =
        "index.html";
}


/* =========================================================
   REALTIME
   ========================================================= */

function setupRealtime() {

    if (realtimeChannel) {

        supabase.removeChannel(
            realtimeChannel
        );
    }

    realtimeChannel =
        supabase
            .channel(
                "msgbox-realtime"
            )

            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "messages"
                },
                async payload => {

                    const message =
                        payload.new ||
                        payload.old;

                    if (!message) return;

                    if (
                        selectedUser &&
                        (
                            (
                                message.sender_id ===
                                currentUser.id &&
                                message.receiver_id ===
                                selectedUser.id
                            )
                            ||
                            (
                                message.sender_id ===
                                selectedUser.id &&
                                message.receiver_id ===
                                currentUser.id
                            )
                        )
                    ) {

                        await loadMessages();
                    }
                }
            )

            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "contact_requests"
                },
                async payload => {

                    const request =
                        payload.new ||
                        payload.old;

                    if (!request) return;

                    if (
                        request.sender_id ===
                        currentUser.id ||
                        request.receiver_id ===
                        currentUser.id
                    ) {

                        if (
                            selectedUser &&
                            (
                                request.sender_id ===
                                selectedUser.id ||
                                request.receiver_id ===
                                selectedUser.id
                            )
                        ) {

                            await checkContactStatus();

                            if (
                                selectedContactStatus ===
                                "accepted"
                            ) {
                                await loadMessages();
                            } else {
                                renderWelcomeMessage();
                            }
                        }

                        await loadDefaultList();
                    }
                }
            )

            .subscribe(
                status => {
                    console.log(
                        "Realtime:",
                        status
                    );
                }
            );
}


/* =========================================================
   EVENT LISTENERS
   ========================================================= */

function setupEvents() {

    /* Search */

    const searchInput =
        $("searchInput");

    if (searchInput) {

        searchInput.addEventListener(
            "input",
            () => {

                clearTimeout(
                    searchTimer
                );

                searchTimer =
                    setTimeout(
                        async () => {

                            if (
                                currentTab !==
                                "chats"
                            ) {
                                return;
                            }

                            await searchUsers(
                                searchInput.value
                            );

                        },
                        300
                    );
            }
        );
    }


    /* Contact buttons */

    $("addContactBtn")
        ?.addEventListener(
            "click",
            sendContactRequest
        );

    $("acceptContactBtn")
        ?.addEventListener(
            "click",
            acceptContactRequest
        );

    $("declineContactBtn")
        ?.addEventListener(
            "click",
            declineContactRequest
        );


    /* Message */

    $("messageForm")
        ?.addEventListener(
            "submit",
            sendMessage
        );

    $("messageInput")
        ?.addEventListener(
            "keydown",
            event => {

                if (
                    event.key === "Enter" &&
                    !event.shiftKey
                ) {

                    event.preventDefault();

                    $("messageForm")
                        ?.requestSubmit();
                }

            }
        );


    /* Message edit/delete */

    setupMessageActions();


    /* Emoji */

    $("emojiBtn")
        ?.addEventListener(
            "click",
            toggleEmojiPanel
        );


    /* Image */

    $("imageBtn")
        ?.addEventListener(
            "click",
            () => {
                $("imageInput")?.click();
            }
        );

    $("imageInput")
        ?.addEventListener(
            "change",
            async event => {

                const file =
                    event.target.files?.[0];

                if (file) {
                    await sendImage(file);
                }

                event.target.value = "";
            }
        );


    /* Sticker */

    $("stickerBtn")
        ?.addEventListener(
            "click",
            () => {

                showToast(
                    "Sticker system will be connected next"
                );

            }
        );


    /* Settings */

    $("settingsBtn")
        ?.addEventListener(
            "click",
            openSettings
        );

    $("closeSettingsBtn")
        ?.addEventListener(
            "click",
            closeSettings
        );


    /* Profile */

    $("profileSettingsBtn")
        ?.addEventListener(
            "click",
            openProfileModal
        );

    $("closeProfileBtn")
        ?.addEventListener(
            "click",
            closeProfileModal
        );

    $("profileForm")
        ?.addEventListener(
            "submit",
            saveProfile
        );


    /* Avatar */

    $("profileAvatarInput")
        ?.addEventListener(
            "change",
            async event => {

                const file =
                    event.target.files?.[0];

                if (file) {
                    await uploadAvatar(file);
                }

                event.target.value = "";
            }
        );


    /* Logout */

    document
        .querySelectorAll(
            "[data-logout]"
        )
        .forEach(button => {

            button.addEventListener(
                "click",
                logout
            );

        });


    /* Owner */

    $("ownerPanelButton")
        ?.addEventListener(
            "click",
            openOwnerPanel
        );

    $("closeOwnerBtn")
        ?.addEventListener(
            "click",
            closeOwnerPanel
        );

    $("ownerVerifiedSearchBtn")
        ?.addEventListener(
            "click",
            ownerSearchVerified
        );

    $("ownerModerationSearchBtn")
        ?.addEventListener(
            "click",
            ownerSearchModeration
        );

    $("ownerAdminSearchBtn")
        ?.addEventListener(
            "click",
            ownerSearchAdmin
        );


    /* Admin */

    $("adminPanelButton")
        ?.addEventListener(
            "click",
            () => {

                if (
                    currentProfile?.role !==
                    "admin" &&
                    currentProfile?.role !==
                    "owner"
                ) {
                    return;
                }

                show(
                    $("adminModal")
                );

                loadOwnerReports();
            }
        );

    $("closeAdminBtn")
        ?.addEventListener(
            "click",
            () =>
                hide(
                    $("adminModal")
                )
        );

    $("adminModerationSearchBtn")
        ?.addEventListener(
            "click",
            adminSearchModeration
        );


    /* Create Group */

    $("createGroupBtn")
        ?.addEventListener(
            "click",
            () =>
                show(
                    $("createGroupModal")
                )
        );

    $("closeGroupBtn")
        ?.addEventListener(
            "click",
            () =>
                hide(
                    $("createGroupModal")
                )
        );

    $("groupForm")
        ?.addEventListener(
            "submit",
            createGroup
        );


    /* Create Channel */

    $("createChannelBtn")
        ?.addEventListener(
            "click",
            () =>
                show(
                    $("createChannelModal")
                )
        );

    $("closeChannelBtn")
        ?.addEventListener(
            "click",
            () =>
                hide(
                    $("createChannelModal")
                )
        );

    $("channelForm")
        ?.addEventListener(
            "submit",
            createChannel
        );


    /* Tabs */

    setupTabs();


    /* Mobile */

    setupMobile();


    /* Emoji */

    setupEmojiPanel();


    /* Close modals */

    document
        .querySelectorAll(
            ".modal"
        )
        .forEach(modal => {

            modal.addEventListener(
                "click",
                event => {

                    if (
                        event.target ===
                        modal
                    ) {
                        hide(modal);
                    }

                }
            );

        });
}


/* =========================================================
   INIT
   ========================================================= */

async function init() {

    const sessionOk =
        await checkSession();

    if (!sessionOk) return;

    await loadMyProfile();

    setupEvents();

    setupRealtime();

    await loadDefaultList();

    renderWelcomeMessage();

    console.log(
        "MsgBox V2 Dashboard loaded 🚀"
    );
}


/* =========================================================
   START
   ========================================================= */

document.addEventListener(
    "DOMContentLoaded",
    init
);
