(async function () {

    "use strict";

    const db = supabaseClient;


    /* =====================================================
       STATE
       ===================================================== */

    let currentUser = null;
    let currentProfile = null;

    let selectedUser = null;
    let selectedGroup = null;
    let selectedChannel = null;

    let currentChatType = null;
    let currentTab = "chats";

    let contactsCache = [];
    let groupsCache = [];
    let channelsCache = [];

    let editingMessageId = null;

    let swipeStartX = 0;
    let swipeCurrentX = 0;

    let currentTheme =
        localStorage.getItem("megchatbox-theme") || "dark";

    let currentDensity =
        localStorage.getItem("megchatbox-density") ||
        "comfortable";

    let currentLanguage =
        localStorage.getItem("megchatbox-language") ||
        "en";

    let realtimeChannel = null;
    let lastSeenTimer = null;


    /* =====================================================
       HELPERS
       ===================================================== */

    const $ = selector =>
        document.querySelector(selector);

    const $$ = selector =>
        [...document.querySelectorAll(selector)];


    function escapeHTML(value) {

        return String(value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }


    function initial(value) {

        return String(value || "?")
            .trim()
            .charAt(0)
            .toUpperCase();
    }


    function time(date) {

        if (!date) return "";

        return new Date(date)
            .toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit"
            });
    }


    function dateText(date) {

        if (!date) return "";

        return new Date(date)
            .toLocaleDateString([], {
                day: "numeric",
                month: "short",
                year: "numeric"
            });
    }


    function toast(message, type = "info") {

        const element = $("#toast");
        const text = $("#toastMessage");

        if (!element) return;

        if (text) {
            text.textContent = message;
        }

        element.className =
            `toast show ${type}`;

        clearTimeout(toast.timer);

        toast.timer = setTimeout(() => {

            element.classList.remove("show");

        }, 3000);
    }


    function openModal(id) {

        const modal = document.getElementById(id);

        if (!modal) return;

        modal.classList.add("show");
    }


    function closeModal(id) {

        const modal = document.getElementById(id);

        if (!modal) return;

        modal.classList.remove("show");
    }


    function closeAllModals() {

        $$(".modal-overlay")
            .forEach(modal =>
                modal.classList.remove("show")
            );
    }


    function avatar(element, user) {

        if (!element) return;

        element.innerHTML = "";

        if (user?.avatar_url) {

            const image =
                document.createElement("img");

            image.src = user.avatar_url;

            image.alt =
                user.full_name ||
                user.username ||
                "Avatar";

            element.appendChild(image);

        } else {

            element.textContent =
                initial(
                    user?.full_name ||
                    user?.name ||
                    user?.username
                );
        }
    }


    /* =====================================================
       THEME
       ===================================================== */

    function applyTheme() {

        let actualTheme =
            currentTheme;

        if (currentTheme === "system") {

            actualTheme =
                window.matchMedia(
                    "(prefers-color-scheme: dark)"
                ).matches
                    ? "dark"
                    : "light";
        }

        document.body.dataset.theme =
            actualTheme;

        document.documentElement.dataset.theme =
            actualTheme;

        localStorage.setItem(
            "megchatbox-theme",
            currentTheme
        );

        $$(".appearance-option[data-theme]")
            .forEach(button => {

                button.classList.toggle(
                    "active",
                    button.dataset.theme ===
                    currentTheme
                );

                button.classList.toggle(
                    "selected",
                    button.dataset.theme ===
                    currentTheme
                );
            });
    }


    function applyDensity() {

        document.body.dataset.density =
            currentDensity;

        document.documentElement.dataset.density =
            currentDensity;

        localStorage.setItem(
            "megchatbox-density",
            currentDensity
        );

        $$(".appearance-option[data-density]")
            .forEach(button => {

                button.classList.toggle(
                    "active",
                    button.dataset.density ===
                    currentDensity
                );

                button.classList.toggle(
                    "selected",
                    button.dataset.density ===
                    currentDensity
                );
            });
    }


    function setupAppearance() {

        $$(".appearance-option[data-theme]")
            .forEach(button => {

                button.addEventListener(
                    "click",
                    () => {

                        currentTheme =
                            button.dataset.theme;

                        applyTheme();

                        toast(
                            "Theme updated.",
                            "success"
                        );
                    }
                );
            });


        $$(".appearance-option[data-density]")
            .forEach(button => {

                button.addEventListener(
                    "click",
                    () => {

                        currentDensity =
                            button.dataset.density;

                        applyDensity();

                        toast(
                            "Chat density updated.",
                            "success"
                        );
                    }
                );
            });
    }


    /* =====================================================
       LANGUAGE
       ===================================================== */

    function setupLanguage() {

        $$(".language-option")
            .forEach(button => {

                button.addEventListener(
                    "click",
                    () => {

                        currentLanguage =
                            button.dataset.language;

                        localStorage.setItem(
                            "megchatbox-language",
                            currentLanguage
                        );

                        $$(".language-option")
                            .forEach(item =>
                                item.classList.toggle(
                                    "active",
                                    item.dataset.language ===
                                    currentLanguage
                                )
                            );

                        closeModal(
                            "languageModal"
                        );

                        toast(
                            currentLanguage === "uz"
                                ? "Til o‘zgartirildi."
                                : currentLanguage === "ru"
                                    ? "Язык изменён."
                                    : "Language updated.",
                            "success"
                        );
                    }
                );
            });


        $$(".language-option")
            .forEach(button => {

                button.classList.toggle(
                    "active",
                    button.dataset.language ===
                    currentLanguage
                );
            });
    }


    /* =====================================================
       SESSION
       ===================================================== */

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
            data?.session?.user;

        if (!currentUser) {

            location.href = "index.html";

            return false;
        }

        return true;
    }


    /* =====================================================
       PROFILE
       ===================================================== */

    async function loadProfile() {

        const {
            data,
            error
        } = await db
            .from("profiles")
            .select("*")
            .eq(
                "id",
                currentUser.id
            )
            .single();

        if (error) {

            console.error(error);

            toast(
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

        avatar(
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


        if ($("#profileFullName")) {

            $("#profileFullName").value =
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

        avatar(
            $("#profileAvatar"),
            currentProfile
        );


        const owner =
            currentProfile.role === "owner";

        const admin =
            owner ||
            currentProfile.role === "admin";


        if ($("#ownerPanelButton")) {

            $("#ownerPanelButton").style.display =
                owner
                    ? "flex"
                    : "none";
        }

        if ($("#adminPanelButton")) {

            $("#adminPanelButton").style.display =
                admin
                    ? "flex"
                    : "none";
        }

        if ($("#updateCreateSection")) {

            $("#updateCreateSection").style.display =
                admin
                    ? "flex"
                    : "none";
        }
    }


    /* =====================================================
       LAST SEEN
       ===================================================== */

    async function updateLastSeen() {

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
    }


    function startLastSeen() {

        clearInterval(lastSeenTimer);

        updateLastSeen();

        lastSeenTimer =
            setInterval(
                updateLastSeen,
                60000
            );
    }


    /* =====================================================
       TABS
       ===================================================== */

    function setupTabs() {

        $$(".sidebar-tab")
            .forEach(button => {

                button.addEventListener(
                    "click",
                    async () => {

                        $$(".sidebar-tab")
                            .forEach(item =>
                                item.classList.remove(
                                    "active"
                                )
                            );

                        button.classList.add(
                            "active"
                        );

                        currentTab =
                            button.dataset.tab;

                        $$(".tab-content")
                            .forEach(content =>
                                content.classList.remove(
                                    "active"
                                )
                            );

                        const section =
                            document.getElementById(
                                currentTab === "chats"
                                    ? "chatsTab"
                                    : currentTab === "groups"
                                        ? "groupsTab"
                                        : "channelsTab"
                            );

                        section?.classList.add(
                            "active"
                        );


                        if (
                            currentTab ===
                            "chats"
                        ) {

                            await loadContacts();
                        }

                        if (
                            currentTab ===
                            "groups"
                        ) {

                            await loadGroups();
                        }

                        if (
                            currentTab ===
                            "channels"
                        ) {

                            await loadChannels();
                        }
                    }
                );
            });
    }


    /* =====================================================
       CONTACTS
       ===================================================== */

    async function loadContacts() {

        const list =
            $("#userList");

        if (!list) return;


        const {
            data: requests,
            error
        } = await db
            .from("contact_requests")
            .select("*")
            .or(
                `sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`
            )
            .eq(
                "status",
                "accepted"
            );

        if (error) {

            console.error(error);

            renderContacts([]);

            return;
        }


        const ids = [];

        for (const request of requests || []) {

            const other =
                request.sender_id ===
                currentUser.id
                    ? request.receiver_id
                    : request.sender_id;

            if (
                other &&
                !ids.includes(other)
            ) {

                ids.push(other);
            }
        }


        if (!ids.length) {

            contactsCache = [];

            renderContacts([]);

            return;
        }


        const {
            data: profiles,
            error: profileError
        } = await db
            .from("profiles")
            .select("*")
            .in(
                "id",
                ids
            );

        if (profileError) {

            console.error(profileError);

            return;
        }


        contactsCache =
            profiles || [];

        renderContacts(
            contactsCache
        );

        if ($("#contactCount")) {

            $("#contactCount").textContent =
                contactsCache.length;
        }
    }


    function renderContacts(users) {

        const list =
            $("#userList");

        if (!list) return;

        list.innerHTML = "";


        addSavedMessages();


        if (!users.length) {

            const empty =
                document.createElement(
                    "div"
                );

            empty.className =
                "empty-state";

            empty.innerHTML = `
                <i class="fa-regular fa-user"></i>
                <strong>No contacts yet</strong>
                <span>Search for a username above.</span>
            `;

            list.appendChild(empty);

            return;
        }


        users.forEach(user => {

            const item =
                document.createElement(
                    "div"
                );

            item.className =
                "chat-item";

            item.innerHTML = `
                <div class="avatar"></div>

                <div class="chat-info">

                    <span class="chat-info-name">
                        ${escapeHTML(
                            user.full_name ||
                            user.username
                        )}

                        ${
                            user.is_verified
                                ? `
                                    <span class="verified-badge">
                                        ✓
                                    </span>
                                `
                                : ""
                        }
                    </span>

                    <span class="chat-info-subtitle">
                        @${escapeHTML(
                            user.username
                        )}
                    </span>

                </div>
            `;

            avatar(
                item.querySelector(".avatar"),
                user
            );

            item.addEventListener(
                "click",
                () =>
                    openDirectChat(user)
            );

            list.appendChild(item);
        });
    }


    function addSavedMessages() {

        const list =
            $("#userList");

        if (!list) return;

        const existing =
            $("#savedMessagesChat");

        if (existing) {

            list.prepend(existing);

            return;
        }


        const item =
            document.createElement(
                "div"
            );

        item.id =
            "savedMessagesChat";

        item.className =
            "chat-item saved-chat-item";

        item.innerHTML = `
            <div class="avatar saved-avatar">
                <i class="fa-solid fa-bookmark"></i>
            </div>

            <div class="chat-info">

                <span class="chat-info-name">
                    Saved Messages
                </span>

                <span class="chat-info-subtitle">
                    Your personal messages
                </span>

            </div>
        `;

        item.addEventListener(
            "click",
            openSavedMessages
        );

        list.prepend(item);
    }


    /* =====================================================
       SEARCH
       ===================================================== */

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
                        250
                    );
            }
        );
    }


    async function searchUsers(value) {

        const username =
            value
                .trim()
                .replace(/^@/, "")
                .toLowerCase();


        if (!username) {

            if (
                currentTab ===
                "chats"
            ) {

                renderContacts(
                    contactsCache
                );
            }

            if (
                currentTab ===
                "groups"
            ) {

                renderGroups(
                    groupsCache
                );
            }

            if (
                currentTab ===
                "channels"
            ) {

                renderChannels(
                    channelsCache
                );
            }

            return;
        }


        if (
            currentTab ===
            "groups"
        ) {

            const {
                data,
                error
            } = await db
                .from("groups")
                .select("*")
                .ilike(
                    "username",
                    `%${username}%`
                )
                .limit(30);

            if (!error) {

                renderGroups(
                    data || []
                );
            }

            return;
        }


        if (
            currentTab ===
            "channels"
        ) {

            const {
                data,
                error
            } = await db
                .from("channels")
                .select("*")
                .ilike(
                    "username",
                    `%${username}%`
                )
                .limit(30);

            if (!error) {

                renderChannels(
                    data || []
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
            .limit(30);


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
            $("#userList");

        if (!list) return;

        list.innerHTML = "";


        if (!users.length) {

            list.innerHTML = `
                <div class="empty-state">
                    <strong>No users found</strong>
                </div>
            `;

            return;
        }


        users.forEach(user => {

            const item =
                document.createElement(
                    "div"
                );

            item.className =
                "chat-item";

            item.innerHTML = `
                <div class="avatar"></div>

                <div class="chat-info">

                    <span class="chat-info-name">
                        ${escapeHTML(
                            user.full_name ||
                            user.username
                        )}

                        ${
                            user.is_verified
                                ? `
                                    <span class="verified-badge">
                                        ✓
                                    </span>
                                `
                                : ""
                        }
                    </span>

                    <span class="chat-info-subtitle">
                        @${escapeHTML(
                            user.username
                        )}
                    </span>

                </div>

                ${
                    user.id === currentUser.id
                        ? `
                            <span class="request-badge">
                                You
                            </span>
                        `
                        : `
                            <button
                                type="button"
                                class="secondary-btn search-view-btn"
                            >
                                View
                            </button>
                        `
                }
            `;

            avatar(
                item.querySelector(".avatar"),
                user
            );


            item.addEventListener(
                "click",
                event => {

                    if (
                        event.target.closest(
                            ".search-view-btn"
                        )
                    ) {
                        return;
                    }

                    openUserProfile(
                        user
                    );
                }
            );


            item.querySelector(
                ".search-view-btn"
            )?.addEventListener(
                "click",
                event => {

                    event.stopPropagation();

                    openUserProfile(
                        user
                    );
                }
            );


            list.appendChild(item);
        });
    }


    /* =====================================================
       CONTACT REQUEST
       ===================================================== */

    async function contactRequest(userId) {

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


        [add, accept, decline]
            .forEach(button => {

                if (button) {

                    button.style.display =
                        "none";
                }
            });


        if (!selectedUser) return;


        const request =
            await contactRequest(
                selectedUser.id
            );


        if (!request) {

            if (add) {
                add.style.display =
                    "inline-flex";
            }

            return;
        }


        if (
            request.status ===
            "accepted"
        ) {

            return;
        }


        if (
            request.status ===
            "pending" &&
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

                status:
                    "pending"
            });


        if (error) {

            toast(
                error.code === "23505"
                    ? "Request already exists."
                    : error.message,
                "error"
            );

            return;
        }


        toast(
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
                status:
                    "accepted"
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

            toast(
                error.message,
                "error"
            );

            return;
        }


        toast(
            "Contact accepted.",
            "success"
        );

        await loadContacts();
        await updateContactActions();
        await updateInputState();
    }


    async function declineContact() {

        if (!selectedUser) return;


        const {
            error
        } = await db
            .from("contact_requests")
            .update({
                status:
                    "declined"
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

            toast(
                error.message,
                "error"
            );

            return;
        }


        toast(
            "Request declined.",
            "info"
        );

        await updateContactActions();
        await updateInputState();
    }


    /* =====================================================
       DIRECT CHAT
       ===================================================== */

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


        $("#chatEmpty")
            && (
                $("#chatEmpty").style.display =
                    "none"
            );


        $("#activeChat")
            && (
                $("#activeChat").style.display =
                    "flex"
            );


        if ($("#chatName")) {

            $("#chatName").textContent =
                user.full_name ||
                user.username;
        }


        if ($("#chatVerified")) {

            $("#chatVerified").style.display =
                user.is_verified
                    ? "inline-flex"
                    : "none";
        }


        avatar(
            $("#chatAvatar"),
            user
        );


        if ($("#chatStatus")) {

            $("#chatStatus").textContent =
                getStatus(user);
        }


        await updateContactActions();

        await loadMessages();

        await markDelivered();

        await markSeen();

        await updateInputState();
    }


    function getStatus(user) {

        if (!user) return "";

        if (
            user.show_online !== false &&
            user.last_seen &&
            Date.now() -
                new Date(
                    user.last_seen
                ).getTime() <
                120000
        ) {

            return "Online";
        }


        if (
            user.show_last_seen !== false &&
            user.last_seen
        ) {

            return `Last seen ${time(
                user.last_seen
            )}`;
        }


        return "Offline";
    }


    async function accepted() {

        if (!selectedUser) return false;

        const request =
            await contactRequest(
                selectedUser.id
            );

        return request?.status ===
            "accepted";
    }


    /* =====================================================
       INPUT
       ===================================================== */

    async function updateInputState() {

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


        let enabled = false;


        if (
            currentChatType ===
            "direct"
        ) {

            enabled =
                await accepted();
        }


        if (
            currentChatType ===
            "group" &&
            selectedGroup
        ) {

            enabled =
                await isGroupMember(
                    selectedGroup.id
                );
        }


        if (
            currentChatType ===
            "channel" &&
            selectedChannel
        ) {

            enabled =
                await isChannelWriter(
                    selectedChannel.id
                );
        }


        if (
            currentChatType ===
            "saved"
        ) {

            enabled = true;
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


        if (input) {

            input.placeholder =
                enabled
                    ? currentChatType === "saved"
                        ? "Write a saved message..."
                        : "Write a message..."
                    : "Accept contact request first...";
        }
    }


    function disableInput() {

        [
            $("#messageInput"),
            $("#sendButton"),
            $("#imageBtn"),
            $("#emojiBtn"),
            $("#stickerBtn")
        ].forEach(element => {

            if (element) {

                element.disabled = true;
            }
        });
    }


    /* =====================================================
       DIRECT MESSAGES
       ===================================================== */

    async function loadMessages() {

        if (!selectedUser) return;


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


    async function renderMessages(messages) {

        const container =
            $("#messages");

        if (!container) return;

        container.innerHTML = "";


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


        let lastDate = "";


        for (
            const message of messages
        ) {

            const currentDate =
                new Date(
                    message.created_at
                ).toDateString();


            if (
                currentDate !==
                lastDate
            ) {

                const divider =
                    document.createElement(
                        "div"
                    );

                divider.className =
                    "day-divider";

                divider.textContent =
                    dateText(
                        message.created_at
                    );

                container.appendChild(
                    divider
                );

                lastDate =
                    currentDate;
            }


            const row =
                await messageElement(
                    message
                );

            container.appendChild(
                row
            );
        }


        container.scrollTop =
            container.scrollHeight;
    }


    async function messageElement(
        message
    ) {

        const mine =
            message.sender_id ===
            currentUser.id;


        const row =
            document.createElement(
                "div"
            );

        row.className =
            `message-row ${
                mine
                    ? "mine"
                    : "theirs"
            }`;


        const swipe =
            document.createElement(
                "div"
            );

        swipe.className =
            "swipe-message";


        const bubble =
            document.createElement(
                "div"
            );

        bubble.className =
            "message-bubble";


        /* ACTIONS */

        if (mine && !message.deleted_at) {

            const actions =
                document.createElement(
                    "div"
                );

            actions.className =
                "swipe-actions";

            actions.innerHTML = `
                <button
                    type="button"
                    class="swipe-action"
                    data-action="edit"
                    title="Edit"
                >
                    <i class="fa-solid fa-pen"></i>
                </button>

                <button
                    type="button"
                    class="swipe-action delete"
                    data-action="delete"
                    title="Delete"
                >
                    <i class="fa-solid fa-trash"></i>
                </button>

                <button
                    type="button"
                    class="swipe-action"
                    data-action="save"
                    title="Save"
                >
                    <i class="fa-solid fa-bookmark"></i>
                </button>
            `;


            actions
                .querySelector(
                    '[data-action="edit"]'
                )
                .addEventListener(
                    "click",
                    () => {

                        editMessage(
                            message
                        );
                    }
                );


            actions
                .querySelector(
                    '[data-action="delete"]'
                )
                .addEventListener(
                    "click",
                    () => {

                        deleteMessage(
                            message.id
                        );
                    }
                );


            actions
                .querySelector(
                    '[data-action="save"]'
                )
                .addEventListener(
                    "click",
                    () => {

                        saveMessage(
                            message
                        );
                    }
                );


            swipe.appendChild(
                actions
            );
        }


        if (message.deleted_at) {

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

            image.src =
                await mediaUrl(
                    message.image_url
                );

            image.alt =
                "Image";

            bubble.appendChild(
                image
            );


            if (message.content) {

                const caption =
                    document.createElement(
                        "div"
                    );

                caption.className =
                    "message-text";

                caption.textContent =
                    message.content;

                bubble.appendChild(
                    caption
                );
            }

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


        const timeEl =
            document.createElement(
                "span"
            );

        timeEl.textContent =
            time(
                message.created_at
            );

        footer.appendChild(
            timeEl
        );


        if (mine && !message.deleted_at) {

            const status =
                document.createElement(
                    "span"
                );

            status.className =
                "message-status";

            status.textContent =
                message.seen_at
                    ? "✓✓"
                    : message.delivered_at
                        ? "✓✓"
                        : "✓";

            if (message.seen_at) {

                status.classList.add(
                    "seen"
                );
            }

            footer.appendChild(
                status
            );
        }


        bubble.appendChild(
            footer
        );

        swipe.appendChild(
            bubble
        );

        row.appendChild(
            swipe
        );


        setupSwipe(
            swipe,
            message,
            mine
        );


        return row;
    }


    function setupSwipe(
        element,
        message,
        mine
    ) {

        if (!mine) return;


        element.addEventListener(
            "pointerdown",
            event => {

                swipeStartX =
                    event.clientX;

                swipeCurrentX =
                    event.clientX;

                element.setPointerCapture(
                    event.pointerId
                );
            }
        );


        element.addEventListener(
            "pointermove",
            event => {

                if (
                    swipeStartX ===
                    null
                ) return;

                swipeCurrentX =
                    event.clientX;

                const delta =
                    swipeStartX -
                    swipeCurrentX;


                if (
                    delta > 10 &&
                    delta < 180
                ) {

                    element.style.transform =
                        `translateX(-${delta}px)`;
                }
            }
        );


        element.addEventListener(
            "pointerup",
            () => {

                const delta =
                    swipeStartX -
                    swipeCurrentX;


                element.style.transform =
                    "";


                if (delta > 70) {

                    element.classList.add(
                        "show-actions"
                    );

                    setTimeout(
                        () =>
                            element.classList.remove(
                                "show-actions"
                            ),
                        3500
                    );
                }


                swipeStartX =
                    null;
            }
        );
    }


    /* =====================================================
       MESSAGE EDIT / DELETE / SAVE
       ===================================================== */

    function editMessage(message) {

        if (
            message.message_type !==
            "text"
        ) return;


        editingMessageId =
            message.id;


        const input =
            $("#messageInput");

        if (!input) return;


        input.value =
            message.content || "";

        input.focus();


        $("#sendButton").innerHTML =
            '<i class="fa-solid fa-check"></i>';
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

            toast(
                error.message,
                "error"
            );

            return;
        }


        toast(
            "Message deleted.",
            "success"
        );

        await loadMessages();
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

            toast(
                error.message,
                "error"
            );

            return;
        }


        toast(
            "Message saved.",
            "success"
        );
    }


    /* =====================================================
       SEND MESSAGE
       ===================================================== */

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


        /* SAVED */

        if (
            currentChatType ===
            "saved"
        ) {

            const {
                error
            } = await db
                .from("saved_messages")
                .insert({
                    user_id:
                        currentUser.id,

                    content,

                    message_type:
                        "text"
                });


            if (error) {

                toast(
                    error.message,
                    "error"
                );

                return;
            }


            input.value = "";

            await loadSavedMessages();

            return;
        }


        /* EDIT */

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

                toast(
                    error.message,
                    "error"
                );

                return;
            }


            editingMessageId =
                null;

            input.value = "";

            $("#sendButton").innerHTML =
                '<i class="fa-solid fa-paper-plane"></i>';


            await loadMessages();

            return;
        }


        /* DIRECT */

        if (
            currentChatType ===
            "direct"
        ) {

            if (
                !(await accepted())
            ) {

                toast(
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

                toast(
                    error.message,
                    "error"
                );

                return;
            }
        }


        /* GROUP */

        if (
            currentChatType ===
            "group"
        ) {

            await sendGroupMessage(
                content
            );
        }


        /* CHANNEL */

        if (
            currentChatType ===
            "channel"
        ) {

            await sendChannelMessage(
                content
            );
        }


        input.value = "";

        await refreshChat();
    }


    /* =====================================================
       MEDIA
       ===================================================== */

    async function mediaUrl(path) {

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

            console.error(error);

            return "";
        }


        return data?.signedUrl || "";
    }


    async function sendImage(file) {

        if (!file) return;


        if (
            !file.type.startsWith(
                "image/"
            )
        ) {

            toast(
                "Please choose an image.",
                "error"
            );

            return;
        }


        if (
            file.size >
            10 * 1024 * 1024
        ) {

            toast(
                "Image must be under 10 MB.",
                "error"
            );

            return;
        }


        if (
            currentChatType ===
            "direct" &&
            !(await accepted())
        ) {

            toast(
                "Accept the contact request first.",
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
            `${currentUser.id}/${crypto.randomUUID()}.${extension}`;


        const {
            error: uploadError
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

            toast(
                uploadError.message,
                "error"
            );

            return;
        }


        let error = null;


        if (
            currentChatType ===
            "direct"
        ) {

            ({
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
                }));
        }


        if (
            currentChatType ===
            "group"
        ) {

            ({
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
                }));
        }


        if (
            currentChatType ===
            "channel"
        ) {

            if (
                !(await isChannelWriter(
                    selectedChannel.id
                ))
            ) {

                toast(
                    "Only channel admins can post.",
                    "error"
                );

                return;
            }


            ({
                error
            } = await db
                .from("channel_messages")
                .insert({
                    channel_id:
                        selectedChannel.id,

                    sender_id:
                        currentUser.id,

                    content: "",

                    message_type:
                        "image",

                    image_url:
                        path
                }));
        }


        if (error) {

            toast(
                error.message,
                "error"
            );

            return;
        }


        await refreshChat();
    }


    /* =====================================================
       DELIVERY
       ===================================================== */

    async function markDelivered() {

        if (!selectedUser) return;

        await db.rpc(
            "mark_messages_delivered",
            {
                p_other_user_id:
                    selectedUser.id
            }
        );
    }


    async function markSeen() {

        if (!selectedUser) return;

        await db.rpc(
            "mark_chat_seen",
            {
                p_other_user_id:
                    selectedUser.id
            }
        );
    }


    /* =====================================================
       GROUPS
       ===================================================== */

    async function loadGroups() {

        const {
            data: memberships,
            error
        } = await db
            .from("group_members")
            .select("group_id")
            .eq(
                "user_id",
                currentUser.id
            );


        if (error) {

            console.error(
                "Group membership:",
                error
            );
        }


        const ids =
            (memberships || [])
                .map(item =>
                    item.group_id
                );


        /*
         * Owner-created groups are also loaded.
         * This makes them visible even if the membership
         * trigger has not been installed yet.
         */

        const {
            data: ownedGroups
        } = await db
            .from("groups")
            .select("*")
            .eq(
                "owner_id",
                currentUser.id
            );


        const allIds = [
            ...ids,
            ...(ownedGroups || [])
                .map(group => group.id)
        ];


        const uniqueIds =
            [...new Set(allIds)];


        if (!uniqueIds.length) {

            groupsCache = [];

            renderGroups([]);

            $("#groupCount")
                && (
                    $("#groupCount").textContent =
                        "0"
                );

            return;
        }


        const {
            data,
            error: groupError
        } = await db
            .from("groups")
            .select("*")
            .in(
                "id",
                uniqueIds
            )
            .order(
                "created_at",
                {
                    ascending: false
                }
            );


        if (groupError) {

            console.error(
                groupError
            );

            return;
        }


        groupsCache =
            data || [];


        renderGroups(
            groupsCache
        );


        $("#groupCount")
            && (
                $("#groupCount").textContent =
                    groupsCache.length
            );
    }


    function renderGroups(groups) {

        const list =
            $("#groupsList");

        if (!list) return;

        list.innerHTML = "";


        if (!groups.length) {

            list.innerHTML = `
                <div class="empty-state">
                    <i class="fa-solid fa-users"></i>
                    <strong>No groups yet</strong>
                    <span>Create or join a group.</span>
                </div>
            `;

            return;
        }


        groups.forEach(group => {

            const item =
                document.createElement(
                    "div"
                );

            item.className =
                "chat-item";

            item.innerHTML = `
                <div class="avatar"></div>

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
            `;


            avatar(
                item.querySelector(".avatar"),
                group
            );


            item.addEventListener(
                "click",
                () =>
                    openGroup(
                        group
                    )
            );


            list.appendChild(
                item
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


        if (data) return true;


        return (
            selectedGroup?.owner_id ===
            currentUser.id
        );
    }


    async function openGroup(
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


        $("#chatEmpty").style.display =
            "none";

        $("#activeChat").style.display =
            "flex";


        $("#chatName").textContent =
            group.name;


        $("#chatVerified").style.display =
            "none";


        avatar(
            $("#chatAvatar"),
            group
        );


        $("#chatStatus").textContent =
            group.username
                ? "@" +
                  group.username
                : "Group";


        await loadGroupMessages(
            group.id
        );

        await updateInputState();
    }


    async function loadGroupMessages(
        groupId
    ) {

        const {
            data,
            error
        } = await db
            .from("group_messages")
            .select("*")
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


        const senderIds =
            [
                ...new Set(
                    (data || [])
                        .map(message =>
                            message.sender_id
                        )
                )
            ];


        let profiles = [];


        if (senderIds.length) {

            const result =
                await db
                    .from("profiles")
                    .select("*")
                    .in(
                        "id",
                        senderIds
                    );

            profiles =
                result.data || [];
        }


        const map =
            new Map(
                profiles.map(
                    profile =>
                        [
                            profile.id,
                            profile
                        ]
                )
            );


        renderGroupMessages(
            (data || []).map(
                message => ({
                    ...message,
                    sender:
                        map.get(
                            message.sender_id
                        )
                })
            )
        );
    }


    async function renderGroupMessages(
        messages
    ) {

        const container =
            $("#messages");

        if (!container) return;

        container.innerHTML = "";


        if (!messages.length) {

            container.innerHTML = `
                <div class="empty-state">
                    <i class="fa-solid fa-users"></i>
                    <strong>No messages yet</strong>
                </div>
            `;

            return;
        }


        for (
            const message of messages
        ) {

            const row =
                document.createElement(
                    "div"
                );

            row.className =
                `message-row ${
                    message.sender_id ===
                    currentUser.id
                        ? "mine"
                        : "theirs"
                }`;


            const bubble =
                document.createElement(
                    "div"
                );

            bubble.className =
                "message-bubble";


            if (
                message.sender_id !==
                currentUser.id
            ) {

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


            if (message.deleted_at) {

                bubble.innerHTML += `
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

                image.src =
                    await mediaUrl(
                        message.image_url
                    );

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
                time(
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


        if (
            !(await isGroupMember(
                selectedGroup.id
            ))
        ) {

            toast(
                "You are not a group member.",
                "error"
            );

            return;
        }


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

            toast(
                error.message,
                "error"
            );
        }
    }


    /* =====================================================
       CHANNELS
       ===================================================== */

    async function loadChannels() {

        const {
            data: memberships,
            error
        } = await db
            .from("channel_members")
            .select("channel_id")
            .eq(
                "user_id",
                currentUser.id
            );


        if (error) {

            console.error(error);
        }


        const ids =
            (memberships || [])
                .map(
                    item =>
                        item.channel_id
                );


        const {
            data: ownedChannels
        } = await db
            .from("channels")
            .select("*")
            .eq(
                "owner_id",
                currentUser.id
            );


        const allIds = [
            ...ids,
            ...(ownedChannels || [])
                .map(
                    channel =>
                        channel.id
                )
        ];


        const uniqueIds =
            [...new Set(allIds)];


        if (!uniqueIds.length) {

            channelsCache = [];

            renderChannels([]);

            $("#channelCount")
                && (
                    $("#channelCount").textContent =
                        "0"
                );

            return;
        }


        const {
            data,
            error: channelError
        } = await db
            .from("channels")
            .select("*")
            .in(
                "id",
                uniqueIds
            )
            .order(
                "created_at",
                {
                    ascending: false
                }
            );


        if (channelError) {

            console.error(
                channelError
            );

            return;
        }


        channelsCache =
            data || [];


        renderChannels(
            channelsCache
        );


        $("#channelCount")
            && (
                $("#channelCount").textContent =
                    channelsCache.length
            );
    }


    function renderChannels(
        channels
    ) {

        const list =
            $("#channelsList");

        if (!list) return;

        list.innerHTML = "";


        if (!channels.length) {

            list.innerHTML = `
                <div class="empty-state">
                    <i class="fa-solid fa-bullhorn"></i>
                    <strong>No channels yet</strong>
                    <span>Create or join a channel.</span>
                </div>
            `;

            return;
        }


        channels.forEach(channel => {

            const item =
                document.createElement(
                    "div"
                );

            item.className =
                "chat-item";


            item.innerHTML = `
                <div class="avatar"></div>

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
            `;


            avatar(
                item.querySelector(".avatar"),
                channel
            );


            item.addEventListener(
                "click",
                () =>
                    openChannel(
                        channel
                    )
            );


            list.appendChild(
                item
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


        if (
            data &&
            (
                data.role === "owner" ||
                data.role === "admin"
            )
        ) {

            return true;
        }


        return (
            selectedChannel?.owner_id ===
            currentUser.id
        );
    }


    async function openChannel(
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

        $("#chatEmpty").style.display =
            "none";

        $("#activeChat").style.display =
            "flex";


        $("#chatName").textContent =
            channel.name;


        $("#chatVerified").style.display =
            "none";


        avatar(
            $("#chatAvatar"),
            channel
        );


        $("#chatStatus").textContent =
            channel.username
                ? "@" +
                  channel.username
                : "Channel";


        await loadChannelMessages(
            channel.id
        );

        await updateInputState();
    }


    async function loadChannelMessages(
        channelId
    ) {

        const {
            data,
            error
        } = await db
            .from("channel_messages")
            .select("*")
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


        const ids =
            [
                ...new Set(
                    (data || [])
                        .map(
                            message =>
                                message.sender_id
                        )
                )
            ];


        let profiles = [];


        if (ids.length) {

            const result =
                await db
                    .from("profiles")
                    .select("*")
                    .in(
                        "id",
                        ids
                    );

            profiles =
                result.data || [];
        }


        const map =
            new Map(
                profiles.map(
                    profile =>
                        [
                            profile.id,
                            profile
                        ]
                )
            );


        renderChannelMessages(
            (data || []).map(
                message => ({
                    ...message,
                    sender:
                        map.get(
                            message.sender_id
                        )
                })
            )
        );
    }


    async function renderChannelMessages(
        messages
    ) {

        const container =
            $("#messages");

        if (!container) return;

        container.innerHTML = "";


        if (!messages.length) {

            container.innerHTML = `
                <div class="empty-state">
                    <i class="fa-solid fa-bullhorn"></i>
                    <strong>No posts yet</strong>
                </div>
            `;

            return;
        }


        for (
            const message of messages
        ) {

            const row =
                document.createElement(
                    "div"
                );

            row.className =
                `message-row ${
                    message.sender_id ===
                    currentUser.id
                        ? "mine"
                        : "theirs"
                }`;


            const bubble =
                document.createElement(
                    "div"
                );

            bubble.className =
                "message-bubble";


            if (message.deleted_at) {

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

                image.src =
                    await mediaUrl(
                        message.image_url
                    );

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
                time(
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


        if (
            !(await isChannelWriter(
                selectedChannel.id
            ))
        ) {

            toast(
                "Only channel admins can post.",
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

            toast(
                error.message,
                "error"
            );
        }
    }


    /* =====================================================
       SAVED MESSAGES
       ===================================================== */

    async function openSavedMessages() {

        selectedUser = null;
        selectedGroup = null;
        selectedChannel = null;

        currentChatType =
            "saved";


        $("#app")
            ?.classList.add(
                "chat-open"
            );

        $("#chatEmpty").style.display =
            "none";

        $("#activeChat").style.display =
            "flex";


        $("#chatName").textContent =
            "Saved Messages";


        $("#chatVerified").style.display =
            "none";


        $("#chatStatus").textContent =
            "Your personal messages";


        $("#chatAvatar").innerHTML =
            '<i class="fa-solid fa-bookmark"></i>';


        await loadSavedMessages();

        await updateInputState();
    }


    async function loadSavedMessages() {

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
                    ascending: true
                }
            );


        if (error) {

            console.error(error);

            return;
        }


        const container =
            $("#messages");

        if (!container) return;

        container.innerHTML = "";


        if (!data?.length) {

            container.innerHTML = `
                <div class="empty-state">
                    <i class="fa-solid fa-bookmark"></i>
                    <strong>No saved messages</strong>
                    <span>Save messages with swipe actions.</span>
                </div>
            `;

            return;
        }


        data.forEach(message => {

            const row =
                document.createElement(
                    "div"
                );

            row.className =
                "message-row mine";


            const bubble =
                document.createElement(
                    "div"
                );

            bubble.className =
                "message-bubble";


            bubble.innerHTML = `
                <div class="message-text">
                    ${escapeHTML(
                        message.content
                    )}
                </div>

                <div class="message-footer">
                    ${time(
                        message.created_at
                    )}
                </div>
            `;


            row.appendChild(
                bubble
            );

            container.appendChild(
                row
            );
        });


        container.scrollTop =
            container.scrollHeight;
    }


    /* =====================================================
       GROUP / CHANNEL CREATE
       ===================================================== */

    async function createGroup(
        event
    ) {

        event.preventDefault();


        const name =
            $("#groupName")
                .value.trim();

        const username =
            $("#groupUsername")
                .value.trim()
                .toLowerCase();

        const bio =
            $("#groupBio")
                .value.trim();


        if (!name || !username) {

            toast(
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

            toast(
                error.message,
                "error"
            );

            return;
        }


        /*
         * The SQL trigger below automatically creates
         * the owner membership.
         */


        closeModal(
            "createGroupModal"
        );


        $("#groupForm")
            ?.reset();


        toast(
            "Group created.",
            "success"
        );


        await loadGroups();


        const created =
            groupsCache.find(
                group =>
                    String(group.id) ===
                    String(data.id)
            );


        if (created) {

            await openGroup(
                created
            );
        }
    }


    async function createChannel(
        event
    ) {

        event.preventDefault();


        const name =
            $("#channelName")
                .value.trim();

        const username =
            $("#channelUsername")
                .value.trim()
                .toLowerCase();

        const bio =
            $("#channelBio")
                .value.trim();


        if (!name || !username) {

            toast(
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

            toast(
                error.message,
                "error"
            );

            return;
        }


        closeModal(
            "createChannelModal"
        );


        $("#channelForm")
            ?.reset();


        toast(
            "Channel created.",
            "success"
        );


        await loadChannels();


        const created =
            channelsCache.find(
                channel =>
                    String(channel.id) ===
                    String(data.id)
            );


        if (created) {

            await openChannel(
                created
            );
        }
    }


    /* =====================================================
       INVITES
       ===================================================== */

    async function joinGroup() {

        const code =
            $("#groupInviteInput")
                .value.trim();

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

            toast(
                error.message,
                "error"
            );

            return;
        }


        closeModal(
            "joinGroupModal"
        );


        toast(
            "Joined group.",
            "success"
        );


        await loadGroups();


        const group =
            groupsCache.find(
                item =>
                    String(item.id) ===
                    String(data)
            );


        if (group) {

            await openGroup(
                group
            );
        }
    }


    async function joinChannel() {

        const code =
            $("#channelInviteInput")
                .value.trim();

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

            toast(
                error.message,
                "error"
            );

            return;
        }


        closeModal(
            "joinChannelModal"
        );


        toast(
            "Joined channel.",
            "success"
        );


        await loadChannels();


        const channel =
            channelsCache.find(
                item =>
                    String(item.id) ===
                    String(data)
            );


        if (channel) {

            await openChannel(
                channel
            );
        }
    }


    /* =====================================================
       GROUP / CHANNEL INFO
       ===================================================== */

    function openGroupInfo() {

        if (!selectedGroup) return;


        $("#groupInfoName")
            .textContent =
                selectedGroup.name;

        $("#groupInfoUsername")
            .textContent =
                selectedGroup.username
                    ? "@" +
                      selectedGroup.username
                    : "";

        $("#groupInfoBio")
            .textContent =
                selectedGroup.bio ||
                "No bio.";


        openModal(
            "groupInfoModal"
        );
    }


    function openChannelInfo() {

        if (!selectedChannel) return;


        $("#channelInfoName")
            .textContent =
                selectedChannel.name;

        $("#channelInfoUsername")
            .textContent =
                selectedChannel.username
                    ? "@" +
                      selectedChannel.username
                    : "";

        $("#channelInfoBio")
            .textContent =
                selectedChannel.bio ||
                "No bio.";


        openModal(
            "channelInfoModal"
        );
    }


    async function createGroupInvite() {

        if (!selectedGroup) return;


        const {
            data,
            error
        } = await db.rpc(
            "create_group_invite",
            {
                p_group_id:
                    selectedGroup.id
            }
        );


        if (error) {

            toast(
                error.message,
                "error"
            );

            return;
        }


        await copyText(
            data
        );

        toast(
            "Group invite copied.",
            "success"
        );
    }


    async function createChannelInvite() {

        if (!selectedChannel) return;


        const {
            data,
            error
        } = await db.rpc(
            "create_channel_invite",
            {
                p_channel_id:
                    selectedChannel.id
            }
        );


        if (error) {

            toast(
                error.message,
                "error"
            );

            return;
        }


        await copyText(
            data
        );

        toast(
            "Channel invite copied.",
            "success"
        );
    }


    async function copyText(
        value
    ) {

        try {

            await navigator.clipboard.writeText(
                value
            );

        } catch {

            const area =
                document.createElement(
                    "textarea"
                );

            area.value =
                value;

            document.body.appendChild(
                area
            );

            area.select();

            document.execCommand(
                "copy"
            );

            area.remove();
        }
    }


    async function showMembers(
        type
    ) {

        let rows = [];

        let title = "";


        if (
            type ===
            "group"
        ) {

            title =
                "Group Members";


            const {
                data
            } = await db
                .from("group_members")
                .select("*")
                .eq(
                    "group_id",
                    selectedGroup.id
                );

            rows =
                data || [];
        }


        if (
            type ===
            "channel"
        ) {

            title =
                "Channel Members";


            const {
                data
            } = await db
                .from("channel_members")
                .select("*")
                .eq(
                    "channel_id",
                    selectedChannel.id
                );

            rows =
                data || [];
        }


        const ids =
            rows.map(
                row =>
                    row.user_id
            );


        let profiles = [];


        if (ids.length) {

            const {
                data
            } = await db
                .from("profiles")
                .select("*")
                .in(
                    "id",
                    ids
                );

            profiles =
                data || [];
        }


        const map =
            new Map(
                profiles.map(
                    profile =>
                        [
                            profile.id,
                            profile
                        ]
                )
            );


        $("#membersTitle")
            .textContent =
                `${title} (${profiles.length})`;


        const list =
            $("#membersList");

        list.innerHTML = "";


        profiles.forEach(profile => {

            const item =
                document.createElement(
                    "div"
                );

            item.className =
                "chat-item";


            item.innerHTML = `
                <div class="avatar"></div>

                <div class="chat-info">

                    <span class="chat-info-name">
                        ${escapeHTML(
                            profile.full_name ||
                            profile.username
                        )}
                    </span>

                    <span class="chat-info-subtitle">
                        @${escapeHTML(
                            profile.username
                        )}
                    </span>

                </div>
            `;


            avatar(
                item.querySelector(".avatar"),
                profile
            );


            list.appendChild(
                item
            );
        });


        openModal(
            "membersModal"
        );
    }


    async function leaveGroup() {

        if (!selectedGroup) return;


        const {
            error
        } = await db
            .from("group_members")
            .delete()
            .eq(
                "group_id",
                selectedGroup.id
            )
            .eq(
                "user_id",
                currentUser.id
            );


        if (error) {

            toast(
                error.message,
                "error"
            );

            return;
        }


        closeModal(
            "groupInfoModal"
        );


        selectedGroup = null;

        currentChatType = null;


        $("#activeChat").style.display =
            "none";

        $("#chatEmpty").style.display =
            "flex";


        await loadGroups();
    }


    async function leaveChannel() {

        if (!selectedChannel) return;


        const {
            error
        } = await db
            .from("channel_members")
            .delete()
            .eq(
                "channel_id",
                selectedChannel.id
            )
            .eq(
                "user_id",
                currentUser.id
            );


        if (error) {

            toast(
                error.message,
                "error"
            );

            return;
        }


        closeModal(
            "channelInfoModal"
        );


        selectedChannel = null;

        currentChatType = null;


        $("#activeChat").style.display =
            "none";

        $("#chatEmpty").style.display =
            "flex";


        await loadChannels();
    }


    /* =====================================================
       PROFILE POPUP
       ===================================================== */

    async function openUserProfile(
        user
    ) {

        selectedUser =
            user;


        avatar(
            $("#userProfileAvatar"),
            user
        );


        $("#userProfileName")
            .textContent =
                user.full_name ||
                user.username;


        $("#userProfileVerified")
            .style.display =
                user.is_verified
                    ? "inline-flex"
                    : "none";


        $("#userProfileUsername")
            .textContent =
                "@" +
                user.username;


        $("#userProfileBio")
            .textContent =
                user.bio ||
                "No bio yet.";


        $("#userProfileStatus")
            .textContent =
                getStatus(user);


        $("#userProfileMenu")
            .classList.remove(
                "show"
            );


        openModal(
            "userProfileModal"
        );


        await updateContactActions();
    }


    /* =====================================================
       NICKNAME
       ===================================================== */

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


        return data?.nickname ||
            null;
    }


    async function saveNickname() {

        if (!selectedUser) return;


        const nickname =
            $("#nicknameInput")
                .value.trim();


        if (!nickname) {

            toast(
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

            toast(
                error.message,
                "error"
            );

            return;
        }


        closeModal(
            "nicknameModal"
        );


        toast(
            "Nickname saved.",
            "success"
        );
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

            toast(
                error.message,
                "error"
            );

            return;
        }


        closeModal(
            "nicknameModal"
        );


        toast(
            "Nickname removed.",
            "success"
        );
    }


    /* =====================================================
       BLOCK / REPORT
       ===================================================== */

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

            toast(
                error.message,
                "error"
            );

            return;
        }


        closeModal(
            "userProfileModal"
        );


        toast(
            "User blocked.",
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


        const value =
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
                    value,

                description:
                    "Reported from MegChatBox.",

                status:
                    "pending"
            });


        if (error) {

            toast(
                error.message,
                "error"
            );

            return;
        }


        closeModal(
            "userProfileModal"
        );


        toast(
            "Report submitted.",
            "success"
        );
    }


    /* =====================================================
       PROFILE SAVE
       ===================================================== */

    async function saveProfile(
        event
    ) {

        event.preventDefault();


        const fullName =
            $("#profileFullName")
                .value.trim();

        const username =
            $("#profileUsername")
                .value.trim()
                .toLowerCase();

        const bio =
            $("#profileBio")
                .value.trim();


        if (!fullName || !username) {

            toast(
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

            toast(
                "Invalid username.",
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
                    bio
            })
            .eq(
                "id",
                currentUser.id
            );


        if (error) {

            toast(
                error.code === "23505"
                    ? "Username already exists."
                    : error.message,
                "error"
            );

            return;
        }


        await loadProfile();

        closeModal(
            "profileModal"
        );


        toast(
            "Profile updated.",
            "success"
        );
    }


    /* =====================================================
       AVATAR
       ===================================================== */

    async function uploadAvatar(
        file
    ) {

        if (!file) return;


        if (
            !file.type.startsWith(
                "image/"
            )
        ) {

            toast(
                "Choose an image.",
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
            error
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


        if (error) {

            toast(
                error.message,
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


        await db
            .from("profiles")
            .update({
                avatar_url:
                    data.publicUrl
            })
            .eq(
                "id",
                currentUser.id
            );


        await loadProfile();


        toast(
            "Avatar updated.",
            "success"
        );
    }


    /* =====================================================
       PRIVACY
       ===================================================== */

    function openPrivacy() {

        $("#showOnlineToggle")
            .checked =
                currentProfile
                    ?.show_online !== false;


        $("#showLastSeenToggle")
            .checked =
                currentProfile
                    ?.show_last_seen !== false;


        openModal(
            "privacyModal"
        );
    }


    async function savePrivacy() {

        const showOnline =
            $("#showOnlineToggle")
                .checked;

        const showLastSeen =
            $("#showLastSeenToggle")
                .checked;


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

            toast(
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


        toast(
            "Privacy saved.",
            "success"
        );
    }


    /* =====================================================
       UPDATES
       ===================================================== */

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
            data.map(
                update => `
                    <article class="update-card">

                        <div class="update-card-top">

                            <span class="update-type">
                                ${escapeHTML(
                                    update.update_type
                                )}
                            </span>

                            <span class="update-date">
                                ${dateText(
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

                    </article>
                `
            ).join("");
    }


    async function publishUpdate() {

        if (
            ![
                "owner",
                "admin"
            ].includes(
                currentProfile.role
            )
        ) {

            return;
        }


        const type =
            $("#updateType")
                .value;

        const title =
            $("#updateTitle")
                .value.trim();

        const content =
            $("#updateContent")
                .value.trim();


        if (!title || !content) {

            toast(
                "Fill all fields.",
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

            toast(
                error.message,
                "error"
            );

            return;
        }


        $("#updateTitle").value =
            "";

        $("#updateContent").value =
            "";


        toast(
            "Update published.",
            "success"
        );


        await loadUpdates();
    }


    /* =====================================================
       OWNER
       ===================================================== */

    async function ownerFind(
        inputId,
        resultId
    ) {

        const username =
            $(inputId)
                ?.value.trim()
                .replace(/^@/, "")
                .toLowerCase();


        if (!username) {

            toast(
                "Enter username.",
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
                username
            )
            .maybeSingle();


        if (error || !data) {

            $(resultId).innerHTML = `
                <div class="empty-state">
                    User not found.
                </div>
            `;

            return null;
        }


        return data;
    }


    async function ownerVerified() {

        const user =
            await ownerFind(
                "#ownerVerifiedUsername",
                "#ownerVerifiedResult"
            );


        if (!user) return;


        const verified =
            user.is_verified === true;


        $("#ownerVerifiedResult")
            .innerHTML = `
                <div class="chat-item">

                    <div class="avatar"></div>

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
                        type="button"
                        class="primary-btn"
                        id="verifiedActionBtn"
                    >
                        ${
                            verified
                                ? "Remove"
                                : "Verify"
                        }
                    </button>

                </div>
            `;


        avatar(
            $("#ownerVerifiedResult .avatar"),
            user
        );


        $("#verifiedActionBtn")
            .addEventListener(
                "click",
                async () => {

                    const {
                        error
                    } = await db.rpc(
                        "owner_set_verified",
                        {
                            p_user_id:
                                user.id,

                            p_action:
                                verified
                                    ? "remove"
                                    : "give"
                        }
                    );


                    if (error) {

                        toast(
                            error.message,
                            "error"
                        );

                        return;
                    }


                    toast(
                        verified
                            ? "Verified removed."
                            : "User verified.",
                        "success"
                    );


                    await ownerVerified();
                }
            );
    }


    async function ownerModeration() {

        const user =
            await ownerFind(
                "#ownerModerationUsername",
                "#ownerModerationResult"
            );


        if (!user) return;


        $("#ownerModerationResult")
            .innerHTML = `
                <div class="chat-item">

                    <div class="avatar"></div>

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
                        type="button"
                        class="secondary-btn"
                        id="blockMessagingBtn"
                    >
                        Messaging Block
                    </button>

                    <button
                        type="button"
                        class="danger-btn"
                        id="blockAccountBtn"
                    >
                        Account Block
                    </button>

                </div>
            `;


        avatar(
            $("#ownerModerationResult .avatar"),
            user
        );


        $("#blockMessagingBtn")
            .addEventListener(
                "click",
                () =>
                    ownerBlock(
                        user,
                        "messaging"
                    )
            );


        $("#blockAccountBtn")
            .addEventListener(
                "click",
                () =>
                    ownerBlock(
                        user,
                        "account"
                    )
            );
    }


    async function ownerBlock(
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

            toast(
                error.message,
                "error"
            );

            return;
        }


        toast(
            type === "account"
                ? "Account blocked."
                : "Messaging blocked.",
            "success"
        );
    }


    async function ownerAdmin() {

        const user =
            await ownerFind(
                "#ownerAdminUsername",
                "#ownerAdminResult"
            );


        if (!user) return;


        const admin =
            user.role === "admin";


        $("#ownerAdminResult")
            .innerHTML = `
                <div class="chat-item">

                    <div class="avatar"></div>

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
                        type="button"
                        class="primary-btn"
                        id="adminActionBtn"
                    >
                        ${
                            admin
                                ? "Remove Admin"
                                : "Make Admin"
                        }
                    </button>

                </div>
            `;


        avatar(
            $("#ownerAdminResult .avatar"),
            user
        );


        $("#adminActionBtn")
            .addEventListener(
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
                                admin
                                    ? "remove"
                                    : "add"
                        }
                    );


                    if (error) {

                        toast(
                            error.message,
                            "error"
                        );

                        return;
                    }


                    toast(
                        admin
                            ? "Admin removed."
                            : "Admin added.",
                        "success"
                    );


                    await ownerAdmin();
                }
            );
    }


    async function loadReports() {

        const list =
            $("#ownerReportsList");

        if (!list) return;


        const {
            data,
            error
        } = await db
            .from("reports")
            .select("*")
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
                    Could not load reports.
                </div>
            `;

            return;
        }


        if (!data?.length) {

            list.innerHTML = `
                <div class="empty-state">
                    <i class="fa-solid fa-check"></i>
                    <strong>No reports</strong>
                </div>
            `;

            return;
        }


        list.innerHTML =
            data.map(
                report => `
                    <div class="chat-item">

                        <div class="chat-info">

                            <span class="chat-info-name">
                                Report #${report.id}
                            </span>

                            <span class="chat-info-subtitle">
                                ${escapeHTML(
                                    report.reason
                                )}
                                ·
                                ${escapeHTML(
                                    report.status
                                )}
                            </span>

                        </div>

                    </div>
                `
            ).join("");
    }


    /* =====================================================
       EMOJI
       ===================================================== */

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
            "🎉","👏","🙏","💀","🤝",
            "😅","😉","🤔","😴","🥳"
        ];


        panel.innerHTML =
            emojis.map(
                emoji =>
                    `
                    <button
                        type="button"
                        class="emoji-item"
                    >
                        ${emoji}
                    </button>
                    `
            ).join("");


        button.addEventListener(
            "click",
            event => {

                event.stopPropagation();

                $("#stickerPanel")
                    ?.classList.remove(
                        "show"
                    );

                panel.classList.toggle(
                    "show"
                );
            }
        );


        panel.addEventListener(
            "click",
            event => {

                const button =
                    event.target.closest(
                        ".emoji-item"
                    );

                if (!button) return;


                $("#messageInput").value +=
                    button.textContent;

                $("#messageInput").focus();
            }
        );
    }


    function setupStickers() {

        $("#stickerBtn")
            ?.addEventListener(
                "click",
                event => {

                    event.stopPropagation();

                    $("#emojiPanel")
                        ?.classList.remove(
                            "show"
                        );

                    $("#stickerPanel")
                        ?.classList.toggle(
                            "show"
                        );
                }
            );
    }


    /* =====================================================
       MODALS / EVENTS
       ===================================================== */

    function setupEvents() {


        /* CLOSE EVERY MODAL */

        $$("[data-close]")
            .forEach(button => {

                button.addEventListener(
                    "click",
                    event => {

                        event.preventDefault();

                        closeModal(
                            button.dataset.close
                        );
                    }
                );
            });


        $$(".modal-overlay")
            .forEach(overlay => {

                overlay.addEventListener(
                    "click",
                    event => {

                        if (
                            event.target ===
                            overlay
                        ) {

                            overlay.classList.remove(
                                "show"
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
                }
            }
        );


        /* SETTINGS */

        $("#settingsBtn")
            ?.addEventListener(
                "click",
                () =>
                    openModal(
                        "settingsModal"
                    )
            );


        /* PROFILE */

        $("#myProfileBtn")
            ?.addEventListener(
                "click",
                () => {

                    renderMyProfile();

                    openModal(
                        "profileModal"
                    );
                }
            );


        $("#profileSettingsBtn")
            ?.addEventListener(
                "click",
                () => {

                    closeModal(
                        "settingsModal"
                    );

                    renderMyProfile();

                    openModal(
                        "profileModal"
                    );
                }
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

                    uploadAvatar(
                        event.target.files?.[0]
                    );

                    event.target.value =
                        "";
                }
            );


        /* PRIVACY */

        $("#privacySettingsBtn")
            ?.addEventListener(
                "click",
                () => {

                    closeModal(
                        "settingsModal"
                    );

                    openPrivacy();
                }
            );


        $("#savePrivacyBtn")
            ?.addEventListener(
                "click",
                savePrivacy
            );


        /* APPEARANCE */

        $("#appearanceSettingsBtn")
            ?.addEventListener(
                "click",
                () => {

                    closeModal(
                        "settingsModal"
                    );

                    openModal(
                        "appearanceModal"
                    );

                    applyTheme();
                    applyDensity();
                }
            );


        /* LANGUAGE */

        $("#languageSettingsBtn")
            ?.addEventListener(
                "click",
                () => {

                    closeModal(
                        "settingsModal"
                    );

                    openModal(
                        "languageModal"
                    );
                }
            );


        /* UPDATES */

        $("#updatesSettingsBtn")
            ?.addEventListener(
                "click",
                async () => {

                    closeModal(
                        "settingsModal"
                    );

                    await loadUpdates();

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


        /* OWNER */

        $("#ownerPanelButton")
            ?.addEventListener(
                "click",
                async () => {

                    if (
                        currentProfile.role !==
                        "owner"
                    ) {

                        toast(
                            "Owner access only.",
                            "error"
                        );

                        return;
                    }


                    closeModal(
                        "settingsModal"
                    );

                    openModal(
                        "ownerModal"
                    );


                    await loadReports();
                }
            );


        $$(".owner-tab")
            .forEach(button => {

                button.addEventListener(
                    "click",
                    async () => {

                        $$(".owner-tab")
                            .forEach(
                                item =>
                                    item.classList.remove(
                                        "active"
                                    )
                            );

                        button.classList.add(
                            "active"
                        );


                        const target =
                            button.dataset.ownerTab;


                        $$("[data-owner-panel]")
                            .forEach(panel => {

                                panel.style.display =
                                    panel.dataset.ownerPanel ===
                                    target
                                        ? "block"
                                        : "none";
                            });


                        if (
                            target ===
                            "reports"
                        ) {

                            await loadReports();
                        }
                    }
                );
            });


        $("#ownerVerifiedSearchBtn")
            ?.addEventListener(
                "click",
                ownerVerified
            );


        $("#ownerModerationSearchBtn")
            ?.addEventListener(
                "click",
                ownerModeration
            );


        $("#ownerAdminSearchBtn")
            ?.addEventListener(
                "click",
                ownerAdmin
            );


        /* ADMIN */

        $("#adminPanelButton")
            ?.addEventListener(
                "click",
                () => {

                    const allowed = [
                        "owner",
                        "admin"
                    ].includes(
                        currentProfile.role
                    );


                    if (!allowed) {

                        toast(
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


        $("#openAdminReportsBtn")
            ?.addEventListener(
                "click",
                async () => {

                    closeModal(
                        "adminModal"
                    );

                    openModal(
                        "ownerModal"
                    );

                    $$(".owner-tab")
                        .forEach(
                            item =>
                                item.classList.remove(
                                    "active"
                                )
                        );

                    const reportsTab =
                        document.querySelector(
                            '[data-owner-tab="reports"]'
                        );

                    reportsTab
                        ?.classList.add(
                            "active"
                        );


                    $$("[data-owner-panel]")
                        .forEach(
                            panel =>
                                panel.style.display =
                                    panel.dataset.ownerPanel ===
                                    "reports"
                                        ? "block"
                                        : "none"
                        );


                    await loadReports();
                }
            );


        $("#openAdminGroupsBtn")
            ?.addEventListener(
                "click",
                async () => {

                    closeModal(
                        "adminModal"
                    );

                    document.querySelector(
                        '[data-tab="groups"]'
                    )?.click();

                    await loadGroups();
                }
            );


        $("#openAdminChannelsBtn")
            ?.addEventListener(
                "click",
                async () => {

                    closeModal(
                        "adminModal"
                    );

                    document.querySelector(
                        '[data-tab="channels"]'
                    )?.click();

                    await loadChannels();
                }
            );


        $("#openAdminUsersBtn")
            ?.addEventListener(
                "click",
                () => {

                    closeModal(
                        "adminModal"
                    );

                    openModal(
                        "ownerModal"
                    );

                    document.querySelector(
                        '[data-owner-tab="moderation"]'
                    )?.click();
                }
            );


        /* GROUP */

        $("#createGroupBtn")
            ?.addEventListener(
                "click",
                () =>
                    openModal(
                        "createGroupModal"
                    )
            );


        $("#groupForm")
            ?.addEventListener(
                "submit",
                createGroup
            );


        $("#joinGroupModalBtn")
            ?.addEventListener(
                "click",
                () =>
                    openModal(
                        "joinGroupModal"
                    )
            );


        $("#joinGroupBtn")
            ?.addEventListener(
                "click",
                joinGroup
            );


        /* CHANNEL */

        $("#createChannelBtn")
            ?.addEventListener(
                "click",
                () =>
                    openModal(
                        "createChannelModal"
                    )
            );


        $("#channelForm")
            ?.addEventListener(
                "submit",
                createChannel
            );


        $("#joinChannelModalBtn")
            ?.addEventListener(
                "click",
                () =>
                    openModal(
                        "joinChannelModal"
                    )
            );


        $("#joinChannelBtn")
            ?.addEventListener(
                "click",
                joinChannel
            );


        /* GROUP INFO */

        $("#chatAvatarButton")
            ?.addEventListener(
                "click",
                () => {

                    if (
                        currentChatType ===
                        "direct" &&
                        selectedUser
                    ) {

                        openUserProfile(
                            selectedUser
                        );

                    } else if (
                        currentChatType ===
                        "group"
                    ) {

                        openGroupInfo();

                    } else if (
                        currentChatType ===
                        "channel"
                    ) {

                        openChannelInfo();
                    }
                }
            );


        $("#chatMoreBtn")
            ?.addEventListener(
                "click",
                () => {

                    if (
                        currentChatType ===
                        "group"
                    ) {

                        openGroupInfo();

                    } else if (
                        currentChatType ===
                        "channel"
                    ) {

                        openChannelInfo();

                    } else if (
                        currentChatType ===
                        "direct" &&
                        selectedUser
                    ) {

                        openUserProfile(
                            selectedUser
                        );
                    }
                }
            );


        $("#groupInviteBtn")
            ?.addEventListener(
                "click",
                createGroupInvite
            );


        $("#groupMembersBtn")
            ?.addEventListener(
                "click",
                () =>
                    showMembers(
                        "group"
                    )
            );


        $("#leaveGroupBtn")
            ?.addEventListener(
                "click",
                leaveGroup
            );


        $("#channelInviteBtn")
            ?.addEventListener(
                "click",
                createChannelInvite
            );


        $("#channelMembersBtn")
            ?.addEventListener(
                "click",
                () =>
                    showMembers(
                        "channel"
                    )
            );


        $("#leaveChannelBtn")
            ?.addEventListener(
                "click",
                leaveChannel
            );


        /* CONTACT */

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


        /* MESSAGE */

        $("#messageForm")
            ?.addEventListener(
                "submit",
                sendMessage
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
                            .requestSubmit();
                    }
                }
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

                    await sendImage(
                        event.target.files?.[0]
                    );

                    event.target.value =
                        "";
                }
            );


        /* PROFILE MENU */

        $("#userProfileMenuBtn")
            ?.addEventListener(
                "click",
                event => {

                    event.stopPropagation();

                    $("#userProfileMenu")
                        ?.classList.toggle(
                            "show"
                        );
                }
            );


        $("#editNicknameBtn")
            ?.addEventListener(
                "click",
                async () => {

                    $("#userProfileMenu")
                        ?.classList.remove(
                            "show"
                        );

                    const nickname =
                        await loadNickname(
                            selectedUser.id
                        );

                    $("#nicknameInput")
                        .value =
                            nickname || "";

                    closeModal(
                        "userProfileModal"
                    );

                    openModal(
                        "nicknameModal"
                    );
                }
            );


        $("#removeNicknameBtn")
            ?.addEventListener(
                "click",
                async () => {

                    $("#userProfileMenu")
                        ?.classList.remove(
                            "show"
                        );

                    await removeNickname();
                }
            );


        $("#removeNicknameBtn2")
            ?.addEventListener(
                "click",
                removeNickname
            );


        $("#saveNicknameBtn")
            ?.addEventListener(
                "click",
                saveNickname
            );


        $("#blockUserBtn")
            ?.addEventListener(
                "click",
                async () => {

                    $("#userProfileMenu")
                        ?.classList.remove(
                            "show"
                        );

                    await blockUser();
                }
            );


        $("#reportUserBtn")
            ?.addEventListener(
                "click",
                async () => {

                    $("#userProfileMenu")
                        ?.classList.remove(
                            "show"
                        );

                    await reportUser();
                }
            );


        document.addEventListener(
            "click",
            event => {

                if (
                    !event.target.closest(
                        ".profile-popup-menu"
                    ) &&
                    !event.target.closest(
                        "#userProfileMenuBtn"
                    )
                ) {

                    $("#userProfileMenu")
                        ?.classList.remove(
                            "show"
                        );
                }


                if (
                    !event.target.closest(
                        "#emojiPanel"
                    ) &&
                    !event.target.closest(
                        "#emojiBtn"
                    )
                ) {

                    $("#emojiPanel")
                        ?.classList.remove(
                            "show"
                        );
                }


                if (
                    !event.target.closest(
                        "#stickerPanel"
                    ) &&
                    !event.target.closest(
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


        /* DELETE ACCOUNT */

        $("#deleteAccountBtn")
            ?.addEventListener(
                "click",
                () => {

                    closeModal(
                        "settingsModal"
                    );

                    openModal(
                        "deleteAccountModal"
                    );
                }
            );


        /* LOGOUT */

        $("#logoutBtn")
            ?.addEventListener(
                "click",
                logout
            );
    }


    /* =====================================================
       REFRESH
       ===================================================== */

    async function refreshChat() {

        if (
            currentChatType ===
            "direct"
        ) {

            await loadMessages();

            return;
        }


        if (
            currentChatType ===
            "group" &&
            selectedGroup
        ) {

            await loadGroupMessages(
                selectedGroup.id
            );

            return;
        }


        if (
            currentChatType ===
            "channel" &&
            selectedChannel
        ) {

            await loadChannelMessages(
                selectedChannel.id
            );

            return;
        }


        if (
            currentChatType ===
            "saved"
        ) {

            await loadSavedMessages();
        }
    }


    /* =====================================================
       MOBILE
       ===================================================== */

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

                currentChatType =
                    null;


                $("#activeChat").style.display =
                    "none";

                $("#chatEmpty").style.display =
                    "flex";


                disableInput();
            }
        );


    /* =====================================================
       REALTIME
       ===================================================== */

    function setupRealtime() {

        realtimeChannel =
            db.channel(
                `megchatbox-${currentUser.id}`
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
                    ) return;

                    const message =
                        payload.new ||
                        payload.old;

                    if (!message) return;


                    const belongs =
                        (
                            message.sender_id ===
                            currentUser.id &&
                            message.receiver_id ===
                            selectedUser?.id
                        ) ||
                        (
                            message.sender_id ===
                            selectedUser?.id &&
                            message.receiver_id ===
                            currentUser.id
                        );


                    if (!belongs) return;


                    await loadMessages();
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

                        await updateInputState();
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
                        String(
                            payload.new?.group_id
                        ) ===
                        String(
                            selectedGroup.id
                        )
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
                        String(
                            payload.new?.channel_id
                        ) ===
                        String(
                            selectedChannel.id
                        )
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

                        avatar(
                            $("#chatAvatar"),
                            selectedUser
                        );

                        $("#chatName")
                            .textContent =
                                selectedUser.full_name ||
                                selectedUser.username;

                        $("#chatStatus")
                            .textContent =
                                getStatus(
                                    selectedUser
                                );

                        $("#chatVerified")
                            .style.display =
                                selectedUser.is_verified
                                    ? "inline-flex"
                                    : "none";
                    }
                }
            )
            .subscribe(
                status =>
                    console.log(
                        "Realtime:",
                        status
                    )
            );
    }


    /* =====================================================
       LOGOUT
       ===================================================== */

    async function logout() {

        clearInterval(
            lastSeenTimer
        );


        await updateLastSeen();


        if (realtimeChannel) {

            await db.removeChannel(
                realtimeChannel
            );

            realtimeChannel =
                null;
        }


        await db.auth.signOut();


        localStorage.removeItem(
            "messageAppLoggedIn"
        );

        localStorage.removeItem(
            "messageAppUser"
        );


        location.href =
            "index.html";
    }


    /* =====================================================
       INIT
       ===================================================== */

    async function init() {

        disableInput();

        applyTheme();
        applyDensity();

        setupLanguage();

        setupAppearance();

        setupTabs();

        setupSearch();

        setupEmoji();

        setupStickers();

        setupEvents();


        const session =
            await loadSession();

        if (!session) return;


        const profile =
            await loadProfile();

        if (!profile) return;


        startLastSeen();

        setupRealtime();


        await loadContacts();


        console.log(
            "MegChatBox V2.1 ready 🚀"
        );
    }


    try {

        await init();

    } catch (error) {

        console.error(
            "MegChatBox error:",
            error
        );

        toast(
            "MegChatBox could not load correctly.",
            "error"
        );
    }

/* =========================================
   MESSAGE SWIPE ACTIONS + PROFILE AVATAR FIX
========================================= */

function setupMessageSwipe(wrapper) {
    if (!wrapper) return;

    let startX = 0;
    let startY = 0;
    let currentX = 0;
    let swiping = false;
    let longPressTimer = null;

    const bubble = wrapper.querySelector(".message-bubble");

    if (!bubble) return;

    function closeOtherMessages() {
        document
            .querySelectorAll(".message-wrapper.swiped")
            .forEach(item => {
                if (item !== wrapper) {
                    item.classList.remove("swiped");
                    const itemBubble = item.querySelector(".message-bubble");

                    if (itemBubble) {
                        itemBubble.style.transform = "";
                    }
                }
            });
    }

    wrapper.addEventListener("pointerdown", (e) => {
        startX = e.clientX;
        startY = e.clientY;
        currentX = startX;
        swiping = false;

        clearTimeout(longPressTimer);

        longPressTimer = setTimeout(() => {
            closeOtherMessages();
            wrapper.classList.add("swiped");
        }, 450);
    });

    wrapper.addEventListener("pointermove", (e) => {
        currentX = e.clientX;

        const deltaX = currentX - startX;
        const deltaY = Math.abs(e.clientY - startY);

        if (deltaY > 30) {
            clearTimeout(longPressTimer);
            return;
        }

        // Faqat chapga swipe
        if (deltaX < -10) {
            swiping = true;
            clearTimeout(longPressTimer);

            closeOtherMessages();

            const distance = Math.min(Math.abs(deltaX), 150);

            bubble.style.transform = `translateX(-${distance}px)`;
        }
    });

    wrapper.addEventListener("pointerup", () => {
        clearTimeout(longPressTimer);

        if (swiping) {
            const deltaX = currentX - startX;

            if (deltaX < -60) {
                wrapper.classList.add("swiped");
                bubble.style.transform = "translateX(-145px)";
            } else {
                wrapper.classList.remove("swiped");
                bubble.style.transform = "";
            }
        }

        swiping = false;
    });

    wrapper.addEventListener("pointercancel", () => {
        clearTimeout(longPressTimer);
        swiping = false;

        wrapper.classList.remove("swiped");
        bubble.style.transform = "";
    });

    // Action tugmalari xabarni yopib yubormasin
    wrapper.querySelectorAll(".message-action").forEach(button => {
        button.addEventListener("pointerdown", e => {
            e.stopPropagation();
        });

        button.addEventListener("click", e => {
            e.stopPropagation();
        });
    });
}


/* =========================================
   MESSAGE ACTIONS INITIALIZER
========================================= */

function initializeMessageSwipes() {
    document
        .querySelectorAll(".message-wrapper")
        .forEach(wrapper => {
            if (wrapper.dataset.swipeReady === "true") return;

            wrapper.dataset.swipeReady = "true";
            setupMessageSwipe(wrapper);
        });
}


/* =========================================
   CLOSE SWIPED MESSAGE
========================================= */

document.addEventListener("click", (e) => {
    if (
        !e.target.closest(".message-wrapper") &&
        !e.target.closest(".message-action")
    ) {
        document
            .querySelectorAll(".message-wrapper.swiped")
            .forEach(wrapper => {
                wrapper.classList.remove("swiped");

                const bubble = wrapper.querySelector(".message-bubble");

                if (bubble) {
                    bubble.style.transform = "";
                }
            });
    }
});


/* =========================================
   PROFILE AVATAR FIX
========================================= */

function fixProfileAvatar(container) {
    if (!container) return;

    container.style.width = "110px";
    container.style.height = "110px";
    container.style.minWidth = "110px";
    container.style.minHeight = "110px";
    container.style.maxWidth = "110px";
    container.style.maxHeight = "110px";
    container.style.aspectRatio = "1 / 1";
    container.style.borderRadius = "50%";
    container.style.overflow = "hidden";

    const image = container.querySelector("img");

    if (image) {
        image.style.width = "100%";
        image.style.height = "100%";
        image.style.minWidth = "100%";
        image.style.minHeight = "100%";
        image.style.objectFit = "cover";
        image.style.objectPosition = "center";
        image.style.display = "block";
    }
}


/* =========================================
   FIX PROFILE POPUP AVATAR
========================================= */

function fixAllProfileAvatars() {
    const selectors = [
        ".profile-popup-avatar-wrap",
        ".user-profile-avatar",
        "#userProfileAvatar",
        "#profilePopupAvatar"
    ];

    selectors.forEach(selector => {
        document
            .querySelectorAll(selector)
            .forEach(container => {
                fixProfileAvatar(container);
            });
    });
}


/* =========================================
   AUTO FIX AFTER DOM CHANGES
========================================= */

const profileAvatarObserver = new MutationObserver(() => {
    fixAllProfileAvatars();
    initializeMessageSwipes();
});

profileAvatarObserver.observe(document.body, {
    childList: true,
    subtree: true
});


/* =========================================
   INITIAL START
========================================= */

setTimeout(() => {
    fixAllProfileAvatars();
    initializeMessageSwipes();
}, 300);
})();
