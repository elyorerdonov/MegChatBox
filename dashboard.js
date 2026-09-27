(() => {
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
    let currentTab = "contacts";

    let realtimeChannel = null;

    let currentProfileTarget = null;
    let currentNicknameTarget = null;

    let selectedGroupAvatarFile = null;
    let selectedChannelAvatarFile = null;
    let selectedProfileAvatarFile = null;

    let currentTheme = localStorage.getItem("megchatbox_theme") || "dark";
    let currentDensity =
        localStorage.getItem("megchatbox_density") || "comfortable";

    let currentLanguage =
        localStorage.getItem("megchatbox_language") || "en";

    /* =====================================================
       HELPERS
    ===================================================== */

    const $ = (selector) => document.querySelector(selector);

    const $$ = (selector) => [
        ...document.querySelectorAll(selector)
    ];

    function escapeHTML(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function getInitial(name) {
        return (
            String(name || "?")
                .trim()
                .charAt(0)
                .toUpperCase() || "?"
        );
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

        return new Date(date).toLocaleDateString();
    }

    function isValidImage(file) {
        if (!file) return false;

        if (!file.type.startsWith("image/")) {
            showToast("Please select an image.");
            return false;
        }

        if (file.size > 5 * 1024 * 1024) {
            showToast("Image must be smaller than 5MB.");
            return false;
        }

        return true;
    }

    function showToast(message) {
        const toast = $("#toast");
        const text = $("#toastMessage");

        if (!toast || !text) return;

        text.textContent = message;

        toast.style.display = "flex";

        clearTimeout(showToast.timer);

        showToast.timer = setTimeout(() => {
            toast.style.display = "none";
        }, 3000);
    }

    function openModal(id) {
        const modal = document.getElementById(id);

        if (!modal) return;

        modal.classList.add("active");
        modal.style.display = "flex";
    }

    function closeModal(id) {
        const modal = document.getElementById(id);

        if (!modal) return;

        modal.classList.remove("active");
        modal.style.display = "none";
    }

    function closeAllModals() {
        $$(".modal").forEach(modal => {
            modal.classList.remove("active");
            modal.style.display = "none";
        });
    }

    function setImagePreview(container, file, fallbackIcon) {
        if (!container) return;

        if (!file) {
            container.innerHTML = fallbackIcon;
            return;
        }

        const url = URL.createObjectURL(file);

        container.innerHTML = `
            <img
                src="${url}"
                alt=""
            >
        `;
    }

    function getPrivacyValue(name) {
        const checked = document.querySelector(
            `input[name="${name}"]:checked`
        );

        return checked?.value === "private"
            ? false
            : true;
    }

    /* =====================================================
       THEME
    ===================================================== */

    function applyTheme(theme) {
        currentTheme = theme;

        let actualTheme = theme;

        if (theme === "system") {
            actualTheme = window.matchMedia(
                "(prefers-color-scheme: dark)"
            ).matches
                ? "dark"
                : "light";
        }

        document.body.dataset.theme = actualTheme;

        localStorage.setItem(
            "megchatbox_theme",
            theme
        );

        $$(".appearance-option[data-theme]").forEach(btn => {
            btn.classList.toggle(
                "selected",
                btn.dataset.theme === theme
            );
        });
    }

    function applyDensity(density) {
        currentDensity = density;

        document.body.dataset.density = density;

        localStorage.setItem(
            "megchatbox_density",
            density
        );

        $$(".appearance-option[data-density]").forEach(btn => {
            btn.classList.toggle(
                "selected",
                btn.dataset.density === density
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

        if (error || !data.session) {
            window.location.href = "index.html";
            return false;
        }

        currentUser = data.session.user;

        return true;
    }

    async function loadMyProfile() {
        const {
            data,
            error
        } = await db
            .from("profiles")
            .select("*")
            .eq("id", currentUser.id)
            .maybeSingle();

        if (error) {
            console.error(error);
            showToast("Could not load profile.");
            return false;
        }

        currentProfile = data;

        renderMyProfile();

        return true;
    }

    function renderMyProfile() {
        if (!currentProfile) return;

        const name = $("#myName");
        const username = $("#myUsername");
        const initial = $("#myAvatarInitial");
        const avatar = $("#myAvatar");
        const verified = $("#myVerified");

        if (name) {
            name.textContent =
                currentProfile.full_name || "User";
        }

        if (username) {
            username.textContent =
                "@" + (currentProfile.username || "");
        }

        if (initial) {
            initial.textContent =
                getInitial(currentProfile.full_name);
        }

        if (avatar) {
            if (currentProfile.avatar_url) {
                avatar.src = currentProfile.avatar_url;
                avatar.style.display = "block";

                if (initial) {
                    initial.style.display = "none";
                }
            } else {
                avatar.style.display = "none";

                if (initial) {
                    initial.style.display = "block";
                }
            }
        }

        if (verified) {
            verified.style.display =
                currentProfile.is_verified === true
                    ? "inline-flex"
                    : "none";
        }

        if (currentProfile.role === "owner") {
            $("#ownerPanelButton").style.display = "flex";
        } else {
            $("#ownerPanelButton").style.display = "none";
        }

        if (
            currentProfile.role === "admin" ||
            currentProfile.role === "owner"
        ) {
            $("#adminPanelButton").style.display = "flex";
        } else {
            $("#adminPanelButton").style.display = "none";
        }
    }

    /* =====================================================
       PROFILE AVATAR
    ===================================================== */

    function fixAvatar(container) {
        if (!container) return;

        container.style.width = "110px";
        container.style.height = "110px";
        container.style.minWidth = "110px";
        container.style.minHeight = "110px";
        container.style.aspectRatio = "1 / 1";
        container.style.borderRadius = "50%";
        container.style.overflow = "hidden";

        const img = container.querySelector("img");

        if (img) {
            img.style.width = "100%";
            img.style.height = "100%";
            img.style.objectFit = "cover";
            img.style.objectPosition = "center";
            img.style.display = "block";
        }
    }

    function fixProfilePopupAvatar() {
        const container =
            $(".profile-popup-avatar-wrap");

        if (!container) return;

        fixAvatar(container);
    }

    /* =====================================================
       TABS
    ===================================================== */

    function switchTab(tab) {
        currentTab = tab;

        $$(".sidebar-tab").forEach(button => {
            button.classList.toggle(
                "active",
                button.dataset.tab === tab
            );
        });

        $("#chatsTab").style.display =
            tab === "contacts" ? "block" : "none";

        $("#groupsTab").style.display =
            tab === "groups" ? "block" : "none";

        $("#channelsTab").style.display =
            tab === "channels" ? "block" : "none";

        if (tab === "contacts") {
            loadContacts();
        }

        if (tab === "groups") {
            loadGroups();
        }

        if (tab === "channels") {
            loadChannels();
        }
    }

    /* =====================================================
       SEARCH
    ===================================================== */

    let searchTimer = null;

    function setupSearch() {
        const input = $("#searchInput");

        if (!input) return;

        input.addEventListener("input", () => {
            clearTimeout(searchTimer);

            const value = input.value.trim();

            searchTimer = setTimeout(() => {
                if (!value) {
                    if (currentTab === "contacts") {
                        loadContacts();
                    }

                    if (currentTab === "groups") {
                        loadGroups();
                    }

                    if (currentTab === "channels") {
                        loadChannels();
                    }

                    return;
                }

                searchEverything(value);
            }, 300);
        });
    }

    async function searchEverything(query) {
        const clean = query
            .replace(/^@/, "")
            .trim()
            .toLowerCase();

        if (!clean) return;

        const results = [];

        /* USERS */

        const {
            data: users
        } = await db
            .from("profiles")
            .select("*")
            .ilike("username", `%${clean}%`)
            .limit(15);

        (users || []).forEach(user => {
            if (user.id !== currentUser.id) {
                results.push({
                    type: "user",
                    data: user
                });
            }
        });


        /* PUBLIC GROUPS */

        const {
            data: groups
        } = await db
            .from("groups")
            .select("*")
            .eq("is_public", true)
            .or(
                `username.ilike.%${clean}%,name.ilike.%${clean}%`
            )
            .limit(15);

        (groups || []).forEach(group => {
            results.push({
                type: "group",
                data: group
            });
        });


        /* PUBLIC CHANNELS */

        const {
            data: channels
        } = await db
            .from("channels")
            .select("*")
            .eq("is_public", true)
            .or(
                `username.ilike.%${clean}%,name.ilike.%${clean}%`
            )
            .limit(15);

        (channels || []).forEach(channel => {
            results.push({
                type: "channel",
                data: channel
            });
        });

        renderSearchResults(results);
    }

    function renderSearchResults(results) {
        const list =
            currentTab === "groups"
                ? $("#groupsList")
                : currentTab === "channels"
                    ? $("#channelsList")
                    : $("#userList");

        if (!list) return;

        list.innerHTML = "";

        if (!results.length) {
            list.innerHTML = `
                <div class="empty-list">
                    No results found.
                </div>
            `;

            return;
        }

        results.forEach(result => {

            if (result.type === "user") {
                list.appendChild(
                    createUserItem(result.data)
                );
            }

            if (result.type === "group") {
                list.appendChild(
                    createGroupItem(
                        result.data,
                        true
                    )
                );
            }

            if (result.type === "channel") {
                list.appendChild(
                    createChannelItem(
                        result.data,
                        true
                    )
                );
            }
        });
    }

    /* =====================================================
       CONTACTS
    ===================================================== */

    async function loadContacts() {
        const list = $("#userList");

        if (!list) return;

        list.innerHTML = `
            <div class="loading-list">
                Loading...
            </div>
        `;

        const {
            data: requests,
            error
        } = await db
            .from("contact_requests")
            .select("*")
            .or(
                `sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`
            )
            .eq("status", "accepted");

        if (error) {
            console.error(error);

            list.innerHTML = `
                <div class="empty-list">
                    No contacts yet.
                </div>
            `;

            return;
        }

        const ids = [];

        (requests || []).forEach(request => {
            const other =
                request.sender_id === currentUser.id
                    ? request.receiver_id
                    : request.sender_id;

            if (!ids.includes(other)) {
                ids.push(other);
            }
        });

        if (!ids.length) {
            list.innerHTML = `
                <div class="empty-list">
                    No contacts yet.
                </div>
            `;

            $("#contactCount").textContent = "0";

            return;
        }

        const {
            data: profiles
        } = await db
            .from("profiles")
            .select("*")
            .in("id", ids);

        list.innerHTML = "";

        (profiles || []).forEach(profile => {
            list.appendChild(
                createUserItem(profile)
            );
        });

        $("#contactCount").textContent =
            String(profiles?.length || 0);
    }

    function createUserItem(profile) {
        const button = document.createElement("button");

        button.type = "button";
        button.className = "chat-item";

        const avatar = profile.avatar_url
            ? `
                <img
                    src="${escapeHTML(profile.avatar_url)}"
                    alt=""
                >
            `
            : `
                <span>
                    ${escapeHTML(
                        getInitial(profile.full_name)
                    )}
                </span>
            `;

        button.innerHTML = `
            <div class="chat-avatar">
                ${avatar}
            </div>

            <div class="chat-item-info">

                <div class="chat-item-top">

                    <strong>
                        ${escapeHTML(
                            profile.full_name ||
                            profile.username
                        )}
                    </strong>

                    ${
                        profile.is_verified
                            ? `<span class="verified-badge">✓</span>`
                            : ""
                    }

                </div>

                <span>
                    @${escapeHTML(profile.username)}
                </span>

            </div>
        `;

        button.addEventListener("click", () => {
            openUserChat(profile);
        });

        return button;
    }

    /* =====================================================
       OPEN USER CHAT
    ===================================================== */

    async function openUserChat(profile) {
        selectedUser = profile;

        selectedGroup = null;
        selectedChannel = null;

        currentChatType = "user";

        $("#chatEmpty").style.display = "none";
        $("#activeChat").style.display = "flex";

        renderChatHeader(profile);

        await checkContactStatus(profile.id);

        await loadDirectMessages(profile.id);

        setupRealtime("user", profile.id);
    }

    function renderChatHeader(profile) {
        $("#chatName").textContent =
            profile.full_name || profile.username;

        $("#chatVerified").style.display =
            profile.is_verified
                ? "inline-flex"
                : "none";

        $("#chatStatus").textContent =
            profile.show_online === false
                ? "Offline"
                : "offline";

        const img = $("#chatAvatar");
        const initial = $("#chatAvatarInitial");

        if (profile.avatar_url) {
            img.src = profile.avatar_url;
            img.style.display = "block";
            initial.style.display = "none";
        } else {
            img.style.display = "none";
            initial.style.display = "block";
            initial.textContent =
                getInitial(profile.full_name);
        }
    }

    async function checkContactStatus(otherId) {
        const {
            data
        } = await db
            .from("contact_requests")
            .select("*")
            .or(
                `and(sender_id.eq.${currentUser.id},receiver_id.eq.${otherId}),and(sender_id.eq.${otherId},receiver_id.eq.${currentUser.id})`
            )
            .order("created_at", {
                ascending: false
            })
            .limit(1);

        const request = data?.[0];

        const actions = $("#contactActions");

        const add = $("#addContactBtn");
        const accept = $("#acceptContactBtn");
        const decline = $("#declineContactBtn");

        actions.style.display = "flex";

        add.style.display = "none";
        accept.style.display = "none";
        decline.style.display = "none";

        if (!request) {
            add.style.display = "inline-flex";
            return;
        }

        if (request.status === "accepted") {
            actions.style.display = "none";
            return;
        }

        if (
            request.status === "pending" &&
            request.receiver_id === currentUser.id
        ) {
            accept.style.display = "inline-flex";
            decline.style.display = "inline-flex";
            return;
        }

        if (
            request.status === "pending" &&
            request.sender_id === currentUser.id
        ) {
            add.style.display = "none";
        }
    }

    /* =====================================================
       CONTACT REQUESTS
    ===================================================== */

    async function sendContactRequest() {
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
            if (error.code === "23505") {
                showToast("Contact request already exists.");
            } else {
                console.error(error);
                showToast(error.message);
            }

            return;
        }

        showToast("Contact request sent.");

        await checkContactStatus(
            selectedUser.id
        );
    }

    async function acceptContactRequest() {
        if (!selectedUser) return;

        const {
            error
        } = await db
            .from("contact_requests")
            .update({
                status: "accepted"
            })
            .eq("sender_id", selectedUser.id)
            .eq("receiver_id", currentUser.id)
            .eq("status", "pending");

        if (error) {
            console.error(error);
            showToast(error.message);
            return;
        }

        showToast("Contact accepted.");

        await checkContactStatus(
            selectedUser.id
        );

        await loadContacts();

        await loadDirectMessages(
            selectedUser.id
        );
    }

    async function declineContactRequest() {
        if (!selectedUser) return;

        const {
            error
        } = await db
            .from("contact_requests")
            .update({
                status: "declined"
            })
            .eq("sender_id", selectedUser.id)
            .eq("receiver_id", currentUser.id)
            .eq("status", "pending");

        if (error) {
            console.error(error);
            showToast(error.message);
            return;
        }

        showToast("Request declined.");

        await checkContactStatus(
            selectedUser.id
        );
    }

    /* =====================================================
       DIRECT MESSAGES
    ===================================================== */

    async function loadDirectMessages(otherId) {
        const messages = $("#messages");

        if (!messages) return;

        messages.innerHTML = `
            <div class="loading-list">
                Loading...
            </div>
        `;

        const {
            data,
            error
        } = await db
            .from("messages")
            .select("*")
            .or(
                `and(sender_id.eq.${currentUser.id},receiver_id.eq.${otherId}),and(sender_id.eq.${otherId},receiver_id.eq.${currentUser.id})`
            )
            .order("created_at", {
                ascending: true
            });

        if (error) {
            console.error(error);
            messages.innerHTML = "";
            showToast(error.message);
            return;
        }

        messages.innerHTML = "";

        (data || []).forEach(message => {
            messages.appendChild(
                createMessageElement(
                    message,
                    "user"
                )
            );
        });

        scrollMessages();

        await db.rpc(
            "mark_messages_delivered",
            {
                p_other_user_id: otherId
            }
        );

        await db.rpc(
            "mark_chat_seen",
            {
                p_other_user_id: otherId
            }
        );
    }

    function createMessageElement(message, type) {
        const wrapper =
            document.createElement("div");

        wrapper.className =
            "message-wrapper " +
            (
                message.sender_id === currentUser.id
                    ? "own"
                    : "other"
            );

        wrapper.dataset.messageId =
            message.id;

        const deleted =
            !!message.deleted_at;

        let content = "";

        if (deleted) {
            content = `
                <span class="deleted-message">
                    Message deleted
                </span>
            `;
        } else if (
            message.message_type === "image" &&
            message.image_url
        ) {
            content = `
                <img
                    class="message-image"
                    src="${escapeHTML(message.image_url)}"
                    alt="Image"
                >
            `;
        } else if (
            message.message_type === "sticker" &&
            message.sticker_url
        ) {
            content = `
                <img
                    class="message-sticker"
                    src="${escapeHTML(message.sticker_url)}"
                    alt="Sticker"
                >
            `;
        } else {
            content =
                escapeHTML(message.content);
        }

        wrapper.innerHTML = `
            <div class="message-bubble">

                <div class="message-content">
                    ${content}
                </div>

                <div class="message-meta">

                    <span>
                        ${formatTime(
                            message.created_at
                        )}
                    </span>

                    ${
                        message.edited_at &&
                        !message.deleted_at
                            ? `<span>edited</span>`
                            : ""
                    }

                    ${
                        message.sender_id === currentUser.id
                            ? `
                                <span class="message-status">
                                    ${
                                        message.seen_at
                                            ? "✓✓"
                                            : message.delivered_at
                                                ? "✓✓"
                                                : "✓"
                                    }
                                </span>
                            `
                            : ""
                    }

                </div>

            </div>


            <div class="message-actions">

                ${
                    message.sender_id === currentUser.id &&
                    message.message_type === "text" &&
                    !message.deleted_at
                        ? `
                            <button
                                class="message-action edit"
                                data-action="edit"
                                title="Edit"
                            >
                                <i class="fa-solid fa-pen"></i>
                            </button>

                            <button
                                class="message-action delete"
                                data-action="delete"
                                title="Delete"
                            >
                                <i class="fa-solid fa-trash"></i>
                            </button>
                        `
                        : ""
                }

                <button
                    class="message-action save"
                    data-action="save"
                    title="Save"
                >
                    <i class="fa-solid fa-bookmark"></i>
                </button>

            </div>
        `;

        setupMessageSwipe(wrapper);

        wrapper
            .querySelectorAll(".message-action")
            .forEach(button => {
                button.addEventListener(
                    "click",
                    async event => {
                        event.stopPropagation();

                        const action =
                            button.dataset.action;

                        if (action === "edit") {
                            editMessage(message);
                        }

                        if (action === "delete") {
                            deleteMessage(message.id);
                        }

                        if (action === "save") {
                            saveMessage(message);
                        }

                        wrapper.classList.remove(
                            "swiped"
                        );

                        const bubble =
                            wrapper.querySelector(
                                ".message-bubble"
                            );

                        if (bubble) {
                            bubble.style.transform = "";
                        }
                    }
                );
            });

        return wrapper;
    }

    /* =====================================================
       MESSAGE SWIPE
    ===================================================== */

    function setupMessageSwipe(wrapper) {
        if (!wrapper) return;

        if (
            wrapper.dataset.swipeReady === "true"
        ) {
            return;
        }

        wrapper.dataset.swipeReady = "true";

        const bubble =
            wrapper.querySelector(
                ".message-bubble"
            );

        if (!bubble) return;

        let startX = 0;
        let startY = 0;
        let currentX = 0;
        let swiping = false;

        wrapper.addEventListener(
            "pointerdown",
            event => {
                startX = event.clientX;
                startY = event.clientY;
                currentX = startX;
                swiping = false;
            }
        );

        wrapper.addEventListener(
            "pointermove",
            event => {
                const dx =
                    event.clientX - startX;

                const dy =
                    Math.abs(
                        event.clientY - startY
                    );

                if (dy > 30) return;

                if (dx < -10) {
                    swiping = true;

                    const distance =
                        Math.min(
                            Math.abs(dx),
                            145
                        );

                    bubble.style.transform =
                        `translateX(-${distance}px)`;
                }
            }
        );

        wrapper.addEventListener(
            "pointerup",
            () => {
                if (!swiping) return;

                const dx =
                    currentX - startX;

                if (dx < -60) {
                    wrapper.classList.add(
                        "swiped"
                    );

                    bubble.style.transform =
                        "translateX(-145px)";
                } else {
                    wrapper.classList.remove(
                        "swiped"
                    );

                    bubble.style.transform =
                        "";
                }

                swiping = false;
            }
        );

        wrapper.addEventListener(
            "pointercancel",
            () => {
                wrapper.classList.remove(
                    "swiped"
                );

                bubble.style.transform = "";
                swiping = false;
            }
        );
    }

    document.addEventListener(
        "click",
        event => {
            if (
                !event.target.closest(
                    ".message-wrapper"
                )
            ) {
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
        }
    );

    /* =====================================================
       SEND MESSAGE
    ===================================================== */

    async function sendMessage(event) {
        event.preventDefault();

        const input =
            $("#messageInput");

        const content =
            input.value.trim();

        if (!content) return;

        if (currentChatType !== "user") {
            showToast(
                "Group and channel messaging will be enabled after joining."
            );
            return;
        }

        if (!selectedUser) return;

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
            showToast(error.message);
            return;
        }

        input.value = "";

        await loadDirectMessages(
            selectedUser.id
        );
    }

    /* =====================================================
       EDIT MESSAGE
    ===================================================== */

    async function editMessage(message) {
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

        const {
            error
        } = await db.rpc(
            "edit_message",
            {
                p_message_id: message.id,
                p_new_content: newText.trim()
            }
        );

        if (error) {
            console.error(error);
            showToast(error.message);
            return;
        }

        if (selectedUser) {
            await loadDirectMessages(
                selectedUser.id
            );
        }
    }

    /* =====================================================
       DELETE MESSAGE
    ===================================================== */

    async function deleteMessage(id) {
        const {
            error
        } = await db.rpc(
            "delete_message",
            {
                p_message_id: id
            }
        );

        if (error) {
            console.error(error);
            showToast(error.message);
            return;
        }

        if (selectedUser) {
            await loadDirectMessages(
                selectedUser.id
            );
        }
    }

    /* =====================================================
       SAVED MESSAGE
    ===================================================== */

    async function saveMessage(message) {
        const {
            error
        } = await db
            .from("saved_messages")
            .insert({
                user_id: currentUser.id,
                content: message.content || "",
                message_type:
                    message.message_type || "text",
                image_url:
                    message.image_url || null,
                sticker_url:
                    message.sticker_url || null
            });

        if (error) {
            console.error(error);
            showToast(error.message);
            return;
        }

        showToast("Message saved.");
    }

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
            .eq("user_id", currentUser.id)
            .order("created_at", {
                ascending: false
            });

        if (error) {
            console.error(error);
            return;
        }

        list.innerHTML = "";

        if (!data?.length) {
            list.innerHTML = `
                <div class="empty-list">
                    No saved messages yet.
                </div>
            `;

            return;
        }

        data.forEach(item => {
            const div =
                document.createElement("div");

            div.className =
                "saved-message-item";

            div.innerHTML = `
                <div>
                    ${escapeHTML(
                        item.content ||
                        "Saved media"
                    )}
                </div>

                <small>
                    ${formatDate(
                        item.created_at
                    )}
                </small>
            `;

            list.appendChild(div);
        });
    }

    /* =====================================================
       GROUPS
    ===================================================== */

    async function loadGroups() {
        const list = $("#groupsList");

        if (!list) return;

        list.innerHTML = `
            <div class="loading-list">
                Loading groups...
            </div>
        `;

        const {
            data: memberships,
            error
        } = await db
            .from("group_members")
            .select(
                "group_id, user_id, role"
            )
            .eq(
                "user_id",
                currentUser.id
            );

        if (error) {
            console.error(error);

            list.innerHTML = `
                <div class="empty-list">
                    No groups yet.
                </div>
            `;

            return;
        }

        const ids =
            (memberships || [])
                .map(item => item.group_id);

        if (!ids.length) {
            list.innerHTML = `
                <div class="empty-list">
                    No groups yet.
                </div>
            `;

            $("#groupCount").textContent = "0";

            return;
        }

        const {
            data: groups
        } = await db
            .from("groups")
            .select("*")
            .in("id", ids);

        list.innerHTML = "";

        (groups || []).forEach(group => {
            list.appendChild(
                createGroupItem(
                    group,
                    false
                )
            );
        });

        $("#groupCount").textContent =
            String(groups?.length || 0);
    }

    function createGroupItem(
        group,
        searchResult = false
    ) {
        const button =
            document.createElement("button");

        button.type = "button";
        button.className = "chat-item";

        const avatar = group.avatar_url
            ? `
                <img
                    src="${escapeHTML(
                        group.avatar_url
                    )}"
                    alt=""
                >
            `
            : `
                <span>
                    ${escapeHTML(
                        getInitial(group.name)
                    )}
                </span>
            `;

        button.innerHTML = `
            <div class="chat-avatar">
                ${avatar}
            </div>

            <div class="chat-item-info">

                <div class="chat-item-top">

                    <strong>
                        ${escapeHTML(group.name)}
                    </strong>

                </div>

                <span>
                    @${escapeHTML(
                        group.username
                    )}
                </span>

            </div>

            ${
                searchResult
                    ? `
                        <span class="join-label">
                            Join
                        </span>
                    `
                    : ""
            }
        `;

        button.addEventListener(
            "click",
            () => {
                if (searchResult) {
                    openGroupSearchResult(group);
                } else {
                    openGroupChat(group);
                }
            }
        );

        return button;
    }

    async function openGroupSearchResult(group) {
        const {
            data: membership
        } = await db
            .from("group_members")
            .select("id")
            .eq("group_id", group.id)
            .eq("user_id", currentUser.id)
            .maybeSingle();

        if (membership) {
            openGroupChat(group);
            return;
        }

        showGroupJoinInfo(group);
    }

    function showGroupJoinInfo(group) {
        const join = confirm(
            `${group.name}\n\n@${group.username}\n\n` +
            `${group.bio || "No bio"}\n\n` +
            "Join this group?"
        );

        if (join) {
            joinPublicGroup(group);
        }
    }

    async function joinPublicGroup(group) {
        if (!group.is_public) {
            showToast(
                "This is a private group. Use an invite link."
            );

            return;
        }

        const {
            data,
            error
        } = await db
            .from("group_members")
            .insert({
                group_id: group.id,
                user_id: currentUser.id,
                role: "member"
            })
            .select()
            .maybeSingle();

        if (error) {
            console.error(error);

            /*
             * Direct insert is intentionally protected
             * by the secure database setup.
             * Use invite RPC if direct membership is blocked.
             */
            if (
                error.code === "42501" ||
                error.code === "PGRST301"
            ) {
                showToast(
                    "Please join using an invite link."
                );
            } else {
                showToast(error.message);
            }

            return;
        }

        if (data) {
            showToast("Joined group.");

            await loadGroups();

            openGroupChat(group);
        }
    }

    async function openGroupChat(group) {
        selectedGroup = group;
        selectedUser = null;
        selectedChannel = null;

        currentChatType = "group";

        $("#chatEmpty").style.display = "none";
        $("#activeChat").style.display = "flex";

        renderCommunityHeader(
            group,
            "group"
        );

        await loadGroupMessages(
            group.id
        );

        setupRealtime(
            "group",
            group.id
        );
    }

    function renderCommunityHeader(
        community,
        type
    ) {
        $("#chatName").textContent =
            community.name;

        $("#chatVerified").style.display =
            "none";

        $("#chatStatus").textContent =
            type === "group"
                ? "Group"
                : "Channel";

        const img = $("#chatAvatar");
        const initial =
            $("#chatAvatarInitial");

        if (community.avatar_url) {
            img.src =
                community.avatar_url;

            img.style.display =
                "block";

            initial.style.display =
                "none";
        } else {
            img.style.display =
                "none";

            initial.style.display =
                "block";

            initial.textContent =
                getInitial(
                    community.name
                );
        }

        $("#contactActions").style.display =
            "none";
    }

    /* =====================================================
       CHANNELS
    ===================================================== */

    async function loadChannels() {
        const list =
            $("#channelsList");

        if (!list) return;

        list.innerHTML = `
            <div class="loading-list">
                Loading channels...
            </div>
        `;

        const {
            data: memberships,
            error
        } = await db
            .from("channel_members")
            .select(
                "channel_id, user_id, role"
            )
            .eq(
                "user_id",
                currentUser.id
            );

        if (error) {
            console.error(error);

            list.innerHTML = `
                <div class="empty-list">
                    No channels yet.
                </div>
            `;

            return;
        }

        const ids =
            (memberships || [])
                .map(item => item.channel_id);

        if (!ids.length) {
            list.innerHTML = `
                <div class="empty-list">
                    No channels yet.
                </div>
            `;

            $("#channelCount").textContent =
                "0";

            return;
        }

        const {
            data: channels
        } = await db
            .from("channels")
            .select("*")
            .in("id", ids);

        list.innerHTML = "";

        (channels || []).forEach(channel => {
            list.appendChild(
                createChannelItem(
                    channel,
                    false
                )
            );
        });

        $("#channelCount").textContent =
            String(channels?.length || 0);
    }

    function createChannelItem(
        channel,
        searchResult = false
    ) {
        const button =
            document.createElement("button");

        button.type = "button";
        button.className = "chat-item";

        const avatar =
            channel.avatar_url
                ? `
                    <img
                        src="${escapeHTML(
                            channel.avatar_url
                        )}"
                        alt=""
                    >
                `
                : `
                    <span>
                        ${escapeHTML(
                            getInitial(
                                channel.name
                            )
                        )}
                    </span>
                `;

        button.innerHTML = `
            <div class="chat-avatar">
                ${avatar}
            </div>

            <div class="chat-item-info">

                <div class="chat-item-top">

                    <strong>
                        ${escapeHTML(
                            channel.name
                        )}
                    </strong>

                </div>

                <span>
                    @${escapeHTML(
                        channel.username
                    )}
                </span>

            </div>

            ${
                searchResult
                    ? `
                        <span class="join-label">
                            Join
                        </span>
                    `
                    : ""
            }
        `;

        button.addEventListener(
            "click",
            () => {
                if (searchResult) {
                    openChannelSearchResult(
                        channel
                    );
                } else {
                    openChannelChat(
                        channel
                    );
                }
            }
        );

        return button;
    }

    async function openChannelSearchResult(
        channel
    ) {
        const {
            data: membership
        } = await db
            .from("channel_members")
            .select("id")
            .eq(
                "channel_id",
                channel.id
            )
            .eq(
                "user_id",
                currentUser.id
            )
            .maybeSingle();

        if (membership) {
            openChannelChat(channel);
            return;
        }

        showChannelJoinInfo(channel);
    }

    function showChannelJoinInfo(channel) {
        const join = confirm(
            `${channel.name}\n\n@${channel.username}\n\n` +
            `${channel.bio || "No bio"}\n\n` +
            "Join this channel?"
        );

        if (join) {
            joinPublicChannel(channel);
        }
    }

    async function joinPublicChannel(channel) {
        if (!channel.is_public) {
            showToast(
                "This is a private channel. Use an invite link."
            );

            return;
        }

        const {
            error
        } = await db
            .from("channel_members")
            .insert({
                channel_id: channel.id,
                user_id: currentUser.id,
                role: "subscriber"
            });

        if (error) {
            console.error(error);

            showToast(
                error.message
            );

            return;
        }

        showToast("Joined channel.");

        await loadChannels();

        openChannelChat(channel);
    }

    async function openChannelChat(channel) {
        selectedChannel = channel;
        selectedUser = null;
        selectedGroup = null;

        currentChatType = "channel";

        $("#chatEmpty").style.display = "none";
        $("#activeChat").style.display = "flex";

        renderCommunityHeader(
            channel,
            "channel"
        );

        await loadChannelMessages(
            channel.id
        );

        setupRealtime(
            "channel",
            channel.id
        );
    }

    /* =====================================================
       GROUP MESSAGES
    ===================================================== */

    async function loadGroupMessages(groupId) {
        const messages =
            $("#messages");

        messages.innerHTML = "";

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

        const ids = [
            ...new Set(
                (data || []).map(
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
                    .select(
                        "id,full_name,username,avatar_url"
                    )
                    .in("id", ids);

            profiles =
                result.data || [];
        }

        const map = new Map(
            profiles.map(
                profile => [
                    profile.id,
                    profile
                ]
            )
        );

        (data || []).forEach(message => {
            messages.appendChild(
                createCommunityMessage(
                    message,
                    map.get(
                        message.sender_id
                    ),
                    "group"
                )
            );
        });

        scrollMessages();
    }

    function createCommunityMessage(
        message,
        profile,
        type
    ) {
        const wrapper =
            document.createElement(
                "div"
            );

        wrapper.className =
            "message-wrapper " +
            (
                message.sender_id ===
                currentUser.id
                    ? "own"
                    : "other"
            );

        let content =
            message.content || "";

        if (
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
                >
            `;
        }

        if (
            message.message_type === "sticker" &&
            message.sticker_url
        ) {
            content = `
                <img
                    class="message-sticker"
                    src="${escapeHTML(
                        message.sticker_url
                    )}"
                    alt="Sticker"
                >
            `;
        }

        if (message.deleted_at) {
            content = `
                <span class="deleted-message">
                    Message deleted
                </span>
            `;
        }

        wrapper.innerHTML = `
            <div class="message-bubble">

                ${
                    profile &&
                    message.sender_id !==
                    currentUser.id
                        ? `
                            <div class="message-sender">
                                ${escapeHTML(
                                    profile.full_name ||
                                    profile.username
                                )}
                            </div>
                        `
                        : ""
                }

                <div class="message-content">
                    ${escapeHTML(content)}
                </div>

                <div class="message-meta">
                    ${formatTime(
                        message.created_at
                    )}
                </div>

            </div>


            <div class="message-actions">

                <button
                    class="message-action save"
                    data-action="save-community"
                    title="Save"
                >
                    <i class="fa-solid fa-bookmark"></i>
                </button>

            </div>
        `;

        setupMessageSwipe(
            wrapper
        );

        const save =
            wrapper.querySelector(
                '[data-action="save-community"]'
            );

        if (save) {
            save.addEventListener(
                "click",
                () => {
                    saveMessage({
                        content:
                            message.content,
                        message_type:
                            message.message_type,
                        image_url:
                            message.image_url,
                        sticker_url:
                            message.sticker_url
                    });
                }
            );
        }

        return wrapper;
    }

    /* =====================================================
       CHANNEL MESSAGES
    ===================================================== */

    async function loadChannelMessages(
        channelId
    ) {
        const messages =
            $("#messages");

        messages.innerHTML = "";

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

        const ids = [
            ...new Set(
                (data || []).map(
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
                    .select(
                        "id,full_name,username,avatar_url"
                    )
                    .in("id", ids);

            profiles =
                result.data || [];
        }

        const map = new Map(
            profiles.map(
                profile => [
                    profile.id,
                    profile
                ]
            )
        );

        (data || []).forEach(message => {
            messages.appendChild(
                createCommunityMessage(
                    message,
                    map.get(
                        message.sender_id
                    ),
                    "channel"
                )
            );
        });

        scrollMessages();
    }

    /* =====================================================
       SCROLL
    ===================================================== */

    function scrollMessages() {
        const messages =
            $("#messages");

        if (!messages) return;

        setTimeout(() => {
            messages.scrollTop =
                messages.scrollHeight;
        }, 30);
    }

    /* =====================================================
       GROUP CREATE
    ===================================================== */

    async function createGroup(event) {
        event.preventDefault();

        const name =
            $("#groupName").value.trim();

        const username =
            $("#groupUsername").value
                .trim()
                .toLowerCase();

        const bio =
            $("#groupBio").value.trim();

        const isPublic =
            getPrivacyValue(
                "groupPrivacy"
            );

        if (!name || !username) {
            showToast(
                "Group name and username are required."
            );

            return;
        }

        const {
            data: groupId,
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
            showToast(error.message);
            return;
        }

        const id =
            typeof groupId === "object"
                ? groupId?.[0]?.create_group
                : groupId;

        if (!id) {
            showToast(
                "Group was not created."
            );

            return;
        }

        await db
            .from("groups")
            .update({
                is_public: isPublic
            })
            .eq("id", id)
            .eq(
                "owner_id",
                currentUser.id
            );

        if (selectedGroupAvatarFile) {
            await uploadCommunityAvatar(
                "group",
                id,
                selectedGroupAvatarFile
            );
        }

        showToast(
            "Group created."
        );

        selectedGroupAvatarFile =
            null;

        $("#groupForm").reset();

        $("#groupAvatarPreview").innerHTML =
            `<i class="fa-solid fa-users"></i>`;

        closeModal(
            "createGroupModal"
        );

        await loadGroups();
    }

    /* =====================================================
       CHANNEL CREATE
    ===================================================== */

    async function createChannel(event) {
        event.preventDefault();

        const name =
            $("#channelName").value.trim();

        const username =
            $("#channelUsername").value
                .trim()
                .toLowerCase();

        const bio =
            $("#channelBio").value.trim();

        const isPublic =
            getPrivacyValue(
                "channelPrivacy"
            );

        if (!name || !username) {
            showToast(
                "Channel name and username are required."
            );

            return;
        }

        const {
            data: channelId,
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
            showToast(error.message);
            return;
        }

        const id =
            typeof channelId === "object"
                ? channelId?.[0]?.create_channel
                : channelId;

        if (!id) {
            showToast(
                "Channel was not created."
            );

            return;
        }

        await db
            .from("channels")
            .update({
                is_public: isPublic
            })
            .eq("id", id)
            .eq(
                "owner_id",
                currentUser.id
            );

        if (selectedChannelAvatarFile) {
            await uploadCommunityAvatar(
                "channel",
                id,
                selectedChannelAvatarFile
            );
        }

        showToast(
            "Channel created."
        );

        selectedChannelAvatarFile =
            null;

        $("#channelForm").reset();

        $("#channelAvatarPreview").innerHTML =
            `<i class="fa-solid fa-bullhorn"></i>`;

        closeModal(
            "createChannelModal"
        );

        await loadChannels();
    }

    /* =====================================================
       COMMUNITY AVATAR UPLOAD
    ===================================================== */

    async function uploadCommunityAvatar(
        type,
        id,
        file
    ) {
        if (!isValidImage(file)) {
            return null;
        }

        const bucket =
            type === "group"
                ? "group-avatars"
                : "channel-avatars";

        const path =
            `${id}/${Date.now()}_${file.name}`;

        const {
            error: uploadError
        } = await db.storage
            .from(bucket)
            .upload(
                path,
                file,
                {
                    upsert: true
                }
            );

        if (uploadError) {
            console.error(
                uploadError
            );

            showToast(
                uploadError.message
            );

            return null;
        }

        const {
            data: publicData
        } = db.storage
            .from(bucket)
            .getPublicUrl(path);

        const avatarUrl =
            publicData.publicUrl;

        if (type === "group") {
            await db
                .from("groups")
                .update({
                    avatar_url:
                        avatarUrl
                })
                .eq(
                    "id",
                    id
                )
                .eq(
                    "owner_id",
                    currentUser.id
                );
        } else {
            await db
                .from("channels")
                .update({
                    avatar_url:
                        avatarUrl
                })
                .eq(
                    "id",
                    id
                )
                .eq(
                    "owner_id",
                    currentUser.id
                );
        }

        return avatarUrl;
    }

    /* =====================================================
       PROFILE AVATAR
    ===================================================== */

    async function uploadProfileAvatar(
        file
    ) {
        if (!isValidImage(file)) {
            return null;
        }

        const path =
            `${currentUser.id}/${Date.now()}_${file.name}`;

        const {
            error
        } = await db.storage
            .from("avatars")
            .upload(
                path,
                file,
                {
                    upsert: true
                }
            );

        if (error) {
            console.error(error);
            showToast(error.message);
            return null;
        }

        const {
            data
        } = db.storage
            .from("avatars")
            .getPublicUrl(path);

        return data.publicUrl;
    }

    /* =====================================================
       PROFILE UPDATE
    ===================================================== */

    async function updateProfile(event) {
        event.preventDefault();

        const fullName =
            $("#profileFullName")
                .value
                .trim();

        const username =
            $("#profileUsername")
                .value
                .trim()
                .toLowerCase();

        const bio =
            $("#profileBio")
                .value
                .trim();

        const update = {
            full_name: fullName,
            username,
            bio
        };

        if (selectedProfileAvatarFile) {
            const avatarUrl =
                await uploadProfileAvatar(
                    selectedProfileAvatarFile
                );

            if (avatarUrl) {
                update.avatar_url =
                    avatarUrl;
            }
        }

        const {
            error
        } = await db
            .from("profiles")
            .update(update)
            .eq(
                "id",
                currentUser.id
            );

        if (error) {
            console.error(error);
            showToast(error.message);
            return;
        }

        showToast(
            "Profile updated."
        );

        selectedProfileAvatarFile =
            null;

        await loadMyProfile();

        closeModal(
            "profileModal"
        );
    }

    /* =====================================================
       USER PROFILE POPUP
    ===================================================== */

    async function openUserProfile(
        profile
    ) {
        currentProfileTarget =
            profile;

        const img =
            $("#userProfileAvatar");

        const initial =
            $("#userProfileAvatarInitial");

        if (profile.avatar_url) {
            img.src =
                profile.avatar_url;

            img.style.display =
                "block";

            initial.style.display =
                "none";
        } else {
            img.style.display =
                "none";

            initial.style.display =
                "block";

            initial.textContent =
                getInitial(
                    profile.full_name
                );
        }

        $("#userProfileName")
            .textContent =
            profile.full_name ||
            profile.username;

        $("#userProfileUsername")
            .textContent =
            "@" + profile.username;

        $("#userProfileBio")
            .textContent =
            profile.bio ||
            "No bio";

        $("#userProfileVerified")
            .style.display =
            profile.is_verified
                ? "inline-flex"
                : "none";

        $("#userProfileStatus")
            .textContent =
            profile.show_online === false
                ? "Offline"
                : "Online status hidden";

        $("#userProfileMenu")
            .style.display =
            "none";

        openModal(
            "userProfileModal"
        );

        setTimeout(
            fixProfilePopupAvatar,
            50
        );
    }

    /* =====================================================
       NICKNAME
    ===================================================== */

    async function editNickname() {
        if (!currentProfileTarget) {
            return;
        }

        currentNicknameTarget =
            currentProfileTarget.id;

        const {
            data
        } = await db
            .from("contact_nicknames")
            .select("*")
            .eq(
                "user_id",
                currentUser.id
            )
            .eq(
                "contact_id",
                currentNicknameTarget
            )
            .maybeSingle();

        $("#nicknameInput").value =
            data?.nickname || "";

        closeProfileMenu();

        openModal(
            "nicknameModal"
        );
    }

    async function saveNickname() {
        if (!currentNicknameTarget) {
            return;
        }

        const nickname =
            $("#nicknameInput")
                .value
                .trim();

        if (!nickname) {
            showToast(
                "Enter a nickname."
            );

            return;
        }

        const {
            error
        } = await db
            .from("contact_nicknames")
            .upsert(
                {
                    user_id:
                        currentUser.id,
                    contact_id:
                        currentNicknameTarget,
                    nickname,
                    updated_at:
                        new Date().toISOString()
                },
                {
                    onConflict:
                        "user_id,contact_id"
                }
            );

        if (error) {
            console.error(error);
            showToast(error.message);
            return;
        }

        showToast(
            "Nickname saved."
        );

        closeModal(
            "nicknameModal"
        );
    }

    async function deleteNickname() {
        if (!currentNicknameTarget) {
            return;
        }

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
                currentNicknameTarget
            );

        if (error) {
            console.error(error);
            showToast(error.message);
            return;
        }

        showToast(
            "Nickname deleted."
        );

        closeModal(
            "nicknameModal"
        );
    }

    function closeProfileMenu() {
        const menu =
            $("#userProfileMenu");

        if (menu) {
            menu.style.display =
                "none";
        }
    }

    /* =====================================================
       BLOCK
    ===================================================== */

    async function blockUser() {
        if (!currentProfileTarget) {
            return;
        }

        const {
            error
        } = await db.rpc(
            "block_user",
            {
                p_target_user_id:
                    currentProfileTarget.id
            }
        );

        if (error) {
            console.error(error);

            showToast(
                error.message ||
                "Block failed."
            );

            return;
        }

        showToast(
            "User blocked."
        );

        closeProfileMenu();
        closeModal(
            "userProfileModal"
        );
    }

    /* =====================================================
       REPORT
    ===================================================== */

    function openReport() {
        if (!currentProfileTarget) {
            return;
        }

        closeProfileMenu();

        $("#reportDescription").value =
            "";

        openModal(
            "reportModal"
        );
    }

    async function submitReport() {
        if (!currentProfileTarget) {
            return;
        }

        const reason =
            document.querySelector(
                'input[name="reportReason"]:checked'
            )?.value || "other";

        const description =
            $("#reportDescription")
                .value
                .trim();

        const {
            error
        } = await db
            .from("reports")
            .insert({
                reporter_id:
                    currentUser.id,
                reported_user_id:
                    currentProfileTarget.id,
                reason,
                description
            });

        if (error) {
            console.error(error);
            showToast(error.message);
            return;
        }

        showToast(
            "Report submitted."
        );

        closeModal(
            "reportModal"
        );
    }

    /* =====================================================
       OWNER VERIFIED
    ===================================================== */

    let ownerVerifiedTarget =
        null;

    async function searchOwnerVerified() {
        const username =
            $("#ownerVerifiedUsername")
                .value
                .trim()
                .replace(/^@/, "")
                .toLowerCase();

        if (!username) return;

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
            $("#ownerVerifiedResult")
                .innerHTML = `
                    <div class="empty-list">
                        User not found.
                    </div>
                `;

            return;
        }

        ownerVerifiedTarget =
            data;

        $("#ownerVerifiedResult")
            .innerHTML = `
                <div class="owner-result-card">

                    <strong>
                        ${escapeHTML(
                            data.full_name
                        )}
                    </strong>

                    <span>
                        @${escapeHTML(
                            data.username
                        )}
                    </span>

                    <button
                        id="ownerVerifiedActionBtn"
                        class="primary-btn"
                        type="button"
                    >
                        ${
                            data.is_verified
                                ? "Remove Verified"
                                : "Give Verified"
                        }
                    </button>

                </div>
            `;

        $("#ownerVerifiedActionBtn")
            .addEventListener(
                "click",
                toggleOwnerVerified
            );
    }

    async function toggleOwnerVerified() {
        if (!ownerVerifiedTarget) {
            return;
        }

        const verified =
            ownerVerifiedTarget.is_verified === true;

        const {
            error
        } = await db.rpc(
            "owner_set_verified",
            {
                p_user_id:
                    ownerVerifiedTarget.id,
                p_action:
                    verified
                        ? "remove"
                        : "give"
            }
        );

        if (error) {
            console.error(error);
            showToast(error.message);
            return;
        }

        showToast(
            verified
                ? "Verified removed."
                : "Verified added."
        );

        searchOwnerVerified();
    }

    /* =====================================================
       OWNER ADMINS
    ===================================================== */

    let ownerAdminTarget =
        null;

    async function searchOwnerAdmin() {
        const username =
            $("#ownerAdminUsername")
                .value
                .trim()
                .replace(/^@/, "")
                .toLowerCase();

        if (!username) return;

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
            $("#ownerAdminResult")
                .innerHTML = `
                    <div class="empty-list">
                        User not found.
                    </div>
                `;

            return;
        }

        ownerAdminTarget =
            data;

        $("#ownerAdminResult")
            .innerHTML = `
                <div class="owner-result-card">

                    <strong>
                        ${escapeHTML(
                            data.full_name
                        )}
                    </strong>

                    <span>
                        @${escapeHTML(
                            data.username
                        )}
                    </span>

                    <button
                        id="ownerAdminActionBtn"
                        class="primary-btn"
                        type="button"
                    >
                        ${
                            data.role === "admin"
                                ? "Remove Admin"
                                : "Make Admin"
                        }
                    </button>

                </div>
            `;

        $("#ownerAdminActionBtn")
            .addEventListener(
                "click",
                toggleOwnerAdmin
            );

        loadOwnerAdmins();
    }

    async function toggleOwnerAdmin() {
        if (!ownerAdminTarget) {
            return;
        }

        const action =
            ownerAdminTarget.role === "admin"
                ? "remove"
                : "add";

        const {
            error
        } = await db.rpc(
            "owner_set_admin",
            {
                p_user_id:
                    ownerAdminTarget.id,
                p_action:
                    action
            }
        );

        if (error) {
            console.error(error);
            showToast(error.message);
            return;
        }

        showToast(
            action === "add"
                ? "Admin added."
                : "Admin removed."
        );

        searchOwnerAdmin();
        loadOwnerAdmins();
    }

    async function loadOwnerAdmins() {
        const list =
            $("#ownerAdminList");

        if (!list) return;

        const {
            data
        } = await db
            .from("profiles")
            .select(
                "id,username,full_name,role"
            )
            .eq(
                "role",
                "admin"
            )
            .order(
                "username"
            );

        list.innerHTML = "";

        (data || []).forEach(admin => {
            const div =
                document.createElement(
                    "div"
                );

            div.className =
                "owner-admin-item";

            div.innerHTML = `
                <div>
                    <strong>
                        ${escapeHTML(
                            admin.full_name
                        )}
                    </strong>

                    <span>
                        @${escapeHTML(
                            admin.username
                        )}
                    </span>
                </div>
            `;

            list.appendChild(div);
        });
    }

    /* =====================================================
       OWNER REPORTS
    ===================================================== */

    async function loadOwnerReports() {
        const list =
            $("#ownerReportsList");

        if (!list) return;

        const {
            data,
            error
        } = await db
            .from("reports")
            .select("*")
            .eq(
                "status",
                "pending"
            )
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

        const ids = [
            ...new Set(
                (data || []).flatMap(
                    report => [
                        report.reporter_id,
                        report.reported_user_id
                    ]
                )
            )
        ];

        let profiles = [];

        if (ids.length) {
            const result =
                await db
                    .from("profiles")
                    .select(
                        "id,username,full_name"
                    )
                    .in("id", ids);

            profiles =
                result.data || [];
        }

        const map = new Map(
            profiles.map(
                profile => [
                    profile.id,
                    profile
                ]
            )
        );

        list.innerHTML = "";

        if (!data?.length) {
            list.innerHTML = `
                <div class="empty-list">
                    No pending reports.
                </div>
            `;

            return;
        }

        data.forEach(report => {
            const reporter =
                map.get(
                    report.reporter_id
                );

            const reported =
                map.get(
                    report.reported_user_id
                );

            const div =
                document.createElement(
                    "div"
                );

            div.className =
                "owner-report-card";

            div.innerHTML = `
                <strong>
                    Report:
                    @${escapeHTML(
                        reported?.username ||
                        "unknown"
                    )}
                </strong>

                <p>
                    Reason:
                    ${escapeHTML(
                        report.reason
                    )}
                </p>

                <p>
                    ${escapeHTML(
                        report.description ||
                        ""
                    )}
                </p>

                <small>
                    From @${escapeHTML(
                        reporter?.username ||
                        "unknown"
                    )}
                </small>

                <div class="report-actions">

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

                </div>
            `;

            list.appendChild(div);
        });

        list.querySelectorAll(
            "[data-report-action]"
        ).forEach(button => {
            button.addEventListener(
                "click",
                () => updateReportStatus(
                    button.dataset.reportId,
                    button.dataset.reportAction
                )
            );
        });
    }

    async function updateReportStatus(
        id,
        status
    ) {
        const {
            error
        } = await db
            .from("reports")
            .update({
                status
            })
            .eq(
                "id",
                id
            );

        if (error) {
            console.error(error);
            showToast(error.message);
            return;
        }

        showToast(
            "Report updated."
        );

        loadOwnerReports();
    }

    /* =====================================================
       SAVED CHAT
    ===================================================== */

    async function openSavedChat() {
        currentChatType =
            "saved";

        selectedUser = null;
        selectedGroup = null;
        selectedChannel = null;

        $("#chatEmpty").style.display =
            "none";

        $("#activeChat").style.display =
            "flex";

        $("#chatName").textContent =
            "Saved Messages";

        $("#chatStatus").textContent =
            "Your private saved messages";

        $("#chatVerified").style.display =
            "none";

        $("#contactActions").style.display =
            "none";

        const img =
            $("#chatAvatar");

        const initial =
            $("#chatAvatarInitial");

        img.style.display = "none";
        initial.style.display = "block";
        initial.textContent = "🔖";

        const messages =
            $("#messages");

        messages.innerHTML = "";

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

        (data || []).forEach(item => {
            const wrapper =
                document.createElement(
                    "div"
                );

            wrapper.className =
                "message-wrapper own";

            wrapper.innerHTML = `
                <div class="message-bubble">

                    <div class="message-content">
                        ${escapeHTML(
                            item.content ||
                            "Saved media"
                        )}
                    </div>

                    <div class="message-meta">
                        ${formatTime(
                            item.created_at
                        )}
                    </div>

                </div>
            `;

            messages.appendChild(
                wrapper
            );
        });

        scrollMessages();
    }

    /* =====================================================
       GROUP / CHANNEL INFO
    ===================================================== */

    async function openGroupInfo() {
        if (!selectedGroup) return;

        $("#groupInfoName")
            .textContent =
            selectedGroup.name;

        $("#groupInfoUsername")
            .textContent =
            "@" + selectedGroup.username;

        $("#groupInfoBio")
            .textContent =
            selectedGroup.bio ||
            "No bio";

        $("#groupInfoPrivacy")
            .textContent =
            selectedGroup.is_public
                ? "🌍 Public"
                : "🔒 Private";

        openModal(
            "groupInfoModal"
        );
    }

    async function openChannelInfo() {
        if (!selectedChannel) return;

        $("#channelInfoName")
            .textContent =
            selectedChannel.name;

        $("#channelInfoUsername")
            .textContent =
            "@" + selectedChannel.username;

        $("#channelInfoBio")
            .textContent =
            selectedChannel.bio ||
            "No bio";

        $("#channelInfoPrivacy")
            .textContent =
            selectedChannel.is_public
                ? "🌍 Public"
                : "🔒 Private";

        openModal(
            "channelInfoModal"
        );
    }

    /* =====================================================
       INVITES
    ===================================================== */

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
            console.error(error);
            showToast(error.message);
            return;
        }

        showToast(
            "Invite code: " + data
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
            console.error(error);
            showToast(error.message);
            return;
        }

        showToast(
            "Invite code: " + data
        );
    }

    async function joinGroupByInvite() {
        const code =
            $("#groupInviteInput")
                .value
                .trim();

        if (!code) return;

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
            showToast(error.message);
            return;
        }

        showToast(
            "Joined group."
        );

        closeModal(
            "joinGroupModal"
        );

        await loadGroups();
    }

    async function joinChannelByInvite() {
        const code =
            $("#channelInviteInput")
                .value
                .trim();

        if (!code) return;

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
            showToast(error.message);
            return;
        }

        showToast(
            "Joined channel."
        );

        closeModal(
            "joinChannelModal"
        );

        await loadChannels();
    }

    /* =====================================================
       LEAVE
    ===================================================== */

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
            console.error(error);
            showToast(error.message);
            return;
        }

        showToast(
            "Left group."
        );

        closeModal(
            "groupInfoModal"
        );

        await loadGroups();

        showEmptyChat();
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
            console.error(error);
            showToast(error.message);
            return;
        }

        showToast(
            "Left channel."
        );

        closeModal(
            "channelInfoModal"
        );

        await loadChannels();

        showEmptyChat();
    }

    function showEmptyChat() {
        currentChatType = null;
        selectedUser = null;
        selectedGroup = null;
        selectedChannel = null;

        $("#activeChat").style.display =
            "none";

        $("#chatEmpty").style.display =
            "flex";
    }

    /* =====================================================
       PRIVACY
    ===================================================== */

    async function loadPrivacy() {
        $("#showOnlineToggle").checked =
            currentProfile.show_online !== false;

        $("#showLastSeenToggle").checked =
            currentProfile.show_last_seen !== false;
    }

    async function savePrivacy() {
        const showOnline =
            $("#showOnlineToggle").checked;

        const showLastSeen =
            $("#showLastSeenToggle").checked;

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
            console.error(error);
            showToast(error.message);
            return;
        }

        currentProfile.show_online =
            showOnline;

        currentProfile.show_last_seen =
            showLastSeen;

        showToast(
            "Privacy settings saved."
        );
    }

    /* =====================================================
       LANGUAGE
    ===================================================== */

    function applyLanguage(language) {
        currentLanguage =
            language;

        localStorage.setItem(
            "megchatbox_language",
            language
        );

        $$(".language-option")
            .forEach(option => {
                option.classList.toggle(
                    "selected",
                    option.dataset.language ===
                        language
                );
            });
    }

    /* =====================================================
       REALTIME
    ===================================================== */

    function setupRealtime(
        type,
        id
    ) {
        if (realtimeChannel) {
            db.removeChannel(
                realtimeChannel
            );
        }

        let table;
        let filter;

        if (type === "user") {
            table = "messages";

            filter = undefined;
        }

        if (type === "group") {
            table = "group_messages";

            filter =
                `group_id=eq.${id}`;
        }

        if (type === "channel") {
            table = "channel_messages";

            filter =
                `channel_id=eq.${id}`;
        }

        realtimeChannel =
            db.channel(
                `megchatbox-${type}-${id}`
            );

        realtimeChannel.on(
            "postgres_changes",
            {
                event: "*",
                schema: "public",
                table,
                ...(filter
                    ? { filter }
                    : {})
            },
            async () => {

                if (
                    currentChatType ===
                    "user" &&
                    selectedUser
                ) {
                    await loadDirectMessages(
                        selectedUser.id
                    );
                }

                if (
                    currentChatType ===
                    "group" &&
                    selectedGroup
                ) {
                    await loadGroupMessages(
                        selectedGroup.id
                    );
                }

                if (
                    currentChatType ===
                    "channel" &&
                    selectedChannel
                ) {
                    await loadChannelMessages(
                        selectedChannel.id
                    );
                }
            }
        );

        realtimeChannel.subscribe();
    }

    /* =====================================================
       EVENT SETUP
    ===================================================== */

    function setupEvents() {

        /* TABS */

        $$(".sidebar-tab")
            .forEach(button => {
                button.addEventListener(
                    "click",
                    () => switchTab(
                        button.dataset.tab
                    )
                );
            });


        /* SETTINGS */

        $("#settingsBtn")
            ?.addEventListener(
                "click",
                () => openModal(
                    "settingsModal"
                )
            );


        /* LOGOUT */

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


        /* PROFILE */

        $("#profileSettingsBtn")
            ?.addEventListener(
                "click",
                () => {
                    closeModal(
                        "settingsModal"
                    );

                    $("#profileFullName")
                        .value =
                        currentProfile.full_name ||
                        "";

                    $("#profileUsername")
                        .value =
                        currentProfile.username ||
                        "";

                    $("#profileBio")
                        .value =
                        currentProfile.bio ||
                        "";

                    openModal(
                        "profileModal"
                    );
                }
            );

        $("#profileForm")
            ?.addEventListener(
                "submit",
                updateProfile
            );


        /* PRIVACY */

        $("#privacySettingsBtn")
            ?.addEventListener(
                "click",
                () => {
                    closeModal(
                        "settingsModal"
                    );

                    loadPrivacy();

                    openModal(
                        "privacyModal"
                    );
                }
            );

        $("#showOnlineToggle")
            ?.addEventListener(
                "change",
                savePrivacy
            );

        $("#showLastSeenToggle")
            ?.addEventListener(
                "change",
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
                }
            );


        $$(".appearance-option[data-theme]")
            .forEach(button => {
                button.addEventListener(
                    "click",
                    () => applyTheme(
                        button.dataset.theme
                    )
                );
            });


        $$(".appearance-option[data-density]")
            .forEach(button => {
                button.addEventListener(
                    "click",
                    () => applyDensity(
                        button.dataset.density
                    )
                );
            });


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


        $$(".language-option")
            .forEach(button => {
                button.addEventListener(
                    "click",
                    () => applyLanguage(
                        button.dataset.language
                    )
                );
            });


        /* SAVED */

        $("#savedMessagesBtn")
            ?.addEventListener(
                "click",
                () => {
                    closeModal(
                        "settingsModal"
                    );

                    openSavedChat();
                }
            );

        $("#savedMessagesChat")
            ?.addEventListener(
                "click",
                openSavedChat
            );


        /* UPDATES */

        $("#updatesSettingsBtn")
            ?.addEventListener(
                "click",
                () => {
                    closeModal(
                        "settingsModal"
                    );

                    openModal(
                        "updatesModal"
                    );
                }
            );


        /* GROUP CREATE */

        $("#createGroupBtn")
            ?.addEventListener(
                "click",
                () => openModal(
                    "createGroupModal"
                )
            );

        $("#groupForm")
            ?.addEventListener(
                "submit",
                createGroup
            );


        /* CHANNEL CREATE */

        $("#createChannelBtn")
            ?.addEventListener(
                "click",
                () => openModal(
                    "createChannelModal"
                )
            );

        $("#channelForm")
            ?.addEventListener(
                "submit",
                createChannel
            );


        /* GROUP AVATAR */

        $("#groupAvatarInput")
            ?.addEventListener(
                "change",
                event => {
                    const file =
                        event.target.files?.[0];

                    if (!isValidImage(file)) {
                        return;
                    }

                    selectedGroupAvatarFile =
                        file;

                    setImagePreview(
                        $("#groupAvatarPreview"),
                        file,
                        `<i class="fa-solid fa-users"></i>`
                    );

                    $("#groupAvatarText")
                        .textContent =
                        "Change photo";
                }
            );


        /* CHANNEL AVATAR */

        $("#channelAvatarInput")
            ?.addEventListener(
                "change",
                event => {
                    const file =
                        event.target.files?.[0];

                    if (!isValidImage(file)) {
                        return;
                    }

                    selectedChannelAvatarFile =
                        file;

                    setImagePreview(
                        $("#channelAvatarPreview"),
                        file,
                        `<i class="fa-solid fa-bullhorn"></i>`
                    );

                    $("#channelAvatarText")
                        .textContent =
                        "Change photo";
                }
            );


        /* PROFILE AVATAR */

        $("#profileAvatarInput")
            ?.addEventListener(
                "change",
                event => {
                    const file =
                        event.target.files?.[0];

                    if (!isValidImage(file)) {
                        return;
                    }

                    selectedProfileAvatarFile =
                        file;

                    setImagePreview(
                        $("#profileAvatarPreview"),
                        file,
                        `<i class="fa-solid fa-user"></i>`
                    );
                }
            );


        /* JOIN GROUP */

        $("#joinGroupOpenBtn")
            ?.addEventListener(
                "click",
                () => openModal(
                    "joinGroupModal"
                )
            );

        $("#joinGroupBtn")
            ?.addEventListener(
                "click",
                joinGroupByInvite
            );


        /* JOIN CHANNEL */

        $("#joinChannelOpenBtn")
            ?.addEventListener(
                "click",
                () => openModal(
                    "joinChannelModal"
                )
            );

        $("#joinChannelBtn")
            ?.addEventListener(
                "click",
                joinChannelByInvite
            );


        /* CONTACT REQUEST */

        $("#addContactBtn")
            ?.addEventListener(
                "click",
                sendContactRequest
            );

        $("#acceptContactBtn")
            ?.addEventListener(
                "click",
                acceptContactRequest
            );

        $("#declineContactBtn")
            ?.addEventListener(
                "click",
                declineContactRequest
            );


        /* CHAT HEADER PROFILE */

        $("#chatAvatarButton")
            ?.addEventListener(
                "click",
                () => {

                    if (
                        currentChatType ===
                        "user" &&
                        selectedUser
                    ) {
                        openUserProfile(
                            selectedUser
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


        /* CHAT MORE */

        $("#chatMoreBtn")
            ?.addEventListener(
                "click",
                () => {

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


        /* MESSAGE FORM */

        $("#messageForm")
            ?.addEventListener(
                "submit",
                sendMessage
            );


        /* EMOJI */

        $("#emojiBtn")
            ?.addEventListener(
                "click",
                () => {

                    const panel =
                        $("#emojiPanel");

                    panel.style.display =
                        panel.style.display ===
                        "none"
                            ? "flex"
                            : "none";
                }
            );


        $$("#emojiPanel button")
            .forEach(button => {
                button.addEventListener(
                    "click",
                    () => {

                        const input =
                            $("#messageInput");

                        input.value +=
                            button.textContent;

                        input.focus();
                    }
                );
            });


        /* IMAGE */

        $("#imageBtn")
            ?.addEventListener(
                "click",
                () =>
                    $("#imageInput")?.click()
            );


        /* PROFILE POPUP 3 DOT */

        $("#userProfileMenuBtn")
            ?.addEventListener(
                "click",
                event => {

                    event.stopPropagation();

                    const menu =
                        $("#userProfileMenu");

                    menu.style.display =
                        menu.style.display ===
                        "none"
                            ? "block"
                            : "none";
                }
            );


        $("#editNicknameBtn")
            ?.addEventListener(
                "click",
                editNickname
            );


        $("#saveNicknameBtn")
            ?.addEventListener(
                "click",
                saveNickname
            );


        $("#removeNicknameBtnModal")
            ?.addEventListener(
                "click",
                deleteNickname
            );


        $("#blockUserBtn")
            ?.addEventListener(
                "click",
                blockUser
            );


        $("#reportUserBtn")
            ?.addEventListener(
                "click",
                openReport
            );


        $("#submitReportBtn")
            ?.addEventListener(
                "click",
                submitReport
            );


        /* OWNER */

        $("#ownerPanelButton")
            ?.addEventListener(
                "click",
                () => {

                    closeModal(
                        "settingsModal"
                    );

                    openModal(
                        "ownerModal"
                    );

                    loadOwnerReports();
                    loadOwnerAdmins();
                }
            );


        $("#ownerVerifiedSearchBtn")
            ?.addEventListener(
                "click",
                searchOwnerVerified
            );


        $("#ownerAdminSearchBtn")
            ?.addEventListener(
                "click",
                searchOwnerAdmin
            );


        $$(".owner-tab")
            .forEach(button => {

                button.addEventListener(
                    "click",
                    () => {

                        $$(".owner-tab")
                            .forEach(tab =>
                                tab.classList.remove(
                                    "active"
                                )
                            );

                        button.classList.add(
                            "active"
                        );

                        const target =
                            button.dataset.ownerTab;

                        $$(".owner-panel-section")
                            .forEach(section => {
                                section.style.display =
                                    "none";
                            });

                        const panel =
                            document.getElementById(
                                `owner${
                                    target
                                        .charAt(0)
                                        .toUpperCase()
                                    }${
                                    target.slice(1)
                                }Panel`
                            );

                        if (panel) {
                            panel.style.display =
                                "block";
                        }

                        if (
                            target ===
                            "reports"
                        ) {
                            loadOwnerReports();
                        }

                        if (
                            target ===
                            "admins"
                        ) {
                            loadOwnerAdmins();
                        }
                    }
                );

            });


        /* GROUP INFO */

        $("#groupInviteBtn")
            ?.addEventListener(
                "click",
                createGroupInvite
            );

        $("#groupMembersBtn")
            ?.addEventListener(
                "click",
                () => showGroupMembers()
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
                () => showChannelMembers()
            );

        $("#leaveChannelBtn")
            ?.addEventListener(
                "click",
                leaveChannel
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


        $("#confirmDeleteAccountBtn")
            ?.addEventListener(
                "click",
                deleteAccount
            );


        /* SEARCH */

        setupSearch();


        /* UNIVERSAL CLOSE */

        document.addEventListener(
            "click",
            event => {

                const closeButton =
                    event.target.closest(
                        "[data-close-modal]"
                    );

                if (closeButton) {
                    closeModal(
                        closeButton.dataset
                            .closeModal
                    );

                    return;
                }

                if (
                    event.target.classList.contains(
                        "modal"
                    )
                ) {
                    closeModal(
                        event.target.id
                    );
                }

                if (
                    !event.target.closest(
                        ".profile-popup-menu-wrapper"
                    )
                ) {
                    closeProfileMenu();
                }
            }
        );


        /* ESC */

        document.addEventListener(
            "keydown",
            event => {

                if (event.key === "Escape") {
                    closeAllModals();
                    closeProfileMenu();
                }

            }
        );

    }

    /* =====================================================
       MEMBERS
    ===================================================== */

    async function showGroupMembers() {
        if (!selectedGroup) return;

        $("#membersTitle")
            .textContent =
            "Group Members";

        const {
            data
        } = await db
            .from("group_members")
            .select(
                "user_id,role"
            )
            .eq(
                "group_id",
                selectedGroup.id
            );

        renderMembers(
            data || []
        );
    }

    async function showChannelMembers() {
        if (!selectedChannel) return;

        $("#membersTitle")
            .textContent =
            "Channel Members";

        const {
            data
        } = await db
            .from("channel_members")
            .select(
                "user_id,role"
            )
            .eq(
                "channel_id",
                selectedChannel.id
            );

        renderMembers(
            data || []
        );
    }

    async function renderMembers(
        members
    ) {
        const list =
            $("#membersList");

        list.innerHTML =
            "<div>Loading...</div>";

        const ids =
            members.map(
                member =>
                    member.user_id
            );

        if (!ids.length) {
            list.innerHTML =
                "<div class='empty-list'>No members.</div>";

            openModal(
                "membersModal"
            );

            return;
        }

        const {
            data: profiles
        } = await db
            .from("profiles")
            .select(
                "id,full_name,username,avatar_url,is_verified"
            )
            .in(
                "id",
                ids
            );

        list.innerHTML = "";

        (profiles || []).forEach(
            profile => {

                const div =
                    document.createElement(
                        "div"
                    );

                div.className =
                    "member-item";

                div.innerHTML = `
                    <div class="chat-avatar">

                        ${
                            profile.avatar_url
                                ? `
                                    <img
                                        src="${escapeHTML(
                                            profile.avatar_url
                                        )}"
                                        alt=""
                                    >
                                `
                                : `
                                    <span>
                                        ${escapeHTML(
                                            getInitial(
                                                profile.full_name
                                            )
                                        )}
                                    </span>
                                `
                        }

                    </div>

                    <div>

                        <strong>
                            ${escapeHTML(
                                profile.full_name
                            )}
                        </strong>

                        ${
                            profile.is_verified
                                ? `<span class="verified-badge">✓</span>`
                                : ""
                        }

                        <small>
                            @${escapeHTML(
                                profile.username
                            )}
                        </small>

                    </div>
                `;

                div.addEventListener(
                    "click",
                    () =>
                        openUserProfile(
                            profile
                        )
                );

                list.appendChild(
                    div
                );
            }
        );

        openModal(
            "membersModal"
        );
    }

    /* =====================================================
       DELETE ACCOUNT
    ===================================================== */

    async function deleteAccount() {
        showToast(
            "Account deletion must be completed through your authentication setup."
        );
    }

    /* =====================================================
       LOGOUT
    ===================================================== */

    async function logout() {
        if (realtimeChannel) {
            await db.removeChannel(
                realtimeChannel
            );

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

    /* =====================================================
       INITIALIZE
    ===================================================== */

    async function init() {

        applyTheme(
            currentTheme
        );

        applyDensity(
            currentDensity
        );

        applyLanguage(
            currentLanguage
        );

        const sessionOk =
            await loadSession();

        if (!sessionOk) return;

        const profileOk =
            await loadMyProfile();

        if (!profileOk) return;

        setupEvents();

        await loadContacts();

        fixProfilePopupAvatar();

        console.log(
            "MegChatBox dashboard loaded."
        );
    }

    init();

})();
