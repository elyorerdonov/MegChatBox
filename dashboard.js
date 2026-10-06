(() => {
    "use strict";

    /* =========================================================
       MEGCHATBOX - DASHBOARD.JS V4
       Stable dashboard.html compatible version

       Main fixes:
       - Working modal close buttons
       - Dynamic contact request buttons
       - Better hold / swipe message actions
       - Owner tabs
       - Admin panel foundation
       - Public community join
       - Private community invite join
       - Public communities in lists
       - Community info
       - Current-chat message search
       - Safer community messaging
       - Better realtime handling
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
    let chatSearchTimer = null;

    let currentChatSearch = "";

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

        if (!profile.verified_until) {
            return true;
        }

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
        const name =
            profile?.full_name ||
            profile?.username ||
            "?";

        if (profile?.avatar_url) {
            return `
                <div class="${className}">
                    <img
                        src="${escapeAttr(profile.avatar_url)}"
                        alt=""
                        loading="lazy"
                    >
                </div>
            `;
        }

        return `
            <div class="${className}">
                <span>${escapeHTML(initials(name))}</span>
            </div>
        `;
    }

    function communityAvatarHTML(
        community,
        className = "list-avatar community-avatar"
    ) {
        const name = community?.name || "?";

        if (community?.avatar_url) {
            return `
                <div class="${className}">
                    <img
                        src="${escapeAttr(community.avatar_url)}"
                        alt=""
                        loading="lazy"
                    >
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

        box.classList.remove(
            "success",
            "error",
            "warning",
            "info"
        );

        box.classList.add(type);
        box.classList.add("show");

        clearTimeout(toast.timer);

        toast.timer = setTimeout(() => {
            box.classList.remove("show");
        }, 3000);
    }

    function showError(
        error,
        fallback = "Something went wrong."
    ) {
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
        document.querySelectorAll(".modal").forEach(
            (modal) => {
                modal.classList.remove("open");
                modal.style.display = "none";
            }
        );

        document.body.classList.remove("modal-open");
    }

    function isUniqueError(error) {
        return error?.code === "23505";
    }

    function isNotFoundError(error) {
        return error?.code === "PGRST116";
    }

    function isOwner() {
        return currentRole === "owner";
    }

    function isAdminOrOwner() {
        return (
            currentRole === "owner" ||
            currentRole === "admin"
        );
    }

    function canManageCommunity() {
        if (!activeCommunity) return false;

        return (
            activeCommunity.owner_id ===
                currentUser?.id ||
            isAdminOrOwner()
        );
    }

    function canDeleteCommunity() {
        return (
            activeCommunity &&
            activeCommunity.owner_id ===
                currentUser?.id
        );
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
        const cleanIds = [
            ...new Set(
                (ids || []).filter(Boolean)
            )
        ];

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

        try {
            currentProfile =
                await getProfile(currentUser.id);
        } catch (error) {
            showError(
                error,
                "Could not load your profile."
            );
            return false;
        }

        if (!currentProfile) {
            toast(
                "Profile not found.",
                "error"
            );
            return false;
        }

        if (currentProfile.account_blocked) {
            toast(
                "Your account is blocked.",
                "error"
            );

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

        const name =
            currentProfile.full_name ||
            currentProfile.username;

        const myName = $("myName");
        const myUsername = $("myUsername");
        const myAvatar = $("myAvatar");
        const myAvatarInitial =
            $("myAvatarInitial");
        const myVerified = $("myVerified");

        if (myName) {
            myName.textContent = name;
        }

        if (myUsername) {
            myUsername.textContent =
                `@${currentProfile.username}`;
        }

        if (myAvatar) {
            if (currentProfile.avatar_url) {
                myAvatar.innerHTML = `
                    <img
                        src="${escapeAttr(
                            currentProfile.avatar_url
                        )}"
                        alt=""
                    >
                `;
            } else {
                myAvatar.innerHTML = "";

                if (myAvatarInitial) {
                    myAvatarInitial.textContent =
                        initials(name);
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

        const fullName =
            $("profileFullName")?.value.trim();

        const username =
            $("profileUsername")
                ?.value
                .trim()
                .toLowerCase();

        const bio =
            $("profileBio")?.value.trim();

        if (!fullName) {
            toast(
                "Full name is required.",
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
                "Username must contain 3-32 lowercase letters, numbers or _.",
                "error"
            );
            return;
        }

        const {
            data: existing,
            error: existingError
        } = await db
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
            toast(
                "This username is already taken.",
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
                bio: bio || ""
            })
            .eq("id", currentUser.id)
            .select("*")
            .single();

        if (error) {
            if (isUniqueError(error)) {
                toast(
                    "This username is already taken.",
                    "error"
                );
            } else {
                showError(error);
            }

            return;
        }

        currentProfile = data;

        renderMyProfile();

        closeModal("profileModal");

        toast(
            "Profile updated.",
            "success"
        );
    }

    async function uploadAvatar(
        input,
        bucket,
        pathPrefix
    ) {
        if (
            !input?.files?.length ||
            !currentUser
        ) {
            return null;
        }

        const file = input.files[0];

        if (!file.type.startsWith("image/")) {
            toast(
                "Please select an image.",
                "error"
            );
            return null;
        }

        if (file.size > 5 * 1024 * 1024) {
            toast(
                "Image must be smaller than 5 MB.",
                "error"
            );
            return null;
        }

        const extension =
            file.name
                .split(".")
                .pop()
                ?.toLowerCase() || "jpg";

        const path =
            `${pathPrefix}/${currentUser.id}-${Date.now()}.${extension}`;

        const {
            error: uploadError
        } = await db.storage
            .from(bucket)
            .upload(
                path,
                file,
                {
                    upsert: true,
                    contentType: file.type
                }
            );

        if (uploadError) {
            showError(
                uploadError,
                "Avatar upload failed."
            );
            return null;
        }

        const { data } =
            db.storage
                .from(bucket)
                .getPublicUrl(path);

        return data?.publicUrl || null;
    }

    async function handleProfileAvatar() {
        const input =
            $("profileAvatarInput");

        const url =
            await uploadAvatar(
                input,
                "avatars",
                "profiles"
            );

        if (!url) return;

        const {
            data,
            error
        } = await db
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

        const image =
            $("profileAvatarImage");

        const initial =
            $("profileAvatarInitial");

        if (image) {
            image.src = url;
            image.style.display = "block";
        }

        if (initial) {
            initial.style.display = "none";
        }

        toast(
            "Avatar updated.",
            "success"
        );
    }

    async function loadPrivacy() {
        if (!currentProfile) return;

        const online =
            $("showOnlineToggle");

        const lastSeen =
            $("showLastSeenToggle");

        if (online) {
            online.checked =
                currentProfile.show_online !== false;
        }

        if (lastSeen) {
            lastSeen.checked =
                currentProfile.show_last_seen !== false;
        }
    }

    async function savePrivacy() {
        const showOnline =
            $("showOnlineToggle")
                ?.checked ?? true;

        const showLastSeen =
            $("showLastSeenToggle")
                ?.checked ?? true;

        const {
            data,
            error
        } = await db
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

        toast(
            "Privacy settings saved.",
            "success"
        );
    }

    /* =========================================================
       CONTACT REQUESTS
    ========================================================= */

    async function getContactRequests() {
        if (!currentUser) return [];

        const {
            data,
            error
        } = await db
            .from("contact_requests")
            .select("*")
            .or(
                `sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`
            )
            .order(
                "created_at",
                {
                    ascending: false
                }
            );

        if (error) {
            console.error(
                "Contact requests:",
                error
            );

            return [];
        }

        return data || [];
    }

    async function loadIncomingRequests() {
        if (!currentUser) return [];

        try {
            const {
                data: requests,
                error
            } = await db
                .from("contact_requests")
                .select("*")
                .eq(
                    "receiver_id",
                    currentUser.id
                )
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
                console.error(
                    "Incoming requests:",
                    error
                );

                return [];
            }

            if (!requests?.length) {
                currentRequests = [];
                return [];
            }

            const senderIds = [
                ...new Set(
                    requests.map(
                        (r) => r.sender_id
                    )
                )
            ];

            const profiles =
                await getProfiles(
                    senderIds
                );

            const map =
                new Map(
                    profiles.map(
                        (profile) => [
                            profile.id,
                            profile
                        ]
                    )
                );

            currentRequests =
                requests.map(
                    (request) => ({
                        ...request,
                        sender:
                            map.get(
                                request.sender_id
                            ) || null
                    })
                );

            return currentRequests;
        } catch (error) {
            console.error(
                "loadIncomingRequests:",
                error
            );

            return [];
        }
    }

    async function getAcceptedContacts() {
        const requests =
            await getContactRequests();

        const accepted =
            requests.filter(
                (r) =>
                    r.status === "accepted"
            );

        const ids =
            accepted.map(
                (request) =>
                    request.sender_id ===
                    currentUser.id
                        ? request.receiver_id
                        : request.sender_id
            );

        return [
            ...new Set(ids)
        ];
    }

    async function getRelationship(userId) {
        if (
            !currentUser ||
            !userId
        ) {
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
            .order(
                "created_at",
                {
                    ascending: false
                }
            )
            .limit(1)
            .maybeSingle();

        if (error) {
            console.error(
                "Relationship:",
                error
            );

            return null;
        }

        return data;
    }

    async function sendContactRequest(userId) {
        if (
            !userId ||
            userId === currentUser.id
        ) {
            return;
        }

        const relationship =
            await getRelationship(userId);

        if (
            relationship?.status ===
            "accepted"
        ) {
            toast(
                "You are already contacts.",
                "info"
            );
            return;
        }

        if (
            relationship?.status ===
            "pending"
        ) {
            toast(
                relationship.sender_id ===
                    currentUser.id
                    ? "Contact request already sent."
                    : "This user already sent you a request.",
                "info"
            );

            return;
        }

        const {
            error
        } = await db
            .from("contact_requests")
            .insert({
                sender_id:
                    currentUser.id,
                receiver_id:
                    userId,
                status: "pending"
            });

        if (error) {
            if (isUniqueError(error)) {
                toast(
                    "Contact request already exists.",
                    "info"
                );
            } else {
                showError(error);
            }

            return;
        }

        toast(
            "Contact request sent.",
            "success"
        );

        await refreshSidebar();
    }

    async function acceptContactRequest(
        requestId
    ) {
        if (!requestId) return;

        const {
            error
        } = await db
            .from("contact_requests")
            .update({
                status: "accepted"
            })
            .eq(
                "id",
                requestId
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
            showError(error);
            return;
        }

        toast(
            "Contact request accepted.",
            "success"
        );

        await refreshSidebar();

        if (activeUserProfile) {
            await openDirectChat(
                activeUserProfile
            );
        }
    }

    async function declineContactRequest(
        requestId
    ) {
        if (!requestId) return;

        const {
            error
        } = await db
            .from("contact_requests")
            .update({
                status: "declined"
            })
            .eq(
                "id",
                requestId
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
            showError(error);
            return;
        }

        toast(
            "Contact request declined.",
            "success"
        );

        await refreshSidebar();
    }

    /* =========================================================
       CONTACT LIST
    ========================================================= */

    async function renderContacts() {
        const list =
            $("userList");

        if (!list) return;

        list.innerHTML = `
            <div class="loading-state">
                Loading contacts...
            </div>
        `;

        const acceptedIds =
            await getAcceptedContacts();

        let profiles = [];

        try {
            profiles =
                await getProfiles(
                    acceptedIds
                );
        } catch (error) {
            showError(error);
        }

        const requests =
            await loadIncomingRequests();

        list.innerHTML = "";

        if (requests.length) {
            const title =
                document.createElement(
                    "div"
                );

            title.className =
                "section-title";

            title.textContent =
                "Contact requests";

            list.appendChild(title);

            requests.forEach(
                (request) => {
                    const profile =
                        request.sender;

                    if (!profile) return;

                    const item =
                        document.createElement(
                            "div"
                        );

                    item.className =
                        "contact-request-item";

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
                                ${verifiedHTML(
                                    profile
                                )}
                            </div>

                            <div class="list-user-username">
                                @${escapeHTML(
                                    profile.username
                                )}
                            </div>
                        </div>

                        <div class="request-actions">
                            <button
                                type="button"
                                class="request-accept"
                                data-request-id="${request.id}"
                            >
                                Accept
                            </button>

                            <button
                                type="button"
                                class="request-decline"
                                data-request-id="${request.id}"
                            >
                                Decline
                            </button>
                        </div>
                    `;

                    list.appendChild(item);
                }
            );
        }

        if (
            !profiles.length &&
            !requests.length
        ) {
            list.innerHTML += `
                <div class="empty-state">
                    No contacts yet.
                </div>
            `;
        }

        profiles.forEach(
            (profile) => {
                const item =
                    document.createElement(
                        "div"
                    );

                item.className =
                    "chat-list-item";

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
                            ${verifiedHTML(
                                profile
                            )}
                        </div>

                        <div class="list-user-username">
                            @${escapeHTML(
                                profile.username
                            )}
                        </div>
                    </div>
                `;

                item.addEventListener(
                    "click",
                    () =>
                        openDirectChat(
                            profile
                        )
                );

                list.appendChild(item);
            }
        );

        if ($("contactCount")) {
            $("contactCount")
                .textContent =
                profiles.length;
        }
    }

    /* =========================================================
       SEARCH
    ========================================================= */

    async function searchEverything(query) {
        query =
            query
                .trim()
                .toLowerCase();

        if (!query) {
            await refreshSidebar();
            return;
        }

        const usersList =
            $("userList");

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
                    verified_until,
                    last_seen,
                    show_online,
                    show_last_seen
                `)
                .or(
                    `username.ilike.%${query}%,full_name.ilike.%${query}%`
                )
                .neq(
                    "id",
                    currentUser.id
                )
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
            (
                usersResult.data || []
            ).forEach(
                (profile) =>
                    renderSearchUser(
                        usersList,
                        profile
                    )
            );
        }

        if (!groupsResult.error) {
            (
                groupsResult.data || []
            ).forEach(
                (group) =>
                    renderSearchCommunity(
                        usersList,
                        group,
                        "group"
                    )
            );
        }

        if (!channelsResult.error) {
            (
                channelsResult.data || []
            ).forEach(
                (channel) =>
                    renderSearchCommunity(
                        usersList,
                        channel,
                        "channel"
                    )
            );
        }

        if (!usersList.children.length) {
            usersList.innerHTML = `
                <div class="empty-state">
                    Nothing found.
                </div>
            `;
        }
    }

    function renderSearchUser(
        container,
        profile
    ) {
        const item =
            document.createElement(
                "div"
            );

        item.className =
            "search-result-item";

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
                </div>
            </div>

            <button
                type="button"
                class="search-user-action"
            >
                Open
            </button>
        `;

        item.querySelector("button")
            ?.addEventListener(
                "click",
                (event) => {
                    event.stopPropagation();

                    openDirectChat(
                        profile
                    );
                }
            );

        item.addEventListener(
            "click",
            () =>
                openDirectChat(
                    profile
                )
        );

        container.appendChild(item);
    }

    function renderSearchCommunity(
        container,
        community,
        type
    ) {
        const item =
            document.createElement(
                "div"
            );

        item.className =
            "search-result-item community-result";

        item.innerHTML = `
            ${communityAvatarHTML(
                community
            )}

            <div class="list-user-info">
                <div class="list-user-name">
                    ${escapeHTML(
                        community.name
                    )}
                </div>

                <div class="list-user-username">
                    @${escapeHTML(
                        community.username || ""
                    )}
                    · ${type}
                    · ${
                        community.privacy ===
                        "private"
                            ? "private"
                            : "public"
                    }
                </div>
            </div>
        `;

        item.addEventListener(
            "click",
            () =>
                openCommunity(
                    community,
                    type
                )
        );

        container.appendChild(item);
    }

    /* =========================================================
       DIRECT CHAT
    ========================================================= */

    async function openDirectChat(
        profile
    ) {
        if (!profile) return;

        activeChatUser = profile;

        activeCommunity = null;
        activeCommunityType = null;

        activeUserProfile = profile;

        currentChatSearch = "";

        closeModal(
            "userProfileModal"
        );

        renderChatHeader(profile);

        const relationship =
            await getRelationship(
                profile.id
            );

        if (
            relationship?.status ===
            "accepted"
        ) {
            showDirectComposer(true);

            await loadDirectMessages();
        } else {
            showDirectComposer(false);

            renderContactActions(
                relationship
            );

            $("messages").innerHTML = `
                <div class="messages-empty">
                    Add this user as a contact to start chatting.
                </div>
            `;
        }

        $("chatEmpty")
            ?.classList.add(
                "hidden"
            );

        $("activeChat")
            ?.classList.remove(
                "hidden"
            );
    }

    function renderChatHeader(
        profile
    ) {
        const name =
            profile.full_name ||
            profile.username ||
            "User";

        if ($("chatName")) {
            $("chatName").textContent =
                name;
        }

        if ($("chatVerified")) {
            $("chatVerified")
                .style.display =
                isVerifiedActive(profile)
                    ? "inline-flex"
                    : "none";
        }

        if ($("chatStatus")) {
            if (
                profile.show_online !== false &&
                profile.last_seen &&
                Date.now() -
                    new Date(
                        profile.last_seen
                    ).getTime() <
                    5 * 60 * 1000
            ) {
                $("chatStatus")
                    .textContent =
                    "online";
            } else if (
                profile.show_last_seen !==
                    false &&
                profile.last_seen
            ) {
                $("chatStatus")
                    .textContent =
                    `last seen ${formatDate(
                        profile.last_seen
                    )}`;
            } else {
                $("chatStatus")
                    .textContent = "";
            }
        }

        const avatar =
            $("chatAvatar");

        if (!avatar) return;

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
                        initials(name)
                    )}
                </span>
            `;
        }
    }

    function renderContactActions(
        relationship
    ) {
        const box =
            $("contactActions");

        if (!box) return;

        box.innerHTML = "";

        if (!activeChatUser) return;

        if (!relationship) {
            box.innerHTML = `
                <button
                    type="button"
                    id="dynamicAddContactBtn"
                >
                    Add Contact
                </button>
            `;

            $("dynamicAddContactBtn")
                ?.addEventListener(
                    "click",
                    () =>
                        sendContactRequest(
                            activeChatUser.id
                        )
                );

            return;
        }

        if (
            relationship.status ===
            "pending"
        ) {
            if (
                relationship.sender_id ===
                currentUser.id
            ) {
                box.innerHTML = `
                    <div class="request-status">
                        Contact request sent
                    </div>
                `;
            } else {
                box.innerHTML = `
                    <button
                        type="button"
                        id="dynamicAcceptBtn"
                    >
                        Accept
                    </button>

                    <button
                        type="button"
                        id="dynamicDeclineBtn"
                    >
                        Decline
                    </button>
                `;

                $("dynamicAcceptBtn")
                    ?.addEventListener(
                        "click",
                        () =>
                            acceptContactRequest(
                                relationship.id
                            )
                    );

                $("dynamicDeclineBtn")
                    ?.addEventListener(
                        "click",
                        () =>
                            declineContactRequest(
                                relationship.id
                            )
                    );
            }

            return;
        }

        if (
            relationship.status ===
            "declined"
        ) {
            box.innerHTML = `
                <button
                    type="button"
                    id="dynamicAddContactBtn"
                >
                    Add Contact
                </button>
            `;

            $("dynamicAddContactBtn")
                ?.addEventListener(
                    "click",
                    () =>
                        sendContactRequest(
                            activeChatUser.id
                        )
                );
        }
    }

    function showDirectComposer(
        enabled
    ) {
        const form =
            $("messageForm");

        const input =
            $("messageInput");

        const send =
            $("sendButton");

        if (form) {
            form.style.display =
                enabled
                    ? "flex"
                    : "none";
        }

        if (input) {
            input.disabled =
                !enabled;
        }

        if (send) {
            send.disabled =
                !enabled;
        }

        if ($("contactActions")) {
            $("contactActions")
                .style.display =
                enabled
                    ? "none"
                    : "flex";
        }
    }

    async function loadDirectMessages() {
        if (
            !currentUser ||
            !activeChatUser
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
                `and(sender_id.eq.${currentUser.id},receiver_id.eq.${activeChatUser.id}),and(sender_id.eq.${activeChatUser.id},receiver_id.eq.${currentUser.id})`
            )
            .order(
                "created_at",
                {
                    ascending: true
                }
            );

        if (error) {
            showError(error);
            return;
        }

        currentMessages =
            data || [];

        await renderMessages(
            currentMessages,
            "direct"
        );
    }

    /* =========================================================
       MEDIA
    ========================================================= */

    async function getMediaUrl(path) {
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

    /* =========================================================
       MESSAGE SEARCH
    ========================================================= */

    function filterMessages(
        messages
    ) {
        if (!currentChatSearch) {
            return messages;
        }

        const query =
            currentChatSearch
                .trim()
                .toLowerCase();

        if (!query) {
            return messages;
        }

        return messages.filter(
            (message) =>
                String(
                    message.content || ""
                )
                    .toLowerCase()
                    .includes(query)
        );
    }

    function showChatSearch() {
        const existing =
            $("chatSearchBox");

        if (existing) {
            existing.classList.toggle(
                "open"
            );

            if (
                existing.classList.contains(
                    "open"
                )
            ) {
                $("chatSearchInput")
                    ?.focus();
            }

            return;
        }

        const header =
            document.querySelector(
                ".chat-header"
            );

        if (!header) {
            toast(
                "Chat search is unavailable.",
                "warning"
            );
            return;
        }

        const box =
            document.createElement(
                "div"
            );

        box.id =
            "chatSearchBox";

        box.className =
            "chat-search-box open";

        box.innerHTML = `
            <input
                id="chatSearchInput"
                type="search"
                placeholder="Search messages..."
                autocomplete="off"
            >

            <button
                type="button"
                id="closeChatSearchBtn"
            >
                ✕
            </button>
        `;

        header.insertAdjacentElement(
            "afterend",
            box
        );

        $("chatSearchInput")
            ?.addEventListener(
                "input",
                (event) => {
                    clearTimeout(
                        chatSearchTimer
                    );

                    chatSearchTimer =
                        setTimeout(
                            async () => {
                                currentChatSearch =
                                    event.target.value.trim();

                                await renderMessages(
                                    currentMessages,
                                    activeCommunity
                                        ? activeCommunityType
                                        : "direct"
                                );
                            },
                            150
                        );
                }
            );

        $("closeChatSearchBtn")
            ?.addEventListener(
                "click",
                () => {
                    currentChatSearch =
                        "";

                    box.remove();

                    renderMessages(
                        currentMessages,
                        activeCommunity
                            ? activeCommunityType
                            : "direct"
                    );
                }
            );

        $("chatSearchInput")
            ?.focus();
    }

    /* =========================================================
       MESSAGE RENDER
    ========================================================= */

    async function renderMessages(
        messages,
        type
    ) {
        const container =
            $("messages");

        if (!container) return;

        const filtered =
            filterMessages(
                messages || []
            );

        container.innerHTML = "";

        if (
            currentChatSearch &&
            !filtered.length
        ) {
            container.innerHTML = `
                <div class="messages-empty">
                    No messages found.
                </div>
            `;

            return;
        }

        if (!filtered.length) {
            container.innerHTML = `
                <div class="messages-empty">
                    No messages yet.
                </div>
            `;

            return;
        }

        for (
            const message of filtered
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

            const wrapper =
                document.createElement(
                    "div"
                );

            wrapper.className =
                "message-wrapper";

            wrapper.dataset.messageId =
                message.id;

            let content = "";

            if (message.deleted_at) {
                content = `
                    <div class="message-bubble deleted-message">
                        Message deleted
                    </div>
                `;
            } else if (
                message.message_type ===
                    "image" &&
                message.image_url
            ) {
                const url =
                    await getMediaUrl(
                        message.image_url
                    );

                content = `
                    <div class="message-bubble image-message">
                        ${
                            url
                                ? `
                            <img
                                src="${escapeAttr(
                                    url
                                )}"
                                alt="Image"
                                loading="lazy"
                            >
                        `
                                : `
                            <span>
                                Image unavailable
                            </span>
                        `
                        }
                    </div>
                `;
            } else {
                content = `
                    <div class="message-bubble">
                        ${escapeHTML(
                            message.content
                        )}

                        ${
                            message.edited_at
                                ? `
                            <span class="edited-label">
                                edited
                            </span>
                        `
                                : ""
                        }
                    </div>
                `;
            }

            const canEditDelete =
                mine &&
                !message.deleted_at &&
                type === "direct";

            wrapper.innerHTML = `
                <div class="message-actions">
                    <button
                        type="button"
                        class="message-action"
                        data-action="save"
                        title="Save"
                    >
                        🔖
                    </button>

                    ${
                        canEditDelete
                            ? `
                        <button
                            type="button"
                            class="message-action"
                            data-action="edit"
                            title="Edit"
                        >
                            ✏️
                        </button>

                        <button
                            type="button"
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
                    ${formatTime(
                        message.created_at
                    )}
                </div>
            `;

            row.appendChild(
                wrapper
            );

            setupMessageSwipe(
                wrapper,
                message
            );

            container.appendChild(
                row
            );
        }

        container.scrollTop =
            container.scrollHeight;
    }

    /* =========================================================
       MESSAGE HOLD / SWIPE
    ========================================================= */

    function setupMessageSwipe(
        wrapper,
        message
    ) {
        let startX = 0;
        let currentX = 0;

        let holdTimer = null;
        let holding = false;
        let pointerActive = false;

        function clearHold() {
            if (holdTimer) {
                clearTimeout(
                    holdTimer
                );
                holdTimer = null;
            }
        }

        wrapper.addEventListener(
            "pointerdown",
            (event) => {
                if (
                    event.button !== undefined &&
                    event.button !== 0
                ) {
                    return;
                }

                pointerActive = true;

                startX =
                    event.clientX;

                currentX =
                    event.clientX;

                holding = false;

                clearHold();

                holdTimer =
                    setTimeout(() => {
                        if (!pointerActive) {
                            return;
                        }

                        holding = true;

                        wrapper.classList.add(
                            "hold-active"
                        );
                    }, 350);

                try {
                    wrapper.setPointerCapture(
                        event.pointerId
                    );
                } catch {}
            }
        );

        wrapper.addEventListener(
            "pointermove",
            (event) => {
                if (!pointerActive) {
                    return;
                }

                currentX =
                    event.clientX;

                const delta =
                    currentX -
                    startX;

                /*
                 * Allow slight movement before hold
                 * without accidentally triggering actions.
                 */

                if (
                    !holding &&
                    Math.abs(delta) > 12
                ) {
                    clearHold();
                    return;
                }

                if (!holding) return;

                if (delta < 0) {
                    const amount =
                        Math.max(
                            -80,
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
            (event) => {
                clearHold();

                if (!pointerActive) {
                    return;
                }

                pointerActive = false;

                if (holding) {
                    const delta =
                        currentX -
                        startX;

                    if (
                        delta <= -45
                    ) {
                        wrapper.classList.add(
                            "swiped"
                        );
                    } else {
                        /*
                         * A hold without swipe
                         * simply reveals actions.
                         */
                        wrapper.classList.add(
                            "swiped"
                        );
                    }
                }

                holding = false;

                try {
                    wrapper.releasePointerCapture(
                        event.pointerId
                    );
                } catch {}
            }
        );

        wrapper.addEventListener(
            "pointercancel",
            () => {
                clearHold();

                pointerActive = false;
                holding = false;

                resetMessageSwipe(
                    wrapper
                );
            }
        );

        wrapper
            .querySelectorAll(
                ".message-action"
            )
            .forEach(
                (button) => {
                    button.addEventListener(
                        "click",
                        async (event) => {
                            event.stopPropagation();

                            const action =
                                button.dataset.action;

                            if (
                                action ===
                                "save"
                            ) {
                                await saveMessage(
                                    message
                                );
                            }

                            if (
                                action ===
                                "edit"
                            ) {
                                await editMessage(
                                    message
                                );
                            }

                            if (
                                action ===
                                "delete"
                            ) {
                                await deleteMessage(
                                    message
                                );
                            }

                            resetMessageSwipe(
                                wrapper
                            );
                        }
                    );
                }
            );
    }

    function resetMessageSwipe(
        wrapper
    ) {
        if (!wrapper) return;

        wrapper.classList.remove(
            "swiped",
            "hold-active"
        );

        const bubble =
            wrapper.querySelector(
                ".message-bubble"
            );

        if (bubble) {
            bubble.style.transform =
                "";
        }
    }

    /* =========================================================
       SEND DIRECT MESSAGE
    ========================================================= */

    async function sendMessage(
        event
    ) {
        event?.preventDefault();

        if (
            !currentUser ||
            !activeChatUser
        ) {
            return;
        }

        const relationship =
            await getRelationship(
                activeChatUser.id
            );

        if (
            relationship?.status !==
            "accepted"
        ) {
            toast(
                "Accept the contact request before chatting.",
                "warning"
            );
            return;
        }

        if (
            currentProfile.messaging_blocked &&
            (
                !currentProfile
                    .messaging_blocked_until ||
                new Date(
                    currentProfile
                        .messaging_blocked_until
                ) > new Date()
            )
        ) {
            toast(
                "Messaging is currently blocked for your account.",
                "error"
            );
            return;
        }

        const input =
            $("messageInput");

        const content =
            input?.value.trim();

        if (!content) return;

        const {
            error
        } = await db
            .from("messages")
            .insert({
                sender_id:
                    currentUser.id,
                receiver_id:
                    activeChatUser.id,
                content,
                message_type:
                    "text"
            });

        if (error) {
            showError(error);
            return;
        }

        input.value = "";

        await loadDirectMessages();
    }

    async function sendImage(
        file
    ) {
        if (
            !file ||
            !activeChatUser
        ) {
            return;
        }

        const relationship =
            await getRelationship(
                activeChatUser.id
            );

        if (
            relationship?.status !==
            "accepted"
        ) {
            toast(
                "You are not contacts yet.",
                "warning"
            );
            return;
        }

        if (
            !file.type.startsWith(
                "image/"
            )
        ) {
            toast(
                "Only image files are supported.",
                "error"
            );
            return;
        }

        if (
            file.size >
            10 * 1024 * 1024
        ) {
            toast(
                "Image must be smaller than 10 MB.",
                "error"
            );
            return;
        }

        const extension =
            file.name.split(
                "."
            ).pop() || "jpg";

        const path =
            `${currentUser.id}/${Date.now()}-${crypto.randomUUID()}.${extension}`;

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
            showError(
                uploadError,
                "Image upload failed."
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
                    activeChatUser.id,
                content: "",
                message_type:
                    "image",
                image_url:
                    path
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

    async function editMessage(
        message
    ) {
        if (
            message.sender_id !==
            currentUser.id
        ) {
            return;
        }

        if (
            message.deleted_at
        ) {
            return;
        }

        const value =
            prompt(
                "Edit message:",
                message.content || ""
            );

        if (value === null) {
            return;
        }

        const content =
            value.trim();

        if (!content) {
            toast(
                "Message cannot be empty.",
                "error"
            );
            return;
        }

        const {
            error
        } = await db
            .from("messages")
            .update({
                content,
                edited_at:
                    new Date().toISOString()
            })
            .eq(
                "id",
                message.id
            )
            .eq(
                "sender_id",
                currentUser.id
            );

        if (error) {
            showError(error);
            return;
        }

        await loadDirectMessages();
    }

    async function deleteMessage(
        message
    ) {
        if (
            message.sender_id !==
            currentUser.id
        ) {
            return;
        }

        if (
            !confirm(
                "Delete this message?"
            )
        ) {
            return;
        }

        const {
            error
        } = await db
            .from("messages")
            .update({
                deleted_at:
                    new Date().toISOString()
            })
            .eq(
                "id",
                message.id
            )
            .eq(
                "sender_id",
                currentUser.id
            );

        if (error) {
            showError(error);
            return;
        }

        await loadDirectMessages();
    }

    async function saveMessage(
        message
    ) {
        const payload = {
            user_id:
                currentUser.id,
            message_id:
                message.id,
            content:
                message.content || ""
        };

        const {
            error
        } = await db
            .from("saved_messages")
            .insert(
                payload
            );

        if (error) {
            if (
                isUniqueError(error)
            ) {
                toast(
                    "Message is already saved.",
                    "info"
                );
            } else {
                showError(
                    error,
                    "Could not save message."
                );
            }

            return;
        }

        toast(
            "Message saved.",
            "success"
        );
    }

    /* =========================================================
       GROUPS
    ========================================================= */

    async function loadGroups() {
        const list =
            $("groupsList");

        if (!list) return;

        /*
         * Members first.
         */
        const {
            data: memberships,
            error: membershipError
        } = await db
            .from("group_members")
            .select("group_id")
            .eq(
                "user_id",
                currentUser.id
            );

        if (membershipError) {
            console.error(
                membershipError
            );
        }

        const memberIds =
            (memberships || [])
                .map(
                    (x) => x.group_id
                );

        /*
         * Public groups can be discovered without
         * membership. We also include private groups
         * where the current user is already a member.
         */
        const [
            publicResult,
            memberResult
        ] = await Promise.all([
            db
                .from("groups")
                .select("*")
                .eq(
                    "privacy",
                    "public"
                )
                .order(
                    "created_at",
                    {
                        ascending: false
                    }
                )
                .limit(100),

            memberIds.length
                ? db
                    .from("groups")
                    .select("*")
                    .in(
                        "id",
                        memberIds
                    )
                    .order(
                        "created_at",
                        {
                            ascending: false
                        }
                    )
                : Promise.resolve({
                    data: [],
                    error: null
                })
        ]);

        if (
            publicResult.error &&
            memberResult.error
        ) {
            list.innerHTML = `
                <div class="empty-state">
                    Could not load groups.
                </div>
            `;

            return;
        }

        const map =
            new Map();

        (
            publicResult.data || []
        ).forEach(
            (group) =>
                map.set(
                    group.id,
                    group
                )
        );

        (
            memberResult.data || []
        ).forEach(
            (group) =>
                map.set(
                    group.id,
                    group
                )
        );

        const groups =
            [...map.values()]
                .sort(
                    (a, b) =>
                        new Date(
                            b.created_at || 0
                        ) -
                        new Date(
                            a.created_at || 0
                        )
                );

        list.innerHTML = "";

        if (!groups.length) {
            list.innerHTML = `
                <div class="empty-state">
                    No groups yet.
                </div>
            `;

            if ($("groupCount")) {
                $("groupCount")
                    .textContent = "0";
            }

            return;
        }

        groups.forEach(
            (group) =>
                renderCommunityItem(
                    list,
                    group,
                    "group"
                )
        );

        if ($("groupCount")) {
            $("groupCount")
                .textContent =
                groups.length;
        }
    }

    function renderCommunityItem(
        container,
        community,
        type
    ) {
        const item =
            document.createElement(
                "div"
            );

        item.className =
            "chat-list-item";

        const privateText =
            community.privacy ===
            "private"
                ? " · Private"
                : "";

        item.innerHTML = `
            ${communityAvatarHTML(
                community
            )}

            <div class="list-user-info">
                <div class="list-user-name">
                    ${escapeHTML(
                        community.name
                    )}
                </div>

                <div class="list-user-username">
                    @${escapeHTML(
                        community.username || ""
                    )}
                    ${privateText}
                </div>
            </div>
        `;

        item.addEventListener(
            "click",
            () =>
                openCommunity(
                    community,
                    type
                )
        );

        container.appendChild(
            item
        );
    }

    async function createGroup(
        event
    ) {
        event?.preventDefault();

        const name =
            $("groupName")
                ?.value.trim();

        const username =
            $("groupUsername")
                ?.value
                .trim()
                .toLowerCase();

        const bio =
            $("groupBio")
                ?.value.trim();

        const privacy =
            document.querySelector(
                'input[name="groupPrivacy"]:checked'
            )?.value ||
            "public";

        if (!name) {
            toast(
                "Group name is required.",
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
                "Invalid group username.",
                "error"
            );
            return;
        }

        const {
            data: sameGroup
        } = await db
            .from("groups")
            .select("id")
            .eq(
                "username",
                username
            )
            .maybeSingle();

        if (sameGroup) {
            toast(
                "This group username is already taken.",
                "error"
            );
            return;
        }

        const {
            data: sameProfile
        } = await db
            .from("profiles")
            .select("id")
            .eq(
                "username",
                username
            )
            .maybeSingle();

        if (sameProfile) {
            toast(
                "This username is already used by a user.",
                "error"
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
                p_username:
                    username,
                p_bio:
                    bio || ""
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
            typeof groupId ===
            "object"
                ? groupId?.id
                : groupId;

        if (id) {
            const {
                error: privacyError
            } = await db
                .from("groups")
                .update({
                    privacy
                })
                .eq(
                    "id",
                    id
                );

            if (privacyError) {
                console.warn(
                    "Could not update group privacy:",
                    privacyError
                );
            }
        }

        const input =
            $("groupAvatarInput");

        if (
            id &&
            input?.files?.length
        ) {
            const url =
                await uploadCommunityAvatar(
                    input,
                    "group-avatars",
                    "groups"
                );

            if (url) {
                await db
                    .from("groups")
                    .update({
                        avatar_url:
                            url
                    })
                    .eq(
                        "id",
                        id
                    );
            }
        }

        closeModal(
            "createGroupModal"
        );

        $("groupForm")
            ?.reset();

        toast(
            "Group created.",
            "success"
        );

        await loadGroups();
    }

    async function uploadCommunityAvatar(
        input,
        bucket,
        folder
    ) {
        if (
            !input?.files?.length
        ) {
            return null;
        }

        const file =
            input.files[0];

        if (
            !file.type.startsWith(
                "image/"
            )
        ) {
            toast(
                "Please select an image.",
                "error"
            );
            return null;
        }

        if (
            file.size >
            5 * 1024 * 1024
        ) {
            toast(
                "Image must be smaller than 5 MB.",
                "error"
            );
            return null;
        }

        const extension =
            file.name
                .split(".")
                .pop() ||
            "jpg";

        const path =
            `${folder}/${crypto.randomUUID()}.${extension}`;

        const {
            error
        } = await db.storage
            .from(bucket)
            .upload(
                path,
                file,
                {
                    upsert: false,
                    contentType:
                        file.type
                }
            );

        if (error) {
            showError(error);
            return null;
        }

        const { data } =
            db.storage
                .from(bucket)
                .getPublicUrl(path);

        return data?.publicUrl ||
            null;
    }

    /* =========================================================
       CHANNELS
    ========================================================= */

    async function loadChannels() {
        const list =
            $("channelsList");

        if (!list) return;

        const {
            data: memberships,
            error: membershipError
        } = await db
            .from("channel_members")
            .select("channel_id")
            .eq(
                "user_id",
                currentUser.id
            );

        if (membershipError) {
            console.error(
                membershipError
            );
        }

        const memberIds =
            (memberships || [])
                .map(
                    (x) =>
                        x.channel_id
                );

        const [
            publicResult,
            memberResult
        ] = await Promise.all([
            db
                .from("channels")
                .select("*")
                .eq(
                    "privacy",
                    "public"
                )
                .order(
                    "created_at",
                    {
                        ascending: false
                    }
                )
                .limit(100),

            memberIds.length
                ? db
                    .from("channels")
                    .select("*")
                    .in(
                        "id",
                        memberIds
                    )
                    .order(
                        "created_at",
                        {
                            ascending: false
                        }
                    )
                : Promise.resolve({
                    data: [],
                    error: null
                })
        ]);

        const map =
            new Map();

        (
            publicResult.data || []
        ).forEach(
            (channel) =>
                map.set(
                    channel.id,
                    channel
                )
        );

        (
            memberResult.data || []
        ).forEach(
            (channel) =>
                map.set(
                    channel.id,
                    channel
                )
        );

        const channels =
            [...map.values()]
                .sort(
                    (a, b) =>
                        new Date(
                            b.created_at || 0
                        ) -
                        new Date(
                            a.created_at || 0
                        )
                );

        list.innerHTML = "";

        if (!channels.length) {
            list.innerHTML = `
                <div class="empty-state">
                    No channels yet.
                </div>
            `;

            if ($("channelCount")) {
                $("channelCount")
                    .textContent = "0";
            }

            return;
        }

        channels.forEach(
            (channel) =>
                renderCommunityItem(
                    list,
                    channel,
                    "channel"
                )
        );

        if ($("channelCount")) {
            $("channelCount")
                .textContent =
                channels.length;
        }
    }

    async function createChannel(
        event
    ) {
        event?.preventDefault();

        const name =
            $("channelName")
                ?.value.trim();

        const username =
            $("channelUsername")
                ?.value
                .trim()
                .toLowerCase();

        const bio =
            $("channelBio")
                ?.value.trim();

        const privacy =
            document.querySelector(
                'input[name="channelPrivacy"]:checked'
            )?.value ||
            "public";

        if (!name) {
            toast(
                "Channel name is required.",
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
                "Invalid channel username.",
                "error"
            );
            return;
        }

        const {
            data: existing
        } = await db
            .from("channels")
            .select("id")
            .eq(
                "username",
                username
            )
            .maybeSingle();

        if (existing) {
            toast(
                "This channel username is already taken.",
                "error"
            );
            return;
        }

        const {
            data: profileMatch
        } = await db
            .from("profiles")
            .select("id")
            .eq(
                "username",
                username
            )
            .maybeSingle();

        if (profileMatch) {
            toast(
                "This username is already used by a user.",
                "error"
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
                p_username:
                    username,
                p_bio:
                    bio || ""
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
            typeof channelId ===
            "object"
                ? channelId?.id
                : channelId;

        if (id) {
            const {
                error: privacyError
            } = await db
                .from("channels")
                .update({
                    privacy
                })
                .eq(
                    "id",
                    id
                );

            if (privacyError) {
                console.warn(
                    "Could not update channel privacy:",
                    privacyError
                );
            }
        }

        const input =
            $("channelAvatarInput");

        if (
            id &&
            input?.files?.length
        ) {
            const url =
                await uploadCommunityAvatar(
                    input,
                    "channel-avatars",
                    "channels"
                );

            if (url) {
                await db
                    .from("channels")
                    .update({
                        avatar_url:
                            url
                    })
                    .eq(
                        "id",
                        id
                    );
            }
        }

        closeModal(
            "createChannelModal"
        );

        $("channelForm")
            ?.reset();

        toast(
            "Channel created.",
            "success"
        );

        await loadChannels();
    }

    /* =========================================================
       COMMUNITY MEMBERSHIP
    ========================================================= */

    async function getCommunityMembership(
        community,
        type
    ) {
        if (
            !community ||
            !currentUser
        ) {
            return null;
        }

        const table =
            type === "group"
                ? "group_members"
                : "channel_members";

        const idColumn =
            type === "group"
                ? "group_id"
                : "channel_id";

        const {
            data,
            error
        } = await db
            .from(table)
            .select("*")
            .eq(
                idColumn,
                community.id
            )
            .eq(
                "user_id",
                currentUser.id
            )
            .maybeSingle();

        if (error) {
            console.error(
                "Community membership:",
                error
            );
            return null;
        }

        return data;
    }

    /* =========================================================
       COMMUNITY JOIN UI
    ========================================================= */

    function renderCommunityJoinState(
        community,
        type
    ) {
        const actions =
            $("contactActions");

        if (!actions) return;

        actions.style.display =
            "flex";

        const isPrivate =
            community.privacy ===
            "private";

        actions.innerHTML = `
            <div class="community-join-card">
                ${communityAvatarHTML(
                    community,
                    "community-join-avatar"
                )}

                <div class="community-join-info">
                    <strong>
                        ${escapeHTML(
                            community.name
                        )}
                    </strong>

                    <span>
                        @${escapeHTML(
                            community.username ||
                            ""
                        )}
                    </span>

                    <p>
                        ${escapeHTML(
                            community.bio ||
                            `Join this ${type}.`
                        )}
                    </p>

                    <small>
                        ${
                            isPrivate
                                ? "Private community"
                                : "Public community"
                        }
                    </small>
                </div>

                <div class="community-join-question">
                    Do you want to join?
                </div>

                <div class="community-join-actions">
                    <button
                        type="button"
                        id="communityJoinYesBtn"
                        class="primary-btn"
                    >
                        YES
                    </button>

                    <button
                        type="button"
                        id="communityJoinNoBtn"
                    >
                        NO
                    </button>
                </div>
            </div>
        `;

        $("communityJoinYesBtn")
            ?.addEventListener(
                "click",
                () => {
                    if (
                        community.privacy ===
                        "public"
                    ) {
                        joinPublicCommunity(
                            community,
                            type
                        );
                    } else {
                        openPrivateJoin(
                            community,
                            type
                        );
                    }
                }
            );

        $("communityJoinNoBtn")
            ?.addEventListener(
                "click",
                () => {
                    actions.innerHTML =
                        "";
                }
            );
    }

    async function joinPublicCommunity(
        community,
        type
    ) {
        const table =
            type === "group"
                ? "group_members"
                : "channel_members";

        const idColumn =
            type === "group"
                ? "group_id"
                : "channel_id";

        /*
         * First try the direct insert.
         * This works when the corresponding RLS
         * policy permits joining public communities.
         */
        const {
            error
        } = await db
            .from(table)
            .insert({
                [idColumn]:
                    community.id,
                user_id:
                    currentUser.id,
                role:
                    "member"
            });

        if (error) {
            /*
             * Some databases intentionally block direct
             * membership insertion. In that case we show
             * the invite UI instead of pretending success.
             */
            console.error(
                "Public community join:",
                error
            );

            toast(
                "Public join is not enabled by the database policy yet.",
                "warning"
            );

            return;
        }

        toast(
            `Joined ${type}.`,
            "success"
        );

        if (type === "group") {
            await loadGroups();
        } else {
            await loadChannels();
        }

        await openCommunity(
            community,
            type
        );
    }

    function openPrivateJoin(
        community,
        type
    ) {
        /*
         * Private communities still use invite codes
         * with the current database structure.
         */
        if (type === "group") {
            openModal(
                "joinGroupModal"
            );
        } else {
            openModal(
                "joinChannelModal"
            );
        }

        toast(
            "Private community: enter an invite code.",
            "info"
        );
    }

    /* =========================================================
       OPEN COMMUNITY
    ========================================================= */

    async function openCommunity(
        community,
        type
    ) {
        if (!community) return;

        activeCommunity =
            community;

        activeCommunityType =
            type;

        activeChatUser = null;
        activeUserProfile = null;

        currentChatSearch = "";

        const searchBox =
            $("chatSearchBox");

        searchBox?.remove();

        renderCommunityHeader(
            community,
            type
        );

        $("chatEmpty")
            ?.classList.add(
                "hidden"
            );

        $("activeChat")
            ?.classList.remove(
                "hidden"
            );

        const membership =
            await getCommunityMembership(
                community,
                type
            );

        if (!membership) {
            showDirectComposer(false);

            renderCommunityJoinState(
                community,
                type
            );

            $("messages").innerHTML = `
                <div class="messages-empty">
                    ${
                        community.privacy ===
                        "private"
                            ? "This is a private community."
                            : "Join this community to see its messages."
                    }
                </div>
            `;

            return;
        }

        /*
         * Groups: members can send.
         * Channels: only owner/admin can send
         * with the current channel model.
         */
        if (
            type === "channel" &&
            membership.role !== "owner" &&
            membership.role !== "admin"
        ) {
            showDirectComposer(false);

            $("messages").insertAdjacentHTML(
                "afterbegin",
                `
                <div class="messages-empty channel-readonly-note">
                    You can read this channel.
                </div>
                `
            );
        } else {
            showDirectComposer(true);
        }

        if ($("contactActions")) {
            $("contactActions")
                .style.display =
                "none";
        }

        await loadCommunityMessages();
    }

    function renderCommunityHeader(
        community,
        type
    ) {
        if ($("chatName")) {
            $("chatName")
                .textContent =
                community.name;
        }

        if ($("chatVerified")) {
            $("chatVerified")
                .style.display =
                "none";
        }

        if ($("chatStatus")) {
            $("chatStatus")
                .textContent =
                type === "group"
                    ? "Group"
                    : "Channel";
        }

        const avatar =
            $("chatAvatar");

        if (!avatar) return;

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

    async function loadCommunityMessages() {
        if (
            !activeCommunity ||
            !activeCommunityType
        ) {
            return;
        }

        const table =
            activeCommunityType ===
            "group"
                ? "group_messages"
                : "channel_messages";

        const column =
            activeCommunityType ===
            "group"
                ? "group_id"
                : "channel_id";

        const {
            data,
            error
        } = await db
            .from(table)
            .select("*")
            .eq(
                column,
                activeCommunity.id
            )
            .order(
                "created_at",
                {
                    ascending: true
                }
            );

        if (error) {
            showError(error);
            return;
        }

        currentMessages =
            data || [];

        await renderMessages(
            currentMessages,
            activeCommunityType
        );
    }

    async function sendCommunityMessage(
        event
    ) {
        event?.preventDefault();

        if (
            !activeCommunity ||
            !activeCommunityType
        ) {
            return;
        }

        const membership =
            await getCommunityMembership(
                activeCommunity,
                activeCommunityType
            );

        if (!membership) {
            toast(
                "Join this community first.",
                "warning"
            );
            return;
        }

        if (
            activeCommunityType ===
                "channel" &&
            membership.role !==
                "owner" &&
            membership.role !==
                "admin"
        ) {
            toast(
                "Only channel admins can post.",
                "warning"
            );
            return;
        }

        if (
            currentProfile.messaging_blocked &&
            (
                !currentProfile
                    .messaging_blocked_until ||
                new Date(
                    currentProfile
                        .messaging_blocked_until
                ) > new Date()
            )
        ) {
            toast(
                "Messaging is currently blocked.",
                "error"
            );
            return;
        }

        const input =
            $("messageInput");

        const content =
            input?.value.trim();

        if (!content) return;

        const table =
            activeCommunityType ===
            "group"
                ? "group_messages"
                : "channel_messages";

        const payload =
            activeCommunityType ===
            "group"
                ? {
                    group_id:
                        activeCommunity.id,
                    sender_id:
                        currentUser.id,
                    content,
                    message_type:
                        "text"
                }
                : {
                    channel_id:
                        activeCommunity.id,
                    sender_id:
                        currentUser.id,
                    content,
                    message_type:
                        "text"
                };

        const {
            error
        } = await db
            .from(table)
            .insert(
                payload
            );

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

        const {
            error
        } = await db.rpc(
            "join_group_by_invite",
            {
                p_invite_code:
                    code
            }
        );

        if (error) {
            showError(
                error,
                "Could not join group."
            );
            return;
        }

        closeModal(
            "joinGroupModal"
        );

        if (input) {
            input.value = "";
        }

        toast(
            "Joined group.",
            "success"
        );

        await loadGroups();

        if (
            activeCommunity &&
            activeCommunityType ===
                "group"
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

        const {
            error
        } = await db.rpc(
            "join_channel_by_invite",
            {
                p_invite_code:
                    code
            }
        );

        if (error) {
            showError(
                error,
                "Could not join channel."
            );
            return;
        }

        closeModal(
            "joinChannelModal"
        );

        if (input) {
            input.value = "";
        }

        toast(
            "Joined channel.",
            "success"
        );

        await loadChannels();

        if (
            activeCommunity &&
            activeCommunityType ===
                "channel"
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
        if (!activeUserProfile) {
            return;
        }

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

        const {
            error
        } = await db
            .from("contact_nicknames")
            .upsert(
                {
                    user_id:
                        currentUser.id,
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

        closeModal(
            "nicknameModal"
        );

        toast(
            "Nickname saved.",
            "success"
        );

        await refreshSidebar();
    }

    async function removeNickname() {
        if (!activeUserProfile) {
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
                activeUserProfile.id
            );

        if (error) {
            showError(error);
            return;
        }

        closeModal(
            "nicknameModal"
        );

        toast(
            "Nickname removed.",
            "success"
        );

        await refreshSidebar();
    }

    /* =========================================================
       USER PROFILE
    ========================================================= */

    async function openUserProfile(
        profile
    ) {
        if (!profile) return;

        activeUserProfile =
            profile;

        if ($("userProfileName")) {
            $("userProfileName")
                .textContent =
                profile.full_name ||
                profile.username;
        }

        if ($("userProfileUsername")) {
            $("userProfileUsername")
                .textContent =
                `@${profile.username}`;
        }

        if ($("userProfileBio")) {
            $("userProfileBio")
                .textContent =
                profile.bio || "";
        }

        if ($("userProfileVerified")) {
            $("userProfileVerified")
                .style.display =
                isVerifiedActive(profile)
                    ? "inline-flex"
                    : "none";
        }

        if ($("userProfileStatus")) {
            $("userProfileStatus")
                .textContent =
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

        openModal(
            "userProfileModal"
        );
    }

    async function blockUser() {
        if (!activeUserProfile) {
            return;
        }

        /*
         * Owner protection.
         */
        if (
            activeUserProfile.id ===
            currentProfile?.id
        ) {
            toast(
                "You cannot block yourself.",
                "warning"
            );
            return;
        }

        if (
            !confirm(
                `Block @${activeUserProfile.username}?`
            )
        ) {
            return;
        }

        const {
            data: target
        } = await db
            .from("profiles")
            .select("role")
            .eq(
                "id",
                activeUserProfile.id
            )
            .maybeSingle();

        if (
            target?.role === "owner" &&
            currentRole !== "owner"
        ) {
            toast(
                "Owner cannot be blocked.",
                "error"
            );
            return;
        }

        const {
            error
        } = await db
            .from("user_blocks")
            .insert({
                blocker_id:
                    currentUser.id,
                blocked_id:
                    activeUserProfile.id
            });

        if (error) {
            if (
                isUniqueError(error)
            ) {
                toast(
                    "User is already blocked.",
                    "info"
                );
            } else {
                showError(error);
            }

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
        if (!activeUserProfile) {
            return;
        }

        const reason =
            document.querySelector(
                'input[name="reportReason"]:checked'
            )?.value;

        const description =
            $("reportDescription")
                ?.value.trim();

        if (!reason) {
            toast(
                "Select a report reason.",
                "error"
            );
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
                    activeUserProfile.id,
                reason,
                description:
                    description || ""
            });

        if (error) {
            showError(error);
            return;
        }

        closeModal(
            "reportModal"
        );

        if ($("reportDescription")) {
            $("reportDescription")
                .value = "";
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

        data.forEach(
            (item) => {
                const row =
                    document.createElement(
                        "div"
                    );

                row.className =
                    "saved-message-item";

                row.innerHTML = `
                    <div class="saved-message-content">
                        ${escapeHTML(
                            item.content ||
                            ""
                        )}
                    </div>

                    <div class="saved-message-date">
                        ${formatDate(
                            item.created_at
                        )}
                    </div>
                `;

                list.appendChild(
                    row
                );
            }
        );
    }

    /* =========================================================
       UPDATES
    ========================================================= */

    async function loadUpdates() {
        const list =
            $("updatesList");

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

        data.forEach(
            (update) => {
                const item =
                    document.createElement(
                        "div"
                    );

                item.className =
                    "update-item";

                item.innerHTML = `
                    <div class="update-type">
                        ${escapeHTML(
                            update.type ||
                            "update"
                        )}
                    </div>

                    <h3>
                        ${escapeHTML(
                            update.title ||
                            ""
                        )}
                    </h3>

                    <p>
                        ${escapeHTML(
                            update.content ||
                            ""
                        )}
                    </p>

                    <small>
                        ${formatDate(
                            update.created_at
                        )}
                    </small>
                `;

                list.appendChild(
                    item
                );
            }
        );
    }

    async function publishUpdate() {
        const title =
            $("updateTitle")
                ?.value.trim();

        const content =
            $("updateContent")
                ?.value.trim();

        const type =
            $("updateType")
                ?.value ||
            "update";

        if (!title || !content) {
            toast(
                "Title and content are required.",
                "error"
            );
            return;
        }

        if (!isAdminOrOwner()) {
            toast(
                "You do not have permission.",
                "error"
            );
            return;
        }

        const {
            error
        } = await db
            .from("app_updates")
            .insert({
                type,
                title,
                content,
                created_by:
                    currentUser.id,
                published: true
            });

        if (error) {
            showError(error);
            return;
        }

        if ($("updateTitle")) {
            $("updateTitle")
                .value = "";
        }

        if ($("updateContent")) {
            $("updateContent")
                .value = "";
        }

        toast(
            "Update published.",
            "success"
        );

        await loadUpdates();
    }

    /* =========================================================
       COMMUNITY INFO
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
                community.privacy ||
                "public";
        }

        if (avatar) {
            avatar.innerHTML =
                communityAvatarHTML(
                    community,
                    "community-info-avatar"
                );
        }

        openModal(modal);
    }

    async function loadMembers(
        type
    ) {
        if (!activeCommunity) {
            return;
        }

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

        const {
            data,
            error
        } = await db
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
                (member) =>
                    member.user_id
            );

        let profiles = [];

        try {
            profiles =
                await getProfiles(ids);
        } catch (error) {
            showError(error);
        }

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

        (
            data || []
        ).forEach(
            (member) => {
                const profile =
                    map.get(
                        member.user_id
                    );

                if (!profile) return;

                const item =
                    document.createElement(
                        "div"
                    );

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
                            ${verifiedHTML(
                                profile
                            )}
                        </div>

                        <div class="list-user-username">
                            @${escapeHTML(
                                profile.username
                            )}
                            · ${escapeHTML(
                                member.role ||
                                "member"
                            )}
                        </div>
                    </div>
                `;

                list.appendChild(
                    item
                );
            }
        );

        if ($("membersTitle")) {
            $("membersTitle")
                .textContent =
                type === "group"
                    ? "Group members"
                    : "Channel members";
        }

        openModal(
            "membersModal"
        );
    }

    async function leaveCommunity(
        type
    ) {
        if (!activeCommunity) {
            return;
        }

        if (
            !confirm(
                `Leave this ${type}?`
            )
        ) {
            return;
        }

        /*
         * Owner should not accidentally leave a community
         * they own through the normal Leave button.
         */
        if (
            activeCommunity.owner_id ===
            currentUser.id
        ) {
            toast(
                "The creator cannot leave their own community. Delete or transfer it first.",
                "warning"
            );
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

        const {
            error
        } = await db
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

        $("activeChat")
            ?.classList.add(
                "hidden"
            );

        $("chatEmpty")
            ?.classList.remove(
                "hidden"
            );

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
        return crypto
            .randomUUID()
            .replace(/-/g, "")
            .slice(0, 16);
    }

    async function createInvite(
        type
    ) {
        if (!activeCommunity) {
            return;
        }

        if (
            !canManageCommunity()
        ) {
            toast(
                "You do not have permission.",
                "error"
            );
            return;
        }

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

        const {
            error
        } = await db
            .from(table)
            .insert(
                payload
            );

        if (error) {
            showError(
                error,
                "Could not create invite."
            );
            return;
        }

        try {
            await navigator.clipboard
                ?.writeText(code);
        } catch {}

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
            const {
                data,
                error
            } = await db.rpc(
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
        } catch (error) {
            console.warn(
                "Role check:",
                error
            );

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
                isAdminOrOwner()
                    ? ""
                    : "none";
        }

        const createUpdate =
            $("updateCreateSection");

        if (createUpdate) {
            createUpdate.style.display =
                isAdminOrOwner()
                    ? ""
                    : "none";
        }
    }

    async function ownerSearchVerified() {
        if (!isOwner()) {
            toast(
                "Owner permission required.",
                "error"
            );
            return;
        }

        const username =
            $("ownerVerifiedUsername")
                ?.value
                .trim()
                .toLowerCase();

        if (!username) {
            toast(
                "Enter a username.",
                "warning"
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
                    ${avatarHTML(
                        data,
                        "list-avatar"
                    )}

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
                            isVerifiedActive(
                                data
                            )
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
                        type="button"
                        id="ownerToggleVerifiedBtn"
                    >
                        ${
                            isVerifiedActive(
                                data
                            )
                                ? "Remove verification"
                                : "Give verification"
                        }
                    </button>
                </div>
            `;

            $("ownerToggleVerifiedBtn")
                ?.addEventListener(
                    "click",
                    () =>
                        toggleOwnerVerified(
                            data
                        )
                );
        }
    }

    async function toggleOwnerVerified(
        profile
    ) {
        if (!isOwner()) {
            toast(
                "Owner permission required.",
                "error"
            );
            return;
        }

        /*
         * Never allow owner verification controls
         * to remove the Owner's own protected role.
         */
        const active =
            isVerifiedActive(
                profile
            );

        const duration =
            Number(
                $("verifiedDuration")
                    ?.value || 30
            );

        const action =
            active
                ? "remove"
                : "give";

        const {
            error
        } = await db.rpc(
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
         * Existing RPC controls the verification.
         * Try expiry only when giving a temporary badge.
         */
        if (
            !active &&
            duration > 0
        ) {
            const until =
                new Date(
                    Date.now() +
                    duration *
                    24 *
                    60 *
                    60 *
                    1000
                ).toISOString();

            const {
                error:
                    expiryError
            } = await db
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
                    "Verification changed, but expiry could not be saved.",
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
            showError(
                error,
                "Could not load reports."
            );
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

        data.forEach(
            (report) => {
                const item =
                    document.createElement(
                        "div"
                    );

                item.className =
                    "owner-report-item";

                item.innerHTML = `
                    <strong>
                        ${escapeHTML(
                            report.reason ||
                            "Report"
                        )}
                    </strong>

                    <p>
                        ${escapeHTML(
                            report.description ||
                            ""
                        )}
                    </p>

                    <small>
                        ${formatDate(
                            report.created_at
                        )}
                    </small>
                `;

                list.appendChild(
                    item
                );
            }
        );
    }

    /* =========================================================
       OWNER ADMIN UI
       ========================================================= */

    async function ownerSearchAdmin() {
        if (!isOwner()) {
            toast(
                "Owner permission required.",
                "error"
            );
            return;
        }

        const username =
            $("ownerAdminUsername")
                ?.value
                .trim()
                .toLowerCase();

        if (!username) {
            toast(
                "Enter a username.",
                "warning"
            );
            return;
        }

        const {
            data,
            error
        } = await db
            .from("profiles")
            .select(
                "id,username,full_name,avatar_url,role,is_verified"
            )
            .eq(
                "username",
                username
            )
            .maybeSingle();

        const result =
            $("ownerAdminResult");

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

        if (
            data.id ===
            currentUser.id
        ) {
            if (result) {
                result.innerHTML = `
                    <div class="owner-user-result">
                        This account is the Owner.
                    </div>
                `;
            }

            return;
        }

        if (result) {
            result.innerHTML = `
                <div class="owner-user-result">
                    ${avatarHTML(
                        data,
                        "list-avatar"
                    )}

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

                        <span>
                            Current role:
                            ${escapeHTML(
                                data.role ||
                                "user"
                            )}
                        </span>
                    </div>

                    <div class="owner-admin-actions">
                        ${
                            data.role ===
                            "admin"
                                ? `
                            <button
                                type="button"
                                id="ownerRemoveAdminBtn"
                                data-user-id="${data.id}"
                            >
                                Remove Admin
                            </button>
                        `
                                : `
                            <button
                                type="button"
                                id="ownerMakeAdminBtn"
                                data-user-id="${data.id}"
                            >
                                Make Admin
                            </button>
                        `
                        }
                    </div>
                </div>
            `;

            $("ownerMakeAdminBtn")
                ?.addEventListener(
                    "click",
                    () =>
                        ownerSetAdmin(
                            data.id,
                            true
                        )
                );

            $("ownerRemoveAdminBtn")
                ?.addEventListener(
                    "click",
                    () =>
                        ownerSetAdmin(
                            data.id,
                            false
                        )
                );
        }
    }

    async function ownerSetAdmin(
        userId,
        makeAdmin
    ) {
        if (!isOwner()) {
            toast(
                "Owner permission required.",
                "error"
            );
            return;
        }

        if (
            userId ===
            currentUser.id
        ) {
            toast(
                "The Owner cannot change their own role.",
                "warning"
            );
            return;
        }

        /*
         * There is intentionally NO call to
         * owner_set_admin because that RPC does
         * not exist in the current database.
         *
         * We use a direct profiles update only if
         * the current RLS policy permits Owner updates.
         */
        const newRole =
            makeAdmin
                ? "admin"
                : "user";

        const {
            error
        } = await db
            .from("profiles")
            .update({
                role: newRole
            })
            .eq(
                "id",
                userId
            )
            .neq(
                "role",
                "owner"
            );

        if (error) {
            showError(
                error,
                "Admin role could not be changed. An Owner role-management RPC/policy is required."
            );
            return;
        }

        toast(
            makeAdmin
                ? "Admin added."
                : "Admin removed.",
            "success"
        );

        await ownerSearchAdmin();
        await loadOwnerAdminList();
    }

    async function loadOwnerAdminList() {
        const list =
            $("ownerAdminList");

        if (!list || !isOwner()) {
            return;
        }

        const {
            data,
            error
        } = await db
            .from("profiles")
            .select(
                "id,username,full_name,avatar_url,role,is_verified,verified_until"
            )
            .eq(
                "role",
                "admin"
            )
            .order(
                "username",
                {
                    ascending: true
                }
            );

        if (error) {
            showError(
                error,
                "Could not load admins."
            );
            return;
        }

        list.innerHTML = "";

        if (!data?.length) {
            list.innerHTML = `
                <div class="empty-state">
                    No admins.
                </div>
            `;
            return;
        }

        data.forEach(
            (admin) => {
                const item =
                    document.createElement(
                        "div"
                    );

                item.className =
                    "owner-admin-item";

                item.innerHTML = `
                    ${avatarHTML(
                        admin,
                        "list-avatar"
                    )}

                    <div class="list-user-info">
                        <div class="list-user-name">
                            ${escapeHTML(
                                admin.full_name ||
                                admin.username
                            )}
                        </div>

                        <div class="list-user-username">
                            @${escapeHTML(
                                admin.username
                            )}
                            · Admin
                        </div>
                    </div>

                    <button
                        type="button"
                        class="owner-remove-admin-inline"
                        data-user-id="${admin.id}"
                    >
                        Remove
                    </button>
                `;

                item.querySelector(
                    ".owner-remove-admin-inline"
                )?.addEventListener(
                    "click",
                    () =>
                        ownerSetAdmin(
                            admin.id,
                            false
                        )
                );

                list.appendChild(
                    item
                );
            }
        );
    }

    async function loadAdminPanelData(
        section
    ) {
        if (!isAdminOrOwner()) {
            toast(
                "Admin permission required.",
                "error"
            );
            return;
        }

        if (
            section === "reports"
        ) {
            await loadOwnerReports();
            return;
        }

        if (
            section === "users"
        ) {
            await loadAdminUsers();
            return;
        }

        if (
            section === "groups"
        ) {
            await loadGroups();
            return;
        }

        if (
            section === "channels"
        ) {
            await loadChannels();
            return;
        }
    }

    async function loadAdminUsers() {
        const {
            data,
            error
        } = await db
            .from("profiles")
            .select(`
                id,
                username,
                full_name,
                avatar_url,
                role,
                is_verified,
                account_blocked,
                messaging_blocked
            `)
            .order(
                "created_at",
                {
                    ascending: false
                }
            )
            .limit(100);

        if (error) {
            showError(
                error,
                "Could not load users."
            );
            return;
        }

        /*
         * The current admin HTML only has buttons,
         * so show the data through a toast rather
         * than creating an incompatible modal.
         */
        toast(
            `${data?.length || 0} users loaded.`,
            "success"
        );

        console.table(
            data || []
        );
    }

    /* =========================================================
       SETTINGS / THEME / LANGUAGE
    ========================================================= */

    function applyTheme(theme) {
        const root =
            document.documentElement;

        if (
            theme === "system"
        ) {
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

    function applyDensity(
        density
    ) {
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

    function applyLanguage(
        language
    ) {
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
            ) ||
            "dark";

        const density =
            localStorage.getItem(
                "megchatbox-density"
            ) ||
            "comfortable";

        const language =
            localStorage.getItem(
                "megchatbox-language"
            ) ||
            "en";

        applyTheme(theme);
        applyDensity(density);
        applyLanguage(language);

        document
            .querySelectorAll(
                ".appearance-option[data-theme]"
            )
            .forEach(
                (el) => {
                    el.classList.toggle(
                        "active",
                        el.dataset.theme ===
                            theme
                    );
                }
            );

        document
            .querySelectorAll(
                ".appearance-option[data-density]"
            )
            .forEach(
                (el) => {
                    el.classList.toggle(
                        "active",
                        el.dataset.density ===
                            density
                    );
                }
            );

        document
            .querySelectorAll(
                ".language-option[data-language]"
            )
            .forEach(
                (el) => {
                    el.classList.toggle(
                        "active",
                        el.dataset.language ===
                            language
                    );
                }
            );
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
            .forEach(
                (tab) => {
                    tab.addEventListener(
                        "click",
                        async () => {
                            document
                                .querySelectorAll(
                                    ".sidebar-tab"
                                )
                                .forEach(
                                    (x) =>
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

                            if (
                                name ===
                                "chats"
                            ) {
                                if ($("userList")) {
                                    $("userList")
                                        .style.display =
                                        "";
                                }

                                await renderContacts();
                            }

                            if (
                                name ===
                                "groups"
                            ) {
                                if ($("groupsList")) {
                                    $("groupsList")
                                        .style.display =
                                        "";
                                }

                                await loadGroups();
                            }

                            if (
                                name ===
                                "channels"
                            ) {
                                if ($("channelsList")) {
                                    $("channelsList")
                                        .style.display =
                                        "";
                                }

                                await loadChannels();
                            }
                        }
                    );
                }
            );
    }

    /* =========================================================
       LOGOUT / DELETE
    ========================================================= */

    async function logout() {
        try {
            await db.auth.signOut();
        } finally {
            location.href =
                "index.html";
        }
    }

    async function deleteAccount() {
        toast(
            "Secure account deletion is not configured yet.",
            "warning"
        );
    }

    /* =========================================================
       MODAL CLOSE SYSTEM
       ========================================================= */

    function setupModalCloseSystem() {
        /*
         * Event delegation fixes duplicate IDs and
         * dynamically created close buttons.
         */
        document.addEventListener(
            "click",
            (event) => {
                const closeButton =
                    event.target.closest(
                        "[data-close-modal]"
                    );

                if (
                    closeButton
                ) {
                    event.preventDefault();
                    event.stopPropagation();

                    const modalId =
                        closeButton.dataset
                            .closeModal;

                    if (modalId) {
                        closeModal(
                            modalId
                        );
                    }

                    return;
                }

                const modal =
                    event.target.closest(
                        ".modal"
                    );

                if (
                    modal &&
                    event.target ===
                        modal
                ) {
                    closeModal(
                        modal.id
                    );
                }
            }
        );

        document.addEventListener(
            "keydown",
            (event) => {
                if (
                    event.key ===
                    "Escape"
                ) {
                    closeAllModals();
                }
            }
        );
    }

    /* =========================================================
       EVENTS
    ========================================================= */

    function setupEvents() {
        $("settingsBtn")
            ?.addEventListener(
                "click",
                () =>
                    openModal(
                        "settingsModal"
                    )
            );

        $("profileSettingsBtn")
            ?.addEventListener(
                "click",
                () => {
                    if (
                        currentProfile
                    ) {
                        if (
                            $("profileFullName")
                        ) {
                            $("profileFullName")
                                .value =
                                currentProfile.full_name ||
                                "";
                        }

                        if (
                            $("profileUsername")
                        ) {
                            $("profileUsername")
                                .value =
                                currentProfile.username ||
                                "";
                        }

                        if (
                            $("profileBio")
                        ) {
                            $("profileBio")
                                .value =
                                currentProfile.bio ||
                                "";
                        }
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

        /* -----------------------------------------
           GLOBAL SEARCH
        ----------------------------------------- */

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
                                    event.target
                                        .value
                                ),
                            300
                        );
                }
            );

        $("clearSearchBtn")
            ?.addEventListener(
                "click",
                async () => {
                    if (
                        $("searchInput")
                    ) {
                        $("searchInput")
                            .value = "";
                    }

                    await refreshSidebar();
                }
            );

        /* -----------------------------------------
           MESSAGE FORM
        ----------------------------------------- */

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
                () =>
                    $("imageInput")
                        ?.click()
            );

        $("imageInput")
            ?.addEventListener(
                "change",
                async (event) => {
                    const file =
                        event.target
                            .files?.[0];

                    if (file) {
                        await sendImage(
                            file
                        );
                    }

                    event.target.value =
                        "";
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

                    if (!emoji)
                        return;

                    const input =
                        $("messageInput");

                    if (!input)
                        return;

                    input.value +=
                        emoji.dataset
                            .emoji;

                    input.focus();
                }
            );

        /* -----------------------------------------
           CONTACT ACTIONS
        ----------------------------------------- */

        $("addContactBtn")
            ?.addEventListener(
                "click",
                () => {
                    if (
                        activeChatUser
                    ) {
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
                    if (
                        !activeChatUser
                    ) {
                        return;
                    }

                    const relationship =
                        await getRelationship(
                            activeChatUser.id
                        );

                    if (
                        relationship
                    ) {
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
                    if (
                        !activeChatUser
                    ) {
                        return;
                    }

                    const relationship =
                        await getRelationship(
                            activeChatUser.id
                        );

                    if (
                        relationship
                    ) {
                        await declineContactRequest(
                            relationship.id
                        );
                    }
                }
            );

        /*
         * IMPORTANT:
         * Contact request buttons are created dynamically.
         * Event delegation makes Accept/Decline work.
         */
        document.addEventListener(
            "click",
            async (event) => {
                const accept =
                    event.target.closest(
                        ".request-accept"
                    );

                if (accept) {
                    event.preventDefault();
                    event.stopPropagation();

                    await acceptContactRequest(
                        accept.dataset
                            .requestId
                    );

                    return;
                }

                const decline =
                    event.target.closest(
                        ".request-decline"
                    );

                if (decline) {
                    event.preventDefault();
                    event.stopPropagation();

                    await declineContactRequest(
                        decline.dataset
                            .requestId
                    );
                }
            }
        );

        /* -----------------------------------------
           CHAT HEADER
        ----------------------------------------- */

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
                    /*
                     * If a current chat exists, open
                     * a small action menu if available.
                     * Otherwise open profile/community info.
                     */
                    if (
                        activeChatUser
                    ) {
                        openUserProfile(
                            activeChatUser
                        );
                        return;
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

        /*
         * Search from the chat's 3-dot area.
         * Long-pressing the button is not required.
         */
        $("chatMoreBtn")
            ?.addEventListener(
                "contextmenu",
                (event) => {
                    event.preventDefault();

                    if (
                        activeChatUser ||
                        activeCommunity
                    ) {
                        showChatSearch();
                    }
                }
            );

        /* -----------------------------------------
           USER PROFILE
        ----------------------------------------- */

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

                    if (
                        $("nicknameInput")
                    ) {
                        $("nicknameInput")
                            .value = "";
                    }

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

        /* -----------------------------------------
           GROUP / CHANNEL CREATION
        ----------------------------------------- */

        $("createGroupBtn")
            ?.addEventListener(
                "click",
                () =>
                    openModal(
                        "createGroupModal"
                    )
            );

        $("createChannelBtn")
            ?.addEventListener(
                "click",
                () =>
                    openModal(
                        "createChannelModal"
                    )
            );

        $("joinGroupOpenBtn")
            ?.addEventListener(
                "click",
                () =>
                    openModal(
                        "joinGroupModal"
                    )
            );

        $("joinChannelOpenBtn")
            ?.addEventListener(
                "click",
                () =>
                    openModal(
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

        /* -----------------------------------------
           COMMUNITY INFO
        ----------------------------------------- */

        $("groupInviteBtn")
            ?.addEventListener(
                "click",
                () =>
                    createInvite(
                        "group"
                    )
            );

        $("channelInviteBtn")
            ?.addEventListener(
                "click",
                () =>
                    createInvite(
                        "channel"
                    )
            );

        $("groupMembersBtn")
            ?.addEventListener(
                "click",
                () =>
                    loadMembers(
                        "group"
                    )
            );

        $("channelMembersBtn")
            ?.addEventListener(
                "click",
                () =>
                    loadMembers(
                        "channel"
                    )
            );

        $("leaveGroupBtn")
            ?.addEventListener(
                "click",
                () =>
                    leaveCommunity(
                        "group"
                    )
            );

        $("leaveChannelBtn")
            ?.addEventListener(
                "click",
                () =>
                    leaveCommunity(
                        "channel"
                    )
            );

        /* -----------------------------------------
           UPDATES
        ----------------------------------------- */

        $("publishUpdateBtn")
            ?.addEventListener(
                "click",
                publishUpdate
            );

        /* -----------------------------------------
           OWNER
        ----------------------------------------- */

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
                ownerSearchAdmin
            );

        $("ownerPanelButton")
            ?.addEventListener(
                "click",
                async () => {
                    if (
                        !isOwner()
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

                    await loadOwnerAdminList();

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
                        !isAdminOrOwner()
                    ) {
                        toast(
                            "Admin permission required.",
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

        $("openAdminReportsBtn")
            ?.addEventListener(
                "click",
                async () => {
                    await loadAdminPanelData(
                        "reports"
                    );
                }
            );

        $("openAdminUsersBtn")
            ?.addEventListener(
                "click",
                async () => {
                    await loadAdminPanelData(
                        "users"
                    );
                }
            );

        $("openAdminGroupsBtn")
            ?.addEventListener(
                "click",
                async () => {
                    await loadAdminPanelData(
                        "groups"
                    );
                }
            );

        $("openAdminChannelsBtn")
            ?.addEventListener(
                "click",
                async () => {
                    await loadAdminPanelData(
                        "channels"
                    );
                }
            );

        /*
         * OWNER TABS
         */
        document
            .querySelectorAll(
                "[data-owner-tab]"
            )
            .forEach(
                (tab) => {
                    tab.addEventListener(
                        "click",
                        async () => {
                            if (
                                !isOwner()
                            ) {
                                return;
                            }

                            document
                                .querySelectorAll(
                                    "[data-owner-tab]"
                                )
                                .forEach(
                                    (x) =>
                                        x.classList.remove(
                                            "active"
                                        )
                                );

                            tab.classList.add(
                                "active"
                            );

                            const name =
                                tab.dataset
                                    .ownerTab;

                            document
                                .querySelectorAll(
                                    "[id$='Panel']"
                                )
                                .forEach(
                                    (panel) => {
                                        if (
                                            panel.id.startsWith(
                                                "owner"
                                            )
                                        ) {
                                            panel.style.display =
                                                "none";
                                        }
                                    }
                                );

                            if (
                                name ===
                                "verified"
                            ) {
                                $("ownerVerifiedPanel")
                                    ?.style
                                    .setProperty(
                                        "display",
                                        "",
                                        ""
                                    );
                            }

                            if (
                                name ===
                                "moderation"
                            ) {
                                $("ownerModerationPanel")
                                    ?.style
                                    .setProperty(
                                        "display",
                                        "",
                                        ""
                                    );
                            }

                            if (
                                name ===
                                "admins"
                            ) {
                                $("ownerAdminsPanel")
                                    ?.style
                                    .setProperty(
                                        "display",
                                        "",
                                        ""
                                    );

                                await loadOwnerAdminList();
                            }

                            if (
                                name ===
                                "reports"
                            ) {
                                $("ownerReportsPanel")
                                    ?.style
                                    .setProperty(
                                        "display",
                                        "",
                                        ""
                                    );

                                await loadOwnerReports();
                            }
                        }
                    );
                }
            );

        /* -----------------------------------------
           APPEARANCE
        ----------------------------------------- */

        document
            .querySelectorAll(
                ".appearance-option[data-theme]"
            )
            .forEach(
                (button) => {
                    button.addEventListener(
                        "click",
                        () => {
                            applyTheme(
                                button.dataset
                                    .theme
                            );

                            loadAppearance();
                        }
                    );
                }
            );

        document
            .querySelectorAll(
                ".appearance-option[data-density]"
            )
            .forEach(
                (button) => {
                    button.addEventListener(
                        "click",
                        () => {
                            applyDensity(
                                button.dataset
                                    .density
                            );

                            loadAppearance();
                        }
                    );
                }
            );

        document
            .querySelectorAll(
                ".language-option[data-language]"
            )
            .forEach(
                (button) => {
                    button.addEventListener(
                        "click",
                        () => {
                            applyLanguage(
                                button.dataset
                                    .language
                            );

                            loadAppearance();
                        }
                    );
                }
            );

        /* -----------------------------------------
           GLOBAL CLICK
        ----------------------------------------- */

        document.addEventListener(
            "click",
            (event) => {
                const profileMenu =
                    $("userProfileMenu");

                if (
                    profileMenu &&
                    !event.target.closest(
                        "#userProfileMenu"
                    ) &&
                    !event.target.closest(
                        "#userProfileMenuBtn"
                    )
                ) {
                    profileMenu.classList.remove(
                        "open"
                    );
                }

                /*
                 * Don't immediately close a message
                 * action menu when clicking inside it.
                 */
                if (
                    !event.target.closest(
                        ".message-wrapper"
                    )
                ) {
                    document
                        .querySelectorAll(
                            ".message-wrapper.swiped"
                        )
                        .forEach(
                            resetMessageSwipe
                        );
                }
            }
        );

        setupModalCloseSystem();

        setupTabs();
    }

    /* =========================================================
       MODERATION SEARCH
    ========================================================= */

    async function ownerSearchModeration() {
        if (!isOwner()) {
            toast(
                "Owner permission required.",
                "error"
            );
            return;
        }

        const username =
            $("ownerModerationUsername")
                ?.value
                .trim()
                .toLowerCase();

        const result =
            $("ownerModerationResult");

        if (!username) {
            toast(
                "Enter a username.",
                "warning"
            );
            return;
        }

        const {
            data,
            error
        } = await db
            .from("profiles")
            .select(`
                id,
                username,
                full_name,
                avatar_url,
                role,
                account_blocked,
                account_blocked_until,
                messaging_blocked,
                messaging_blocked_until
            `)
            .eq(
                "username",
                username
            )
            .maybeSingle();

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

        if (
            data.role ===
            "owner"
        ) {
            if (result) {
                result.innerHTML = `
                    <div class="owner-user-result">
                        Owner is protected from moderation actions.
                    </div>
                `;
            }

            return;
        }

        if (result) {
            result.innerHTML = `
                <div class="owner-user-result">
                    ${avatarHTML(
                        data,
                        "list-avatar"
                    )}

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

                        <span>
                            Account:
                            ${
                                data.account_blocked
                                    ? "Blocked"
                                    : "Active"
                            }
                        </span>

                        <span>
                            Messaging:
                            ${
                                data.messaging_blocked
                                    ? "Blocked"
                                    : "Allowed"
                            }
                        </span>
                    </div>

                    <div class="owner-admin-actions">
                        <button
                            type="button"
                            id="ownerToggleAccountBlockBtn"
                        >
                            ${
                                data.account_blocked
                                    ? "Unblock Account"
                                    : "Block Account"
                            }
                        </button>

                        <button
                            type="button"
                            id="ownerToggleMessagingBlockBtn"
                        >
                            ${
                                data.messaging_blocked
                                    ? "Allow Messaging"
                                    : "Block Messaging"
                            }
                        </button>
                    </div>
                </div>
            `;

            /*
             * These direct updates depend on Owner RLS.
             * If RLS blocks them, Supabase will return
             * the actual policy error instead of silently
             * pretending the action worked.
             */
            $("ownerToggleAccountBlockBtn")
                ?.addEventListener(
                    "click",
                    () =>
                        ownerToggleAccountBlock(
                            data
                        )
                );

            $("ownerToggleMessagingBlockBtn")
                ?.addEventListener(
                    "click",
                    () =>
                        ownerToggleMessagingBlock(
                            data
                        )
                );
        }
    }

    async function ownerToggleAccountBlock(
        profile
    ) {
        if (!isOwner()) {
            return;
        }

        if (
            profile.role ===
            "owner"
        ) {
            toast(
                "Owner is protected.",
                "error"
            );
            return;
        }

        const blocked =
            !profile.account_blocked;

        const {
            error
        } = await db
            .from("profiles")
            .update({
                account_blocked:
                    blocked,
                account_blocked_until:
                    blocked
                        ? null
                        : null
            })
            .eq(
                "id",
                profile.id
            )
            .neq(
                "role",
                "owner"
            );

        if (error) {
            showError(
                error,
                "Account moderation requires an Owner RLS policy or RPC."
            );
            return;
        }

        toast(
            blocked
                ? "Account blocked."
                : "Account unblocked.",
            "success"
        );

        await ownerSearchModeration();
    }

    async function ownerToggleMessagingBlock(
        profile
    ) {
        if (!isOwner()) {
            return;
        }

        if (
            profile.role ===
            "owner"
        ) {
            toast(
                "Owner is protected.",
                "error"
            );
            return;
        }

        const blocked =
            !profile.messaging_blocked;

        const {
            error
        } = await db
            .from("profiles")
            .update({
                messaging_blocked:
                    blocked,
                messaging_blocked_until:
                    null
            })
            .eq(
                "id",
                profile.id
            )
            .neq(
                "role",
                "owner"
            );

        if (error) {
            showError(
                error,
                "Messaging moderation requires an Owner RLS policy or RPC."
            );
            return;
        }

        toast(
            blocked
                ? "Messaging blocked."
                : "Messaging allowed.",
            "success"
        );

        await ownerSearchModeration();
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
                `megchatbox-dashboard-${currentUser.id}`
            );

        realtimeChannel
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table:
                        "contact_requests"
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
                    table:
                        "group_messages"
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
                    table:
                        "channel_messages"
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
            .subscribe(
                (status) => {
                    console.log(
                        "Realtime:",
                        status
                    );
                }
            );
    }

    /* =========================================================
       HEARTBEAT
    ========================================================= */

    async function updateLastSeen() {
        if (!currentUser) return;

        const {
            error
        } = await db
            .from("profiles")
            .update({
                last_seen:
                    new Date().toISOString()
            })
            .eq(
                "id",
                currentUser.id
            );

        if (error) {
            console.warn(
                "Last seen update:",
                error
            );
        }
    }

    /* =========================================================
       INITIALIZATION
    ========================================================= */

    async function init() {
        const authenticated =
            await initAuth();

        if (!authenticated) {
            return;
        }

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
            "MegChatBox Dashboard V4 initialized."
        );
    }

    init();

})();
