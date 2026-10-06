document.addEventListener("DOMContentLoaded", async () => {

    "use strict";


    // =========================================================
    // STATE
    // =========================================================

    const state = {
        user: null,
        profile: null,
        selectedUser: null,
        selectedContact: null,
        currentTab: "chats",
        contacts: [],
        chats: [],
        searchTimer: null
    };


    // =========================================================
    // HELPERS
    // =========================================================

    const $ = id => document.getElementById(id);

    function escapeHtml(value = "") {

        return String(value)
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }


    function initials(name = "?") {

        const parts = name
            .trim()
            .split(/\s+/)
            .filter(Boolean);

        if (!parts.length) return "?";

        return parts
            .slice(0, 2)
            .map(x => x[0].toUpperCase())
            .join("");
    }


    function avatarHtml(profile, className = "avatar") {

        if (profile?.avatar_url) {

            return `
                <div class="${className}">
                    <img
                        src="${escapeHtml(profile.avatar_url)}"
                        alt=""
                    >
                </div>
            `;

        }

        return `
            <div class="${className}">
                ${escapeHtml(
                    initials(
                        profile?.full_name ||
                        profile?.username ||
                        "?"
                    )
                )}
            </div>
        `;
    }


    function showToast(message, type = "success") {

        const toast = $("toast");

        if (!toast) return;

        const icon = toast.querySelector("i");
        const text = toast.querySelector("span");

        if (text) {
            text.textContent = message;
        }

        if (icon) {
            icon.className =
                type === "error"
                    ? "fa-solid fa-circle-exclamation"
                    : "fa-solid fa-circle-check";
        }

        toast.hidden = false;

        clearTimeout(showToast.timer);

        showToast.timer = setTimeout(() => {
            toast.hidden = true;
        }, 3000);
    }


    // =========================================================
    // AUTH
    // =========================================================

    async function checkSession() {

        if (!window.supabaseClient) {

            showToast(
                "supabaseClient topilmadi. supabase.js ni tekshiring.",
                "error"
            );

            return false;
        }

        const {
            data: { session },
            error
        } = await window.supabaseClient.auth.getSession();

        if (error || !session) {

            window.location.href = "index.html";

            return false;
        }

        state.user = session.user;

        return true;
    }


    // =========================================================
    // PROFILE
    // =========================================================

    async function loadMyProfile() {

        const { data, error } =
            await window.supabaseClient
                .from("profiles")
                .select("*")
                .eq("id", state.user.id)
                .maybeSingle();

        if (error) {

            console.error(error);

            showToast(
                "Profile yuklanmadi.",
                "error"
            );

            return;
        }

        state.profile = data;

        renderMyProfile();
        checkOwnerAccess();
    }


    function renderMyProfile() {

        if (!state.profile) return;

        const name =
            state.profile.full_name ||
            state.profile.username ||
            "User";

        const username =
            state.profile.username
                ? `@${state.profile.username}`
                : "@username";

        if ($("sidebarName")) {
            $("sidebarName").textContent = name;
        }

        if ($("sidebarUsername")) {
            $("sidebarUsername").textContent = username;
        }

        if ($("sidebarAvatar")) {

            if (state.profile.avatar_url) {

                $("sidebarAvatar").innerHTML = `
                    <img
                        src="${escapeHtml(
                            state.profile.avatar_url
                        )}"
                        alt=""
                    >
                `;

            } else {

                $("sidebarAvatar").textContent =
                    initials(name);
            }
        }
    }


    function checkOwnerAccess() {

        if (!state.profile) return;

        const ownerButton = $("ownerPanelButton");

        if (!ownerButton) return;

        const isOwner =
            state.profile.role === "owner";

        const isAdmin =
            state.profile.role === "admin";

        ownerButton.hidden =
            !(isOwner || isAdmin);
    }


    // =========================================================
    // NAVIGATION
    // =========================================================

    const navItems =
        document.querySelectorAll(".nav-item[data-tab]");

    navItems.forEach(item => {

        item.addEventListener("click", () => {

            const tab = item.dataset.tab;

            switchTab(tab);

            closeSidebarMobile();
        });

    });


    const tabTitles = {

        chats: [
            "Chats",
            "Your conversations"
        ],

        contacts: [
            "Contacts",
            "People you can communicate with"
        ],

        groups: [
            "Groups",
            "Communities and group chats"
        ],

        channels: [
            "Channels",
            "Follow channels and announcements"
        ],

        notifications: [
            "Notifications",
            "Everything that needs your attention"
        ],

        saved: [
            "Saved Messages",
            "Your saved messages and media"
        ],

        settings: [
            "Settings",
            "Manage your MegChatBox account"
        ]

    };


    function switchTab(tab) {

        state.currentTab = tab;

        document
            .querySelectorAll(".tab-page")
            .forEach(page => {

                const active =
                    page.id === `tab-${tab}`;

                page.hidden = !active;
                page.classList.toggle(
                    "active",
                    active
                );

            });


        navItems.forEach(item => {

            item.classList.toggle(
                "active",
                item.dataset.tab === tab
            );

        });


        const title =
            tabTitles[tab] || ["MegChatBox", ""];

        if ($("pageTitle")) {
            $("pageTitle").textContent = title[0];
        }

        if ($("pageSubtitle")) {
            $("pageSubtitle").textContent = title[1];
        }

        if (tab === "contacts") {
            loadContacts();
        }

        if (tab === "chats") {
            loadChats();
        }
    }


    // =========================================================
    // SIDEBAR MOBILE
    // =========================================================

    $("openSidebar")?.addEventListener(
        "click",
        () => {
            $("sidebar")?.classList.add("open");
        }
    );

    $("closeSidebar")?.addEventListener(
        "click",
        closeSidebarMobile
    );


    function closeSidebarMobile() {
        $("sidebar")?.classList.remove("open");
    }


    // =========================================================
    // LOGOUT
    // =========================================================

    $("logoutButton")?.addEventListener(
        "click",
        async () => {

            try {

                await window.supabaseClient.auth.signOut();

            } catch (error) {

                console.error(error);

            }

            window.location.href = "index.html";
        }
    );


    // =========================================================
    // PROFILE
    // =========================================================

    $("openMyProfile")?.addEventListener(
        "click",
        () => {

            if (!state.profile) return;

            openProfile(state.profile);

        }
    );


    function openProfile(profile) {

        $("profileModal").hidden = false;

        const name =
            profile.full_name ||
            profile.username ||
            "User";

        $("profileName").textContent = name;

        $("profileUsername").textContent =
            profile.username
                ? `@${profile.username}`
                : "";

        $("profileBio").textContent =
            profile.bio ||
            "No bio yet.";

        $("profileDecoration").textContent =
            profile.decoration ||
            "✨";

        if (profile.avatar_url) {

            $("profileAvatar").innerHTML = `
                <img
                    src="${escapeHtml(profile.avatar_url)}"
                    alt=""
                >
            `;

        } else {

            $("profileAvatar").textContent =
                initials(name);
        }

        $("profileStatus").textContent =
            profile.last_seen
                ? "Last seen recently"
                : "Offline";
    }


    document
        .querySelectorAll("[data-close]")
        .forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    const modal =
                        $(button.dataset.close);

                    if (modal) {
                        modal.hidden = true;
                    }

                }
            );

        });


    $("profileModal")?.addEventListener(
        "click",
        event => {

            if (event.target === $("profileModal")) {
                $("profileModal").hidden = true;
            }

        }
    );


    // =========================================================
    // GLOBAL SEARCH
    // =========================================================

    [
        $("globalSearchButton"),
        $("topSearch"),
        $("startSearchButton")
    ].forEach(button => {

        button?.addEventListener(
            "click",
            openGlobalSearch
        );

    });


    function openGlobalSearch() {

        $("searchOverlay").hidden = false;

        setTimeout(() => {
            $("globalSearchInput")?.focus();
        }, 50);
    }


    $("closeGlobalSearch")?.addEventListener(
        "click",
        () => {
            $("searchOverlay").hidden = true;
        }
    );


    $("clearGlobalSearch")?.addEventListener(
        "click",
        () => {

            $("globalSearchInput").value = "";

            renderSearchEmpty();

        }
    );


    function renderSearchEmpty() {

        $("globalSearchResults").innerHTML = `
            <div class="search-empty">
                <i class="fa-solid fa-magnifying-glass"></i>
                <p>
                    Search for people and communities
                </p>
            </div>
        `;
    }


    $("globalSearchInput")?.addEventListener(
        "input",
        event => {

            const value =
                event.target.value
                    .trim()
                    .toLowerCase();

            clearTimeout(state.searchTimer);

            if (!value) {

                renderSearchEmpty();

                return;
            }

            state.searchTimer =
                setTimeout(
                    () => searchUsers(value),
                    300
                );
        }
    );


    async function searchUsers(username) {

        const container =
            $("globalSearchResults");

        container.innerHTML = `
            <div class="search-empty">
                <i class="fa-solid fa-spinner fa-spin"></i>
                <p>Searching...</p>
            </div>
        `;

        const { data, error } =
            await window.supabaseClient
                .from("profiles")
                .select(`
                    id,
                    username,
                    full_name,
                    bio,
                    avatar_url,
                    role,
                    is_verified,
                    last_seen
                `)
                .ilike(
                    "username",
                    `${username}%`
                )
                .limit(10);

        if (error) {

            console.error(error);

            container.innerHTML = `
                <div class="search-empty">
                    <p>Search failed.</p>
                </div>
            `;

            return;
        }

        if (!data?.length) {

            container.innerHTML = `
                <div class="search-empty">
                    <p>No users found.</p>
                </div>
            `;

            return;
        }

        container.innerHTML = data
            .filter(user => user.id !== state.user.id)
            .map(user => {

                const name =
                    user.full_name ||
                    user.username ||
                    "User";

                return `
                    <div
                        class="search-result"
                        data-user-id="${user.id}"
                    >

                        ${avatarHtml(
                            user,
                            "avatar avatar-small"
                        )}

                        <div class="search-result-info">

                            <strong>
                                ${escapeHtml(name)}
                                ${
                                    user.is_verified
                                        ? " 🔵"
                                        : ""
                                }
                            </strong>

                            <span>
                                @${escapeHtml(
                                    user.username || ""
                                )}
                            </span>

                        </div>

                        <i class="fa-solid fa-chevron-right"></i>

                    </div>
                `;

            })
            .join("");

        container
            .querySelectorAll(".search-result")
            .forEach(item => {

                item.addEventListener(
                    "click",
                    () => {

                        const user =
                            data.find(
                                x =>
                                    x.id ===
                                    item.dataset.userId
                            );

                        if (user) {

                            openProfile(user);

                            $("searchOverlay").hidden = true;
                        }

                    }
                );

            });
    }


    // =========================================================
    // CONTACTS
    // =========================================================

    async function loadContacts() {

        const container =
            $("contactList");

        if (!container) return;

        /*
         * Contact requests jadvali sening Supabase'da
         * oldindan bor deb qabul qilinyapti.
         *
         * Keyingi bosqichda:
         * pending / accepted / declined
         * to'liq ulanadi.
         */

        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">
                    <i class="fa-solid fa-spinner fa-spin"></i>
                </div>
                <h3>Loading contacts...</h3>
            </div>
        `;

        try {

            const { data, error } =
                await window.supabaseClient
                    .from("contact_requests")
                    .select("*")
                    .or(
                        `sender_id.eq.${state.user.id},receiver_id.eq.${state.user.id}`
                    );

            if (error) {
                throw error;
            }

            if (!data?.length) {

                container.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-icon">
                            <i class="fa-solid fa-users"></i>
                        </div>
                        <h3>No contacts</h3>
                        <p>
                            Find users by their username.
                        </p>
                    </div>
                `;

                return;
            }

            /*
             * Profile ma'lumotlarini keyingi queryda
             * yig'amiz.
             */
            container.innerHTML = "";

            for (const request of data) {

                const otherId =
                    request.sender_id === state.user.id
                        ? request.receiver_id
                        : request.sender_id;

                const { data: profile } =
                    await window.supabaseClient
                        .from("profiles")
                        .select("*")
                        .eq("id", otherId)
                        .maybeSingle();

                if (!profile) continue;

                renderContact(
                    profile,
                    request.status
                );
            }

        } catch (error) {

            console.error(error);

            container.innerHTML = `
                <div class="empty-state">
                    <h3>Contacts unavailable</h3>
                    <p>
                        Contact system will be connected
                        completely in the next module.
                    </p>
                </div>
            `;
        }
    }


    function renderContact(profile, status) {

        const container = $("contactList");

        const element =
            document.createElement("div");

        element.className = "contact-item";

        element.innerHTML = `
            ${avatarHtml(profile)}

            <div class="contact-info">

                <strong>
                    ${escapeHtml(
                        profile.full_name ||
                        profile.username ||
                        "User"
                    )}
                </strong>

                <span>
                    @${escapeHtml(
                        profile.username || ""
                    )}
                    · ${escapeHtml(status || "contact")}
                </span>

            </div>

            <i class="fa-solid fa-chevron-right"></i>
        `;

        element.addEventListener(
            "click",
            () => openChat(profile)
        );

        container.appendChild(element);
    }


    // =========================================================
    // CHAT
    // =========================================================

    async function openChat(profile) {

        state.selectedUser = profile;

        $("chatPanel").hidden = false;

        $("chatName").textContent =
            profile.full_name ||
            profile.username ||
            "User";

        $("chatStatus").textContent =
            profile.last_seen
                ? "Last seen recently"
                : "offline";

        if (profile.avatar_url) {

            $("chatAvatar").innerHTML = `
                <img
                    src="${escapeHtml(profile.avatar_url)}"
                    alt=""
                >
            `;

        } else {

            $("chatAvatar").textContent =
                initials(
                    profile.full_name ||
                    profile.username
                );
        }

        await loadMessages();
    }


    $("closeChat")?.addEventListener(
        "click",
        () => {

            $("chatPanel").hidden = true;

            state.selectedUser = null;

        }
    );


    async function loadMessages() {

        const container = $("messages");

        if (!state.selectedUser) return;

        container.innerHTML = "";

        try {

            const { data, error } =
                await window.supabaseClient
                    .from("messages")
                    .select("*")
                    .or(
                        `and(sender_id.eq.${state.user.id},receiver_id.eq.${state.selectedUser.id}),and(sender_id.eq.${state.selectedUser.id},receiver_id.eq.${state.user.id})`
                    )
                    .order(
                        "created_at",
                        { ascending: true }
                    );

            if (error) throw error;

            if (!data?.length) {

                container.innerHTML = `
                    <div class="empty-chat">
                        <div>
                            <i class="fa-solid fa-message"></i>
                            <p>
                                Start your conversation.
                            </p>
                        </div>
                    </div>
                `;

                return;
            }

            data.forEach(renderMessage);

            container.scrollTop =
                container.scrollHeight;

        } catch (error) {

            console.error(error);

            container.innerHTML = `
                <div class="empty-chat">
                    <p>Messages could not be loaded.</p>
                </div>
            `;
        }
    }


    function renderMessage(message) {

        const container = $("messages");

        const mine =
            message.sender_id === state.user.id;

        const element =
            document.createElement("div");

        element.className =
            `message ${mine ? "mine" : ""}`;

        element.innerHTML = `
            <div>
                ${escapeHtml(
                    message.content || ""
                )}
            </div>

            <div class="message-meta">
                ${formatTime(message.created_at)}
                ${mine ? " · Sent" : ""}
            </div>
        `;

        container.appendChild(element);
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


    // SEND MESSAGE

    $("messageForm")?.addEventListener(
        "submit",
        async event => {

            event.preventDefault();

            const input =
                $("messageInput");

            const content =
                input.value.trim();

            if (!content) return;

            if (!state.selectedUser) {

                showToast(
                    "Avval chat tanlang.",
                    "error"
                );

                return;
            }

            input.disabled = true;

            try {

                const { data, error } =
                    await window.supabaseClient
                        .from("messages")
                        .insert({
                            sender_id:
                                state.user.id,

                            receiver_id:
                                state.selectedUser.id,

                            content
                        })
                        .select()
                        .single();

                if (error) throw error;

                input.value = "";

                renderMessage(data);

                $("messages").scrollTop =
                    $("messages").scrollHeight;

            } catch (error) {

                console.error(error);

                showToast(
                    error.message ||
                    "Message yuborilmadi.",
                    "error"
                );

            } finally {

                input.disabled = false;

                input.focus();
            }
        }
    );


    // =========================================================
    // CHATS
    // =========================================================

    async function loadChats() {

        const container =
            $("chatList");

        if (!container) return;

        /*
         * Accepted contacts + latest message
         * keyingi realtime/chat moduleda to'liq ishlaydi.
         */
    }


    // =========================================================
    // CREATE GROUP / CHANNEL
    // =========================================================

    [
        $("createGroupButton"),
        $("groupCreateTop")
    ].forEach(button => {

        button?.addEventListener(
            "click",
            () => {

                showToast(
                    "Group creation module ulanadi."
                );

                switchTab("groups");
            }
        );

    });


    [
        $("createChannelButton"),
        $("channelCreateTop")
    ].forEach(button => {

        button?.addEventListener(
            "click",
            () => {

                showToast(
                    "Channel creation module ulanadi."
                );

                switchTab("channels");
            }
        );

    });


    // =========================================================
    // SETTINGS
    // =========================================================

    document
        .querySelectorAll(".settings-card[data-setting]")
        .forEach(card => {

            card.addEventListener(
                "click",
                () => {

                    const setting =
                        card.dataset.setting;

                    showToast(
                        `${setting} settings modulei keyingi bosqichda ochiladi.`
                    );

                }
            );

        });


    // =========================================================
    // TOP NOTIFICATIONS
    // =========================================================

    $("topNotifications")?.addEventListener(
        "click",
        () => switchTab("notifications")
    );


    // =========================================================
    // SUPABASE AUTH STATE
    // =========================================================

    if (window.supabaseClient) {

        window.supabaseClient.auth
            .onAuthStateChange(
                (event, session) => {

                    if (
                        event === "SIGNED_OUT" ||
                        !session
                    ) {

                        window.location.href =
                            "index.html";
                    }

                }
            );
    }


    // =========================================================
    // START
    // =========================================================

    const authenticated =
        await checkSession();

    if (!authenticated) return;

    await loadMyProfile();

    switchTab("chats");

});
