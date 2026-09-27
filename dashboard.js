(async function () {
    "use strict";

    /* =========================================================
       MEGCHATBOX V2.1
       ========================================================= */

    const db = supabaseClient;

    const $ = (selector) =>
        document.querySelector(selector);

    const $$ = (selector) =>
        [...document.querySelectorAll(selector)];


    /* =========================================================
       STATE
       ========================================================= */

    let currentUser = null;
    let currentProfile = null;

    let selectedUser = null;
    let selectedGroup = null;
    let selectedChannel = null;

    let currentTab = "chats";
    let currentChatType = null;

    let realtimeChannel = null;
    let lastSeenInterval = null;

    let editingMessageId = null;

    let contactsCache = [];
    let groupsCache = [];
    let channelsCache = [];

    let currentTheme =
        localStorage.getItem("megchatbox-theme") ||
        "dark";

    let currentLanguage =
        localStorage.getItem("megchatbox-language") ||
        "en";


    /* =========================================================
       HELPERS
       ========================================================= */

    function escapeHTML(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }


    function getInitial(name) {
        return String(name || "?")
            .trim()
            .charAt(0)
            .toUpperCase();
    }


    function formatTime(date) {
        if (!date) return "";

        return new Date(date).toLocaleTimeString(
            [],
            {
                hour: "2-digit",
                minute: "2-digit"
            }
        );
    }


    function formatDate(date) {
        if (!date) return "";

        return new Date(date).toLocaleDateString(
            [],
            {
                day: "numeric",
                month: "short",
                year: "numeric"
            }
        );
    }


    function showToast(message, type = "info") {
        let toast = $("#toast");

        if (!toast) {
            toast = document.createElement("div");
            toast.id = "toast";
            toast.className = "toast";
            document.body.appendChild(toast);
        }

        toast.textContent = message;
        toast.className =
            `toast show ${type}`;

        clearTimeout(
            showToast.timer
        );

        showToast.timer =
            setTimeout(() => {
                toast.classList.remove("show");
            }, 3000);
    }


    function openModal(id) {
        const modal =
            typeof id === "string"
                ? document.getElementById(id)
                : id;

        if (!modal) return;

        modal.classList.add("show");
    }


    function closeModal(id) {
        const modal =
            typeof id === "string"
                ? document.getElementById(id)
                : id;

        if (!modal) return;

        modal.classList.remove("show");
    }


    function closeAllModals() {
        $$(".modal-overlay")
            .forEach(modal =>
                modal.classList.remove("show")
            );
    }


    function setAvatar(element, user) {
        if (!element) return;

        element.innerHTML = "";

        if (user?.avatar_url) {
            const img =
                document.createElement("img");

            img.src = user.avatar_url;
            img.alt =
                user.full_name ||
                user.username ||
                "Avatar";

            img.loading = "lazy";

            element.appendChild(img);
            return;
        }

        element.textContent =
            getInitial(
                user?.full_name ||
                user?.username
            );
    }


    function getUserStatus(user) {
        if (!user) return "";

        if (
            user.account_blocked ||
            (
                user.account_blocked_until &&
                new Date(
                    user.account_blocked_until
                ) > new Date()
            )
        ) {
            return "Account blocked";
        }

        if (
            user.show_online !== false &&
            user.last_seen &&
            Date.now() -
                new Date(user.last_seen).getTime()
                < 120000
        ) {
            return "Online";
        }

        if (
            user.show_last_seen !== false &&
            user.last_seen
        ) {
            return `Last seen ${formatTime(
                user.last_seen
            )}`;
        }

        return "Offline";
    }


    function renderUserStatus(user) {
        const status =
            $("#chatStatus");

        if (!status) return;

        status.textContent =
            getUserStatus(user);
    }


    /* =========================================================
       THEME
       ========================================================= */

    function applyTheme() {
        document.documentElement
            .setAttribute(
                "data-theme",
                currentTheme
            );

        localStorage.setItem(
            "megchatbox-theme",
            currentTheme
        );

        $$(".theme-option")
            .forEach(item => {
                item.classList.toggle(
                    "active",
                    item.dataset.theme ===
                    currentTheme
                );
            });
    }


    function setupAppearance() {
        $$(".theme-option")
            .forEach(option => {
                option.addEventListener(
                    "click",
                    () => {
                        const theme =
                            option.dataset.theme;

                        if (
                            ![
                                "dark",
                                "light"
                            ].includes(theme)
                        ) {
                            return;
                        }

                        currentTheme = theme;

                        applyTheme();

                        showToast(
                            "Appearance updated.",
                            "success"
                        );
                    }
                );
            });

        $$("[data-theme-choice]")
            .forEach(button => {
                button.addEventListener(
                    "click",
                    () => {
                        currentTheme =
                            button.dataset.themeChoice;

                        applyTheme();
                    }
                );
            });
    }


    /* =========================================================
       LANGUAGE
       ========================================================= */

    const translations = {
        en: {
            search: "Search users...",
            selectContact:
                "Select a contact to start chatting.",
            online: "Online",
            offline: "Offline"
        },

        uz: {
            search:
                "Foydalanuvchilarni qidiring...",
            selectContact:
                "Suhbatni boshlash uchun kontakt tanlang.",
            online: "Online",
            offline: "Offline"
        },

        ru: {
            search:
                "Поиск пользователей...",
            selectContact:
                "Выберите контакт, чтобы начать чат.",
            online: "В сети",
            offline: "Не в сети"
        }
    };


    function applyLanguage() {
        const t =
            translations[currentLanguage] ||
            translations.en;

        const search =
            $("#searchInput");

        if (search) {
            search.placeholder =
                t.search;
        }

        const messageInput =
            $("#messageInput");

        if (
            messageInput &&
            !selectedUser &&
            !selectedGroup &&
            !selectedChannel
        ) {
            messageInput.placeholder =
                t.selectContact;
        }
    }


    function setupLanguage() {
        const select =
            $("#languageSelect");

        if (!select) return;

        select.value =
            currentLanguage;

        select.addEventListener(
            "change",
            () => {
                currentLanguage =
                    select.value;

                localStorage.setItem(
                    "megchatbox-language",
                    currentLanguage
                );

                applyLanguage();

                showToast(
                    "Language updated.",
                    "success"
                );
            }
        );
    }


    /* =========================================================
       SESSION
       ========================================================= */

    async function loadSession() {
        const {
            data,
            error
        } = await db.auth.getSession();

        if (error) {
            console.error(error);
            return false;
        }

        currentUser =
            data?.session?.user || null;

        if (!currentUser) {
            window.location.href =
                "index.html";

            return false;
        }

        return true;
    }


    /* =========================================================
       MY PROFILE
       ========================================================= */

    async function loadMyProfile() {
        if (!currentUser) return false;

        const {
            data,
            error
        } = await db
            .from("profiles")
            .select("*")
            .eq("id", currentUser.id)
            .single();

        if (error || !data) {
            console.error(error);

            showToast(
                "Could not load profile.",
                "error"
            );

            return false;
        }

        currentProfile = data;

        renderMyProfile();

        return true;
    }


    function renderMyProfile() {
        if (!currentProfile) return;

        setAvatar(
            $("#myAvatar"),
            currentProfile
        );

        if ($("#myName")) {
            $("#myName").textContent =
                currentProfile.full_name ||
                currentProfile.username;
        }

        if ($("#myUsername")) {
            $("#myUsername").textContent =
                "@" +
                currentProfile.username;
        }

        if ($("#myVerified")) {
            $("#myVerified").style.display =
                currentProfile.is_verified
                    ? "inline-flex"
                    : "none";
        }

        if ($("#profileName")) {
            $("#profileName").value =
                currentProfile.full_name || "";
        }

        if ($("#profileUsername")) {
            $("#profileUsername").value =
                currentProfile.username || "";
        }

        if ($("#profileBio")) {
            $("#profileBio").value =
                currentProfile.bio || "";
        }

        setAvatar(
            $("#profileAvatar"),
            currentProfile
        );

        setupRoleUI();
    }


    /* =========================================================
       ROLE UI
       ========================================================= */

    function isOwner() {
        return currentProfile?.role === "owner";
    }


    function isAdmin() {
        return (
            currentProfile?.role === "admin" ||
            currentProfile?.role === "owner"
        );
    }


    function setupRoleUI() {
        const ownerButton =
            $("#ownerPanelButton");

        const adminButton =
            $("#adminPanelButton");

        if (ownerButton) {
            ownerButton.style.display =
                isOwner()
                    ? "flex"
                    : "none";
        }

        if (adminButton) {
            adminButton.style.display =
                isAdmin()
                    ? "flex"
                    : "none";
        }
    }


    /* =========================================================
       LAST SEEN
       ========================================================= */

    async function updateMyLastSeen() {
        if (!currentUser) return;

        const {
            error
        } = await db
            .from("profiles")
            .update({
                last_seen:
                    new Date().toISOString()
            })
            .eq("id", currentUser.id);

        if (error) {
            console.warn(
                "last_seen:",
                error
            );
        }
    }


    function startLastSeenUpdater() {
        clearInterval(
            lastSeenInterval
        );

        updateMyLastSeen();

        lastSeenInterval =
            setInterval(
                updateMyLastSeen,
                60000
            );
    }


    /* =========================================================
       TABS
       ========================================================= */

    function setupTabs() {
        $$(".tab-btn")
            .forEach(button => {
                button.addEventListener(
                    "click",
                    async () => {
                        $$(".tab-btn")
                            .forEach(btn =>
                                btn.classList.remove(
                                    "active"
                                )
                            );

                        button.classList.add(
                            "active"
                        );

                        currentTab =
                            button.dataset.tab ||
                            "chats";

                        if (
                            currentTab === "chats"
                        ) {
                            await loadContacts();
                        }

                        if (
                            currentTab === "groups"
                        ) {
                            await loadGroups();
                        }

                        if (
                            currentTab === "channels"
                        ) {
                            await loadChannels();
                        }
                    }
                );
            });
    }


    /* =========================================================
       CONTACTS
       ========================================================= */

    async function loadContacts() {
        if (!currentUser) return;

        const {
            data: requests,
            error
        } = await db
            .from("contact_requests")
            .select(`
                *,
                sender:sender_id(*),
                receiver:receiver_id(*)
            `)
            .or(
                `sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`
            )
            .eq("status", "accepted");

        if (error) {
            console.error(error);
            return;
        }

        contactsCache =
            (requests || []).map(request => {
                return request.sender_id ===
                    currentUser.id
                    ? request.receiver
                    : request.sender;
            });

        renderContacts(
            contactsCache
        );
    }


    function renderContacts(users) {
        const list =
            $("#chatList");

        if (!list) return;

        if (!users.length) {
            list.innerHTML = `
                <div class="empty-state">
                    <i class="fa-regular fa-comment"></i>
                    <strong>No contacts yet</strong>
                    <span>Search a username to add someone.</span>
                </div>
            `;

            return;
        }

        list.innerHTML =
            users.map(user => `
                <div
                    class="chat-item"
                    data-user-id="${escapeHTML(user.id)}"
                >
                    <div class="avatar">
                        ${
                            user.avatar_url
                                ? `<img src="${escapeHTML(user.avatar_url)}" alt="">`
                                : escapeHTML(
                                    getInitial(
                                        user.full_name ||
                                        user.username
                                    )
                                )
                        }
                    </div>

                    <div class="chat-info">
                        <span class="chat-info-name">
                            ${escapeHTML(
                                user.full_name ||
                                user.username
                            )}

                            ${
                                user.is_verified
                                    ? `<span class="verified-badge">✓</span>`
                                    : ""
                            }
                        </span>

                        <span class="chat-info-subtitle">
                            @${escapeHTML(
                                user.username
                            )}
                        </span>
                    </div>
                </div>
            `).join("");

        $$(".chat-item[data-user-id]")
            .forEach(item => {
                item.addEventListener(
                    "click",
                    async () => {
                        const user =
                            users.find(
                                u =>
                                    u.id ===
                                    item.dataset.userId
                            );

                        if (user) {
                            await openDirectChat(
                                user
                            );
                        }
                    }
                );
            });
    }


    /* =========================================================
       SEARCH
       ========================================================= */

    function setupSearch() {
        const input =
            $("#searchInput");

        if (!input) return;

        let timer;

        input.addEventListener(
            "input",
            () => {
                clearTimeout(timer);

                timer =
                    setTimeout(
                        () =>
                            searchUsers(
                                input.value
                            ),
                        350
                    );
            }
        );
    }


    async function searchUsers(value) {
        const username =
            value.trim()
                .replace(/^@/, "")
                .toLowerCase();

        if (!username) {
            if (
                currentTab === "chats"
            ) {
                renderContacts(
                    contactsCache
                );
            }

            return;
        }

        const {
            data,
            error
        } = await db
            .from("profiles")
            .select("*")
            .ilike(
                "username",
                `%${username}%`
            )
            .limit(20);

        if (error) {
            console.error(error);
            return;
        }

        renderSearchResults(
            data || []
        );
    }


    function renderSearchResults(users) {
        const list =
            $("#chatList");

        if (!list) return;

        if (!users.length) {
            list.innerHTML = `
                <div class="empty-state">
                    <strong>No users found</strong>
                </div>
            `;

            return;
        }

        list.innerHTML =
            users.map(user => `
                <div class="chat-item">
                    <div class="avatar">
                        ${escapeHTML(
                            getInitial(
                                user.full_name ||
                                user.username
                            )
                        )}
                    </div>

                    <div class="chat-info">
                        <span class="chat-info-name">
                            ${escapeHTML(
                                user.full_name ||
                                user.username
                            )}
                        </span>

                        <span class="chat-info-subtitle">
                            @${escapeHTML(
                                user.username
                            )}
                        </span>
                    </div>

                    ${
                        user.id === currentUser.id
                            ? ""
                            : `
                                <button
                                    class="secondary-btn search-user-btn"
                                    data-user-id="${escapeHTML(user.id)}"
                                >
                                    View
                                </button>
                            `
                    }
                </div>
            `).join("");

        $$(".search-user-btn")
            .forEach(button => {
                button.addEventListener(
                    "click",
                    async () => {
                        const user =
                            users.find(
                                u =>
                                    u.id ===
                                    button.dataset.userId
                            );

                        if (!user) return;

                        selectedUser =
                            user;

                        await updateContactActions();

                        openUserProfilePopup(
                            user
                        );
                    }
                );
            });
    }


    /* =========================================================
       CONTACT REQUESTS
       ========================================================= */

    async function getContactRequest(
        userId
    ) {
        const {
            data
        } = await db
            .from("contact_requests")
            .select("*")
            .or(
                `and(sender_id.eq.${currentUser.id},receiver_id.eq.${userId}),and(sender_id.eq.${userId},receiver_id.eq.${currentUser.id})`
            )
            .maybeSingle();

        return data;
    }


    async function updateContactActions() {
        const add =
            $("#addContactBtn");

        const accept =
            $("#acceptContactBtn");

        const decline =
            $("#declineContactBtn");

        if (!selectedUser) {
            add?.style.setProperty(
                "display",
                "none"
            );

            accept?.style.setProperty(
                "display",
                "none"
            );

            decline?.style.setProperty(
                "display",
                "none"
            );

            return;
        }

        const request =
            await getContactRequest(
                selectedUser.id
            );

        [
            add,
            accept,
            decline
        ].forEach(button => {
            if (button) {
                button.style.display =
                    "none";
            }
        });

        if (!request) {
            if (add) {
                add.style.display =
                    "inline-flex";
            }

            return;
        }

        if (
            request.status ===
            "pending"
        ) {
            if (
                request.receiver_id ===
                currentUser.id
            ) {
                if (accept) {
                    accept.style.display =
                        "inline-flex";
                }

                if (decline) {
                    decline.style.display =
                        "inline-flex";
                }
            }

            return;
        }

        if (
            request.status ===
            "declined"
        ) {
            if (add) {
                add.style.display =
                    "inline-flex";
            }
        }
    }


    async function addContact() {
        if (!selectedUser) return;

        const {
            error
        } = await db
            .from("contact_requests")
            .insert({
                sender_id:
                    currentUser.id,
                receiver_id:
                    selectedUser.id,
                status: "pending"
            });

        if (error) {
            if (
                error.code === "23505"
            ) {
                showToast(
                    "A contact request already exists.",
                    "info"
                );
            } else {
                showToast(
                    error.message,
                    "error"
                );
            }

            return;
        }

        showToast(
            "Contact request sent.",
            "success"
        );

        await updateContactActions();
    }


    async function acceptContact() {
        if (!selectedUser) return;

        const {
            error
        } = await db
            .from("contact_requests")
            .update({
                status: "accepted"
            })
            .eq(
                "sender_id",
                selectedUser.id
            )
            .eq(
                "receiver_id",
                currentUser.id
            )
            .eq(
                "status",
                "pending"
            );

        if (error) {
            showToast(
                error.message,
                "error"
            );

            return;
        }

        showToast(
            "Contact accepted.",
            "success"
        );

        await loadContacts();
        await updateContactActions();
        updateMessageInputState();
    }


    async function declineContact() {
        if (!selectedUser) return;

        const {
            error
        } = await db
            .from("contact_requests")
            .update({
                status: "declined"
            })
            .eq(
                "sender_id",
                selectedUser.id
            )
            .eq(
                "receiver_id",
                currentUser.id
            )
            .eq(
                "status",
                "pending"
            );

        if (error) {
            showToast(
                error.message,
                "error"
            );

            return;
        }

        showToast(
            "Contact request declined.",
            "info"
        );

        await updateContactActions();
        updateMessageInputState();
    }


    /* =========================================================
       DIRECT CHAT
       ========================================================= */

    async function openDirectChat(user) {
        selectedUser = user;

        selectedGroup = null;
        selectedChannel = null;

        currentChatType =
            "direct";

        $("#app")
            ?.classList.add(
                "chat-open"
            );

        if ($("#chatEmpty")) {
            $("#chatEmpty")
                .style.display =
                "none";
        }

        if ($("#activeChat")) {
            $("#activeChat")
                .style.display =
                "flex";
        }

        if ($("#chatName")) {
            $("#chatName")
                .textContent =
                user.full_name ||
                user.username;
        }

        if ($("#chatVerified")) {
            $("#chatVerified")
                .style.display =
                user.is_verified
                    ? "inline-flex"
                    : "none";
        }

        setAvatar(
            $("#chatAvatar"),
            user
        );

        renderUserStatus(
            user
        );

        await updateContactActions();
        await loadMessages();
        await markMessagesDelivered();
        await markChatSeen();

        updateMessageInputState();
    }


    async function hasAcceptedContact() {
        if (!selectedUser) return false;

        const request =
            await getContactRequest(
                selectedUser.id
            );

        return request?.status ===
            "accepted";
    }


    /* =========================================================
       MESSAGE INPUT STATE
       ========================================================= */

    async function updateMessageInputState() {
        const input =
            $("#messageInput");

        const send =
            $("#sendButton");

        const image =
            $("#imageBtn");

        const emoji =
            $("#emojiBtn");

        const sticker =
            $("#stickerBtn");

        if (!input) return;

        let enabled = false;

        if (
            selectedUser &&
            currentChatType ===
            "direct"
        ) {
            enabled =
                await hasAcceptedContact();
        }

        if (
            selectedGroup &&
            currentChatType ===
            "group"
        ) {
            enabled =
                await isGroupMember(
                    selectedGroup.id
                );
        }

        if (
            selectedChannel &&
            currentChatType ===
            "channel"
        ) {
            enabled =
                await isChannelWriter(
                    selectedChannel.id
                );
        }

        [
            input,
            send,
            image,
            emoji,
            sticker
        ].forEach(element => {
            if (element) {
                element.disabled =
                    !enabled;
            }
        });

        if (!enabled) {
            input.placeholder =
                selectedUser
                    ? "Accept contact request first..."
                    : "Select a chat...";
        } else {
            input.placeholder =
                "Write a message...";
        }
    }


    function disableMessageControls() {
        const input =
            $("#messageInput");

        if (!input) return;

        [
            input,
            $("#sendButton"),
            $("#imageBtn"),
            $("#emojiBtn"),
            $("#stickerBtn")
        ].forEach(element => {
            if (element) {
                element.disabled =
                    true;
            }
        });

        input.placeholder =
            "Select a chat...";
    }


    /* =========================================================
       DIRECT MESSAGES
       ========================================================= */

    async function loadMessages() {
        if (
            !selectedUser ||
            !currentUser
        ) {
            return;
        }

        const {
            data,
            error
        } = await db
            .from("messages")
            .select("*")
            .or(
                `and(sender_id.eq.${currentUser.id},receiver_id.eq.${selectedUser.id}),and(sender_id.eq.${selectedUser.id},receiver_id.eq.${currentUser.id})`
            )
            .order(
                "created_at",
                {
                    ascending: true
                }
            );

        if (error) {
            console.error(error);
            return;
        }

        await renderMessages(
            data || []
        );
    }


    async function renderMessages(
        messages
    ) {
        const container =
            $("#messages");

        if (!container) return;

        if (!messages.length) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fa-regular fa-comments"></i>
                    <strong>No messages yet</strong>
                    <span>Start the conversation.</span>
                </div>
            `;

            return;
        }

        container.innerHTML = "";

        let lastDate = "";

        for (
            const message of messages
        ) {
            const date =
                new Date(
                    message.created_at
                ).toDateString();

            if (date !== lastDate) {
                const divider =
                    document.createElement(
                        "div"
                    );

                divider.className =
                    "day-divider";

                divider.textContent =
                    formatDate(
                        message.created_at
                    );

                container.appendChild(
                    divider
                );

                lastDate = date;
            }

            const element =
                await createMessageElement(
                    message
                );

            container.appendChild(
                element
            );
        }

        container.scrollTop =
            container.scrollHeight;
    }


    async function createMessageElement(
        message
    ) {
        const mine =
            message.sender_id ===
            currentUser.id;

        const wrapper =
            document.createElement(
                "div"
            );

        wrapper.className =
            `message-row ${
                mine ? "mine" : "theirs"
            }`;

        wrapper.dataset.messageId =
            message.id;

        const bubble =
            document.createElement(
                "div"
            );

        bubble.className =
            "message-bubble";

        if (
            message.deleted_at
        ) {
            bubble.classList.add(
                "deleted"
            );

            bubble.innerHTML = `
                <span class="deleted-message">
                    Message deleted
                </span>
            `;
        } else if (
            message.message_type ===
            "image"
        ) {
            const image =
                document.createElement(
                    "img"
                );

            image.className =
                "message-image";

            image.alt =
                "Image";

            if (message.image_url) {
                image.src =
                    await getChatMediaUrl(
                        message.image_url
                    );
            }

            bubble.appendChild(
                image
            );

            if (message.content) {
                const caption =
                    document.createElement(
                        "div"
                    );

                caption.className =
                    "message-caption";

                caption.textContent =
                    message.content;

                bubble.appendChild(
                    caption
                );
            }
        } else if (
            message.message_type ===
            "sticker"
        ) {
            const image =
                document.createElement(
                    "img"
                );

            image.className =
                "message-sticker";

            image.alt =
                "Sticker";

            image.src =
                message.sticker_url ||
                "";

            bubble.appendChild(
                image
            );
        } else {
            const text =
                document.createElement(
                    "div"
                );

            text.className =
                "message-text";

            text.textContent =
                message.content || "";

            bubble.appendChild(
                text
            );

            if (message.edited_at) {
                const edited =
                    document.createElement(
                        "span"
                    );

                edited.className =
                    "edited-label";

                edited.textContent =
                    "edited";

                bubble.appendChild(
                    edited
                );
            }
        }

        const footer =
            document.createElement(
                "div"
            );

        footer.className =
            "message-footer";

        const time =
            document.createElement(
                "span"
            );

        time.className =
            "message-time";

        time.textContent =
            formatTime(
                message.created_at
            );

        footer.appendChild(
            time
        );

        if (mine && !message.deleted_at) {
            const status =
                document.createElement(
                    "span"
                );

            status.className =
                "message-status";

            if (message.seen_at) {
                status.textContent =
                    "✓✓";

                status.classList.add(
                    "seen"
                );
            } else if (
                message.delivered_at
            ) {
                status.textContent =
                    "✓✓";
            } else {
                status.textContent =
                    "✓";
            }

            footer.appendChild(
                status
            );
        }

        bubble.appendChild(
            footer
        );

        if (
            mine &&
            !message.deleted_at &&
            message.message_type ===
                "text"
        ) {
            const menu =
                document.createElement(
                    "button"
                );

            menu.type = "button";

            menu.className =
                "message-menu-btn";

            menu.innerHTML =
                '<i class="fa-solid fa-ellipsis"></i>';

            menu.addEventListener(
                "click",
                event => {
                    event.stopPropagation();

                    showMessageMenu(
                        message,
                        menu
                    );
                }
            );

            bubble.appendChild(
                menu
            );
        }

        wrapper.appendChild(
            bubble
        );

        return wrapper;
    }


    async function getChatMediaUrl(
        path
    ) {
        if (!path) return "";

        if (
            path.startsWith("http")
        ) {
            return path;
        }

        const {
            data,
            error
        } = await db.storage
            .from("chat-media")
            .createSignedUrl(
                path,
                3600
            );

        if (error) {
            console.warn(error);
            return "";
        }

        return data?.signedUrl || "";
    }


    /* =========================================================
       MESSAGE MENU
       ========================================================= */

    function showMessageMenu(
        message,
        button
    ) {
        $$(".message-context-menu")
            .forEach(menu =>
                menu.remove()
            );

        const menu =
            document.createElement(
                "div"
            );

        menu.className =
            "message-context-menu";

        menu.innerHTML = `
            <button data-action="edit">
                <i class="fa-solid fa-pen"></i>
                Edit
            </button>

            <button data-action="delete">
                <i class="fa-solid fa-trash"></i>
                Delete
            </button>
        `;

        document.body.appendChild(
            menu
        );

        const rect =
            button.getBoundingClientRect();

        menu.style.position =
            "fixed";

        menu.style.left =
            `${Math.max(
                8,
                rect.left - 120
            )}px`;

        menu.style.top =
            `${rect.bottom + 6}px`;

        menu.querySelector(
            '[data-action="edit"]'
        )?.addEventListener(
            "click",
            async () => {
                menu.remove();

                editingMessageId =
                    message.id;

                const input =
                    $("#messageInput");

                if (input) {
                    input.value =
                        message.content || "";

                    input.focus();
                }

                if ($("#sendButton")) {
                    $("#sendButton")
                        .innerHTML =
                        '<i class="fa-solid fa-check"></i>';
                }
            }
        );

        menu.querySelector(
            '[data-action="delete"]'
        )?.addEventListener(
            "click",
            async () => {
                menu.remove();

                await deleteMessage(
                    message.id
                );
            }
        );

        setTimeout(() => {
            document.addEventListener(
                "click",
                function closeMenu(event) {
                    if (
                        !menu.contains(
                            event.target
                        )
                    ) {
                        menu.remove();

                        document.removeEventListener(
                            "click",
                            closeMenu
                        );
                    }
                }
            );
        }, 0);
    }


    async function deleteMessage(
        messageId
    ) {
        const {
            error
        } = await db.rpc(
            "delete_message",
            {
                p_message_id:
                    messageId
            }
        );

        if (error) {
            showToast(
                error.message,
                "error"
            );

            return;
        }

        showToast(
            "Message deleted.",
            "success"
        );

        await loadMessages();
    }


    /* =========================================================
       SEND MESSAGE
       ========================================================= */

    async function sendMessage(
        event
    ) {
        event?.preventDefault();

        const input =
            $("#messageInput");

        if (!input) return;

        const content =
            input.value.trim();

        if (!content) return;

        if (editingMessageId) {
            const {
                error
            } = await db.rpc(
                "edit_message",
                {
                    p_message_id:
                        editingMessageId,
                    p_new_content:
                        content
                }
            );

            if (error) {
                showToast(
                    error.message,
                    "error"
                );

                return;
            }

            editingMessageId =
                null;

            input.value = "";

            if ($("#sendButton")) {
                $("#sendButton")
                    .innerHTML =
                    '<i class="fa-solid fa-paper-plane"></i>';
            }

            await loadMessages();

            return;
        }

        if (
            selectedUser &&
            currentChatType ===
            "direct"
        ) {
            const allowed =
                await hasAcceptedContact();

            if (!allowed) {
                showToast(
                    "Accept the contact request first.",
                    "error"
                );

                return;
            }

            const {
                error
            } = await db
                .from("messages")
                .insert({
                    sender_id:
                        currentUser.id,
                    receiver_id:
                        selectedUser.id,
                    content,
                    message_type:
                        "text"
                });

            if (error) {
                showToast(
                    error.message,
                    "error"
                );

                return;
            }
        }

        if (
            selectedGroup &&
            currentChatType ===
            "group"
        ) {
            await sendGroupMessage(
                content
            );
        }

        if (
            selectedChannel &&
            currentChatType ===
            "channel"
        ) {
            await sendChannelMessage(
                content
            );
        }

        input.value = "";

        await refreshCurrentChat();
    }


    /* =========================================================
       IMAGE
       ========================================================= */

    async function sendImage(file) {
        if (!file) return;

        if (
            !(
                selectedUser ||
                selectedGroup ||
                selectedChannel
            )
        ) {
            return;
        }

        if (
            !file.type.startsWith(
                "image/"
            )
        ) {
            showToast(
                "Please select an image.",
                "error"
            );

            return;
        }

        if (
            file.size >
            10 * 1024 * 1024
        ) {
            showToast(
                "Image must be under 10 MB.",
                "error"
            );

            return;
        }

        const extension =
            file.name
                .split(".")
                .pop()
                .toLowerCase();

        const path =
            `${currentUser.id}/${Date.now()}-${crypto.randomUUID()}.${extension}`;

        const {
            error:
                uploadError
        } = await db.storage
            .from("chat-media")
            .upload(
                path,
                file,
                {
                    upsert: false,
                    contentType:
                        file.type
                }
            );

        if (uploadError) {
            console.error(
                uploadError
            );

            showToast(
                uploadError.message,
                "error"
            );

            return;
        }

        if (
            selectedUser &&
            currentChatType ===
            "direct"
        ) {
            const {
                error
            } = await db
                .from("messages")
                .insert({
                    sender_id:
                        currentUser.id,
                    receiver_id:
                        selectedUser.id,
                    content: "",
                    message_type:
                        "image",
                    image_url:
                        path
                });

            if (error) {
                console.error(error);

                showToast(
                    error.message,
                    "error"
                );

                return;
            }
        }

        if (
            selectedGroup &&
            currentChatType ===
            "group"
        ) {
            const {
                error
            } = await db
                .from("group_messages")
                .insert({
                    group_id:
                        selectedGroup.id,
                    sender_id:
                        currentUser.id,
                    content: "",
                    message_type:
                        "image",
                    image_url:
                        path
                });

            if (error) {
                showToast(
                    error.message,
                    "error"
                );

                return;
            }
        }

        showToast(
            "Image sent.",
            "success"
        );

        await refreshCurrentChat();
    }


    /* =========================================================
       DELIVERY / SEEN
       ========================================================= */

    async function markMessagesDelivered() {
        if (!selectedUser) return;

        const {
            error
        } = await db.rpc(
            "mark_messages_delivered",
            {
                p_other_user_id:
                    selectedUser.id
            }
        );

        if (error) {
            console.warn(error);
        }
    }


    async function markChatSeen() {
        if (!selectedUser) return;

        const {
            error
        } = await db.rpc(
            "mark_chat_seen",
            {
                p_other_user_id:
                    selectedUser.id
            }
        );

        if (error) {
            console.warn(error);
        }
    }


    /* =========================================================
       GROUPS
       ========================================================= */

    async function loadGroups() {
        const {
            data,
            error
        } = await db
            .from("groups")
            .select(`
                *,
                group_members(
                    user_id,
                    role
                )
            `)
            .order(
                "created_at",
                {
                    ascending: false
                }
            );

        if (error) {
            console.error(error);
            return;
        }

        groupsCache =
            (data || []).filter(
                group =>
                    group.group_members
                        ?.some(
                            member =>
                                member.user_id ===
                                currentUser.id
                        )
            );

        renderGroups(
            groupsCache
        );
    }


    function renderGroups(groups) {
        const list =
            $("#chatList");

        if (!list) return;

        if (!groups.length) {
            list.innerHTML = `
                <div class="empty-state">
                    <i class="fa-solid fa-users"></i>
                    <strong>No groups yet</strong>
                </div>
            `;

            return;
        }

        list.innerHTML =
            groups.map(group => `
                <div
                    class="chat-item"
                    data-group-id="${group.id}"
                >
                    <div class="avatar">
                        ${
                            group.avatar_url
                                ? `<img src="${escapeHTML(group.avatar_url)}" alt="">`
                                : escapeHTML(
                                    getInitial(
                                        group.name
                                    )
                                )
                        }
                    </div>

                    <div class="chat-info">
                        <span class="chat-info-name">
                            ${escapeHTML(
                                group.name
                            )}
                        </span>

                        <span class="chat-info-subtitle">
                            ${
                                group.username
                                    ? "@" +
                                      escapeHTML(
                                          group.username
                                      )
                                    : "Group"
                            }
                        </span>
                    </div>
                </div>
            `).join("");

        $$(".chat-item[data-group-id]")
            .forEach(item => {
                item.addEventListener(
                    "click",
                    async () => {
                        const group =
                            groups.find(
                                g =>
                                    String(g.id) ===
                                    String(
                                        item.dataset.groupId
                                    )
                            );

                        if (group) {
                            await openGroupChat(
                                group
                            );
                        }
                    }
                );
            });
    }


    async function isGroupMember(
        groupId
    ) {
        const {
            data
        } = await db
            .from("group_members")
            .select("id")
            .eq(
                "group_id",
                groupId
            )
            .eq(
                "user_id",
                currentUser.id
            )
            .maybeSingle();

        return !!data;
    }


    async function openGroupChat(
        group
    ) {
        selectedGroup =
            group;

        selectedUser = null;
        selectedChannel = null;

        currentChatType =
            "group";

        $("#app")
            ?.classList.add(
                "chat-open"
            );

        if ($("#chatEmpty")) {
            $("#chatEmpty")
                .style.display =
                "none";
        }

        if ($("#activeChat")) {
            $("#activeChat")
                .style.display =
                "flex";
        }

        if ($("#chatName")) {
            $("#chatName")
                .textContent =
                group.name;
        }

        if ($("#chatVerified")) {
            $("#chatVerified")
                .style.display =
                "none";
        }

        setAvatar(
            $("#chatAvatar"),
            group
        );

        if ($("#chatStatus")) {
            $("#chatStatus")
                .textContent =
                group.username
                    ? "@" +
                      group.username
                    : "Group";
        }

        await loadGroupMessages(
            group.id
        );

        updateMessageInputState();
    }


    async function loadGroupMessages(
        groupId
    ) {
        const {
            data,
            error
        } = await db
            .from("group_messages")
            .select(`
                *,
                sender:sender_id(
                    id,
                    username,
                    full_name,
                    avatar_url,
                    is_verified
                )
            `)
            .eq(
                "group_id",
                groupId
            )
            .order(
                "created_at",
                {
                    ascending: true
                }
            );

        if (error) {
            console.error(error);
            return;
        }

        await renderGroupMessages(
            data || []
        );
    }


    async function renderGroupMessages(
        messages
    ) {
        const container =
            $("#messages");

        if (!container) return;

        container.innerHTML = "";

        for (
            const message of messages
        ) {
            const row =
                document.createElement(
                    "div"
                );

            const mine =
                message.sender_id ===
                currentUser.id;

            row.className =
                `message-row ${
                    mine ? "mine" : "theirs"
                }`;

            const bubble =
                document.createElement(
                    "div"
                );

            bubble.className =
                "message-bubble group-message";

            if (!mine) {
                const sender =
                    document.createElement(
                        "div"
                    );

                sender.className =
                    "message-sender";

                sender.textContent =
                    message.sender
                        ?.full_name ||
                    message.sender
                        ?.username ||
                    "User";

                bubble.appendChild(
                    sender
                );
            }

            if (
                message.deleted_at
            ) {
                const deleted =
                    document.createElement(
                        "span"
                    );

                deleted.className =
                    "deleted-message";

                deleted.textContent =
                    "Message deleted";

                bubble.appendChild(
                    deleted
                );
            } else if (
                message.message_type ===
                "image"
            ) {
                const img =
                    document.createElement(
                        "img"
                    );

                img.className =
                    "message-image";

                img.src =
                    await getChatMediaUrl(
                        message.image_url
                    );

                bubble.appendChild(
                    img
                );
            } else {
                const text =
                    document.createElement(
                        "div"
                    );

                text.className =
                    "message-text";

                text.textContent =
                    message.content ||
                    "";

                bubble.appendChild(
                    text
                );
            }

            const footer =
                document.createElement(
                    "div"
                );

            footer.className =
                "message-footer";

            footer.textContent =
                formatTime(
                    message.created_at
                );

            bubble.appendChild(
                footer
            );

            row.appendChild(
                bubble
            );

            container.appendChild(
                row
            );
        }

        container.scrollTop =
            container.scrollHeight;
    }


    async function sendGroupMessage(
        content
    ) {
        if (!selectedGroup) return;

        const {
            error
        } = await db
            .from("group_messages")
            .insert({
                group_id:
                    selectedGroup.id,
                sender_id:
                    currentUser.id,
                content,
                message_type:
                    "text"
            });

        if (error) {
            showToast(
                error.message,
                "error"
            );
        }
    }


    /* =========================================================
       CHANNELS
       ========================================================= */

    async function loadChannels() {
        const {
            data,
            error
        } = await db
            .from("channels")
            .select(`
                *,
                channel_members(
                    user_id,
                    role
                )
            `)
            .order(
                "created_at",
                {
                    ascending: false
                }
            );

        if (error) {
            console.error(error);
            return;
        }

        channelsCache =
            (data || []).filter(
                channel =>
                    channel.channel_members
                        ?.some(
                            member =>
                                member.user_id ===
                                currentUser.id
                        )
            );

        renderChannels(
            channelsCache
        );
    }


    function renderChannels(
        channels
    ) {
        const list =
            $("#chatList");

        if (!list) return;

        if (!channels.length) {
            list.innerHTML = `
                <div class="empty-state">
                    <i class="fa-solid fa-bullhorn"></i>
                    <strong>No channels yet</strong>
                </div>
            `;

            return;
        }

        list.innerHTML =
            channels.map(channel => `
                <div
                    class="chat-item"
                    data-channel-id="${channel.id}"
                >
                    <div class="avatar">
                        ${
                            channel.avatar_url
                                ? `<img src="${escapeHTML(channel.avatar_url)}" alt="">`
                                : escapeHTML(
                                    getInitial(
                                        channel.name
                                    )
                                )
                        }
                    </div>

                    <div class="chat-info">
                        <span class="chat-info-name">
                            ${escapeHTML(
                                channel.name
                            )}
                        </span>

                        <span class="chat-info-subtitle">
                            ${
                                channel.username
                                    ? "@" +
                                      escapeHTML(
                                          channel.username
                                      )
                                    : "Channel"
                            }
                        </span>
                    </div>
                </div>
            `).join("");

        $$(".chat-item[data-channel-id]")
            .forEach(item => {
                item.addEventListener(
                    "click",
                    async () => {
                        const channel =
                            channels.find(
                                c =>
                                    String(c.id) ===
                                    String(
                                        item.dataset.channelId
                                    )
                            );

                        if (channel) {
                            await openChannelChat(
                                channel
                            );
                        }
                    }
                );
            });
    }


    async function isChannelWriter(
        channelId
    ) {
        const {
            data
        } = await db
            .from("channel_members")
            .select("role")
            .eq(
                "channel_id",
                channelId
            )
            .eq(
                "user_id",
                currentUser.id
            )
            .maybeSingle();

        if (!data) return false;

        return [
            "owner",
            "admin"
        ].includes(
            data.role
        );
    }


    async function openChannelChat(
        channel
    ) {
        selectedChannel =
            channel;

        selectedUser = null;
        selectedGroup = null;

        currentChatType =
            "channel";

        $("#app")
            ?.classList.add(
                "chat-open"
            );

        if ($("#chatEmpty")) {
            $("#chatEmpty")
                .style.display =
                "none";
        }

        if ($("#activeChat")) {
            $("#activeChat")
                .style.display =
                "flex";
        }

        if ($("#chatName")) {
            $("#chatName")
                .textContent =
                channel.name;
        }

        if ($("#chatVerified")) {
            $("#chatVerified")
                .style.display =
                "none";
        }

        setAvatar(
            $("#chatAvatar"),
            channel
        );

        if ($("#chatStatus")) {
            $("#chatStatus")
                .textContent =
                channel.username
                    ? "@" +
                      channel.username
                    : "Channel";
        }

        await loadChannelMessages(
            channel.id
        );

        updateMessageInputState();
    }


    async function loadChannelMessages(
        channelId
    ) {
        const {
            data,
            error
        } = await db
            .from("channel_messages")
            .select(`
                *,
                sender:sender_id(
                    id,
                    username,
                    full_name
                )
            `)
            .eq(
                "channel_id",
                channelId
            )
            .order(
                "created_at",
                {
                    ascending: true
                }
            );

        if (error) {
            console.error(error);
            return;
        }

        await renderChannelMessages(
            data || []
        );
    }


    async function renderChannelMessages(
        messages
    ) {
        const container =
            $("#messages");

        if (!container) return;

        container.innerHTML = "";

        for (
            const message of messages
        ) {
            const row =
                document.createElement(
                    "div"
                );

            row.className =
                "message-row theirs";

            const bubble =
                document.createElement(
                    "div"
                );

            bubble.className =
                "message-bubble channel-message";

            if (
                message.deleted_at
            ) {
                bubble.textContent =
                    "Message deleted";
            } else if (
                message.message_type ===
                "image"
            ) {
                const img =
                    document.createElement(
                        "img"
                    );

                img.className =
                    "message-image";

                img.src =
                    await getChatMediaUrl(
                        message.image_url
                    );

                bubble.appendChild(
                    img
                );
            } else {
                const text =
                    document.createElement(
                        "div"
                    );

                text.className =
                    "message-text";

                text.textContent =
                    message.content ||
                    "";

                bubble.appendChild(
                    text
                );
            }

            const footer =
                document.createElement(
                    "div"
                );

            footer.className =
                "message-footer";

            footer.textContent =
                formatTime(
                    message.created_at
                );

            bubble.appendChild(
                footer
            );

            row.appendChild(
                bubble
            );

            container.appendChild(
                row
            );
        }

        container.scrollTop =
            container.scrollHeight;
    }


    async function sendChannelMessage(
        content
    ) {
        if (!selectedChannel) return;

        const allowed =
            await isChannelWriter(
                selectedChannel.id
            );

        if (!allowed) {
            showToast(
                "Only channel admins can send messages.",
                "error"
            );

            return;
        }

        const {
            error
        } = await db
            .from("channel_messages")
            .insert({
                channel_id:
                    selectedChannel.id,
                sender_id:
                    currentUser.id,
                content,
                message_type:
                    "text"
            });

        if (error) {
            showToast(
                error.message,
                "error"
            );
        }
    }


    /* =========================================================
       REFRESH
       ========================================================= */

    async function refreshCurrentChat() {
        if (
            currentChatType ===
            "direct"
        ) {
            await loadMessages();
        }

        if (
            currentChatType ===
            "group"
        ) {
            await loadGroupMessages(
                selectedGroup.id
            );
        }

        if (
            currentChatType ===
            "channel"
        ) {
            await loadChannelMessages(
                selectedChannel.id
            );
        }
    }


    /* =========================================================
       SAVED MESSAGES
       ========================================================= */

    async function loadSavedMessages() {
        const list =
            $("#savedMessagesList");

        if (!list) return;

        const {
            data,
            error
        } = await db
            .from("saved_messages")
            .select("*")
            .eq(
                "user_id",
                currentUser.id
            )
            .order(
                "created_at",
                {
                    ascending: false
                }
            );

        if (error) {
            console.error(error);

            list.innerHTML = `
                <div class="empty-state">
                    Could not load saved messages.
                </div>
            `;

            return;
        }

        if (!data?.length) {
            list.innerHTML = `
                <div class="empty-state">
                    <i class="fa-regular fa-bookmark"></i>
                    <strong>No saved messages</strong>
                </div>
            `;

            return;
        }

        list.innerHTML =
            data.map(message => `
                <div class="saved-message-item">
                    <div class="saved-message-content">
                        ${
                            message.message_type ===
                            "image"
                                ? `
                                    <img
                                        class="saved-message-image"
                                        src="${escapeHTML(
                                            message.image_url || ""
                                        )}"
                                        alt=""
                                    >
                                `
                                : escapeHTML(
                                    message.content
                                )
                        }
                    </div>

                    <div class="saved-message-footer">
                        ${formatTime(
                            message.created_at
                        )}

                        <button
                            class="secondary-btn delete-saved-btn"
                            data-id="${message.id}"
                        >
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </div>
            `).join("");

        $$(".delete-saved-btn")
            .forEach(button => {
                button.addEventListener(
                    "click",
                    async () => {
                        const {
                            error
                        } = await db
                            .from(
                                "saved_messages"
                            )
                            .delete()
                            .eq(
                                "id",
                                button.dataset.id
                            )
                            .eq(
                                "user_id",
                                currentUser.id
                            );

                        if (error) {
                            showToast(
                                error.message,
                                "error"
                            );

                            return;
                        }

                        await loadSavedMessages();
                    }
                );
            });
    }


    async function saveMessage(
        message
    ) {
        const {
            error
        } = await db
            .from("saved_messages")
            .insert({
                user_id:
                    currentUser.id,
                content:
                    message.content || "",
                message_type:
                    message.message_type ||
                    "text",
                image_url:
                    message.image_url ||
                    null,
                sticker_url:
                    message.sticker_url ||
                    null
            });

        if (error) {
            showToast(
                error.message,
                "error"
            );

            return;
        }

        showToast(
            "Message saved.",
            "success"
        );
    }


    /* =========================================================
       NICKNAME
       ========================================================= */

    async function loadNickname(
        contactId
    ) {
        const {
            data
        } = await db
            .from("contact_nicknames")
            .select("nickname")
            .eq(
                "user_id",
                currentUser.id
            )
            .eq(
                "contact_id",
                contactId
            )
            .maybeSingle();

        return data?.nickname || null;
    }


    async function saveNickname() {
        if (!selectedUser) return;

        const input =
            $("#nicknameInput");

        const nickname =
            input?.value.trim();

        if (!nickname) {
            showToast(
                "Enter a nickname.",
                "error"
            );

            return;
        }

        const {
            error
        } = await db
            .from("contact_nicknames")
            .upsert({
                user_id:
                    currentUser.id,
                contact_id:
                    selectedUser.id,
                nickname,
                updated_at:
                    new Date().toISOString()
            });

        if (error) {
            showToast(
                error.message,
                "error"
            );

            return;
        }

        closeModal(
            "nicknameModal"
        );

        showToast(
            "Nickname saved.",
            "success"
        );

        await loadContacts();
    }


    async function removeNickname() {
        if (!selectedUser) return;

        const {
            error
        } = await db
            .from("contact_nicknames")
            .delete()
            .eq(
                "user_id",
                currentUser.id
            )
            .eq(
                "contact_id",
                selectedUser.id
            );

        if (error) {
            showToast(
                error.message,
                "error"
            );

            return;
        }

        closeModal(
            "nicknameModal"
        );

        showToast(
            "Nickname removed.",
            "success"
        );

        await loadContacts();
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
            .select(`
                *,
                author:author_id(
                    username,
                    full_name
                )
            `)
            .order(
                "created_at",
                {
                    ascending: false
                }
            );

        if (error) {
            console.error(error);

            list.innerHTML = `
                <div class="empty-state">
                    Could not load updates.
                </div>
            `;

            return;
        }

        if (!data?.length) {
            list.innerHTML = `
                <div class="empty-state">
                    <i class="fa-solid fa-bullhorn"></i>
                    <strong>No updates yet</strong>
                </div>
            `;

            return;
        }

        list.innerHTML =
            data.map(update => `
                <article class="update-card">
                    <div class="update-card-top">
                        <span class="update-type">
                            ${escapeHTML(
                                update.update_type
                            )}
                        </span>

                        <span class="update-date">
                            ${formatDate(
                                update.created_at
                            )}
                        </span>
                    </div>

                    <h3>
                        ${escapeHTML(
                            update.title
                        )}
                    </h3>

                    <p>
                        ${escapeHTML(
                            update.content
                        )}
                    </p>

                    <small>
                        ${
                            update.author?.full_name ||
                            update.author?.username ||
                            "MegChatBox"
                        }
                    </small>
                </article>
            `).join("");
    }


    async function publishUpdate() {
        if (!isAdmin()) return;

        const type =
            $("#updateType")?.value ||
            "features";

        const title =
            $("#updateTitle")?.value.trim();

        const content =
            $("#updateContent")?.value.trim();

        if (!title || !content) {
            showToast(
                "Fill in all update fields.",
                "error"
            );

            return;
        }

        const {
            error
        } = await db
            .from("app_updates")
            .insert({
                author_id:
                    currentUser.id,
                title,
                content,
                update_type:
                    type
            });

        if (error) {
            showToast(
                error.message,
                "error"
            );

            return;
        }

        $("#updateTitle").value = "";
        $("#updateContent").value = "";

        showToast(
            "Update published.",
            "success"
        );

        await loadUpdates();
    }


    /* =========================================================
       PROFILE
       ========================================================= */

    function openProfileModal() {
        renderMyProfile();

        openModal(
            "profileModal"
        );
    }


    async function saveProfile(
        event
    ) {
        event.preventDefault();

        const fullName =
            $("#profileName")
                ?.value.trim();

        const username =
            $("#profileUsername")
                ?.value.trim()
                .toLowerCase();

        const bio =
            $("#profileBio")
                ?.value.trim();

        if (!fullName || !username) {
            showToast(
                "Name and username are required.",
                "error"
            );

            return;
        }

        if (
            !/^[a-z0-9_]{3,32}$/.test(
                username
            )
        ) {
            showToast(
                "Username must use lowercase letters, numbers and underscores.",
                "error"
            );

            return;
        }

        const {
            error
        } = await db
            .from("profiles")
            .update({
                full_name:
                    fullName,
                username,
                bio:
                    bio || ""
            })
            .eq(
                "id",
                currentUser.id
            );

        if (error) {
            if (
                error.code === "23505"
            ) {
                showToast(
                    "Username is already taken.",
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

        await loadMyProfile();

        closeModal(
            "profileModal"
        );

        showToast(
            "Profile updated.",
            "success"
        );
    }


    async function uploadProfileAvatar(
        file
    ) {
        if (!file) return;

        if (
            !file.type.startsWith(
                "image/"
            )
        ) {
            showToast(
                "Please select an image.",
                "error"
            );

            return;
        }

        const extension =
            file.name
                .split(".")
                .pop()
                .toLowerCase();

        const path =
            `${currentUser.id}/avatar.${extension}`;

        const {
            error:
                uploadError
        } = await db.storage
            .from("avatars")
            .upload(
                path,
                file,
                {
                    upsert: true,
                    contentType:
                        file.type
                }
            );

        if (uploadError) {
            showToast(
                uploadError.message,
                "error"
            );

            return;
        }

        const {
            data
        } = db.storage
            .from("avatars")
            .getPublicUrl(
                path
            );

        const avatarUrl =
            data?.publicUrl;

        const {
            error
        } = await db
            .from("profiles")
            .update({
                avatar_url:
                    avatarUrl
            })
            .eq(
                "id",
                currentUser.id
            );

        if (error) {
            showToast(
                error.message,
                "error"
            );

            return;
        }

        await loadMyProfile();

        showToast(
            "Avatar updated.",
            "success"
        );
    }


    /* =========================================================
       PRIVACY
       ========================================================= */

    function openPrivacyModal() {
        if ($("#showOnline")) {
            $("#showOnline").checked =
                currentProfile
                    ?.show_online !== false;
        }

        if ($("#showLastSeen")) {
            $("#showLastSeen").checked =
                currentProfile
                    ?.show_last_seen !== false;
        }

        openModal(
            "privacyModal"
        );
    }


    async function savePrivacySettings() {
        const showOnline =
            $("#showOnline")
                ?.checked ?? true;

        const showLastSeen =
            $("#showLastSeen")
                ?.checked ?? true;

        const {
            error
        } = await db
            .from("profiles")
            .update({
                show_online:
                    showOnline,
                show_last_seen:
                    showLastSeen
            })
            .eq(
                "id",
                currentUser.id
            );

        if (error) {
            showToast(
                error.message,
                "error"
            );

            return;
        }

        currentProfile.show_online =
            showOnline;

        currentProfile.show_last_seen =
            showLastSeen;

        closeModal(
            "privacyModal"
        );

        showToast(
            "Privacy settings saved.",
            "success"
        );
    }


    /* =========================================================
       USER PROFILE POPUP
       ========================================================= */

    async function openUserProfilePopup(
        user
    ) {
        if (!user) return;

        selectedUser =
            user;

        setAvatar(
            $("#userProfileAvatar"),
            user
        );

        if ($("#userProfileName")) {
            $("#userProfileName")
                .textContent =
                user.full_name ||
                user.username;
        }

        if ($("#userProfileVerified")) {
            $("#userProfileVerified")
                .style.display =
                user.is_verified
                    ? "inline-flex"
                    : "none";
        }

        if ($("#userProfileUsername")) {
            $("#userProfileUsername")
                .textContent =
                "@" +
                user.username;
        }

        if ($("#userProfileBio")) {
            $("#userProfileBio")
                .textContent =
                user.bio ||
                "No bio yet.";
        }

        if ($("#userProfileStatus")) {
            $("#userProfileStatus")
                .textContent =
                getUserStatus(user);
        }

        const nickname =
            await loadNickname(
                user.id
            );

        if ($("#nicknameInput")) {
            $("#nicknameInput").value =
                nickname || "";
        }

        openModal(
            "userProfileModal"
        );

        await updateContactActions();
    }


    /* =========================================================
       BLOCK / REPORT
       ========================================================= */

    async function blockUser() {
        if (!selectedUser) return;

        const {
            error
        } = await db
            .from("user_blocks")
            .insert({
                user_id:
                    selectedUser.id,
                blocked_by:
                    currentUser.id,
                block_type:
                    "messaging",
                reason:
                    "Blocked by user",
                active:
                    true
            });

        if (error) {
            showToast(
                error.message,
                "error"
            );

            return;
        }

        closeModal(
            "userProfileModal"
        );

        showToast(
            "Messaging blocked.",
            "success"
        );
    }


    async function reportUser() {
        if (!selectedUser) return;

        const reason =
            prompt(
                "Reason: spam, harassment, fake_account or other"
            );

        if (!reason) return;

        const allowed = [
            "spam",
            "harassment",
            "fake_account",
            "other"
        ];

        const normalized =
            allowed.includes(
                reason.toLowerCase()
            )
                ? reason.toLowerCase()
                : "other";

        const {
            error
        } = await db
            .from("reports")
            .insert({
                reporter_id:
                    currentUser.id,
                reported_user_id:
                    selectedUser.id,
                reason:
                    normalized,
                description:
                    "Reported from user profile",
                status:
                    "pending"
            });

        if (error) {
            showToast(
                error.message,
                "error"
            );

            return;
        }

        showToast(
            "Report submitted.",
            "success"
        );
    }


    /* =========================================================
       OWNER
       ========================================================= */

    async function ownerSearchUser(
        username,
        result
    ) {
        const name =
            String(username || "")
                .trim()
                .replace(/^@/, "")
                .toLowerCase();

        if (!name) {
            showToast(
                "Enter a username.",
                "error"
            );

            return null;
        }

        const {
            data,
            error
        } = await db
            .from("profiles")
            .select("*")
            .eq(
                "username",
                name
            )
            .maybeSingle();

        if (error || !data) {
            if (result) {
                result.innerHTML = `
                    <div class="empty-state">
                        User not found.
                    </div>
                `;
            }

            return null;
        }

        return data;
    }


    async function ownerSearchVerified() {
        const result =
            $("#ownerVerifiedResult");

        const user =
            await ownerSearchUser(
                $("#ownerVerifiedUsername")
                    ?.value,
                result
            );

        if (!user) return;

        const verified =
            user.is_verified === true;

        if (result) {
            result.innerHTML = `
                <div class="chat-item active">
                    <div class="avatar avatar-medium">
                        ${escapeHTML(
                            getInitial(
                                user.full_name
                            )
                        )}
                    </div>

                    <div class="chat-info">
                        <span class="chat-info-name">
                            ${escapeHTML(
                                user.full_name
                            )}
                        </span>

                        <span class="chat-info-subtitle">
                            @${escapeHTML(
                                user.username
                            )}
                        </span>
                    </div>

                    <button
                        class="primary-btn"
                        id="ownerVerifiedAction"
                    >
                        ${
                            verified
                                ? "Remove Verified"
                                : "Verify"
                        }
                    </button>
                </div>
            `;

            $("#ownerVerifiedAction")
                ?.addEventListener(
                    "click",
                    async () => {
                        const {
                            error
                        } = await db.rpc(
                            "owner_set_verified",
                            {
                                p_user_id: user.id,
                                p_action: verified
                                    ? "remove"
                                    : "give",
                            }
                        );

                        if (error) {
                            showToast(
                                error.message,
                                "error"
                            );

                            return;
                        }

                        showToast(
                            verified
                                ? "Verification removed."
                                : "User verified.",
                            "success"
                        );

                        await ownerSearchVerified();
                    }
                );
        }
    }


    async function ownerSearchModeration() {
        const result =
            $("#ownerModerationResult");

        const user =
            await ownerSearchUser(
                $("#ownerModerationUsername")
                    ?.value,
                result
            );

        if (!user) return;

        if (result) {
            result.innerHTML = `
                <div class="chat-item active">
                    <div class="avatar avatar-medium">
                        ${escapeHTML(
                            getInitial(
                                user.full_name
                            )
                        )}
                    </div>

                    <div class="chat-info">
                        <span class="chat-info-name">
                            ${escapeHTML(
                                user.full_name
                            )}
                        </span>

                        <span class="chat-info-subtitle">
                            @${escapeHTML(
                                user.username
                            )}
                        </span>
                    </div>

                    <button
                        class="secondary-btn"
                        id="ownerMessagingBlock"
                    >
                        Block Messaging
                    </button>

                    <button
                        class="danger-btn"
                        id="ownerAccountBlock"
                    >
                        Block Account
                    </button>
                </div>
            `;

            $("#ownerMessagingBlock")
                ?.addEventListener(
                    "click",
                    () =>
                        ownerBlockUser(
                            user,
                            "messaging"
                        )
                );

            $("#ownerAccountBlock")
                ?.addEventListener(
                    "click",
                    () =>
                        ownerBlockUser(
                            user,
                            "account"
                        )
                );
        }
    }


    async function ownerBlockUser(
        user,
        type
    ) {
        const {
            error
        } = await db.rpc(
            "owner_set_user_block",
            {
                p_user_id:
                    user.id,
                p_block_type:
                    type,
                p_action:
                    "block"
            }
        );

        if (error) {
            console.error(error);

            showToast(
                error.message ||
                "Could not block user.",
                "error"
            );

            return;
        }

        showToast(
            type === "account"
                ? "Account blocked."
                : "Messaging blocked.",
            "success"
        );
    }


    async function ownerSearchAdmin() {
        const result =
            $("#ownerAdminResult");

        const user =
            await ownerSearchUser(
                $("#ownerAdminUsername")
                    ?.value,
                result
            );

        if (!user) return;

        const isAdmin =
            user.role === "admin";

        result.innerHTML = `
            <div class="chat-item active">
                <div class="avatar avatar-medium">
                    ${escapeHTML(
                        getInitial(
                            user.full_name
                        )
                    )}
                </div>

                <div class="chat-info">
                    <span class="chat-info-name">
                        ${escapeHTML(
                            user.full_name
                        )}
                    </span>

                    <span class="chat-info-subtitle">
                        @${escapeHTML(
                            user.username
                        )}
                    </span>
                </div>

                <button
                    class="primary-btn"
                    id="ownerAdminAction"
                >
                    ${
                        isAdmin
                            ? "Remove Admin"
                            : "Make Admin"
                    }
                </button>
            </div>
        `;

        $("#ownerAdminAction")
            ?.addEventListener(
                "click",
                async () => {
                    const {
                        error
                    } = await db.rpc(
                        "owner_set_admin",
                        {
                            p_user_id:
                                user.id,
                            p_action:
                                isAdmin
                                    ? "remove"
                                    : "add"
                        }
                    );

                    if (error) {
                        console.error(error);

                        showToast(
                            error.message ||
                            "Could not update admin.",
                            "error"
                        );

                        return;
                    }

                    showToast(
                        isAdmin
                            ? "Admin removed."
                            : "Admin added.",
                        "success"
                    );

                    await loadMyProfile();
                    setupRoleUI();
                    await ownerSearchAdmin();
                }
            );
    }


    async function loadOwnerReports() {
        const container =
            $("#ownerReportsList");

        if (!container) return;

        const {
            data,
            error
        } = await db
            .from("reports")
            .select(`
                *,
                reporter:reporter_id(username),
                reported:reported_user_id(username)
            `)
            .order(
                "created_at",
                {
                    ascending: false
                }
            )
            .limit(50);

        if (error) {
            console.error(error);

            container.innerHTML = `
                <div class="empty-state">
                    <strong>Could not load reports</strong>
                </div>
            `;

            return;
        }

        if (!data?.length) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fa-solid fa-check"></i>
                    <strong>No reports</strong>
                </div>
            `;

            return;
        }

        container.innerHTML =
            data.map(report => `
                <div class="chat-item">
                    <div class="chat-info">
                        <span class="chat-info-name">
                            @${escapeHTML(
                                report.reported?.username ||
                                "unknown"
                            )}
                        </span>

                        <span class="chat-info-subtitle">
                            ${escapeHTML(
                                report.reason
                            )}
                        </span>
                    </div>

                    <span class="request-badge">
                        ${escapeHTML(
                            report.status
                        )}
                    </span>
                </div>
            `).join("");
    }


    function openAdminPanelSection(
        type
    ) {
        if (type === "reports") {
            loadOwnerReports();
        }

        if (type === "users") {
            showToast(
                "Users moderation is available from Owner/Admin tools.",
                "info"
            );
        }

        if (type === "groups") {
            loadGroups();
            showToast(
                "Group management opened.",
                "info"
            );
        }

        if (type === "channels") {
            loadChannels();
            showToast(
                "Channel management opened.",
                "info"
            );
        }
    }


    /* =========================================================
       EMOJI
       ========================================================= */

    function setupEmoji() {
        const button =
            $("#emojiBtn");

        const panel =
            $("#emojiPanel");

        if (!button || !panel) return;

        const emojis = [
            "😀","😂","🤣","😊","😍",
            "🥰","😎","😭","😡","😱",
            "👍","👎","❤️","🔥","✨",
            "🎉","👏","🙏","💀","🤝"
        ];

        panel.innerHTML =
            emojis.map(
                emoji =>
                    `<button type="button" class="emoji-item">${emoji}</button>`
            ).join("");

        button.addEventListener(
            "click",
            event => {
                event.stopPropagation();

                panel.classList.toggle(
                    "show"
                );
            }
        );

        panel.addEventListener(
            "click",
            event => {
                const target =
                    event.target.closest(
                        ".emoji-item"
                    );

                if (!target) return;

                const input =
                    $("#messageInput");

                if (!input) return;

                input.value +=
                    target.textContent;

                input.focus();
            }
        );
    }


    /* =========================================================
       STICKERS
       ========================================================= */

    function setupStickers() {
        const button =
            $("#stickerBtn");

        const panel =
            $("#stickerPanel");

        if (!button || !panel) return;

        button.addEventListener(
            "click",
            () => {
                panel.classList.toggle(
                    "show"
                );
            }
        );
    }


    /* =========================================================
       MODAL EVENTS
       ========================================================= */

    function setupModalEvents() {
        $$(".modal-overlay")
            .forEach(overlay => {
                overlay.addEventListener(
                    "click",
                    event => {
                        if (
                            event.target ===
                            overlay
                        ) {
                            closeModal(
                                overlay
                            );
                        }
                    }
                );
            });

        document.addEventListener(
            "keydown",
            event => {
                if (
                    event.key ===
                    "Escape"
                ) {
                    closeAllModals();

                    $$(".message-context-menu")
                        .forEach(
                            menu =>
                                menu.remove()
                        );
                }
            }
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
                    $("#app")
                        ?.classList.remove(
                            "chat-open"
                        );

                    selectedUser = null;
                    selectedGroup = null;
                    selectedChannel = null;
                    currentChatType = null;

                    if ($("#messages")) {
                        $("#messages")
                            .innerHTML = "";
                    }

                    if ($("#activeChat")) {
                        $("#activeChat")
                            .style.display =
                            "none";
                    }

                    if ($("#chatEmpty")) {
                        $("#chatEmpty")
                            .style.display =
                            "flex";
                    }

                    updateMessageInputState();
                }
            );
    }


    /* =========================================================
       REALTIME
       ========================================================= */

    function setupRealtime() {
        if (!currentUser) return;

        if (realtimeChannel) {
            db.removeChannel(
                realtimeChannel
            );
        }

        realtimeChannel =
            db.channel(
                "MegChatBox-" +
                currentUser.id
            );

        realtimeChannel
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "messages"
                },
                async payload => {
                    if (
                        currentChatType !==
                        "direct"
                    ) {
                        return;
                    }

                    const message =
                        payload.new ||
                        payload.old;

                    if (
                        !message ||
                        !selectedUser
                    ) {
                        return;
                    }

                    const belongs =
                        (
                            message.sender_id ===
                            currentUser.id &&
                            message.receiver_id ===
                            selectedUser.id
                        ) ||
                        (
                            message.sender_id ===
                            selectedUser.id &&
                            message.receiver_id ===
                            currentUser.id
                        );

                    if (!belongs) return;

                    await loadMessages();

                    if (
                        message.sender_id ===
                        selectedUser.id
                    ) {
                        await markMessagesDelivered();
                        await markChatSeen();
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

                    if (selectedUser) {
                        await updateContactActions();
                        await updateMessageInputState();
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
                    if (
                        selectedGroup &&
                        payload.new?.group_id ===
                        selectedGroup.id
                    ) {
                        await loadGroupMessages(
                            selectedGroup.id
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
                    if (
                        selectedChannel &&
                        payload.new?.channel_id ===
                        selectedChannel.id
                    ) {
                        await loadChannelMessages(
                            selectedChannel.id
                        );
                    }
                }
            )

            .on(
                "postgres_changes",
                {
                    event: "UPDATE",
                    schema: "public",
                    table: "profiles"
                },
                async payload => {
                    if (
                        payload.new?.id ===
                        currentUser.id
                    ) {
                        currentProfile =
                            payload.new;

                        renderMyProfile();
                    }

                    if (
                        selectedUser &&
                        payload.new?.id ===
                        selectedUser.id
                    ) {
                        selectedUser =
                            payload.new;

                        setAvatar(
                            $("#chatAvatar"),
                            selectedUser
                        );

                        if ($("#chatName")) {
                            $("#chatName")
                                .textContent =
                                selectedUser.full_name ||
                                selectedUser.username;
                        }

                        if ($("#chatVerified")) {
                            $("#chatVerified")
                                .style.display =
                                selectedUser.is_verified
                                    ? "inline-flex"
                                    : "none";
                        }

                        renderUserStatus(
                            selectedUser
                        );
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
       GROUP / CHANNEL BUTTONS
       ========================================================= */

    async function createGroup(
        event
    ) {
        event.preventDefault();

        const name =
            $("#groupName")
                ?.value.trim();

        const username =
            $("#groupUsername")
                ?.value.trim()
                .toLowerCase();

        const bio =
            $("#groupBio")
                ?.value.trim();

        if (!name || !username) {
            showToast(
                "Group name and username are required.",
                "error"
            );

            return;
        }

        const {
            data,
            error
        } = await db
            .from("groups")
            .insert({
                owner_id:
                    currentUser.id,
                name,
                username,
                bio:
                    bio || ""
            })
            .select()
            .single();

        if (error) {
            showToast(
                error.message,
                "error"
            );

            return;
        }

        await db
            .from("group_members")
            .insert({
                group_id:
                    data.id,
                user_id:
                    currentUser.id,
                role:
                    "owner"
            });

        closeModal(
            "createGroupModal"
        );

        showToast(
            "Group created.",
            "success"
        );

        await loadGroups();
    }


    async function createChannel(
        event
    ) {
        event.preventDefault();

        const name =
            $("#channelName")
                ?.value.trim();

        const username =
            $("#channelUsername")
                ?.value.trim()
                .toLowerCase();

        const bio =
            $("#channelBio")
                ?.value.trim();

        if (!name || !username) {
            showToast(
                "Channel name and username are required.",
                "error"
            );

            return;
        }

        const {
            data,
            error
        } = await db
            .from("channels")
            .insert({
                owner_id:
                    currentUser.id,
                name,
                username,
                bio:
                    bio || ""
            })
            .select()
            .single();

        if (error) {
            showToast(
                error.message,
                "error"
            );

            return;
        }

        await db
            .from("channel_members")
            .insert({
                channel_id:
                    data.id,
                user_id:
                    currentUser.id,
                role:
                    "owner"
            });

        closeModal(
            "createChannelModal"
        );

        showToast(
            "Channel created.",
            "success"
        );

        await loadChannels();
    }


    /* =========================================================
       INVITES
       ========================================================= */

    async function joinGroupByInvite() {
        const code =
            $("#groupInviteInput")
                ?.value.trim();

        if (!code) return;

        const {
            data,
            error
        } = await db.rpc(
            "join_group_by_invite",
            {
                p_invite_code:
                    code
            }
        );

        if (error) {
            showToast(
                error.message,
                "error"
            );

            return;
        }

        closeModal(
            "joinGroupModal"
        );

        showToast(
            "Joined group.",
            "success"
        );

        await loadGroups();

        const group =
            groupsCache.find(
                g =>
                    String(g.id) ===
                    String(data)
            );

        if (group) {
            await openGroupChat(
                group
            );
        }
    }


    async function joinChannelByInvite() {
        const code =
            $("#channelInviteInput")
                ?.value.trim();

        if (!code) return;

        const {
            data,
            error
        } = await db.rpc(
            "join_channel_by_invite",
            {
                p_invite_code:
                    code
            }
        );

        if (error) {
            showToast(
                error.message,
                "error"
            );

            return;
        }

        closeModal(
            "joinChannelModal"
        );

        showToast(
            "Joined channel.",
            "success"
        );

        await loadChannels();

        const channel =
            channelsCache.find(
                c =>
                    String(c.id) ===
                    String(data)
            );

        if (channel) {
            await openChannelChat(
                channel
            );
        }
    }


    /* =========================================================
       SETTINGS EVENTS
       ========================================================= */

    function setupEvents() {
        setupTabs();
        setupSearch();
        setupEmoji();
        setupStickers();
        setupLanguage();
        setupAppearance();
        setupModalEvents();
        setupMobile();


        /* Settings */

        $("#settingsBtn")
            ?.addEventListener(
                "click",
                () =>
                    openModal(
                        "settingsModal"
                    )
            );

        $("#closeSettingsBtn")
            ?.addEventListener(
                "click",
                () =>
                    closeModal(
                        "settingsModal"
                    )
            );


        /* Profile */

        $("#myProfileBtn")
            ?.addEventListener(
                "click",
                openProfileModal
            );

        $("#profileSettingsBtn")
            ?.addEventListener(
                "click",
                () => {
                    closeModal(
                        "settingsModal"
                    );

                    openProfileModal();
                }
            );

        $("#closeProfileBtn")
            ?.addEventListener(
                "click",
                () =>
                    closeModal(
                        "profileModal"
                    )
            );

        $("#profileForm")
            ?.addEventListener(
                "submit",
                saveProfile
            );

        $("#changeAvatarBtn")
            ?.addEventListener(
                "click",
                () =>
                    $("#profileAvatarInput")
                        ?.click()
            );

        $("#profileAvatarInput")
            ?.addEventListener(
                "change",
                event => {
                    const file =
                        event.target.files?.[0];

                    uploadProfileAvatar(
                        file
                    );

                    event.target.value =
                        "";
                }
            );


        /* Privacy */

        $("#privacySettingsBtn")
            ?.addEventListener(
                "click",
                () => {
                    closeModal(
                        "settingsModal"
                    );

                    openPrivacyModal();
                }
            );

        $("#closePrivacyBtn")
            ?.addEventListener(
                "click",
                () =>
                    closeModal(
                        "privacyModal"
                    )
            );

        $("#savePrivacyBtn")
            ?.addEventListener(
                "click",
                savePrivacySettings
            );


        /* Appearance */

        $("#appearanceSettingsBtn")
            ?.addEventListener(
                "click",
                () =>
                    openModal(
                        "appearanceModal"
                    )
            );

        $("#closeAppearanceBtn")
            ?.addEventListener(
                "click",
                () =>
                    closeModal(
                        "appearanceModal"
                    )
            );


        /* Saved */

        $("#savedMessagesBtn")
            ?.addEventListener(
                "click",
                async () => {
                    await loadSavedMessages();

                    openModal(
                        "savedMessagesModal"
                    );
                }
            );

        $("#closeSavedMessagesBtn")
            ?.addEventListener(
                "click",
                () =>
                    closeModal(
                        "savedMessagesModal"
                    )
            );


        /* Updates */

        $("#updatesSettingsBtn")
            ?.addEventListener(
                "click",
                async () => {
                    await loadUpdates();

                    if (
                        $("#updateCreateSection")
                    ) {
                        $("#updateCreateSection")
                            .style.display =
                            isAdmin()
                                ? "block"
                                : "none";
                    }

                    openModal(
                        "updatesModal"
                    );
                }
            );

        $("#publishUpdateBtn")
            ?.addEventListener(
                "click",
                publishUpdate
            );


        /* Owner */

        $("#ownerPanelButton")
            ?.addEventListener(
                "click",
                async () => {
                    closeModal(
                        "settingsModal"
                    );

                    if (!isOwner()) {
                        showToast(
                            "Owner access only.",
                            "error"
                        );

                        return;
                    }

                    openModal(
                        "ownerModal"
                    );

                    await loadOwnerReports();
                }
            );

        $("#closeOwnerBtn")
            ?.addEventListener(
                "click",
                () =>
                    closeModal(
                        "ownerModal"
                    )
            );

        $("#ownerVerifiedSearchBtn")
            ?.addEventListener(
                "click",
                ownerSearchVerified
            );

        $("#ownerModerationSearchBtn")
            ?.addEventListener(
                "click",
                ownerSearchModeration
            );

        $("#ownerAdminSearchBtn")
            ?.addEventListener(
                "click",
                ownerSearchAdmin
            );


        /* Admin */

        $("#adminPanelButton")
            ?.addEventListener(
                "click",
                () => {
                    if (!isAdmin()) {
                        showToast(
                            "Admin access only.",
                            "error"
                        );

                        return;
                    }

                    closeModal(
                        "settingsModal"
                    );

                    openModal(
                        "adminModal"
                    );
                }
            );

        $("#closeAdminBtn")
            ?.addEventListener(
                "click",
                () =>
                    closeModal(
                        "adminModal"
                    )
            );

        $("#openAdminReportsBtn")
            ?.addEventListener(
                "click",
                () =>
                    openAdminPanelSection(
                        "reports"
                    )
            );

        $("#openAdminUsersBtn")
            ?.addEventListener(
                "click",
                () =>
                    openAdminPanelSection(
                        "users"
                    )
            );

        $("#openAdminGroupsBtn")
            ?.addEventListener(
                "click",
                () =>
                    openAdminPanelSection(
                        "groups"
                    )
            );

        $("#openAdminChannelsBtn")
            ?.addEventListener(
                "click",
                () =>
                    openAdminPanelSection(
                        "channels"
                    )
            );


        /* Groups */

        $("#createGroupBtn")
            ?.addEventListener(
                "click",
                () =>
                    openModal(
                        "createGroupModal"
                    )
            );

        $("#closeGroupBtn")
            ?.addEventListener(
                "click",
                () =>
                    closeModal(
                        "createGroupModal"
                    )
            );

        $("#groupForm")
            ?.addEventListener(
                "submit",
                createGroup
            );

        $("#joinGroupBtn")
            ?.addEventListener(
                "click",
                joinGroupByInvite
            );


        /* Channels */

        $("#createChannelBtn")
            ?.addEventListener(
                "click",
                () =>
                    openModal(
                        "createChannelModal"
                    )
            );

        $("#closeChannelBtn")
            ?.addEventListener(
                "click",
                () =>
                    closeModal(
                        "createChannelModal"
                    )
            );

        $("#channelForm")
            ?.addEventListener(
                "submit",
                createChannel
            );

        $("#joinChannelBtn")
            ?.addEventListener(
                "click",
                joinChannelByInvite
            );


        /* Contacts */

        $("#addContactBtn")
            ?.addEventListener(
                "click",
                addContact
            );

        $("#acceptContactBtn")
            ?.addEventListener(
                "click",
                acceptContact
            );

        $("#declineContactBtn")
            ?.addEventListener(
                "click",
                declineContact
            );


        /* Messages */

        $("#messageForm")
            ?.addEventListener(
                "submit",
                sendMessage
            );

        $("#imageBtn")
            ?.addEventListener(
                "click",
                () =>
                    $("#imageInput")
                        ?.click()
            );

        $("#imageInput")
            ?.addEventListener(
                "change",
                async event => {
                    const file =
                        event.target.files?.[0];

                    if (file) {
                        await sendImage(
                            file
                        );
                    }

                    event.target.value =
                        "";
                }
            );

        $("#messageInput")
            ?.addEventListener(
                "keydown",
                event => {
                    if (
                        event.key ===
                        "Enter" &&
                        !event.shiftKey
                    ) {
                        event.preventDefault();

                        $("#messageForm")
                            ?.requestSubmit();
                    }
                }
            );


        /* User popup */

        $("#chatAvatarButton")
            ?.addEventListener(
                "click",
                () => {
                    if (selectedUser) {
                        openUserProfilePopup(
                            selectedUser
                        );
                    }
                }
            );

        $("#editNicknameBtn")
            ?.addEventListener(
                "click",
                async () => {
                    if (!selectedUser)
                        return;

                    const nickname =
                        await loadNickname(
                            selectedUser.id
                        );

                    if (
                        $("#nicknameInput")
                    ) {
                        $("#nicknameInput")
                            .value =
                            nickname || "";
                    }

                    openModal(
                        "nicknameModal"
                    );
                }
            );

        $("#saveNicknameBtn")
            ?.addEventListener(
                "click",
                saveNickname
            );

        $("#removeNicknameBtn")
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


        /* Logout */

        $("#logoutBtn")
            ?.addEventListener(
                "click",
                logout
            );

        $("#settingsLogoutBtn")
            ?.addEventListener(
                "click",
                logout
            );


        /* Join buttons */

        $("#joinGroupModalBtn")
            ?.addEventListener(
                "click",
                () =>
                    openModal(
                        "joinGroupModal"
                    )
            );

        $("#joinChannelModalBtn")
            ?.addEventListener(
                "click",
                () =>
                    openModal(
                        "joinChannelModal"
                    )
            );
    }


    /* =========================================================
       LOGOUT
       ========================================================= */

    async function logout() {
        clearInterval(
            lastSeenInterval
        );

        await updateMyLastSeen();

        if (realtimeChannel) {
            try {
                await db.removeChannel(
                    realtimeChannel
                );
            } catch (error) {
                console.warn(error);
            }

            realtimeChannel = null;
        }

        await db.auth.signOut();

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
       INIT
       ========================================================= */

    async function init() {
        disableMessageControls();

        applyTheme();

        const loggedIn =
            await loadSession();

        if (!loggedIn) return;

        const profileLoaded =
            await loadMyProfile();

        if (!profileLoaded) return;

        applyLanguage();

        setupRoleUI();

        setupEvents();

        setupRealtime();

        startLastSeenUpdater();

        await loadContacts();

        currentTab =
            "chats";

        localStorage.setItem(
            "messageAppLoggedIn",
            "true"
        );

        localStorage.setItem(
            "messageAppUser",
            JSON.stringify({
                id:
                    currentUser.id,
                username:
                    currentProfile.username,
                full_name:
                    currentProfile.full_name
            })
        );

        console.log(
            "MegChatBox V2.1 ready."
        );
    }


    try {
        await init();
    } catch (error) {
        console.error(
            "MegChatBox initialization error:",
            error
        );

        showToast(
            "Something went wrong while loading MegChatBox.",
            "error"
        );
    }

})();
