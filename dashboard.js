(() => {
    "use strict";

    /* =========================================================
       MEGCHATBOX - DASHBOARD.JS V3
       Clean / Stable / Current dashboard.html compatible
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
       STATE
    ========================================================= */

    let currentUser = null;
    let currentProfile = null;

    let activeChatUser = null;
    let activeCommunity = null;
    let activeCommunityType = null;

    let activeUserProfile = null;
    let currentRequests = [];

    let currentRole = "user";

    let currentMessages = [];
    let realtimeChannel = null;

    let searchTimer = null;

    const $ = (id) => document.getElementById(id);

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

    function escapeAttr(value) {
        return escapeHTML(value);
    }

    function initials(name) {
        const text = String(name || "?").trim();

        if (!text) return "?";

        return text
            .split(/\s+/)
            .slice(0, 2)
            .map((x) => x[0])
            .join("")
            .toUpperCase();
    }

    function isVerifiedActive(profile) {
        if (!profile?.is_verified) return false;

        if (!profile.verified_until) return true;

        return new Date(profile.verified_until) > new Date();
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

    function verifiedHTML(profile) {
        return isVerifiedActive(profile)
            ? `<span class="verified-badge" title="Verified">✓</span>`
            : "";
    }

    function avatarHTML(profile, className = "avatar") {
        const name = profile?.full_name || profile?.username || "?";

        if (profile?.avatar_url) {
            return `
                <div class="${className}">
                    <img src="${escapeAttr(profile.avatar_url)}" alt="">
                </div>
            `;
        }

        return `
            <div class="${className}">
                <span>${escapeHTML(initials(name))}</span>
            </div>
        `;
    }

    function toast(message, type = "info") {
        const box = $("toast");
        const text = $("toastMessage");

        if (!box || !text) return;

        text.textContent = message;

        box.classList.remove("success", "error", "warning", "info");
        box.classList.add(type);

        box.classList.add("show");

        clearTimeout(toast.timer);

        toast.timer = setTimeout(() => {
            box.classList.remove("show");
        }, 3000);
    }

    function showError(error, fallback = "Something went wrong.") {
        console.error(error);

        const message =
            error?.message ||
            error?.error_description ||
            fallback;

        toast(message, "error");
    }

    function openModal(id) {
        const modal = $(id);

        if (!modal) return;

        modal.style.display = "flex";
        modal.classList.add("open");
        document.body.classList.add("modal-open");
    }

    function closeModal(id) {
        const modal = $(id);

        if (!modal) return;

        modal.classList.remove("open");
        modal.style.display = "none";

        if (!document.querySelector(".modal.open")) {
            document.body.classList.remove("modal-open");
        }
    }

    function closeAllModals() {
        document.querySelectorAll(".modal").forEach((modal) => {
            modal.classList.remove("open");
            modal.style.display = "none";
        });

        document.body.classList.remove("modal-open");
    }

    function isUniqueError(error) {
        return error?.code === "23505";
    }

    function isNotFoundError(error) {
        return error?.code === "PGRST116";
    }

    async function getProfile(userId) {
        const { data, error } = await db
            .from("profiles")
            .select("*")
            .eq("id", userId)
            .maybeSingle();

        if (error) throw error;

        return data;
    }

    async function getProfiles(ids) {
        const cleanIds = [...new Set((ids || []).filter(Boolean))];

        if (!cleanIds.length) return [];

        const { data, error } = await db
            .from("profiles")
            .select(`
                id,
                username,
                full_name,
                avatar_url,
                bio,
                is_verified,
                verified_until,
                last_seen,
                show_online,
                show_last_seen,
                account_blocked,
                messaging_blocked
            `)
            .in("id", cleanIds);

        if (error) throw error;

        return data || [];
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
            console.error(error);
        }

        if (!session?.user) {
            location.href = "index.html";
            return false;
        }

        currentUser = session.user;

        currentProfile = await getProfile(currentUser.id);

        if (!currentProfile) {
            toast("Profile not found.", "error");
            return false;
        }

        if (currentProfile.account_blocked) {
            toast("Your account is blocked.", "error");
            await db.auth.signOut();
            location.href = "index.html";
            return false;
        }

        return true;
    }

    /* =========================================================
       PROFILE
    ========================================================= */

    function renderMyProfile() {
        if (!currentProfile) return;

        const name = currentProfile.full_name || currentProfile.username;

        const myName = $("myName");
        const myUsername = $("myUsername");
        const myAvatar = $("myAvatar");
        const myAvatarInitial = $("myAvatarInitial");
        const myVerified = $("myVerified");

        if (myName) myName.textContent = name;
        if (myUsername) myUsername.textContent = `@${currentProfile.username}`;

        if (myAvatar) {
            if (currentProfile.avatar_url) {
                myAvatar.innerHTML = `
                    <img src="${escapeAttr(currentProfile.avatar_url)}" alt="">
                `;
            } else {
                myAvatar.innerHTML = "";
                if (myAvatarInitial) {
                    myAvatarInitial.textContent = initials(name);
                }
            }
        }

        if (myVerified) {
            myVerified.style.display =
                isVerifiedActive(currentProfile)
                    ? "inline-flex"
                    : "none";
        }
    }

    async function saveProfile() {
        if (!currentUser) return;

        const fullName = $("profileFullName")?.value.trim();
        const username = $("profileUsername")?.value.trim().toLowerCase();
        const bio = $("profileBio")?.value.trim();

        if (!fullName) {
            toast("Full name is required.", "error");
            return;
        }

        if (!/^[a-z0-9_]{3,32}$/.test(username)) {
            toast(
                "Username must contain 3-32 lowercase letters, numbers or _.",
                "error"
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
            toast("This username is already taken.", "error");
            return;
        }

        const { data, error } = await db
            .from("profiles")
            .update({
                full_name: fullName,
                username,
                bio: bio || ""
            })
            .eq("id", currentUser.id)
            .select("*")
            .single();

        if (error) {
            if (isUniqueError(error)) {
                toast("This username is already taken.", "error");
            } else {
                showError(error);
            }

            return;
        }

        currentProfile = data;

        renderMyProfile();

        closeModal("profileModal");

        toast("Profile updated.", "success");
    }

    async function uploadAvatar(input, bucket, pathPrefix) {
        if (!input?.files?.length || !currentUser) return null;

        const file = input.files[0];

        if (!file.type.startsWith("image/")) {
            toast("Please select an image.", "error");
            return null;
        }

        if (file.size > 5 * 1024 * 1024) {
            toast("Image must be smaller than 5 MB.", "error");
            return null;
        }

        const extension =
            file.name.split(".").pop()?.toLowerCase() || "jpg";

        const path =
            `${pathPrefix}/${currentUser.id}-${Date.now()}.${extension}`;

        const { error: uploadError } = await db.storage
            .from(bucket)
            .upload(path, file, {
                upsert: true,
                contentType: file.type
            });

        if (uploadError) {
            showError(uploadError, "Avatar upload failed.");
            return null;
        }

        const { data } = db.storage
            .from(bucket)
            .getPublicUrl(path);

        return data.publicUrl;
    }

    async function handleProfileAvatar() {
        const input = $("profileAvatarInput");

        const url = await uploadAvatar(
            input,
            "avatars",
            "profiles"
        );

        if (!url) return;

        const { data, error } = await db
            .from("profiles")
            .update({
                avatar_url: url
            })
            .eq("id", currentUser.id)
            .select("*")
            .single();

        if (error) {
            showError(error);
            return;
        }

        currentProfile = data;

        renderMyProfile();

        const image = $("profileAvatarImage");
        const initial = $("profileAvatarInitial");

        if (image) {
            image.src = url;
            image.style.display = "block";
        }

        if (initial) {
            initial.style.display = "none";
        }

        toast("Avatar updated.", "success");
    }

    async function loadPrivacy() {
        if (!currentProfile) return;

        const online = $("showOnlineToggle");
        const lastSeen = $("showLastSeenToggle");

        if (online) {
            online.checked = currentProfile.show_online !== false;
        }

        if (lastSeen) {
            lastSeen.checked = currentProfile.show_last_seen !== false;
        }
    }

    async function savePrivacy() {
        const showOnline =
            $("showOnlineToggle")?.checked ?? true;

        const showLastSeen =
            $("showLastSeenToggle")?.checked ?? true;

        const { data, error } = await db
            .from("profiles")
            .update({
                show_online: showOnline,
                show_last_seen: showLastSeen
            })
            .eq("id", currentUser.id)
            .select("*")
            .single();

        if (error) {
            showError(error);
            return;
        }

        currentProfile = data;

        toast("Privacy settings saved.", "success");
    }

    /* =========================================================
       CONTACTS
    ========================================================= */

    async function getContactRequests() {
        if (!currentUser) return [];

        const { data, error } = await db
            .from("contact_requests")
            .select("*")
            .or(
                `sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`
            )
            .order("created_at", { ascending: false });

        if (error) {
            console.error("Contact requests:", error);
            return [];
        }

        return data || [];
    }

    async function loadIncomingRequests() {
        if (!currentUser) return [];

        try {
            /*
             * IMPORTANT:
             * Do NOT use:
             * profiles!contact_requests_sender_id_fkey
             *
             * sender_id references auth.users, not profiles.
             */

            const { data: requests, error } = await db
                .from("contact_requests")
                .select("*")
                .eq("receiver_id", currentUser.id)
                .eq("status", "pending")
                .order("created_at", { ascending: false });

            if (error) {
                console.error("Incoming requests:", error);
                return [];
            }

            if (!requests?.length) {
                currentRequests = [];
                return [];
            }

            const senderIds = [
                ...new Set(requests.map((r) => r.sender_id))
            ];

            const profiles = await getProfiles(senderIds);

            const map = new Map(
                profiles.map((profile) => [
                    profile.id,
                    profile
                ])
            );

            currentRequests = requests.map((request) => ({
                ...request,
                sender: map.get(request.sender_id) || null
            }));

            return currentRequests;

        } catch (error) {
            console.error("loadIncomingRequests:", error);
            return [];
        }
    }

    async function getAcceptedContacts() {
        const requests = await getContactRequests();

        const accepted = requests.filter(
            (r) => r.status === "accepted"
        );

        const ids = accepted.map((request) =>
            request.sender_id === currentUser.id
                ? request.receiver_id
                : request.sender_id
        );

        return [...new Set(ids)];
    }

    async function getRelationship(userId) {
        if (!currentUser || !userId) {
            return null;
        }

        const { data, error } = await db
            .from("contact_requests")
            .select("*")
            .or(
                `and(sender_id.eq.${currentUser.id},receiver_id.eq.${userId}),and(sender_id.eq.${userId},receiver_id.eq.${currentUser.id})`
            )
            .order("created_at", { ascending: false })
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
            if (relationship.sender_id === currentUser.id) {
                toast("Contact request already sent.", "info");
            } else {
                toast("This user already sent you a request.", "info");
            }

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
            if (isUniqueError(error)) {
                toast("Contact request already exists.", "info");
            } else {
                showError(error);
            }

            return;
        }

        toast("Contact request sent.", "success");

        await refreshSidebar();
    }

    async function acceptContactRequest(requestId) {
        const { error } = await db
            .from("contact_requests")
            .update({
                status: "accepted"
            })
            .eq("id", requestId)
            .eq("receiver_id", currentUser.id)
            .eq("status", "pending");

        if (error) {
            showError(error);
            return;
        }

        toast("Contact request accepted.", "success");

        await refreshSidebar();

        if (activeUserProfile) {
            openDirectChat(activeUserProfile);
        }
    }

    async function declineContactRequest(requestId) {
        const { error } = await db
            .from("contact_requests")
            .update({
                status: "declined"
            })
            .eq("id", requestId)
            .eq("receiver_id", currentUser.id)
            .eq("status", "pending");

        if (error) {
            showError(error);
            return;
        }

        toast("Contact request declined.", "success");

        await refreshSidebar();
    }

    /* =========================================================
       CONTACT LIST
    ========================================================= */

    async function renderContacts() {
        const list = $("userList");

        if (!list) return;

        list.innerHTML = `
            <div class="loading-state">
                Loading contacts...
            </div>
        `;

        const acceptedIds = await getAcceptedContacts();

        const profiles = await getProfiles(acceptedIds);

        const requests = await loadIncomingRequests();

        list.innerHTML = "";

        if (requests.length) {
            const title = document.createElement("div");

            title.className = "section-title";
            title.textContent = "Contact requests";

            list.appendChild(title);

            requests.forEach((request) => {
                const profile = request.sender;

                if (!profile) return;

                const item = document.createElement("div");

                item.className = "contact-request-item";

                item.innerHTML = `
                    ${avatarHTML(profile, "list-avatar")}

                    <div class="list-user-info">
                        <div class="list-user-name">
                            ${escapeHTML(
                                profile.full_name || profile.username
                            )}
                            ${verifiedHTML(profile)}
                        </div>

                        <div class="list-user-username">
                            @${escapeHTML(profile.username)}
                        </div>
                    </div>

                    <div class="request-actions">
                        <button
                            class="request-accept"
                            data-request-id="${request.id}"
                        >
                            Accept
                        </button>

                        <button
                            class="request-decline"
                            data-request-id="${request.id}"
                        >
                            Decline
                        </button>
                    </div>
                `;

                list.appendChild(item);
            });
        }

        if (!profiles.length && !requests.length) {
            list.innerHTML += `
                <div class="empty-state">
                    No contacts yet.
                </div>
            `;
        }

        profiles.forEach((profile) => {
            const item = document.createElement("div");

            item.className = "chat-list-item";

            item.innerHTML = `
                ${avatarHTML(profile, "list-avatar")}

                <div class="list-user-info">
                    <div class="list-user-name">
                        ${escapeHTML(
                            profile.full_name || profile.username
                        )}
                        ${verifiedHTML(profile)}
                    </div>

                    <div class="list-user-username">
                        @${escapeHTML(profile.username)}
                    </div>
                </div>
            `;

            item.addEventListener("click", () => {
                openDirectChat(profile);
            });

            list.appendChild(item);
        });

        if ($("contactCount")) {
            $("contactCount").textContent = profiles.length;
        }
    }

    /* =========================================================
       SEARCH
    ========================================================= */

    async function searchEverything(query) {
        query = query.trim().toLowerCase();

        if (!query) {
            await refreshSidebar();
            return;
        }

        const usersList = $("userList");

        if (!usersList) return;

        usersList.innerHTML = `
            <div class="loading-state">
                Searching...
            </div>
        `;

        const [
            usersResult,
            groupsResult,
            channelsResult
        ] = await Promise.all([
            db
                .from("profiles")
                .select(`
                    id,
                    username,
                    full_name,
                    avatar_url,
                    bio,
                    is_verified,
                    verified_until
                `)
                .or(
                    `username.ilike.%${query}%,full_name.ilike.%${query}%`
                )
                .neq("id", currentUser.id)
                .limit(20),

            db
                .from("groups")
                .select("*")
                .or(
                    `username.ilike.%${query}%,name.ilike.%${query}%`
                )
                .limit(20),

            db
                .from("channels")
                .select("*")
                .or(
                    `username.ilike.%${query}%,name.ilike.%${query}%`
                )
                .limit(20)
        ]);

        usersList.innerHTML = "";

        if (!usersResult.error) {
            (usersResult.data || []).forEach((profile) => {
                renderSearchUser(usersList, profile);
            });
        }

        if (!groupsResult.error) {
            (groupsResult.data || []).forEach((group) => {
                renderSearchCommunity(
                    usersList,
                    group,
                    "group"
                );
            });
        }

        if (!channelsResult.error) {
            (channelsResult.data || []).forEach((channel) => {
                renderSearchCommunity(
                    usersList,
                    channel,
                    "channel"
                );
            });
        }

        if (!usersList.children.length) {
            usersList.innerHTML = `
                <div class="empty-state">
                    Nothing found.
                </div>
            `;
        }
    }

    function renderSearchUser(container, profile) {
        const item = document.createElement("div");

        item.className = "search-result-item";

        item.innerHTML = `
            ${avatarHTML(profile, "list-avatar")}

            <div class="list-user-info">
                <div class="list-user-name">
                    ${escapeHTML(
                        profile.full_name || profile.username
                    )}
                    ${verifiedHTML(profile)}
                </div>

                <div class="list-user-username">
                    @${escapeHTML(profile.username)}
                </div>
            </div>

            <button class="search-user-action">
                Open
            </button>
        `;

        item.querySelector("button")
            .addEventListener("click", (event) => {
                event.stopPropagation();
                openDirectChat(profile);
            });

        item.addEventListener("click", () => {
            openDirectChat(profile);
        });

        container.appendChild(item);
    }

    function renderSearchCommunity(container, community, type) {
        const item = document.createElement("div");

        item.className = "search-result-item community-result";

        item.innerHTML = `
            <div class="list-avatar community-avatar">
                ${community.avatar_url
                    ? `<img src="${escapeAttr(
                        community.avatar_url
                    )}" alt="">`
                    : `<span>${escapeHTML(
                        initials(community.name)
                    )}</span>`
                }
            </div>

            <div class="list-user-info">
                <div class="list-user-name">
                    ${escapeHTML(community.name)}
                </div>

                <div class="list-user-username">
                    @${escapeHTML(community.username || "")}
                    · ${type}
                </div>
            </div>
        `;

        item.addEventListener("click", () => {
            openCommunity(community, type);
        });

        container.appendChild(item);
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

        closeModal("userProfileModal");

        const relationship =
            await getRelationship(profile.id);

        renderChatHeader(profile);

        if (relationship?.status === "accepted") {
            showDirectComposer(true);
            await loadDirectMessages();
        } else {
            showDirectComposer(false);
            renderContactActions(relationship);
        }

        $("chatEmpty")?.classList.add("hidden");
        $("activeChat")?.classList.remove("hidden");
    }

    function renderChatHeader(profile) {
        const name =
            profile.full_name ||
            profile.username ||
            "User";

        if ($("chatName")) {
            $("chatName").textContent = name;
        }

        if ($("chatVerified")) {
            $("chatVerified").style.display =
                isVerifiedActive(profile)
                    ? "inline-flex"
                    : "none";
        }

        if ($("chatStatus")) {
            if (
                profile.show_online !== false &&
                profile.last_seen &&
                Date.now() -
                    new Date(profile.last_seen).getTime() <
                    5 * 60 * 1000
            ) {
                $("chatStatus").textContent = "online";
            } else if (
                profile.show_last_seen !== false &&
                profile.last_seen
            ) {
                $("chatStatus").textContent =
                    `last seen ${formatDate(profile.last_seen)}`;
            } else {
                $("chatStatus").textContent = "";
            }
        }

        const avatar = $("chatAvatar");

        if (avatar) {
            if (profile.avatar_url) {
                avatar.innerHTML = `
                    <img
                        src="${escapeAttr(profile.avatar_url)}"
                        alt=""
                    >
                `;
            } else {
                avatar.innerHTML = `
                    <span>
                        ${escapeHTML(
                            initials(name)
                        )}
                    </span>
                `;
            }
        }
    }

    function renderContactActions(relationship) {
        const box = $("contactActions");

        if (!box) return;

        box.innerHTML = "";

        if (!activeChatUser) return;

        if (!relationship) {
            box.innerHTML = `
                <button id="dynamicAddContactBtn">
                    Add Contact
                </button>
            `;

            $("dynamicAddContactBtn")
                ?.addEventListener("click", () => {
                    sendContactRequest(activeChatUser.id);
                });

            return;
        }

        if (relationship.status === "pending") {
            if (
                relationship.sender_id === currentUser.id
            ) {
                box.innerHTML = `
                    <div class="request-status">
                        Contact request sent
                    </div>
                `;
            } else {
                box.innerHTML = `
                    <button id="dynamicAcceptBtn">
                        Accept
                    </button>

                    <button id="dynamicDeclineBtn">
                        Decline
                    </button>
                `;

                $("dynamicAcceptBtn")
                    ?.addEventListener("click", () => {
                        acceptContactRequest(
                            relationship.id
                        );
                    });

                $("dynamicDeclineBtn")
                    ?.addEventListener("click", () => {
                        declineContactRequest(
                            relationship.id
                        );
                    });
            }

            return;
        }

        if (relationship.status === "declined") {
            box.innerHTML = `
                <button id="dynamicAddContactBtn">
                    Add Contact
                </button>
            `;
        }
    }

    function showDirectComposer(enabled) {
        const form = $("messageForm");
        const input = $("messageInput");
        const send = $("sendButton");

        if (form) {
            form.style.display = enabled ? "flex" : "none";
        }

        if (input) {
            input.disabled = !enabled;
        }

        if (send) {
            send.disabled = !enabled;
        }

        if ($("contactActions")) {
            $("contactActions").style.display =
                enabled ? "none" : "flex";
        }
    }

    async function loadDirectMessages() {
        if (!currentUser || !activeChatUser) return;

        const { data, error } = await db
            .from("messages")
            .select("*")
            .or(
                `and(sender_id.eq.${currentUser.id},receiver_id.eq.${activeChatUser.id}),and(sender_id.eq.${activeChatUser.id},receiver_id.eq.${currentUser.id})`
            )
            .order("created_at", {
                ascending: true
            });

        if (error) {
            showError(error);
            return;
        }

        currentMessages = data || [];

        renderMessages(
            currentMessages,
            "direct"
        );
    }

    /* =========================================================
       MESSAGE RENDER
    ========================================================= */

    async function getMediaUrl(path) {
        if (!path) return "";

        if (
            path.startsWith("http://") ||
            path.startsWith("https://")
        ) {
            return path;
        }

        const { data, error } = await db.storage
            .from("chat-media")
            .createSignedUrl(path, 3600);

        if (error) {
            console.error(error);
            return "";
        }

        return data?.signedUrl || "";
    }

    async function renderMessages(messages, type) {
        const container = $("messages");

        if (!container) return;

        container.innerHTML = "";

        if (!messages.length) {
            container.innerHTML = `
                <div class="messages-empty">
                    No messages yet.
                </div>
            `;

            return;
        }

        for (const message of messages) {
            const mine =
                message.sender_id === currentUser.id;

            const row = document.createElement("div");

            row.className =
                `message-row ${mine ? "mine" : "theirs"}`;

            const wrapper = document.createElement("div");

            wrapper.className = "message-wrapper";

            wrapper.dataset.messageId = message.id;

            let content = "";

            if (message.deleted_at) {
                content = `
                    <div class="message-bubble deleted-message">
                        Message deleted
                    </div>
                `;
            } else if (
                message.message_type === "image" &&
                message.image_url
            ) {
                const url =
                    await getMediaUrl(
                        message.image_url
                    );

                content = `
                    <div class="message-bubble image-message">
                        <img
                            src="${escapeAttr(url)}"
                            alt="Image"
                            loading="lazy"
                        >
                    </div>
                `;
            } else {
                content = `
                    <div class="message-bubble">
                        ${escapeHTML(message.content)}
                        ${
                            message.edited_at
                                ? `<span class="edited-label">edited</span>`
                                : ""
                        }
                    </div>
                `;
            }

            wrapper.innerHTML = `
                <div class="message-actions">
                    <button
                        class="message-action"
                        data-action="save"
                        title="Save"
                    >
                        🔖
                    </button>

                    ${
                        mine && !message.deleted_at
                            ? `
                            <button
                                class="message-action"
                                data-action="edit"
                                title="Edit"
                            >
                                ✏️
                            </button>

                            <button
                                class="message-action"
                                data-action="delete"
                                title="Delete"
                            >
                                🗑️
                            </button>
                            `
                            : ""
                    }
                </div>

                ${content}

                <div class="message-time">
                    ${formatTime(message.created_at)}
                </div>
            `;

            row.appendChild(wrapper);

            setupMessageSwipe(wrapper, message);

            container.appendChild(row);
        }

        container.scrollTop =
            container.scrollHeight;
    }

    /* =========================================================
       HOLD + SWIPE LEFT MESSAGE ACTIONS
    ========================================================= */

    function setupMessageSwipe(wrapper, message) {
        let startX = 0;
        let currentX = 0;
        let holdTimer = null;
        let holding = false;

        wrapper.addEventListener(
            "pointerdown",
            (event) => {
                startX = event.clientX;
                currentX = event.clientX;
                holding = false;

                clearTimeout(holdTimer);

                holdTimer = setTimeout(() => {
                    holding = true;
                    wrapper.classList.add(
                        "hold-active"
                    );
                }, 450);
            }
        );

        wrapper.addEventListener(
            "pointermove",
            (event) => {
                if (!holding) return;

                currentX = event.clientX;

                const delta =
                    currentX - startX;

                if (delta < 0) {
                    const amount =
                        Math.max(
                            -72,
                            Math.min(
                                0,
                                delta
                            )
                        );

                    const bubble =
                        wrapper.querySelector(
                            ".message-bubble"
                        );

                    if (bubble) {
                        bubble.style.transform =
                            `translateX(${amount}px)`;
                    }
                }
            }
        );

        wrapper.addEventListener(
            "pointerup",
            () => {
                clearTimeout(holdTimer);

                if (holding) {
                    const delta =
                        currentX - startX;

                    if (delta <= -55) {
                        wrapper.classList.add(
                            "swiped"
                        );
                    } else {
                        resetMessageSwipe(
                            wrapper
                        );
                    }
                }

                holding = false;
            }
        );

        wrapper.addEventListener(
            "pointercancel",
            () => {
                clearTimeout(holdTimer);
                resetMessageSwipe(wrapper);
                holding = false;
            }
        );

        wrapper
            .querySelectorAll(".message-action")
            .forEach((button) => {
                button.addEventListener(
                    "click",
                    async (event) => {
                        event.stopPropagation();

                        const action =
                            button.dataset.action;

                        if (action === "save") {
                            await saveMessage(message);
                        }

                        if (action === "edit") {
                            await editMessage(message);
                        }

                        if (action === "delete") {
                            await deleteMessage(message);
                        }

                        resetMessageSwipe(wrapper);
                    }
                );
            });
    }

    function resetMessageSwipe(wrapper) {
        wrapper.classList.remove(
            "swiped",
            "hold-active"
        );

        const bubble =
            wrapper.querySelector(
                ".message-bubble"
            );

        if (bubble) {
            bubble.style.transform = "";
        }
    }

    /* =========================================================
       SEND MESSAGE
    ========================================================= */

    async function sendMessage(event) {
        event?.preventDefault();

        if (!currentUser || !activeChatUser) {
            return;
        }

        const relationship =
            await getRelationship(
                activeChatUser.id
            );

        if (relationship?.status !== "accepted") {
            toast(
                "Accept the contact request before chatting.",
                "warning"
            );
            return;
        }

        if (
            currentProfile.messaging_blocked &&
            (
                !currentProfile.messaging_blocked_until ||
                new Date(
                    currentProfile.messaging_blocked_until
                ) > new Date()
            )
        ) {
            toast(
                "Messaging is currently blocked for your account.",
                "error"
            );
            return;
        }

        const input = $("messageInput");

        const content =
            input?.value.trim();

        if (!content) return;

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

    async function sendImage(file) {
        if (!file || !activeChatUser) return;

        const relationship =
            await getRelationship(
                activeChatUser.id
            );

        if (relationship?.status !== "accepted") {
            toast("You are not contacts yet.", "warning");
            return;
        }

        if (!file.type.startsWith("image/")) {
            toast("Only image files are supported.", "error");
            return;
        }

        if (file.size > 10 * 1024 * 1024) {
            toast("Image must be smaller than 10 MB.", "error");
            return;
        }

        const extension =
            file.name.split(".").pop() || "jpg";

        const path =
            `${currentUser.id}/${Date.now()}-${crypto.randomUUID()}.${extension}`;

        const { error: uploadError } =
            await db.storage
                .from("chat-media")
                .upload(path, file, {
                    upsert: false,
                    contentType: file.type
                });

        if (uploadError) {
            showError(uploadError, "Image upload failed.");
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

    /* =========================================================
       EDIT / DELETE / SAVE
    ========================================================= */

    async function editMessage(message) {
        if (message.sender_id !== currentUser.id) {
            return;
        }

        const value = prompt(
            "Edit message:",
            message.content || ""
        );

        if (value === null) return;

        const content = value.trim();

        if (!content) {
            toast("Message cannot be empty.", "error");
            return;
        }

        const { error } = await db
            .from("messages")
            .update({
                content,
                edited_at: new Date().toISOString()
            })
            .eq("id", message.id)
            .eq("sender_id", currentUser.id);

        if (error) {
            showError(error);
            return;
        }

        await loadDirectMessages();
    }

    async function deleteMessage(message) {
        if (message.sender_id !== currentUser.id) {
            return;
        }

        if (!confirm("Delete this message?")) {
            return;
        }

        const { error } = await db
            .from("messages")
            .update({
                deleted_at: new Date().toISOString()
            })
            .eq("id", message.id)
            .eq("sender_id", currentUser.id);

        if (error) {
            showError(error);
            return;
        }

        await loadDirectMessages();
    }

    async function saveMessage(message) {
        const payload = {
            user_id: currentUser.id,
            message_id: message.id,
            content: message.content || ""
        };

        const { error } = await db
            .from("saved_messages")
            .insert(payload);

        if (error) {
            if (isUniqueError(error)) {
                toast("Message is already saved.", "info");
            } else {
                showError(
                    error,
                    "Could not save message."
                );
            }

            return;
        }

        toast("Message saved.", "success");
    }

    /* =========================================================
       GROUPS
    ========================================================= */

    async function loadGroups() {
        const list = $("groupsList");

        if (!list) return;

        const { data: memberships, error } =
            await db
                .from("group_members")
                .select("group_id")
                .eq("user_id", currentUser.id);

        if (error) {
            console.error(error);
            list.innerHTML = `
                <div class="empty-state">
                    Could not load groups.
                </div>
            `;
            return;
        }

        const ids = (memberships || [])
            .map((x) => x.group_id);

        if (!ids.length) {
            list.innerHTML = `
                <div class="empty-state">
                    No groups yet.
                </div>
            `;

            if ($("groupCount")) {
                $("groupCount").textContent = "0";
            }

            return;
        }

        const { data: groups, error: groupError } =
            await db
                .from("groups")
                .select("*")
                .in("id", ids)
                .order("created_at", {
                    ascending: false
                });

        if (groupError) {
            showError(groupError);
            return;
        }

        list.innerHTML = "";

        (groups || []).forEach((group) => {
            renderCommunityItem(
                list,
                group,
                "group"
            );
        });

        if ($("groupCount")) {
            $("groupCount").textContent =
                groups?.length || 0;
        }
    }

    function renderCommunityItem(
        container,
        community,
        type
    ) {
        const item =
            document.createElement("div");

        item.className = "chat-list-item";

        item.innerHTML = `
            <div class="list-avatar community-avatar">
                ${
                    community.avatar_url
                        ? `
                            <img
                                src="${escapeAttr(
                                    community.avatar_url
                                )}"
                                alt=""
                            >
                        `
                        : `
                            <span>
                                ${escapeHTML(
                                    initials(
                                        community.name
                                    )
                                )}
                            </span>
                        `
                }
            </div>

            <div class="list-user-info">
                <div class="list-user-name">
                    ${escapeHTML(community.name)}
                </div>

                <div class="list-user-username">
                    @${escapeHTML(
                        community.username || ""
                    )}
                </div>
            </div>
        `;

        item.addEventListener("click", () => {
            openCommunity(
                community,
                type
            );
        });

        container.appendChild(item);
    }

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

        const privacy =
            document.querySelector(
                'input[name="groupPrivacy"]:checked'
            )?.value || "public";

        if (!name) {
            toast("Group name is required.", "error");
            return;
        }

        if (!/^[a-z0-9_]{3,32}$/.test(username)) {
            toast("Invalid group username.", "error");
            return;
        }

        const { data: sameGroup } =
            await db
                .from("groups")
                .select("id")
                .eq("username", username)
                .maybeSingle();

        if (sameGroup) {
            toast(
                "This group username is already taken.",
                "error"
            );
            return;
        }

        const { data: sameProfile } =
            await db
                .from("profiles")
                .select("id")
                .eq("username", username)
                .maybeSingle();

        if (sameProfile) {
            toast(
                "This username is already used by a user.",
                "error"
            );
            return;
        }

        const { data: groupId, error } =
            await db.rpc(
                "create_group",
                {
                    p_name: name,
                    p_username: username,
                    p_bio: bio || ""
                }
            );

        if (error) {
            showError(
                error,
                "Could not create group."
            );
            return;
        }

        const id =
            typeof groupId === "object"
                ? groupId?.id
                : groupId;

        if (id) {
            await db
                .from("groups")
                .update({
                    privacy
                })
                .eq("id", id);
        }

        const input = $("groupAvatarInput");

        if (id && input?.files?.length) {
            const url = await uploadCommunityAvatar(
                input,
                "group-avatars",
                "groups"
            );

            if (url) {
                await db
                    .from("groups")
                    .update({
                        avatar_url: url
                    })
                    .eq("id", id);
            }
        }

        closeModal("createGroupModal");

        $("groupForm")?.reset();

        toast("Group created.", "success");

        await loadGroups();
    }

    async function uploadCommunityAvatar(
        input,
        bucket,
        folder
    ) {
        if (!input?.files?.length) return null;

        const file = input.files[0];

        if (!file.type.startsWith("image/")) {
            toast("Please select an image.", "error");
            return null;
        }

        if (file.size > 5 * 1024 * 1024) {
            toast("Image must be smaller than 5 MB.", "error");
            return null;
        }

        const extension =
            file.name.split(".").pop() || "jpg";

        const path =
            `${folder}/${crypto.randomUUID()}.${extension}`;

        const { error } = await db.storage
            .from(bucket)
            .upload(path, file, {
                upsert: false,
                contentType: file.type
            });

        if (error) {
            showError(error);
            return null;
        }

        const { data } = db.storage
            .from(bucket)
            .getPublicUrl(path);

        return data.publicUrl;
    }

    /* =========================================================
       CHANNELS
    ========================================================= */

    async function loadChannels() {
        const list = $("channelsList");

        if (!list) return;

        const { data: memberships, error } =
            await db
                .from("channel_members")
                .select("channel_id")
                .eq("user_id", currentUser.id);

        if (error) {
            console.error(error);
            list.innerHTML = `
                <div class="empty-state">
                    Could not load channels.
                </div>
            `;
            return;
        }

        const ids = (memberships || [])
            .map((x) => x.channel_id);

        if (!ids.length) {
            list.innerHTML = `
                <div class="empty-state">
                    No channels yet.
                </div>
            `;

            if ($("channelCount")) {
                $("channelCount").textContent = "0";
            }

            return;
        }

        const { data: channels, error: channelError } =
            await db
                .from("channels")
                .select("*")
                .in("id", ids)
                .order("created_at", {
                    ascending: false
                });

        if (channelError) {
            showError(channelError);
            return;
        }

        list.innerHTML = "";

        (channels || []).forEach((channel) => {
            renderCommunityItem(
                list,
                channel,
                "channel"
            );
        });

        if ($("channelCount")) {
            $("channelCount").textContent =
                channels?.length || 0;
        }
    }

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

        const privacy =
            document.querySelector(
                'input[name="channelPrivacy"]:checked'
            )?.value || "public";

        if (!name) {
            toast("Channel name is required.", "error");
            return;
        }

        if (!/^[a-z0-9_]{3,32}$/.test(username)) {
            toast(
                "Invalid channel username.",
                "error"
            );
            return;
        }

        const { data: existing } =
            await db
                .from("channels")
                .select("id")
                .eq("username", username)
                .maybeSingle();

        if (existing) {
            toast(
                "This channel username is already taken.",
                "error"
            );
            return;
        }

        const { data: profileMatch } =
            await db
                .from("profiles")
                .select("id")
                .eq("username", username)
                .maybeSingle();

        if (profileMatch) {
            toast(
                "This username is already used by a user.",
                "error"
            );
            return;
        }

        const { data: channelId, error } =
            await db.rpc(
                "create_channel",
                {
                    p_name: name,
                    p_username: username,
                    p_bio: bio || ""
                }
            );

        if (error) {
            showError(
                error,
                "Could not create channel."
            );
            return;
        }

        const id =
            typeof channelId === "object"
                ? channelId?.id
                : channelId;

        if (id) {
            await db
                .from("channels")
                .update({
                    privacy
                })
                .eq("id", id);
        }

        const input = $("channelAvatarInput");

        if (id && input?.files?.length) {
            const url = await uploadCommunityAvatar(
                input,
                "channel-avatars",
                "channels"
            );

            if (url) {
                await db
                    .from("channels")
                    .update({
                        avatar_url: url
                    })
                    .eq("id", id);
            }
        }

        closeModal("createChannelModal");

        $("channelForm")?.reset();

        toast("Channel created.", "success");

        await loadChannels();
    }

    /* =========================================================
       OPEN COMMUNITY
    ========================================================= */

    async function openCommunity(
        community,
        type
    ) {
        activeCommunity = community;
        activeCommunityType = type;
        activeChatUser = null;

        const table =
            type === "group"
                ? "group_members"
                : "channel_members";

        const idColumn =
            type === "group"
                ? "group_id"
                : "channel_id";

        const { data: membership } =
            await db
                .from(table)
                .select("*")
                .eq(idColumn, community.id)
                .eq("user_id", currentUser.id)
                .maybeSingle();

        renderCommunityHeader(
            community,
            type
        );

        $("chatEmpty")?.classList.add("hidden");
        $("activeChat")?.classList.remove("hidden");

        if (!membership) {
            showDirectComposer(false);

            const actions =
                $("contactActions");

            if (actions) {
                actions.style.display = "flex";

                actions.innerHTML = `
                    <button
                        id="communityJoinBtn"
                        class="primary-btn"
                    >
                        Join
                    </button>
                `;

                $("communityJoinBtn")
                    ?.addEventListener(
                        "click",
                        () => {
                            if (type === "group") {
                                openModal(
                                    "joinGroupModal"
                                );
                            } else {
                                openModal(
                                    "joinChannelModal"
                                );
                            }
                        }
                    );
            }

            $("messages").innerHTML = `
                <div class="messages-empty">
                    Join this ${type} to see its messages.
                </div>
            `;

            return;
        }

        if (
            type === "channel" &&
            membership.role !== "owner" &&
            membership.role !== "admin"
        ) {
            showDirectComposer(false);
        } else {
            showDirectComposer(true);
        }

        await loadCommunityMessages();
    }

    function renderCommunityHeader(
        community,
        type
    ) {
        if ($("chatName")) {
            $("chatName").textContent =
                community.name;
        }

        if ($("chatVerified")) {
            $("chatVerified").style.display =
                "none";
        }

        if ($("chatStatus")) {
            $("chatStatus").textContent =
                type === "group"
                    ? "Group"
                    : "Channel";
        }

        const avatar = $("chatAvatar");

        if (avatar) {
            if (community.avatar_url) {
                avatar.innerHTML = `
                    <img
                        src="${escapeAttr(
                            community.avatar_url
                        )}"
                        alt=""
                    >
                `;
            } else {
                avatar.innerHTML = `
                    <span>
                        ${escapeHTML(
                            initials(
                                community.name
                            )
                        )}
                    </span>
                `;
            }
        }
    }

    async function loadCommunityMessages() {
        if (
            !activeCommunity ||
            !activeCommunityType
        ) {
            return;
        }

        const table =
            activeCommunityType === "group"
                ? "group_messages"
                : "channel_messages";

        const { data, error } = await db
            .from(table)
            .select("*")
            .eq(
                activeCommunityType === "group"
                    ? "group_id"
                    : "channel_id",
                activeCommunity.id
            )
            .order("created_at", {
                ascending: true
            });

        if (error) {
            showError(error);
            return;
        }

        currentMessages = data || [];

        await renderMessages(
            currentMessages,
            activeCommunityType
        );
    }

    async function sendCommunityMessage(event) {
        event?.preventDefault();

        if (
            !activeCommunity ||
            !activeCommunityType
        ) {
            return;
        }

        const input = $("messageInput");

        const content =
            input?.value.trim();

        if (!content) return;

        const table =
            activeCommunityType === "group"
                ? "group_messages"
                : "channel_messages";

        const payload =
            activeCommunityType === "group"
                ? {
                    group_id: activeCommunity.id,
                    sender_id: currentUser.id,
                    content,
                    message_type: "text"
                }
                : {
                    channel_id: activeCommunity.id,
                    sender_id: currentUser.id,
                    content,
                    message_type: "text"
                };

        const { error } =
            await db
                .from(table)
                .insert(payload);

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
        const input =
            $("groupInviteInput");

        const code =
            input?.value.trim();

        if (!code) {
            toast(
                "Enter an invite code.",
                "error"
            );
            return;
        }

        const { error } =
            await db.rpc(
                "join_group_by_invite",
                {
                    p_invite_code: code
                }
            );

        if (error) {
            showError(
                error,
                "Could not join group."
            );
            return;
        }

        closeModal("joinGroupModal");

        if (input) input.value = "";

        toast("Joined group.", "success");

        await loadGroups();

        if (
            activeCommunity &&
            activeCommunityType === "group"
        ) {
            await openCommunity(
                activeCommunity,
                "group"
            );
        }
    }

    async function joinChannel() {
        const input =
            $("channelInviteInput");

        const code =
            input?.value.trim();

        if (!code) {
            toast(
                "Enter an invite code.",
                "error"
            );
            return;
        }

        const { error } =
            await db.rpc(
                "join_channel_by_invite",
                {
                    p_invite_code: code
                }
            );

        if (error) {
            showError(
                error,
                "Could not join channel."
            );
            return;
        }

        closeModal("joinChannelModal");

        if (input) input.value = "";

        toast("Joined channel.", "success");

        await loadChannels();

        if (
            activeCommunity &&
            activeCommunityType === "channel"
        ) {
            await openCommunity(
                activeCommunity,
                "channel"
            );
        }
    }

    /* =========================================================
       NICKNAME
    ========================================================= */

    async function saveNickname() {
        if (!activeUserProfile) return;

        const input =
            $("nicknameInput");

        const nickname =
            input?.value.trim();

        if (!nickname) {
            toast(
                "Nickname cannot be empty.",
                "error"
            );
            return;
        }

        const { error } =
            await db
                .from("contact_nicknames")
                .upsert(
                    {
                        user_id: currentUser.id,
                        contact_id:
                            activeUserProfile.id,
                        nickname
                    },
                    {
                        onConflict:
                            "user_id,contact_id"
                    }
                );

        if (error) {
            showError(error);
            return;
        }

        closeModal("nicknameModal");

        toast(
            "Nickname saved.",
            "success"
        );

        await refreshSidebar();
    }

    async function removeNickname() {
        if (!activeUserProfile) return;

        const { error } =
            await db
                .from("contact_nicknames")
                .delete()
                .eq("user_id", currentUser.id)
                .eq(
                    "contact_id",
                    activeUserProfile.id
                );

        if (error) {
            showError(error);
            return;
        }

        closeModal("nicknameModal");

        toast(
            "Nickname removed.",
            "success"
        );

        await refreshSidebar();
    }

    /* =========================================================
       USER PROFILE POPUP
    ========================================================= */

    async function openUserProfile(profile) {
        if (!profile) return;

        activeUserProfile = profile;

        if ($("userProfileName")) {
            $("userProfileName").textContent =
                profile.full_name ||
                profile.username;
        }

        if ($("userProfileUsername")) {
            $("userProfileUsername").textContent =
                `@${profile.username}`;
        }

        if ($("userProfileBio")) {
            $("userProfileBio").textContent =
                profile.bio || "";
        }

        if ($("userProfileVerified")) {
            $("userProfileVerified").style.display =
                isVerifiedActive(profile)
                    ? "inline-flex"
                    : "none";
        }

        if ($("userProfileStatus")) {
            $("userProfileStatus").textContent =
                profile.last_seen
                    ? `Last seen ${formatDate(
                        profile.last_seen
                    )}`
                    : "";
        }

        const avatar =
            $("userProfileAvatar");

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
                avatar.innerHTML = `
                    <span>
                        ${escapeHTML(
                            initials(
                                profile.full_name ||
                                profile.username
                            )
                        )}
                    </span>
                `;
            }
        }

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

        const { error } =
            await db
                .from("user_blocks")
                .insert({
                    blocker_id: currentUser.id,
                    blocked_id:
                        activeUserProfile.id
                });

        if (error) {
            if (isUniqueError(error)) {
                toast(
                    "User is already blocked.",
                    "info"
                );
            } else {
                showError(error);
            }

            return;
        }

        closeModal("userProfileModal");

        toast(
            "User blocked.",
            "success"
        );
    }

    async function reportUser() {
        if (!activeUserProfile) return;

        const reason =
            document.querySelector(
                'input[name="reportReason"]:checked'
            )?.value;

        const description =
            $("reportDescription")?.value.trim();

        if (!reason) {
            toast(
                "Select a report reason.",
                "error"
            );
            return;
        }

        const { error } =
            await db
                .from("reports")
                .insert({
                    reporter_id: currentUser.id,
                    reported_user_id:
                        activeUserProfile.id,
                    reason,
                    description:
                        description || ""
                });

        if (error) {
            showError(error);
            return;
        }

        closeModal("reportModal");

        if ($("reportDescription")) {
            $("reportDescription").value = "";
        }

        toast(
            "Report submitted.",
            "success"
        );
    }

    /* =========================================================
       SAVED MESSAGES
    ========================================================= */

    async function loadSavedMessages() {
        const list =
            $("savedMessagesList");

        if (!list) return;

        const { data, error } =
            await db
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
                <div class="empty-state">
                    No saved messages.
                </div>
            `;
            return;
        }

        data.forEach((item) => {
            const row =
                document.createElement("div");

            row.className =
                "saved-message-item";

            row.innerHTML = `
                <div class="saved-message-content">
                    ${escapeHTML(
                        item.content || ""
                    )}
                </div>

                <div class="saved-message-date">
                    ${formatDate(
                        item.created_at
                    )}
                </div>
            `;

            list.appendChild(row);
        });
    }

    /* =========================================================
       UPDATES
    ========================================================= */

    async function loadUpdates() {
        const list =
            $("updatesList");

        if (!list) return;

        const { data, error } =
            await db
                .from("app_updates")
                .select("*")
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
                <div class="empty-state">
                    No updates yet.
                </div>
            `;
            return;
        }

        data.forEach((update) => {
            const item =
                document.createElement("div");

            item.className = "update-item";

            item.innerHTML = `
                <div class="update-type">
                    ${escapeHTML(
                        update.type || "update"
                    )}
                </div>

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
            `;

            list.appendChild(item);
        });
    }

    async function publishUpdate() {
        const title =
            $("updateTitle")?.value.trim();

        const content =
            $("updateContent")?.value.trim();

        const type =
            $("updateType")?.value || "update";

        if (!title || !content) {
            toast(
                "Title and content are required.",
                "error"
            );
            return;
        }

        if (
            currentRole !== "owner" &&
            currentRole !== "admin"
        ) {
            toast(
                "You do not have permission.",
                "error"
            );
            return;
        }

        const { error } =
            await db
                .from("app_updates")
                .insert({
                    type,
                    title,
                    content,
                    created_by: currentUser.id,
                    published: true
                });

        if (error) {
            showError(error);
            return;
        }

        if ($("updateTitle"))
            $("updateTitle").value = "";

        if ($("updateContent"))
            $("updateContent").value = "";

        toast(
            "Update published.",
            "success"
        );

        await loadUpdates();
    }

    /* =========================================================
       GROUP / CHANNEL INFO
    ========================================================= */

    function renderCommunityInfo(
        community,
        type
    ) {
        const prefix =
            type === "group"
                ? "group"
                : "channel";

        const modal =
            type === "group"
                ? "groupInfoModal"
                : "channelInfoModal";

        const name =
            $(`${prefix}InfoName`);

        const username =
            $(`${prefix}InfoUsername`);

        const bio =
            $(`${prefix}InfoBio`);

        const privacy =
            $(`${prefix}InfoPrivacy`);

        const avatar =
            $(`${prefix}InfoAvatar`);

        if (name) {
            name.textContent =
                community.name || "";
        }

        if (username) {
            username.textContent =
                `@${community.username || ""}`;
        }

        if (bio) {
            bio.textContent =
                community.bio || "";
        }

        if (privacy) {
            privacy.textContent =
                community.privacy || "public";
        }

        if (avatar) {
            if (community.avatar_url) {
                avatar.innerHTML = `
                    <img
                        src="${escapeAttr(
                            community.avatar_url
                        )}"
                        alt=""
                    >
                `;
            } else {
                avatar.innerHTML = `
                    <span>
                        ${escapeHTML(
                            initials(
                                community.name
                            )
                        )}
                    </span>
                `;
            }
        }

        openModal(modal);
    }

    async function loadMembers(type) {
        if (!activeCommunity) return;

        const list =
            $("membersList");

        if (!list) return;

        const table =
            type === "group"
                ? "group_members"
                : "channel_members";

        const idColumn =
            type === "group"
                ? "group_id"
                : "channel_id";

        const { data, error } =
            await db
                .from(table)
                .select("*")
                .eq(
                    idColumn,
                    activeCommunity.id
                );

        if (error) {
            showError(error);
            return;
        }

        const ids =
            (data || []).map(
                (member) => member.user_id
            );

        const profiles =
            await getProfiles(ids);

        const map =
            new Map(
                profiles.map(
                    (profile) => [
                        profile.id,
                        profile
                    ]
                )
            );

        list.innerHTML = "";

        (data || []).forEach((member) => {
            const profile =
                map.get(member.user_id);

            if (!profile) return;

            const item =
                document.createElement("div");

            item.className =
                "member-item";

            item.innerHTML = `
                ${avatarHTML(
                    profile,
                    "list-avatar"
                )}

                <div class="list-user-info">
                    <div class="list-user-name">
                        ${escapeHTML(
                            profile.full_name ||
                            profile.username
                        )}
                        ${verifiedHTML(profile)}
                    </div>

                    <div class="list-user-username">
                        @${escapeHTML(
                            profile.username
                        )}
                        · ${escapeHTML(
                            member.role || "member"
                        )}
                    </div>
                </div>
            `;

            list.appendChild(item);
        });

        if ($("membersTitle")) {
            $("membersTitle").textContent =
                type === "group"
                    ? "Group members"
                    : "Channel members";
        }

        openModal("membersModal");
    }

    async function leaveCommunity(type) {
        if (!activeCommunity) return;

        if (
            !confirm(
                `Leave this ${type}?`
            )
        ) {
            return;
        }

        const table =
            type === "group"
                ? "group_members"
                : "channel_members";

        const idColumn =
            type === "group"
                ? "group_id"
                : "channel_id";

        const { error } =
            await db
                .from(table)
                .delete()
                .eq(
                    idColumn,
                    activeCommunity.id
                )
                .eq(
                    "user_id",
                    currentUser.id
                );

        if (error) {
            showError(
                error,
                "Could not leave."
            );
            return;
        }

        closeModal(
            type === "group"
                ? "groupInfoModal"
                : "channelInfoModal"
        );

        activeCommunity = null;
        activeCommunityType = null;

        $("activeChat")?.classList.add("hidden");
        $("chatEmpty")?.classList.remove("hidden");

        if (type === "group") {
            await loadGroups();
        } else {
            await loadChannels();
        }

        toast(
            `Left ${type}.`,
            "success"
        );
    }

    /* =========================================================
       INVITES
    ========================================================= */

    function makeInviteCode() {
        return (
            crypto.randomUUID()
                .replace(/-/g, "")
                .slice(0, 16)
        );
    }

    async function createInvite(type) {
        if (!activeCommunity) return;

        const table =
            type === "group"
                ? "group_invites"
                : "channel_invites";

        const idColumn =
            type === "group"
                ? "group_id"
                : "channel_id";

        const code =
            makeInviteCode();

        const payload = {
            [idColumn]:
                activeCommunity.id,
            inviter_id:
                currentUser.id,
            invite_code:
                code
        };

        const { error } =
            await db
                .from(table)
                .insert(payload);

        if (error) {
            showError(
                error,
                "Could not create invite."
            );
            return;
        }

        await navigator.clipboard
            ?.writeText(code)
            .catch(() => {});

        toast(
            `Invite code: ${code}`,
            "success"
        );
    }

    /* =========================================================
       OWNER / ADMIN
    ========================================================= */

    async function loadRole() {
        try {
            const { data, error } =
                await db.rpc(
                    "get_my_role"
                );

            if (error) {
                console.warn(
                    "get_my_role unavailable:",
                    error
                );

                currentRole =
                    currentProfile?.role ||
                    "user";
            } else {
                currentRole =
                    data ||
                    currentProfile?.role ||
                    "user";
            }
        } catch {
            currentRole =
                currentProfile?.role ||
                "user";
        }

        const ownerButton =
            $("ownerPanelButton");

        const adminButton =
            $("adminPanelButton");

        if (ownerButton) {
            ownerButton.style.display =
                currentRole === "owner"
                    ? ""
                    : "none";
        }

        if (adminButton) {
            adminButton.style.display =
                currentRole === "owner" ||
                currentRole === "admin"
                    ? ""
                    : "none";
        }

        const createUpdate =
            $("updateCreateSection");

        if (createUpdate) {
            createUpdate.style.display =
                currentRole === "owner" ||
                currentRole === "admin"
                    ? ""
                    : "none";
        }
    }

    async function ownerSearchVerified() {
        const username =
            $("ownerVerifiedUsername")
                ?.value
                .trim()
                .toLowerCase();

        if (!username) return;

        const { data, error } =
            await db
                .from("profiles")
                .select("*")
                .eq("username", username)
                .maybeSingle();

        const result =
            $("ownerVerifiedResult");

        if (error) {
            showError(error);
            return;
        }

        if (!data) {
            if (result) {
                result.innerHTML =
                    "User not found.";
            }

            return;
        }

        if (result) {
            result.innerHTML = `
                <div class="owner-user-result">
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

                    <span>
                        ${
                            isVerifiedActive(data)
                                ? "Verified"
                                : "Not verified"
                        }
                    </span>

                    ${
                        data.verified_until
                            ? `
                            <span>
                                Until:
                                ${formatDate(
                                    data.verified_until
                                )}
                            </span>
                            `
                            : ""
                    }

                    <button
                        id="ownerToggleVerifiedBtn"
                    >
                        ${
                            isVerifiedActive(data)
                                ? "Remove verification"
                                : "Give verification"
                        }
                    </button>
                </div>
            `;

            $("ownerToggleVerifiedBtn")
                ?.addEventListener(
                    "click",
                    () => toggleOwnerVerified(data)
                );
        }
    }

    async function toggleOwnerVerified(profile) {
        if (currentRole !== "owner") {
            toast(
                "Owner permission required.",
                "error"
            );
            return;
        }

        const active =
            isVerifiedActive(profile);

        const duration =
            Number(
                $("verifiedDuration")?.value || 30
            );

        const action =
            active ? "remove" : "give";

        /*
         * Existing RPC only accepts:
         * owner_set_verified(uuid, text)
         *
         * So we intentionally do NOT call a
         * nonexistent duration RPC.
         */

        const { error } =
            await db.rpc(
                "owner_set_verified",
                {
                    p_user_id:
                        profile.id,
                    p_action:
                        action
                }
            );

        if (error) {
            showError(error);
            return;
        }

        /*
         * If owner RLS allows direct expiry update,
         * save expiry. Otherwise the verified RPC
         * itself still controls verification.
         */

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
                        verified_until:
                            until
                    })
                    .eq(
                        "id",
                        profile.id
                    );

            if (expiryError) {
                console.warn(
                    "Could not set verified expiry:",
                    expiryError
                );

                toast(
                    "Verified status changed, but expiry needs the owner expiry RPC/policy.",
                    "warning"
                );
            }
        }

        toast(
            active
                ? "Verification removed."
                : "Verification updated.",
            "success"
        );

        await ownerSearchVerified();
    }

    async function loadOwnerReports() {
        const list =
            $("ownerReportsList");

        if (!list) return;

        const { data, error } =
            await db
                .from("reports")
                .select("*")
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
                <div class="empty-state">
                    No reports.
                </div>
            `;
            return;
        }

        data.forEach((report) => {
            const item =
                document.createElement("div");

            item.className =
                "owner-report-item";

            item.innerHTML = `
                <strong>
                    ${escapeHTML(
                        report.reason || "Report"
                    )}
                </strong>

                <p>
                    ${escapeHTML(
                        report.description || ""
                    )}
                </p>

                <small>
                    ${formatDate(
                        report.created_at
                    )}
                </small>
            `;

            list.appendChild(item);
        });
    }

    /* =========================================================
       SETTINGS / THEME / LANGUAGE
    ========================================================= */

    function applyTheme(theme) {
        const root =
            document.documentElement;

        if (theme === "system") {
            root.removeAttribute(
                "data-theme"
            );
        } else {
            root.setAttribute(
                "data-theme",
                theme
            );
        }

        localStorage.setItem(
            "megchatbox-theme",
            theme
        );
    }

    function applyDensity(density) {
        document.documentElement
            .setAttribute(
                "data-density",
                density
            );

        localStorage.setItem(
            "megchatbox-density",
            density
        );
    }

    function applyLanguage(language) {
        localStorage.setItem(
            "megchatbox-language",
            language
        );

        document.documentElement
            .setAttribute(
                "lang",
                language
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
            ) || "comfortable";

        const language =
            localStorage.getItem(
                "megchatbox-language"
            ) || "en";

        applyTheme(theme);
        applyDensity(density);
        applyLanguage(language);

        document
            .querySelectorAll(
                ".appearance-option[data-theme]"
            )
            .forEach((el) => {
                el.classList.toggle(
                    "active",
                    el.dataset.theme === theme
                );
            });

        document
            .querySelectorAll(
                ".appearance-option[data-density]"
            )
            .forEach((el) => {
                el.classList.toggle(
                    "active",
                    el.dataset.density === density
                );
            });

        document
            .querySelectorAll(
                ".language-option[data-language]"
            )
            .forEach((el) => {
                el.classList.toggle(
                    "active",
                    el.dataset.language === language
                );
            });
    }

    /* =========================================================
       SIDEBAR
    ========================================================= */

    async function refreshSidebar() {
        await Promise.all([
            renderContacts(),
            loadGroups(),
            loadChannels()
        ]);
    }

    function setupTabs() {
        document
            .querySelectorAll(
                ".sidebar-tab[data-tab]"
            )
            .forEach((tab) => {
                tab.addEventListener(
                    "click",
                    async () => {
                        document
                            .querySelectorAll(
                                ".sidebar-tab"
                            )
                            .forEach((x) =>
                                x.classList.remove(
                                    "active"
                                )
                            );

                        tab.classList.add(
                            "active"
                        );

                        const name =
                            tab.dataset.tab;

                        document
                            .querySelectorAll(
                                "#userList,#groupsList,#channelsList"
                            )
                            .forEach(
                                (list) => {
                                    list.style.display =
                                        "none";
                                }
                            );

                        if (name === "chats") {
                            $("userList").style.display =
                                "";
                            await renderContacts();
                        }

                        if (name === "groups") {
                            $("groupsList").style.display =
                                "";
                            await loadGroups();
                        }

                        if (name === "channels") {
                            $("channelsList").style.display =
                                "";
                            await loadChannels();
                        }
                    }
                );
            });
    }

    /* =========================================================
       LOGOUT / DELETE ACCOUNT
    ========================================================= */

    async function logout() {
        await db.auth.signOut();

        location.href = "index.html";
    }

    async function deleteAccount() {
        /*
         * Browser-side Supabase client cannot securely
         * delete auth.users without a trusted server
         * function.
         *
         * Never pretend the account was deleted.
         */

        toast(
            "Secure account deletion is not configured yet.",
            "warning"
        );
    }

    /* =========================================================
       EVENTS
    ========================================================= */

    function setupEvents() {
        $("settingsBtn")
            ?.addEventListener(
                "click",
                () => openModal(
                    "settingsModal"
                )
            );

        $("profileSettingsBtn")
            ?.addEventListener(
                "click",
                () => {
                    if (currentProfile) {
                        $("profileFullName").value =
                            currentProfile.full_name || "";

                        $("profileUsername").value =
                            currentProfile.username || "";

                        $("profileBio").value =
                            currentProfile.bio || "";
                    }

                    closeModal(
                        "settingsModal"
                    );

                    openModal(
                        "profileModal"
                    );
                }
            );

        $("privacySettingsBtn")
            ?.addEventListener(
                "click",
                async () => {
                    closeModal(
                        "settingsModal"
                    );

                    await loadPrivacy();

                    openModal(
                        "privacyModal"
                    );
                }
            );

        $("appearanceSettingsBtn")
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

        $("languageSettingsBtn")
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

        $("savedMessagesBtn")
            ?.addEventListener(
                "click",
                async () => {
                    closeModal(
                        "settingsModal"
                    );

                    await loadSavedMessages();

                    openModal(
                        "savedMessagesModal"
                    );
                }
            );

        $("updatesSettingsBtn")
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

        $("settingsLogoutBtn")
            ?.addEventListener(
                "click",
                logout
            );

        $("logoutBtn")
            ?.addEventListener(
                "click",
                logout
            );

        $("deleteAccountBtn")
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

        $("confirmDeleteAccountBtn")
            ?.addEventListener(
                "click",
                deleteAccount
            );

        $("profileForm")
            ?.addEventListener(
                "submit",
                (event) => {
                    event.preventDefault();
                    saveProfile();
                }
            );

        $("profileAvatarInput")
            ?.addEventListener(
                "change",
                handleProfileAvatar
            );

        $("showOnlineToggle")
            ?.addEventListener(
                "change",
                savePrivacy
            );

        $("showLastSeenToggle")
            ?.addEventListener(
                "change",
                savePrivacy
            );

        $("searchInput")
            ?.addEventListener(
                "input",
                (event) => {
                    clearTimeout(
                        searchTimer
                    );

                    searchTimer =
                        setTimeout(
                            () =>
                                searchEverything(
                                    event.target.value
                                ),
                            300
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

                    await refreshSidebar();
                }
            );

        $("messageForm")
            ?.addEventListener(
                "submit",
                async (event) => {
                    if (
                        activeCommunity
                    ) {
                        await sendCommunityMessage(
                            event
                        );
                    } else {
                        await sendMessage(
                            event
                        );
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
                async (event) => {
                    const file =
                        event.target.files?.[0];

                    if (file) {
                        await sendImage(file);
                    }

                    event.target.value = "";
                }
            );

        $("emojiBtn")
            ?.addEventListener(
                "click",
                () => {
                    $("emojiPanel")
                        ?.classList.toggle(
                            "open"
                        );
                }
            );

        $("stickerBtn")
            ?.addEventListener(
                "click",
                () => {
                    toast(
                        "Sticker panel is not available in this HTML yet.",
                        "info"
                    );
                }
            );

        $("emojiPanel")
            ?.addEventListener(
                "click",
                (event) => {
                    const emoji =
                        event.target.closest(
                            "[data-emoji]"
                        );

                    if (!emoji) return;

                    const input =
                        $("messageInput");

                    if (!input) return;

                    input.value +=
                        emoji.dataset.emoji;

                    input.focus();
                }
            );

        $("addContactBtn")
            ?.addEventListener(
                "click",
                () => {
                    if (activeChatUser) {
                        sendContactRequest(
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
                        await getRelationship(
                            activeChatUser?.id
                        );

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
                        await getRelationship(
                            activeChatUser?.id
                        );

                    if (relationship) {
                        await declineContactRequest(
                            relationship.id
                        );
                    }
                }
            );

        $("chatAvatarButton")
            ?.addEventListener(
                "click",
                () => {
                    if (
                        activeChatUser
                    ) {
                        openUserProfile(
                            activeChatUser
                        );
                    } else if (
                        activeCommunity
                    ) {
                        renderCommunityInfo(
                            activeCommunity,
                            activeCommunityType
                        );
                    }
                }
            );

        $("chatMoreBtn")
            ?.addEventListener(
                "click",
                () => {
                    if (
                        activeChatUser
                    ) {
                        openUserProfile(
                            activeChatUser
                        );
                    }

                    if (
                        activeCommunity
                    ) {
                        renderCommunityInfo(
                            activeCommunity,
                            activeCommunityType
                        );
                    }
                }
            );

        $("userProfileMenuBtn")
            ?.addEventListener(
                "click",
                (event) => {
                    event.stopPropagation();

                    $("userProfileMenu")
                        ?.classList.toggle(
                            "open"
                        );
                }
            );

        $("editNicknameBtn")
            ?.addEventListener(
                "click",
                () => {
                    closeModal(
                        "userProfileModal"
                    );

                    openModal(
                        "nicknameModal"
                    );
                }
            );

        $("removeNicknameBtn")
            ?.addEventListener(
                "click",
                removeNickname
            );

        $("removeNicknameBtnModal")
            ?.addEventListener(
                "click",
                removeNickname
            );

        $("saveNicknameBtn")
            ?.addEventListener(
                "click",
                saveNickname
            );

        $("blockUserBtn")
            ?.addEventListener(
                "click",
                blockUser
            );

        $("reportUserBtn")
            ?.addEventListener(
                "click",
                () => {
                    closeModal(
                        "userProfileModal"
                    );

                    openModal(
                        "reportModal"
                    );
                }
            );

        $("submitReportBtn")
            ?.addEventListener(
                "click",
                reportUser
            );

        $("createGroupBtn")
            ?.addEventListener(
                "click",
                () => openModal(
                    "createGroupModal"
                )
            );

        $("createChannelBtn")
            ?.addEventListener(
                "click",
                () => openModal(
                    "createChannelModal"
                )
            );

        $("joinGroupOpenBtn")
            ?.addEventListener(
                "click",
                () => openModal(
                    "joinGroupModal"
                )
            );

        $("joinChannelOpenBtn")
            ?.addEventListener(
                "click",
                () => openModal(
                    "joinChannelModal"
                )
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

        $("groupInviteBtn")
            ?.addEventListener(
                "click",
                () => createInvite(
                    "group"
                )
            );

        $("channelInviteBtn")
            ?.addEventListener(
                "click",
                () => createInvite(
                    "channel"
                )
            );

        $("groupMembersBtn")
            ?.addEventListener(
                "click",
                () => loadMembers(
                    "group"
                )
            );

        $("channelMembersBtn")
            ?.addEventListener(
                "click",
                () => loadMembers(
                    "channel"
                )
            );

        $("leaveGroupBtn")
            ?.addEventListener(
                "click",
                () => leaveCommunity(
                    "group"
                )
            );

        $("leaveChannelBtn")
            ?.addEventListener(
                "click",
                () => leaveCommunity(
                    "channel"
                )
            );

        $("publishUpdateBtn")
            ?.addEventListener(
                "click",
                publishUpdate
            );

        $("ownerVerifiedSearchBtn")
            ?.addEventListener(
                "click",
                ownerSearchVerified
            );

        $("ownerPanelButton")
            ?.addEventListener(
                "click",
                async () => {
                    if (
                        currentRole !== "owner"
                    ) {
                        toast(
                            "Owner permission required.",
                            "error"
                        );
                        return;
                    }

                    closeModal(
                        "settingsModal"
                    );

                    await loadOwnerReports();

                    openModal(
                        "ownerModal"
                    );
                }
            );

        $("adminPanelButton")
            ?.addEventListener(
                "click",
                () => {
                    if (
                        currentRole !== "owner" &&
                        currentRole !== "admin"
                    ) {
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

        $("openAdminReportsBtn")
            ?.addEventListener(
                "click",
                async () => {
                    await loadOwnerReports();
                    openModal(
                        "ownerModal"
                    );
                }
            );

        document
            .querySelectorAll(
                ".appearance-option[data-theme]"
            )
            .forEach((button) => {
                button.addEventListener(
                    "click",
                    () => {
                        applyTheme(
                            button.dataset.theme
                        );

                        loadAppearance();
                    }
                );
            });

        document
            .querySelectorAll(
                ".appearance-option[data-density]"
            )
            .forEach((button) => {
                button.addEventListener(
                    "click",
                    () => {
                        applyDensity(
                            button.dataset.density
                        );

                        loadAppearance();
                    }
                );
            });

        document
            .querySelectorAll(
                ".language-option[data-language]"
            )
            .forEach((button) => {
                button.addEventListener(
                    "click",
                    () => {
                        applyLanguage(
                            button.dataset.language
                        );

                        loadAppearance();
                    }
                );
            });

        document
            .querySelectorAll(
                "[data-close-modal]"
            )
            .forEach((button) => {
                button.addEventListener(
                    "click",
                    () => {
                        closeModal(
                            button.dataset.closeModal
                        );
                    }
                );
            });

        document
            .querySelectorAll(".modal")
            .forEach((modal) => {
                modal.addEventListener(
                    "click",
                    (event) => {
                        if (
                            event.target ===
                            modal
                        ) {
                            closeModal(
                                modal.id
                            );
                        }
                    }
                );
            });

        document
            .querySelectorAll(
                ".request-accept"
            )
            .forEach((button) => {
                button.addEventListener(
                    "click",
                    () =>
                        acceptContactRequest(
                            button.dataset.requestId
                        )
                );
            });

        document
            .querySelectorAll(
                ".request-decline"
            )
            .forEach((button) => {
                button.addEventListener(
                    "click",
                    () =>
                        declineContactRequest(
                            button.dataset.requestId
                        )
                );
            });

        document.addEventListener(
            "click",
            () => {
                $("userProfileMenu")
                    ?.classList.remove(
                        "open"
                    );

                document
                    .querySelectorAll(
                        ".message-wrapper.swiped"
                    )
                    .forEach(
                        resetMessageSwipe
                    );
            }
        );

        document.addEventListener(
            "keydown",
            (event) => {
                if (
                    event.key === "Escape"
                ) {
                    closeAllModals();
                }
            }
        );

        setupTabs();
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
                "megchatbox-dashboard"
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

                    if (
                        activeChatUser
                    ) {
                        const relationship =
                            await getRelationship(
                                activeChatUser.id
                            );

                        if (
                            relationship?.status ===
                            "accepted"
                        ) {
                            showDirectComposer(
                                true
                            );

                            await loadDirectMessages();
                        } else {
                            showDirectComposer(
                                false
                            );

                            renderContactActions(
                                relationship
                            );
                        }
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
                    if (
                        activeChatUser
                    ) {
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
                        activeCommunityType ===
                        "group"
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
                        activeCommunityType ===
                        "channel"
                    ) {
                        await loadCommunityMessages();
                    }
                }
            )
            .subscribe();
    }

    /* =========================================================
       HEARTBEAT
    ========================================================= */

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

    /* =========================================================
       INITIALIZATION
    ========================================================= */

    async function init() {
        const authenticated =
            await initAuth();

        if (!authenticated) return;

        loadAppearance();

        renderMyProfile();

        setupEvents();

        await loadRole();

        await updateLastSeen();

        await refreshSidebar();

        await loadUpdates();

        setupRealtime();

        setInterval(
            updateLastSeen,
            60 * 1000
        );

        setInterval(
            async () => {
                if (
                    activeChatUser
                ) {
                    renderChatHeader(
                        activeChatUser
                    );
                }

                renderMyProfile();
            },
            60 * 1000
        );

        console.log(
            "MegChatBox dashboard initialized."
        );
    }

    init();

})();
