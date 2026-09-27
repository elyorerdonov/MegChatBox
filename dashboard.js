(async function () {
    "use strict";

    /* =========================================================
       SUPABASE
    ========================================================= */

    const db = supabaseClient;


    /* =========================================================
       STATE
    ========================================================= */

    let currentUser = null;
    let currentProfile = null;

    let selectedUser = null;
    let selectedContactRequest = null;

    let selectedGroup = null;
    let selectedChannel = null;

    let currentTab = "chats";
    let currentLanguage =
        localStorage.getItem("MegChatBoxLanguage") || "en";

    let currentTheme =
        localStorage.getItem("MegChatBoxTheme") || "dark";

    let realtimeChannel = null;

    let lastSeenInterval = null;
    let toastTimer = null;

    let searchTimer = null;


    /* =========================================================
       DOM
    ========================================================= */

    const $ = selector => document.querySelector(selector);

    const $$ = selector => [
        ...document.querySelectorAll(selector)
    ];


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
        const text = String(name || "?").trim();
        return text ? text.charAt(0).toUpperCase() : "?";
    }


    function normalizeUsername(username) {
        return String(username || "")
            .trim()
            .replace(/^@/, "")
            .toLowerCase();
    }


    function formatTime(value) {
        if (!value) return "";

        const date = new Date(value);

        if (Number.isNaN(date.getTime())) return "";

        return date.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit"
        });
    }


    function dateKey(value) {
        const date = new Date(value);

        return [
            date.getFullYear(),
            date.getMonth(),
            date.getDate()
        ].join("-");
    }


    function isToday(value) {
        return dateKey(value) === dateKey(new Date());
    }


    function isYesterday(value) {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);

        return dateKey(value) === dateKey(yesterday);
    }


    function formatOldDate(value) {
        const date = new Date(value);

        return date.toLocaleDateString([], {
            day: "2-digit",
            month: "2-digit",
            year: "numeric"
        });
    }


    function dayLabel(value) {
        if (isToday(value)) {
            return currentLanguage === "uz"
                ? "BUGUN"
                : currentLanguage === "ru"
                    ? "СЕГОДНЯ"
                    : "TODAY";
        }

        if (isYesterday(value)) {
            return currentLanguage === "uz"
                ? "KECHA"
                : currentLanguage === "ru"
                    ? "ВЧЕРА"
                    : "YESTERDAY";
        }

        return formatOldDate(value);
    }


    function isRecentlyOnline(value) {
        if (!value) return false;

        const time = new Date(value).getTime();

        if (!Number.isFinite(time)) return false;

        return Date.now() - time <= 120000;
    }


    function isBlocked(profile) {
        if (!profile) return false;

        if (profile.account_blocked === true) {
            if (
                !profile.account_blocked_until ||
                new Date(profile.account_blocked_until) > new Date()
            ) {
                return true;
            }
        }

        if (profile.messaging_blocked === true) {
            if (
                !profile.messaging_blocked_until ||
                new Date(profile.messaging_blocked_until) > new Date()
            ) {
                return true;
            }
        }

        return false;
    }


    /* =========================================================
       TOAST
    ========================================================= */

    function showToast(message, type = "info") {
        const toast = $("#toast");
        const toastMessage = $("#toastMessage");

        if (!toast || !toastMessage) return;

        toastMessage.textContent = message;

        const icon = toast.querySelector("i");

        if (icon) {
            icon.className =
                type === "success"
                    ? "fa-solid fa-circle-check"
                    : type === "error"
                        ? "fa-solid fa-circle-exclamation"
                        : "fa-solid fa-circle-info";
        }

        toast.classList.add("show");

        clearTimeout(toastTimer);

        toastTimer = setTimeout(() => {
            toast.classList.remove("show");
        }, 2800);
    }


    /* =========================================================
       MODALS
    ========================================================= */

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
        $$(".modal-overlay.show")
            .forEach(modal => {
                modal.classList.remove("show");
            });
    }


    /* =========================================================
       AVATAR
    ========================================================= */

    function setAvatar(element, profile) {
        if (!element) return;

        element.innerHTML = "";

        if (profile?.avatar_url) {
            const img = document.createElement("img");

            img.src = profile.avatar_url;
            img.alt =
                profile.full_name ||
                profile.username ||
                "Avatar";

            img.onerror = () => {
                element.innerHTML = "";
                element.textContent =
                    getInitial(
                        profile.full_name ||
                        profile.username
                    );
            };

            element.appendChild(img);
        } else {
            element.textContent =
                getInitial(
                    profile?.full_name ||
                    profile?.username
                );
        }
    }


    /* =========================================================
       AUTH
    ========================================================= */

    async function loadSession() {
        const {
            data,
            error
        } = await db.auth.getSession();

        if (error || !data.session) {
            window.location.href = "index.html";
            return false;
        }

        currentUser = data.session.user;

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
                "Could not load your profile.",
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
                "@" + currentProfile.username;
        }

        if ($("#myVerified")) {
            $("#myVerified").style.display =
                currentProfile.is_verified
                    ? "inline-flex"
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
                last_seen: new Date().toISOString()
            })
            .eq("id", currentUser.id);

        if (error) {
            console.warn(
                "Last seen:",
                error.message
            );
        }
    }


    function startLastSeenUpdater() {
        updateMyLastSeen();

        clearInterval(lastSeenInterval);

        lastSeenInterval =
            setInterval(
                updateMyLastSeen,
                30000
            );
    }


    /* =========================================================
       USER STATUS
    ========================================================= */

    function renderUserStatus(profile) {
        const status = $("#chatStatus");

        if (!status) return;

        status.textContent = "";

        if (!profile) return;

        const showOnline =
            profile.show_online !== false;

        const showLastSeen =
            profile.show_last_seen !== false;


        if (
            showOnline &&
            isRecentlyOnline(profile.last_seen)
        ) {
            status.textContent =
                currentLanguage === "uz"
                    ? "Online"
                    : currentLanguage === "ru"
                        ? "В сети"
                        : "Online";

            status.style.color = "#22c55e";
            return;
        }


        if (
            showLastSeen &&
            profile.last_seen
        ) {
            status.textContent =
                currentLanguage === "uz"
                    ? "Oxirgi ko‘rilgan: " +
                      formatTime(profile.last_seen)
                    : currentLanguage === "ru"
                        ? "Был(а): " +
                          formatTime(profile.last_seen)
                        : "Last seen: " +
                          formatTime(profile.last_seen);

            status.style.color = "";
            return;
        }


        if (showOnline) {
            status.textContent =
                currentLanguage === "uz"
                    ? "Offline"
                    : currentLanguage === "ru"
                        ? "Не в сети"
                        : "Offline";

            status.style.color = "";
        }
    }


    /* =========================================================
       LANGUAGE
    ========================================================= */

    const translations = {
        en: {
            contacts: "Contacts",
            groups: "Groups",
            channels: "Channels"
        },

        uz: {
            contacts: "Kontaktlar",
            groups: "Guruhlar",
            channels: "Kanallar"
        },

        ru: {
            contacts: "Контакты",
            groups: "Группы",
            channels: "Каналы"
        }
    };


    function applyLanguage() {
        const t =
            translations[currentLanguage] ||
            translations.en;

        $$(".sidebar-tab").forEach(tab => {
            const span =
                tab.querySelector("span");

            if (!span) return;

            if (tab.dataset.tab === "chats") {
                span.textContent = t.contacts;
            }

            if (tab.dataset.tab === "groups") {
                span.textContent = t.groups;
            }

            if (tab.dataset.tab === "channels") {
                span.textContent = t.channels;
            }
        });

        $$(".language-option")
            .forEach(option => {
                option.classList.toggle(
                    "selected",
                    option.dataset.language ===
                    currentLanguage
                );
            });

        if (selectedUser) {
            renderUserStatus(selectedUser);
        }
    }


    function setupLanguage() {
        $$(".language-option")
            .forEach(option => {
                option.addEventListener(
                    "click",
                    () => {
                        currentLanguage =
                            option.dataset.language;

                        localStorage.setItem(
                            "MegChatBoxLanguage",
                            currentLanguage
                        );

                        applyLanguage();

                        closeModal("languageModal");

                        showToast(
                            "Language updated.",
                            "success"
                        );
                    }
                );
            });
    }


    /* =========================================================
       THEME / APPEARANCE
    ========================================================= */

    function applyTheme() {
        document.documentElement
            .setAttribute(
                "data-theme",
                currentTheme
            );

        localStorage.setItem(
            "MegChatBoxTheme",
            currentTheme
        );

        $$(".theme-option")
            .forEach(option => {
                option.classList.toggle(
                    "selected",
                    option.dataset.theme ===
                    currentTheme
                );
            });
    }


    function setupAppearance() {
        applyTheme();

        $$(".theme-option")
            .forEach(option => {
                option.addEventListener(
                    "click",
                    () => {
                        currentTheme =
                            option.dataset.theme ||
                            "dark";

                        applyTheme();

                        showToast(
                            "Appearance updated.",
                            "success"
                        );
                    }
                );
            });
    }


    /* =========================================================
       TABS
    ========================================================= */

    function setupTabs() {
        $$(".sidebar-tab")
            .forEach(button => {
                button.addEventListener(
                    "click",
                    async () => {
                        currentTab =
                            button.dataset.tab;

                        $$(".sidebar-tab")
                            .forEach(item => {
                                item.classList.toggle(
                                    "active",
                                    item === button
                                );
                            });

                        $$(".tab-content")
                            .forEach(content => {
                                content.classList.remove(
                                    "active"
                                );
                            });

                        if (currentTab === "chats") {
                            $("#chatsTab")
                                ?.classList.add("active");

                            await loadContacts();
                        }

                        if (currentTab === "groups") {
                            $("#groupsTab")
                                ?.classList.add("active");

                            await loadGroups();
                        }

                        if (currentTab === "channels") {
                            $("#channelsTab")
                                ?.classList.add("active");

                            await loadChannels();
                        }

                        if ($("#searchInput")) {
                            $("#searchInput").value = "";
                        }

                        if ($("#searchClearBtn")) {
                            $("#searchClearBtn")
                                .style.display = "none";
                        }
                    }
                );
            });
    }


    /* =========================================================
       CONTACT IDS
    ========================================================= */

    async function getAcceptedContactIds() {
        if (!currentUser) return [];

        const {
            data,
            error
        } = await db
            .from("contact_requests")
            .select(
                "sender_id,receiver_id,status"
            )
            .eq("status", "accepted")
            .or(
                `sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`
            );

        if (error) {
            console.error(error);
            return [];
        }

        const ids = [];

        for (const request of data || []) {
            const other =
                request.sender_id === currentUser.id
                    ? request.receiver_id
                    : request.sender_id;

            if (
                other &&
                !ids.includes(other)
            ) {
                ids.push(other);
            }
        }

        return ids;
    }


    /* =========================================================
       CONTACTS
    ========================================================= */

    async function loadContacts() {
        const list = $("#userList");

        if (!list) return;

        list.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-spinner fa-spin"></i>
                <span>Loading contacts...</span>
            </div>
        `;

        const ids =
            await getAcceptedContactIds();

        if (!ids.length) {
            renderEmptyContacts();
            return;
        }

        const {
            data,
            error
        } = await db
            .from("profiles")
            .select("*")
            .in("id", ids)
            .order("full_name", {
                ascending: true
            });

        if (error) {
            console.error(error);

            list.innerHTML = `
                <div class="empty-state">
                    <i class="fa-solid fa-triangle-exclamation"></i>
                    <strong>Could not load contacts</strong>
                </div>
            `;

            return;
        }

        if ($("#contactCount")) {
            $("#contactCount").textContent =
                data?.length || "";
        }

        renderUserResults(
            data || [],
            {
                showUsername: false,
                emptyMessage: "No contacts yet"
            }
        );
    }


    function renderEmptyContacts() {
        const list = $("#userList");

        if (!list) return;

        if ($("#contactCount")) {
            $("#contactCount").textContent = "";
        }

        list.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-user-group"></i>
                <strong>No contacts yet</strong>
                <span>
                    Search for a username to add someone.
                </span>
            </div>
        `;
    }


    /* =========================================================
       SEARCH
    ========================================================= */

    function setupSearch() {
        const input = $("#searchInput");

        if (!input) return;

        input.addEventListener(
            "input",
            () => {
                const value =
                    normalizeUsername(
                        input.value
                    );

                if ($("#searchClearBtn")) {
                    $("#searchClearBtn")
                        .style.display =
                        value
                            ? "block"
                            : "none";
                }

                clearTimeout(searchTimer);

                searchTimer =
                    setTimeout(
                        async () => {
                            if (!value) {
                                if (currentTab === "chats")
                                    await loadContacts();

                                if (currentTab === "groups")
                                    await loadGroups();

                                if (currentTab === "channels")
                                    await loadChannels();

                                return;
                            }

                            if (currentTab === "chats")
                                await searchUsers(value);

                            if (currentTab === "groups")
                                await searchGroups(value);

                            if (currentTab === "channels")
                                await searchChannels(value);
                        },
                        250
                    );
            }
        );

        $("#searchClearBtn")
            ?.addEventListener(
                "click",
                async () => {
                    input.value = "";

                    $("#searchClearBtn")
                        .style.display = "none";

                    if (currentTab === "chats")
                        await loadContacts();

                    if (currentTab === "groups")
                        await loadGroups();

                    if (currentTab === "channels")
                        await loadChannels();

                    input.focus();
                }
            );
    }


    /* =========================================================
       USER SEARCH
    ========================================================= */

    async function searchUsers(username) {
        const list = $("#userList");

        if (!list) return;

        list.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-spinner fa-spin"></i>
                <span>Searching...</span>
            </div>
        `;

        const {
            data,
            error
        } = await db
            .from("profiles")
            .select("*")
            .eq("username", username)
            .neq("id", currentUser.id)
            .limit(20);

        if (error) {
            console.error(error);
            return;
        }

        if (!data?.length) {
            list.innerHTML = `
                <div class="empty-state">
                    <i class="fa-solid fa-user-slash"></i>
                    <strong>User not found</strong>
                    <span>
                        Try another username.
                    </span>
                </div>
            `;

            return;
        }

        const label =
            document.createElement("div");

        label.className =
            "search-result-label";

        label.textContent =
            "Search results";

        list.innerHTML = "";
        list.appendChild(label);

        data.forEach(user => {
            list.appendChild(
                createUserItem(
                    user,
                    {
                        showUsername: true,
                        searchResult: true
                    }
                )
            );
        });
    }


    function renderUserResults(
        users,
        options = {}
    ) {
        const list = $("#userList");

        if (!list) return;

        list.innerHTML = "";

        if (!users.length) {
            list.innerHTML = `
                <div class="empty-state">
                    <i class="fa-solid fa-user-group"></i>
                    <strong>
                        ${escapeHTML(
                            options.emptyMessage ||
                            "No users found"
                        )}
                    </strong>
                </div>
            `;

            return;
        }

        users.forEach(user => {
            list.appendChild(
                createUserItem(
                    user,
                    options
                )
            );
        });
    }


    function createUserItem(
        user,
        options = {}
    ) {
        const button =
            document.createElement("button");

        button.className = "chat-item";

        if (
            selectedUser?.id === user.id
        ) {
            button.classList.add("active");
        }

        const subtitle =
            options.showUsername
                ? "@" + user.username
                : "";

        button.innerHTML = `
            <div class="avatar avatar-medium">
                ${
                    user.avatar_url
                        ? `<img
                            src="${escapeHTML(user.avatar_url)}"
                            alt="${escapeHTML(
                                user.full_name ||
                                user.username
                            )}"
                           >`
                        : escapeHTML(
                            getInitial(
                                user.full_name ||
                                user.username
                            )
                        )
                }
            </div>

            <div class="chat-info">
                <div class="chat-info-top">
                    <span class="chat-info-name">
                        ${escapeHTML(
                            user.full_name ||
                            user.username
                        )}
                    </span>

                    ${
                        user.is_verified
                            ? `<span class="verified-badge">✓</span>`
                            : ""
                    }
                </div>

                ${
                    subtitle
                        ? `<span class="chat-info-subtitle">
                            ${escapeHTML(subtitle)}
                           </span>`
                        : ""
                }
            </div>
        `;

        button.addEventListener(
            "click",
            () => openUserChat(user)
        );

        return button;
    }


    /* =========================================================
       OPEN USER CHAT
    ========================================================= */

    async function openUserChat(user) {
        if (
            !user ||
            user.id === currentUser.id
        ) {
            return;
        }

        selectedUser = user;
        selectedContactRequest = null;

        selectedGroup = null;
        selectedChannel = null;

        $("#chatEmpty").style.display = "none";
        $("#activeChat").style.display = "flex";

        $("#app")?.classList.add("chat-open");

        setAvatar(
            $("#chatAvatar"),
            user
        );

        $("#chatName").textContent =
            user.full_name ||
            user.username;

        if ($("#chatVerified")) {
            $("#chatVerified").style.display =
                user.is_verified
                    ? "inline-flex"
                    : "none";
        }

        renderUserStatus(user);

        await updateContactActions();
        await loadMessages();

        updateMessageInputState();

        await markMessagesDelivered();
        await markChatSeen();

        scrollMessagesToBottom();
    }


    /* =========================================================
       CONTACT REQUEST
    ========================================================= */

    async function getContactRequestWithUser(
        userId
    ) {
        if (!currentUser || !userId) {
            return null;
        }

        const {
            data,
            error
        } = await db
            .from("contact_requests")
            .select("*")
            .or(
                `and(sender_id.eq.${currentUser.id},receiver_id.eq.${userId}),and(sender_id.eq.${userId},receiver_id.eq.${currentUser.id})`
            )
            .order("created_at", {
                ascending: false
            })
            .limit(1)
            .maybeSingle();

        if (error) {
            console.error(error);
            return null;
        }

        return data || null;
    }


    async function updateContactActions() {
        const actions =
            $("#contactActions");

        if (!actions || !selectedUser) {
            return;
        }

        actions.style.display = "none";

        if ($("#addContactBtn")) {
            $("#addContactBtn").style.display =
                "none";
            $("#addContactBtn").disabled = false;
            $("#addContactBtn").innerHTML =
                `<i class="fa-solid fa-user-plus"></i>
                 Add Contact`;
        }

        if ($("#acceptContactBtn"))
            $("#acceptContactBtn")
                .style.display = "none";

        if ($("#declineContactBtn"))
            $("#declineContactBtn")
                .style.display = "none";

        selectedContactRequest =
            await getContactRequestWithUser(
                selectedUser.id
            );

        if (
            selectedContactRequest?.status ===
            "accepted"
        ) {
            return;
        }

        if (!selectedContactRequest) {
            actions.style.display = "flex";

            $("#addContactBtn")
                ?.style.setProperty(
                    "display",
                    "inline-flex"
                );

            return;
        }

        if (
            selectedContactRequest.status ===
            "pending"
        ) {
            actions.style.display = "flex";

            if (
                selectedContactRequest.receiver_id ===
                currentUser.id
            ) {
                $("#acceptContactBtn")
                    ?.style.setProperty(
                        "display",
                        "inline-flex"
                    );

                $("#declineContactBtn")
                    ?.style.setProperty(
                        "display",
                        "inline-flex"
                    );
            } else {
                const btn =
                    $("#addContactBtn");

                if (btn) {
                    btn.style.display =
                        "inline-flex";

                    btn.disabled = true;

                    btn.innerHTML =
                        `<i class="fa-solid fa-clock"></i>
                         Request sent`;
                }
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
                sender_id: currentUser.id,
                receiver_id: selectedUser.id,
                status: "pending"
            });

        if (error) {
            console.error(error);

            showToast(
                error.code === "23505"
                    ? "Contact request already exists."
                    : error.message ||
                      "Could not send request.",
                error.code === "23505"
                    ? "info"
                    : "error"
            );

            await updateContactActions();
            return;
        }

        showToast(
            "Contact request sent.",
            "success"
        );

        await updateContactActions();
    }


    async function acceptContact() {
        if (!selectedContactRequest) return;

        const {
            error
        } = await db
            .from("contact_requests")
            .update({
                status: "accepted"
            })
            .eq(
                "id",
                selectedContactRequest.id
            );

        if (error) {
            console.error(error);

            showToast(
                "Could not accept request.",
                "error"
            );

            return;
        }

        showToast(
            "Contact added.",
            "success"
        );

        await updateContactActions();
        await loadContacts();
        await loadMessages();

        updateMessageInputState();
    }


    async function declineContact() {
        if (!selectedContactRequest) return;

        const {
            error
        } = await db
            .from("contact_requests")
            .update({
                status: "declined"
            })
            .eq(
                "id",
                selectedContactRequest.id
            );

        if (error) {
            console.error(error);

            showToast(
                "Could not decline request.",
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


    async function isAcceptedContact(userId) {
        const request =
            await getContactRequestWithUser(
                userId
            );

        return request?.status === "accepted";
    }


    /* =========================================================
       MESSAGE STATE
    ========================================================= */

    async function updateMessageInputState() {
        const input = $("#messageInput");

        if (!input) return;

        const controls = [
            $("#sendButton"),
            $("#imageBtn"),
            $("#emojiBtn"),
            $("#stickerBtn")
        ].filter(Boolean);

        if (!selectedUser) {
            input.disabled = true;

            controls.forEach(
                button => button.disabled = true
            );

            input.placeholder =
                "Select a contact...";

            return;
        }

        const accepted =
            await isAcceptedContact(
                selectedUser.id
            );

        if (!accepted) {
            input.disabled = true;

            controls.forEach(
                button => button.disabled = true
            );

            input.placeholder =
                "Accept contact request to chat.";

            return;
        }

        const blocked =
            currentProfile?.messaging_blocked === true;

        if (blocked) {
            input.disabled = true;

            controls.forEach(
                button => button.disabled = true
            );

            input.placeholder =
                "Messaging is unavailable.";

            return;
        }

        input.disabled = false;

        controls.forEach(
            button => button.disabled = false
        );

        input.placeholder =
            "Write a message...";
    }


    /* =========================================================
       DIRECT MESSAGES
    ========================================================= */

    async function loadMessages() {
        const container = $("#messages");

        if (!container || !selectedUser) {
            return;
        }

        container.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-spinner fa-spin"></i>
                <span>Loading messages...</span>
            </div>
        `;

        const {
            data,
            error
        } = await db
            .from("messages")
            .select("*")
            .or(
                `and(sender_id.eq.${currentUser.id},receiver_id.eq.${selectedUser.id}),and(sender_id.eq.${selectedUser.id},receiver_id.eq.${currentUser.id})`
            )
            .order("created_at", {
                ascending: true
            });

        if (error) {
            console.error(error);

            container.innerHTML = `
                <div class="empty-state">
                    <i class="fa-solid fa-triangle-exclamation"></i>
                    <strong>Could not load messages</strong>
                </div>
            `;

            return;
        }

        renderMessages(data || []);
    }


    function renderMessages(messages) {
        const container = $("#messages");

        if (!container) return;

        container.innerHTML = "";

        if (!messages.length) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fa-regular fa-comments"></i>
                    <strong>No messages yet</strong>
                    <span>
                        Start the conversation.
                    </span>
                </div>
            `;

            return;
        }

        let previousDay = null;

        messages.forEach(message => {
            const currentDay =
                dateKey(message.created_at);

            if (currentDay !== previousDay) {
                const divider =
                    document.createElement("div");

                divider.className =
                    "day-divider";

                divider.innerHTML = `
                    <span>
                        ${escapeHTML(
                            dayLabel(
                                message.created_at
                            )
                        )}
                    </span>
                `;

                container.appendChild(divider);

                previousDay = currentDay;
            }

            container.appendChild(
                createMessageElement(message)
            );
        });

        scrollMessagesToBottom();
    }


    function createMessageElement(message) {
        const outgoing =
            message.sender_id === currentUser.id;

        const element =
            document.createElement("div");

        element.className =
            "message " +
            (
                outgoing
                    ? "outgoing"
                    : "incoming"
            );

        if (message.deleted_at) {
            element.classList.add("deleted");
        }

        let content = "";

        if (message.deleted_at) {
            content = `
                <div class="message-content">
                    This message was deleted.
                </div>
            `;
        }

        else if (
            message.message_type === "image" &&
            message.image_url
        ) {
            content = `
                <img
                    class="message-image"
                    src="${escapeHTML(
                        message.image_url
                    )}"
                    alt="Image"
                    loading="lazy"
                >
            `;
        }

        else if (
            message.message_type === "sticker" &&
            message.sticker_url
        ) {
            content = `
                <img
                    class="message-image"
                    src="${escapeHTML(
                        message.sticker_url
                    )}"
                    alt="Sticker"
                    loading="lazy"
                >
            `;
        }

        else {
            content = `
                <div class="message-content">
                    ${escapeHTML(message.content)}
                </div>
            `;
        }

        const edited =
            message.edited_at &&
            !message.deleted_at
                ? `<span class="message-edited">
                       edited
                   </span>`
                : "";

        let status = "";

        if (outgoing) {
            if (message.seen_at) {
                status = `
                    <span
                        class="message-status seen"
                        title="Seen"
                    >
                        ✓✓
                    </span>
                `;
            }

            else if (message.delivered_at) {
                status = `
                    <span
                        class="message-status"
                        title="Delivered"
                    >
                        ✓✓
                    </span>
                `;
            }

            else {
                status = `
                    <span
                        class="message-status"
                        title="Sent"
                    >
                        ✓
                    </span>
                `;
            }
        }

        element.innerHTML = `
            ${content}

            <div class="message-meta">
                ${edited}

                <span>
                    ${escapeHTML(
                        formatTime(
                            message.created_at
                        )
                    )}
                </span>

                ${status}
            </div>
        `;

        if (
            outgoing &&
            !message.deleted_at
        ) {
            element.addEventListener(
                "contextmenu",
                event => {
                    event.preventDefault();

                    showMessageMenu(
                        event,
                        message
                    );
                }
            );

            element.addEventListener(
                "dblclick",
                () => {
                    showMessageMenu(
                        null,
                        message
                    );
                }
            );
        }

        return element;
    }


    /* =========================================================
       MESSAGE MENU
    ========================================================= */

    async function showMessageMenu(
        event,
        message
    ) {
        const choice =
            window.prompt(
                "Message action:\n\n" +
                "1 = Edit\n" +
                "2 = Delete\n\n" +
                "Cancel = close"
            );

        if (choice === "1") {
            if (
                message.message_type !== "text"
            ) {
                showToast(
                    "Only text messages can be edited.",
                    "info"
                );

                return;
            }

            const newText =
                window.prompt(
                    "Edit message:",
                    message.content
                );

            if (
                newText === null ||
                !newText.trim()
            ) {
                return;
            }

            await editMessage(
                message.id,
                newText.trim()
            );
        }

        if (choice === "2") {
            if (
                window.confirm(
                    "Delete this message?"
                )
            ) {
                await deleteMessage(
                    message.id
                );
            }
        }
    }


    async function editMessage(
        messageId,
        newContent
    ) {
        const {
            error
        } = await db.rpc(
            "edit_message",
            {
                p_message_id: messageId,
                p_new_content: newContent
            }
        );

        if (error) {
            console.error(error);

            showToast(
                error.message ||
                "Could not edit message.",
                "error"
            );

            return;
        }

        showToast(
            "Message edited.",
            "success"
        );

        await loadMessages();
    }


    async function deleteMessage(messageId) {
        const {
            error
        } = await db.rpc(
            "delete_message",
            {
                p_message_id: messageId
            }
        );

        if (error) {
            console.error(error);

            showToast(
                error.message ||
                "Could not delete message.",
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
       SEND TEXT
    ========================================================= */

    async function sendMessage(event) {
        event.preventDefault();

        if (!selectedUser) return;

        const input =
            $("#messageInput");

        const content =
            input.value.trim();

        if (!content) return;

        const accepted =
            await isAcceptedContact(
                selectedUser.id
            );

        if (!accepted) {
            showToast(
                "You need to be contacts first.",
                "info"
            );

            return;
        }

        const {
            error
        } = await db
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
                error.message ||
                "Message could not be sent.",
                "error"
            );

            return;
        }

        input.value = "";

        await loadMessages();

        scrollMessagesToBottom();
    }


    /* =========================================================
       IMAGE
    ========================================================= */

    async function sendImage(file) {
        if (!file || !selectedUser) return;

        const accepted =
            await isAcceptedContact(
                selectedUser.id
            );

        if (!accepted) {
            showToast(
                "You need to be contacts first.",
                "info"
            );

            return;
        }

        if (!file.type.startsWith("image/")) {
            showToast(
                "Please select an image.",
                "error"
            );

            return;
        }

        if (file.size > 8 * 1024 * 1024) {
            showToast(
                "Image must be smaller than 8 MB.",
                "error"
            );

            return;
        }

        const extension =
            file.name
                .split(".")
                .pop()
                ?.toLowerCase() ||
            "jpg";

        const path =
            `${currentUser.id}/${crypto.randomUUID()}.${extension}`;

        showToast(
            "Uploading image...",
            "info"
        );

        const {
            error: uploadError
        } = await db
            .storage
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
                uploadError.message ||
                "Image upload failed.",
                "error"
            );

            return;
        }

        /*
         * IMPORTANT:
         * chat-media is private.
         * Store the path. A signed URL can be
         * generated later when rendering.
         */

        const {
            error
        } = await db
            .from("messages")
            .insert({
                sender_id: currentUser.id,
                receiver_id: selectedUser.id,
                content: "Image",
                message_type: "image",
                image_url: path
            });

        if (error) {
            console.error(error);

            await db
                .storage
                .from("chat-media")
                .remove([path]);

            showToast(
                error.message ||
                "Could not send image.",
                "error"
            );

            return;
        }

        showToast(
            "Image sent.",
            "success"
        );

        await loadMessages();
    }


    /* =========================================================
       IMAGE URL
    ========================================================= */

    async function getChatImageUrl(path) {
        if (!path) return "";

        if (
            path.startsWith("http://") ||
            path.startsWith("https://")
        ) {
            return path;
        }

        const {
            data,
            error
        } = await db
            .storage
            .from("chat-media")
            .createSignedUrl(
                path,
                3600
            );

        if (error) {
            console.warn(
                "Signed image URL:",
                error.message
            );

            return "";
        }

        return data?.signedUrl || "";
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
            console.warn(
                "Delivered:",
                error.message
            );
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
            console.warn(
                "Seen:",
                error.message
            );
        }
    }


    /* =========================================================
       SCROLL
    ========================================================= */

    function scrollMessagesToBottom() {
        const messages = $("#messages");

        if (!messages) return;

        requestAnimationFrame(() => {
            messages.scrollTop =
                messages.scrollHeight;
        });
    }


    /* =========================================================
       GROUPS
    ========================================================= */

    async function loadGroups() {
        const list = $("#groupsList");

        if (!list) return;

        list.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-spinner fa-spin"></i>
                <span>Loading groups...</span>
            </div>
        `;

        const {
            data,
            error
        } = await db
            .from("groups")
            .select("*")
            .order("created_at", {
                ascending: false
            });

        if (error) {
            console.error(error);

            list.innerHTML = `
                <div class="empty-state">
                    <i class="fa-solid fa-triangle-exclamation"></i>
                    <strong>Could not load groups</strong>
                </div>
            `;

            return;
        }

        if ($("#groupCount")) {
            $("#groupCount").textContent =
                data?.length || "";
        }

        renderGroups(data || []);
    }


    function renderGroups(groups) {
        const list = $("#groupsList");

        if (!list) return;

        list.innerHTML = "";

        if (!groups.length) {
            list.innerHTML = `
                <div class="empty-state">
                    <i class="fa-solid fa-users"></i>
                    <strong>No groups yet</strong>
                    <span>
                        Create your first group.
                    </span>
                </div>
            `;

            return;
        }

        groups.forEach(group => {
            const item =
                document.createElement("button");

            item.className =
                "chat-item";

            item.innerHTML = `
                <div class="avatar avatar-medium">
                    ${
                        group.avatar_url
                            ? `<img
                                src="${escapeHTML(
                                    group.avatar_url
                                )}"
                                alt="${escapeHTML(
                                    group.name
                                )}"
                               >`
                            : escapeHTML(
                                getInitial(
                                    group.name
                                )
                            )
                    }
                </div>

                <div class="chat-info">
                    <div class="chat-info-top">
                        <span class="chat-info-name">
                            ${escapeHTML(
                                group.name
                            )}
                        </span>
                    </div>

                    <span class="chat-info-subtitle">
                        @${escapeHTML(
                            group.username
                        )}
                    </span>
                </div>
            `;

            item.addEventListener(
                "click",
                () => openGroup(group)
            );

            list.appendChild(item);
        });
    }


    async function searchGroups(username) {
        const {
            data,
            error
        } = await db
            .from("groups")
            .select("*")
            .eq("username", username)
            .limit(20);

        if (error) {
            console.error(error);
            return;
        }

        renderGroups(data || []);
    }


    async function openGroup(group) {
        selectedGroup = group;
        selectedChannel = null;
        selectedUser = null;

        showToast(
            `@${group.username} group selected.`,
            "success"
        );

        /*
         * Group message UI is connected to the
         * database foundation. Full group composer
         * can be expanded without changing the
         * existing direct-chat system.
         */
    }


    /* =========================================================
       CREATE GROUP
    ========================================================= */

    async function createGroup(event) {
        event.preventDefault();

        const name =
            $("#groupName")?.value.trim();

        const username =
            normalizeUsername(
                $("#groupUsername")?.value
            );

        const bio =
            $("#groupBio")?.value.trim();

        if (!name || !username) {
            showToast(
                "Enter group name and username.",
                "error"
            );

            return;
        }

        if (
            !/^[a-z0-9_]{3,32}$/.test(username)
        ) {
            showToast(
                "Username must contain only a-z, 0-9 and _.",
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
                owner_id: currentUser.id,
                name,
                username,
                bio
            })
            .select()
            .single();

        if (error) {
            console.error(error);

            showToast(
                error.code === "23505"
                    ? "That username is already taken."
                    : error.message ||
                      "Could not create group.",
                "error"
            );

            return;
        }

        const {
            error: memberError
        } = await db
            .from("group_members")
            .insert({
                group_id: data.id,
                user_id: currentUser.id,
                role: "owner"
            });

        if (memberError) {
            console.warn(memberError);
        }

        $("#groupForm")?.reset();

        closeModal(
            "createGroupModal"
        );

        showToast(
            "Group created.",
            "success"
        );

        await loadGroups();
    }


    /* =========================================================
       CHANNELS
    ========================================================= */

    async function loadChannels() {
        const list = $("#channelsList");

        if (!list) return;

        list.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-spinner fa-spin"></i>
                <span>Loading channels...</span>
            </div>
        `;

        const {
            data,
            error
        } = await db
            .from("channels")
            .select("*")
            .order("created_at", {
                ascending: false
            });

        if (error) {
            console.error(error);

            list.innerHTML = `
                <div class="empty-state">
                    <i class="fa-solid fa-triangle-exclamation"></i>
                    <strong>Could not load channels</strong>
                </div>
            `;

            return;
        }

        if ($("#channelCount")) {
            $("#channelCount").textContent =
                data?.length || "";
        }

        renderChannels(data || []);
    }


    function renderChannels(channels) {
        const list = $("#channelsList");

        if (!list) return;

        list.innerHTML = "";

        if (!channels.length) {
            list.innerHTML = `
                <div class="empty-state">
                    <i class="fa-solid fa-bullhorn"></i>
                    <strong>No channels yet</strong>
                    <span>
                        Create your first channel.
                    </span>
                </div>
            `;

            return;
        }

        channels.forEach(channel => {
            const item =
                document.createElement("button");

            item.className =
                "chat-item";

            item.innerHTML = `
                <div class="avatar avatar-medium">
                    ${
                        channel.avatar_url
                            ? `<img
                                src="${escapeHTML(
                                    channel.avatar_url
                                )}"
                                alt="${escapeHTML(
                                    channel.name
                                )}"
                               >`
                            : escapeHTML(
                                getInitial(
                                    channel.name
                                )
                            )
                    }
                </div>

                <div class="chat-info">
                    <div class="chat-info-top">
                        <span class="chat-info-name">
                            ${escapeHTML(
                                channel.name
                            )}
                        </span>
                    </div>

                    <span class="chat-info-subtitle">
                        @${escapeHTML(
                            channel.username
                        )}
                    </span>
                </div>
            `;

            item.addEventListener(
                "click",
                () => openChannel(channel)
            );

            list.appendChild(item);
        });
    }


    async function searchChannels(username) {
        const {
            data,
            error
        } = await db
            .from("channels")
            .select("*")
            .eq("username", username)
            .limit(20);

        if (error) {
            console.error(error);
            return;
        }

        renderChannels(data || []);
    }


    async function openChannel(channel) {
        selectedChannel = channel;
        selectedGroup = null;
        selectedUser = null;

        showToast(
            `@${channel.username} channel selected.`,
            "success"
        );
    }


    /* =========================================================
       CREATE CHANNEL
    ========================================================= */

    async function createChannel(event) {
        event.preventDefault();

        const name =
            $("#channelName")?.value.trim();

        const username =
            normalizeUsername(
                $("#channelUsername")?.value
            );

        const bio =
            $("#channelBio")?.value.trim();

        if (!name || !username) {
            showToast(
                "Enter channel name and username.",
                "error"
            );

            return;
        }

        if (
            !/^[a-z0-9_]{3,32}$/.test(username)
        ) {
            showToast(
                "Username must contain only a-z, 0-9 and _.",
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
                owner_id: currentUser.id,
                name,
                username,
                bio
            })
            .select()
            .single();

        if (error) {
            console.error(error);

            showToast(
                error.code === "23505"
                    ? "That username is already taken."
                    : error.message ||
                      "Could not create channel.",
                "error"
            );

            return;
        }

        const {
            error: memberError
        } = await db
            .from("channel_members")
            .insert({
                channel_id: data.id,
                user_id: currentUser.id,
                role: "owner"
            });

        if (memberError) {
            console.warn(memberError);
        }

        $("#channelForm")?.reset();

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
       PROFILE
    ========================================================= */

    function openProfileModal() {
        if (!currentProfile) return;

        $("#profileFullName").value =
            currentProfile.full_name || "";

        $("#profileUsername").value =
            currentProfile.username || "";

        $("#profileBio").value =
            currentProfile.bio || "";

        setAvatar(
            $("#profileEditAvatar"),
            currentProfile
        );

        openModal("profileModal");
    }


    async function saveProfile(event) {
        event.preventDefault();

        const fullName =
            $("#profileFullName")
                .value.trim();

        const username =
            normalizeUsername(
                $("#profileUsername").value
            );

        const bio =
            $("#profileBio")
                .value.trim();

        if (!fullName || !username) {
            showToast(
                "Full name and username are required.",
                "error"
            );

            return;
        }

        if (
            !/^[a-z0-9_]{3,32}$/.test(username)
        ) {
            showToast(
                "Username must contain only a-z, 0-9 and _.",
                "error"
            );

            return;
        }

        const {
            data,
            error
        } = await db
            .from("profiles")
            .update({
                full_name: fullName,
                username,
                bio
            })
            .eq("id", currentUser.id)
            .select()
            .single();

        if (error) {
            console.error(error);

            showToast(
                error.code === "23505"
                    ? "That username is already taken."
                    : error.message ||
                      "Could not save profile.",
                "error"
            );

            return;
        }

        currentProfile = data;

        renderMyProfile();

        closeModal("profileModal");

        showToast(
            "Profile updated.",
            "success"
        );
    }


    /* =========================================================
       AVATAR UPLOAD
    ========================================================= */

    async function uploadProfileAvatar(file) {
        if (!file) return;

        if (!file.type.startsWith("image/")) {
            showToast(
                "Please choose an image.",
                "error"
            );

            return;
        }

        if (file.size > 5 * 1024 * 1024) {
            showToast(
                "Avatar must be smaller than 5 MB.",
                "error"
            );

            return;
        }

        const extension =
            file.name
                .split(".")
                .pop()
                ?.toLowerCase() ||
            "jpg";

        const path =
            `${currentUser.id}/avatar.${extension}`;

        const {
            error: uploadError
        } = await db
            .storage
            .from("avatars")
            .upload(
                path,
                file,
                {
                    cacheControl: "3600",
                    upsert: true
                }
            );

        if (uploadError) {
            console.error(uploadError);

            showToast(
                uploadError.message ||
                "Avatar upload failed.",
                "error"
            );

            return;
        }

        const {
            data
        } = db
            .storage
            .from("avatars")
            .getPublicUrl(path);

        const avatarUrl =
            (data?.publicUrl || path) +
            `?v=${Date.now()}`;

        const {
            data: updated,
            error
        } = await db
            .from("profiles")
            .update({
                avatar_url: avatarUrl
            })
            .eq("id", currentUser.id)
            .select()
            .single();

        if (error) {
            console.error(error);

            showToast(
                error.message ||
                "Could not save avatar.",
                "error"
            );

            return;
        }

        currentProfile = updated;

        renderMyProfile();

        setAvatar(
            $("#profileEditAvatar"),
            currentProfile
        );

        showToast(
            "Avatar updated.",
            "success"
        );
    }


    /* =========================================================
       PRIVACY
    ========================================================= */

    function openPrivacyModal() {
        if (!currentProfile) return;

        $("#showOnlineToggle").checked =
            currentProfile.show_online !== false;

        $("#showLastSeenToggle").checked =
            currentProfile.show_last_seen !== false;

        openModal("privacyModal");
    }


    async function savePrivacySettings() {
        const {
            data,
            error
        } = await db
            .from("profiles")
            .update({
                show_online:
                    $("#showOnlineToggle").checked,

                show_last_seen:
                    $("#showLastSeenToggle").checked
            })
            .eq("id", currentUser.id)
            .select()
            .single();

        if (error) {
            console.error(error);

            showToast(
                error.message ||
                "Could not save privacy settings.",
                "error"
            );

            return;
        }

        currentProfile = data;

        closeModal("privacyModal");

        showToast(
            "Privacy settings saved.",
            "success"
        );

        if (selectedUser) {
            renderUserStatus(selectedUser);
        }
    }


    /* =========================================================
       EMOJI
    ========================================================= */

    function setupEmoji() {
        const button = $("#emojiBtn");
        const panel = $("#emojiPanel");
        const input = $("#messageInput");

        if (!button || !panel || !input) {
            return;
        }

        button.addEventListener(
            "click",
            event => {
                event.stopPropagation();

                panel.classList.toggle(
                    "active"
                );
            }
        );

        panel
            .querySelectorAll("button")
            .forEach(emoji => {
                emoji.addEventListener(
                    "click",
                    () => {
                        input.value +=
                            emoji.textContent;

                        input.focus();
                    }
                );
            });

        document.addEventListener(
            "click",
            event => {
                if (
                    !panel.contains(
                        event.target
                    ) &&
                    event.target !== button
                ) {
                    panel.classList.remove(
                        "active"
                    );
                }
            }
        );
    }


    /* =========================================================
       OWNER / ADMIN
    ========================================================= */

    function setupRoleUI() {
        const role =
            currentProfile?.role;

        const ownerButton =
            $("#ownerPanelButton");

        const adminButton =
            $("#adminPanelButton");

        if (ownerButton) {
            ownerButton.style.display =
                role === "owner"
                    ? "flex"
                    : "none";
        }

        if (adminButton) {
            adminButton.style.display =
                role === "admin" ||
                role === "owner"
                    ? "flex"
                    : "none";
        }
    }


    function setupOwnerTabs() {
        $$(".panel-tab")
            .forEach(tab => {
                tab.addEventListener(
                    "click",
                    () => {
                        const target =
                            tab.dataset.ownerTab;

                        $$(".panel-tab")
                            .forEach(item => {
                                item.classList.toggle(
                                    "active",
                                    item === tab
                                );
                            });

                        $$(".owner-panel-section")
                            .forEach(section => {
                                section.classList.remove(
                                    "active"
                                );
                            });

                        const panel =
                            document.getElementById(
                                "owner" +
                                target
                                    .charAt(0)
                                    .toUpperCase() +
                                target.slice(1) +
                                "Panel"
                            );

                        panel?.classList.add(
                            "active"
                        );
                    }
                );
            });
    }


    async function ownerSearchUser(
        username,
        resultElement
    ) {
        const clean =
            normalizeUsername(username);

        if (!clean) {
            if (resultElement)
                resultElement.innerHTML = "";

            return null;
        }

        const {
            data,
            error
        } = await db
            .from("profiles")
            .select("*")
            .eq("username", clean)
            .maybeSingle();

        if (error || !data) {
            if (resultElement) {
                resultElement.innerHTML = `
                    <div class="empty-state">
                        <strong>User not found</strong>
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
                $("#ownerVerifiedUsername").value,
                result
            );

        if (!user) return;

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
                    id="ownerVerifyAction"
                >
                    ${
                        user.is_verified
                            ? "Remove"
                            : "Verify"
                    }
                </button>
            </div>
        `;

        $("#ownerVerifyAction")
            ?.addEventListener(
                "click",
                async () => {
                    const duration =
                        Number(
                            $("#verifiedDuration")
                                ?.value || 0
                        );

                    const expiresAt =
                        duration > 0
                            ? new Date(
                                Date.now() +
                                duration *
                                86400000
                            ).toISOString()
                            : null;

                    const action =
                        user.is_verified
                            ? "remove"
                            : "give";

                    const {
                        error
                    } = await db.rpc(
                        "owner_set_verified",
                        {
                            p_user_id: user.id,
                            p_action: action,
                            p_expires_at:
                                expiresAt
                        }
                    );

                    if (error) {
                        console.error(error);

                        showToast(
                            error.message ||
                            "Could not update verification.",
                            "error"
                        );

                        return;
                    }

                    showToast(
                        action === "give"
                            ? "User verified."
                            : "Verification removed.",
                        "success"
                    );

                    await ownerSearchVerified();
                }
            );
    }


    async function ownerSearchModeration() {
        const result =
            $("#ownerModerationResult");

        const user =
            await ownerSearchUser(
                $("#ownerModerationUsername").value,
                result
            );

        if (!user) return;

        result.innerHTML = `
            <div class="owner-user-actions">
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
                </div>

                <button
                    class="contact-action decline"
                    id="blockAccountBtn"
                >
                    Block Account
                </button>

                <button
                    class="contact-action decline"
                    id="blockMessagingBtn"
                >
                    Block Messaging
                </button>
            </div>
        `;

        $("#blockAccountBtn")
            ?.addEventListener(
                "click",
                () => ownerBlockUser(
                    user,
                    "account"
                )
            );

        $("#blockMessagingBtn")
            ?.addEventListener(
                "click",
                () => ownerBlockUser(
                    user,
                    "messaging"
                )
            );
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
                p_user_id: user.id,
                p_block_type: type,
                p_action: "block"
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
                $("#ownerAdminUsername").value,
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
                            p_user_id: user.id,
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
            .order("created_at", {
                ascending: false
            })
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


    function openAdminPanelSection(type) {
        showToast(
            `${type} admin section selected.`,
            "info"
        );

        if (type === "reports") {
            loadOwnerReports();
        }
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

                    if ($("#messages")) {
                        $("#messages").innerHTML = "";
                    }

                    if ($("#activeChat")) {
                        $("#activeChat")
                            .style.display = "none";
                    }

                    if ($("#chatEmpty")) {
                        $("#chatEmpty")
                            .style.display = "flex";
                    }

                    updateMessageInputState();
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
                            closeModal(overlay);
                        }
                    }
                );
            });

        document.addEventListener(
            "keydown",
            event => {
                if (event.key === "Escape") {
                    closeAllModals();
                }
            }
        );
    }


    /* =========================================================
       LOGOUT
    ========================================================= */

    async function logout() {
        clearInterval(lastSeenInterval);

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
       REALTIME
    ========================================================= */

    function setupRealtime() {
        if (!currentUser) return;

        realtimeChannel =
            db.channel(
                "MegChatBox-realtime-" +
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
                    const message =
                        payload.new ||
                        payload.old;

                    if (
                        !selectedUser ||
                        !message
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
                    if (currentTab === "chats") {
                        await loadContacts();
                    }

                    if (selectedUser) {
                        await updateContactActions();
                        await updateMessageInputState();
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
                        payload.new &&
                        payload.new.id ===
                        currentUser.id
                    ) {
                        currentProfile =
                            payload.new;

                        renderMyProfile();
                        setupRoleUI();
                    }

                    if (
                        selectedUser &&
                        payload.new &&
                        payload.new.id ===
                        selectedUser.id
                    ) {
                        selectedUser =
                            payload.new;

                        setAvatar(
                            $("#chatAvatar"),
                            selectedUser
                        );

                        $("#chatName").textContent =
                            selectedUser.full_name ||
                            selectedUser.username;

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

            .subscribe(status => {
                console.log(
                    "Realtime:",
                    status
                );
            });
    }


    /* =========================================================
       EVENTS
    ========================================================= */

    function setupEvents() {
        setupTabs();
        setupSearch();
        setupEmoji();
        setupLanguage();
        setupAppearance();
        setupModalEvents();
        setupMobile();
        setupOwnerTabs();


        /* Settings */

        $("#settingsBtn")
            ?.addEventListener(
                "click",
                () => openModal(
                    "settingsModal"
                )
            );

        $("#closeSettingsBtn")
            ?.addEventListener(
                "click",
                () => closeModal(
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
                () => closeModal(
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
                () => {
                    $("#profileAvatarInput")
                        ?.click();
                }
            );

        $("#profileAvatarInput")
            ?.addEventListener(
                "change",
                event => {
                    const file =
                        event.target.files?.[0];

                    uploadProfileAvatar(file);

                    event.target.value = "";
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
                () => closeModal(
                    "privacyModal"
                )
            );

        $("#savePrivacyBtn")
            ?.addEventListener(
                "click",
                savePrivacySettings
            );


        /* Language */

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

        $("#closeLanguageBtn")
            ?.addEventListener(
                "click",
                () => closeModal(
                    "languageModal"
                )
            );


        /* Appearance */

        $("#appearanceSettingsBtn")
            ?.addEventListener(
                "click",
                () => openModal(
                    "appearanceModal"
                )
            );

        $("#closeAppearanceBtn")
            ?.addEventListener(
                "click",
                () => closeModal(
                    "appearanceModal"
                )
            );


        /* Owner */

        $("#ownerPanelButton")
            ?.addEventListener(
                "click",
                async () => {
                    closeModal(
                        "settingsModal"
                    );

                    openModal(
                        "ownerModal"
                    );

                    await loadOwnerReports();
                }
            );

        $("#closeOwnerBtn")
            ?.addEventListener(
                "click",
                () => closeModal(
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
                () => closeModal(
                    "adminModal"
                )
            );

        $("#openAdminReportsBtn")
            ?.addEventListener(
                "click",
                () => openAdminPanelSection(
                    "reports"
                )
            );

        $("#openAdminUsersBtn")
            ?.addEventListener(
                "click",
                () => openAdminPanelSection(
                    "users"
                )
            );

        $("#openAdminGroupsBtn")
            ?.addEventListener(
                "click",
                () => openAdminPanelSection(
                    "groups"
                )
            );

        $("#openAdminChannelsBtn")
            ?.addEventListener(
                "click",
                () => openAdminPanelSection(
                    "channels"
                )
            );


        /* Groups */

        $("#createGroupBtn")
            ?.addEventListener(
                "click",
                () => openModal(
                    "createGroupModal"
                )
            );

        $("#closeGroupBtn")
            ?.addEventListener(
                "click",
                () => closeModal(
                    "createGroupModal"
                )
            );

        $("#groupForm")
            ?.addEventListener(
                "submit",
                createGroup
            );


        /* Channels */

        $("#createChannelBtn")
            ?.addEventListener(
                "click",
                () => openModal(
                    "createChannelModal"
                )
            );

        $("#closeChannelBtn")
            ?.addEventListener(
                "click",
                () => closeModal(
                    "createChannelModal"
                )
            );

        $("#channelForm")
            ?.addEventListener(
                "submit",
                createChannel
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
                () => {
                    $("#imageInput")?.click();
                }
            );

        $("#imageInput")
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

        $("#messageInput")
            ?.addEventListener(
                "keydown",
                event => {
                    if (
                        event.key === "Enter" &&
                        !event.shiftKey
                    ) {
                        event.preventDefault();

                        $("#messageForm")
                            ?.requestSubmit();
                    }
                }
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


        /* Chat more */

        $("#chatMoreBtn")
            ?.addEventListener(
                "click",
                () => {
                    if (!selectedUser) return;

                    showToast(
                        "More chat actions will be added soon.",
                        "info"
                    );
                }
            );


        /* Chat avatar / profile */

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
    }


    /* =========================================================
       USER PROFILE POPUP
    ========================================================= */

    function openUserProfilePopup(user) {
        if (!user) return;

        setAvatar(
            $("#userProfileAvatar"),
            user
        );

        if ($("#userProfileName")) {
            $("#userProfileName").textContent =
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
                "@" + user.username;
        }

        if ($("#userProfileBio")) {
            $("#userProfileBio")
                .textContent =
                user.bio ||
                "No bio yet.";
        }

        if ($("#userProfileStatus")) {
            const oldSelected =
                selectedUser;

            selectedUser = user;

            renderUserStatus(user);

            $("#userProfileStatus")
                .textContent =
                $("#chatStatus")
                    ?.textContent || "";

            selectedUser =
                oldSelected;
        }

        openModal(
            "userProfileModal"
        );
    }


    /* =========================================================
       MESSAGE CONTROLS
    ========================================================= */

    function disableMessageControls() {
        const input =
            $("#messageInput");

        if (!input) return;

        input.disabled = true;

        $("#sendButton").disabled = true;
        $("#imageBtn").disabled = true;
        $("#emojiBtn").disabled = true;
        $("#stickerBtn").disabled = true;

        input.placeholder =
            "Select a contact...";
    }


    /* =========================================================
       INITIALIZE
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

        currentTab = "chats";

        localStorage.setItem(
            "messageAppLoggedIn",
            "true"
        );

        localStorage.setItem(
            "messageAppUser",
            JSON.stringify({
                id: currentUser.id,
                username:
                    currentProfile.username,
                full_name:
                    currentProfile.full_name
            })
        );

        console.log(
            "MegChatBox V2.1 dashboard ready."
        );
    }


    /* =========================================================
       START
    ========================================================= */

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
