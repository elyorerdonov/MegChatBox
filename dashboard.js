```javascript
(() => {
    "use strict";

    /* =========================================================
       MEGCHATBOX
       DASHBOARD.JS V4 - CLEAN / STABLE BASE
    ========================================================= */

    const db =
        typeof supabaseClient !== "undefined"
            ? supabaseClient
            : window.supabaseClient;

    if (!db) {
        console.error("MegChatBox: Supabase client not found.");
        return;
    }

    /* =========================================================
       STATE
    ========================================================= */

    let currentUser = null;
    let currentProfile = null;

    let activeChatUser = null;
    let activeCommunity = null;
    let activeCommunityType = null;

    let activeUserProfile = null;
    let currentRole = "user";

    let currentMessages = [];
    let currentRequests = [];

    let realtimeChannel = null;
    let searchTimer = null;

    let currentTab = "chats";

    /* =========================================================
       DOM
    ========================================================= */

    const $ = (id) => document.getElementById(id);

    const $$ = (selector, root = document) =>
        Array.from(root.querySelectorAll(selector));

    /* =========================================================
       HELPERS
    ========================================================= */

    function escapeHTML(value = "") {
        return String(value)
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }

    function escapeAttr(value = "") {
        return escapeHTML(value);
    }

    function initials(name = "") {
        const parts = String(name)
            .trim()
            .split(/\s+/)
            .filter(Boolean);

        if (!parts.length) return "?";

        return parts
            .slice(0, 2)
            .map((part) => part.charAt(0).toUpperCase())
            .join("");
    }

    function formatTime(date) {
        if (!date) return "";

        const d = new Date(date);

        if (Number.isNaN(d.getTime())) return "";

        return d.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit"
        });
    }

    function formatDate(date) {
        if (!date) return "";

        const d = new Date(date);

        if (Number.isNaN(d.getTime())) return "";

        return d.toLocaleDateString([], {
            year: "numeric",
            month: "short",
            day: "numeric"
        });
    }

    function isVerifiedActive(profile) {
        if (!profile?.is_verified) return false;

        if (!profile.verified_until) return true;

        return new Date(profile.verified_until).getTime() > Date.now();
    }

    function verifiedHTML(profile) {
        if (!isVerifiedActive(profile)) return "";

        return `<span class="verified-badge">✓</span>`;
    }

    function avatarHTML(profile, extraClass = "") {
        const name =
            profile?.full_name ||
            profile?.username ||
            "User";

        const avatar = profile?.avatar_url;

        if (avatar) {
            return `
                <div class="avatar ${extraClass}">
                    <img
                        src="${escapeAttr(avatar)}"
                        alt=""
                    >
                </div>
            `;
        }

        return `
            <div class="avatar ${extraClass}">
                <span>${escapeHTML(initials(name))}</span>
            </div>
        `;
    }

    function toast(message, type = "info") {
        const box = $("toast");
        const text = $("toastMessage");

        if (!box || !text) return;

        text.textContent = message;

        box.classList.remove(
            "success",
            "error",
            "warning",
            "show"
        );

        box.classList.add(type);

        requestAnimationFrame(() => {
            box.classList.add("show");
        });

        clearTimeout(box._timer);

        box._timer = setTimeout(() => {
            box.classList.remove("show");
        }, 3000);
    }

    function showError(error, fallback = "Something went wrong.") {
        console.error(error);

        let message = fallback;

        if (error?.message) {
            message = error.message;
        }

        toast(message, "error");
    }

    /* =========================================================
       MODALS
    ========================================================= */

    function openModal(id) {
        const modal = $(id);

        if (!modal) return;

        modal.classList.add("open");
        modal.setAttribute("aria-hidden", "false");
    }

    function closeModal(id) {
        const modal = $(id);

        if (!modal) return;

        modal.classList.remove("open");
        modal.setAttribute("aria-hidden", "true");
    }

    function closeAllModals() {
        $$(".modal.open").forEach((modal) => {
            modal.classList.remove("open");
            modal.setAttribute("aria-hidden", "true");
        });
    }

    /* =========================================================
       AUTH
    ========================================================= */

    async function initAuth() {
        const {
            data: { session },
            error
        } = await db.auth.getSession();

        if (error) {
            showError(error);
            return false;
        }

        if (!session?.user) {
            window.location.href = "index.html";
            return false;
        }

        currentUser = session.user;

        return true;
    }

    async function loadMyProfile() {
        const { data, error } = await db
            .from("profiles")
            .select("*")
            .eq("id", currentUser.id)
            .maybeSingle();

        if (error) {
            showError(error);
            return false;
        }

        if (!data) {
            toast("Profile not found.", "error");
            return false;
        }

        currentProfile = data;
        currentRole = data.role || "user";

        if (
            data.account_blocked &&
            (
                !data.account_blocked_until ||
                new Date(data.account_blocked_until).getTime() > Date.now()
            )
        ) {
            await db.auth.signOut();
            alert("Your account is blocked.");
            window.location.href = "index.html";
            return false;
        }

        renderMyProfile();

        return true;
    }

    function renderMyProfile() {
        if (!currentProfile) return;

        const name = currentProfile.full_name ||
            currentProfile.username ||
            "User";

        const username = currentProfile.username || "";

        const nameElement = $("profileFullName");
        const usernameElement = $("profileUsername");
        const bioElement = $("profileBio");

        if (nameElement) {
            nameElement.value = name;
        }

        if (usernameElement) {
            usernameElement.value = username;
        }

        if (bioElement) {
            bioElement.value = currentProfile.bio || "";
        }

        const preview = $("profileAvatarPreview");
        const initial = $("profileAvatarInitial");

        if (preview) {
            preview.innerHTML = currentProfile.avatar_url
                ? `<img src="${escapeAttr(currentProfile.avatar_url)}" alt="">`
                : `<span>${escapeHTML(initials(name))}</span>`;
        }

        if (initial) {
            initial.textContent = currentProfile.avatar_url
                ? ""
                : initials(name);
        }
    }

    /* =========================================================
       PROFILE
    ========================================================= */

    async function saveProfile(event) {
        event?.preventDefault();

        if (!currentUser) return;

        const fullName = $("profileFullName")?.value.trim() || "";
        const username = $("profileUsername")?.value
            .trim()
            .toLowerCase() || "";

        const bio = $("profileBio")?.value.trim() || "";

        if (!fullName) {
            toast("Enter your name.", "warning");
            return;
        }

        if (!/^[a-z0-9_]{3,32}$/.test(username)) {
            toast(
                "Username must contain 3-32 lowercase letters, numbers or _.",
                "warning"
            );
            return;
        }

        const { data: existing, error: existingError } = await db
            .from("profiles")
            .select("id")
            .eq("username", username)
            .neq("id", currentUser.id)
            .maybeSingle();

        if (existingError) {
            showError(existingError);
            return;
        }

        if (existing) {
            toast("That username is already taken.", "error");
            return;
        }

        const { data, error } = await db
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
            showError(error);
            return;
        }

        currentProfile = data;

        renderMyProfile();

        closeModal("profileModal");

        await refreshSidebar();

        toast("Profile updated.", "success");
    }

    async function uploadAvatar(file) {
        if (!file || !currentUser) return;

        if (!file.type.startsWith("image/")) {
            toast("Please choose an image.", "warning");
            return;
        }

        if (file.size > 5 * 1024 * 1024) {
            toast("Image must be smaller than 5 MB.", "warning");
            return;
        }

        const extension =
            file.name.split(".").pop()?.toLowerCase() || "jpg";

        const path =
            `${currentUser.id}/${Date.now()}.${extension}`;

        const { error: uploadError } = await db.storage
            .from("avatars")
            .upload(path, file, {
                upsert: true
            });

        if (uploadError) {
            showError(uploadError);
            return;
        }

        const {
            data: publicData
        } = db.storage
            .from("avatars")
            .getPublicUrl(path);

        const avatarUrl = publicData?.publicUrl;

        if (!avatarUrl) {
            toast("Could not create avatar URL.", "error");
            return;
        }

        const { error } = await db
            .from("profiles")
            .update({
                avatar_url: avatarUrl
            })
            .eq("id", currentUser.id);

        if (error) {
            showError(error);
            return;
        }

        currentProfile.avatar_url = avatarUrl;

        renderMyProfile();

        await refreshSidebar();

        toast("Avatar updated.", "success");
    }

    async function handleProfileAvatar(event) {
        const file = event.target.files?.[0];

        if (file) {
            await uploadAvatar(file);
        }

        event.target.value = "";
    }

    /* =========================================================
       PRIVACY
    ========================================================= */

    function loadPrivacy() {
        if (!currentProfile) return;

        if ($("showOnlineToggle")) {
            $("showOnlineToggle").checked =
                currentProfile.show_online !== false;
        }

        if ($("showLastSeenToggle")) {
            $("showLastSeenToggle").checked =
                currentProfile.show_last_seen !== false;
        }
    }

    async function savePrivacy() {
        const showOnline =
            $("showOnlineToggle")?.checked !== false;

        const showLastSeen =
            $("showLastSeenToggle")?.checked !== false;

        const { data, error } = await db
            .from("profiles")
            .update({
                show_online: showOnline,
                show_last_seen: showLastSeen
            })
            .eq("id", currentUser.id)
            .select()
            .single();

        if (error) {
            showError(error);
            return;
        }

        currentProfile = data;

        closeModal("privacyModal");

        toast("Privacy settings saved.", "success");
    }

    /* =========================================================
       CONTACT REQUESTS
    ========================================================= */

    async function getContactRequests() {
        if (!currentUser) return [];

        const { data, error } = await db
            .from("contact_requests")
            .select("*")
            .or(
                `sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`
            )
            .order("created_at", {
                ascending: false
            });

        if (error) {
            console.error("Contact requests:", error);
            return [];
        }

        currentRequests = data || [];

        return currentRequests;
    }

    async function getProfiles(ids) {
        const cleanIds = [...new Set(
            (ids || []).filter(Boolean)
        )];

        if (!cleanIds.length) return [];

        const { data, error } = await db
            .from("profiles")
            .select("*")
            .in("id", cleanIds);

        if (error) {
            console.error("Profiles:", error);
            return [];
        }

        return data || [];
    }

    async function loadIncomingRequests() {
        const requests = await getContactRequests();

        const incoming = requests.filter(
            (request) =>
                request.receiver_id === currentUser.id &&
                request.status === "pending"
        );

        if (!incoming.length) return [];

        const profiles = await getProfiles(
            incoming.map((request) => request.sender_id)
        );

        return incoming.map((request) => ({
            request,
            profile: profiles.find(
                (profile) =>
                    profile.id === request.sender_id
            )
        }));
    }

    async function getAcceptedContacts() {
        const requests = await getContactRequests();

        const ids = [];

        requests.forEach((request) => {
            if (request.status !== "accepted") return;

            if (request.sender_id === currentUser.id) {
                ids.push(request.receiver_id);
            }

            if (request.receiver_id === currentUser.id) {
                ids.push(request.sender_id);
            }
        });

        return getProfiles(ids);
    }

    async function getRelationship(userId) {
        if (!userId || !currentUser) return null;

        const { data, error } = await db
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
            console.error("Relationship:", error);
            return null;
        }

        return data;
    }

    async function sendContactRequest(userId) {
        if (!userId || userId === currentUser.id) return;

        const relationship = await getRelationship(userId);

        if (relationship?.status === "accepted") {
            toast("You are already contacts.", "info");
            return;
        }

        if (relationship?.status === "pending") {
            toast("Request already pending.", "info");
            return;
        }

        const { error } = await db
            .from("contact_requests")
            .insert({
                sender_id: currentUser.id,
                receiver_id: userId,
                status: "pending"
            });

        if (error) {
            showError(error);
            return;
        }

        toast("Contact request sent.", "success");

        await renderContactActions();
    }

    async function acceptContactRequest(requestId) {
        const { error } = await db
            .from("contact_requests")
            .update({
                status: "accepted"
            })
            .eq("id", requestId)
            .eq("receiver_id", currentUser.id);

        if (error) {
            showError(error);
            return;
        }

        toast("Contact accepted.", "success");

        await refreshSidebar();

        if (activeChatUser) {
            await renderContactActions();
        }
    }

    async function declineContactRequest(requestId) {
        const { error } = await db
            .from("contact_requests")
            .update({
                status: "declined"
            })
            .eq("id", requestId)
            .eq("receiver_id", currentUser.id);

        if (error) {
            showError(error);
            return;
        }

        toast("Request declined.", "info");

        await refreshSidebar();
    }

    /* =========================================================
       SIDEBAR
    ========================================================= */

    async function refreshSidebar() {
        if (!currentUser) return;

        if (currentTab === "groups") {
            await loadGroups();
            return;
        }

        if (currentTab === "channels") {
            await loadChannels();
            return;
        }

        const list = $("userList");

        if (!list) return;

        list.innerHTML = `
            <div class="list-loading">
                Loading...
            </div>
        `;

        const [contacts, requests] = await Promise.all([
            getAcceptedContacts(),
            loadIncomingRequests()
        ]);

        list.innerHTML = "";

        if (requests.length) {
            const requestTitle = document.createElement("div");

            requestTitle.className = "list-section-title";
            requestTitle.textContent = "Contact requests";

            list.appendChild(requestTitle);

            requests.forEach((item) => {
                if (!item.profile) return;

                const row = document.createElement("div");

                row.className = "user-list-item request-item";

                row.innerHTML = `
                    ${avatarHTML(item.profile)}

                    <div class="list-item-info">
                        <strong>
                            ${escapeHTML(
                                item.profile.full_name ||
                                item.profile.username
                            )}
                            ${verifiedHTML(item.profile)}
                        </strong>

                        <small>
                            @${escapeHTML(item.profile.username || "")}
                        </small>
                    </div>

                    <div class="request-actions">
                        <button
                            type="button"
                            class="request-accept"
                            data-request-action="accept"
                            data-request-id="${item.request.id}"
                        >
                            ✓
                        </button>

                        <button
                            type="button"
                            class="request-decline"
                            data-request-action="decline"
                            data-request-id="${item.request.id}"
                        >
                            ×
                        </button>
                    </div>
                `;

                row.addEventListener("click", (event) => {
                    if (
                        event.target.closest(
                            "[data-request-action]"
                        )
                    ) {
                        return;
                    }

                    openDirectChat(item.profile);
                });

                list.appendChild(row);
            });
        }

        if (!contacts.length && !requests.length) {
            list.innerHTML += `
                <div class="empty-list">
                    <i class="fa-solid fa-user-group"></i>
                    <strong>No chats yet</strong>
                    <span>Search for a username to start.</span>
                </div>
            `;

            return;
        }

        if (contacts.length) {
            const title = document.createElement("div");

            title.className = "list-section-title";
            title.textContent = "Chats";

            list.appendChild(title);

            contacts.forEach((profile) => {
                list.appendChild(
                    createUserListItem(profile)
                );
            });
        }
    }

    function createUserListItem(profile) {
        const row = document.createElement("button");

        row.type = "button";
        row.className = "user-list-item";

        row.innerHTML = `
            ${avatarHTML(profile)}

            <div class="list-item-info">
                <strong>
                    ${escapeHTML(
                        profile.full_name ||
                        profile.username ||
                        "User"
                    )}
                    ${verifiedHTML(profile)}
                </strong>

                <small>
                    @${escapeHTML(profile.username || "")}
                </small>
            </div>
        `;

        row.addEventListener("click", () => {
            openDirectChat(profile);
        });

        return row;
    }

    /* =========================================================
       TABS
    ========================================================= */

    function setupTabs() {
        $$(".sidebar-tab").forEach((button) => {
            button.addEventListener("click", async () => {

                $$(".sidebar-tab").forEach((item) => {
                    item.classList.remove("active");
                });

                button.classList.add("active");

                currentTab =
                    button.dataset.tab || "chats";

                if ($("userList")) {
                    $("userList").style.display =
                        currentTab === "chats"
                            ? ""
                            : "none";
                }

                if ($("groupsList")) {
                    $("groupsList").style.display =
                        currentTab === "groups"
                            ? ""
                            : "none";
                }

                if ($("channelsList")) {
                    $("channelsList").style.display =
                        currentTab === "channels"
                            ? ""
                            : "none";
                }

                await refreshSidebar();
            });
        });
    }

    /* =========================================================
       SEARCH
    ========================================================= */

    async function searchEverything(query) {
        query = String(query || "").trim();

        if (!query) {
            await refreshSidebar();
            return;
        }

        const list = $("userList");

        if (!list) return;

        list.innerHTML = `
            <div class="list-loading">
                Searching...
            </div>
        `;

        const clean = query.replace(/^@/, "");

        const [
            profilesResult,
            groupsResult,
            channelsResult
        ] = await Promise.all([
            db
                .from("profiles")
                .select("*")
                .or(
                    `username.ilike.%${clean}%,full_name.ilike.%${clean}%`
                )
                .limit(30),

            db
                .from("groups")
                .select("*")
                .or(
                    `username.ilike.%${clean}%,name.ilike.%${clean}%`
                )
                .limit(20),

            db
                .from("channels")
                .select("*")
                .or(
                    `username.ilike.%${clean}%,name.ilike.%${clean}%`
                )
                .limit(20)
        ]);

        list.innerHTML = "";

        if (profilesResult.error) {
            console.error(profilesResult.error);
        }

        const profiles = profilesResult.data || [];
        const groups = groupsResult.data || [];
        const channels = channelsResult.data || [];

        if (!profiles.length && !groups.length && !channels.length) {
            list.innerHTML = `
                <div class="empty-list">
                    <i class="fa-solid fa-magnifying-glass"></i>
                    <strong>Nothing found</strong>
                    <span>Try another username.</span>
                </div>
            `;

            return;
        }

        profiles.forEach((profile) => {
            if (profile.id === currentUser.id) return;

            list.appendChild(
                createSearchUser(profile)
            );
        });

        groups.forEach((group) => {
            list.appendChild(
                createSearchCommunity(group, "group")
            );
        });

        channels.forEach((channel) => {
            list.appendChild(
                createSearchCommunity(channel, "channel")
            );
        });
    }

    function createSearchUser(profile) {
        const row = document.createElement("button");

        row.type = "button";
        row.className = "user-list-item";

        row.innerHTML = `
            ${avatarHTML(profile)}

            <div class="list-item-info">
                <strong>
                    ${escapeHTML(
                        profile.full_name ||
                        profile.username ||
                        "User"
                    )}
                    ${verifiedHTML(profile)}
                </strong>

                <small>
                    @${escapeHTML(profile.username || "")}
                </small>
            </div>
        `;

        row.addEventListener("click", () => {
            openDirectChat(profile);
        });

        return row;
    }

    function createSearchCommunity(item, type) {
        const row = document.createElement("button");

        row.type = "button";
        row.className = "user-list-item";

        const name =
            item.name ||
            item.username ||
            "Community";

        row.innerHTML = `
            <div class="avatar">
                <span>${escapeHTML(initials(name))}</span>
            </div>

            <div class="list-item-info">
                <strong>
                    ${escapeHTML(name)}
                </strong>

                <small>
                    ${type === "group" ? "Group" : "Channel"}
                    · @${escapeHTML(item.username || "")}
                </small>
            </div>
        `;

        row.addEventListener("click", () => {
            openCommunity(item, type);
        });

        return row;
    }

    /* =========================================================
       DIRECT CHAT
    ========================================================= */

    async function openDirectChat(profile) {
        if (!profile) return;

        activeChatUser = profile;
        activeCommunity = null;
        activeCommunityType = null;
        activeUserProfile = profile;

        $("chatEmpty")?.classList.add("hidden");
        $("activeChat")?.classList.remove("hidden");

        renderChatHeader();

        await renderContactActions();

        await loadDirectMessages();

        if (window.innerWidth <= 800) {
            $("sidebar")?.classList.add("mobile-hidden");
        }
    }

    function renderChatHeader() {
        if (!activeChatUser) return;

        const name =
            activeChatUser.full_name ||
            activeChatUser.username ||
            "User";

        if ($("chatName")) {
            $("chatName").textContent = name;
        }

        if ($("chatVerified")) {
            $("chatVerified").outerHTML =
                isVerifiedActive(activeChatUser)
                    ? `<span id="chatVerified" class="verified-badge">✓</span>`
                    : `<span id="chatVerified" class="verified-badge hidden">✓</span>`;
        }

        if ($("chatAvatar")) {
            $("chatAvatar").innerHTML =
                activeChatUser.avatar_url
                    ? `<img src="${escapeAttr(activeChatUser.avatar_url)}" alt="">`
                    : `<span>${escapeHTML(initials(name))}</span>`;
        }

        if ($("chatStatus")) {
            if (
                activeChatUser.show_online !== false &&
                activeChatUser.last_seen
            ) {
                $("chatStatus").textContent =
                    "last seen " +
                    formatDate(activeChatUser.last_seen);
            } else {
                $("chatStatus").textContent =
                    "offline";
            }
        }
    }

    async function renderContactActions() {
        const box = $("contactActions");

        if (!box || !activeChatUser) return;

        const relationship =
            await getRelationship(activeChatUser.id);

        box.classList.remove("hidden");

        const add = $("addContactBtn");
        const accept = $("acceptContactBtn");
        const decline = $("declineContactBtn");

        [add, accept, decline].forEach((button) => {
            button?.classList.add("hidden");
        });

        if (relationship?.status === "accepted") {
            box.classList.add("hidden");
            showDirectComposer(true);
            return;
        }

        showDirectComposer(false);

        if (!relationship) {
            add?.classList.remove("hidden");
            return;
        }

        if (
            relationship.status === "pending" &&
            relationship.receiver_id === currentUser.id
        ) {
            accept?.classList.remove("hidden");
            decline?.classList.remove("hidden");
            return;
        }

        if (
            relationship.status === "pending" &&
            relationship.sender_id === currentUser.id
        ) {
            add?.classList.remove("hidden");
            if (add) add.textContent = "Request sent";
            if (add) add.disabled = true;
        }
    }

    function showDirectComposer(show) {
        const form = $("messageForm");

        if (!form) return;

        form.classList.toggle("hidden", !show);
    }

    async function loadDirectMessages() {
        if (!activeChatUser) return;

        const messages = $("messages");

        if (!messages) return;

        messages.innerHTML = `
            <div class="list-loading">
                Loading messages...
            </div>
        `;

        const otherId = activeChatUser.id;

        const { data, error } = await db
            .from("messages")
            .select("*")
            .or(
                `and(sender_id.eq.${currentUser.id},receiver_id.eq.${otherId}),and(sender_id.eq.${otherId},receiver_id.eq.${currentUser.id})`
            )
            .order("created_at", {
                ascending: true
            });

        if (error) {
            showError(error);
            return;
        }

        currentMessages = data || [];

        await renderMessages(currentMessages);
    }

    /* =========================================================
       MEDIA
    ========================================================= */

    async function getMediaUrl(path) {
        if (!path) return "";

        const { data, error } = await db.storage
            .from("chat-media")
            .createSignedUrl(path, 60 * 60);

        if (error) {
            console.error(error);
            return "";
        }

        return data?.signedUrl || "";
    }

    /* =========================================================
       MESSAGES
    ========================================================= */

    async function renderMessages(messages) {
        const container = $("messages");

        if (!container) return;

        container.innerHTML = "";

        if (!messages.length) {
            container.innerHTML = `
                <div class="empty-messages">
                    <i class="fa-regular fa-message"></i>
                    <span>No messages yet.</span>
                </div>
            `;

            return;
        }

        for (const message of messages) {
            const mine =
                message.sender_id === currentUser.id;

            const wrapper =
                document.createElement("div");

            wrapper.className =
                `message-wrapper ${mine ? "mine" : "theirs"}`;

            wrapper.dataset.messageId = message.id;

            let content = "";

            if (message.deleted_at) {
                content = `
                    <div class="message-bubble deleted">
                        <i>This message was deleted</i>
                    </div>
                `;
            } else if (
                message.message_type === "image" &&
                message.image_url
            ) {
                const url =
                    await getMediaUrl(message.image_url);

                content = `
                    <div class="message-bubble image-message">
                        ${
                            url
                                ? `<img src="${escapeAttr(url)}" alt="Image">`
                                : "Image unavailable"
                        }
                    </div>
                `;
            } else if (
                message.message_type === "sticker" &&
                message.sticker_url
            ) {
                content = `
                    <div class="message-bubble sticker-message">
                        <img
                            src="${escapeAttr(message.sticker_url)}"
                            alt="Sticker"
                        >
                    </div>
                `;
            } else {
                content = `
                    <div class="message-bubble">
                        ${escapeHTML(message.content || "")}
                    </div>
                `;
            }

            const edited =
                message.edited_at && !message.deleted_at
                    ? `<span class="edited-label">edited</span>`
                    : "";

            wrapper.innerHTML = `
                <div class="message-content">
                    ${content}

                    <div class="message-meta">
                        <span>
                            ${formatTime(message.created_at)}
                        </span>

                        ${edited}
                    </div>
                </div>

                <div class="message-actions">

                    ${
                        mine && !message.deleted_at
                            ? `
                                <button
                                    type="button"
                                    data-message-action="edit"
                                    data-message-id="${message.id}"
                                >
                                    <i class="fa-solid fa-pen"></i>
                                </button>
                            `
                            : ""
                    }

                    ${
                        mine && !message.deleted_at
                            ? `
                                <button
                                    type="button"
                                    data-message-action="delete"
                                    data-message-id="${message.id}"
                                >
                                    <i class="fa-solid fa-trash"></i>
                                </button>
                            `
                            : ""
                    }

                    <button
                        type="button"
                        data-message-action="save"
                        data-message-id="${message.id}"
                    >
                        <i class="fa-solid fa-bookmark"></i>
                    </button>

                </div>
            `;

            container.appendChild(wrapper);
        }

        setupMessageInteractions();

        requestAnimationFrame(() => {
            container.scrollTop = container.scrollHeight;
        });
    }

    /* =========================================================
       MESSAGE ACTIONS
    ========================================================= */

    function setupMessageInteractions() {
        $$(".message-wrapper").forEach((wrapper) => {

            let startX = 0;
            let startY = 0;
            let holding = false;
            let holdTimer = null;

            const start = (event) => {
                const point =
                    event.touches?.[0] ||
                    event;

                startX = point.clientX;
                startY = point.clientY;

                holding = false;

                clearTimeout(holdTimer);

                holdTimer = setTimeout(() => {
                    holding = true;
                    wrapper.classList.add("swiped");
                }, 450);
            };

            const move = (event) => {
                const point =
                    event.touches?.[0] ||
                    event;

                const dx = point.clientX - startX;
                const dy = point.clientY - startY;

                if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) {
                    clearTimeout(holdTimer);
                    return;
                }

                if (Math.abs(dx) > 8) {
                    clearTimeout(holdTimer);
                }

                if (dx < -45) {
                    wrapper.classList.add("swiped");
                }

                if (dx > 25 && !holding) {
                    wrapper.classList.remove("swiped");
                }
            };

            const end = () => {
                clearTimeout(holdTimer);
            };

            wrapper.addEventListener("pointerdown", start);
            wrapper.addEventListener("pointermove", move);
            wrapper.addEventListener("pointerup", end);
            wrapper.addEventListener("pointercancel", end);
        });

        $$(".message-wrapper [data-message-action]").forEach(
            (button) => {

                button.addEventListener("click", async (event) => {
                    event.stopPropagation();

                    const action =
                        button.dataset.messageAction;

                    const id =
                        button.dataset.messageId;

                    if (action === "edit") {
                        await editMessage(id);
                    }

                    if (action === "delete") {
                        await deleteMessage(id);
                    }

                    if (action === "save") {
                        await saveMessage(id);
                    }

                    const wrapper =
                        button.closest(".message-wrapper");

                    wrapper?.classList.remove("swiped");
                });
            }
        );
    }

    async function sendMessage(event) {
        event?.preventDefault();

        if (!activeChatUser) return;

        const input = $("messageInput");

        if (!input) return;

        const content = input.value.trim();

        if (!content) return;

        const relationship =
            await getRelationship(activeChatUser.id);

        if (relationship?.status !== "accepted") {
            toast(
                "You can only message accepted contacts.",
                "warning"
            );
            return;
        }

        if (
            currentProfile?.messaging_blocked &&
            (
                !currentProfile.messaging_blocked_until ||
                new Date(
                    currentProfile.messaging_blocked_until
                ).getTime() > Date.now()
            )
        ) {
            toast("Messaging is blocked on your account.", "error");
            return;
        }

        const { error } = await db
            .from("messages")
            .insert({
                sender_id: currentUser.id,
                receiver_id: activeChatUser.id,
                content,
                message_type: "text"
            });

        if (error) {
            showError(error);
            return;
        }

        input.value = "";

        await loadDirectMessages();
    }

    async function sendImage(event) {
        const file =
            event.target.files?.[0];

        event.target.value = "";

        if (!file || !activeChatUser) return;

        if (!file.type.startsWith("image/")) {
            toast("Please select an image.", "warning");
            return;
        }

        if (file.size > 10 * 1024 * 1024) {
            toast("Image must be smaller than 10 MB.", "warning");
            return;
        }

        const relationship =
            await getRelationship(activeChatUser.id);

        if (relationship?.status !== "accepted") {
            toast(
                "You can only send messages to contacts.",
                "warning"
            );
            return;
        }

        const extension =
            file.name.split(".").pop()?.toLowerCase() || "jpg";

        const path =
            `${currentUser.id}/${Date.now()}-${Math.random()
                .toString(36)
                .slice(2)}.${extension}`;

        const { error: uploadError } = await db.storage
            .from("chat-media")
            .upload(path, file);

        if (uploadError) {
            showError(uploadError);
            return;
        }

        const { error } = await db
            .from("messages")
            .insert({
                sender_id: currentUser.id,
                receiver_id: activeChatUser.id,
                content: "",
                message_type: "image",
                image_url: path
            });

        if (error) {
            showError(error);
            return;
        }

        await loadDirectMessages();
    }

    async function editMessage(messageId) {
        const message =
            currentMessages.find(
                (item) =>
                    String(item.id) === String(messageId)
            );

        if (!message) return;

        if (message.sender_id !== currentUser.id) {
            toast("You can only edit your own message.", "error");
            return;
        }

        const next =
            prompt(
                "Edit message:",
                message.content || ""
            );

        if (next === null) return;

        const content = next.trim();

        if (!content) return;

        const { error } = await db
            .from("messages")
            .update({
                content,
                edited_at: new Date().toISOString()
            })
            .eq("id", messageId)
            .eq("sender_id", currentUser.id);

        if (error) {
            showError(error);
            return;
        }

        await loadDirectMessages();
    }

    async function deleteMessage(messageId) {
        const message =
            currentMessages.find(
                (item) =>
                    String(item.id) === String(messageId)
            );

        if (!message) return;

        if (message.sender_id !== currentUser.id) {
            toast("You can only delete your own message.", "error");
            return;
        }

        if (!confirm("Delete this message?")) return;

        const { error } = await db
            .from("messages")
            .update({
                deleted_at: new Date().toISOString(),
                content: ""
            })
            .eq("id", messageId)
            .eq("sender_id", currentUser.id);

        if (error) {
            showError(error);
            return;
        }

        await loadDirectMessages();
    }

    async function saveMessage(messageId) {
        const message =
            currentMessages.find(
                (item) =>
                    String(item.id) === String(messageId)
            );

        if (!message) return;

        const { error } = await db
            .from("saved_messages")
            .insert({
                user_id: currentUser.id,
                message_id: message.id
            });

        if (error) {
            if (
                String(error.message || "")
                    .toLowerCase()
                    .includes("duplicate")
            ) {
                toast("Already saved.", "info");
                return;
            }

            showError(error);
            return;
        }

        toast("Message saved.", "success");
    }

    /* =========================================================
       GROUPS
    ========================================================= */

    async function loadGroups() {
        const container = $("groupsList");

        if (!container) return;

        const items =
            $("groupsItems");

        if (!items) return;

        items.innerHTML = `
            <div class="list-loading">
                Loading groups...
            </div>
        `;

        const { data: memberships, error } = await db
            .from("group_members")
            .select("group_id")
            .eq("user_id", currentUser.id);

        if (error) {
            console.error(error);
            items.innerHTML = `
                <div class="empty-list">
                    Unable to load groups.
                </div>
            `;
            return;
        }

        const ids =
            (memberships || []).map(
                (item) => item.group_id
            );

        let groups = [];

        if (ids.length) {
            const result = await db
                .from("groups")
                .select("*")
                .in("id", ids);

            if (!result.error) {
                groups = result.data || [];
            }
        }

        const publicResult = await db
            .from("groups")
            .select("*")
            .eq("privacy", "public")
            .limit(100);

        if (!publicResult.error) {
            const map = new Map();

            [...groups, ...(publicResult.data || [])]
                .forEach((group) => {
                    map.set(String(group.id), group);
                });

            groups = [...map.values()];
        }

        items.innerHTML = "";

        if (!groups.length) {
            items.innerHTML = `
                <div class="empty-list">
                    <i class="fa-solid fa-users"></i>
                    <strong>No groups</strong>
                    <span>Create or search for a group.</span>
                </div>
            `;
            return;
        }

        groups.forEach((group) => {
            items.appendChild(
                createCommunityItem(group, "group")
            );
        });
    }

    /* =========================================================
       CHANNELS
    ========================================================= */

    async function loadChannels() {
        const items = $("channelsItems");

        if (!items) return;

        items.innerHTML = `
            <div class="list-loading">
                Loading channels...
            </div>
        `;

        const { data: memberships, error } = await db
            .from("channel_members")
            .select("channel_id")
            .eq("user_id", currentUser.id);

        if (error) {
            console.error(error);
            items.innerHTML = `
                <div class="empty-list">
                    Unable to load channels.
                </div>
            `;
            return;
        }

        const ids =
            (memberships || []).map(
                (item) => item.channel_id
            );

        let channels = [];

        if (ids.length) {
            const result = await db
                .from("channels")
                .select("*")
                .in("id", ids);

            if (!result.error) {
                channels = result.data || [];
            }
        }

        const publicResult = await db
            .from("channels")
            .select("*")
            .eq("privacy", "public")
            .limit(100);

        if (!publicResult.error) {
            const map = new Map();

            [...channels, ...(publicResult.data || [])]
                .forEach((channel) => {
                    map.set(String(channel.id), channel);
                });

            channels = [...map.values()];
        }

        items.innerHTML = "";

        if (!channels.length) {
            items.innerHTML = `
                <div class="empty-list">
                    <i class="fa-solid fa-bullhorn"></i>
                    <strong>No channels</strong>
                    <span>Create or search for a channel.</span>
                </div>
            `;
            return;
        }

        channels.forEach((channel) => {
            items.appendChild(
                createCommunityItem(channel, "channel")
            );
        });
    }

    function createCommunityItem(item, type) {
        const button =
            document.createElement("button");

        button.type = "button";
        button.className = "user-list-item community-item";

        const name =
            item.name ||
            item.username ||
            "Community";

        button.innerHTML = `
            <div class="avatar">
                ${
                    item.avatar_url
                        ? `<img src="${escapeAttr(item.avatar_url)}" alt="">`
                        : `<span>${escapeHTML(initials(name))}</span>`
                }
            </div>

            <div class="list-item-info">
                <strong>${escapeHTML(name)}</strong>

                <small>
                    ${type === "group" ? "Group" : "Channel"}
                    · @${escapeHTML(item.username || "")}
                </small>
            </div>
        `;

        button.addEventListener("click", () => {
            openCommunity(item, type);
        });

        return button;
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
            $("groupBio")?.value.trim() || "";

        const privacy =
            document.querySelector(
                'input[name="groupPrivacy"]:checked'
            )?.value || "public";

        if (!name) {
            toast("Enter group name.", "warning");
            return;
        }

        if (!/^[a-z0-9_]{3,32}$/.test(username)) {
            toast("Invalid group username.", "warning");
            return;
        }

        const { data: groupId, error } =
            await db.rpc("create_group", {
                p_name: name,
                p_username: username,
                p_bio: bio
            });

        if (error) {
            showError(error);
            return;
        }

        const { error: updateError } =
            await db
                .from("groups")
                .update({
                    privacy
                })
                .eq("id", groupId);

        if (updateError) {
            console.error(updateError);
        }

        const file =
            $("groupAvatarInput")?.files?.[0];

        if (file) {
            await uploadCommunityAvatar(
                file,
                "group",
                groupId
            );
        }

        $("groupForm")?.reset();

        closeModal("createGroupModal");

        await loadGroups();

        toast("Group created.", "success");
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
            $("channelBio")?.value.trim() || "";

        const privacy =
            document.querySelector(
                'input[name="channelPrivacy"]:checked'
            )?.value || "public";

        if (!name) {
            toast("Enter channel name.", "warning");
            return;
        }

        if (!/^[a-z0-9_]{3,32}$/.test(username)) {
            toast("Invalid channel username.", "warning");
            return;
        }

        const { data: channelId, error } =
            await db.rpc("create_channel", {
                p_name: name,
                p_username: username,
                p_bio: bio
            });

        if (error) {
            showError(error);
            return;
        }

        const { error: updateError } =
            await db
                .from("channels")
                .update({
                    privacy
                })
                .eq("id", channelId);

        if (updateError) {
            console.error(updateError);
        }

        const file =
            $("channelAvatarInput")?.files?.[0];

        if (file) {
            await uploadCommunityAvatar(
                file,
                "channel",
                channelId
            );
        }

        $("channelForm")?.reset();

        closeModal("createChannelModal");

        await loadChannels();

        toast("Channel created.", "success");
    }

    async function uploadCommunityAvatar(file, type, id) {
        if (!file || !id) return;

        const bucket =
            type === "group"
                ? "group-avatars"
                : "channel-avatars";

        const extension =
            file.name.split(".").pop()?.toLowerCase() || "jpg";

        const path =
            `${id}/${Date.now()}.${extension}`;

        const { error } = await db.storage
            .from(bucket)
            .upload(path, file, {
                upsert: true
            });

        if (error) {
            console.error(error);
            return;
        }

        const {
            data
        } = db.storage
            .from(bucket)
            .getPublicUrl(path);

        const avatarUrl = data?.publicUrl;

        if (!avatarUrl) return;

        const table =
            type === "group"
                ? "groups"
                : "channels";

        await db
            .from(table)
            .update({
                avatar_url: avatarUrl
            })
            .eq("id", id);
    }

    /* =========================================================
       COMMUNITY
    ========================================================= */

    async function openCommunity(item, type) {
        if (!item) return;

        activeCommunity = item;
        activeCommunityType = type;
        activeChatUser = null;

        $("chatEmpty")?.classList.add("hidden");
        $("activeChat")?.classList.remove("hidden");

        renderCommunityHeader();

        const tableMembers =
            type === "group"
                ? "group_members"
                : "channel_members";

        const key =
            type === "group"
                ? "group_id"
                : "channel_id";

        const { data: membership } =
            await db
                .from(tableMembers)
                .select("*")
                .eq(key, item.id)
                .eq("user_id", currentUser.id)
                .maybeSingle();

        if (!membership) {
            showDirectComposer(false);

            $("contactActions")
                ?.classList.add("hidden");

            showCommunityJoinCard(item, type);

            return;
        }

        $("contactActions")
            ?.classList.add("hidden");

        if (type === "channel") {
            const role = membership.role;

            showDirectComposer(
                role === "owner" ||
                role === "admin"
            );
        } else {
            showDirectComposer(true);
        }

        await loadCommunityMessages();
    }

    function renderCommunityHeader() {
        if (!activeCommunity) return;

        const name =
            activeCommunity.name ||
            activeCommunity.username ||
            "Community";

        if ($("chatName")) {
            $("chatName").textContent = name;
        }

        if ($("chatVerified")) {
            $("chatVerified").classList.add("hidden");
        }

        if ($("chatStatus")) {
            $("chatStatus").textContent =
                activeCommunityType === "group"
                    ? "Group"
                    : "Channel";
        }

        if ($("chatAvatar")) {
            $("chatAvatar").innerHTML =
                activeCommunity.avatar_url
                    ? `<img src="${escapeAttr(activeCommunity.avatar_url)}" alt="">`
                    : `<span>${escapeHTML(initials(name))}</span>`;
        }
    }

    function showCommunityJoinCard(item, type) {
        const container = $("messages");

        if (!container) return;

        const name =
            item.name ||
            item.username ||
            "Community";

        const isPublic =
            item.privacy === "public";

        container.innerHTML = `
            <div class="community-join-card">

                <div class="community-join-image">
                    ${
                        item.avatar_url
                            ? `<img src="${escapeAttr(item.avatar_url)}" alt="">`
                            : `<span>${escapeHTML(initials(name))}</span>`
                    }
                </div>

                <h2>${escapeHTML(name)}</h2>

                <div class="community-join-username">
                    @${escapeHTML(item.username || "")}
                </div>

                <p>
                    ${escapeHTML(item.bio || "")}
                </p>

                <strong>
                    ${
                        isPublic
                            ? "Do you want to join?"
                            : "This is a private community."
                    }
                </strong>

                <div class="community-join-actions">

                    <button
                        type="button"
                        class="primary-btn"
                        id="communityJoinYesBtn"
                    >
                        YES
                    </button>

                    <button
                        type="button"
                        class="secondary-btn"
                        id="communityJoinNoBtn"
                    >
                        NO
                    </button>

                </div>

            </div>
        `;

        $("communityJoinYesBtn")
            ?.addEventListener("click", async () => {

                if (!isPublic) {
                    toast(
                        "Private communities require an invitation.",
                        "warning"
                    );

                    return;
                }

                await joinPublicCommunity(
                    item.id,
                    type
                );
            });

        $("communityJoinNoBtn")
            ?.addEventListener("click", () => {
                resetChat();
            });
    }

    async function joinPublicCommunity(id, type) {
        const table =
            type === "group"
                ? "group_members"
                : "channel_members";

        const key =
            type === "group"
                ? "group_id"
                : "channel_id";

        const { error } = await db
            .from(table)
            .insert({
                [key]: id,
                user_id: currentUser.id,
                role: "member"
            });

        if (error) {
            showError(
                error,
                "Public join is not enabled by the database yet."
            );
            return;
        }

        toast(
            `Joined ${type}.`,
            "success"
        );

        await openCommunity(
            activeCommunity,
            type
        );

        if (type === "group") {
            await loadGroups();
        } else {
            await loadChannels();
        }
    }

    async function loadCommunityMessages() {
        if (!activeCommunity) return;

        const table =
            activeCommunityType === "group"
                ? "group_messages"
                : "channel_messages";

        const key =
            activeCommunityType === "group"
                ? "group_id"
                : "channel_id";

        const { data, error } = await db
            .from(table)
            .select("*")
            .eq(key, activeCommunity.id)
            .order("created_at", {
                ascending: true
            });

        if (error) {
            showError(error);
            return;
        }

        currentMessages = data || [];

        await renderMessages(currentMessages);
    }

    async function sendCommunityMessage(event) {
        event?.preventDefault();

        if (!activeCommunity) return;

        const input = $("messageInput");

        const content =
            input?.value.trim();

        if (!content) return;

        const table =
            activeCommunityType === "group"
                ? "group_messages"
                : "channel_messages";

        const key =
            activeCommunityType === "group"
                ? "group_id"
                : "channel_id";

        const { error } = await db
            .from(table)
            .insert({
                [key]: activeCommunity.id,
                sender_id: currentUser.id,
                content,
                message_type: "text"
            });

        if (error) {
            showError(error);
            return;
        }

        input.value = "";

        await loadCommunityMessages();
    }

    /* =========================================================
       JOIN BY INVITE
    ========================================================= */

    async function joinGroup() {
        const code =
            $("groupInviteInput")?.value.trim();

        if (!code) {
            toast("Enter invite code.", "warning");
            return;
        }

        const { error } = await db.rpc(
            "join_group_by_invite",
            {
                p_invite_code: code
            }
        );

        if (error) {
            showError(error);
            return;
        }

        $("groupInviteInput").value = "";

        closeModal("joinGroupModal");

        await loadGroups();

        toast("Joined group.", "success");
    }

    async function joinChannel() {
        const code =
            $("channelInviteInput")?.value.trim();

        if (!code) {
            toast("Enter invite code.", "warning");
            return;
        }

        const { error } = await db.rpc(
            "join_channel_by_invite",
            {
                p_invite_code: code
            }
        );

        if (error) {
            showError(error);
            return;
        }

        $("channelInviteInput").value = "";

        closeModal("joinChannelModal");

        await loadChannels();

        toast("Joined channel.", "success");
    }

    /* =========================================================
       NICKNAME
    ========================================================= */

    async function saveNickname() {
        if (!activeUserProfile) return;

        const nickname =
            $("nicknameInput")?.value.trim();

        if (!nickname) {
            toast("Enter a nickname.", "warning");
            return;
        }

        const { error } = await db
            .from("contact_nicknames")
            .upsert({
                owner_id: currentUser.id,
                contact_id: activeUserProfile.id,
                nickname
            });

        if (error) {
            showError(error);
            return;
        }

        closeModal("nicknameModal");

        toast("Nickname saved.", "success");
    }

    async function removeNickname() {
        if (!activeUserProfile) return;

        const { error } = await db
            .from("contact_nicknames")
            .delete()
            .eq("owner_id", currentUser.id)
            .eq("contact_id", activeUserProfile.id);

        if (error) {
            showError(error);
            return;
        }

        closeModal("nicknameModal");

        toast("Nickname removed.", "success");
    }

    /* =========================================================
       USER PROFILE
    ========================================================= */

    function openUserProfile(profile) {
        if (!profile) return;

        activeUserProfile = profile;

        if ($("userProfileAvatar")) {
            $("userProfileAvatar").innerHTML =
                profile.avatar_url
                    ? `<img src="${escapeAttr(profile.avatar_url)}" alt="">`
                    : `<span>${escapeHTML(
                        initials(
                            profile.full_name ||
                            profile.username
                        )
                    )}</span>`;
        }

        if ($("userProfileName")) {
            $("userProfileName").textContent =
                profile.full_name ||
                profile.username ||
                "User";
        }

        if ($("userProfileUsername")) {
            $("userProfileUsername").textContent =
                `@${profile.username || ""}`;
        }

        if ($("userProfileBio")) {
            $("userProfileBio").textContent =
                profile.bio || "";
        }

        if ($("userProfileVerified")) {
            $("userProfileVerified")
                .classList.toggle(
                    "hidden",
                    !isVerifiedActive(profile)
                );
        }

        $("userProfileMenu")
            ?.classList.add("hidden");

        openModal("userProfileModal");
    }

    async function blockUser() {
        if (!activeUserProfile) return;

        if (
            !confirm(
                `Block @${activeUserProfile.username}?`
            )
        ) {
            return;
        }

        const { error } = await db
            .from("user_blocks")
            .insert({
                blocker_id: currentUser.id,
                blocked_id: activeUserProfile.id
            });

        if (error) {
            showError(error);
            return;
        }

        closeModal("userProfileModal");

        toast("User blocked.", "success");
    }

    async function reportUser() {
        if (!activeUserProfile) return;

        openModal("reportModal");
    }

    async function submitReport() {
        if (!activeUserProfile) return;

        const reason =
            document.querySelector(
                'input[name="reportReason"]:checked'
            )?.value || "other";

        const description =
            $("reportDescription")?.value.trim() || "";

        const { error } = await db
            .from("reports")
            .insert({
                reporter_id: currentUser.id,
                reported_user_id: activeUserProfile.id,
                reason,
                description
            });

        if (error) {
            showError(error);
            return;
        }

        $("reportDescription").value = "";

        closeModal("reportModal");

        toast("Report submitted.", "success");
    }

    /* =========================================================
       SAVED MESSAGES
    ========================================================= */

    async function loadSavedMessages() {
        const list =
            $("savedMessagesList");

        if (!list) return;

        list.innerHTML = `
            <div class="list-loading">
                Loading...
            </div>
        `;

        const { data, error } = await db
            .from("saved_messages")
            .select("*")
            .eq("user_id", currentUser.id)
            .order("created_at", {
                ascending: false
            });

        if (error) {
            showError(error);
            return;
        }

        list.innerHTML = "";

        if (!data?.length) {
            list.innerHTML = `
                <div class="empty-list">
                    <i class="fa-solid fa-bookmark"></i>
                    <strong>No saved messages</strong>
                </div>
            `;
            return;
        }

        data.forEach((item) => {
            const row =
                document.createElement("div");

            row.className = "saved-message-item";

            row.innerHTML = `
                <div>
                    ${escapeHTML(
                        item.content ||
                        "Saved message"
                    )}
                </div>

                <small>
                    ${formatDate(item.created_at)}
                </small>
            `;

            list.appendChild(row);
        });
    }

    /* =========================================================
       UPDATES
    ========================================================= */

    async function loadUpdates() {
        const list = $("updatesList");

        if (!list) return;

        const { data, error } = await db
            .from("app_updates")
            .select("*")
            .order("created_at", {
                ascending: false
            });

        if (error) {
            showError(error);
            return;
        }

        list.innerHTML = "";

        if (!data?.length) {
            list.innerHTML = `
                <div class="empty-list">
                    No updates yet.
                </div>
            `;
            return;
        }

        data.forEach((update) => {
            const item =
                document.createElement("article");

            item.className = "update-item";

            item.innerHTML = `
                <span class="update-type">
                    ${escapeHTML(update.type || "update")}
                </span>

                <h3>
                    ${escapeHTML(update.title || "")}
                </h3>

                <p>
                    ${escapeHTML(update.content || "")}
                </p>

                <small>
                    ${formatDate(update.created_at)}
                </small>
            `;

            list.appendChild(item);
        });
    }

    async function publishUpdate() {
        const type =
            $("updateType")?.value || "update";

        const title =
            $("updateTitle")?.value.trim();

        const content =
            $("updateContent")?.value.trim();

        if (!title || !content) {
            toast("Complete the update fields.", "warning");
            return;
        }

        if (
            currentRole !== "owner" &&
            currentRole !== "admin"
        ) {
            toast("Admin permission required.", "error");
            return;
        }

        const { error } = await db
            .from("app_updates")
            .insert({
                type,
                title,
                content,
                created_by: currentUser.id
            });

        if (error) {
            showError(error);
            return;
        }

        $("updateTitle").value = "";
        $("updateContent").value = "";

        await loadUpdates();

        toast("Update published.", "success");
    }

    /* =========================================================
       COMMUNITY INFO
    ========================================================= */

    async function renderCommunityInfo(type) {
        if (!activeCommunity) return;

        const prefix =
            type === "group"
                ? "group"
                : "channel";

        const name =
            activeCommunity.name || "";

        const username =
            activeCommunity.username || "";

        const privacy =
            activeCommunity.privacy || "public";

        const bio =
            activeCommunity.bio || "";

        $(`${prefix}InfoName`).textContent = name;

        $(`${prefix}InfoUsername`).textContent =
            `@${username}`;

        $(`${prefix}InfoPrivacy`).textContent =
            privacy;

        $(`${prefix}InfoBio`).textContent =
            bio;

        const avatar =
            $(`${prefix}InfoAvatar`);

        if (avatar) {
            avatar.innerHTML =
                activeCommunity.avatar_url
                    ? `<img src="${escapeAttr(activeCommunity.avatar_url)}" alt="">`
                    : `<span>${escapeHTML(initials(name))}</span>`;
        }
    }

    async function loadMembers(type) {
        if (!activeCommunity) return;

        const table =
            type === "group"
                ? "group_members"
                : "channel_members";

        const key =
            type === "group"
                ? "group_id"
                : "channel_id";

        const { data, error } = await db
            .from(table)
            .select("*")
            .eq(key, activeCommunity.id);

        if (error) {
            showError(error);
            return;
        }

        const profiles =
            await getProfiles(
                (data || []).map(
                    (member) => member.user_id
                )
            );

        const list =
            $("membersList");

        if (!list) return;

        list.innerHTML = "";

        (data || []).forEach((member) => {
            const profile =
                profiles.find(
                    (item) =>
                        item.id === member.user_id
                );

            if (!profile) return;

            const row =
                document.createElement("div");

            row.className = "member-item";

            row.innerHTML = `
                ${avatarHTML(profile)}

                <div class="list-item-info">
                    <strong>
                        ${escapeHTML(
                            profile.full_name ||
                            profile.username ||
                            "User"
                        )}
                    </strong>

                    <small>
                        @${escapeHTML(profile.username || "")}
                        · ${escapeHTML(member.role || "member")}
                    </small>
                </div>
            `;

            list.appendChild(row);
        });

        if ($("membersTitle")) {
            $("membersTitle").textContent =
                `${type === "group" ? "Group" : "Channel"} members`;
        }

        openModal("membersModal");
    }

    async function leaveCommunity(type) {
        if (!activeCommunity) return;

        const table =
            type === "group"
                ? "group_members"
                : "channel_members";

        const key =
            type === "group"
                ? "group_id"
                : "channel_id";

        if (!confirm("Leave this community?")) return;

        const { error } = await db
            .from(table)
            .delete()
            .eq(key, activeCommunity.id)
            .eq("user_id", currentUser.id);

        if (error) {
            showError(error);
            return;
        }

        closeModal(
            type === "group"
                ? "groupInfoModal"
                : "channelInfoModal"
        );

        resetChat();

        if (type === "group") {
            await loadGroups();
        } else {
            await loadChannels();
        }

        toast("You left the community.", "success");
    }

    function makeInviteCode() {
        const chars =
            "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

        let code = "";

        for (let i = 0; i < 10; i++) {
            code += chars.charAt(
                Math.floor(
                    Math.random() * chars.length
                )
            );
        }

        return code;
    }

    async function createInvite(type) {
        if (!activeCommunity) return;

        const table =
            type === "group"
                ? "group_invites"
                : "channel_invites";

        const key =
            type === "group"
                ? "group_id"
                : "channel_id";

        const code = makeInviteCode();

        const { error } = await db
            .from(table)
            .insert({
                [key]: activeCommunity.id,
                invite_code: code,
                created_by: currentUser.id
            });

        if (error) {
            showError(error);
            return;
        }

        try {
            await navigator.clipboard.writeText(code);

            toast(
                `Invite code copied: ${code}`,
                "success"
            );
        } catch {
            prompt(
                "Copy this invite code:",
                code
            );
        }
    }

    /* =========================================================
       OWNER
    ========================================================= */

    async function loadRole() {
        try {
            const { data, error } =
                await db.rpc("get_my_role");

            if (!error && data) {
                currentRole = data;
            }
        } catch {
            currentRole =
                currentProfile?.role || "user";
        }

        if (!currentRole) {
            currentRole =
                currentProfile?.role || "user";
        }

        $("ownerPanelButton")
            ?.classList.toggle(
                "hidden",
                currentRole !== "owner"
            );

        $("adminPanelButton")
            ?.classList.toggle(
                "hidden",
                currentRole !== "owner" &&
                currentRole !== "admin"
            );
    }

    async function ownerSearchVerified() {
        if (currentRole !== "owner") return;

        const username =
            $("ownerVerifiedUsername")
                ?.value
                .trim()
                .toLowerCase();

        if (!username) return;

        const { data, error } = await db
            .from("profiles")
            .select("*")
            .eq("username", username)
            .maybeSingle();

        if (error) {
            showError(error);
            return;
        }

        const result =
            $("ownerVerifiedResult");

        if (!result) return;

        if (!data) {
            result.innerHTML = `
                <div class="empty-list">
                    User not found.
                </div>
            `;
            return;
        }

        const active =
            isVerifiedActive(data);

        result.innerHTML = `
            <div class="owner-result-card">

                ${avatarHTML(data)}

                <div class="list-item-info">
                    <strong>
                        ${escapeHTML(
                            data.full_name ||
                            data.username
                        )}
                    </strong>

                    <small>
                        @${escapeHTML(data.username)}
                    </small>

                    <small>
                        ${
                            active
                                ? "Verified"
                                : "Not verified"
                        }
                    </small>
                </div>

                <button
                    type="button"
                    class="primary-btn"
                    id="toggleVerifiedBtn"
                >
                    ${
                        active
                            ? "Remove"
                            : "Give badge"
                    }
                </button>

            </div>
        `;

        $("toggleVerifiedBtn")
            ?.addEventListener(
                "click",
                () => toggleOwnerVerified(data)
            );
    }

    async function toggleOwnerVerified(profile) {
        if (currentRole !== "owner") {
            toast("Owner permission required.", "error");
            return;
        }

        const active =
            isVerifiedActive(profile);

        const { error } = await db.rpc(
            "owner_set_verified",
            {
                p_user_id: profile.id,
                p_action: active
                    ? "remove"
                    : "give"
            }
        );

        if (error) {
            showError(error);
            return;
        }

        const duration =
            Number(
                $("verifiedDuration")?.value || 30
            );

        if (!active && duration > 0) {
            const until =
                new Date(
                    Date.now() +
                    duration *
                    24 *
                    60 *
                    60 *
                    1000
                ).toISOString();

            const { error: expiryError } =
                await db
                    .from("profiles")
                    .update({
                        verified_until: until
                    })
                    .eq("id", profile.id);

            if (expiryError) {
                console.warn(
                    "Verified expiry update failed:",
                    expiryError
                );
            }
        }

        toast(
            active
                ? "Verified badge removed."
                : "Verified badge granted.",
            "success"
        );

        await ownerSearchVerified();
    }

    async function ownerSearchModeration() {
        if (currentRole !== "owner") return;

        const username =
            $("ownerModerationUsername")
                ?.value
                .trim()
                .toLowerCase();

        if (!username) return;

        const { data, error } = await db
            .from("profiles")
            .select("*")
            .eq("username", username)
            .maybeSingle();

        if (error) {
            showError(error);
            return;
        }

        const result =
            $("ownerModerationResult");

        if (!result) return;

        if (!data) {
            result.innerHTML = `
                <div class="empty-list">
                    User not found.
                </div>
            `;
            return;
        }

        const blocked =
            data.account_blocked === true;

        result.innerHTML = `
            <div class="owner-result-card">

                ${avatarHTML(data)}

                <div class="list-item-info">
                    <strong>
                        ${escapeHTML(
                            data.full_name ||
                            data.username
                        )}
                    </strong>

                    <small>
                        @${escapeHTML(data.username)}
                    </small>

                    <small>
                        ${
                            blocked
                                ? "Blocked"
                                : "Active"
                        }
                    </small>
                </div>

                ${
                    data.id !== currentUser.id
                        ? `
                            <button
                                type="button"
                                class="${
                                    blocked
                                        ? "secondary-btn"
                                        : "danger-btn"
                                }"
                                id="ownerBlockToggleBtn"
                            >
                                ${
                                    blocked
                                        ? "Unblock"
                                        : "Block"
                                }
                            </button>
                        `
                        : `
                            <span class="owner-protected">
                                Owner
                            </span>
                        `
                }

            </div>
        `;

        $("ownerBlockToggleBtn")
            ?.addEventListener(
                "click",
                () => ownerToggleBlock(data)
            );
    }

    async function ownerToggleBlock(profile) {
        if (currentRole !== "owner") return;

        if (profile.id === currentUser.id) {
            toast(
                "Owner cannot be blocked.",
                "error"
            );
            return;
        }

        const next =
            !profile.account_blocked;

        const { error } = await db
            .from("profiles")
            .update({
                account_blocked: next,
                account_blocked_until: null
            })
            .eq("id", profile.id);

        if (error) {
            showError(error);
            return;
        }

        toast(
            next
                ? "User blocked."
                : "User unblocked.",
            "success"
        );

        await ownerSearchModeration();
    }

    async function loadOwnerReports() {
        const list =
            $("ownerReportsList");

        if (!list) return;

        const { data, error } = await db
            .from("reports")
            .select("*")
            .order("created_at", {
                ascending: false
            });

        if (error) {
            showError(error);
            return;
        }

        list.innerHTML = "";

        if (!data?.length) {
            list.innerHTML = `
                <div class="empty-list">
                    No reports.
                </div>
            `;
            return;
        }

        data.forEach((report) => {
            const row =
                document.createElement("div");

            row.className = "report-item";

            row.innerHTML = `
                <strong>
                    ${escapeHTML(report.reason || "Report")}
                </strong>

                <p>
                    ${escapeHTML(report.description || "")}
                </p>

                <small>
                    ${formatDate(report.created_at)}
                </small>
            `;

            list.appendChild(row);
        });
    }

    function setupOwnerTabs() {
        $$("[data-owner-tab]").forEach((button) => {

            button.addEventListener("click", async () => {

                $$("[data-owner-tab]").forEach(
                    (item) => {
                        item.classList.remove("active");
                    }
                );

                button.classList.add("active");

                const tab =
                    button.dataset.ownerTab;

                const panels = {
                    verified: $("ownerVerifiedPanel"),
                    moderation: $("ownerModerationPanel"),
                    admins: $("ownerAdminsPanel"),
                    reports: $("ownerReportsPanel")
                };

                Object.values(panels).forEach(
                    (panel) => {
                        panel?.classList.add("hidden");
                    }
                );

                panels[tab]?.classList.remove("hidden");

                if (tab === "reports") {
                    await loadOwnerReports();
                }
            });
        });
    }

    /* =========================================================
       ADMIN
    ========================================================= */

    async function openAdminPanel() {
        if (
            currentRole !== "owner" &&
            currentRole !== "admin"
        ) {
            toast(
                "Admin permission required.",
                "error"
            );
            return;
        }

        openModal("adminModal");
    }

    /* =========================================================
       APPEARANCE
    ========================================================= */

    function applyTheme(theme) {
        if (theme === "light") {
            document.body.classList.add("light-theme");
        } else {
            document.body.classList.remove("light-theme");
        }

        localStorage.setItem(
            "megchatbox-theme",
            theme
        );

        $$(".appearance-option[data-theme]")
            .forEach((button) => {
                button.classList.toggle(
                    "active",
                    button.dataset.theme === theme
                );
            });
    }

    function applyDensity(density) {
        document.body.classList.toggle(
            "compact-mode",
            density === "compact"
        );

        localStorage.setItem(
            "megchatbox-density",
            density
        );

        $$(".appearance-option[data-density]")
            .forEach((button) => {
                button.classList.toggle(
                    "active",
                    button.dataset.density === density
                );
            });
    }

    function applyLanguage(language) {
        localStorage.setItem(
            "megchatbox-language",
            language
        );

        toast(
            language === "uz"
                ? "Til sozlamasi saqlandi."
                : language === "ru"
                    ? "Язык сохранён."
                    : "Language saved.",
            "success"
        );
    }

    function loadAppearance() {
        const theme =
            localStorage.getItem(
                "megchatbox-theme"
            ) || "dark";

        const density =
            localStorage.getItem(
                "megchatbox-density"
            ) || "normal";

        applyTheme(theme);
        applyDensity(density);
    }

    /* =========================================================
       RESET CHAT
    ========================================================= */

    function resetChat() {
        activeChatUser = null;
        activeCommunity = null;
        activeCommunityType = null;
        activeUserProfile = null;
        currentMessages = [];

        $("activeChat")
            ?.classList.add("hidden");

        $("chatEmpty")
            ?.classList.remove("hidden");

        $("contactActions")
            ?.classList.add("hidden");

        $("messageForm")
            ?.classList.remove("hidden");

        if (window.innerWidth <= 800) {
            $("sidebar")
                ?.classList.remove("mobile-hidden");
        }
    }

    /* =========================================================
       LOGOUT
    ========================================================= */

    async function logout() {
        const { error } =
            await db.auth.signOut();

        if (error) {
            showError(error);
            return;
        }

        window.location.href = "index.html";
    }

    async function deleteAccount() {
        toast(
            "Account deletion requires a secure server-side function.",
            "warning"
        );
    }

    /* =========================================================
       CHAT SEARCH
    ========================================================= */

    function openChatSearch() {
        if (!activeChatUser && !activeCommunity) {
            return;
        }

        const existing =
            $("chatSearchOverlay");

        if (existing) {
            existing.remove();
            return;
        }

        const overlay =
            document.createElement("div");

        overlay.id =
            "chatSearchOverlay";

        overlay.className =
            "chat-search-overlay";

        overlay.innerHTML = `
            <div class="chat-search-box">

                <div class="chat-search-header">
                    <strong>Search messages</strong>

                    <button
                        type="button"
                        id="closeChatSearch"
                    >
                        ×
                    </button>
                </div>

                <input
                    type="text"
                    id="chatSearchInput"
                    placeholder="Search in this chat..."
                    autocomplete="off"
                >

                <div
                    id="chatSearchResults"
                    class="chat-search-results"
                ></div>

            </div>
        `;

        document.body.appendChild(overlay);

        $("closeChatSearch")
            ?.addEventListener(
                "click",
                () => overlay.remove()
            );

        $("chatSearchInput")
            ?.addEventListener(
                "input",
                () => {
                    renderChatSearchResults(
                        $("chatSearchInput").value
                    );
                }
            );

        $("chatSearchInput")?.focus();
    }

    function renderChatSearchResults(query) {
        const result =
            $("chatSearchResults");

        if (!result) return;

        const clean =
            query.trim().toLowerCase();

        if (!clean) {
            result.innerHTML = `
                <div class="empty-list">
                    Type something to search.
                </div>
            `;
            return;
        }

        const matches =
            currentMessages.filter(
                (message) =>
                    String(message.content || "")
                        .toLowerCase()
                        .includes(clean)
            );

        result.innerHTML = "";

        if (!matches.length) {
            result.innerHTML = `
                <div class="empty-list">
                    No messages found.
                </div>
            `;
            return;
        }

        matches.forEach((message) => {
            const item =
                document.createElement("button");

            item.type = "button";
            item.className = "chat-search-result";

            item.innerHTML = `
                <span>
                    ${escapeHTML(
                        message.content || ""
                    )}
                </span>

                <small>
                    ${formatTime(message.created_at)}
                </small>
            `;

            item.addEventListener(
                "click",
                () => {

                    const target =
                        document.querySelector(
                            `[data-message-id="${message.id}"]`
                        );

                    target?.scrollIntoView({
                        behavior: "smooth",
                        block: "center"
                    });

                    target?.classList.add(
                        "search-highlight"
                    );

                    setTimeout(() => {
                        target?.classList.remove(
                            "search-highlight"
                        );
                    }, 1500);

                    $("chatSearchOverlay")?.remove();
                }
            );

            result.appendChild(item);
        });
    }

    /* =========================================================
       EVENTS
    ========================================================= */

    function setupEvents() {

        /* ---------- Settings ---------- */

        $("settingsBtn")
            ?.addEventListener(
                "click",
                () => openModal("settingsModal")
            );

        $("profileSettingsBtn")
            ?.addEventListener(
                "click",
                () => {
                    closeModal("settingsModal");
                    renderMyProfile();
                    openModal("profileModal");
                }
            );

        $("privacySettingsBtn")
            ?.addEventListener(
                "click",
                () => {
                    closeModal("settingsModal");
                    loadPrivacy();
                    openModal("privacyModal");
                }
            );

        $("appearanceSettingsBtn")
            ?.addEventListener(
                "click",
                () => {
                    closeModal("settingsModal");
                    openModal("appearanceModal");
                }
            );

        $("languageSettingsBtn")
            ?.addEventListener(
                "click",
                () => {
                    closeModal("settingsModal");
                    openModal("languageModal");
                }
            );

        $("savedMessagesBtn")
            ?.addEventListener(
                "click",
                async () => {
                    closeModal("settingsModal");
                    openModal("savedMessagesModal");
                    await loadSavedMessages();
                }
            );

        $("updatesSettingsBtn")
            ?.addEventListener(
                "click",
                async () => {
                    closeModal("settingsModal");
                    openModal("updatesModal");
                    await loadUpdates();
                }
            );

        $("ownerPanelButton")
            ?.addEventListener(
                "click",
                async () => {
                    closeModal("settingsModal");

                    if (currentRole !== "owner") {
                        toast(
                            "Owner permission required.",
                            "error"
                        );
                        return;
                    }

                    openModal("ownerModal");

                    await ownerSearchVerified();
                }
            );

        $("adminPanelButton")
            ?.addEventListener(
                "click",
                async () => {
                    closeModal("settingsModal");
                    await openAdminPanel();
                }
            );

        $("settingsLogoutBtn")
            ?.addEventListener(
                "click",
                logout
            );

        $("deleteAccountBtn")
            ?.addEventListener(
                "click",
                () => {
                    closeModal("settingsModal");
                    openModal("deleteAccountModal");
                }
            );

        $("confirmDeleteAccountBtn")
            ?.addEventListener(
                "click",
                deleteAccount
            );

        /* ---------- Profile ---------- */

        $("profileForm")
            ?.addEventListener(
                "submit",
                saveProfile
            );

        $("profileAvatarInput")
            ?.addEventListener(
                "change",
                handleProfileAvatar
            );

        /* ---------- Privacy ---------- */

        $("savePrivacyBtn")
            ?.addEventListener(
                "click",
                savePrivacy
            );

        /* ---------- Appearance ---------- */

        $$("[data-theme]")
            .forEach((button) => {
                button.addEventListener(
                    "click",
                    () => {
                        applyTheme(
                            button.dataset.theme
                        );
                    }
                );
            });

        $$("[data-density]")
            .forEach((button) => {
                button.addEventListener(
                    "click",
                    () => {
                        applyDensity(
                            button.dataset.density
                        );
                    }
                );
            });

        $$("[data-language]")
            .forEach((button) => {
                button.addEventListener(
                    "click",
                    () => {
                        applyLanguage(
                            button.dataset.language
                        );
                    }
                );
            });

        /* ---------- Search ---------- */

        $("searchInput")
            ?.addEventListener(
                "input",
                (event) => {

                    const query =
                        event.target.value;

                    $("clearSearchBtn")
                        ?.classList.toggle(
                            "hidden",
                            !query
                        );

                    clearTimeout(searchTimer);

                    searchTimer =
                        setTimeout(
                            () => {
                                searchEverything(query);
                            },
                            250
                        );
                }
            );

        $("clearSearchBtn")
            ?.addEventListener(
                "click",
                async () => {
                    if ($("searchInput")) {
                        $("searchInput").value = "";
                    }

                    $("clearSearchBtn")
                        ?.classList.add("hidden");

                    await refreshSidebar();
                }
            );

        /* ---------- Messages ---------- */

        $("messageForm")
            ?.addEventListener(
                "submit",
                async (event) => {

                    if (activeCommunity) {
                        await sendCommunityMessage(event);
                    } else {
                        await sendMessage(event);
                    }
                }
            );

        $("imageBtn")
            ?.addEventListener(
                "click",
                () => $("imageInput")?.click()
            );

        $("imageInput")
            ?.addEventListener(
                "change",
                sendImage
            );

        $("emojiBtn")
            ?.addEventListener(
                "click",
                () => {
                    const input =
                        $("messageInput");

                    if (!input) return;

                    input.value += " 😊";
                    input.focus();
                }
            );

        $("stickerBtn")
            ?.addEventListener(
                "click",
                () => {
                    toast(
                        "Sticker system will be added next.",
                        "info"
                    );
                }
            );

        /* ---------- Contact ---------- */

        $("addContactBtn")
            ?.addEventListener(
                "click",
                async () => {
                    if (activeChatUser) {
                        await sendContactRequest(
                            activeChatUser.id
                        );
                    }
                }
            );

        $("acceptContactBtn")
            ?.addEventListener(
                "click",
                async () => {
                    const relationship =
                        activeChatUser
                            ? await getRelationship(
                                activeChatUser.id
                            )
                            : null;

                    if (relationship) {
                        await acceptContactRequest(
                            relationship.id
                        );
                    }
                }
            );

        $("declineContactBtn")
            ?.addEventListener(
                "click",
                async () => {
                    const relationship =
                        activeChatUser
                            ? await getRelationship(
                                activeChatUser.id
                            )
                            : null;

                    if (relationship) {
                        await declineContactRequest(
                            relationship.id
                        );
                    }
                }
            );

        /* ---------- Chat header ---------- */

        $("chatAvatarButton")
            ?.addEventListener(
                "click",
                () => {

                    if (activeChatUser) {
                        openUserProfile(
                            activeChatUser
                        );
                        return;
                    }

                    if (activeCommunity) {
                        const modal =
                            activeCommunityType === "group"
                                ? "groupInfoModal"
                                : "channelInfoModal";

                        renderCommunityInfo(
                            activeCommunityType
                        );

                        openModal(modal);
                    }
                }
            );

        $("chatMoreBtn")
            ?.addEventListener(
                "click",
                openChatSearch
            );

        $("mobileBackBtn")
            ?.addEventListener(
                "click",
                () => {
                    resetChat();
                }
            );

        /* ---------- User profile ---------- */

        $("userProfileMenuBtn")
            ?.addEventListener(
                "click",
                () => {
                    $("userProfileMenu")
                        ?.classList.toggle("hidden");
                }
            );

        $("editNicknameBtn")
            ?.addEventListener(
                "click",
                () => {
                    $("nicknameInput").value = "";
                    $("userProfileMenu")
                        ?.classList.add("hidden");

                    openModal("nicknameModal");
                }
            );

        $("removeNicknameBtn")
            ?.addEventListener(
                "click",
                async () => {
                    $("userProfileMenu")
                        ?.classList.add("hidden");

                    await removeNickname();
                }
            );

        $("saveNicknameBtn")
            ?.addEventListener(
                "click",
                saveNickname
            );

        $("removeNicknameBtnModal")
            ?.addEventListener(
                "click",
                removeNickname
            );

        $("blockUserBtn")
            ?.addEventListener(
                "click",
                blockUser
            );

        $("reportUserBtn")
            ?.addEventListener(
                "click",
                reportUser
            );

        $("submitReportBtn")
            ?.addEventListener(
                "click",
                submitReport
            );

        /* ---------- Communities ---------- */

        $("createGroupBtn")
            ?.addEventListener(
                "click",
                () => openModal("createGroupModal")
            );

        $("createChannelBtn")
            ?.addEventListener(
                "click",
                () => openModal("createChannelModal")
            );

        $("joinGroupOpenBtn")
            ?.addEventListener(
                "click",
                () => openModal("joinGroupModal")
            );

        $("joinChannelOpenBtn")
            ?.addEventListener(
                "click",
                () => openModal("joinChannelModal")
            );

        $("groupForm")
            ?.addEventListener(
                "submit",
                createGroup
            );

        $("channelForm")
            ?.addEventListener(
                "submit",
                createChannel
            );

        $("joinGroupBtn")
            ?.addEventListener(
                "click",
                joinGroup
            );

        $("joinChannelBtn")
            ?.addEventListener(
                "click",
                joinChannel
            );

        $("groupMembersBtn")
            ?.addEventListener(
                "click",
                () => loadMembers("group")
            );

        $("channelMembersBtn")
            ?.addEventListener(
                "click",
                () => loadMembers("channel")
            );

        $("leaveGroupBtn")
            ?.addEventListener(
                "click",
                () => leaveCommunity("group")
            );

        $("leaveChannelBtn")
            ?.addEventListener(
                "click",
                () => leaveCommunity("channel")
            );

        $("groupInviteBtn")
            ?.addEventListener(
                "click",
                () => createInvite("group")
            );

        $("channelInviteBtn")
            ?.addEventListener(
                "click",
                () => createInvite("channel")
            );

        /* ---------- Owner ---------- */

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
                () => {
                    toast(
                        "Admin assignment will be connected to the secure admin RPC next.",
                        "info"
                    );
                }
            );

        setupOwnerTabs();

        /* ---------- Admin ---------- */

        $("openAdminReportsBtn")
            ?.addEventListener(
                "click",
                async () => {
                    if (
                        currentRole !== "admin" &&
                        currentRole !== "owner"
                    ) {
                        toast(
                            "Admin permission required.",
                            "error"
                        );
                        return;
                    }

                    closeModal("adminModal");

                    if (currentRole === "owner") {
                        openModal("ownerModal");

                        $("[data-owner-tab='reports']")
                            ?.click();
                    } else {
                        toast(
                            "Reports are ready for the admin system.",
                            "info"
                        );
                    }
                }
            );

        $("openAdminUsersBtn")
            ?.addEventListener(
                "click",
                () => {
                    toast(
                        "User moderation is connected through the Owner/Admin system.",
                        "info"
                    );
                }
            );

        $("openAdminGroupsBtn")
            ?.addEventListener(
                "click",
                () => {
                    toast(
                        "Group administration will be connected next.",
                        "info"
                    );
                }
            );

        $("openAdminChannelsBtn")
            ?.addEventListener(
                "click",
                () => {
                    toast(
                        "Channel administration will be connected next.",
                        "info"
                    );
                }
            );

        /* ---------- Generic modal close ---------- */

        document.addEventListener(
            "click",
            (event) => {

                const closeButton =
                    event.target.closest(
                        "[data-close-modal]"
                    );

                if (closeButton) {
                    const id =
                        closeButton.dataset.closeModal;

                    closeModal(id);
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
            }
        );

        /* ---------- Request delegation ---------- */

        $("userList")
            ?.addEventListener(
                "click",
                async (event) => {

                    const button =
                        event.target.closest(
                            "[data-request-action]"
                        );

                    if (!button) return;

                    event.stopPropagation();

                    const action =
                        button.dataset.requestAction;

                    const requestId =
                        button.dataset.requestId;

                    if (action === "accept") {
                        await acceptContactRequest(
                            requestId
                        );
                    }

                    if (action === "decline") {
                        await declineContactRequest(
                            requestId
                        );
                    }
                }
            );

        /* ---------- Global ---------- */

        document.addEventListener(
            "keydown",
            (event) => {
                if (event.key === "Escape") {
                    closeAllModals();

                    $("chatSearchOverlay")
                        ?.remove();
                }
            }
        );

        document.addEventListener(
            "click",
            (event) => {

                if (
                    !event.target.closest(
                        "#userProfileMenu"
                    ) &&
                    !event.target.closest(
                        "#userProfileMenuBtn"
                    )
                ) {
                    $("userProfileMenu")
                        ?.classList.add("hidden");
                }

                if (
                    !event.target.closest(
                        ".message-wrapper"
                    )
                ) {
                    $$(".message-wrapper.swiped")
                        .forEach((wrapper) => {
                            wrapper.classList.remove(
                                "swiped"
                            );
                        });
                }
            }
        );
    }

    /* =========================================================
       REALTIME
    ========================================================= */

    function setupRealtime() {
        if (realtimeChannel) {
            db.removeChannel(
                realtimeChannel
            );
        }

        realtimeChannel =
            db.channel(
                "megchatbox-realtime"
            );

        realtimeChannel
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "contact_requests"
                },
                async () => {
                    await refreshSidebar();

                    if (activeChatUser) {
                        await renderContactActions();
                    }
                }
            )
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "messages"
                },
                async () => {

                    if (activeChatUser) {
                        await loadDirectMessages();
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
                async () => {

                    if (
                        activeCommunity &&
                        activeCommunityType === "group"
                    ) {
                        await loadCommunityMessages();
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
                async () => {

                    if (
                        activeCommunity &&
                        activeCommunityType === "channel"
                    ) {
                        await loadCommunityMessages();
                    }
                }
            )
            .subscribe();
    }

    /* =========================================================
       LAST SEEN
    ========================================================= */

    async function updateLastSeen() {
        if (!currentUser) return;

        const { error } = await db
            .from("profiles")
            .update({
                last_seen: new Date().toISOString()
            })
            .eq("id", currentUser.id);

        if (error) {
            console.warn(
                "Could not update last_seen:",
                error
            );
        }
    }

    /* =========================================================
       INIT
    ========================================================= */

    async function init() {
        const authenticated =
            await initAuth();

        if (!authenticated) return;

        const profileLoaded =
            await loadMyProfile();

        if (!profileLoaded) return;

        loadAppearance();

        setupEvents();

        setupTabs();

        await loadRole();

        await refreshSidebar();

        await loadUpdates();

        setupRealtime();

        await updateLastSeen();

        setInterval(
            updateLastSeen,
            60 * 1000
        );

        setInterval(
            async () => {
                if (currentTab === "chats") {
                    await refreshSidebar();
                }

                if (currentTab === "groups") {
                    await loadGroups();
                }

                if (currentTab === "channels") {
                    await loadChannels();
                }
            },
            30 * 1000
        );

        console.log(
            "MegChatBox V4 initialized."
        );
    }

    init();

})();
```
