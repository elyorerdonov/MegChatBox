(() => {
    "use strict";

    /* =========================================================
       MEGCHATBOX - DASHBOARD MASTER JS
       ========================================================= */

    const db = window.supabaseClient;

    if (!db) {
        console.error("Supabase client topilmadi.");
        return;
    }

    /* =========================================================
       STATE
       ========================================================= */

    let currentUser = null;
    let myProfile = null;

    let currentChatUser = null;
    let currentChatType = null; // direct | group | channel
    let currentChatId = null;

    let currentMessages = [];
    let currentGroup = null;
    let currentChannel = null;

    let currentProfileUser = null;
    let editingMessageId = null;

    let realtimeChannels = [];

    const $ = (selector) => document.querySelector(selector);
    const $$ = (selector) => [...document.querySelectorAll(selector)];

    /* =========================================================
       HELPERS
       ========================================================= */

    function escapeHTML(value = "") {
        return String(value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function escapeAttribute(value = "") {
        return escapeHTML(value);
    }

    function getInitial(name = "U") {
        return String(name).trim().charAt(0).toUpperCase() || "U";
    }

    function formatTime(date) {
        if (!date) return "";

        return new Date(date).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit"
        });
    }

    function formatDate(date) {
        if (!date) return "";

        return new Date(date).toLocaleDateString([], {
            day: "2-digit",
            month: "short",
            year: "numeric"
        });
    }

    function toast(message, type = "normal") {
        const el = $("#toast");
        const text = $("#toastMessage");

        if (!el || !text) {
            console.log(message);
            return;
        }

        text.textContent = message;

        el.classList.remove("show", "success", "error");

        if (type === "success") el.classList.add("success");
        if (type === "error") el.classList.add("error");

        requestAnimationFrame(() => {
            el.classList.add("show");
        });

        clearTimeout(window.__toastTimer);

        window.__toastTimer = setTimeout(() => {
            el.classList.remove("show");
        }, 3000);
    }

    function showElement(el) {
        if (el) el.style.display = "";
    }

    function hideElement(el) {
        if (el) el.style.display = "none";
    }

    function setText(selector, value) {
        const el = $(selector);
        if (el) el.textContent = value ?? "";
    }

    function openModal(modal) {
        if (!modal) return;

        modal.classList.add("show");
        modal.style.display = "flex";
    }

    function closeModal(modal) {
        if (!modal) return;

        modal.classList.remove("show");
        modal.style.display = "none";
    }

    function closeAllMenus() {
        const profileMenu = $("#userProfileMenu");
        if (profileMenu) {
            profileMenu.classList.remove("show");
            profileMenu.style.display = "none";
        }
    }

    function isOwner() {
        return myProfile?.role === "owner";
    }

    function isAdmin() {
        return myProfile?.role === "admin" || isOwner();
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
            return null;
        }

        currentUser = data.user;

        return currentUser;
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
            console.error("Profile:", error);
            toast("Profilni yuklashda xatolik", "error");
            return null;
        }

        myProfile = data;

        renderMyProfile();

        return data;
    }

    function renderMyProfile() {
        if (!myProfile) return;

        const name =
            myProfile.full_name ||
            myProfile.username ||
            "User";

        const username = myProfile.username
            ? "@" + myProfile.username
            : "";

        setText("#myName", name);
        setText("#myUsername", username);

        const avatar = $("#myAvatar");

        if (avatar) {
            if (myProfile.avatar_url) {
                avatar.innerHTML = `
                    <img
                        src="${escapeAttribute(myProfile.avatar_url)}"
                        alt="${escapeAttribute(name)}"
                    >
                `;
            } else {
                avatar.textContent = getInitial(name);
            }
        }

        const verified = $("#myVerified");

        if (verified) {
            verified.style.display =
                myProfile.is_verified === true
                    ? "inline-flex"
                    : "none";
        }

        const ownerBadge = $("#myOwnerBadge");

        if (ownerBadge) {
            ownerBadge.style.display =
                myProfile.role === "owner"
                    ? "inline-flex"
                    : "none";
        }
    }

    /* =========================================================
       PROFILE BADGE
       ========================================================= */

    function verifiedHTML(verified) {
        return verified
            ? `<span class="verified-badge" title="Verified">✓</span>`
            : "";
    }

    /* =========================================================
       CONTACTS
       ========================================================= */

    async function loadContacts() {
        if (!currentUser) return;

        const list = $("#userList");
        if (!list) return;

        const {
            data: sent,
            error: sentError
        } = await db
            .from("contact_requests")
            .select("receiver_id,status")
            .eq("sender_id", currentUser.id);

        const {
            data: received,
            error: receivedError
        } = await db
            .from("contact_requests")
            .select("sender_id,status")
            .eq("receiver_id", currentUser.id);

        if (sentError || receivedError) {
            console.error(sentError || receivedError);
            return;
        }

        const acceptedIds = new Set();

        (sent || []).forEach(item => {
            if (item.status === "accepted") {
                acceptedIds.add(item.receiver_id);
            }
        });

        (received || []).forEach(item => {
            if (item.status === "accepted") {
                acceptedIds.add(item.sender_id);
            }
        });

        if (!acceptedIds.size) {
            list.innerHTML = `
                <div class="empty-list">
                    No contacts yet
                </div>
            `;

            setText("#contactCount", "0");
            return;
        }

        const {
            data: profiles,
            error
        } = await db
            .from("profiles")
            .select("*")
            .in("id", [...acceptedIds])
            .order("full_name");

        if (error) {
            console.error(error);
            return;
        }

        setText("#contactCount", String(profiles?.length || 0));

        renderContactList(profiles || []);
    }

    function renderContactList(profiles) {
        const list = $("#userList");
        if (!list) return;

        if (!profiles.length) {
            list.innerHTML = `
                <div class="empty-list">
                    No contacts yet
                </div>
            `;
            return;
        }

        list.innerHTML = profiles.map(user => `
            <div
                class="user-item"
                data-user-id="${escapeAttribute(user.id)}"
                data-name="${escapeAttribute(user.full_name || user.username)}"
            >
                <div class="user-avatar">
                    ${
                        user.avatar_url
                            ? `<img src="${escapeAttribute(user.avatar_url)}">`
                            : escapeHTML(getInitial(user.full_name || user.username))
                    }
                </div>

                <div class="user-info">
                    <div class="user-name-row">
                        <span class="user-name">
                            ${escapeHTML(user.full_name || user.username)}
                        </span>
                        ${verifiedHTML(user.is_verified)}
                    </div>

                    <span class="user-username">
                        @${escapeHTML(user.username || "")}
                    </span>
                </div>
            </div>
        `).join("");

        list.querySelectorAll(".user-item").forEach(item => {
            item.addEventListener("click", () => {
                openDirectChat(item.dataset.userId);
            });
        });
    }

    async function loadContactRequests() {
        if (!currentUser) return;

        const {
            data,
            error
        } = await db
            .from("contact_requests")
            .select("*")
            .eq("receiver_id", currentUser.id)
            .eq("status", "pending")
            .order("created_at", {
                ascending: false
            });

        if (error) {
            console.error(error);
            return;
        }

        const requests = data || [];

        if (!requests.length) return;

        const senderIds = requests.map(item => item.sender_id);

        const {
            data: profiles
        } = await db
            .from("profiles")
            .select("*")
            .in("id", senderIds);

        requests.forEach(request => {
            const sender = profiles?.find(
                profile => profile.id === request.sender_id
            );

            if (sender) {
                showContactRequest(request, sender);
            }
        });
    }

    function showContactRequest(request, sender) {
        const container = $("#contactRequests");

        if (!container) {
            toast(
                `${sender.full_name || sender.username} sizga contact request yubordi`
            );
            return;
        }

        const existing = container.querySelector(
            `[data-request-id="${request.id}"]`
        );

        if (existing) return;

        const item = document.createElement("div");

        item.className = "contact-request";
        item.dataset.requestId = request.id;

        item.innerHTML = `
            <div class="request-avatar">
                ${
                    sender.avatar_url
                        ? `<img src="${escapeAttribute(sender.avatar_url)}">`
                        : escapeHTML(getInitial(sender.full_name || sender.username))
                }
            </div>

            <div class="request-content">
                <strong>
                    ${escapeHTML(sender.full_name || sender.username)}
                    ${verifiedHTML(sender.is_verified)}
                </strong>

                <span>
                    @${escapeHTML(sender.username || "")}
                </span>

                <div class="request-actions">
                    <button data-request-action="accept">
                        Accept
                    </button>

                    <button data-request-action="decline">
                        Decline
                    </button>
                </div>
            </div>
        `;

        container.appendChild(item);

        item.querySelector('[data-request-action="accept"]')
            ?.addEventListener("click", () => {
                updateContactRequest(request.id, "accepted");
            });

        item.querySelector('[data-request-action="decline"]')
            ?.addEventListener("click", () => {
                updateContactRequest(request.id, "declined");
            });
    }

    async function updateContactRequest(requestId, status) {
        const {
            error
        } = await db
            .from("contact_requests")
            .update({
                status
            })
            .eq("id", requestId)
            .eq("receiver_id", currentUser.id);

        if (error) {
            console.error(error);
            toast("Requestni yangilab bo‘lmadi", "error");
            return;
        }

        toast(
            status === "accepted"
                ? "Contact qabul qilindi ✓"
                : "Contact rad etildi"
        );

        document
            .querySelector(`[data-request-id="${requestId}"]`)
            ?.remove();

        await loadContacts();

        if (
            currentChatUser &&
            currentChatUser.id
        ) {
            await updateContactButtons(currentChatUser.id);
        }
    }

    async function searchUsers(username) {
        username = username.trim().replace(/^@/, "").toLowerCase();

        if (!username) return;

        const {
            data,
            error
        } = await db
            .from("profiles")
            .select("*")
            .ilike("username", `%${username}%`)
            .limit(20);

        if (error) {
            console.error(error);
            toast("Search xatosi", "error");
            return;
        }

        renderSearchResults(data || []);
    }

    function renderSearchResults(users) {
        const list = $("#searchResults");

        if (!list) return;

        if (!users.length) {
            list.innerHTML = `
                <div class="empty-list">
                    User topilmadi
                </div>
            `;
            return;
        }

        list.innerHTML = users.map(user => `
            <div
                class="search-result"
                data-search-user-id="${escapeAttribute(user.id)}"
            >
                <div class="user-avatar">
                    ${
                        user.avatar_url
                            ? `<img src="${escapeAttribute(user.avatar_url)}">`
                            : escapeHTML(getInitial(user.full_name || user.username))
                    }
                </div>

                <div class="user-info">
                    <div>
                        ${escapeHTML(user.full_name || user.username)}
                        ${verifiedHTML(user.is_verified)}
                    </div>

                    <span>
                        @${escapeHTML(user.username || "")}
                    </span>
                </div>

                <button class="search-user-add">
                    Add
                </button>
            </div>
        `).join("");

        list.querySelectorAll(".search-result")
            .forEach(item => {
                item.addEventListener("click", async e => {
                    if (
                        e.target.closest(".search-user-add")
                    ) {
                        await sendContactRequest(
                            item.dataset.searchUserId
                        );
                        return;
                    }

                    await openDirectChat(
                        item.dataset.searchUserId
                    );
                });
            });
    }

    async function sendContactRequest(receiverId) {
        if (!currentUser) return;

        if (receiverId === currentUser.id) {
            toast("O‘zingizni contactga qo‘sha olmaysiz", "error");
            return;
        }

        const {
            data: existing
        } = await db
            .from("contact_requests")
            .select("*")
            .or(
                `and(sender_id.eq.${currentUser.id},receiver_id.eq.${receiverId}),and(sender_id.eq.${receiverId},receiver_id.eq.${currentUser.id})`
            )
            .maybeSingle();

        if (existing) {
            if (existing.status === "accepted") {
                toast("Bu user allaqachon contactda");
                return;
            }

            if (
                existing.sender_id === currentUser.id &&
                existing.status === "pending"
            ) {
                toast("Request allaqachon yuborilgan");
                return;
            }

            if (
                existing.receiver_id === currentUser.id &&
                existing.status === "pending"
            ) {
                toast("Bu user sizga request yuborgan");
                return;
            }

            if (existing.status === "declined") {
                await db
                    .from("contact_requests")
                    .delete()
                    .eq("id", existing.id);
            }
        }

        const {
            error
        } = await db
            .from("contact_requests")
            .insert({
                sender_id: currentUser.id,
                receiver_id: receiverId,
                status: "pending"
            });

        if (error) {
            console.error(error);
            toast("Request yuborilmadi", "error");
            return;
        }

        toast("Contact request yuborildi ✓", "success");
    }

    async function getContactStatus(otherUserId) {
        if (!currentUser || !otherUserId) {
            return null;
        }

        const {
            data,
            error
        } = await db
            .from("contact_requests")
            .select("*")
            .or(
                `and(sender_id.eq.${currentUser.id},receiver_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},receiver_id.eq.${currentUser.id})`
            )
            .maybeSingle();

        if (error) {
            console.error(error);
            return null;
        }

        return data;
    }

    async function updateContactButtons(otherUserId) {
        const container = $("#contactActions");
        const addBtn = $("#addContactBtn");
        const acceptBtn = $("#acceptContactBtn");
        const declineBtn = $("#declineContactBtn");

        if (!container) return;

        hideElement(addBtn);
        hideElement(acceptBtn);
        hideElement(declineBtn);

        const request = await getContactStatus(otherUserId);

        if (!request) {
            showElement(container);
            showElement(addBtn);
            return;
        }

        if (request.status === "accepted") {
            hideElement(container);
            return;
        }

        showElement(container);

        if (
            request.sender_id === currentUser.id &&
            request.status === "pending"
        ) {
            if (addBtn) {
                addBtn.textContent = "Request sent";
                addBtn.disabled = true;
                showElement(addBtn);
            }

            return;
        }

        if (
            request.receiver_id === currentUser.id &&
            request.status === "pending"
        ) {
            showElement(acceptBtn);
            showElement(declineBtn);

            acceptBtn.onclick = () =>
                updateContactRequest(
                    request.id,
                    "accepted"
                );

            declineBtn.onclick = () =>
                updateContactRequest(
                    request.id,
                    "declined"
                );
        }
    }

    /* =========================================================
       DIRECT CHAT
       ========================================================= */

    async function openDirectChat(userId) {
        if (!userId || userId === currentUser?.id) return;

        const {
            data: user,
            error
        } = await db
            .from("profiles")
            .select("*")
            .eq("id", userId)
            .maybeSingle();

        if (error || !user) {
            toast("User topilmadi", "error");
            return;
        }

        currentChatType = "direct";
        currentChatId = userId;
        currentChatUser = user;
        currentGroup = null;
        currentChannel = null;

        showDirectHeader(user);

        await updateContactButtons(user.id);

        const request = await getContactStatus(user.id);

        if (request?.status === "accepted") {
            await loadDirectMessages(user.id);
        } else {
            renderNoContactChat();
        }

        setupMessageRealtime();
    }

    function showDirectHeader(user) {
        hideElement($("#chatEmpty"));
        showElement($("#activeChat"));

        const avatar = $("#chatAvatar");
        const name = $("#chatName");
        const verified = $("#chatVerified");
        const status = $("#chatStatus");

        if (avatar) {
            if (user.avatar_url) {
                avatar.innerHTML = `
                    <img
                        src="${escapeAttribute(user.avatar_url)}"
                        alt=""
                    >
                `;
            } else {
                avatar.textContent =
                    getInitial(user.full_name || user.username);
            }
        }

        if (name) {
            name.textContent =
                user.full_name || user.username || "User";
        }

        if (verified) {
            verified.style.display =
                user.is_verified === true
                    ? "inline-flex"
                    : "none";
        }

        if (status) {
            if (user.show_online === false) {
                status.textContent = "";
            } else {
                status.textContent = "online";
            }
        }

        const input = $("#messageInput");

        if (input) {
            input.disabled = false;
            input.placeholder = "Write a message...";
        }

        const send = $("#sendButton");

        if (send) {
            send.disabled = false;
        }
    }

    function renderNoContactChat() {
        const messages = $("#messages");
        if (!messages) return;

        messages.innerHTML = `
            <div class="no-contact-chat">
                <div class="no-contact-icon">🔒</div>
                <h3>Contact request required</h3>
                <p>
                    You can chat only after this user accepts
                    your contact request.
                </p>
            </div>
        `;

        const input = $("#messageInput");
        const send = $("#sendButton");

        if (input) {
            input.disabled = true;
        }

        if (send) {
            send.disabled = true;
        }
    }

    async function loadDirectMessages(otherUserId) {
        const request = await getContactStatus(otherUserId);

        if (request?.status !== "accepted") {
            renderNoContactChat();
            return;
        }

        const {
            data,
            error
        } = await db
            .from("messages")
            .select("*")
            .or(
                `and(sender_id.eq.${currentUser.id},receiver_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},receiver_id.eq.${currentUser.id})`
            )
            .is("deleted_at", null)
            .order("created_at", {
                ascending: true
            });

        if (error) {
            console.error(error);
            toast("Messages yuklanmadi", "error");
            return;
        }

        currentMessages = data || [];

        renderDirectMessages(currentMessages);

        await markMessagesSeen(otherUserId);
    }

    function renderDirectMessages(messages) {
        const container = $("#messages");
        if (!container) return;

        if (!messages.length) {
            container.innerHTML = `
                <div class="empty-chat">
                    <p>No messages yet</p>
                </div>
            `;
            return;
        }

        container.innerHTML = messages
            .map(message => renderMessage(message))
            .join("");

        bindMessageActions();
        initializeMessageSwipes();

        scrollMessagesToBottom();
    }

    /* =========================================================
       MESSAGE RENDERER
       ========================================================= */

    function renderMessage(message, context = "direct") {
        const mine =
            message.sender_id === currentUser.id;

        const type =
            message.message_type || "text";

        let content = "";

        if (message.deleted_at) {
            content = `
                <span class="deleted-message">
                    Message deleted
                </span>
            `;
        } else if (
            type === "image" &&
            message.image_url
        ) {
            content = `
                <img
                    class="message-image"
                    src="${escapeAttribute(message.image_url)}"
                    alt="image"
                >
            `;
        } else if (
            type === "sticker" &&
            message.sticker_url
        ) {
            content = `
                <img
                    class="message-sticker"
                    src="${escapeAttribute(message.sticker_url)}"
                    alt="sticker"
                >
            `;
        } else {
            content = `
                <span class="message-text">
                    ${escapeHTML(message.content || "")}
                </span>
            `;
        }

        const edited =
            message.edited_at
                ? `<span class="message-edited">edited</span>`
                : "";

        const saved =
            message.__saved
                ? `<span class="message-saved">★</span>`
                : "";

        const actions = `
            <div class="message-actions">

                <button
                    type="button"
                    class="message-action"
                    data-action="save"
                    data-message-id="${message.id}"
                >
                    <i class="fa-regular fa-bookmark"></i>
                    <span>Save</span>
                </button>

                ${
                    mine && type === "text"
                        ? `
                        <button
                            type="button"
                            class="message-action"
                            data-action="edit"
                            data-message-id="${message.id}"
                        >
                            <i class="fa-solid fa-pen"></i>
                            <span>Edit</span>
                        </button>

                        <button
                            type="button"
                            class="message-action"
                            data-action="delete"
                            data-message-id="${message.id}"
                        >
                            <i class="fa-solid fa-trash"></i>
                            <span>Delete</span>
                        </button>
                        `
                        : ""
                }

            </div>
        `;

        return `
            <div
                class="message-wrapper ${mine ? "mine" : "theirs"}"
                data-message-id="${message.id}"
                data-context="${context}"
            >

                ${actions}

                <div class="message-bubble">

                    ${content}

                    <div class="message-meta">
                        <span>
                            ${formatTime(message.created_at)}
                        </span>

                        ${edited}
                        ${saved}

                        ${
                            mine
                                ? `
                                <span class="message-status">
                                    ${
                                        message.seen_at
                                            ? "✓✓"
                                            : message.delivered_at
                                                ? "✓"
                                                : ""
                                    }
                                </span>
                                `
                                : ""
                        }
                    </div>

                </div>

            </div>
        `;
    }

    function bindMessageActions() {
        $$(".message-action").forEach(button => {
            button.onclick = async e => {
                e.stopPropagation();

                const action =
                    button.dataset.action;

                const messageId =
                    button.dataset.messageId;

                if (action === "save") {
                    await saveMessage(messageId);
                }

                if (action === "edit") {
                    await editMessage(messageId);
                }

                if (action === "delete") {
                    await deleteMessage(messageId);
                }

                const wrapper =
                    button.closest(".message-wrapper");

                if (wrapper) {
                    wrapper.classList.remove("swiped");

                    const bubble =
                        wrapper.querySelector(".message-bubble");

                    if (bubble) {
                        bubble.style.transform = "";
                    }
                }
            };
        });
    }

    /* =========================================================
       MESSAGE SEND
       ========================================================= */

    async function sendDirectMessage(text) {
        if (!currentUser || !currentChatUser) return;

        const request =
            await getContactStatus(currentChatUser.id);

        if (request?.status !== "accepted") {
            toast("Avval contact request qabul qilinishi kerak");
            return;
        }

        text = text.trim();

        if (!text) return;

        const {
            error
        } = await db
            .from("messages")
            .insert({
                sender_id: currentUser.id,
                receiver_id: currentChatUser.id,
                content: text,
                message_type: "text"
            });

        if (error) {
            console.error(error);
            toast("Message yuborilmadi", "error");
            return;
        }

        const input = $("#messageInput");

        if (input) {
            input.value = "";
        }

        await loadDirectMessages(
            currentChatUser.id
        );
    }

    /* =========================================================
       EDIT MESSAGE
       ========================================================= */

    async function editMessage(messageId) {
        const message =
            currentMessages.find(
                item => String(item.id) === String(messageId)
            );

        if (!message) return;

        if (message.sender_id !== currentUser.id) {
            toast("Faqat o‘zingiz yuborgan message'ni edit qila olasiz");
            return;
        }

        const newText =
            window.prompt(
                "Edit message:",
                message.content || ""
            );

        if (newText === null) return;

        const text = newText.trim();

        if (!text) {
            toast("Message bo‘sh bo‘lishi mumkin emas", "error");
            return;
        }

        const {
            error
        } = await db
            .from("messages")
            .update({
                content: text,
                edited_at: new Date().toISOString()
            })
            .eq("id", messageId)
            .eq("sender_id", currentUser.id);

        if (error) {
            console.error(error);
            toast("Message edit qilinmadi", "error");
            return;
        }

        toast("Message o‘zgartirildi ✓", "success");

        if (currentChatType === "direct") {
            await loadDirectMessages(
                currentChatUser.id
            );
        } else if (currentChatType === "group") {
            await loadGroupMessages(
                currentGroup.id
            );
        }
    }

    /* =========================================================
       DELETE MESSAGE
       ========================================================= */

    async function deleteMessage(messageId) {
        const message =
            currentMessages.find(
                item => String(item.id) === String(messageId)
            );

        if (!message) return;

        if (message.sender_id !== currentUser.id) {
            toast("Faqat o‘zingizning message'ingizni o‘chira olasiz");
            return;
        }

        const confirmed =
            window.confirm("Message'ni o‘chirasizmi?");

        if (!confirmed) return;

        const {
            error
        } = await db
            .from("messages")
            .update({
                deleted_at: new Date().toISOString()
            })
            .eq("id", messageId)
            .eq("sender_id", currentUser.id);

        if (error) {
            console.error(error);
            toast("Message o‘chirilmadi", "error");
            return;
        }

        toast("Message o‘chirildi ✓");

        if (currentChatType === "direct") {
            await loadDirectMessages(
                currentChatUser.id
            );
        }
    }

    /* =========================================================
       SAVE MESSAGE
       ========================================================= */

    async function saveMessage(messageId) {
        if (!currentUser) return;

        const message =
            currentMessages.find(
                item => String(item.id) === String(messageId)
            );

        if (!message) return;

        const {
            error
        } = await db
            .from("saved_messages")
            .insert({
                user_id: currentUser.id,
                message_id: messageId
            });

        if (error) {
            if (
                String(error.message || "")
                    .toLowerCase()
                    .includes("duplicate")
            ) {
                toast("Message allaqachon saqlangan");
            } else {
                console.error(error);
                toast("Message saqlanmadi", "error");
            }

            return;
        }

        message.__saved = true;

        toast("Message saqlandi ★", "success");
    }

    async function loadSavedMessages() {
        if (!currentUser) return;

        const {
            data,
            error
        } = await db
            .from("saved_messages")
            .select("*")
            .eq("user_id", currentUser.id)
            .order("created_at", {
                ascending: false
            });

        if (error) {
            console.error(error);
            return;
        }

        const list = $("#savedMessagesList");

        if (!list) return;

        if (!data?.length) {
            list.innerHTML = `
                <div class="empty-list">
                    No saved messages
                </div>
            `;
            return;
        }

        list.innerHTML = data.map(item => `
            <div class="saved-message-item">
                <span>
                    ${escapeHTML(
                        item.content ||
                        item.message_text ||
                        "Saved message"
                    )}
                </span>
            </div>
        `).join("");
    }

    /* =========================================================
       MESSAGE STATUS
       ========================================================= */

    async function markMessagesSeen(otherUserId) {
        if (!currentUser || !otherUserId) return;

        await db
            .from("messages")
            .update({
                seen_at: new Date().toISOString()
            })
            .eq("sender_id", otherUserId)
            .eq("receiver_id", currentUser.id)
            .is("seen_at", null);
    }

    /* =========================================================
       IMAGE MESSAGE
       ========================================================= */

    async function uploadChatImage(file) {
        if (!file || !currentUser) return;

        if (!currentChatUser) {
            toast("Avval chatni tanlang");
            return;
        }

        const request =
            await getContactStatus(currentChatUser.id);

        if (request?.status !== "accepted") {
            toast("Avval contact qabul qilinishi kerak");
            return;
        }

        const extension =
            file.name.split(".").pop() || "jpg";

        const path =
            `${currentUser.id}/${Date.now()}.${extension}`;

        const {
            error: uploadError
        } = await db.storage
            .from("chat-media")
            .upload(path, file);

        if (uploadError) {
            console.error(uploadError);
            toast("Rasm yuklanmadi", "error");
            return;
        }

        const {
            data: signed,
            error: signedError
        } = await db.storage
            .from("chat-media")
            .createSignedUrl(path, 60 * 60 * 24 * 7);

        if (signedError || !signed?.signedUrl) {
            toast("Rasm URL olinmadi", "error");
            return;
        }

        const {
            error
        } = await db
            .from("messages")
            .insert({
                sender_id: currentUser.id,
                receiver_id: currentChatUser.id,
                content: "",
                message_type: "image",
                image_url: signed.signedUrl
            });

        if (error) {
            console.error(error);
            toast("Rasm message yuborilmadi", "error");
            return;
        }

        await loadDirectMessages(
            currentChatUser.id
        );
    }

    /* =========================================================
       GROUPS
       ========================================================= */

    async function loadGroups() {
        if (!currentUser) return;

        const {
            data: memberships,
            error
        } = await db
            .from("group_members")
            .select("group_id")
            .eq("user_id", currentUser.id);

        if (error) {
            console.error(error);
            return;
        }

        const ids =
            (memberships || []).map(
                item => item.group_id
            );

        if (!ids.length) {
            renderGroups([]);
            return;
        }

        const {
            data: groups,
            error: groupError
        } = await db
            .from("groups")
            .select("*")
            .in("id", ids)
            .order("created_at", {
                ascending: false
            });

        if (groupError) {
            console.error(groupError);
            return;
        }

        renderGroups(groups || []);
    }

    function renderGroups(groups) {
        const list = $("#groupsList");
        if (!list) return;

        setText("#groupCount", String(groups.length));

        if (!groups.length) {
            list.innerHTML = `
                <div class="empty-list">
                    No groups yet
                </div>
            `;
            return;
        }

        list.innerHTML = groups.map(group => `
            <div
                class="group-item"
                data-group-id="${group.id}"
            >
                <div class="group-avatar">
                    ${
                        group.avatar_url
                            ? `<img src="${escapeAttribute(group.avatar_url)}">`
                            : escapeHTML(getInitial(group.name))
                    }
                </div>

                <div class="group-info">
                    <strong>${escapeHTML(group.name)}</strong>
                    <span>@${escapeHTML(group.username || "")}</span>
                </div>
            </div>
        `).join("");

        list.querySelectorAll(".group-item")
            .forEach(item => {
                item.addEventListener("click", () => {
                    openGroup(item.dataset.groupId);
                });
            });
    }

    async function createGroup(event) {
        event?.preventDefault();

        const name =
            $("#groupName")?.value.trim();

        const username =
            $("#groupUsername")?.value.trim();

        const bio =
            $("#groupBio")?.value.trim() || "";

        if (!name || !username) {
            toast("Group name va username kerak", "error");
            return;
        }

        const {
            data,
            error
        } = await db.rpc("create_group", {
            p_name: name,
            p_username: username.toLowerCase(),
            p_bio: bio
        });

        if (error) {
            console.error(error);
            toast(
                error.message || "Group yaratilmadi",
                "error"
            );
            return;
        }

        toast("Group yaratildi ✓", "success");

        closeModal($("#createGroupModal"));

        $("#groupForm")?.reset();

        await loadGroups();

        if (data) {
            await openGroup(data);
        }
    }

    async function openGroup(groupId) {
        const {
            data: group,
            error
        } = await db
            .from("groups")
            .select("*")
            .eq("id", groupId)
            .maybeSingle();

        if (error || !group) {
            toast("Group topilmadi", "error");
            return;
        }

        const {
            data: membership
        } = await db
            .from("group_members")
            .select("*")
            .eq("group_id", groupId)
            .eq("user_id", currentUser.id)
            .maybeSingle();

        currentChatType = "group";
        currentChatId = groupId;
        currentGroup = group;
        currentChannel = null;
        currentChatUser = null;

        showElement($("#activeChat"));
        hideElement($("#chatEmpty"));

        renderGroupHeader(group);

        if (!membership) {
            renderJoinGroupState(group);
            return;
        }

        await loadGroupMessages(groupId);
    }

    function renderGroupHeader(group) {
        const avatar = $("#chatAvatar");
        const name = $("#chatName");
        const verified = $("#chatVerified");
        const status = $("#chatStatus");

        if (avatar) {
            avatar.innerHTML = group.avatar_url
                ? `<img src="${escapeAttribute(group.avatar_url)}">`
                : escapeHTML(getInitial(group.name));
        }

        setText(
            "#chatName",
            group.name || "Group"
        );

        hideElement(verified);

        if (status) {
            status.textContent =
                group.is_public
                    ? "Public group"
                    : "Private group";
        }
    }

    function renderJoinGroupState(group) {
        const messages = $("#messages");
        if (!messages) return;

        messages.innerHTML = `
            <div class="join-chat-state">
                <div class="join-icon">👥</div>

                <h3>${escapeHTML(group.name)}</h3>

                <p>
                    ${group.is_public
                        ? "Join this group to start chatting."
                        : "This group is private. Use an invite code to join."
                    }
                </p>

                <button
                    type="button"
                    id="dynamicJoinGroupBtn"
                >
                    Join
                </button>
            </div>
        `;

        $("#dynamicJoinGroupBtn")
            ?.addEventListener("click", () => {
                if (group.is_public) {
                    toast(
                        "Public join RPC mavjud emas. Invite code orqali qo‘shiling."
                    );
                } else {
                    openModal($("#joinGroupModal"));
                }
            });

        const input = $("#messageInput");
        const send = $("#sendButton");

        if (input) input.disabled = true;
        if (send) send.disabled = true;
    }

    async function loadGroupMessages(groupId) {
        const {
            data,
            error
        } = await db
            .from("group_messages")
            .select("*")
            .eq("group_id", groupId)
            .is("deleted_at", null)
            .order("created_at", {
                ascending: true
            });

        if (error) {
            console.error(error);
            toast("Group messages yuklanmadi", "error");
            return;
        }

        currentMessages = data || [];

        renderGroupMessages(currentMessages);

        const input = $("#messageInput");
        const send = $("#sendButton");

        if (input) input.disabled = false;
        if (send) send.disabled = false;
    }

    function renderGroupMessages(messages) {
        const container = $("#messages");
        if (!container) return;

        if (!messages.length) {
            container.innerHTML = `
                <div class="empty-chat">
                    <p>No group messages yet</p>
                </div>
            `;
            return;
        }

        container.innerHTML = messages
            .map(message => renderMessage(message, "group"))
            .join("");

        bindMessageActions();
        initializeMessageSwipes();

        scrollMessagesToBottom();
    }

    async function sendGroupMessage(text) {
        if (!currentGroup) return;

        const {
            data: member
        } = await db
            .from("group_members")
            .select("role")
            .eq("group_id", currentGroup.id)
            .eq("user_id", currentUser.id)
            .maybeSingle();

        if (!member) {
            toast("Avval groupga join qiling");
            return;
        }

        text = text.trim();

        if (!text) return;

        const {
            error
        } = await db
            .from("group_messages")
            .insert({
                group_id: currentGroup.id,
                sender_id: currentUser.id,
                content: text,
                message_type: "text"
            });

        if (error) {
            console.error(error);
            toast("Group message yuborilmadi", "error");
            return;
        }

        $("#messageInput").value = "";

        await loadGroupMessages(
            currentGroup.id
        );
    }

    /* =========================================================
       JOIN GROUP
       ========================================================= */

    async function joinGroup() {
        const code =
            $("#groupInviteInput")?.value.trim();

        if (!code) {
            toast("Invite code kiriting", "error");
            return;
        }

        const {
            data,
            error
        } = await db.rpc(
            "join_group_by_invite",
            {
                p_invite_code: code
            }
        );

        if (error) {
            console.error(error);
            toast(
                error.message || "Groupga qo‘shilmadi",
                "error"
            );
            return;
        }

        toast("Groupga qo‘shildingiz ✓", "success");

        closeModal($("#joinGroupModal"));

        if ($("#groupInviteInput")) {
            $("#groupInviteInput").value = "";
        }

        await loadGroups();

        if (data) {
            await openGroup(data);
        }
    }

    /* =========================================================
       CHANNELS
       ========================================================= */

    async function loadChannels() {
        if (!currentUser) return;

        const {
            data: memberships,
            error
        } = await db
            .from("channel_members")
            .select("channel_id")
            .eq("user_id", currentUser.id);

        if (error) {
            console.error(error);
            return;
        }

        const ids =
            (memberships || []).map(
                item => item.channel_id
            );

        if (!ids.length) {
            renderChannels([]);
            return;
        }

        const {
            data: channels,
            error: channelError
        } = await db
            .from("channels")
            .select("*")
            .in("id", ids)
            .order("created_at", {
                ascending: false
            });

        if (channelError) {
            console.error(channelError);
            return;
        }

        renderChannels(channels || []);
    }

    function renderChannels(channels) {
        const list = $("#channelsList");
        if (!list) return;

        setText(
            "#channelCount",
            String(channels.length)
        );

        if (!channels.length) {
            list.innerHTML = `
                <div class="empty-list">
                    No channels yet
                </div>
            `;
            return;
        }

        list.innerHTML = channels.map(channel => `
            <div
                class="channel-item"
                data-channel-id="${channel.id}"
            >
                <div class="channel-avatar">
                    ${
                        channel.avatar_url
                            ? `<img src="${escapeAttribute(channel.avatar_url)}">`
                            : escapeHTML(getInitial(channel.name))
                    }
                </div>

                <div class="channel-info">
                    <strong>${escapeHTML(channel.name)}</strong>
                    <span>@${escapeHTML(channel.username || "")}</span>
                </div>
            </div>
        `).join("");

        list.querySelectorAll(".channel-item")
            .forEach(item => {
                item.addEventListener("click", () => {
                    openChannel(
                        item.dataset.channelId
                    );
                });
            });
    }

    async function createChannel(event) {
        event?.preventDefault();

        const name =
            $("#channelName")?.value.trim();

        const username =
            $("#channelUsername")?.value.trim();

        const bio =
            $("#channelBio")?.value.trim() || "";

        if (!name || !username) {
            toast(
                "Channel name va username kerak",
                "error"
            );
            return;
        }

        const {
            data,
            error
        } = await db.rpc("create_channel", {
            p_name: name,
            p_username: username.toLowerCase(),
            p_bio: bio
        });

        if (error) {
            console.error(error);
            toast(
                error.message || "Channel yaratilmadi",
                "error"
            );
            return;
        }

        toast("Channel yaratildi ✓", "success");

        closeModal($("#createChannelModal"));

        $("#channelForm")?.reset();

        await loadChannels();

        if (data) {
            await openChannel(data);
        }
    }

    async function openChannel(channelId) {
        const {
            data: channel,
            error
        } = await db
            .from("channels")
            .select("*")
            .eq("id", channelId)
            .maybeSingle();

        if (error || !channel) {
            toast("Channel topilmadi", "error");
            return;
        }

        const {
            data: membership
        } = await db
            .from("channel_members")
            .select("*")
            .eq("channel_id", channelId)
            .eq("user_id", currentUser.id)
            .maybeSingle();

        currentChatType = "channel";
        currentChatId = channelId;
        currentChannel = channel;
        currentGroup = null;
        currentChatUser = null;

        showElement($("#activeChat"));
        hideElement($("#chatEmpty"));

        renderChannelHeader(channel);

        if (!membership) {
            renderJoinChannelState(channel);
            return;
        }

        await loadChannelMessages(channelId);
    }

    function renderChannelHeader(channel) {
        const avatar = $("#chatAvatar");

        if (avatar) {
            avatar.innerHTML = channel.avatar_url
                ? `<img src="${escapeAttribute(channel.avatar_url)}">`
                : escapeHTML(getInitial(channel.name));
        }

        setText(
            "#chatName",
            channel.name || "Channel"
        );

        hideElement($("#chatVerified"));

        setText(
            "#chatStatus",
            channel.is_public
                ? "Public channel"
                : "Private channel"
        );
    }

    function renderJoinChannelState(channel) {
        const messages = $("#messages");
        if (!messages) return;

        messages.innerHTML = `
            <div class="join-chat-state">

                <div class="join-icon">📢</div>

                <h3>${escapeHTML(channel.name)}</h3>

                <p>
                    ${
                        channel.is_public
                            ? "Join this channel to view and interact."
                            : "This channel is private."
                    }
                </p>

                <button
                    type="button"
                    id="dynamicJoinChannelBtn"
                >
                    Join
                </button>

            </div>
        `;

        $("#dynamicJoinChannelBtn")
            ?.addEventListener("click", () => {
                if (channel.is_public) {
                    toast(
                        "Public join RPC mavjud emas. Invite code orqali qo‘shiling."
                    );
                } else {
                    openModal(
                        $("#joinChannelModal")
                    );
                }
            });

        if ($("#messageInput")) {
            $("#messageInput").disabled = true;
        }

        if ($("#sendButton")) {
            $("#sendButton").disabled = true;
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
            .is("deleted_at", null)
            .order("created_at", {
                ascending: true
            });

        if (error) {
            console.error(error);
            toast(
                "Channel messages yuklanmadi",
                "error"
            );
            return;
        }

        currentMessages = data || [];

        renderChannelMessages(currentMessages);
    }

    function renderChannelMessages(messages) {
        const container = $("#messages");
        if (!container) return;

        if (!messages.length) {
            container.innerHTML = `
                <div class="empty-chat">
                    <p>No channel messages yet</p>
                </div>
            `;
            return;
        }

        container.innerHTML = messages
            .map(message =>
                renderMessage(
                    message,
                    "channel"
                )
            )
            .join("");

        bindMessageActions();
        initializeMessageSwipes();

        scrollMessagesToBottom();
    }

    async function sendChannelMessage(text) {
        if (!currentChannel) return;

        const allowed =
            await isChannelWriter(
                currentChannel.id
            );

        if (!allowed) {
            toast(
                "Siz bu channelga message yubora olmaysiz"
            );
            return;
        }

        text = text.trim();

        if (!text) return;

        const {
            error
        } = await db
            .from("channel_messages")
            .insert({
                channel_id: currentChannel.id,
                sender_id: currentUser.id,
                content: text,
                message_type: "text"
            });

        if (error) {
            console.error(error);
            toast(
                "Channel message yuborilmadi",
                "error"
            );
            return;
        }

        $("#messageInput").value = "";

        await loadChannelMessages(
            currentChannel.id
        );
    }

    async function isChannelWriter(channelId) {
        const {
            data
        } = await db
            .from("channel_members")
            .select("role")
            .eq("channel_id", channelId)
            .eq("user_id", currentUser.id)
            .maybeSingle();

        if (!data) return false;

        return [
            "owner",
            "admin",
            "moderator",
            "writer"
        ].includes(data.role);
    }

    async function joinChannel() {
        const code =
            $("#channelInviteInput")
                ?.value.trim();

        if (!code) {
            toast("Invite code kiriting", "error");
            return;
        }

        const {
            data,
            error
        } = await db.rpc(
            "join_channel_by_invite",
            {
                p_invite_code: code
            }
        );

        if (error) {
            console.error(error);
            toast(
                error.message || "Channelga qo‘shilmadi",
                "error"
            );
            return;
        }

        toast(
            "Channelga qo‘shildingiz ✓",
            "success"
        );

        closeModal(
            $("#joinChannelModal")
        );

        if ($("#channelInviteInput")) {
            $("#channelInviteInput").value = "";
        }

        await loadChannels();

        if (data) {
            await openChannel(data);
        }
    }

    /* =========================================================
       GROUP / CHANNEL INFO
       ========================================================= */

    async function openGroupInfo(group = currentGroup) {
        if (!group) return;

        setText(
            "#groupInfoName",
            group.name
        );

        setText(
            "#groupInfoUsername",
            group.username
                ? "@" + group.username
                : ""
        );

        setText(
            "#groupInfoBio",
            group.bio || ""
        );

        openModal(
            $("#groupInfoModal")
        );
    }

    async function openChannelInfo(channel = currentChannel) {
        if (!channel) return;

        setText(
            "#channelInfoName",
            channel.name
        );

        setText(
            "#channelInfoUsername",
            channel.username
                ? "@" + channel.username
                : ""
        );

        setText(
            "#channelInfoBio",
            channel.bio || ""
        );

        openModal(
            $("#channelInfoModal")
        );
    }

    async function createGroupInvite() {
        if (!currentGroup) return;

        const {
            data,
            error
        } = await db
            .from("group_invites")
            .insert({
                group_id: currentGroup.id,
                created_by: currentUser.id
            })
            .select("*")
            .single();

        if (error) {
            console.error(error);
            toast(
                "Invite yaratilmadi",
                "error"
            );
            return;
        }

        const code =
            data.invite_code ||
            data.code;

        copyText(code);

        toast(
            `Invite code: ${code}`,
            "success"
        );
    }

    async function createChannelInvite() {
        if (!currentChannel) return;

        const {
            data,
            error
        } = await db
            .from("channel_invites")
            .insert({
                channel_id: currentChannel.id,
                created_by: currentUser.id
            })
            .select("*")
            .single();

        if (error) {
            console.error(error);
            toast(
                "Invite yaratilmadi",
                "error"
            );
            return;
        }

        const code =
            data.invite_code ||
            data.code;

        copyText(code);

        toast(
            `Invite code: ${code}`,
            "success"
        );
    }

    async function copyText(value) {
        if (!value) return;

        try {
            await navigator.clipboard.writeText(
                String(value)
            );

            toast("Copied ✓", "success");
        } catch {
            window.prompt(
                "Copy this text:",
                String(value)
            );
        }
    }

    /* =========================================================
       MEMBERS
       ========================================================= */

    async function showGroupMembers() {
        if (!currentGroup) return;

        const {
            data: members,
            error
        } = await db
            .from("group_members")
            .select("user_id,role")
            .eq("group_id", currentGroup.id);

        if (error) {
            console.error(error);
            toast(
                "Members yuklanmadi",
                "error"
            );
            return;
        }

        await renderMembers(
            members || [],
            "Group members"
        );
    }

    async function showChannelMembers() {
        if (!currentChannel) return;

        const {
            data: members,
            error
        } = await db
            .from("channel_members")
            .select("user_id,role")
            .eq("channel_id", currentChannel.id);

        if (error) {
            console.error(error);
            toast(
                "Members yuklanmadi",
                "error"
            );
            return;
        }

        await renderMembers(
            members || [],
            "Channel members"
        );
    }

    async function renderMembers(members, title) {
        const ids =
            members.map(item => item.user_id);

        const list = $("#membersList");

        if (!list) return;

        setText(
            "#membersTitle",
            title
        );

        if (!ids.length) {
            list.innerHTML = `
                <div class="empty-list">
                    No members
                </div>
            `;

            openModal(
                $("#membersModal")
            );

            return;
        }

        const {
            data: profiles
        } = await db
            .from("profiles")
            .select("*")
            .in("id", ids);

        list.innerHTML =
            members.map(member => {
                const user =
                    profiles?.find(
                        p => p.id === member.user_id
                    );

                if (!user) return "";

                return `
                    <div class="member-item">

                        <div class="user-avatar">
                            ${
                                user.avatar_url
                                    ? `<img src="${escapeAttribute(user.avatar_url)}">`
                                    : escapeHTML(
                                        getInitial(
                                            user.full_name ||
                                            user.username
                                        )
                                    )
                            }
                        </div>

                        <div class="user-info">

                            <strong>
                                ${escapeHTML(
                                    user.full_name ||
                                    user.username
                                )}

                                ${verifiedHTML(
                                    user.is_verified
                                )}
                            </strong>

                            <span>
                                @${escapeHTML(
                                    user.username || ""
                                )}
                            </span>

                        </div>

                        <small>
                            ${escapeHTML(member.role || "member")}
                        </small>

                    </div>
                `;
            }).join("");

        openModal(
            $("#membersModal")
        );
    }

    async function leaveGroup() {
        if (!currentGroup) return;

        if (
            !window.confirm(
                "Groupdan chiqmoqchimisiz?"
            )
        ) return;

        const {
            error
        } = await db
            .from("group_members")
            .delete()
            .eq("group_id", currentGroup.id)
            .eq("user_id", currentUser.id);

        if (error) {
            console.error(error);
            toast(
                "Groupdan chiqib bo‘lmadi",
                "error"
            );
            return;
        }

        toast("Groupdan chiqdingiz");

        closeModal(
            $("#groupInfoModal")
        );

        currentGroup = null;
        currentChatType = null;

        resetChat();

        await loadGroups();
    }

    async function leaveChannel() {
        if (!currentChannel) return;

        if (
            !window.confirm(
                "Channeldan chiqmoqchimisiz?"
            )
        ) return;

        const {
            error
        } = await db
            .from("channel_members")
            .delete()
            .eq("channel_id", currentChannel.id)
            .eq("user_id", currentUser.id);

        if (error) {
            console.error(error);
            toast(
                "Channeldan chiqib bo‘lmadi",
                "error"
            );
            return;
        }

        toast("Channeldan chiqdingiz");

        closeModal(
            $("#channelInfoModal")
        );

        currentChannel = null;
        currentChatType = null;

        resetChat();

        await loadChannels();
    }

    /* =========================================================
       PROFILE POPUP
       ========================================================= */

    async function openUserProfile(userId) {
        if (!userId) return;

        const {
            data: user,
            error
        } = await db
            .from("profiles")
            .select("*")
            .eq("id", userId)
            .maybeSingle();

        if (error || !user) {
            toast(
                "Profile topilmadi",
                "error"
            );
            return;
        }

        currentProfileUser = user;

        const name =
            user.full_name ||
            user.username ||
            "User";

        setText(
            "#userProfileName",
            name
        );

        setText(
            "#userProfileUsername",
            user.username
                ? "@" + user.username
                : ""
        );

        setText(
            "#userProfileBio",
            user.bio || ""
        );

        const verified =
            $("#userProfileVerified");

        if (verified) {
            verified.style.display =
                user.is_verified === true
                    ? "inline-flex"
                    : "none";
        }

        const avatar =
            $("#userProfileAvatar");

        if (avatar) {
            if (user.avatar_url) {
                avatar.innerHTML = `
                    <img
                        src="${escapeAttribute(user.avatar_url)}"
                        alt=""
                    >
                `;
            } else {
                avatar.textContent =
                    getInitial(name);
            }

            avatar.style.width = "110px";
            avatar.style.height = "110px";
            avatar.style.aspectRatio = "1 / 1";
        }

        closeAllMenus();

        openModal(
            $("#userProfileModal")
        );
    }

    function toggleUserProfileMenu() {
        const menu =
            $("#userProfileMenu");

        if (!menu) return;

        const visible =
            menu.classList.contains("show");

        if (visible) {
            menu.classList.remove("show");
            menu.style.display = "none";
        } else {
            menu.classList.add("show");
            menu.style.display = "block";
        }
    }

    /* =========================================================
       NICKNAME
       ========================================================= */

    async function saveNickname() {
        if (!currentProfileUser) return;

        const nickname =
            window.prompt(
                "Nickname:",
                ""
            );

        if (nickname === null) return;

        const value =
            nickname.trim();

        if (!value) {
            toast(
                "Nickname bo‘sh bo‘lishi mumkin emas",
                "error"
            );
            return;
        }

        const {
            error
        } = await db
            .from("contact_nicknames")
            .upsert({
                user_id: currentUser.id,
                contact_id: currentProfileUser.id,
                nickname: value
            }, {
                onConflict:
                    "user_id,contact_id"
            });

        if (error) {
            console.error(error);
            toast(
                "Nickname saqlanmadi",
                "error"
            );
            return;
        }

        toast(
            "Nickname saqlandi ✓",
            "success"
        );

        closeAllMenus();
    }

    async function removeNickname() {
        if (!currentProfileUser) return;

        const {
            error
        } = await db
            .from("contact_nicknames")
            .delete()
            .eq("user_id", currentUser.id)
            .eq("contact_id", currentProfileUser.id);

        if (error) {
            console.error(error);
            toast(
                "Nickname o‘chirilmadi",
                "error"
            );
            return;
        }

        toast(
            "Nickname o‘chirildi ✓",
            "success"
        );

        closeAllMenus();
    }

    /* =========================================================
       BLOCK
       ========================================================= */

    async function blockUser() {
        if (!currentProfileUser) return;

        if (
            !window.confirm(
                "Bu userni block qilmoqchimisiz?"
            )
        ) return;

        const {
            error
        } = await db
            .from("user_blocks")
            .upsert({
                blocker_id: currentUser.id,
                blocked_id: currentProfileUser.id
            }, {
                onConflict:
                    "blocker_id,blocked_id"
            });

        if (error) {
            console.error(error);
            toast(
                "User block qilinmadi",
                "error"
            );
            return;
        }

        toast(
            "User block qilindi",
            "success"
        );

        closeAllMenus();

        closeModal(
            $("#userProfileModal")
        );

        if (
            currentChatUser?.id ===
            currentProfileUser.id
        ) {
            resetChat();
        }
    }

    /* =========================================================
       REPORT
       ========================================================= */

    async function reportUser() {
        if (!currentProfileUser) return;

        const reason =
            window.prompt(
                "Report reason:"
            );

        if (reason === null) return;

        const value =
            reason.trim();

        if (!value) {
            toast(
                "Reason kiriting",
                "error"
            );
            return;
        }

        const {
            error
        } = await db
            .from("reports")
            .insert({
                reporter_id: currentUser.id,
                reported_user_id:
                    currentProfileUser.id,
                reason: value,
                status: "pending"
            });

        if (error) {
            console.error(error);
            toast(
                "Report yuborilmadi",
                "error"
            );
            return;
        }

        toast(
            "Report yuborildi ✓",
            "success"
        );

        closeAllMenus();
    }

    /* =========================================================
       PROFILE SETTINGS
       ========================================================= */

    async function saveProfile(event) {
        event?.preventDefault();

        const fullName =
            $("#profileFullName")
                ?.value.trim();

        const username =
            $("#profileUsername")
                ?.value.trim()
                .toLowerCase();

        const bio =
            $("#profileBio")
                ?.value.trim() || "";

        if (!fullName || !username) {
            toast(
                "Name va username kerak",
                "error"
            );
            return;
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
            .eq("id", currentUser.id);

        if (error) {
            console.error(error);
            toast(
                error.message ||
                "Profile saqlanmadi",
                "error"
            );
            return;
        }

        await loadMyProfile();

        closeModal(
            $("#profileModal")
        );

        toast(
            "Profile saqlandi ✓",
            "success"
        );
    }

    async function loadProfileForm() {
        if (!myProfile) return;

        if ($("#profileFullName")) {
            $("#profileFullName").value =
                myProfile.full_name || "";
        }

        if ($("#profileUsername")) {
            $("#profileUsername").value =
                myProfile.username || "";
        }

        if ($("#profileBio")) {
            $("#profileBio").value =
                myProfile.bio || "";
        }
    }

    /* =========================================================
       AVATAR
       ========================================================= */

    async function uploadProfileAvatar(file) {
        if (!file || !currentUser) return;

        const extension =
            file.name.split(".").pop() || "jpg";

        const path =
            `${currentUser.id}/avatar-${Date.now()}.${extension}`;

        const {
            error: uploadError
        } = await db.storage
            .from("avatars")
            .upload(
                path,
                file,
                {
                    upsert: true
                }
            );

        if (uploadError) {
            console.error(uploadError);
            toast(
                "Avatar yuklanmadi",
                "error"
            );
            return;
        }

        const {
            data
        } = db.storage
            .from("avatars")
            .getPublicUrl(path);

        const url =
            data?.publicUrl;

        if (!url) {
            toast(
                "Avatar URL olinmadi",
                "error"
            );
            return;
        }

        const {
            error
        } = await db
            .from("profiles")
            .update({
                avatar_url: url
            })
            .eq("id", currentUser.id);

        if (error) {
            console.error(error);
            toast(
                "Avatar saqlanmadi",
                "error"
            );
            return;
        }

        await loadMyProfile();

        toast(
            "Avatar o‘zgartirildi ✓",
            "success"
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
            $("#showOnlineToggle")
                ?.checked ?? true;

        const showLastSeen =
            $("#showLastSeenToggle")
                ?.checked ?? true;

        const {
            error
        } = await db
            .from("profiles")
            .update({
                show_online: showOnline,
                show_last_seen: showLastSeen
            })
            .eq("id", currentUser.id);

        if (error) {
            console.error(error);
            toast(
                "Privacy sozlamalari saqlanmadi",
                "error"
            );
            return;
        }

        myProfile.show_online =
            showOnline;

        myProfile.show_last_seen =
            showLastSeen;

        toast(
            "Privacy settings saqlandi ✓",
            "success"
        );
    }

    /* =========================================================
       APPEARANCE
       ========================================================= */

    function setupAppearance() {
        $$(".appearance-option")
            .forEach(option => {
                option.addEventListener(
                    "click",
                    () => {
                        const theme =
                            option.dataset.theme;

                        const density =
                            option.dataset.density;

                        if (theme) {
                            document.body.dataset.theme =
                                theme;

                            localStorage.setItem(
                                "megchat_theme",
                                theme
                            );
                        }

                        if (density) {
                            document.body.dataset.density =
                                density;

                            localStorage.setItem(
                                "megchat_density",
                                density
                            );
                        }

                        $$(".appearance-option")
                            .forEach(item =>
                                item.classList.remove(
                                    "active"
                                )
                            );

                        option.classList.add(
                            "active"
                        );
                    }
                );
            });

        const savedTheme =
            localStorage.getItem(
                "megchat_theme"
            );

        const savedDensity =
            localStorage.getItem(
                "megchat_density"
            );

        if (savedTheme) {
            document.body.dataset.theme =
                savedTheme;
        }

        if (savedDensity) {
            document.body.dataset.density =
                savedDensity;
        }
    }

    /* =========================================================
       LANGUAGE
       ========================================================= */

    function setupLanguage() {
        $$(".language-option")
            .forEach(option => {
                option.addEventListener(
                    "click",
                    () => {
                        const language =
                            option.dataset.language;

                        if (!language) return;

                        localStorage.setItem(
                            "megchat_language",
                            language
                        );

                        $$(".language-option")
                            .forEach(item =>
                                item.classList.remove(
                                    "active"
                                )
                            );

                        option.classList.add(
                            "active"
                        );

                        toast(
                            "Language setting saved"
                        );
                    }
                );
            });
    }

    /* =========================================================
       EMOJI
       ========================================================= */

    function setupEmoji() {
        const panel =
            $("#emojiPanel");

        const button =
            $("#emojiBtn");

        const input =
            $("#messageInput");

        if (!panel || !button || !input) return;

        const emojis = [
            "😀","😃","😄","😁","😆",
            "😅","😂","🤣","😊","🙂",
            "🙃","😉","😎","😍","🥰",
            "😘","😜","🤪","🤔","🤨",
            "😐","😑","😶","🙄","😏",
            "😴","🤯","😱","😭","😡",
            "👍","👎","👏","🙏","🔥",
            "❤️","💙","💚","💛","💜",
            "✨","🎉","😂","💀","👀"
        ];

        panel.innerHTML = emojis.map(
            emoji =>
                `<button type="button" class="emoji-item">${emoji}</button>`
        ).join("");

        button.addEventListener(
            "click",
            e => {
                e.stopPropagation();

                panel.classList.toggle(
                    "show"
                );
            }
        );

        panel.querySelectorAll(
            ".emoji-item"
        ).forEach(item => {
            item.addEventListener(
                "click",
                () => {
                    input.value +=
                        item.textContent;

                    input.focus();
                }
            );
        });
    }

    /* =========================================================
       STICKERS
       ========================================================= */

    function setupStickers() {
        const panel =
            $("#stickerPanel");

        const button =
            $("#stickerBtn");

        if (!panel || !button) return;

        button.addEventListener(
            "click",
            e => {
                e.stopPropagation();

                panel.classList.toggle(
                    "show"
                );
            }
        );
    }

    /* =========================================================
       SETTINGS
       ========================================================= */

    function setupSettings() {
        $("#myProfileBtn")
            ?.addEventListener(
                "click",
                async () => {
                    await loadProfileForm();
                    openModal(
                        $("#profileModal")
                    );
                }
            );

        $("#profileSettingsBtn")
            ?.addEventListener(
                "click",
                async () => {
                    await loadProfileForm();
                    openModal(
                        $("#profileModal")
                    );
                }
            );

        $("#privacySettingsBtn")
            ?.addEventListener(
                "click",
                async () => {
                    await loadPrivacySettings();
                    openModal(
                        $("#privacyModal")
                    );
                }
            );

        $("#appearanceSettingsBtn")
            ?.addEventListener(
                "click",
                () => {
                    openModal(
                        $("#appearanceModal")
                    );
                }
            );

        $("#languageSettingsBtn")
            ?.addEventListener(
                "click",
                () => {
                    openModal(
                        $("#languageModal")
                    );
                }
            );

        $("#savedMessagesBtn")
            ?.addEventListener(
                "click",
                async () => {
                    await loadSavedMessages();
                    openModal(
                        $("#savedMessagesModal")
                    );
                }
            );

        $("#updatesSettingsBtn")
            ?.addEventListener(
                "click",
                () => {
                    openModal(
                        $("#updatesModal")
                    );
                }
            );

        $("#ownerPanelButton")
            ?.addEventListener(
                "click",
                () => {
                    openModal(
                        $("#ownerModal")
                    );
                }
            );

        $("#adminPanelButton")
            ?.addEventListener(
                "click",
                () => {
                    openModal(
                        $("#adminModal")
                    );
                }
            );

        $("#settingsLogoutBtn")
            ?.addEventListener(
                "click",
                logout
            );
    }

    /* =========================================================
       OWNER
       ========================================================= */

    async function loadOwnerPanel() {
        if (!isOwner()) return;

        const button =
            $("#ownerPanelButton");

        if (button) {
            button.style.display =
                "block";
        }
    }

    async function ownerVerifyUser() {
        if (!isOwner()) {
            toast(
                "Owner access required",
                "error"
            );
            return;
        }

        const username =
            $("#ownerVerifiedUsername")
                ?.value.trim();

        if (!username) {
            toast(
                "Username kiriting",
                "error"
            );
            return;
        }

        const {
            data: user,
            error
        } = await db
            .from("profiles")
            .select("id,username,is_verified")
            .eq("username", username.replace(/^@/, "").toLowerCase())
            .maybeSingle();

        if (error || !user) {
            toast(
                "User topilmadi",
                "error"
            );
            return;
        }

        const {
            error: rpcError
        } = await db.rpc(
            "owner_set_verified",
            {
                p_user_id: user.id,
                p_action:
                    user.is_verified
                        ? "remove"
                        : "give"
            }
        );

        if (rpcError) {
            console.error(rpcError);
            toast(
                rpcError.message ||
                "Verification o‘zgartirilmadi",
                "error"
            );
            return;
        }

        toast(
            user.is_verified
                ? "Verification olib tashlandi"
                : "Verification berildi ✓",
            "success"
        );

        const result =
            $("#ownerVerifiedResult");

        if (result) {
            result.textContent =
                user.is_verified
                    ? "Verification removed"
                    : "User verified";
        }
    }

    async function loadModerationReports() {
        if (!isAdmin()) return;

        const list =
            $("#ownerReportsList") ||
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

        list.innerHTML =
            (data || []).map(report => `
                <div class="report-item">

                    <strong>
                        Report #${report.id}
                    </strong>

                    <span>
                        ${escapeHTML(
                            report.reason || ""
                        )}
                    </span>

                    <small>
                        ${escapeHTML(
                            report.status || "pending"
                        )}
                    </small>

                </div>
            `).join("");
    }

    /* =========================================================
       UPDATES
       ========================================================= */

    async function loadAppUpdates() {
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
            .limit(30);

        if (error) {
            console.error(error);
            return;
        }

        list.innerHTML =
            (data || []).map(update => `
                <div class="update-item">

                    <h3>
                        ${escapeHTML(
                            update.title || ""
                        )}
                    </h3>

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
            `).join("");
    }

    /* =========================================================
       SEARCH
       ========================================================= */

    function setupSearch() {
        const input =
            $("#searchInput");

        if (!input) return;

        let timer = null;

        input.addEventListener(
            "input",
            () => {
                clearTimeout(timer);

                const value =
                    input.value.trim();

                if (!value) {
                    loadContacts();
                    return;
                }

                timer = setTimeout(
                    () => {
                        searchUsers(value);
                    },
                    300
                );
            }
        );
    }

    /* =========================================================
       SIDEBAR TABS
       ========================================================= */

    function setupSidebarTabs() {
        $$(".sidebar-tab")
            .forEach(tab => {
                tab.addEventListener(
                    "click",
                    () => {
                        $$(".sidebar-tab")
                            .forEach(item =>
                                item.classList.remove(
                                    "active"
                                )
                            );

                        tab.classList.add(
                            "active"
                        );

                        const target =
                            tab.dataset.target;

                        $$(".sidebar-section")
                            .forEach(section => {
                                section.style.display =
                                    section.id === target
                                        ? ""
                                        : "none";
                            });
                    }
                );
            });
    }

    /* =========================================================
       MESSAGE SWIPE
       HOLD + SWIPE LEFT ONLY
       ========================================================= */

    function setupMessageSwipe(wrapper) {
        if (!wrapper) return;

        const bubble =
            wrapper.querySelector(
                ".message-bubble"
            );

        if (!bubble) return;

        const HOLD_TIME = 450;
        const SWIPE_DISTANCE = 60;
        const MAX_TRANSLATE = 145;

        let startX = 0;
        let startY = 0;
        let currentX = 0;

        let holdTimer = null;

        let holdStarted = false;
        let movedAfterHold = false;

        function resetSwipe() {
            clearTimeout(holdTimer);

            holdTimer = null;
            holdStarted = false;
            movedAfterHold = false;

            wrapper.classList.remove(
                "swiped"
            );

            bubble.style.transform = "";
        }

        function closeOthers() {
            document
                .querySelectorAll(
                    ".message-wrapper.swiped"
                )
                .forEach(item => {
                    if (item === wrapper) return;

                    item.classList.remove(
                        "swiped"
                    );

                    const itemBubble =
                        item.querySelector(
                            ".message-bubble"
                        );

                    if (itemBubble) {
                        itemBubble.style.transform =
                            "";
                    }
                });
        }

        wrapper.addEventListener(
            "pointerdown",
            e => {
                startX = e.clientX;
                startY = e.clientY;
                currentX = startX;

                holdStarted = false;
                movedAfterHold = false;

                clearTimeout(
                    holdTimer
                );

                holdTimer = setTimeout(
                    () => {
                        holdStarted = true;
                    },
                    HOLD_TIME
                );
            }
        );

        wrapper.addEventListener(
            "pointermove",
            e => {
                currentX = e.clientX;

                const deltaX =
                    currentX - startX;

                const deltaY =
                    Math.abs(
                        e.clientY - startY
                    );

                if (deltaY > 35) {
                    clearTimeout(
                        holdTimer
                    );

                    return;
                }

                /*
                 * HOLD YETARLI EMAS.
                 * HOLD + SWIPE kerak.
                 */
                if (!holdStarted) {
                    return;
                }

                if (deltaX < 0) {
                    movedAfterHold = true;

                    closeOthers();

                    const distance =
                        Math.min(
                            Math.abs(deltaX),
                            MAX_TRANSLATE
                        );

                    bubble.style.transform =
                        `translateX(-${distance}px)`;
                }
            }
        );

        wrapper.addEventListener(
            "pointerup",
            () => {
                clearTimeout(
                    holdTimer
                );

                const deltaX =
                    currentX - startX;

                if (
                    holdStarted &&
                    movedAfterHold &&
                    deltaX <= -SWIPE_DISTANCE
                ) {
                    closeOthers();

                    wrapper.classList.add(
                        "swiped"
                    );

                    bubble.style.transform =
                        `translateX(-${MAX_TRANSLATE}px)`;
                } else {
                    resetSwipe();
                }

                holdStarted = false;
                movedAfterHold = false;
            }
        );

        wrapper.addEventListener(
            "pointercancel",
            resetSwipe
        );

        wrapper
            .querySelectorAll(
                ".message-action"
            )
            .forEach(button => {
                button.addEventListener(
                    "pointerdown",
                    e => {
                        e.stopPropagation();
                    }
                );

                button.addEventListener(
                    "click",
                    e => {
                        e.stopPropagation();
                    }
                );
            });
    }

    function initializeMessageSwipes() {
        $$(".message-wrapper")
            .forEach(setupMessageSwipe);
    }

    document.addEventListener(
        "click",
        e => {
            if (
                e.target.closest(
                    ".message-wrapper"
                )
            ) {
                return;
            }

            $$(".message-wrapper.swiped")
                .forEach(wrapper => {
                    wrapper.classList.remove(
                        "swiped"
                    );

                    const bubble =
                        wrapper.querySelector(
                            ".message-bubble"
                        );

                    if (bubble) {
                        bubble.style.transform =
                            "";
                    }
                });
        }
    );

    /* =========================================================
       CHAT SCROLL
       ========================================================= */

    function scrollMessagesToBottom() {
        const container =
            $("#messages");

        if (!container) return;

        requestAnimationFrame(() => {
            container.scrollTop =
                container.scrollHeight;
        });
    }

    /* =========================================================
       RESET CHAT
       ========================================================= */

    function resetChat() {
        currentChatUser = null;
        currentGroup = null;
        currentChannel = null;

        currentChatType = null;
        currentChatId = null;

        currentMessages = [];

        hideElement(
            $("#activeChat")
        );

        showElement(
            $("#chatEmpty")
        );

        if ($("#messages")) {
            $("#messages").innerHTML = "";
        }

        if ($("#messageInput")) {
            $("#messageInput").value = "";
            $("#messageInput").disabled = true;
        }

        if ($("#sendButton")) {
            $("#sendButton").disabled = true;
        }

        hideElement(
            $("#contactActions")
        );
    }

    /* =========================================================
       MESSAGE FORM
       ========================================================= */

    async function handleMessageSubmit(event) {
        event.preventDefault();

        const input =
            $("#messageInput");

        if (!input) return;

        const text =
            input.value.trim();

        if (!text) return;

        if (currentChatType === "direct") {
            await sendDirectMessage(text);
        }

        if (currentChatType === "group") {
            await sendGroupMessage(text);
        }

        if (currentChatType === "channel") {
            await sendChannelMessage(text);
        }
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

    function setupMessageRealtime() {
        removeRealtimeChannels();

        if (!currentUser) return;

        const channel =
            db.channel(
                `megchat-messages-${currentUser.id}-${Date.now()}`
            );

        channel
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

                    if (
                        !row ||
                        (
                            row.sender_id !== currentUser.id &&
                            row.receiver_id !== currentUser.id
                        )
                    ) {
                        return;
                    }

                    if (
                        currentChatType === "direct" &&
                        currentChatUser
                    ) {
                        await loadDirectMessages(
                            currentChatUser.id
                        );
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
                async () => {
                    await loadContacts();
                    await loadContactRequests();

                    if (currentChatUser) {
                        await updateContactButtons(
                            currentChatUser.id
                        );
                    }
                }
            )
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
                        currentChatType === "group" &&
                        currentGroup &&
                        row?.group_id ===
                            currentGroup.id
                    ) {
                        await loadGroupMessages(
                            currentGroup.id
                        );
                    }
                }
            )
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
                        currentChatType === "channel" &&
                        currentChannel &&
                        row?.channel_id ===
                            currentChannel.id
                    ) {
                        await loadChannelMessages(
                            currentChannel.id
                        );
                    }
                }
            )
            .subscribe();

        realtimeChannels.push(
            channel
        );
    }

    /* =========================================================
       MOBILE
       ========================================================= */

    function setupMobile() {
        $("#mobileBackBtn")
            ?.addEventListener(
                "click",
                () => {
                    resetChat();

                    document.body.classList.remove(
                        "chat-open"
                    );
                }
            );

        $$("#userList .user-item")
            .forEach(item => {
                item.addEventListener(
                    "click",
                    () => {
                        document.body.classList.add(
                            "chat-open"
                        );
                    }
                );
            });
    }

    /* =========================================================
       MODAL CLOSE BUTTONS
       ========================================================= */

    function setupModalCloseButtons() {
        const modalMap = {
            closeGroupBtn:
                "createGroupModal",

            closeChannelBtn:
                "createChannelModal",

            closeUserProfileBtn:
                "userProfileModal"
        };

        Object.entries(
            modalMap
        ).forEach(
            ([buttonId, modalId]) => {
                document
                    .getElementById(buttonId)
                    ?.addEventListener(
                        "click",
                        () => {
                            closeModal(
                                document.getElementById(
                                    modalId
                                )
                            );
                        }
                    );
            }
        );

        $$("[data-close-modal]")
            .forEach(button => {
                button.addEventListener(
                    "click",
                    () => {
                        const id =
                            button.dataset.closeModal;

                        closeModal(
                            document.getElementById(
                                id
                            )
                        );
                    }
                );
            });

        $$(".modal")
            .forEach(modal => {
                modal.addEventListener(
                    "click",
                    e => {
                        if (
                            e.target === modal
                        ) {
                            closeModal(
                                modal
                            );
                        }
                    }
                );
            });
    }

    /* =========================================================
       EVENT SETUP
       ========================================================= */

    function setupEvents() {

        /* MESSAGE */

        $("#messageForm")
            ?.addEventListener(
                "submit",
                handleMessageSubmit
            );

        $("#imageBtn")
            ?.addEventListener(
                "click",
                () => {
                    $("#imageInput")?.click();
                }
            );

        $("#imageInput")
            ?.addEventListener(
                "change",
                async e => {
                    const file =
                        e.target.files?.[0];

                    if (file) {
                        await uploadChatImage(
                            file
                        );
                    }

                    e.target.value = "";
                }
            );

        /* CONTACT */

        $("#addContactBtn")
            ?.addEventListener(
                "click",
                async () => {
                    if (
                        currentChatUser
                    ) {
                        await sendContactRequest(
                            currentChatUser.id
                        );
                    }
                }
            );

        /* CREATE GROUP */

        $("#groupForm")
            ?.addEventListener(
                "submit",
                createGroup
            );

        /* CREATE CHANNEL */

        $("#channelForm")
            ?.addEventListener(
                "submit",
                createChannel
            );

        /* JOIN */

        $("#joinGroupBtn")
            ?.addEventListener(
                "click",
                joinGroup
            );

        $("#joinChannelBtn")
            ?.addEventListener(
                "click",
                joinChannel
            );

        /* GROUP INFO */

        $("#groupInviteBtn")
            ?.addEventListener(
                "click",
                createGroupInvite
            );

        $("#groupMembersBtn")
            ?.addEventListener(
                "click",
                showGroupMembers
            );

        $("#leaveGroupBtn")
            ?.addEventListener(
                "click",
                leaveGroup
            );

        /* CHANNEL INFO */

        $("#channelInviteBtn")
            ?.addEventListener(
                "click",
                createChannelInvite
            );

        $("#channelMembersBtn")
            ?.addEventListener(
                "click",
                showChannelMembers
            );

        $("#leaveChannelBtn")
            ?.addEventListener(
                "click",
                leaveChannel
            );

        /* PROFILE POPUP */

        $("#chatAvatarButton")
            ?.addEventListener(
                "click",
                () => {
                    if (
                        currentChatType ===
                            "direct" &&
                        currentChatUser
                    ) {
                        openUserProfile(
                            currentChatUser.id
                        );
                    }

                    if (
                        currentChatType ===
                            "group"
                    ) {
                        openGroupInfo();
                    }

                    if (
                        currentChatType ===
                            "channel"
                    ) {
                        openChannelInfo();
                    }
                }
            );

        $("#userProfileMenuBtn")
            ?.addEventListener(
                "click",
                e => {
                    e.stopPropagation();
                    toggleUserProfileMenu();
                }
            );

        $("#editNicknameBtn")
            ?.addEventListener(
                "click",
                saveNickname
            );

        $("#removeNicknameBtn")
            ?.addEventListener(
                "click",
                removeNickname
            );

        $("#removeNicknameBtn2")
            ?.addEventListener(
                "click",
                removeNickname
            );

        $("#blockUserBtn")
            ?.addEventListener(
                "click",
                blockUser
            );

        $("#reportUserBtn")
            ?.addEventListener(
                "click",
                reportUser
            );

        /* PROFILE SETTINGS */

        $("#profileForm")
            ?.addEventListener(
                "submit",
                saveProfile
            );

        $("#changeAvatarBtn")
            ?.addEventListener(
                "click",
                () => {
                    $("#profileAvatarInput")
                        ?.click();
                }
            );

        $("#profileAvatarInput")
            ?.addEventListener(
                "change",
                async e => {
                    const file =
                        e.target.files?.[0];

                    if (file) {
                        await uploadProfileAvatar(
                            file
                        );
                    }

                    e.target.value = "";
                }
            );

        /* PRIVACY */

        $("#savePrivacyBtn")
            ?.addEventListener(
                "click",
                savePrivacySettings
            );

        /* OWNER */

        $("#ownerVerifiedSearchBtn")
            ?.addEventListener(
                "click",
                ownerVerifyUser
            );

        /* SEARCH */

        setupSearch();

        /* SETTINGS */

        setupSettings();

        /* TABS */

        setupSidebarTabs();

        /* OTHER */

        setupAppearance();
        setupLanguage();
        setupEmoji();
        setupStickers();
        setupMobile();
        setupModalCloseButtons();

        /* CLOSE MENUS */

        document.addEventListener(
            "click",
            e => {
                if (
                    !e.target.closest(
                        "#userProfileMenu"
                    ) &&
                    !e.target.closest(
                        "#userProfileMenuBtn"
                    )
                ) {
                    closeAllMenus();
                }

                if (
                    !e.target.closest(
                        "#emojiPanel"
                    ) &&
                    !e.target.closest(
                        "#emojiBtn"
                    )
                ) {
                    $("#emojiPanel")
                        ?.classList.remove(
                            "show"
                        );
                }

                if (
                    !e.target.closest(
                        "#stickerPanel"
                    ) &&
                    !e.target.closest(
                        "#stickerBtn"
                    )
                ) {
                    $("#stickerPanel")
                        ?.classList.remove(
                            "show"
                        );
                }
            }
        );
    }

    /* =========================================================
       REFRESH ALL
       ========================================================= */

    async function refreshAll() {
        await loadMyProfile();
        await loadContacts();
        await loadContactRequests();
        await loadGroups();
        await loadChannels();
        await loadAppUpdates();
        await loadPrivacySettings();
        await loadOwnerPanel();
    }

    /* =========================================================
       LOGOUT
       ========================================================= */

    async function logout() {
        try {
            removeRealtimeChannels();

            await db.auth.signOut();
        } catch (error) {
            console.error(error);
        }

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
       GLOBAL FUNCTIONS
       ========================================================= */

    window.openDirectChat =
        openDirectChat;

    window.openGroup =
        openGroup;

    window.openChannel =
        openChannel;

    window.openUserProfile =
        openUserProfile;

    window.logout =
        logout;

    window.createGroup =
        createGroup;

    window.createChannel =
        createChannel;

    window.joinGroup =
        joinGroup;

    window.joinChannel =
        joinChannel;

    window.saveNickname =
        saveNickname;

    window.removeNickname =
        removeNickname;

    window.blockUser =
        blockUser;

    window.reportUser =
        reportUser;

    window.loadSavedMessages =
        loadSavedMessages;

    /* =========================================================
       INITIALIZE
       ========================================================= */

    async function init() {
        const user =
            await loadCurrentUser();

        if (!user) return;

        await loadMyProfile();

        setupEvents();

        await refreshAll();

        setupMessageRealtime();

        console.log(
            "MegChatBox dashboard ready ✓"
        );
    }

    init();

})();
