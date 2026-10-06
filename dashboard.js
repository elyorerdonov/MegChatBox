/* =========================================================
   MEGCHATBOX - DASHBOARD
   ========================================================= */

const supabase = window.supabaseClient;

/* =========================================================
   STATE
   ========================================================= */

let currentUser = null;
let currentProfile = null;
let selectedUser = null;
let currentChatUserId = null;


/* =========================================================
   HELPERS
   ========================================================= */

function $(id) {
    return document.getElementById(id);
}

function escapeHtml(value = "") {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function showToast(message, type = "info") {
    const toast = $("toast");

    if (!toast) {
        console.log(message);
        return;
    }

    toast.textContent = message;
    toast.className = `toast show ${type}`;

    clearTimeout(window.toastTimer);

    window.toastTimer = setTimeout(() => {
        toast.className = "toast";
    }, 3000);
}

function getInitials(name = "User") {
    return name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map(word => word[0])
        .join("")
        .toUpperCase();
}

function avatarHTML(profile, size = "") {
    if (!profile) {
        return `<div class="avatar ${size}">U</div>`;
    }

    const name =
        profile.full_name ||
        profile.username ||
        "User";

    if (profile.avatar_url) {
        return `
            <div class="avatar ${size}">
                <img
                    src="${escapeHtml(profile.avatar_url)}"
                    alt="${escapeHtml(name)}"
                >
            </div>
        `;
    }

    return `
        <div class="avatar ${size}">
            ${escapeHtml(getInitials(name))}
        </div>
    `;
}

function verifiedBadge(profile) {
    if (!profile?.is_verified) {
        return "";
    }

    if (
        profile.verified_until &&
        new Date(profile.verified_until) < new Date()
    ) {
        return "";
    }

    return `<span class="verified-badge" title="Verified">✓</span>`;
}


/* =========================================================
   SESSION
   ========================================================= */

async function checkSession() {

    const {
        data: { session },
        error
    } = await supabase.auth.getSession();

    if (error) {
        console.error("Session error:", error);
        window.location.href = "index.html";
        return false;
    }

    if (!session?.user) {
        window.location.href = "index.html";
        return false;
    }

    currentUser = session.user;

    console.log("Logged in:", currentUser.id);

    return true;
}


/* =========================================================
   LOAD MY PROFILE
   ========================================================= */

async function loadMyProfile() {

    if (!currentUser) {
        return false;
    }

    const {
        data,
        error
    } = await supabase
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
            verified_given_at,
            show_online,
            show_last_seen,
            last_seen,
            account_blocked,
            account_blocked_until,
            messaging_blocked,
            messaging_blocked_until
        `)
        .eq("id", currentUser.id)
        .maybeSingle();

    if (error) {

        console.error("Profile loading error:", error);

        showToast(
            "Profile yuklanmadi: " + error.message,
            "error"
        );

        return false;
    }

    if (!data) {

        console.error(
            "Profile topilmadi. Auth ID:",
            currentUser.id
        );

        showToast(
            "Profil topilmadi.",
            "error"
        );

        return false;
    }

    currentProfile = data;

    console.log("CURRENT PROFILE:", currentProfile);

    return true;
}


/* =========================================================
   RENDER PROFILE
   ========================================================= */

function renderMyProfile() {

    if (!currentProfile) {
        return;
    }

    const profile = currentProfile;

    const username =
        profile.username ||
        "username";

    const fullName =
        profile.full_name ||
        username;

    const bio =
        profile.bio ||
        "";

    /* Sidebar name */

    const sidebarName =
        $("sidebarUserName");

    if (sidebarName) {
        sidebarName.textContent = fullName;
    }


    /* Sidebar username */

    const sidebarUsername =
        $("sidebarUserUsername");

    if (sidebarUsername) {
        sidebarUsername.textContent =
            "@" + username;
    }


    /* Profile name */

    const profileName =
        $("profileName");

    if (profileName) {
        profileName.textContent = fullName;
    }


    /* Profile username */

    const profileUsername =
        $("profileUsername");

    if (profileUsername) {
        profileUsername.textContent =
            "@" + username;
    }


    /* Profile bio */

    const profileBio =
        $("profileBio");

    if (profileBio) {
        profileBio.textContent =
            bio || "No bio yet.";
    }


    /* Role */

    const profileRole =
        $("profileRole");

    if (profileRole) {

        const role =
            profile.role || "user";

        profileRole.textContent =
            role.toUpperCase();
    }


    /* Avatar */

    const avatarElements =
        document.querySelectorAll(
            "[data-my-avatar]"
        );

    avatarElements.forEach(element => {

        if (profile.avatar_url) {

            element.innerHTML = `
                <img
                    src="${escapeHtml(profile.avatar_url)}"
                    alt="${escapeHtml(fullName)}"
                >
            `;

        } else {

            element.textContent =
                getInitials(fullName);

        }

    });


    /* Verified badges */

    document
        .querySelectorAll("[data-my-verified]")
        .forEach(element => {

            element.innerHTML =
                verifiedBadge(profile);

        });


    /* Owner panel */

    const ownerButton =
        $("ownerPanelButton");

    if (ownerButton) {

        const isOwner =
            profile.role === "owner";

        ownerButton.style.display =
            isOwner ? "" : "none";
    }


    /* Admin panel */

    const adminButton =
        $("adminPanelButton");

    if (adminButton) {

        const isAdmin =
            profile.role === "admin" ||
            profile.role === "owner";

        adminButton.style.display =
            isAdmin ? "" : "none";
    }
}


/* =========================================================
   PROFILE MODAL
   ========================================================= */

function openMyProfile() {

    renderMyProfile();

    const modal =
        $("profileModal");

    if (modal) {
        modal.classList.add("show");
        modal.setAttribute(
            "aria-hidden",
            "false"
        );
    }
}

function closeProfileModal() {

    const modal =
        $("profileModal");

    if (modal) {
        modal.classList.remove("show");
        modal.setAttribute(
            "aria-hidden",
            "true"
        );
    }
}


/* =========================================================
   NAVIGATION
   ========================================================= */

function setupNavigation() {

    document
        .querySelectorAll("[data-section]")
        .forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    const section =
                        button.dataset.section;

                    switchSection(section);
                }
            );

        });
}

function switchSection(section) {

    document
        .querySelectorAll("[data-section]")
        .forEach(item => {

            item.classList.toggle(
                "active",
                item.dataset.section === section
            );

        });


    document
        .querySelectorAll(".dashboard-section")
        .forEach(panel => {

            panel.classList.toggle(
                "active",
                panel.id === `${section}Section`
            );

        });


    if (section === "contacts") {
        loadContacts();
    }

    if (section === "groups") {
        loadGroups();
    }

    if (section === "channels") {
        loadChannels();
    }

    if (section === "saved") {
        loadSavedMessages();
    }

    if (section === "notifications") {
        loadNotifications();
    }
}


/* =========================================================
   CONTACTS
   ========================================================= */

async function loadContacts() {

    if (!currentUser) return;

    const list =
        $("contactsList");

    if (!list) return;

    list.innerHTML =
        `<div class="loading-state">Loading...</div>`;


    const {
        data,
        error
    } = await supabase
        .from("contact_requests")
        .select(`
            id,
            sender_id,
            receiver_id,
            status,
            created_at
        `)
        .or(
            `sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`
        )
        .eq("status", "accepted")
        .order(
            "created_at",
            { ascending: false }
        );


    if (error) {

        console.error(error);

        list.innerHTML =
            `<div class="empty-state">
                Could not load contacts.
            </div>`;

        return;
    }


    if (!data?.length) {

        list.innerHTML =
            `<div class="empty-state">
                <i class="fa-solid fa-user-group"></i>
                <h3>No contacts yet</h3>
                <p>Search for users to add them.</p>
            </div>`;

        return;
    }


    const otherIds =
        data.map(item =>
            item.sender_id === currentUser.id
                ? item.receiver_id
                : item.sender_id
        );


    const {
        data: profiles,
        error: profileError
    } = await supabase
        .from("profiles")
        .select("*")
        .in("id", otherIds);


    if (profileError) {

        console.error(profileError);

        return;
    }


    list.innerHTML = "";


    profiles.forEach(profile => {

        const item =
            document.createElement("div");

        item.className =
            "contact-item";

        item.innerHTML = `
            ${avatarHTML(profile)}

            <div class="contact-info">
                <strong>
                    ${escapeHtml(
                        profile.full_name ||
                        profile.username
                    )}

                    ${verifiedBadge(profile)}
                </strong>

                <span>
                    @${escapeHtml(
                        profile.username
                    )}
                </span>
            </div>
        `;

        item.addEventListener(
            "click",
            () => openChat(profile)
        );

        list.appendChild(item);
    });
}


/* =========================================================
   GLOBAL USER SEARCH
   ========================================================= */

async function searchUsers(query) {

    const results =
        $("searchResults");

    if (!results) return;

    query =
        query.trim().replace(/^@/, "");

    if (!query) {

        results.innerHTML = `
            <div class="empty-state">
                Search for a username.
            </div>
        `;

        return;
    }


    const {
        data,
        error
    } = await supabase
        .from("profiles")
        .select(`
            id,
            username,
            full_name,
            bio,
            avatar_url,
            role,
            is_verified,
            verified_until
        `)
        .ilike(
            "username",
            `%${query}%`
        )
        .limit(10);


    if (error) {

        console.error(error);

        results.innerHTML = `
            <div class="empty-state">
                Search failed.
            </div>
        `;

        return;
    }


    if (!data?.length) {

        results.innerHTML = `
            <div class="empty-state">
                No users found.
            </div>
        `;

        return;
    }


    results.innerHTML = "";


    data.forEach(profile => {

        const item =
            document.createElement("div");

        item.className =
            "search-result-item";

        item.innerHTML = `
            ${avatarHTML(profile)}

            <div class="search-result-info">

                <strong>
                    ${escapeHtml(
                        profile.full_name ||
                        profile.username
                    )}

                    ${verifiedBadge(profile)}
                </strong>

                <span>
                    @${escapeHtml(
                        profile.username
                    )}
                </span>

                ${
                    profile.bio
                        ? `<small>
                            ${escapeHtml(profile.bio)}
                           </small>`
                        : ""
                }

            </div>
        `;


        item.addEventListener(
            "click",
            () => {

                closeGlobalSearch();

                if (
                    profile.id ===
                    currentUser.id
                ) {
                    openMyProfile();
                    return;
                }

                openChat(profile);
            }
        );


        results.appendChild(item);
    });
}


/* =========================================================
   GLOBAL SEARCH UI
   ========================================================= */

function openGlobalSearch() {

    const overlay =
        $("globalSearch");

    if (!overlay) return;

    overlay.classList.add("show");

    const input =
        $("globalSearchInput");

    if (input) {
        input.value = "";
        input.focus();
    }
}

function closeGlobalSearch() {

    const overlay =
        $("globalSearch");

    if (overlay) {
        overlay.classList.remove("show");
    }
}


/* =========================================================
   CHAT
   ========================================================= */

async function openChat(profile) {

    if (!profile) return;

    selectedUser = profile;
    currentChatUserId = profile.id;


    const chatName =
        $("chatName");

    if (chatName) {

        chatName.innerHTML = `
            ${escapeHtml(
                profile.full_name ||
                profile.username
            )}

            ${verifiedBadge(profile)}
        `;

    }


    const chatUsername =
        $("chatUsername");

    if (chatUsername) {

        chatUsername.textContent =
            "@" + profile.username;

    }


    const chatAvatar =
        $("chatAvatar");

    if (chatAvatar) {

        chatAvatar.innerHTML =
            avatarHTML(profile);

    }


    const chatPanel =
        $("chatPanel");

    if (chatPanel) {
        chatPanel.classList.add("active");
    }


    await loadMessages(profile.id);
}


/* =========================================================
   LOAD 1-ON-1 MESSAGES
   ========================================================= */

async function loadMessages(otherUserId) {

    const container =
        $("messages");

    if (!container) return;


    container.innerHTML =
        `<div class="loading-state">
            Loading messages...
        </div>`;


    const {
        data,
        error
    } = await supabase
        .from("messages")
        .select("*")
        .or(
            `and(sender_id.eq.${currentUser.id},receiver_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},receiver_id.eq.${currentUser.id})`
        )
        .order(
            "created_at",
            { ascending: true }
        );


    if (error) {

        console.error(
            "Messages error:",
            error
        );

        container.innerHTML =
            `<div class="empty-state">
                Could not load messages.
            </div>`;

        return;
    }


    if (!data?.length) {

        container.innerHTML =
            `<div class="empty-chat">
                <div class="empty-chat-icon">
                    <i class="fa-solid fa-comments"></i>
                </div>

                <h3>
                    Start a conversation
                </h3>

                <p>
                    Send your first message.
                </p>
            </div>`;

        return;
    }


    container.innerHTML = "";


    data.forEach(message => {

        const own =
            message.sender_id ===
            currentUser.id;

        const element =
            document.createElement("div");

        element.className =
            `message ${own ? "own" : ""}`;


        let content =
            escapeHtml(
                message.content || ""
            );


        if (message.deleted_at) {

            content =
                `<i>This message was deleted</i>`;

        }


        element.innerHTML = `
            <div class="message-bubble">

                <div class="message-content">
                    ${content}
                </div>

                <div class="message-time">
                    ${formatTime(
                        message.created_at
                    )}
                </div>

            </div>
        `;


        container.appendChild(element);
    });


    container.scrollTop =
        container.scrollHeight;
}


/* =========================================================
   SEND MESSAGE
   ========================================================= */

async function sendMessage() {

    if (
        !currentUser ||
        !currentChatUserId
    ) {
        return;
    }


    const input =
        $("messageInput");

    if (!input) return;


    const content =
        input.value.trim();

    if (!content) return;


    const button =
        $("sendMessageButton");

    if (button) {
        button.disabled = true;
    }


    const {
        error
    } = await supabase
        .from("messages")
        .insert({
            sender_id:
                currentUser.id,

            receiver_id:
                currentChatUserId,

            content,

            message_type:
                "text"
        });


    if (button) {
        button.disabled = false;
    }


    if (error) {

        console.error(error);

        showToast(
            "Message yuborilmadi.",
            "error"
        );

        return;
    }


    input.value = "";

    await loadMessages(
        currentChatUserId
    );
}


/* =========================================================
   TIME
   ========================================================= */

function formatTime(date) {

    if (!date) return "";

    return new Date(date)
        .toLocaleTimeString(
            [],
            {
                hour: "2-digit",
                minute: "2-digit"
            }
        );
}


/* =========================================================
   GROUPS
   ========================================================= */

async function loadGroups() {

    const list =
        $("groupsList");

    if (!list || !currentUser) return;


    const {
        data,
        error
    } = await supabase
        .from("group_members")
        .select(`
            group_id,
            role,
            groups (
                id,
                name,
                username,
                bio,
                avatar_url,
                is_public
            )
        `)
        .eq(
            "user_id",
            currentUser.id
        );


    if (error) {

        console.error(error);

        list.innerHTML =
            `<div class="empty-state">
                Could not load groups.
            </div>`;

        return;
    }


    if (!data?.length) {

        list.innerHTML =
            `<div class="empty-state">
                <i class="fa-solid fa-users"></i>
                <h3>No groups</h3>
            </div>`;

        return;
    }


    list.innerHTML = "";


    data.forEach(item => {

        const group =
            item.groups;

        if (!group) return;


        const element =
            document.createElement("div");

        element.className =
            "community-card";


        element.innerHTML = `
            ${avatarHTML({
                full_name: group.name,
                avatar_url: group.avatar_url
            })}

            <h3>
                ${escapeHtml(group.name)}
            </h3>

            ${
                group.username
                    ? `<p>
                        @${escapeHtml(
                            group.username
                        )}
                       </p>`
                    : ""
            }
        `;


        list.appendChild(element);
    });
}


/* =========================================================
   CHANNELS
   ========================================================= */

async function loadChannels() {

    const list =
        $("channelsList");

    if (!list || !currentUser) return;


    const {
        data,
        error
    } = await supabase
        .from("channel_members")
        .select(`
            channel_id,
            role,
            channels (
                id,
                name,
                username,
                bio,
                avatar_url,
                is_public
            )
        `)
        .eq(
            "user_id",
            currentUser.id
        );


    if (error) {

        console.error(error);

        list.innerHTML =
            `<div class="empty-state">
                Could not load channels.
            </div>`;

        return;
    }


    if (!data?.length) {

        list.innerHTML =
            `<div class="empty-state">
                <i class="fa-solid fa-bullhorn"></i>
                <h3>No channels</h3>
            </div>`;

        return;
    }


    list.innerHTML = "";


    data.forEach(item => {

        const channel =
            item.channels;

        if (!channel) return;


        const element =
            document.createElement("div");

        element.className =
            "community-card";


        element.innerHTML = `
            ${avatarHTML({
                full_name: channel.name,
                avatar_url: channel.avatar_url
            })}

            <h3>
                ${escapeHtml(channel.name)}
            </h3>

            ${
                channel.username
                    ? `<p>
                        @${escapeHtml(
                            channel.username
                        )}
                       </p>`
                    : ""
            }
        `;


        list.appendChild(element);
    });
}


/* =========================================================
   SAVED MESSAGES
   ========================================================= */

async function loadSavedMessages() {

    const list =
        $("savedMessagesList");

    if (!list || !currentUser) return;


    const {
        data,
        error
    } = await supabase
        .from("saved_messages")
        .select("*")
        .eq(
            "user_id",
            currentUser.id
        )
        .order(
            "created_at",
            { ascending: false }
        );


    if (error) {

        console.error(error);

        list.innerHTML =
            `<div class="empty-state">
                Could not load saved messages.
            </div>`;

        return;
    }


    if (!data?.length) {

        list.innerHTML =
            `<div class="empty-state">
                <i class="fa-solid fa-bookmark"></i>
                <h3>No saved messages</h3>
            </div>`;

        return;
    }


    list.innerHTML = "";


    data.forEach(message => {

        const element =
            document.createElement("div");

        element.className =
            "saved-message";

        element.innerHTML = `
            <p>
                ${escapeHtml(
                    message.content || ""
                )}
            </p>

            <small>
                ${formatTime(
                    message.created_at
                )}
            </small>
        `;

        list.appendChild(element);
    });
}


/* =========================================================
   NOTIFICATIONS
   ========================================================= */

async function loadNotifications() {

    const list =
        $("notificationsList");

    if (!list) return;

    list.innerHTML = `
        <div class="empty-state">
            <i class="fa-solid fa-bell"></i>
            <h3>No notifications</h3>
        </div>
    `;
}


/* =========================================================
   LOGOUT
   ========================================================= */

async function logout() {

    const {
        error
    } = await supabase.auth.signOut();

    if (error) {

        console.error(error);

        showToast(
            "Logout failed.",
            "error"
        );

        return;
    }


    window.location.href =
        "index.html";
}


/* =========================================================
   EVENT LISTENERS
   ========================================================= */

function setupEvents() {

    /* Profile */

    const profileButton =
        $("profileButton");

    if (profileButton) {

        profileButton.addEventListener(
            "click",
            openMyProfile
        );

    }


    const closeProfile =
        $("closeProfileModal");

    if (closeProfile) {

        closeProfile.addEventListener(
            "click",
            closeProfileModal
        );

    }


    /* Logout */

    const logoutButton =
        $("logoutButton");

    if (logoutButton) {

        logoutButton.addEventListener(
            "click",
            logout
        );

    }


    /* Search */

    const searchButton =
        $("searchButton");

    if (searchButton) {

        searchButton.addEventListener(
            "click",
            openGlobalSearch
        );

    }


    const closeSearch =
        $("closeGlobalSearch");

    if (closeSearch) {

        closeSearch.addEventListener(
            "click",
            closeGlobalSearch
        );

    }


    const searchInput =
        $("globalSearchInput");

    if (searchInput) {

        searchInput.addEventListener(
            "input",
            event => {

                searchUsers(
                    event.target.value
                );

            }
        );

    }


    /* Message */

    const sendButton =
        $("sendMessageButton");

    if (sendButton) {

        sendButton.addEventListener(
            "click",
            sendMessage
        );

    }


    const messageInput =
        $("messageInput");

    if (messageInput) {

        messageInput.addEventListener(
            "keydown",
            event => {

                if (
                    event.key === "Enter" &&
                    !event.shiftKey
                ) {

                    event.preventDefault();

                    sendMessage();
                }

            }
        );

    }


    /* Close chat */

    const closeChat =
        $("closeChatButton");

    if (closeChat) {

        closeChat.addEventListener(
            "click",
            () => {

                const panel =
                    $("chatPanel");

                if (panel) {
                    panel.classList.remove(
                        "active"
                    );
                }

            }
        );

    }
}


/* =========================================================
   AUTH STATE
   ========================================================= */

supabase.auth.onAuthStateChange(
    async (event, session) => {

        console.log(
            "Auth event:",
            event
        );

        if (
            !session &&
            event !== "SIGNED_OUT"
        ) {
            return;
        }

        if (
            event === "SIGNED_OUT"
        ) {

            window.location.href =
                "index.html";

        }

    }
);


/* =========================================================
   START DASHBOARD
   ========================================================= */

async function initDashboard() {

    console.log(
        "MegChatBox dashboard starting..."
    );


    const sessionExists =
        await checkSession();

    if (!sessionExists) {
        return;
    }


    const profileLoaded =
        await loadMyProfile();

    if (!profileLoaded) {
        return;
    }


    renderMyProfile();

    setupNavigation();

    setupEvents();

    console.log(
        "Dashboard ready:",
        currentProfile
    );
}


/* =========================================================
   START
   ========================================================= */

document.addEventListener(
    "DOMContentLoaded",
    initDashboard
);
