/* =========================================================
   MEGCHATBOX - DASHBOARD MASTER JS
   Full client logic
   ========================================================= */

(() => {
    "use strict";

    /* =========================================================
       SUPABASE
       ========================================================= */

    const db =
        typeof supabaseClient !== "undefined"
            ? supabaseClient
            : window.supabaseClient;

    if (!db) {
        console.error("Supabase client not found.");
        return;
    }

    /* =========================================================
       GLOBAL STATE
       ========================================================= */

    let currentUser = null;
    let myProfile = null;

    let activeChatUser = null;
    let activeGroup = null;
    let activeChannel = null;

    let activeChatType = null; // direct | group | channel

    let allUsers = [];
    let allGroups = [];
    let allChannels = [];

    let myGroups = [];
    let myChannels = [];

    let currentMessages = [];

    let realtimeChannels = [];

    let editingMessage = null;
    let activeProfileUser = null;

    let currentTheme = localStorage.getItem("megchat_theme") || "dark";
    let currentDensity =
        localStorage.getItem("megchat_density") || "comfortable";

    let currentLanguage =
        localStorage.getItem("megchat_language") || "en";

    let holdTimer = null;
    let swipeState = null;

    /* =========================================================
       HELPERS
       ========================================================= */

    const $ = (selector) => document.querySelector(selector);
    const $$ = (selector) => [...document.querySelectorAll(selector)];

    function escapeHTML(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function escapeAttr(value) {
        return escapeHTML(value);
    }

    function formatDate(date) {
        if (!date) return "";

        const d = new Date(date);

        if (Number.isNaN(d.getTime())) return "";

        return d.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit"
        });
    }

    function formatLastSeen(date) {
        if (!date) return "Offline";

        const d = new Date(date);

        if (Number.isNaN(d.getTime())) return "Offline";

        return `last seen ${d.toLocaleString([], {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        })}`;
    }

    function normalizeUsername(value) {
        return String(value || "")
            .trim()
            .replace(/^@/, "")
            .toLowerCase();
    }

    function validUsername(value) {
        return /^[a-z0-9_]{3,32}$/.test(normalizeUsername(value));
    }

    function isOwn(id) {
        return !!currentUser && id === currentUser.id;
    }

    function showToast(message) {
        const toast = $("#toast");
        const toastMessage = $("#toastMessage");

        if (!toast) return;

        if (toastMessage) {
            toastMessage.textContent = message;
        }

        toast.classList.add("show");

        clearTimeout(showToast.timer);

        showToast.timer = setTimeout(() => {
            toast.classList.remove("show");
        }, 3000);
    }

    function closeModal(id) {
        const el = typeof id === "string" ? document.getElementById(id) : id;

        if (!el) return;

        el.classList.remove("show");
        el.classList.remove("active");

        if ("hidden" in el) {
            el.hidden = true;
        }
    }

    function openModal(id) {
        const el = typeof id === "string" ? document.getElementById(id) : id;

        if (!el) return;

        if ("hidden" in el) {
            el.hidden = false;
        }

        el.classList.add("show");
        el.classList.add("active");
    }

    function setText(id, value) {
        const el = document.getElementById(id);

        if (el) {
            el.textContent = value ?? "";
        }
    }

    function setValue(id, value) {
        const el = document.getElementById(id);

        if (el) {
            el.value = value ?? "";
        }
    }

    function getValue(id) {
        return document.getElementById(id)?.value?.trim() || "";
    }

    function isVerified(profile) {
        if (!profile?.is_verified) {
            return false;
        }

        if (!profile.verified_until) {
            return true;
        }

        return new Date(profile.verified_until).getTime() > Date.now();
    }

    function verifiedHTML(profile) {
        return isVerified(profile)
            ? `<span class="verified-badge" title="Verified">✓</span>`
            : "";
    }

    function avatarHTML(profile, extraClass = "") {
        if (!profile) {
            return `<div class="avatar ${extraClass}">?</div>`;
        }

        const name =
            profile.full_name ||
            profile.username ||
            "User";

        if (profile.avatar_url) {
            return `
                <div class="avatar ${extraClass}">
                    <img
                        src="${escapeAttr(profile.avatar_url)}"
                        alt=""
                    >
                </div>
            `;
        }

        return `
            <div class="avatar ${extraClass}">
                ${escapeHTML(name.charAt(0).toUpperCase())}
            </div>
        `;
    }

    function scrollMessages() {
        const box = $("#messages");

        if (!box) return;

        requestAnimationFrame(() => {
            box.scrollTop = box.scrollHeight;
        });
    }

    function safeError(error, fallback = "Something went wrong.") {
        console.error(error);

        if (error?.message) {
            console.error(error.message);
        }

        showToast(fallback);
    }

    /* =========================================================
       AUTH
       ========================================================= */

    async function loadCurrentUser() {
        const {
            data,
            error
        } = await db.auth.getUser();

        if (error || !data?.user) {
            window.location.href = "index.html";
            return false;
        }

        currentUser = data.user;

        return true;
    }

    async function loadMyProfile() {
        if (!currentUser) return null;

        const {
            data,
            error
        } = await db
            .from("profiles")
            .select("*")
            .eq("id", currentUser.id)
            .maybeSingle();

        if (error) {
            safeError(error, "Profile could not be loaded.");
            return null;
        }

        myProfile = data;

        return data;
    }

    /* =========================================================
       USERNAME UNIQUENESS
       ========================================================= */

    async function isUsernameAvailable(username, userId = null) {
        const value = normalizeUsername(username);

        if (!validUsername(value)) {
            return false;
        }

        const {
            data,
            error
        } = await db
            .from("profiles")
            .select("id,username")
            .eq("username", value)
            .maybeSingle();

        if (error) {
            console.error("Username check:", error);
            return false;
        }

        if (!data) {
            return true;
        }

        if (userId && data.id === userId) {
            return true;
        }

        return false;
    }

    async function updateUsername(userId, username) {
        const value = normalizeUsername(username);

        if (!validUsername(value)) {
            showToast(
                "Username: 3-32 ta belgi, faqat a-z, 0-9 va _."
            );
            return false;
        }

        const available = await isUsernameAvailable(
            value,
            userId
        );

        if (!available) {
            showToast("Bu username allaqachon ishlatilgan.");
            return false;
        }

        const {
            error
        } = await db
            .from("profiles")
            .update({
                username: value
            })
            .eq("id", userId);

        if (error) {
            console.error(error);

            if (
                error.code === "23505" ||
                String(error.message || "")
                    .toLowerCase()
                    .includes("duplicate")
            ) {
                showToast("Bu username allaqachon ishlatilgan.");
            } else {
                showToast("Username o‘zgartirilmadi.");
            }

            return false;
        }

        return true;
    }

    /* =========================================================
       PROFILE UI
       ========================================================= */

    function renderMyProfile() {
        if (!myProfile) return;

        const name = myProfile.full_name ||
            myProfile.username ||
            "User";

        setText("myName", name);
        setText(
            "myUsername",
            myProfile.username
                ? `@${myProfile.username}`
                : ""
        );

        const myVerified = $("#myVerified");

        if (myVerified) {
            myVerified.style.display =
                isVerified(myProfile)
                    ? "inline-flex"
                    : "none";
        }

        const myAvatar = $("#myAvatar");

        if (myAvatar) {
            if (myProfile.avatar_url) {
                myAvatar.innerHTML = `
                    <img
                        src="${escapeAttr(myProfile.avatar_url)}"
                        alt=""
                    >
                `;
            } else {
                myAvatar.textContent =
                    name.charAt(0).toUpperCase();
            }
        }

        setText(
            "profileNamePreview",
            name
        );
    }

    async function refreshMyProfile() {
        await loadMyProfile();
        renderMyProfile();
    }

    /* =========================================================
       SEARCH USERS
       ========================================================= */

    async function searchUsers(query = "") {
        query = normalizeUsername(query);

        let request = db
            .from("profiles")
            .select("*")
            .neq("id", currentUser.id)
            .limit(50);

        if (query) {
            request = request.ilike(
                "username",
                `%${query}%`
            );
        }

        const {
            data,
            error
        } = await request;

        if (error) {
            safeError(error, "Users could not be loaded.");
            return [];
        }

        allUsers = data || [];

        return allUsers;
    }

    /* =========================================================
       CONTACT REQUESTS
       ========================================================= */

    async function getContactStatus(userId) {
        if (!currentUser || !userId) return null;

        const {
            data: sent
        } = await db
            .from("contact_requests")
            .select("*")
            .eq("sender_id", currentUser.id)
            .eq("receiver_id", userId)
            .maybeSingle();

        if (sent) {
            return {
                ...sent,
                direction: "sent"
            };
        }

        const {
            data: received
        } = await db
            .from("contact_requests")
            .select("*")
            .eq("sender_id", userId)
            .eq("receiver_id", currentUser.id)
            .maybeSingle();

        if (received) {
            return {
                ...received,
                direction: "received"
            };
        }

        return null;
    }

    async function areContacts(userId) {
        if (!currentUser || !userId) return false;

        const {
            data
        } = await db
            .from("contact_requests")
            .select("id,status")
            .eq("status", "accepted")
            .or(
                `and(sender_id.eq.${currentUser.id},receiver_id.eq.${userId}),and(sender_id.eq.${userId},receiver_id.eq.${currentUser.id})`
            )
            .maybeSingle();

        return !!data;
    }

    async function sendContactRequest(userId) {
        if (!currentUser || !userId) return;

        if (userId === currentUser.id) {
            showToast("O‘zingizni contact qila olmaysiz.");
            return;
        }

        const already = await getContactStatus(userId);

        if (already?.status === "accepted") {
            showToast("Bu user allaqachon contact.");
            return;
        }

        if (
            already?.status === "pending" &&
            already.direction === "sent"
        ) {
            showToast("Request allaqachon yuborilgan.");
            return;
        }

        if (
            already?.status === "pending" &&
            already.direction === "received"
        ) {
            showToast("Sizga request yuborgan.");
            return;
        }

        const {
            error
        } = await db
            .from("contact_requests")
            .insert({
                sender_id: currentUser.id,
                receiver_id: userId,
                status: "pending"
            });

        if (error) {
            console.error(error);

            if (error.code === "23505") {
                showToast("Contact request allaqachon mavjud.");
            } else {
                showToast("Request yuborilmadi.");
            }

            return;
        }

        showToast("Contact request yuborildi.");

        await updateProfilePopupActions();
    }

    async function acceptContactRequest(requestId) {
        const {
            error
        } = await db
            .from("contact_requests")
            .update({
                status: "accepted"
            })
            .eq("id", requestId)
            .eq("receiver_id", currentUser.id);

        if (error) {
            safeError(error, "Request qabul qilinmadi.");
            return;
        }

        showToast("Contact qabul qilindi.");

        await loadUsers();
        await loadIncomingRequests();
    }

    async function declineContactRequest(requestId) {
        const {
            error
        } = await db
            .from("contact_requests")
            .update({
                status: "declined"
            })
            .eq("id", requestId)
            .eq("receiver_id", currentUser.id);

        if (error) {
            safeError(error, "Request rad etilmadi.");
            return;
        }

        showToast("Request rad etildi.");

        await loadIncomingRequests();
    }

    async function loadIncomingRequests() {
        if (!currentUser) return [];

        const {
            data,
            error
        } = await db
            .from("contact_requests")
            .select(`
                *,
                sender:profiles!contact_requests_sender_id_fkey(
                    id,
                    username,
                    full_name,
                    avatar_url,
                    is_verified,
                    verified_until
                )
            `)
            .eq("receiver_id", currentUser.id)
            .eq("status", "pending")
            .order("created_at", {
                ascending: false
            });

        if (error) {
            console.error("Requests:", error);
            return [];
        }

        renderIncomingRequests(data || []);

        return data || [];
    }

    function renderIncomingRequests(requests) {
        const list = $("#contactRequestsList");

        if (!list) return;

        if (!requests.length) {
            list.innerHTML = `
                <div class="empty-state">
                    No contact requests
                </div>
            `;
            return;
        }

        list.innerHTML = requests
            .map(req => {
                const sender = req.sender || {};

                return `
                    <div class="contact-request" data-id="${req.id}">
                        ${avatarHTML(sender)}

                        <div class="contact-request-info">
                            <strong>
                                ${escapeHTML(
                                    sender.full_name ||
                                    sender.username ||
                                    "User"
                                )}
                                ${verifiedHTML(sender)}
                            </strong>

                            <span>
                                @${escapeHTML(sender.username || "")}
                            </span>
                        </div>

                        <div class="contact-request-actions">
                            <button
                                class="accept-request"
                                data-id="${req.id}"
                            >
                                Accept
                            </button>

                            <button
                                class="decline-request"
                                data-id="${req.id}"
                            >
                                Decline
                            </button>
                        </div>
                    </div>
                `;
            })
            .join("");
    }

    /* =========================================================
       USERS SIDEBAR
       ========================================================= */

    async function loadUsers(query = "") {
        const users = await searchUsers(query);

        renderUsers(users);

        return users;
    }

    function renderUsers(users) {
        const list = $("#userList");

        if (!list) return;

        if (!users.length) {
            list.innerHTML = `
                <div class="empty-state">
                    No users found
                </div>
            `;
            return;
        }

        list.innerHTML = users
            .map(user => {
                const name =
                    user.full_name ||
                    user.username ||
                    "User";

                return `
                    <div
                        class="user-item"
                        data-user-id="${user.id}"
                    >
                        ${avatarHTML(user)}

                        <div class="user-item-info">
                            <div class="user-item-name">
                                ${escapeHTML(name)}
                                ${verifiedHTML(user)}
                            </div>

                            <div class="user-item-username">
                                @${escapeHTML(
                                    user.username || ""
                                )}
                            </div>
                        </div>
                    </div>
                `;
            })
            .join("");
    }

    /* =========================================================
       DIRECT CHAT
       ========================================================= */

    async function openDirectChat(userId) {
        if (!userId) return;

        const {
            data,
            error
        } = await db
            .from("profiles")
            .select("*")
            .eq("id", userId)
            .maybeSingle();

        if (error || !data) {
            showToast("User topilmadi.");
            return;
        }

        activeChatType = "direct";
        activeChatUser = data;
        activeGroup = null;
        activeChannel = null;

        setText(
            "chatName",
            data.full_name ||
            data.username ||
            "User"
        );

        const chatVerified = $("#chatVerified");

        if (chatVerified) {
            chatVerified.style.display =
                isVerified(data)
                    ? "inline-flex"
                    : "none";
        }

        const avatar = $("#chatAvatar");

        if (avatar) {
            if (data.avatar_url) {
                avatar.innerHTML = `
                    <img
                        src="${escapeAttr(data.avatar_url)}"
                        alt=""
                    >
                `;
            } else {
                avatar.textContent =
                    (
                        data.full_name ||
                        data.username ||
                        "U"
                    )
                        .charAt(0)
                        .toUpperCase();
            }
        }

        setText(
            "chatStatus",
            data.show_online === false
                ? ""
                : data.last_seen
                    ? formatLastSeen(data.last_seen)
                    : "Offline"
        );

        const active = $("#activeChat");
        const empty = $("#chatEmpty");

        if (active) active.style.display = "flex";
        if (empty) empty.style.display = "none";

        await updateProfilePopupActions();
        await updateContactButtons();

        const contacts = await areContacts(userId);

        const messageForm = $("#messageForm");

        if (messageForm) {
            messageForm.style.display =
                contacts ? "flex" : "none";
        }

        if (!contacts) {
            renderMessages([]);
            return;
        }

        await loadDirectMessages();

        closeMobileSidebar();
    }

    async function loadDirectMessages() {
        if (!currentUser || !activeChatUser) return;

        const {
            data,
            error
        } = await db
            .from("messages")
            .select("*")
            .or(
                `and(sender_id.eq.${currentUser.id},receiver_id.eq.${activeChatUser.id}),and(sender_id.eq.${activeChatUser.id},receiver_id.eq.${currentUser.id})`
            )
            .order("created_at", {
                ascending: true
            });

        if (error) {
            safeError(error, "Messages could not be loaded.");
            return;
        }

        currentMessages = data || [];

        renderMessages(currentMessages);

        await markDirectMessagesSeen();
    }

    function messageTextHTML(message) {
        if (message.deleted_at) {
            return `
                <span class="deleted-message">
                    Message deleted
                </span>
            `;
        }

        if (message.message_type === "image" && message.image_url) {
            return `
                <img
                    class="message-image"
                    src="${escapeAttr(message.image_url)}"
                    alt="image"
                    loading="lazy"
                >
                ${
                    message.content
                        ? `<div>${escapeHTML(message.content)}</div>`
                        : ""
                }
            `;
        }

        if (
            message.message_type === "sticker" &&
            message.sticker_url
        ) {
            return `
                <img
                    class="message-sticker"
                    src="${escapeAttr(message.sticker_url)}"
                    alt="sticker"
                >
            `;
        }

        return escapeHTML(message.content || "")
            .replace(/\n/g, "<br>");
    }

    function messageActionHTML(message, type = "direct") {
        const mine = isOwn(message.sender_id);

        return `
            <div class="message-actions">
                <button
                    type="button"
                    class="message-action"
                    data-action="save"
                    title="Save"
                >
                    <i class="fa-regular fa-bookmark"></i>
                </button>

                ${
                    mine
                        ? `
                            <button
                                type="button"
                                class="message-action"
                                data-action="edit"
                                title="Edit"
                            >
                                <i class="fa-solid fa-pen"></i>
                            </button>

                            <button
                                type="button"
                                class="message-action"
                                data-action="delete"
                                title="Delete"
                            >
                                <i class="fa-solid fa-trash"></i>
                            </button>
                        `
                        : ""
                }
            </div>
        `;
    }

    function renderMessages(messages) {
        const box = $("#messages");

        if (!box) return;

        if (!messages.length) {
            box.innerHTML = `
                <div class="empty-state messages-empty">
                    No messages yet
                </div>
            `;
            return;
        }

        box.innerHTML = messages
            .map(message => {
                const mine = isOwn(message.sender_id);

                return `
                    <div
                        class="message-row ${mine ? "mine" : "theirs"}"
                        data-message-id="${message.id}"
                    >
                        <div
                            class="message-wrapper"
                            data-message-id="${message.id}"
                            data-message-type="direct"
                        >
                            ${messageActionHTML(message)}

                            <div class="message-bubble">
                                <div class="message-content">
                                    ${messageTextHTML(message)}
                                </div>

                                <div class="message-meta">
                                    <span>
                                        ${formatDate(
                                            message.created_at
                                        )}
                                    </span>

                                    ${
                                        message.edited_at &&
                                        !message.deleted_at
                                            ? `
                                                <span>
                                                    edited
                                                </span>
                                            `
                                            : ""
                                    }

                                    ${
                                        mine
                                            ? message.seen_at
                                                ? `<span>✓✓</span>`
                                                : message.delivered_at
                                                    ? `<span>✓</span>`
                                                    : `<span>•</span>`
                                            : ""
                                    }
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            })
            .join("");

        initializeMessageSwipes();

        scrollMessages();
    }

    /* =========================================================
       DIRECT SEND
       ========================================================= */

    async function sendDirectMessage(event) {
        event?.preventDefault();

        if (
            !currentUser ||
            !activeChatUser ||
            activeChatType !== "direct"
        ) {
            return;
        }

        const content = getValue("messageInput");

        if (!content) return;

        const contacts =
            await areContacts(activeChatUser.id);

        if (!contacts) {
            showToast(
                "Avval contact request qabul qilinishi kerak."
            );
            return;
        }

        if (await isMessagingBlocked()) {
            return;
        }

        const {
            error
        } = await db
            .from("messages")
            .insert({
                sender_id: currentUser.id,
                receiver_id: activeChatUser.id,
                content,
                message_type: "text"
            });

        if (error) {
            safeError(error, "Message yuborilmadi.");
            return;
        }

        setValue("messageInput", "");

        await loadDirectMessages();
    }

    async function isMessagingBlocked() {
        if (!myProfile) return false;

        if (myProfile.messaging_blocked !== true) {
            return false;
        }

        if (!myProfile.messaging_blocked_until) {
            showToast("Messaging bloklangan.");
            return true;
        }

        const until =
            new Date(
                myProfile.messaging_blocked_until
            ).getTime();

        if (until > Date.now()) {
            showToast(
                `Messaging bloklangan: ${new Date(
                    until
                ).toLocaleString()}`
            );

            return true;
        }

        return false;
    }

    /* =========================================================
       IMAGE MESSAGE
       ========================================================= */

    async function uploadChatImage(file) {
        if (!file || !currentUser) return;

        if (
            !activeChatUser &&
            !activeGroup &&
            !activeChannel
        ) {
            return;
        }

        const ext =
            file.name.split(".").pop()?.toLowerCase() ||
            "jpg";

        const path =
            `${currentUser.id}/${Date.now()}-${crypto.randomUUID()}.${ext}`;

        const {
            error: uploadError
        } = await db.storage
            .from("chat-media")
            .upload(path, file, {
                upsert: false,
                contentType: file.type
            });

        if (uploadError) {
            safeError(
                uploadError,
                "Image upload failed."
            );
            return;
        }

        const {
            data
        } = db.storage
            .from("chat-media")
            .getPublicUrl(path);

        const url = data?.publicUrl;

        if (!url) {
            showToast("Image URL topilmadi.");
            return;
        }

        if (activeChatType === "direct") {
            const {
                error
            } = await db
                .from("messages")
                .insert({
                    sender_id: currentUser.id,
                    receiver_id: activeChatUser.id,
                    content: "",
                    message_type: "image",
                    image_url: url
                });

            if (error) {
                safeError(error, "Image yuborilmadi.");
                return;
            }

            await loadDirectMessages();
        }

        if (activeChatType === "group") {
            await sendGroupMessage("", "image", url);
        }

        if (activeChatType === "channel") {
            await sendChannelMessage("", "image", url);
        }
    }

    /* =========================================================
       MESSAGE EDIT
       ========================================================= */

    async function editMessage(messageId) {
        const message =
            currentMessages.find(
                m => String(m.id) === String(messageId)
            );

        if (!message) return;

        if (!isOwn(message.sender_id)) {
            showToast("Faqat o‘z messagingizni edit qila olasiz.");
            return;
        }

        if (message.deleted_at) {
            return;
        }

        const oldText = message.content || "";

        const newText = prompt(
            "Edit message:",
            oldText
        );

        if (newText === null) return;

        const content = newText.trim();

        if (!content) {
            showToast("Message bo‘sh bo‘lishi mumkin emas.");
            return;
        }

        if (activeChatType === "direct") {
            const {
                error
            } = await db
                .from("messages")
                .update({
                    content,
                    edited_at: new Date().toISOString()
                })
                .eq("id", messageId)
                .eq("sender_id", currentUser.id);

            if (error) {
                safeError(error, "Message edit qilinmadi.");
                return;
            }

            await loadDirectMessages();
        }

        closeAllSwipedMessages();
    }

    /* =========================================================
       MESSAGE DELETE
       ========================================================= */

    async function deleteMessage(messageId) {
        const message =
            currentMessages.find(
                m => String(m.id) === String(messageId)
            );

        if (!message) return;

        if (!isOwn(message.sender_id)) {
            showToast("Faqat o‘z messagingizni o‘chira olasiz.");
            return;
        }

        const ok = confirm(
            "Bu message o‘chirilsinmi?"
        );

        if (!ok) return;

        if (activeChatType === "direct") {
            const {
                error
            } = await db
                .from("messages")
                .update({
                    deleted_at: new Date().toISOString(),
                    content: ""
                })
                .eq("id", messageId)
                .eq("sender_id", currentUser.id);

            if (error) {
                safeError(error, "Message o‘chirilmadi.");
                return;
            }

            await loadDirectMessages();
        }

        closeAllSwipedMessages();
    }

    /* =========================================================
       SAVE MESSAGE
       ========================================================= */

    async function saveMessage(message, sourceType = "direct") {
        if (!currentUser || !message) return;

        const {
            error
        } = await db
            .from("saved_messages")
            .insert({
                user_id: currentUser.id,
                message_id: message.id,
                message_type: sourceType,
                content: message.content || "",
                saved_at: new Date().toISOString()
            });

        if (error) {
            if (error.code === "23505") {
                showToast("Message allaqachon saved.");
            } else {
                console.error(error);
                showToast("Message saqlanmadi.");
            }

            return;
        }

        showToast("Message saved.");
        closeAllSwipedMessages();
    }

    async function loadSavedMessages() {
        const list = $("#savedMessagesList");

        if (!list || !currentUser) return;

        const {
            data,
            error
        } = await db
            .from("saved_messages")
            .select("*")
            .eq("user_id", currentUser.id)
            .order("saved_at", {
                ascending: false
            });

        if (error) {
            console.error(error);
            return;
        }

        if (!data?.length) {
            list.innerHTML = `
                <div class="empty-state">
                    No saved messages
                </div>
            `;
            return;
        }

        list.innerHTML = data
            .map(item => `
                <div class="saved-message-item">
                    <div class="saved-message-content">
                        ${escapeHTML(item.content || "")}
                    </div>

                    <small>
                        ${formatDate(item.saved_at)}
                    </small>
                </div>
            `)
            .join("");
    }

    /* =========================================================
       SWIPE / HOLD MESSAGE ACTIONS
       ========================================================= */

    function closeAllSwipedMessages(except = null) {
        $$(".message-wrapper.swiped").forEach(wrapper => {
            if (wrapper !== except) {
                wrapper.classList.remove("swiped");
            }
        });
    }

    function initializeMessageSwipes() {
        $$(".message-wrapper").forEach(
            setupMessageSwipe
        );
    }

    function setupMessageSwipe(wrapper) {
        if (wrapper.dataset.swipeReady === "true") {
            return;
        }

        wrapper.dataset.swipeReady = "true";

        let startX = 0;
        let startY = 0;
        let holding = false;
        let moved = false;

        const start = event => {
            if (
                event.target.closest(
                    ".message-action"
                )
            ) {
                return;
            }

            const point =
                event.touches?.[0] ||
                event;

            startX = point.clientX;
            startY = point.clientY;
            moved = false;
            holding = false;

            clearTimeout(holdTimer);

            holdTimer = setTimeout(() => {
                holding = true;
            }, 450);
        };

        const move = event => {
            if (!holding) return;

            const point =
                event.touches?.[0] ||
                event;

            const deltaX =
                point.clientX - startX;

            const deltaY =
                point.clientY - startY;

            if (Math.abs(deltaY) > Math.abs(deltaX)) {
                return;
            }

            if (deltaX >= 0) {
                return;
            }

            moved = true;

            const distance =
                Math.min(
                    100,
                    Math.max(0, Math.abs(deltaX))
                );

            wrapper.style.transform =
                `translateX(-${distance}px)`;
        };

        const end = event => {
            clearTimeout(holdTimer);

            if (!holding || !moved) {
                wrapper.style.transform = "";
                return;
            }

            const point =
                event.changedTouches?.[0] ||
                event;

            const deltaX =
                point.clientX - startX;

            wrapper.style.transform = "";

            if (deltaX <= -60) {
                closeAllSwipedMessages(wrapper);
                wrapper.classList.add("swiped");
            }
        };

        wrapper.addEventListener(
            "touchstart",
            start,
            { passive: true }
        );

        wrapper.addEventListener(
            "touchmove",
            move,
            { passive: true }
        );

        wrapper.addEventListener(
            "touchend",
            end
        );

        wrapper.addEventListener(
            "pointerdown",
            start
        );

        wrapper.addEventListener(
            "pointermove",
            move
        );

        wrapper.addEventListener(
            "pointerup",
            end
        );

        wrapper.addEventListener(
            "pointercancel",
            () => {
                clearTimeout(holdTimer);
                wrapper.style.transform = "";
            }
        );
    }

    /* =========================================================
       MESSAGE ACTION EVENTS
       ========================================================= */

    async function handleMessageAction(event) {
        const button =
            event.target.closest(
                ".message-action"
            );

        if (!button) return;

        const wrapper =
            button.closest(".message-wrapper");

        if (!wrapper) return;

        const id =
            wrapper.dataset.messageId;

        const action =
            button.dataset.action;

        const message =
            currentMessages.find(
                m => String(m.id) === String(id)
            );

        if (!message) return;

        if (action === "save") {
            await saveMessage(
                message,
                wrapper.dataset.messageType || "direct"
            );
        }

        if (action === "edit") {
            await editMessage(id);
        }

        if (action === "delete") {
            await deleteMessage(id);
        }
    }

    /* =========================================================
       GROUPS
       ========================================================= */

    async function loadGroups(query = "") {
        let request = db
            .from("groups")
            .select("*")
            .order("created_at", {
                ascending: false
            })
            .limit(100);

        if (query) {
            request = request.or(
                `name.ilike.%${query}%,username.ilike.%${query}%`
            );
        }

        const {
            data,
            error
        } = await request;

        if (error) {
            console.error("Groups:", error);
            return [];
        }

        allGroups = data || [];

        renderGroups(allGroups);

        await loadMyGroups();

        return allGroups;
    }

    async function loadMyGroups() {
        if (!currentUser) return [];

        const {
            data,
            error
        } = await db
            .from("group_members")
            .select(`
                group_id,
                role,
                groups(*)
            `)
            .eq("user_id", currentUser.id);

        if (error) {
            console.error("My groups:", error);
            return [];
        }

        myGroups = (data || [])
            .map(row => ({
                ...(row.groups || {}),
                member_role: row.role
            }))
            .filter(Boolean);

        renderGroups(allGroups);

        return myGroups;
    }

    function isGroupMember(groupId) {
        return myGroups.some(
            group =>
                String(group.id) ===
                String(groupId)
        );
    }

    function renderGroups(groups) {
        const list = $("#groupsList");

        if (!list) return;

        if (!groups.length) {
            list.innerHTML = `
                <div class="empty-state">
                    No groups found
                </div>
            `;
            return;
        }

        list.innerHTML = groups
            .map(group => {
                const joined =
                    isGroupMember(group.id);

                return `
                    <div
                        class="group-item"
                        data-group-id="${group.id}"
                    >
                        ${
                            group.avatar_url
                                ? `
                                    <img
                                        class="avatar"
                                        src="${escapeAttr(group.avatar_url)}"
                                        alt=""
                                    >
                                `
                                : `
                                    <div class="avatar">
                                        ${escapeHTML(
                                            (
                                                group.name ||
                                                "G"
                                            )
                                                .charAt(0)
                                                .toUpperCase()
                                        )}
                                    </div>
                                `
                        }

                        <div class="group-item-info">
                            <strong>
                                ${escapeHTML(group.name || "")}
                            </strong>

                            <span>
                                @${escapeHTML(
                                    group.username || ""
                                )}
                            </span>
                        </div>

                        <button
                            class="group-open-btn"
                            data-group-id="${group.id}"
                        >
                            ${joined ? "Open" : "Join"}
                        </button>
                    </div>
                `;
            })
            .join("");
    }

    async function createGroup(event) {
        event?.preventDefault();

        const name = getValue("groupName");
        const username =
            normalizeUsername(
                getValue("groupUsername")
            );

        const bio = getValue("groupBio");

        if (!name) {
            showToast("Group name kerak.");
            return;
        }

        if (!validUsername(username)) {
            showToast(
                "Group username noto‘g‘ri."
            );
            return;
        }

        const {
            data,
            error
        } = await db.rpc(
            "create_group",
            {
                p_name: name,
                p_username: username,
                p_bio: bio
            }
        );

        if (error) {
            console.error(error);

            if (error.code === "23505") {
                showToast(
                    "Bu group username allaqachon ishlatilgan."
                );
            } else {
                showToast(
                    error.message ||
                    "Group yaratilmadi."
                );
            }

            return;
        }

        showToast("Group yaratildi.");

        closeModal("createGroupModal");

        setValue("groupName", "");
        setValue("groupUsername", "");
        setValue("groupBio", "");

        await loadGroups();
    }

    async function openGroup(groupId) {
        const {
            data,
            error
        } = await db
            .from("groups")
            .select("*")
            .eq("id", groupId)
            .maybeSingle();

        if (error || !data) {
            showToast("Group topilmadi.");
            return;
        }

        activeChatType = "group";
        activeGroup = data;
        activeChatUser = null;
        activeChannel = null;

        setText(
            "chatName",
            data.name || "Group"
        );

        setText(
            "chatStatus",
            data.is_public
                ? "Public group"
                : "Private group"
        );

        setText(
            "chatVerified",
            ""
        );

        const joined =
            isGroupMember(groupId);

        if (!joined) {
            renderJoinRequired(
                "group",
                data
            );
            return;
        }

        showChatComposer(true);

        await loadGroupMessages(groupId);

        closeMobileSidebar();
    }

    function renderJoinRequired(type, entity) {
        const box = $("#messages");

        if (!box) return;

        const title =
            type === "group"
                ? "Group"
                : "Channel";

        box.innerHTML = `
            <div class="join-required">
                <div class="join-required-title">
                    ${escapeHTML(
                        entity.name || title
                    )}
                </div>

                <div class="join-required-text">
                    You need to join this ${title.toLowerCase()}
                    before messaging.
                </div>

                <button
                    type="button"
                    id="joinCurrentEntityBtn"
                >
                    Join
                </button>
            </div>
        `;

        const btn =
            $("#joinCurrentEntityBtn");

        if (btn) {
            btn.addEventListener(
                "click",
                () => {
                    if (type === "group") {
                        openModal("joinGroupModal");
                    } else {
                        openModal("joinChannelModal");
                    }
                },
                { once: true }
            );
        }

        showChatComposer(false);
    }

    async function joinGroup(event) {
        event?.preventDefault();

        const code =
            getValue("groupInviteInput");

        if (!code) {
            showToast("Invite code kiriting.");
            return;
        }

        const {
            error
        } = await db.rpc(
            "join_group_by_invite",
            {
                p_invite_code: code
            }
        );

        if (error) {
            safeError(
                error,
                "Groupga qo‘shilib bo‘lmadi."
            );
            return;
        }

        showToast("Groupga qo‘shildingiz.");

        closeModal("joinGroupModal");

        setValue("groupInviteInput", "");

        await loadGroups();

        if (activeGroup) {
            await openGroup(activeGroup.id);
        }
    }

    async function loadGroupMessages(groupId) {
        const {
            data,
            error
        } = await db
            .from("group_messages")
            .select("*")
            .eq("group_id", groupId)
            .order("created_at", {
                ascending: true
            });

        if (error) {
            safeError(
                error,
                "Group messages yuklanmadi."
            );
            return;
        }

        currentMessages = data || [];

        renderGroupMessages(currentMessages);
    }

    function renderGroupMessages(messages) {
        const box = $("#messages");

        if (!box) return;

        if (!messages.length) {
            box.innerHTML = `
                <div class="empty-state">
                    No messages yet
                </div>
            `;
            return;
        }

        box.innerHTML = messages
            .map(message => {
                const mine =
                    isOwn(message.sender_id);

                return `
                    <div
                        class="message-row ${mine ? "mine" : "theirs"}"
                        data-message-id="${message.id}"
                    >
                        <div
                            class="message-wrapper"
                            data-message-id="${message.id}"
                            data-message-type="group"
                        >
                            ${messageActionHTML(message, "group")}

                            <div class="message-bubble">
                                <div class="message-content">
                                    ${messageTextHTML(message)}
                                </div>

                                <div class="message-meta">
                                    ${formatDate(
                                        message.created_at
                                    )}

                                    ${
                                        message.edited_at
                                            ? " · edited"
                                            : ""
                                    }
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            })
            .join("");

        initializeMessageSwipes();

        scrollMessages();
    }

    async function sendGroupMessage(
        content = null,
        type = "text",
        imageUrl = null
    ) {
        if (!activeGroup) return;

        if (!isGroupMember(activeGroup.id)) {
            showToast(
                "Avval groupga qo‘shiling."
            );
            return;
        }

        if (content === null) {
            content =
                getValue("messageInput");
        }

        if (
            type === "text" &&
            !String(content || "").trim()
        ) {
            return;
        }

        const {
            error
        } = await db
            .from("group_messages")
            .insert({
                group_id: activeGroup.id,
                sender_id: currentUser.id,
                content: content || "",
                message_type: type,
                image_url: imageUrl
            });

        if (error) {
            safeError(
                error,
                "Group message yuborilmadi."
            );
            return;
        }

        setValue("messageInput", "");

        await loadGroupMessages(
            activeGroup.id
        );
    }

    /* =========================================================
       GROUP INFO
       ========================================================= */

    async function openGroupInfo(group = activeGroup) {
        if (!group) return;

        setText(
            "groupInfoName",
            group.name || ""
        );

        setText(
            "groupInfoUsername",
            group.username
                ? `@${group.username}`
                : ""
        );

        setText(
            "groupInfoBio",
            group.bio || ""
        );

        const inviteBtn =
            $("#groupInviteBtn");

        if (inviteBtn) {
            inviteBtn.onclick =
                () => createGroupInvite(
                    group.id
                );
        }

        const membersBtn =
            $("#groupMembersBtn");

        if (membersBtn) {
            membersBtn.onclick =
                () => loadGroupMembers(
                    group.id
                );
        }

        const leaveBtn =
            $("#leaveGroupBtn");

        if (leaveBtn) {
            leaveBtn.onclick =
                () => leaveGroup(
                    group.id
                );
        }

        openModal("groupInfoModal");
    }

    async function createGroupInvite(groupId) {
        const code =
            `${Math.random()
                .toString(36)
                .slice(2, 10)}${Date.now()
                .toString(36)
                .slice(-5)}`;

        const {
            error
        } = await db
            .from("group_invites")
            .insert({
                group_id: groupId,
                invite_code: code,
                created_by: currentUser.id
            });

        if (error) {
            safeError(
                error,
                "Invite yaratilmadi."
            );
            return;
        }

        await copyText(code);

        showToast(
            `Invite code: ${code}`
        );
    }

    async function loadGroupMembers(groupId) {
        const {
            data,
            error
        } = await db
            .from("group_members")
            .select(`
                *,
                profile:profiles(
                    id,
                    username,
                    full_name,
                    avatar_url,
                    is_verified,
                    verified_until
                )
            `)
            .eq("group_id", groupId);

        if (error) {
            safeError(
                error,
                "Members yuklanmadi."
            );
            return;
        }

        setText(
            "membersTitle",
            "Group members"
        );

        const list =
            $("#membersList");

        if (!list) return;

        list.innerHTML =
            (data || [])
                .map(member => {
                    const profile =
                        member.profile || {};

                    return `
                        <div class="member-item">
                            ${avatarHTML(profile)}

                            <div>
                                <strong>
                                    ${escapeHTML(
                                        profile.full_name ||
                                        profile.username ||
                                        "User"
                                    )}
                                    ${verifiedHTML(profile)}
                                </strong>

                                <small>
                                    @${escapeHTML(
                                        profile.username || ""
                                    )}
                                    ·
                                    ${escapeHTML(
                                        member.role || "member"
                                    )}
                                </small>
                            </div>
                        </div>
                    `;
                })
                .join("");

        openModal("membersModal");
    }

    async function leaveGroup(groupId) {
        const ok =
            confirm(
                "Groupdan chiqilsinmi?"
            );

        if (!ok) return;

        const {
            error
        } = await db
            .from("group_members")
            .delete()
            .eq("group_id", groupId)
            .eq("user_id", currentUser.id);

        if (error) {
            safeError(
                error,
                "Groupdan chiqib bo‘lmadi."
            );
            return;
        }

        showToast("Groupdan chiqdingiz.");

        activeGroup = null;
        activeChatType = null;

        await loadGroups();

        showEmptyChat();
    }

    /* =========================================================
       CHANNELS
       ========================================================= */

    async function loadChannels(query = "") {
        let request = db
            .from("channels")
            .select("*")
            .order("created_at", {
                ascending: false
            })
            .limit(100);

        if (query) {
            request = request.or(
                `name.ilike.%${query}%,username.ilike.%${query}%`
            );
        }

        const {
            data,
            error
        } = await request;

        if (error) {
            console.error("Channels:", error);
            return [];
        }

        allChannels = data || [];

        await loadMyChannels();

        renderChannels(allChannels);

        return allChannels;
    }

    async function loadMyChannels() {
        const {
            data,
            error
        } = await db
            .from("channel_members")
            .select(`
                channel_id,
                role,
                channels(*)
            `)
            .eq("user_id", currentUser.id);

        if (error) {
            console.error(error);
            return [];
        }

        myChannels =
            (data || [])
                .map(row => ({
                    ...(row.channels || {}),
                    member_role: row.role
                }))
                .filter(Boolean);

        return myChannels;
    }

    function isChannelMember(channelId) {
        return myChannels.some(
            channel =>
                String(channel.id) ===
                String(channelId)
        );
    }

    function isChannelWriter(channelId) {
        const channel =
            myChannels.find(
                c =>
                    String(c.id) ===
                    String(channelId)
            );

        if (!channel) return false;

        return [
            "owner",
            "admin",
            "moderator",
            "writer"
        ].includes(
            String(channel.member_role)
        );
    }

    function renderChannels(channels) {
        const list =
            $("#channelsList");

        if (!list) return;

        if (!channels.length) {
            list.innerHTML = `
                <div class="empty-state">
                    No channels found
                </div>
            `;
            return;
        }

        list.innerHTML =
            channels
                .map(channel => {
                    const joined =
                        isChannelMember(
                            channel.id
                        );

                    return `
                        <div
                            class="channel-item"
                            data-channel-id="${channel.id}"
                        >
                            ${
                                channel.avatar_url
                                    ? `
                                        <img
                                            class="avatar"
                                            src="${escapeAttr(
                                                channel.avatar_url
                                            )}"
                                            alt=""
                                        >
                                    `
                                    : `
                                        <div class="avatar">
                                            ${escapeHTML(
                                                (
                                                    channel.name ||
                                                    "C"
                                                )
                                                    .charAt(0)
                                                    .toUpperCase()
                                            )}
                                        </div>
                                    `
                            }

                            <div class="channel-item-info">
                                <strong>
                                    ${escapeHTML(
                                        channel.name || ""
                                    )}
                                </strong>

                                <span>
                                    @${escapeHTML(
                                        channel.username || ""
                                    )}
                                </span>
                            </div>

                            <button
                                class="channel-open-btn"
                                data-channel-id="${channel.id}"
                            >
                                ${joined ? "Open" : "Join"}
                            </button>
                        </div>
                    `;
                })
                .join("");
    }

    async function createChannel(event) {
        event?.preventDefault();

        const name =
            getValue("channelName");

        const username =
            normalizeUsername(
                getValue("channelUsername")
            );

        const bio =
            getValue("channelBio");

        if (!name) {
            showToast("Channel name kerak.");
            return;
        }

        if (!validUsername(username)) {
            showToast(
                "Channel username noto‘g‘ri."
            );
            return;
        }

        const {
            data,
            error
        } = await db.rpc(
            "create_channel",
            {
                p_name: name,
                p_username: username,
                p_bio: bio
            }
        );

        if (error) {
            console.error(error);

            if (error.code === "23505") {
                showToast(
                    "Bu channel username allaqachon ishlatilgan."
                );
            } else {
                showToast(
                    error.message ||
                    "Channel yaratilmadi."
                );
            }

            return;
        }

        showToast("Channel yaratildi.");

        closeModal(
            "createChannelModal"
        );

        setValue("channelName", "");
        setValue("channelUsername", "");
        setValue("channelBio", "");

        await loadChannels();
    }

    async function openChannel(channelId) {
        const {
            data,
            error
        } = await db
            .from("channels")
            .select("*")
            .eq("id", channelId)
            .maybeSingle();

        if (error || !data) {
            showToast("Channel topilmadi.");
            return;
        }

        activeChatType = "channel";
        activeChannel = data;
        activeGroup = null;
        activeChatUser = null;

        setText(
            "chatName",
            data.name || "Channel"
        );

        setText(
            "chatStatus",
            data.is_public
                ? "Public channel"
                : "Private channel"
        );

        const joined =
            isChannelMember(channelId);

        if (!joined) {
            renderJoinRequired(
                "channel",
                data
            );
            return;
        }

        const writer =
            isChannelWriter(channelId);

        showChatComposer(writer);

        await loadChannelMessages(
            channelId
        );

        closeMobileSidebar();
    }

    async function joinChannel(event) {
        event?.preventDefault();

        const code =
            getValue("channelInviteInput");

        if (!code) {
            showToast(
                "Invite code kiriting."
            );
            return;
        }

        const {
            error
        } = await db.rpc(
            "join_channel_by_invite",
            {
                p_invite_code: code
            }
        );

        if (error) {
            safeError(
                error,
                "Channelga qo‘shilib bo‘lmadi."
            );
            return;
        }

        showToast(
            "Channelga qo‘shildingiz."
        );

        closeModal(
            "joinChannelModal"
        );

        setValue(
            "channelInviteInput",
            ""
        );

        await loadChannels();

        if (activeChannel) {
            await openChannel(
                activeChannel.id
            );
        }
    }

    async function loadChannelMessages(channelId) {
        const {
            data,
            error
        } = await db
            .from("channel_messages")
            .select("*")
            .eq("channel_id", channelId)
            .order("created_at", {
                ascending: true
            });

        if (error) {
            safeError(
                error,
                "Channel messages yuklanmadi."
            );
            return;
        }

        currentMessages = data || [];

        renderChannelMessages(
            currentMessages
        );
    }

    function renderChannelMessages(messages) {
        const box = $("#messages");

        if (!box) return;

        if (!messages.length) {
            box.innerHTML = `
                <div class="empty-state">
                    No messages yet
                </div>
            `;
            return;
        }

        box.innerHTML =
            messages
                .map(message => {
                    const mine =
                        isOwn(message.sender_id);

                    return `
                        <div
                            class="message-row ${mine ? "mine" : "theirs"}"
                            data-message-id="${message.id}"
                        >
                            <div
                                class="message-wrapper"
                                data-message-id="${message.id}"
                                data-message-type="channel"
                            >
                                ${messageActionHTML(
                                    message,
                                    "channel"
                                )}

                                <div class="message-bubble">
                                    <div class="message-content">
                                        ${messageTextHTML(
                                            message
                                        )}
                                    </div>

                                    <div class="message-meta">
                                        ${formatDate(
                                            message.created_at
                                        )}

                                        ${
                                            message.edited_at
                                                ? " · edited"
                                                : ""
                                        }
                                    </div>
                                </div>
                            </div>
                        </div>
                    `;
                })
                .join("");

        initializeMessageSwipes();

        scrollMessages();
    }

    async function sendChannelMessage(
        content = null,
        type = "text",
        imageUrl = null
    ) {
        if (!activeChannel) return;

        if (
            !isChannelWriter(
                activeChannel.id
            )
        ) {
            showToast(
                "Siz channelga message yubora olmaysiz."
            );
            return;
        }

        if (content === null) {
            content =
                getValue("messageInput");
        }

        if (
            type === "text" &&
            !String(content || "").trim()
        ) {
            return;
        }

        const {
            error
        } = await db
            .from("channel_messages")
            .insert({
                channel_id: activeChannel.id,
                sender_id: currentUser.id,
                content: content || "",
                message_type: type,
                image_url: imageUrl
            });

        if (error) {
            safeError(
                error,
                "Channel message yuborilmadi."
            );
            return;
        }

        setValue("messageInput", "");

        await loadChannelMessages(
            activeChannel.id
        );
    }

    async function openChannelInfo(channel = activeChannel) {
        if (!channel) return;

        setText(
            "channelInfoName",
            channel.name || ""
        );

        setText(
            "channelInfoUsername",
            channel.username
                ? `@${channel.username}`
                : ""
        );

        setText(
            "channelInfoBio",
            channel.bio || ""
        );

        const inviteBtn =
            $("#channelInviteBtn");

        if (inviteBtn) {
            inviteBtn.onclick =
                () =>
                    createChannelInvite(
                        channel.id
                    );
        }

        const membersBtn =
            $("#channelMembersBtn");

        if (membersBtn) {
            membersBtn.onclick =
                () =>
                    loadChannelMembers(
                        channel.id
                    );
        }

        const leaveBtn =
            $("#leaveChannelBtn");

        if (leaveBtn) {
            leaveBtn.onclick =
                () =>
                    leaveChannel(
                        channel.id
                    );
        }

        openModal(
            "channelInfoModal"
        );
    }

    async function createChannelInvite(channelId) {
        const code =
            `${Math.random()
                .toString(36)
                .slice(2, 10)}${Date.now()
                .toString(36)
                .slice(-5)}`;

        const {
            error
        } = await db
            .from("channel_invites")
            .insert({
                channel_id: channelId,
                invite_code: code,
                created_by: currentUser.id
            });

        if (error) {
            safeError(
                error,
                "Invite yaratilmadi."
            );
            return;
        }

        await copyText(code);

        showToast(
            `Invite code: ${code}`
        );
    }

    async function loadChannelMembers(channelId) {
        const {
            data,
            error
        } = await db
            .from("channel_members")
            .select(`
                *,
                profile:profiles(
                    id,
                    username,
                    full_name,
                    avatar_url,
                    is_verified,
                    verified_until
                )
            `)
            .eq("channel_id", channelId);

        if (error) {
            safeError(
                error,
                "Members yuklanmadi."
            );
            return;
        }

        setText(
            "membersTitle",
            "Channel members"
        );

        const list =
            $("#membersList");

        if (!list) return;

        list.innerHTML =
            (data || [])
                .map(member => {
                    const profile =
                        member.profile || {};

                    return `
                        <div class="member-item">
                            ${avatarHTML(profile)}

                            <div>
                                <strong>
                                    ${escapeHTML(
                                        profile.full_name ||
                                        profile.username ||
                                        "User"
                                    )}
                                    ${verifiedHTML(profile)}
                                </strong>

                                <small>
                                    @${escapeHTML(
                                        profile.username || ""
                                    )}
                                    ·
                                    ${escapeHTML(
                                        member.role || "member"
                                    )}
                                </small>
                            </div>
                        </div>
                    `;
                })
                .join("");

        openModal("membersModal");
    }

    async function leaveChannel(channelId) {
        const ok =
            confirm(
                "Channeldan chiqilsinmi?"
            );

        if (!ok) return;

        const {
            error
        } = await db
            .from("channel_members")
            .delete()
            .eq(
                "channel_id",
                channelId
            )
            .eq(
                "user_id",
                currentUser.id
            );

        if (error) {
            safeError(
                error,
                "Channeldan chiqib bo‘lmadi."
            );
            return;
        }

        showToast(
            "Channeldan chiqdingiz."
        );

        activeChannel = null;
        activeChatType = null;

        await loadChannels();

        showEmptyChat();
    }

    /* =========================================================
       GROUP / CHANNEL MESSAGE FORM ROUTER
       ========================================================= */

    async function sendCurrentMessage(event) {
        event?.preventDefault();

        if (activeChatType === "direct") {
            await sendDirectMessage(event);
            return;
        }

        if (activeChatType === "group") {
            await sendGroupMessage();
            return;
        }

        if (activeChatType === "channel") {
            await sendChannelMessage();
            return;
        }
    }

    function showChatComposer(show) {
        const form = $("#messageForm");

        if (form) {
            form.style.display =
                show ? "flex" : "none";
        }
    }

    function showEmptyChat() {
        activeChatType = null;
        activeChatUser = null;
        activeGroup = null;
        activeChannel = null;

        const active =
            $("#activeChat");

        const empty =
            $("#chatEmpty");

        if (active) {
            active.style.display = "none";
        }

        if (empty) {
            empty.style.display = "flex";
        }

        showChatComposer(false);
    }

    /* =========================================================
       PROFILE POPUP
       ========================================================= */

    async function openUserProfile(userId) {
        if (!userId) return;

        const {
            data,
            error
        } = await db
            .from("profiles")
            .select("*")
            .eq("id", userId)
            .maybeSingle();

        if (error || !data) {
            showToast("Profile topilmadi.");
            return;
        }

        activeProfileUser = data;

        renderUserProfile(data);

        await updateProfilePopupActions();

        openModal(
            "userProfileModal"
        );
    }

    function renderUserProfile(profile) {
        setText(
            "userProfileName",
            profile.full_name ||
            profile.username ||
            "User"
        );

        setText(
            "userProfileUsername",
            profile.username
                ? `@${profile.username}`
                : ""
        );

        setText(
            "userProfileBio",
            profile.bio || ""
        );

        const avatar =
            $("#userProfileAvatar");

        if (avatar) {
            if (profile.avatar_url) {
                avatar.innerHTML = `
                    <img
                        src="${escapeAttr(
                            profile.avatar_url
                        )}"
                        alt=""
                    >
                `;
            } else {
                avatar.textContent =
                    (
                        profile.full_name ||
                        profile.username ||
                        "U"
                    )
                        .charAt(0)
                        .toUpperCase();
            }
        }

        const verified =
            $("#userProfileVerified");

        if (verified) {
            verified.style.display =
                isVerified(profile)
                    ? "inline-flex"
                    : "none";
        }
    }

    async function updateProfilePopupActions() {
        if (!activeProfileUser) return;

        const status =
            await getContactStatus(
                activeProfileUser.id
            );

        const add =
            $("#addContactBtn");

        const accept =
            $("#acceptContactBtn");

        const decline =
            $("#declineContactBtn");

        if (add) add.style.display = "none";
        if (accept) accept.style.display = "none";
        if (decline) decline.style.display = "none";

        if (!status) {
            if (add) {
                add.style.display =
                    "inline-flex";
            }

            return;
        }

        if (
            status.status === "pending" &&
            status.direction === "received"
        ) {
            if (accept) {
                accept.style.display =
                    "inline-flex";
                accept.dataset.requestId =
                    status.id;
            }

            if (decline) {
                decline.style.display =
                    "inline-flex";
                decline.dataset.requestId =
                    status.id;
            }
        }
    }

    /* =========================================================
       NICKNAME
       ========================================================= */

    async function saveNickname() {
        if (!activeProfileUser) return;

        const nickname =
            prompt(
                "Nickname:",
                activeProfileUser.nickname || ""
            );

        if (nickname === null) return;

        const value =
            nickname.trim();

        if (!value) {
            showToast(
                "Nickname bo‘sh bo‘lishi mumkin emas."
            );
            return;
        }

        const {
            error
        } = await db
            .from("contact_nicknames")
            .upsert({
                owner_id: currentUser.id,
                contact_id:
                    activeProfileUser.id,
                nickname: value
            });

        if (error) {
            safeError(
                error,
                "Nickname saqlanmadi."
            );
            return;
        }

        showToast(
            "Nickname saqlandi."
        );
    }

    async function removeNickname() {
        if (!activeProfileUser) return;

        const {
            error
        } = await db
            .from("contact_nicknames")
            .delete()
            .eq(
                "owner_id",
                currentUser.id
            )
            .eq(
                "contact_id",
                activeProfileUser.id
            );

        if (error) {
            safeError(
                error,
                "Nickname o‘chirilmadi."
            );
            return;
        }

        showToast(
            "Nickname o‘chirildi."
        );
    }

    /* =========================================================
       BLOCK
       ========================================================= */

    async function isBlocked(userId) {
        const {
            data
        } = await db
            .from("user_blocks")
            .select("id")
            .eq("blocker_id", currentUser.id)
            .eq("blocked_id", userId)
            .maybeSingle();

        return !!data;
    }

    async function blockUser(userId) {
        if (!userId) return;

        const blocked =
            await isBlocked(userId);

        if (blocked) {
            await unblockUser(userId);
            return;
        }

        const {
            error
        } = await db
            .from("user_blocks")
            .insert({
                blocker_id: currentUser.id,
                blocked_id: userId
            });

        if (error) {
            safeError(
                error,
                "User block qilinmadi."
            );
            return;
        }

        showToast(
            "User blocked."
        );

        await updateBlockButton();
    }

    async function unblockUser(userId) {
        const {
            error
        } = await db
            .from("user_blocks")
            .delete()
            .eq(
                "blocker_id",
                currentUser.id
            )
            .eq(
                "blocked_id",
                userId
            );

        if (error) {
            safeError(
                error,
                "User unblock qilinmadi."
            );
            return;
        }

        showToast(
            "User unblocked."
        );

        await updateBlockButton();
    }

    async function updateBlockButton() {
        const btn =
            $("#blockUserBtn");

        if (!btn || !activeProfileUser) {
            return;
        }

        const blocked =
            await isBlocked(
                activeProfileUser.id
            );

        btn.textContent =
            blocked
                ? "Unblock"
                : "Block";
    }

    /* =========================================================
       REPORT
       ========================================================= */

    async function reportUser() {
        if (!activeProfileUser) return;

        const reason =
            prompt(
                "Report reason:"
            );

        if (!reason?.trim()) {
            return;
        }

        const {
            error
        } = await db
            .from("reports")
            .insert({
                reporter_id:
                    currentUser.id,
                reported_user_id:
                    activeProfileUser.id,
                reason:
                    reason.trim(),
                status: "pending"
            });

        if (error) {
            safeError(
                error,
                "Report yuborilmadi."
            );
            return;
        }

        showToast(
            "Report yuborildi."
        );
    }

    /* =========================================================
       PROFILE SETTINGS
       ========================================================= */

    async function saveProfile(event) {
        event?.preventDefault();

        if (!currentUser) return;

        const fullName =
            getValue("profileFullName");

        const username =
            normalizeUsername(
                getValue("profileUsername")
            );

        const bio =
            getValue("profileBio");

        if (!fullName) {
            showToast(
                "Full name kerak."
            );
            return;
        }

        if (!validUsername(username)) {
            showToast(
                "Username noto‘g‘ri."
            );
            return;
        }

        const usernameChanged =
            myProfile?.username !== username;

        if (usernameChanged) {
            const available =
                await isUsernameAvailable(
                    username,
                    currentUser.id
                );

            if (!available) {
                showToast(
                    "Bu username allaqachon ishlatilgan."
                );
                return;
            }
        }

        const {
            error
        } = await db
            .from("profiles")
            .update({
                full_name: fullName,
                username,
                bio
            })
            .eq(
                "id",
                currentUser.id
            );

        if (error) {
            console.error(error);

            if (error.code === "23505") {
                showToast(
                    "Bu username allaqachon ishlatilgan."
                );
            } else {
                showToast(
                    "Profile saqlanmadi."
                );
            }

            return;
        }

        await refreshMyProfile();

        closeModal(
            "profileModal"
        );

        showToast(
            "Profile saqlandi."
        );
    }

    /* =========================================================
       AVATAR
       ========================================================= */

    async function uploadAvatar(file) {
        if (!file || !currentUser) return;

        const ext =
            file.name
                .split(".")
                .pop()
                ?.toLowerCase() || "jpg";

        const path =
            `${currentUser.id}/avatar-${Date.now()}.${ext}`;

        const {
            error: uploadError
        } = await db.storage
            .from("avatars")
            .upload(
                path,
                file,
                {
                    upsert: true,
                    contentType: file.type
                }
            );

        if (uploadError) {
            safeError(
                uploadError,
                "Avatar upload failed."
            );
            return;
        }

        const {
            data
        } = db.storage
            .from("avatars")
            .getPublicUrl(path);

        const avatarUrl =
            data?.publicUrl;

        if (!avatarUrl) {
            showToast(
                "Avatar URL topilmadi."
            );
            return;
        }

        const {
            error
        } = await db
            .from("profiles")
            .update({
                avatar_url: avatarUrl
            })
            .eq(
                "id",
                currentUser.id
            );

        if (error) {
            safeError(
                error,
                "Avatar saqlanmadi."
            );
            return;
        }

        await refreshMyProfile();

        showToast(
            "Avatar yangilandi."
        );
    }

    /* =========================================================
       PRIVACY
       ========================================================= */

    async function loadPrivacySettings() {
        if (!myProfile) return;

        const online =
            $("#showOnlineToggle");

        const lastSeen =
            $("#showLastSeenToggle");

        if (online) {
            online.checked =
                myProfile.show_online !== false;
        }

        if (lastSeen) {
            lastSeen.checked =
                myProfile.show_last_seen !== false;
        }
    }

    async function savePrivacySettings() {
        const showOnline =
            $("#showOnlineToggle")?.checked ??
            true;

        const showLastSeen =
            $("#showLastSeenToggle")?.checked ??
            true;

        const {
            error
        } = await db
            .from("profiles")
            .update({
                show_online: showOnline,
                show_last_seen: showLastSeen
            })
            .eq(
                "id",
                currentUser.id
            );

        if (error) {
            safeError(
                error,
                "Privacy saqlanmadi."
            );
            return;
        }

        await refreshMyProfile();

        showToast(
            "Privacy settings saqlandi."
        );
    }

    /* =========================================================
       APPEARANCE
       ========================================================= */

    function applyAppearance() {
        document.documentElement.dataset.theme =
            currentTheme;

        document.documentElement.dataset.density =
            currentDensity;

        $$(".appearance-option").forEach(
            option => {
                const theme =
                    option.dataset.theme;

                const density =
                    option.dataset.density;

                option.classList.toggle(
                    "active",
                    (
                        theme &&
                        theme === currentTheme
                    ) ||
                    (
                        density &&
                        density === currentDensity
                    )
                );
            }
        );
    }

    function selectAppearance(option) {
        const theme =
            option.dataset.theme;

        const density =
            option.dataset.density;

        if (theme) {
            currentTheme = theme;

            localStorage.setItem(
                "megchat_theme",
                theme
            );
        }

        if (density) {
            currentDensity = density;

            localStorage.setItem(
                "megchat_density",
                density
            );
        }

        applyAppearance();
    }

    /* =========================================================
       LANGUAGE
       ========================================================= */

    function applyLanguage(language) {
        currentLanguage =
            language || "en";

        localStorage.setItem(
            "megchat_language",
            currentLanguage
        );

        document.documentElement.lang =
            currentLanguage;
    }

    /* =========================================================
       EMOJI
       ========================================================= */

    const emojiList = [
        "😀","😃","😄","😁","😆","😅",
        "😂","🤣","😊","🙂","🙃","😉",
        "😌","😍","🥰","😘","😎","🤩",
        "🤔","😐","😑","😶","🙄","😏",
        "😴","😭","😡","🤬","😱","🤯",
        "👍","👎","👏","🙏","🔥","❤️",
        "💙","💚","💛","💜","🖤","✨",
        "🎉","🚀","💀","😂","🤣"
    ];

    function renderEmojiPanel() {
        const panel =
            $("#emojiPanel");

        if (!panel) return;

        panel.innerHTML =
            emojiList
                .map(
                    emoji =>
                        `<button
                            type="button"
                            class="emoji-item"
                            data-emoji="${emoji}"
                        >
                            ${emoji}
                        </button>`
                )
                .join("");
    }

    function insertEmoji(emoji) {
        const input =
            $("#messageInput");

        if (!input) return;

        const start =
            input.selectionStart ??
            input.value.length;

        const end =
            input.selectionEnd ??
            input.value.length;

        input.value =
            input.value.slice(0, start) +
            emoji +
            input.value.slice(end);

        input.focus();

        input.selectionStart =
            input.selectionEnd =
                start + emoji.length;
    }

    /* =========================================================
       STICKERS
       ========================================================= */

    async function loadStickers() {
        const panel =
            $("#stickerPanel");

        if (!panel) return;

        const {
            data,
            error
        } = await db.storage
            .from("stickers")
            .list("", {
                limit: 100
            });

        if (error) {
            console.error(error);
            return;
        }

        if (!data?.length) {
            panel.innerHTML = `
                <div class="empty-state">
                    No stickers
                </div>
            `;
            return;
        }

        panel.innerHTML =
            data
                .filter(file =>
                    /\.(png|jpg|jpeg|webp|gif)$/i
                        .test(file.name)
                )
                .map(file => {
                    const {
                        data: urlData
                    } = db.storage
                        .from("stickers")
                        .getPublicUrl(
                            file.name
                        );

                    const url =
                        urlData?.publicUrl;

                    return `
                        <button
                            type="button"
                            class="sticker-item"
                            data-sticker-url="${escapeAttr(
                                url || ""
                            )}"
                        >
                            <img
                                src="${escapeAttr(
                                    url || ""
                                )}"
                                alt="sticker"
                            >
                        </button>
                    `;
                })
                .join("");
    }

    async function sendSticker(url) {
        if (!url) return;

        if (activeChatType === "direct") {
            if (!activeChatUser) return;

            const {
                error
            } = await db
                .from("messages")
                .insert({
                    sender_id:
                        currentUser.id,
                    receiver_id:
                        activeChatUser.id,
                    content: "",
                    message_type:
                        "sticker",
                    sticker_url: url
                });

            if (error) {
                safeError(
                    error,
                    "Sticker yuborilmadi."
                );
                return;
            }

            await loadDirectMessages();
        }

        if (activeChatType === "group") {
            await sendGroupMessage(
                "",
                "sticker",
                url
            );
        }

        if (activeChatType === "channel") {
            await sendChannelMessage(
                "",
                "sticker",
                url
            );
        }
    }

    /* =========================================================
       OWNER
       ========================================================= */

    async function isOwner() {
        if (!currentUser) return false;

        const {
            data,
            error
        } = await db.rpc(
            "is_owner"
        );

        if (error) {
            console.error(error);
            return false;
        }

        return data === true;
    }

    async function isAdminOrOwner() {
        if (!currentUser) return false;

        const {
            data,
            error
        } = await db.rpc(
            "is_admin_or_owner"
        );

        if (error) {
            console.error(error);
            return false;
        }

        return data === true;
    }

    /* =========================================================
       VERIFIED
       ========================================================= */

    async function findVerifiedUser() {
        const username =
            normalizeUsername(
                getValue(
                    "ownerVerifiedUsername"
                )
            );

        const result =
            $("#ownerVerifiedResult");

        if (!username) {
            showToast(
                "Username kiriting."
            );
            return;
        }

        const {
            data,
            error
        } = await db
            .from("profiles")
            .select("*")
            .eq(
                "username",
                username
            )
            .maybeSingle();

        if (error || !data) {
            if (result) {
                result.innerHTML = `
                    <div class="empty-state">
                        User not found
                    </div>
                `;
            }

            return;
        }

        if (result) {
            result.innerHTML = `
                <div class="verified-target">
                    ${avatarHTML(data)}

                    <div>
                        <strong>
                            ${escapeHTML(
                                data.full_name ||
                                data.username
                            )}
                        </strong>

                        <span>
                            @${escapeHTML(
                                data.username
                            )}
                        </span>

                        <div>
                            Status:
                            ${
                                isVerified(data)
                                    ? "Verified"
                                    : "Not verified"
                            }
                        </div>
                    </div>
                </div>
            `;

            result.dataset.userId =
                data.id;
        }
    }

    async function setVerifiedUser(
        userId,
        days
    ) {
        const {
            error
        } = await db.rpc(
            "owner_set_verified",
            {
                p_user_id: userId,
                p_action: "give",
                p_days: Number(days) || 0
            }
        );

        if (error) {
            console.error(error);
            showToast(
                "Verified berilmadi."
            );
            return false;
        }

        showToast(
            Number(days) > 0
                ? `Verified ${days} kunga berildi.`
                : "Verified permanent berildi."
        );

        return true;
    }

    async function removeVerifiedUser(
        userId
    ) {
        const {
            error
        } = await db.rpc(
            "owner_set_verified",
            {
                p_user_id: userId,
                p_action: "remove",
                p_days: 0
            }
        );

        if (error) {
            console.error(error);
            showToast(
                "Verified olib tashlanmadi."
            );
            return false;
        }

        showToast(
            "Verified olib tashlandi."
        );

        return true;
    }

    /* =========================================================
       MODERATION
       ========================================================= */

    async function loadModerationUsers() {
        if (!(await isAdminOrOwner())) {
            return;
        }

        const list =
            $("#moderationUsersList");

        if (!list) return;

        const {
            data,
            error
        } = await db
            .from("profiles")
            .select("*")
            .order("created_at", {
                ascending: false
            })
            .limit(100);

        if (error) {
            console.error(error);
            return;
        }

        list.innerHTML =
            (data || [])
                .map(user => `
                    <div
                        class="moderation-user"
                        data-user-id="${user.id}"
                    >
                        ${avatarHTML(user)}

                        <div>
                            <strong>
                                ${escapeHTML(
                                    user.full_name ||
                                    user.username
                                )}
                            </strong>

                            <small>
                                @${escapeHTML(
                                    user.username
                                )}
                            </small>
                        </div>

                        <div>
                            <button
                                class="moderation-block-account"
                                data-id="${user.id}"
                            >
                                ${
                                    user.account_blocked
                                        ? "Unblock"
                                        : "Block"
                                }
                            </button>

                            <button
                                class="moderation-block-message"
                                data-id="${user.id}"
                            >
                                ${
                                    user.messaging_blocked
                                        ? "Unblock msg"
                                        : "Block msg"
                                }
                            </button>
                        </div>
                    </div>
                `)
                .join("");
    }

    async function toggleAccountBlock(userId) {
        if (!(await isAdminOrOwner())) {
            showToast(
                "Admin/Owner permission kerak."
            );
            return;
        }

        const {
            data
        } = await db
            .from("profiles")
            .select("account_blocked")
            .eq("id", userId)
            .maybeSingle();

        const next =
            !data?.account_blocked;

        const {
            error
        } = await db
            .from("profiles")
            .update({
                account_blocked: next,
                account_blocked_until: null
            })
            .eq("id", userId);

        if (error) {
            safeError(
                error,
                "Account status o‘zgarmadi."
            );
            return;
        }

        showToast(
            next
                ? "Account blocked."
                : "Account unblocked."
        );

        await loadModerationUsers();
    }

    async function toggleMessagingBlock(userId) {
        if (!(await isAdminOrOwner())) {
            showToast(
                "Admin/Owner permission kerak."
            );
            return;
        }

        const {
            data
        } = await db
            .from("profiles")
            .select("messaging_blocked")
            .eq("id", userId)
            .maybeSingle();

        const next =
            !data?.messaging_blocked;

        const {
            error
        } = await db
            .from("profiles")
            .update({
                messaging_blocked: next,
                messaging_blocked_until: null
            })
            .eq("id", userId);

        if (error) {
            safeError(
                error,
                "Messaging status o‘zgarmadi."
            );
            return;
        }

        showToast(
            next
                ? "Messaging blocked."
                : "Messaging unblocked."
        );

        await loadModerationUsers();
    }

    /* =========================================================
       REPORT MANAGEMENT
       ========================================================= */

    async function loadReports() {
        if (!(await isAdminOrOwner())) {
            return;
        }

        const list =
            $("#reportsList");

        if (!list) return;

        const {
            data,
            error
        } = await db
            .from("reports")
            .select("*")
            .order("created_at", {
                ascending: false
            })
            .limit(100);

        if (error) {
            console.error(error);
            return;
        }

        if (!data?.length) {
            list.innerHTML = `
                <div class="empty-state">
                    No reports
                </div>
            `;
            return;
        }

        list.innerHTML =
            data
                .map(report => `
                    <div
                        class="report-item"
                        data-report-id="${report.id}"
                    >
                        <strong>
                            Report #${report.id}
                        </strong>

                        <p>
                            ${escapeHTML(
                                report.reason || ""
                            )}
                        </p>

                        <small>
                            Status:
                            ${escapeHTML(
                                report.status || "pending"
                            )}
                        </small>

                        ${
                            report.status ===
                            "pending"
                                ? `
                                    <button
                                        class="resolve-report"
                                        data-id="${report.id}"
                                    >
                                        Resolve
                                    </button>
                                `
                                : ""
                        }
                    </div>
                `)
                .join("");
    }

    async function resolveReport(reportId) {
        if (!(await isAdminOrOwner())) {
            return;
        }

        const {
            error
        } = await db
            .from("reports")
            .update({
                status: "resolved",
                resolved_at:
                    new Date().toISOString(),
                resolved_by:
                    currentUser.id
            })
            .eq(
                "id",
                reportId
            );

        if (error) {
            safeError(
                error,
                "Report resolve qilinmadi."
            );
            return;
        }

        showToast(
            "Report resolved."
        );

        await loadReports();
    }

    /* =========================================================
       UPDATES
       ========================================================= */

    async function loadUpdates() {
        const list =
            $("#updatesList");

        if (!list) return;

        const {
            data,
            error
        } = await db
            .from("app_updates")
            .select("*")
            .order("created_at", {
                ascending: false
            })
            .limit(50);

        if (error) {
            console.error(error);
            return;
        }

        if (!data?.length) {
            list.innerHTML = `
                <div class="empty-state">
                    No updates
                </div>
            `;
            return;
        }

        list.innerHTML =
            data
                .map(update => `
                    <div class="update-item">
                        <h4>
                            ${escapeHTML(
                                update.title || ""
                            )}
                        </h4>

                        <p>
                            ${escapeHTML(
                                update.content || ""
                            )}
                        </p>

                        <small>
                            ${formatDate(
                                update.created_at
                            )}
                        </small>
                    </div>
                `)
                .join("");
    }

    /* =========================================================
       COPY
       ========================================================= */

    async function copyText(text) {
        try {
            await navigator.clipboard.writeText(
                String(text)
            );

            showToast("Copied.");
        } catch {
            showToast(
                "Copy qilib bo‘lmadi."
            );
        }
    }

    /* =========================================================
       SEARCH EVERYTHING
       ========================================================= */

    let searchTimer = null;

    async function performGlobalSearch(value) {
        clearTimeout(searchTimer);

        searchTimer =
            setTimeout(async () => {
                const query =
                    value.trim();

                await Promise.all([
                    loadUsers(query),
                    loadGroups(query),
                    loadChannels(query)
                ]);
            }, 250);
    }

    /* =========================================================
       SETTINGS
       ========================================================= */

    async function openSettings() {
        openModal("settingsModal");

        await loadPrivacySettings();
    }

    async function deleteAccount() {
        const ok =
            confirm(
                "Accountni o‘chirishni xohlaysizmi?"
            );

        if (!ok) return;

        showToast(
            "Account deletion uchun server-side RPC kerak."
        );
    }

    /* =========================================================
       LOGOUT
       ========================================================= */

    async function logout() {
        localStorage.removeItem(
            "messageAppLoggedIn"
        );

        localStorage.removeItem(
            "messageAppUser"
        );

        await db.auth.signOut();

        window.location.href =
            "index.html";
    }

    /* =========================================================
       MOBILE
       ========================================================= */

    function closeMobileSidebar() {
        document.body.classList.remove(
            "mobile-sidebar-open"
        );

        document.body.classList.add(
            "mobile-chat-open"
        );
    }

    function openMobileSidebar() {
        document.body.classList.remove(
            "mobile-chat-open"
        );

        document.body.classList.add(
            "mobile-sidebar-open"
        );
    }

    /* =========================================================
       MODAL X BUTTONS
       ========================================================= */

    function setupModalClosing() {
        $$(
            "[data-close-modal]"
        ).forEach(button => {
            button.addEventListener(
                "click",
                () => {
                    closeModal(
                        button.dataset.closeModal
                    );
                }
            );
        });

        $$(
            ".modal-close"
        ).forEach(button => {
            button.addEventListener(
                "click",
                () => {
                    const modal =
                        button.closest(".modal");

                    if (modal) {
                        closeModal(modal);
                    }
                }
            );
        });

        $$(".modal").forEach(modal => {
            modal.addEventListener(
                "click",
                event => {
                    if (
                        event.target === modal
                    ) {
                        closeModal(modal);
                    }
                }
            );
        });
    }

    /* =========================================================
       PROFILE MENU
       ========================================================= */

    function toggleProfileMenu() {
        const menu =
            $("#userProfileMenu");

        if (!menu) return;

        menu.classList.toggle(
            "show"
        );
    }

    function closeProfileMenu() {
        const menu =
            $("#userProfileMenu");

        if (menu) {
            menu.classList.remove(
                "show"
            );
        }
    }

    /* =========================================================
       EVENT SETUP
       ========================================================= */

    function setupEvents() {

        /* Search */

        const search =
            $("#searchInput");

        if (search) {
            search.addEventListener(
                "input",
                event => {
                    performGlobalSearch(
                        event.target.value
                    );
                }
            );
        }

        /* Users */

        document.addEventListener(
            "click",
            event => {
                const userItem =
                    event.target.closest(
                        ".user-item"
                    );

                if (
                    userItem &&
                    userItem.dataset.userId
                ) {
                    openDirectChat(
                        userItem.dataset.userId
                    );
                }
            }
        );

        /* Groups */

        document.addEventListener(
            "click",
            event => {
                const button =
                    event.target.closest(
                        ".group-open-btn"
                    );

                if (button) {
                    openGroup(
                        button.dataset.groupId
                    );
                }
            }
        );

        /* Channels */

        document.addEventListener(
            "click",
            event => {
                const button =
                    event.target.closest(
                        ".channel-open-btn"
                    );

                if (button) {
                    openChannel(
                        button.dataset.channelId
                    );
                }
            }
        );

        /* Contact request */

        const add =
            $("#addContactBtn");

        if (add) {
            add.addEventListener(
                "click",
                async () => {
                    if (
                        activeProfileUser
                    ) {
                        await sendContactRequest(
                            activeProfileUser.id
                        );
                    }
                }
            );
        }

        const accept =
            $("#acceptContactBtn");

        if (accept) {
            accept.addEventListener(
                "click",
                async () => {
                    const id =
                        accept.dataset.requestId;

                    if (id) {
                        await acceptContactRequest(
                            id
                        );
                    }

                    await updateProfilePopupActions();
                }
            );
        }

        const decline =
            $("#declineContactBtn");

        if (decline) {
            decline.addEventListener(
                "click",
                async () => {
                    const id =
                        decline.dataset.requestId;

                    if (id) {
                        await declineContactRequest(
                            id
                        );
                    }

                    closeModal(
                        "userProfileModal"
                    );
                }
            );
        }

        /* Message */

        const form =
            $("#messageForm");

        if (form) {
            form.addEventListener(
                "submit",
                sendCurrentMessage
            );
        }

        /* Message actions */

        document.addEventListener(
            "click",
            handleMessageAction
        );

        /* Image */

        const imageBtn =
            $("#imageBtn");

        const imageInput =
            $("#imageInput");

        if (imageBtn && imageInput) {
            imageBtn.addEventListener(
                "click",
                () => imageInput.click()
            );

            imageInput.addEventListener(
                "change",
                async () => {
                    const file =
                        imageInput.files?.[0];

                    if (file) {
                        await uploadChatImage(
                            file
                        );
                    }

                    imageInput.value = "";
                }
            );
        }

        /* Emoji */

        const emojiBtn =
            $("#emojiBtn");

        if (emojiBtn) {
            emojiBtn.addEventListener(
                "click",
                () => {
                    const panel =
                        $("#emojiPanel");

                    if (panel) {
                        panel.classList.toggle(
                            "show"
                        );
                    }
                }
            );
        }

        document.addEventListener(
            "click",
            event => {
                const btn =
                    event.target.closest(
                        ".emoji-item"
                    );

                if (btn) {
                    insertEmoji(
                        btn.dataset.emoji
                    );
                }
            }
        );

        /* Stickers */

        const stickerBtn =
            $("#stickerBtn");

        if (stickerBtn) {
            stickerBtn.addEventListener(
                "click",
                async () => {
                    const panel =
                        $("#stickerPanel");

                    if (!panel) return;

                    panel.classList.toggle(
                        "show"
                    );

                    if (
                        panel.classList.contains(
                            "show"
                        )
                    ) {
                        await loadStickers();
                    }
                }
            );
        }

        document.addEventListener(
            "click",
            event => {
                const sticker =
                    event.target.closest(
                        ".sticker-item"
                    );

                if (sticker) {
                    sendSticker(
                        sticker.dataset.stickerUrl
                    );
                }
            }
        );

        /* Profile menu */

        const profileMenuBtn =
            $("#userProfileMenuBtn");

        if (profileMenuBtn) {
            profileMenuBtn.addEventListener(
                "click",
                event => {
                    event.stopPropagation();
                    toggleProfileMenu();
                }
            );
        }

        document.addEventListener(
            "click",
            event => {
                if (
                    !event.target.closest(
                        "#userProfileMenu"
                    ) &&
                    !event.target.closest(
                        "#userProfileMenuBtn"
                    )
                ) {
                    closeProfileMenu();
                }
            }
        );

        /* Nickname */

        const editNickname =
            $("#editNicknameBtn");

        if (editNickname) {
            editNickname.addEventListener(
                "click",
                async () => {
                    await saveNickname();
                    closeProfileMenu();
                }
            );
        }

        const removeNickname =
            $("#removeNicknameBtn");

        if (removeNickname) {
            removeNickname.addEventListener(
                "click",
                async () => {
                    await removeNickname();
                    closeProfileMenu();
                }
            );
        }

        const removeNickname2 =
            $("#removeNicknameBtn2");

        if (removeNickname2) {
            removeNickname2.addEventListener(
                "click",
                removeNickname
            );
        }

        /* Block */

        const blockBtn =
            $("#blockUserBtn");

        if (blockBtn) {
            blockBtn.addEventListener(
                "click",
                async () => {
                    if (
                        activeProfileUser
                    ) {
                        await blockUser(
                            activeProfileUser.id
                        );
                    }

                    closeProfileMenu();
                }
            );
        }

        /* Report */

        const reportBtn =
            $("#reportUserBtn");

        if (reportBtn) {
            reportBtn.addEventListener(
                "click",
                async () => {
                    await reportUser();
                    closeProfileMenu();
                }
            );
        }

        /* Profile save */

        const profileForm =
            $("#profileForm");

        if (profileForm) {
            profileForm.addEventListener(
                "submit",
                saveProfile
            );
        }

        /* Avatar */

        const changeAvatar =
            $("#changeAvatarBtn");

        const avatarInput =
            $("#profileAvatarInput");

        if (
            changeAvatar &&
            avatarInput
        ) {
            changeAvatar.addEventListener(
                "click",
                () => avatarInput.click()
            );

            avatarInput.addEventListener(
                "change",
                async () => {
                    const file =
                        avatarInput.files?.[0];

                    if (file) {
                        await uploadAvatar(
                            file
                        );
                    }

                    avatarInput.value = "";
                }
            );
        }

        /* Privacy */

        const privacySave =
            $("#savePrivacyBtn");

        if (privacySave) {
            privacySave.addEventListener(
                "click",
                savePrivacySettings
            );
        }

        /* Appearance */

        $$(".appearance-option")
            .forEach(option => {
                option.addEventListener(
                    "click",
                    () =>
                        selectAppearance(
                            option
                        )
                );
            });

        /* Language */

        $$(".language-option")
            .forEach(option => {
                option.addEventListener(
                    "click",
                    () =>
                        applyLanguage(
                            option.dataset.language
                        )
                );
            });

        /* Settings */

        const settingsBtn =
            $("#settingsBtn");

        if (settingsBtn) {
            settingsBtn.addEventListener(
                "click",
                openSettings
            );
        }

        const profileSettingsBtn =
            $("#profileSettingsBtn");

        if (profileSettingsBtn) {
            profileSettingsBtn.addEventListener(
                "click",
                () =>
                    openModal(
                        "profileModal"
                    )
            );
        }

        const privacySettingsBtn =
            $("#privacySettingsBtn");

        if (privacySettingsBtn) {
            privacySettingsBtn.addEventListener(
                "click",
                () =>
                    openModal(
                        "privacyModal"
                    )
            );
        }

        const appearanceBtn =
            $("#appearanceSettingsBtn");

        if (appearanceBtn) {
            appearanceBtn.addEventListener(
                "click",
                () =>
                    openModal(
                        "appearanceModal"
                    )
            );
        }

        const languageBtn =
            $("#languageSettingsBtn");

        if (languageBtn) {
            languageBtn.addEventListener(
                "click",
                () =>
                    openModal(
                        "languageModal"
                    )
            );
        }

        const savedBtn =
            $("#savedMessagesBtn");

        if (savedBtn) {
            savedBtn.addEventListener(
                "click",
                async () => {
                    openModal(
                        "savedMessagesModal"
                    );

                    await loadSavedMessages();
                }
            );
        }

        const updatesBtn =
            $("#updatesSettingsBtn");

        if (updatesBtn) {
            updatesBtn.addEventListener(
                "click",
                async () => {
                    openModal(
                        "updatesModal"
                    );

                    await loadUpdates();
                }
            );
        }

        const logoutBtn =
            $("#settingsLogoutBtn");

        if (logoutBtn) {
            logoutBtn.addEventListener(
                "click",
                logout
            );
        }

        const deleteAccountBtn =
            $("#deleteAccountBtn");

        if (deleteAccountBtn) {
            deleteAccountBtn.addEventListener(
                "click",
                deleteAccount
            );
        }

        /* Create group */

        const groupForm =
            $("#groupForm");

        if (groupForm) {
            groupForm.addEventListener(
                "submit",
                createGroup
            );
        }

        /* Create channel */

        const channelForm =
            $("#channelForm");

        if (channelForm) {
            channelForm.addEventListener(
                "submit",
                createChannel
            );
        }

        /* Join group */

        const joinGroupBtn =
            $("#joinGroupBtn");

        if (joinGroupBtn) {
            joinGroupBtn.addEventListener(
                "click",
                joinGroup
            );
        }

        /* Join channel */

        const joinChannelBtn =
            $("#joinChannelBtn");

        if (joinChannelBtn) {
            joinChannelBtn.addEventListener(
                "click",
                joinChannel
            );
        }

        /* Group info */

        const groupInfoBtn =
            $("#groupInfoBtn");

        if (groupInfoBtn) {
            groupInfoBtn.addEventListener(
                "click",
                () =>
                    openGroupInfo()
            );
        }

        /* Channel info */

        const channelInfoBtn =
            $("#channelInfoBtn");

        if (channelInfoBtn) {
            channelInfoBtn.addEventListener(
                "click",
                () =>
                    openChannelInfo()
            );
        }

        /* Chat avatar/profile */

        const chatAvatarButton =
            $("#chatAvatarButton");

        if (chatAvatarButton) {
            chatAvatarButton.addEventListener(
                "click",
                () => {
                    if (
                        activeChatType ===
                        "direct" &&
                        activeChatUser
                    ) {
                        openUserProfile(
                            activeChatUser.id
                        );
                    }

                    if (
                        activeChatType ===
                        "group"
                    ) {
                        openGroupInfo();
                    }

                    if (
                        activeChatType ===
                        "channel"
                    ) {
                        openChannelInfo();
                    }
                }
            );
        }

        /* Owner verified search */

        const verifiedSearchBtn =
            $("#ownerVerifiedSearchBtn");

        if (verifiedSearchBtn) {
            verifiedSearchBtn.addEventListener(
                "click",
                findVerifiedUser
            );
        }

        /* Owner verified give */

        const verifiedDuration =
            $("#verifiedDuration");

        document.addEventListener(
            "click",
            async event => {
                const btn =
                    event.target.closest(
                        "#giveVerifiedBtn"
                    );

                if (!btn) return;

                const result =
                    $("#ownerVerifiedResult");

                const userId =
                    result?.dataset.userId;

                if (!userId) {
                    showToast(
                        "Avval user toping."
                    );
                    return;
                }

                const days =
                    Number(
                        verifiedDuration?.value ||
                        0
                    );

                await setVerifiedUser(
                    userId,
                    days
                );
            }
        );

        /* Owner verified remove */

        document.addEventListener(
            "click",
            async event => {
                const btn =
                    event.target.closest(
                        "#removeVerifiedBtn"
                    );

                if (!btn) return;

                const result =
                    $("#ownerVerifiedResult");

                const userId =
                    result?.dataset.userId;

                if (!userId) {
                    showToast(
                        "Avval user toping."
                    );
                    return;
                }

                await removeVerifiedUser(
                    userId
                );
            }
        );

        /* Moderation */

        document.addEventListener(
            "click",
            async event => {
                const btn =
                    event.target.closest(
                        ".moderation-block-account"
                    );

                if (!btn) return;

                await toggleAccountBlock(
                    btn.dataset.id
                );
            }
        );

        document.addEventListener(
            "click",
            async event => {
                const btn =
                    event.target.closest(
                        ".moderation-block-message"
                    );

                if (!btn) return;

                await toggleMessagingBlock(
                    btn.dataset.id
                );
            }
        );

        /* Reports */

        document.addEventListener(
            "click",
            async event => {
                const btn =
                    event.target.closest(
                        ".resolve-report"
                    );

                if (!btn) return;

                await resolveReport(
                    btn.dataset.id
                );
            }
        );

        /* Incoming request buttons */

        document.addEventListener(
            "click",
            async event => {
                const accept =
                    event.target.closest(
                        ".accept-request"
                    );

                if (accept) {
                    await acceptContactRequest(
                        accept.dataset.id
                    );

                    return;
                }

                const decline =
                    event.target.closest(
                        ".decline-request"
                    );

                if (decline) {
                    await declineContactRequest(
                        decline.dataset.id
                    );
                }
            }
        );

        /* Sidebar tabs */

        $$(".sidebar-tab")
            .forEach(tab => {
                tab.addEventListener(
                    "click",
                    async () => {
                        $$(".sidebar-tab")
                            .forEach(
                                t =>
                                    t.classList.remove(
                                        "active"
                                    )
                            );

                        tab.classList.add(
                            "active"
                        );

                        const type =
                            tab.dataset.tab;

                        if (type === "users") {
                            await loadUsers();
                        }

                        if (type === "groups") {
                            await loadGroups();
                        }

                        if (type === "channels") {
                            await loadChannels();
                        }
                    }
                );
            });

        /* Mobile */

        const mobileBack =
            $("#mobileBackBtn");

        if (mobileBack) {
            mobileBack.addEventListener(
                "click",
                openMobileSidebar
            );
        }

        /* Close swiped */

        document.addEventListener(
            "click",
            event => {
                if (
                    !event.target.closest(
                        ".message-wrapper"
                    )
                ) {
                    closeAllSwipedMessages();
                }
            }
        );
    }

    /* =========================================================
       REALTIME
       ========================================================= */

    function removeRealtimeChannels() {
        realtimeChannels.forEach(
            channel => {
                try {
                    db.removeChannel(channel);
                } catch {}
            }
        );

        realtimeChannels = [];
    }

    function setupRealtime() {
        removeRealtimeChannels();

        /* Direct messages */

        const direct =
            db.channel(
                `messages-${currentUser.id}`
            );

        direct
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "messages"
                },
                async payload => {
                    const row =
                        payload.new ||
                        payload.old;

                    if (!row) return;

                    const relevant =
                        row.sender_id ===
                            currentUser.id ||
                        row.receiver_id ===
                            currentUser.id;

                    if (!relevant) return;

                    if (
                        activeChatType ===
                        "direct" &&
                        activeChatUser
                    ) {
                        const belongs =
                            row.sender_id ===
                                activeChatUser.id ||
                            row.receiver_id ===
                                activeChatUser.id;

                        if (belongs) {
                            await loadDirectMessages();
                        }
                    }
                }
            )
            .subscribe();

        realtimeChannels.push(
            direct
        );

        /* Contact requests */

        const requests =
            db.channel(
                `requests-${currentUser.id}`
            );

        requests
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "contact_requests"
                },
                async payload => {
                    const row =
                        payload.new ||
                        payload.old;

                    if (!row) return;

                    if (
                        row.sender_id ===
                            currentUser.id ||
                        row.receiver_id ===
                            currentUser.id
                    ) {
                        await loadIncomingRequests();

                        if (
                            activeProfileUser
                        ) {
                            await updateProfilePopupActions();
                        }
                    }
                }
            )
            .subscribe();

        realtimeChannels.push(
            requests
        );

        /* Group messages */

        const groups =
            db.channel(
                `groups-${currentUser.id}`
            );

        groups
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "group_messages"
                },
                async payload => {
                    const row =
                        payload.new ||
                        payload.old;

                    if (
                        activeChatType ===
                            "group" &&
                        activeGroup &&
                        row?.group_id ===
                            activeGroup.id
                    ) {
                        await loadGroupMessages(
                            activeGroup.id
                        );
                    }
                }
            )
            .subscribe();

        realtimeChannels.push(
            groups
        );

        /* Channel messages */

        const channels =
            db.channel(
                `channels-${currentUser.id}`
            );

        channels
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "channel_messages"
                },
                async payload => {
                    const row =
                        payload.new ||
                        payload.old;

                    if (
                        activeChatType ===
                            "channel" &&
                        activeChannel &&
                        row?.channel_id ===
                            activeChannel.id
                    ) {
                        await loadChannelMessages(
                            activeChannel.id
                        );
                    }
                }
            )
            .subscribe();

        realtimeChannels.push(
            channels
        );
    }

    /* =========================================================
       SEEN / DELIVERED
       ========================================================= */

    async function markDirectMessagesSeen() {
        if (
            !currentUser ||
            !activeChatUser
        ) {
            return;
        }

        await db
            .from("messages")
            .update({
                seen_at:
                    new Date().toISOString()
            })
            .eq(
                "sender_id",
                activeChatUser.id
            )
            .eq(
                "receiver_id",
                currentUser.id
            )
            .is(
                "seen_at",
                null
            );
    }

    /* =========================================================
       ACCOUNT STATE
       ========================================================= */

    function checkAccountBlocked() {
        if (!myProfile) return false;

        if (
            myProfile.account_blocked !== true
        ) {
            return false;
        }

        if (
            !myProfile.account_blocked_until
        ) {
            showAccountBlocked();
            return true;
        }

        const until =
            new Date(
                myProfile.account_blocked_until
            ).getTime();

        if (
            until > Date.now()
        ) {
            showAccountBlocked(
                new Date(
                    until
                ).toLocaleString()
            );

            return true;
        }

        return false;
    }

    function showAccountBlocked(until = "") {
        showToast(
            until
                ? `Account blocked until ${until}`
                : "Account blocked."
        );
    }

    /* =========================================================
       VERIFIED AUTO REFRESH
       ========================================================= */

    async function refreshExpiredVerification() {
        if (!myProfile) return;

        if (
            myProfile.is_verified &&
            myProfile.verified_until
        ) {
            const until =
                new Date(
                    myProfile.verified_until
                ).getTime();

            if (
                until <= Date.now()
            ) {
                /*
                 * User cannot change verification
                 * directly. Owner RPC is authoritative.
                 *
                 * Refresh UI locally immediately.
                 */
                myProfile.is_verified =
                    false;

                renderMyProfile();
            }
        }
    }

    /* =========================================================
       COUNTS
       ========================================================= */

    async function updateCounts() {
        if (!currentUser) return;

        const [
            contactsResult,
            groupsResult,
            channelsResult
        ] = await Promise.all([
            db
                .from("contact_requests")
                .select(
                    "id",
                    {
                        count: "exact",
                        head: true
                    }
                )
                .eq(
                    "receiver_id",
                    currentUser.id
                )
                .eq(
                    "status",
                    "pending"
                ),

            db
                .from("group_members")
                .select(
                    "group_id",
                    {
                        count: "exact",
                        head: true
                    }
                )
                .eq(
                    "user_id",
                    currentUser.id
                ),

            db
                .from("channel_members")
                .select(
                    "channel_id",
                    {
                        count: "exact",
                        head: true
                    }
                )
                .eq(
                    "user_id",
                    currentUser.id
                )
        ]);

        setText(
            "contactCount",
            contactsResult.count || 0
        );

        setText(
            "groupCount",
            groupsResult.count || 0
        );

        setText(
            "channelCount",
            channelsResult.count || 0
        );
    }

    /* =========================================================
       PROFILE AVATAR FIX
       ========================================================= */

    function fixProfileAvatars() {
        $$(".profile-avatar, #userProfileAvatar")
            .forEach(avatar => {
                avatar.style.aspectRatio =
                    "1 / 1";

                avatar.style.overflow =
                    "hidden";
            });
    }

    /* =========================================================
       CHAT LIST NICKNAMES
       ========================================================= */

    async function getNickname(userId) {
        if (!currentUser || !userId) {
            return null;
        }

        const {
            data
        } = await db
            .from("contact_nicknames")
            .select("nickname")
            .eq(
                "owner_id",
                currentUser.id
            )
            .eq(
                "contact_id",
                userId
            )
            .maybeSingle();

        return data?.nickname || null;
    }

    /* =========================================================
       REFRESH
       ========================================================= */

    async function refreshDashboard() {
        await Promise.all([
            loadUsers(),
            loadGroups(),
            loadChannels(),
            loadIncomingRequests(),
            updateCounts()
        ]);

        await refreshMyProfile();
    }

    /* =========================================================
       INITIALIZATION
       ========================================================= */

    async function init() {
        applyAppearance();
        applyLanguage(
            currentLanguage
        );

        setupEvents();
        setupModalClosing();
        renderEmojiPanel();

        const authenticated =
            await loadCurrentUser();

        if (!authenticated) {
            return;
        }

        await loadMyProfile();

        if (!myProfile) {
            showToast(
                "Profile topilmadi."
            );
            return;
        }

        checkAccountBlocked();

        await refreshExpiredVerification();

        renderMyProfile();

        await refreshDashboard();

        setupRealtime();

        fixProfileAvatars();

        setInterval(
            async () => {
                await refreshExpiredVerification();

                await refreshMyProfile();
            },
            60 * 1000
        );

        /*
         * Keep last_seen updated.
         */
        setInterval(
            async () => {
                if (!currentUser) return;

                await db
                    .from("profiles")
                    .update({
                        last_seen:
                            new Date().toISOString()
                    })
                    .eq(
                        "id",
                        currentUser.id
                    );
            },
            60 * 1000
        );
    }

    /* =========================================================
       DOM READY
       ========================================================= */

    if (
        document.readyState ===
        "loading"
    ) {
        document.addEventListener(
            "DOMContentLoaded",
            init
        );
    } else {
        init();
    }

})();
