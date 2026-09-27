(() => {
    "use strict";

    /* =========================================================
       MEGCHATBOX - DASHBOARD
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

    const state = {
        user: null,
        profile: null,

        currentChat: null,
        currentChatType: null,
        currentOtherUser: null,

        currentGroup: null,
        currentChannel: null,

        currentProfileUser: null,

        contactRequest: null,

        groups: [],
        channels: [],
        contacts: [],
        requests: [],

        editingMessage: null,

        theme: localStorage.getItem("megchatbox_theme") || "dark",
        density:
            localStorage.getItem("megchatbox_density") ||
            "comfortable",

        language:
            localStorage.getItem("megchatbox_language") ||
            "en",

        realtimeChannels: [],

        searchTimer: null
    };


    /* =========================================================
       HELPERS
       ========================================================= */

    const $ = (selector) => document.querySelector(selector);

    const $$ = (selector) =>
        Array.from(document.querySelectorAll(selector));


    function escapeHTML(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }


    function normalizeUsername(value) {
        return String(value || "")
            .trim()
            .replace(/^@/, "")
            .toLowerCase();
    }


    function validUsername(username) {
        return /^[a-z0-9_]{3,32}$/.test(username);
    }


    function showToast(message, type = "info") {
        const toast = $("#toast");
        const text = $("#toastMessage");

        if (!toast || !text) return;

        text.textContent = message;

        toast.dataset.type = type;
        toast.style.display = "flex";

        clearTimeout(showToast.timer);

        showToast.timer = setTimeout(() => {
            toast.style.display = "none";
        }, 3000);
    }


    function openModal(id) {
        const modal = document.getElementById(id);

        if (!modal) return;

        modal.classList.add("open");
        modal.style.display = "flex";
    }


    function closeModal(id) {
        const modal = document.getElementById(id);

        if (!modal) return;

        modal.classList.remove("open");
        modal.style.display = "none";
    }


    function closeAllModals() {
        $$(".modal").forEach(modal => {
            modal.classList.remove("open");
            modal.style.display = "none";
        });
    }


    function avatarInitial(name) {
        const text = String(name || "?").trim();

        return text
            ? text.charAt(0).toUpperCase()
            : "?";
    }


    function isVerified(profile) {
        if (!profile) return false;

        if (profile.is_verified !== true) {
            return false;
        }

        if (!profile.verified_until) {
            return true;
        }

        return new Date(profile.verified_until).getTime() > Date.now();
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

        return d.toLocaleDateString();
    }


    function formatRemaining(until) {
        if (!until) return "Permanent";

        const diff =
            new Date(until).getTime() - Date.now();

        if (diff <= 0) return "Expired";

        const days = Math.floor(
            diff / (1000 * 60 * 60 * 24)
        );

        if (days > 0) {
            return `${days} day${days === 1 ? "" : "s"} remaining`;
        }

        const hours = Math.floor(
            diff / (1000 * 60 * 60)
        );

        return `${hours} hour${hours === 1 ? "" : "s"} remaining`;
    }


    /* =========================================================
       AVATAR HELPERS
       ========================================================= */

    function setAvatar(img, initial, url, name) {
        if (!img || !initial) return;

        if (url) {
            img.src = url;
            img.style.display = "block";
            initial.style.display = "none";

            img.onerror = () => {
                img.style.display = "none";
                initial.style.display = "inline-flex";
                initial.textContent = avatarInitial(name);
            };

        } else {
            img.removeAttribute("src");
            img.style.display = "none";

            initial.style.display = "inline-flex";
            initial.textContent = avatarInitial(name);
        }
    }


    function setCommunityAvatar(element, url, name, icon) {
        if (!element) return;

        if (url) {
            element.innerHTML = `
                <img
                    src="${escapeHTML(url)}"
                    alt=""
                >
            `;
        } else {
            element.innerHTML = `
                <i class="${escapeHTML(icon)}"></i>
            `;
        }
    }


    /* =========================================================
       SESSION
       ========================================================= */

    async function getCurrentUser() {
        const {
            data,
            error
        } = await db.auth.getUser();

        if (error) {
            console.error(error);
            return null;
        }

        return data?.user || null;
    }


    async function loadMyProfile() {
        if (!state.user) return null;

        const {
            data,
            error
        } = await db
            .from("profiles")
            .select("*")
            .eq("id", state.user.id)
            .maybeSingle();

        if (error) {
            console.error(error);
            showToast("Could not load your profile.", "error");
            return null;
        }

        state.profile = data;

        return data;
    }


    /* =========================================================
       MY PROFILE UI
       ========================================================= */

    function renderMyProfile() {
        const profile = state.profile;

        if (!profile) return;

        const myName = $("#myName");
        const myUsername = $("#myUsername");
        const myVerified = $("#myVerified");

        const myAvatar = $("#myAvatar");
        const myAvatarInitial = $("#myAvatarInitial");

        if (myName) {
            myName.textContent =
                profile.full_name ||
                profile.username ||
                "User";
        }

        if (myUsername) {
            myUsername.textContent =
                "@" + (profile.username || "username");
        }

        setAvatar(
            myAvatar,
            myAvatarInitial,
            profile.avatar_url,
            profile.full_name || profile.username
        );

        if (myVerified) {
            if (isVerified(profile)) {
                myVerified.style.display = "inline-flex";
                myVerified.title =
                    profile.verified_until
                        ? `Verified • ${formatRemaining(profile.verified_until)}`
                        : "Verified";
            } else {
                myVerified.style.display = "none";
            }
        }
    }


    /* =========================================================
       PROFILE SETTINGS
       ========================================================= */

    function fillProfileForm() {
        const p = state.profile;

        if (!p) return;

        const fullName = $("#profileFullName");
        const username = $("#profileUsername");
        const bio = $("#profileBio");

        if (fullName) {
            fullName.value = p.full_name || "";
        }

        if (username) {
            username.value = p.username || "";
        }

        if (bio) {
            bio.value = p.bio || "";
        }

        setAvatar(
            $("#profileAvatarImage"),
            $("#profileAvatarInitial"),
            p.avatar_url,
            p.full_name || p.username
        );
    }


    async function saveProfile(event) {
        event?.preventDefault();

        if (!state.user) return;

        const fullName =
            $("#profileFullName")?.value.trim() || "";

        const username =
            normalizeUsername(
                $("#profileUsername")?.value
            );

        const bio =
            $("#profileBio")?.value.trim() || "";

        if (!fullName) {
            showToast("Full name is required.", "error");
            return;
        }

        if (!validUsername(username)) {
            showToast(
                "Username must contain 3-32 lowercase letters, numbers or underscores.",
                "error"
            );
            return;
        }

        /* ---------------------------------------------
           USERNAME UNIQUENESS
        --------------------------------------------- */

        const {
            data: existing,
            error: checkError
        } = await db
            .from("profiles")
            .select("id")
            .eq("username", username)
            .neq("id", state.user.id)
            .maybeSingle();

        if (checkError) {
            console.error(checkError);
            showToast(
                "Could not check username.",
                "error"
            );
            return;
        }

        if (existing) {
            showToast(
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
                bio
            })
            .eq("id", state.user.id)
            .select()
            .single();

        if (error) {
            console.error(error);

            if (error.code === "23505") {
                showToast(
                    "This username is already taken.",
                    "error"
                );
            } else {
                showToast(
                    "Could not save profile.",
                    "error"
                );
            }

            return;
        }

        state.profile = data;

        renderMyProfile();

        closeModal("profileModal");

        showToast("Profile updated.");
    }


    /* =========================================================
       PROFILE AVATAR
       ========================================================= */

    async function uploadFile(bucket, file, path) {
        const {
            error
        } = await db.storage
            .from(bucket)
            .upload(path, file, {
                upsert: true,
                contentType: file.type
            });

        if (error) {
            throw error;
        }

        const {
            data
        } = db.storage
            .from(bucket)
            .getPublicUrl(path);

        return data.publicUrl;
    }


    async function changeProfileAvatar(event) {
        const file = event.target.files?.[0];

        if (!file || !state.user) return;

        if (!file.type.startsWith("image/")) {
            showToast("Please select an image.", "error");
            return;
        }

        if (file.size > 5 * 1024 * 1024) {
            showToast(
                "Image must be smaller than 5 MB.",
                "error"
            );
            return;
        }

        try {
            showToast("Uploading avatar...");

            const extension =
                file.name.split(".").pop() || "jpg";

            const path =
                `${state.user.id}/avatar.${extension}`;

            const url = await uploadFile(
                "avatars",
                file,
                path
            );

            const {
                data,
                error
            } = await db
                .from("profiles")
                .update({
                    avatar_url: url
                })
                .eq("id", state.user.id)
                .select()
                .single();

            if (error) throw error;

            state.profile = data;

            renderMyProfile();
            fillProfileForm();

            showToast("Avatar updated.");

        } catch (error) {
            console.error(error);
            showToast(
                "Could not upload avatar.",
                "error"
            );
        }
    }


    /* =========================================================
       PRIVACY
       ========================================================= */

    function fillPrivacySettings() {
        const p = state.profile;

        if (!p) return;

        const online = $("#showOnlineToggle");
        const lastSeen = $("#showLastSeenToggle");

        if (online) {
            online.checked =
                p.show_online !== false;
        }

        if (lastSeen) {
            lastSeen.checked =
                p.show_last_seen !== false;
        }
    }


    async function savePrivacy() {
        if (!state.user) return;

        const showOnline =
            $("#showOnlineToggle")?.checked ?? true;

        const showLastSeen =
            $("#showLastSeenToggle")?.checked ?? true;

        const {
            data,
            error
        } = await db
            .from("profiles")
            .update({
                show_online: showOnline,
                show_last_seen: showLastSeen
            })
            .eq("id", state.user.id)
            .select()
            .single();

        if (error) {
            console.error(error);
            showToast(
                "Could not save privacy settings.",
                "error"
            );
            return;
        }

        state.profile = data;

        showToast("Privacy settings saved.");

        closeModal("privacyModal");
    }


    /* =========================================================
       CONTACTS
       ========================================================= */

    async function loadContacts() {
        if (!state.user) return;

        const {
            data: requests,
            error
        } = await db
            .from("contact_requests")
            .select("*")
            .or(
                `sender_id.eq.${state.user.id},receiver_id.eq.${state.user.id}`
            )
            .eq("status", "accepted");

        if (error) {
            console.error(error);
            return;
        }

        const ids = [];

        for (const request of requests || []) {
            const id =
                request.sender_id === state.user.id
                    ? request.receiver_id
                    : request.sender_id;

            if (id) ids.push(id);
        }

        if (!ids.length) {
            state.contacts = [];
            renderContacts([]);
            return;
        }

        const {
            data: profiles,
            error: profileError
        } = await db
            .from("profiles")
            .select("*")
            .in("id", ids);

        if (profileError) {
            console.error(profileError);
            return;
        }

        state.contacts = profiles || [];

        renderContacts(state.contacts);
    }


    function renderContacts(contacts) {
        const list = $("#userList");

        if (!list) return;

        list.innerHTML = "";

        if (!contacts.length) {
            list.innerHTML = `
                <div class="empty-list">
                    No contacts yet.
                </div>
            `;

            updateCount("#contactCount", 0);
            return;
        }

        contacts.forEach(profile => {
            list.appendChild(
                createContactElement(profile)
            );
        });

        updateCount(
            "#contactCount",
            contacts.length
        );
    }


    function createContactElement(profile) {
        const button = document.createElement("button");

        button.type = "button";
        button.className = "chat-item";

        button.innerHTML = `
            <div class="chat-avatar">

                ${
                    profile.avatar_url
                        ? `
                            <img
                                src="${escapeHTML(profile.avatar_url)}"
                                alt=""
                            >
                        `
                        : `
                            <span>
                                ${escapeHTML(
                                    avatarInitial(
                                        profile.full_name ||
                                        profile.username
                                    )
                                )}
                            </span>
                        `
                }

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
                        isVerified(profile)
                            ? `
                                <span class="verified-badge">
                                    ✓
                                </span>
                            `
                            : ""
                    }

                </div>

                <span>
                    @${escapeHTML(profile.username)}
                </span>

            </div>
        `;

        button.addEventListener(
            "click",
            () => openDirectChat(profile)
        );

        return button;
    }


    /* =========================================================
       CONTACT REQUESTS
       ========================================================= */

    async function findContactRequest(otherId) {
        if (!state.user || !otherId) return null;

        const {
            data,
            error
        } = await db
            .from("contact_requests")
            .select("*")
            .or(
                `and(sender_id.eq.${state.user.id},receiver_id.eq.${otherId}),and(sender_id.eq.${otherId},receiver_id.eq.${state.user.id})`
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

        return data;
    }


    async function sendContactRequest() {
        if (
            !state.user ||
            !state.currentOtherUser
        ) return;

        const otherId =
            state.currentOtherUser.id;

        if (otherId === state.user.id) {
            showToast(
                "You cannot add yourself.",
                "error"
            );
            return;
        }

        const existing =
            await findContactRequest(otherId);

        if (existing?.status === "accepted") {
            showToast("Already in contacts.");
            return;
        }

        if (
            existing?.status === "pending" &&
            existing.sender_id === state.user.id
        ) {
            showToast("Request already sent.");
            return;
        }

        if (
            existing?.status === "pending" &&
            existing.receiver_id === state.user.id
        ) {
            showToast(
                "This user already sent you a request."
            );
            return;
        }

        const {
            error
        } = await db
            .from("contact_requests")
            .insert({
                sender_id: state.user.id,
                receiver_id: otherId,
                status: "pending"
            });

        if (error) {
            console.error(error);

            if (error.code === "23505") {
                showToast(
                    "Contact request already exists."
                );
            } else {
                showToast(
                    "Could not send request.",
                    "error"
                );
            }

            return;
        }

        showToast("Contact request sent.");

        await updateContactActions();
    }


    async function acceptContactRequest() {
        const request = state.contactRequest;

        if (!request) return;

        const {
            error
        } = await db
            .from("contact_requests")
            .update({
                status: "accepted"
            })
            .eq("id", request.id)
            .eq("receiver_id", state.user.id);

        if (error) {
            console.error(error);
            showToast(
                "Could not accept request.",
                "error"
            );
            return;
        }

        showToast("Contact request accepted.");

        await loadContacts();

        await updateContactActions();
    }


    async function declineContactRequest() {
        const request = state.contactRequest;

        if (!request) return;

        const {
            error
        } = await db
            .from("contact_requests")
            .update({
                status: "declined"
            })
            .eq("id", request.id)
            .eq("receiver_id", state.user.id);

        if (error) {
            console.error(error);
            showToast(
                "Could not decline request.",
                "error"
            );
            return;
        }

        showToast("Request declined.");

        await updateContactActions();
    }


    async function updateContactActions() {
        const box = $("#contactActions");

        const add = $("#addContactBtn");
        const accept = $("#acceptContactBtn");
        const decline = $("#declineContactBtn");

        if (!box) return;

        if (
            !state.currentOtherUser ||
            state.currentChatType !== "direct"
        ) {
            box.style.display = "none";
            return;
        }

        const request =
            await findContactRequest(
                state.currentOtherUser.id
            );

        state.contactRequest = request;

        box.style.display = "flex";

        add.style.display = "none";
        accept.style.display = "none";
        decline.style.display = "none";

        if (!request) {
            add.style.display = "inline-flex";
            return;
        }

        if (request.status === "accepted") {
            box.style.display = "none";
            return;
        }

        if (
            request.status === "pending" &&
            request.receiver_id === state.user.id
        ) {
            accept.style.display = "inline-flex";
            decline.style.display = "inline-flex";
            return;
        }

        if (
            request.status === "pending" &&
            request.sender_id === state.user.id
        ) {
            add.style.display = "inline-flex";
            add.disabled = true;
            add.innerHTML = `
                <i class="fa-solid fa-clock"></i>
                Request Sent
            `;
            return;
        }

        add.style.display = "inline-flex";
        add.disabled = false;
        add.innerHTML = `
            <i class="fa-solid fa-user-plus"></i>
            Add Contact
        `;
    }


    async function areContacts(userA, userB) {
        const {
            data,
            error
        } = await db
            .from("contact_requests")
            .select("id")
            .or(
                `and(sender_id.eq.${userA},receiver_id.eq.${userB}),and(sender_id.eq.${userB},receiver_id.eq.${userA})`
            )
            .eq("status", "accepted")
            .maybeSingle();

        if (error) {
            console.error(error);
            return false;
        }

        return !!data;
    }


    /* =========================================================
       DIRECT CHAT
       ========================================================= */

    async function openDirectChat(profile) {
        if (!profile || !state.user) return;

        state.currentChatType = "direct";
        state.currentOtherUser = profile;
        state.currentChat = profile.id;

        state.currentGroup = null;
        state.currentChannel = null;

        showActiveChat();

        const name =
            profile.full_name ||
            profile.username ||
            "User";

        $("#chatName").textContent = name;

        $("#chatStatus").textContent =
            profile.show_online === false
                ? "offline"
                : (
                    profile.last_seen
                        ? `last seen ${formatDate(profile.last_seen)}`
                        : "offline"
                );

        setAvatar(
            $("#chatAvatar"),
            $("#chatAvatarInitial"),
            profile.avatar_url,
            name
        );

        const verified =
            $("#chatVerified");

        if (verified) {
            verified.style.display =
                isVerified(profile)
                    ? "inline-flex"
                    : "none";
        }

        const contacts =
            await areContacts(
                state.user.id,
                profile.id
            );

        if (contacts) {
            $("#contactActions").style.display =
                "none";

            enableComposer(true);

            await loadDirectMessages();
        } else {
            $("#messages").innerHTML = `
                <div class="chat-access-message">
                    <i class="fa-solid fa-user-lock"></i>
                    <p>
                        You can chat after this contact request is accepted.
                    </p>
                </div>
            `;

            enableComposer(false);

            await updateContactActions();
        }

        if (window.innerWidth <= 800) {
            $(".sidebar")?.classList.add("mobile-hidden");
            $(".chat-area")?.classList.add("mobile-active");
        }
    }


    async function loadDirectMessages() {
        if (
            !state.user ||
            !state.currentOtherUser
        ) return;

        const {
            data,
            error
        } = await db
            .from("messages")
            .select("*")
            .or(
                `and(sender_id.eq.${state.user.id},receiver_id.eq.${state.currentOtherUser.id}),and(sender_id.eq.${state.currentOtherUser.id},receiver_id.eq.${state.user.id})`
            )
            .order("created_at", {
                ascending: true
            });

        if (error) {
            console.error(error);

            showToast(
                "Could not load messages.",
                "error"
            );

            return;
        }

        renderMessages(data || []);
    }


    /* =========================================================
       MESSAGE RENDERING
       ========================================================= */

    function renderMessages(messages) {
        const container = $("#messages");

        if (!container) return;

        container.innerHTML = "";

        messages.forEach(message => {
            container.appendChild(
                createMessageElement(message)
            );
        });

        initializeMessageSwipes();

        scrollMessagesToBottom();
    }


    function createMessageElement(message) {
        const row = document.createElement("div");

        row.className =
            "message-row " +
            (
                message.sender_id === state.user.id
                    ? "mine"
                    : "theirs"
            );

        const wrapper =
            document.createElement("div");

        wrapper.className =
            "message-wrapper";

        wrapper.dataset.messageId =
            message.id;

        const actions =
            document.createElement("div");

        actions.className =
            "message-actions";

        const bubble =
            document.createElement("div");

        bubble.className =
            "message-bubble";


        /* ---------------------------------------------
           MESSAGE ACTIONS
        --------------------------------------------- */

        const saveButton =
            document.createElement("button");

        saveButton.type = "button";
        saveButton.className =
            "message-action";
        saveButton.dataset.action = "save";
        saveButton.innerHTML =
            `<i class="fa-solid fa-bookmark"></i>`;

        saveButton.title = "Save";


        const editButton =
            document.createElement("button");

        editButton.type = "button";
        editButton.className =
            "message-action";
        editButton.dataset.action = "edit";
        editButton.innerHTML =
            `<i class="fa-solid fa-pen"></i>`;

        editButton.title = "Edit";


        const deleteButton =
            document.createElement("button");

        deleteButton.type = "button";
        deleteButton.className =
            "message-action";
        deleteButton.dataset.action = "delete";
        deleteButton.innerHTML =
            `<i class="fa-solid fa-trash"></i>`;

        deleteButton.title = "Delete";


        actions.appendChild(saveButton);

        if (
            message.sender_id ===
            state.user.id
        ) {
            actions.appendChild(editButton);
            actions.appendChild(deleteButton);
        }


        /* ---------------------------------------------
           CONTENT
        --------------------------------------------- */

        if (message.deleted_at) {
            bubble.innerHTML = `
                <span class="deleted-message">
                    This message was deleted
                </span>
            `;

        } else if (
            message.message_type === "image" &&
            message.image_url
        ) {
            bubble.innerHTML = `
                <img
                    class="message-image"
                    src="${escapeHTML(message.image_url)}"
                    alt="Image"
                    loading="lazy"
                >
            `;

        } else if (
            message.message_type === "sticker" &&
            message.sticker_url
        ) {
            bubble.innerHTML = `
                <img
                    class="message-sticker"
                    src="${escapeHTML(message.sticker_url)}"
                    alt="Sticker"
                    loading="lazy"
                >
            `;

        } else {
            bubble.textContent =
                message.content || "";
        }


        if (message.edited_at) {
            const edited =
                document.createElement("span");

            edited.className =
                "message-edited";

            edited.textContent =
                " edited";

            bubble.appendChild(edited);
        }


        const time =
            document.createElement("span");

        time.className =
            "message-time";

        time.textContent =
            formatTime(message.created_at);

        bubble.appendChild(time);


        wrapper.appendChild(actions);
        wrapper.appendChild(bubble);

        row.appendChild(wrapper);

        return row;
    }


    /* =========================================================
       SEND MESSAGE
       ========================================================= */

    async function sendMessage(event) {
        event?.preventDefault();

        if (
            !state.user ||
            state.currentChatType !== "direct" ||
            !state.currentOtherUser
        ) return;

        const input =
            $("#messageInput");

        const content =
            input?.value.trim();

        if (!content) return;

        const contacts =
            await areContacts(
                state.user.id,
                state.currentOtherUser.id
            );

        if (!contacts) {
            showToast(
                "You can only message accepted contacts.",
                "error"
            );
            return;
        }


        /* EDIT MODE */

        if (state.editingMessage) {
            await updateMessage(
                state.editingMessage.id,
                content
            );

            return;
        }


        const {
            error
        } = await db
            .from("messages")
            .insert({
                sender_id: state.user.id,
                receiver_id:
                    state.currentOtherUser.id,
                content,
                message_type: "text"
            });

        if (error) {
            console.error(error);

            showToast(
                "Could not send message.",
                "error"
            );

            return;
        }

        input.value = "";

        await loadDirectMessages();
    }


    async function updateMessage(id, content) {
        if (!id || !content) return;

        const {
            error
        } = await db
            .from("messages")
            .update({
                content,
                edited_at: new Date().toISOString()
            })
            .eq("id", id)
            .eq("sender_id", state.user.id);

        if (error) {
            console.error(error);

            showToast(
                "Could not edit message.",
                "error"
            );

            return;
        }

        state.editingMessage = null;

        $("#messageInput").value = "";

        $("#sendButton").innerHTML =
            `<i class="fa-solid fa-paper-plane"></i>`;

        await refreshCurrentChat();
    }


    async function deleteMessage(id) {
        if (!id) return;

        const {
            error
        } = await db
            .from("messages")
            .update({
                deleted_at:
                    new Date().toISOString(),
                content: ""
            })
            .eq("id", id)
            .eq("sender_id", state.user.id);

        if (error) {
            console.error(error);

            showToast(
                "Could not delete message.",
                "error"
            );

            return;
        }

        showToast("Message deleted.");

        await refreshCurrentChat();
    }


    /* =========================================================
       SAVE MESSAGE
       ========================================================= */

    async function saveMessage(id) {
        if (!id || !state.user) return;

        const {
            data: message,
            error: messageError
        } = await db
            .from("messages")
            .select("*")
            .eq("id", id)
            .maybeSingle();

        if (messageError || !message) {
            showToast(
                "Could not find message.",
                "error"
            );
            return;
        }

        const {
            error
        } = await db
            .from("saved_messages")
            .insert({
                user_id: state.user.id,
                message_id: id,
                content:
                    message.content || "",
                message_type:
                    message.message_type || "text",
                image_url:
                    message.image_url || null,
                sticker_url:
                    message.sticker_url || null
            });

        if (error) {
            console.error(error);

            if (error.code === "23505") {
                showToast("Message already saved.");
            } else {
                showToast(
                    "Could not save message.",
                    "error"
                );
            }

            return;
        }

        showToast("Message saved.");
    }


    async function loadSavedMessages() {
        const list =
            $("#savedMessagesList");

        if (!list || !state.user) return;

        list.innerHTML = `
            <div class="loading">
                Loading...
            </div>
        `;

        const {
            data,
            error
        } = await db
            .from("saved_messages")
            .select("*")
            .eq("user_id", state.user.id)
            .order("created_at", {
                ascending: false
            });

        if (error) {
            console.error(error);

            list.innerHTML = `
                <div class="empty-list">
                    Could not load saved messages.
                </div>
            `;

            return;
        }

        if (!data?.length) {
            list.innerHTML = `
                <div class="empty-list">
                    No saved messages.
                </div>
            `;

            return;
        }

        list.innerHTML = "";

        data.forEach(item => {
            const element =
                document.createElement("div");

            element.className =
                "saved-message-item";

            element.innerHTML = `
                <div class="saved-message-content">
                    ${
                        item.message_type === "image"
                            ? `
                                <img
                                    src="${escapeHTML(item.image_url || "")}"
                                    alt=""
                                >
                            `
                            : escapeHTML(
                                item.content || ""
                            )
                    }
                </div>

                <span class="saved-message-date">
                    ${escapeHTML(
                        formatDate(item.created_at)
                    )}
                </span>
            `;

            list.appendChild(element);
        });
    }


    /* =========================================================
       MESSAGE SWIPE
       ========================================================= */

    function setupMessageSwipe(wrapper) {
        if (!wrapper) return;

        if (wrapper.dataset.swipeReady === "true") {
            return;
        }

        wrapper.dataset.swipeReady = "true";

        const bubble =
            wrapper.querySelector(
                ".message-bubble"
            );

        if (!bubble) return;

        let pointerDown = false;
        let holdStarted = false;
        let startX = 0;
        let moved = false;
        let holdTimer = null;


        const start = event => {
            if (event.pointerType === "mouse" &&
                event.button !== 0) {
                return;
            }

            pointerDown = true;
            holdStarted = false;
            moved = false;

            startX = event.clientX;

            holdTimer = setTimeout(() => {
                if (pointerDown) {
                    holdStarted = true;
                }
            }, 450);
        };


        const move = event => {
            if (!pointerDown) return;

            const deltaX =
                event.clientX - startX;

            if (Math.abs(deltaX) > 8) {
                moved = true;
            }

            if (
                holdStarted &&
                deltaX < 0
            ) {
                const amount =
                    Math.min(
                        72,
                        Math.abs(deltaX)
                    );

                bubble.style.transform =
                    `translateX(-${amount}px)`;
            }
        };


        const end = event => {
            clearTimeout(holdTimer);

            if (!pointerDown) return;

            const deltaX =
                event.clientX - startX;

            pointerDown = false;

            bubble.style.transform = "";

            if (
                holdStarted &&
                moved &&
                deltaX <= -60
            ) {
                $$(".message-wrapper.swiped")
                    .forEach(other => {
                        if (other !== wrapper) {
                            other.classList.remove(
                                "swiped"
                            );
                        }
                    });

                wrapper.classList.add("swiped");
            }

            holdStarted = false;
        };


        wrapper.addEventListener(
            "pointerdown",
            start
        );

        wrapper.addEventListener(
            "pointermove",
            move
        );

        wrapper.addEventListener(
            "pointerup",
            end
        );

        wrapper.addEventListener(
            "pointercancel",
            end
        );
    }


    function initializeMessageSwipes() {
        $$(".message-wrapper")
            .forEach(setupMessageSwipe);
    }


    document.addEventListener(
        "click",
        event => {
            const action =
                event.target.closest(
                    ".message-action"
                );

            if (action) {
                const wrapper =
                    action.closest(
                        ".message-wrapper"
                    );

                const id =
                    wrapper?.dataset.messageId;

                const type =
                    action.dataset.action;

                if (!id) return;

                if (type === "save") {
                    saveMessage(id);
                }

                if (type === "edit") {
                    startEditMessage(id);
                }

                if (type === "delete") {
                    deleteMessage(id);
                }

                wrapper?.classList.remove(
                    "swiped"
                );

                return;
            }

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
                    });
            }
        }
    );


    async function startEditMessage(id) {
        const {
            data,
            error
        } = await db
            .from("messages")
            .select("*")
            .eq("id", id)
            .eq("sender_id", state.user.id)
            .maybeSingle();

        if (error || !data) {
            showToast(
                "Could not edit this message.",
                "error"
            );
            return;
        }

        state.editingMessage = data;

        const input =
            $("#messageInput");

        input.value =
            data.content || "";

        input.focus();

        $("#sendButton").innerHTML =
            `<i class="fa-solid fa-check"></i>`;
    }


    /* =========================================================
       IMAGE MESSAGE
       ========================================================= */

    async function sendImage(event) {
        const file = event.target.files?.[0];

        event.target.value = "";

        if (
            !file ||
            !state.user ||
            !state.currentOtherUser
        ) return;

        const contacts =
            await areContacts(
                state.user.id,
                state.currentOtherUser.id
            );

        if (!contacts) {
            showToast(
                "Accept the contact request first.",
                "error"
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

        if (file.size > 10 * 1024 * 1024) {
            showToast(
                "Image must be smaller than 10 MB.",
                "error"
            );
            return;
        }

        try {
            showToast("Uploading image...");

            const extension =
                file.name.split(".").pop() || "jpg";

            const path =
                `${state.user.id}/${Date.now()}.${extension}`;

            const url =
                await uploadFile(
                    "chat-media",
                    file,
                    path
                );

            const {
                error
            } = await db
                .from("messages")
                .insert({
                    sender_id: state.user.id,
                    receiver_id:
                        state.currentOtherUser.id,
                    content: "",
                    message_type: "image",
                    image_url: url
                });

            if (error) throw error;

            await refreshCurrentChat();

        } catch (error) {
            console.error(error);

            showToast(
                "Could not send image.",
                "error"
            );
        }
    }


    /* =========================================================
       EMOJI / STICKERS
       ========================================================= */

    function setupEmojiPanel() {
        const panel = $("#emojiPanel");
        const input = $("#messageInput");

        if (!panel || !input) return;

        panel
            .querySelectorAll("button")
            .forEach(button => {
                button.addEventListener(
                    "click",
                    () => {
                        input.value +=
                            button.textContent;

                        input.focus();
                    }
                );
            });
    }


    function setupStickerPanel() {
        const panel = $("#stickerPanel");
        const input = $("#messageInput");

        if (!panel || !input) return;

        panel
            .querySelectorAll("button")
            .forEach(button => {
                button.addEventListener(
                    "click",
                    () => {
                        input.value +=
                            button.textContent;

                        input.focus();

                        panel.style.display =
                            "none";
                    }
                );
            });
    }


    function togglePanel(panelId) {
        const panel =
            document.getElementById(panelId);

        if (!panel) return;

        const visible =
            panel.style.display !== "none";

        $("#emojiPanel").style.display =
            "none";

        $("#stickerPanel").style.display =
            "none";

        if (!visible) {
            panel.style.display = "grid";
        }
    }


    /* =========================================================
       GROUPS
       ========================================================= */

    async function loadGroups() {
        if (!state.user) return;

        const {
            data: memberships,
            error
        } = await db
            .from("group_members")
            .select("group_id, role")
            .eq("user_id", state.user.id);

        if (error) {
            console.error(error);
            return;
        }

        const ids =
            (memberships || [])
                .map(item => item.group_id);

        if (!ids.length) {
            state.groups = [];
            renderGroups([]);
            return;
        }

        const {
            data: groups,
            error: groupError
        } = await db
            .from("groups")
            .select("*")
            .in("id", ids);

        if (groupError) {
            console.error(groupError);
            return;
        }

        state.groups = groups || [];

        renderGroups(state.groups);
    }


    function renderGroups(groups) {
        const list =
            $("#groupsList");

        if (!list) return;

        list.innerHTML = "";

        if (!groups.length) {
            list.innerHTML = `
                <div class="empty-list">
                    No groups yet.
                </div>
            `;

            updateCount("#groupCount", 0);
            return;
        }

        groups.forEach(group => {
            const item =
                document.createElement("button");

            item.type = "button";
            item.className = "community-item";

            item.innerHTML = `
                <div class="community-avatar-small">

                    ${
                        group.avatar_url
                            ? `
                                <img
                                    src="${escapeHTML(group.avatar_url)}"
                                    alt=""
                                >
                            `
                            : `
                                <i class="fa-solid fa-users"></i>
                            `
                    }

                </div>

                <div class="community-item-info">

                    <strong>
                        ${escapeHTML(group.name)}
                    </strong>

                    <span>
                        @${escapeHTML(group.username)}
                    </span>

                </div>
            `;

            item.addEventListener(
                "click",
                () => openGroup(group)
            );

            list.appendChild(item);
        });

        updateCount(
            "#groupCount",
            groups.length
        );
    }


    async function createGroup(event) {
        event?.preventDefault();

        const name =
            $("#groupName")?.value.trim();

        const username =
            normalizeUsername(
                $("#groupUsername")?.value
            );

        const bio =
            $("#groupBio")?.value.trim() || "";

        const privacy =
            document.querySelector(
                'input[name="groupPrivacy"]:checked'
            )?.value || "public";

        if (!name) {
            showToast(
                "Group name is required.",
                "error"
            );
            return;
        }

        if (!validUsername(username)) {
            showToast(
                "Invalid group username.",
                "error"
            );
            return;
        }

        try {
            const {
                data,
                error
            } = await db.rpc(
                "create_group",
                {
                    p_name: name,
                    p_username: username,
                    p_bio: bio
                }
            );

            if (error) throw error;

            const groupId = data;

            /* privacy */
            await db
                .from("groups")
                .update({
                    privacy
                })
                .eq("id", groupId)
                .eq("owner_id", state.user.id);

            /* avatar */
            await uploadCommunityAvatar(
                "group",
                groupId
            );

            closeModal("createGroupModal");

            $("#groupForm")?.reset();

            showToast("Group created.");

            await loadGroups();

        } catch (error) {
            console.error(error);

            if (
                error.code === "23505"
            ) {
                showToast(
                    "That group username is already taken.",
                    "error"
                );
            } else {
                showToast(
                    error.message ||
                    "Could not create group.",
                    "error"
                );
            }
        }
    }


    async function openGroup(group) {
        if (!group) return;

        state.currentChatType = "group";
        state.currentGroup = group;
        state.currentChannel = null;
        state.currentOtherUser = null;

        showActiveChat();

        $("#chatName").textContent =
            group.name;

        $("#chatStatus").textContent =
            `@${group.username}`;

        setAvatar(
            $("#chatAvatar"),
            $("#chatAvatarInitial"),
            group.avatar_url,
            group.name
        );

        $("#chatVerified").style.display =
            "none";

        $("#contactActions").style.display =
            "none";

        enableComposer(true);

        await loadGroupMessages(group.id);
    }


    async function loadGroupMessages(groupId) {
        const {
            data,
            error
        } = await db
            .from("group_messages")
            .select("*")
            .eq("group_id", groupId)
            .order("created_at", {
                ascending: true
            });

        if (error) {
            console.error(error);
            return;
        }

        renderCommunityMessages(data || []);
    }


    /* =========================================================
       CHANNELS
       ========================================================= */

    async function loadChannels() {
        if (!state.user) return;

        const {
            data: memberships,
            error
        } = await db
            .from("channel_members")
            .select("channel_id, role")
            .eq("user_id", state.user.id);

        if (error) {
            console.error(error);
            return;
        }

        const ids =
            (memberships || [])
                .map(item => item.channel_id);

        if (!ids.length) {
            state.channels = [];
            renderChannels([]);
            return;
        }

        const {
            data: channels,
            error: channelError
        } = await db
            .from("channels")
            .select("*")
            .in("id", ids);

        if (channelError) {
            console.error(channelError);
            return;
        }

        state.channels = channels || [];

        renderChannels(state.channels);
    }


    function renderChannels(channels) {
        const list =
            $("#channelsList");

        if (!list) return;

        list.innerHTML = "";

        if (!channels.length) {
            list.innerHTML = `
                <div class="empty-list">
                    No channels yet.
                </div>
            `;

            updateCount("#channelCount", 0);
            return;
        }

        channels.forEach(channel => {
            const item =
                document.createElement("button");

            item.type = "button";
            item.className = "community-item";

            item.innerHTML = `
                <div class="community-avatar-small">

                    ${
                        channel.avatar_url
                            ? `
                                <img
                                    src="${escapeHTML(channel.avatar_url)}"
                                    alt=""
                                >
                            `
                            : `
                                <i class="fa-solid fa-bullhorn"></i>
                            `
                    }

                </div>

                <div class="community-item-info">

                    <strong>
                        ${escapeHTML(channel.name)}
                    </strong>

                    <span>
                        @${escapeHTML(channel.username)}
                    </span>

                </div>
            `;

            item.addEventListener(
                "click",
                () => openChannel(channel)
            );

            list.appendChild(item);
        });

        updateCount(
            "#channelCount",
            channels.length
        );
    }


    async function createChannel(event) {
        event?.preventDefault();

        const name =
            $("#channelName")?.value.trim();

        const username =
            normalizeUsername(
                $("#channelUsername")?.value
            );

        const bio =
            $("#channelBio")?.value.trim() || "";

        const privacy =
            document.querySelector(
                'input[name="channelPrivacy"]:checked'
            )?.value || "public";

        if (!name) {
            showToast(
                "Channel name is required.",
                "error"
            );
            return;
        }

        if (!validUsername(username)) {
            showToast(
                "Invalid channel username.",
                "error"
            );
            return;
        }

        try {
            const {
                data,
                error
            } = await db.rpc(
                "create_channel",
                {
                    p_name: name,
                    p_username: username,
                    p_bio: bio
                }
            );

            if (error) throw error;

            const channelId = data;

            await db
                .from("channels")
                .update({
                    privacy
                })
                .eq("id", channelId)
                .eq("owner_id", state.user.id);

            await uploadCommunityAvatar(
                "channel",
                channelId
            );

            closeModal("createChannelModal");

            $("#channelForm")?.reset();

            showToast("Channel created.");

            await loadChannels();

        } catch (error) {
            console.error(error);

            if (
                error.code === "23505"
            ) {
                showToast(
                    "That channel username is already taken.",
                    "error"
                );
            } else {
                showToast(
                    error.message ||
                    "Could not create channel.",
                    "error"
                );
            }
        }
    }


    async function openChannel(channel) {
        if (!channel) return;

        state.currentChatType = "channel";
        state.currentChannel = channel;
        state.currentGroup = null;
        state.currentOtherUser = null;

        showActiveChat();

        $("#chatName").textContent =
            channel.name;

        $("#chatStatus").textContent =
            `@${channel.username}`;

        setAvatar(
            $("#chatAvatar"),
            $("#chatAvatarInitial"),
            channel.avatar_url,
            channel.name
        );

        $("#chatVerified").style.display =
            "none";

        $("#contactActions").style.display =
            "none";

        enableComposer(
            await isChannelWriter(channel.id)
        );

        await loadChannelMessages(
            channel.id
        );
    }


    async function isChannelWriter(channelId) {
        if (!state.user) return false;

        const {
            data,
            error
        } = await db
            .from("channel_members")
            .select("role")
            .eq("channel_id", channelId)
            .eq("user_id", state.user.id)
            .maybeSingle();

        if (error) {
            console.error(error);
            return false;
        }

        return (
            data?.role === "owner" ||
            data?.role === "admin" ||
            data?.role === "writer"
        );
    }


    async function loadChannelMessages(channelId) {
        const {
            data,
            error
        } = await db
            .from("channel_messages")
            .select("*")
            .eq("channel_id", channelId)
            .order("created_at", {
                ascending: true
            });

        if (error) {
            console.error(error);
            return;
        }

        renderCommunityMessages(data || []);
    }


    function renderCommunityMessages(messages) {
        const container =
            $("#messages");

        if (!container) return;

        container.innerHTML = "";

        messages.forEach(message => {
            const row =
                document.createElement("div");

            row.className =
                "message-row " +
                (
                    message.sender_id ===
                    state.user.id
                        ? "mine"
                        : "theirs"
                );

            const wrapper =
                document.createElement("div");

            wrapper.className =
                "message-wrapper";

            wrapper.dataset.messageId =
                message.id;

            const actions =
                document.createElement("div");

            actions.className =
                "message-actions";

            const save =
                document.createElement("button");

            save.type = "button";
            save.className =
                "message-action";
            save.dataset.action =
                "save";

            save.innerHTML =
                `<i class="fa-solid fa-bookmark"></i>`;

            actions.appendChild(save);


            if (
                message.sender_id ===
                state.user.id
            ) {
                const edit =
                    document.createElement("button");

                edit.type = "button";
                edit.className =
                    "message-action";
                edit.dataset.action =
                    "edit";

                edit.innerHTML =
                    `<i class="fa-solid fa-pen"></i>`;

                const del =
                    document.createElement("button");

                del.type = "button";
                del.className =
                    "message-action";
                del.dataset.action =
                    "delete";

                del.innerHTML =
                    `<i class="fa-solid fa-trash"></i>`;

                actions.appendChild(edit);
                actions.appendChild(del);
            }


            const bubble =
                document.createElement("div");

            bubble.className =
                "message-bubble";

            bubble.textContent =
                message.deleted_at
                    ? "This message was deleted"
                    : message.content || "";


            const time =
                document.createElement("span");

            time.className =
                "message-time";

            time.textContent =
                formatTime(
                    message.created_at
                );

            bubble.appendChild(time);

            wrapper.appendChild(actions);
            wrapper.appendChild(bubble);

            row.appendChild(wrapper);

            container.appendChild(row);
        });

        initializeMessageSwipes();

        scrollMessagesToBottom();
    }


    /* =========================================================
       COMMUNITY AVATAR
       ========================================================= */

    async function uploadCommunityAvatar(
        type,
        id
    ) {
        const input =
            type === "group"
                ? $("#groupAvatarInput")
                : $("#channelAvatarInput");

        const file =
            input?.files?.[0];

        if (!file) return;

        try {
            const extension =
                file.name.split(".").pop() ||
                "jpg";

            const bucket =
                type === "group"
                    ? "group-avatars"
                    : "channel-avatars";

            const table =
                type === "group"
                    ? "groups"
                    : "channels";

            const path =
                `${id}/avatar.${extension}`;

            const url =
                await uploadFile(
                    bucket,
                    file,
                    path
                );

            await db
                .from(table)
                .update({
                    avatar_url: url
                })
                .eq("id", id)
                .eq("owner_id", state.user.id);

        } catch (error) {
            console.error(error);
            showToast(
                "Community created, but avatar upload failed.",
                "error"
            );
        }
    }


    /* =========================================================
       JOIN
       ========================================================= */

    async function joinGroup() {
        const code =
            $("#groupInviteInput")
                ?.value.trim();

        if (!code) {
            showToast(
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
                p_invite_code: code
            }
        );

        if (error) {
            console.error(error);

            showToast(
                error.message ||
                "Could not join group.",
                "error"
            );

            return;
        }

        closeModal("joinGroupModal");

        $("#groupInviteInput").value = "";

        showToast("Joined group.");

        await loadGroups();
    }


    async function joinChannel() {
        const code =
            $("#channelInviteInput")
                ?.value.trim();

        if (!code) {
            showToast(
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
                p_invite_code: code
            }
        );

        if (error) {
            console.error(error);

            showToast(
                error.message ||
                "Could not join channel.",
                "error"
            );

            return;
        }

        closeModal("joinChannelModal");

        $("#channelInviteInput").value = "";

        showToast("Joined channel.");

        await loadChannels();
    }


    /* =========================================================
       GROUP / CHANNEL INFO
       ========================================================= */

    function showGroupInfo(group) {
        if (!group) return;

        $("#groupInfoName").textContent =
            group.name;

        $("#groupInfoUsername").textContent =
            "@" + group.username;

        $("#groupInfoBio").textContent =
            group.bio || "No bio";

        $("#groupInfoPrivacy").textContent =
            group.privacy === "private"
                ? "Private group"
                : "Public group";

        setCommunityAvatar(
            $("#groupInfoAvatar"),
            group.avatar_url,
            group.name,
            "fa-solid fa-users"
        );

        openModal("groupInfoModal");
    }


    function showChannelInfo(channel) {
        if (!channel) return;

        $("#channelInfoName").textContent =
            channel.name;

        $("#channelInfoUsername").textContent =
            "@" + channel.username;

        $("#channelInfoBio").textContent =
            channel.bio || "No bio";

        $("#channelInfoPrivacy").textContent =
            channel.privacy === "private"
                ? "Private channel"
                : "Public channel";

        setCommunityAvatar(
            $("#channelInfoAvatar"),
            channel.avatar_url,
            channel.name,
            "fa-solid fa-bullhorn"
        );

        openModal("channelInfoModal");
    }


    /* =========================================================
       MEMBERS
       ========================================================= */

    async function loadGroupMembers() {
        if (!state.currentGroup) return;

        $("#membersTitle").textContent =
            `${state.currentGroup.name} Members`;

        openModal("membersModal");

        const {
            data: members,
            error
        } = await db
            .from("group_members")
            .select("user_id, role")
            .eq(
                "group_id",
                state.currentGroup.id
            );

        if (error) {
            console.error(error);
            return;
        }

        await renderMembers(
            members || []
        );
    }


    async function loadChannelMembers() {
        if (!state.currentChannel) return;

        $("#membersTitle").textContent =
            `${state.currentChannel.name} Members`;

        openModal("membersModal");

        const {
            data: members,
            error
        } = await db
            .from("channel_members")
            .select("user_id, role")
            .eq(
                "channel_id",
                state.currentChannel.id
            );

        if (error) {
            console.error(error);
            return;
        }

        await renderMembers(
            members || []
        );
    }


    async function renderMembers(members) {
        const list =
            $("#membersList");

        list.innerHTML = "";

        const ids =
            members.map(m => m.user_id);

        if (!ids.length) {
            list.innerHTML = `
                <div class="empty-list">
                    No members.
                </div>
            `;
            return;
        }

        const {
            data: profiles,
            error
        } = await db
            .from("profiles")
            .select("*")
            .in("id", ids);

        if (error) {
            console.error(error);
            return;
        }

        const profileMap =
            new Map(
                (profiles || []).map(
                    profile => [
                        profile.id,
                        profile
                    ]
                )
            );

        members.forEach(member => {
            const profile =
                profileMap.get(
                    member.user_id
                );

            if (!profile) return;

            const item =
                document.createElement("div");

            item.className =
                "member-item";

            item.innerHTML = `
                <div class="chat-avatar">

                    ${
                        profile.avatar_url
                            ? `
                                <img
                                    src="${escapeHTML(profile.avatar_url)}"
                                    alt=""
                                >
                            `
                            : `
                                <span>
                                    ${escapeHTML(
                                        avatarInitial(
                                            profile.full_name ||
                                            profile.username
                                        )
                                    )}
                                </span>
                            `
                    }

                </div>

                <div class="member-info">

                    <strong>
                        ${escapeHTML(
                            profile.full_name ||
                            profile.username
                        )}
                    </strong>

                    <span>
                        @${escapeHTML(
                            profile.username
                        )}
                    </span>

                </div>

                <small>
                    ${escapeHTML(member.role || "member")}
                </small>
            `;

            list.appendChild(item);
        });
    }


    /* =========================================================
       INVITES
       ========================================================= */

    async function createInvite(type) {
        const id =
            type === "group"
                ? state.currentGroup?.id
                : state.currentChannel?.id;

        if (!id) return;

        const table =
            type === "group"
                ? "group_invites"
                : "channel_invites";

        const foreignKey =
            type === "group"
                ? "group_id"
                : "channel_id";

        const code =
            crypto.randomUUID()
                .replace(/-/g, "")
                .slice(0, 12);

        const {
            data,
            error
        } = await db
            .from(table)
            .insert({
                [foreignKey]: id,
                created_by: state.user.id,
                invite_code: code
            })
            .select()
            .single();

        if (error) {
            console.error(error);

            showToast(
                "Could not create invite.",
                "error"
            );

            return;
        }

        const text =
            data.invite_code || code;

        try {
            await navigator.clipboard.writeText(
                text
            );

            showToast(
                `Invite code copied: ${text}`
            );
        } catch {
            showToast(
                `Invite code: ${text}`
            );
        }
    }


    /* =========================================================
       LEAVE
       ========================================================= */

    async function leaveGroup() {
        if (!state.currentGroup) return;

        const {
            error
        } = await db
            .from("group_members")
            .delete()
            .eq(
                "group_id",
                state.currentGroup.id
            )
            .eq(
                "user_id",
                state.user.id
            );

        if (error) {
            console.error(error);

            showToast(
                "You cannot leave this group from the current permissions.",
                "error"
            );

            return;
        }

        closeModal("groupInfoModal");

        state.currentGroup = null;

        await loadGroups();

        showEmptyChat();

        showToast("You left the group.");
    }


    async function leaveChannel() {
        if (!state.currentChannel) return;

        const {
            error
        } = await db
            .from("channel_members")
            .delete()
            .eq(
                "channel_id",
                state.currentChannel.id
            )
            .eq(
                "user_id",
                state.user.id
            );

        if (error) {
            console.error(error);

            showToast(
                "You cannot leave this channel from the current permissions.",
                "error"
            );

            return;
        }

        closeModal("channelInfoModal");

        state.currentChannel = null;

        await loadChannels();

        showEmptyChat();

        showToast("You left the channel.");
    }


    /* =========================================================
       SEARCH
       ========================================================= */

    function setupSearch() {
        const input =
            $("#searchInput");

        if (!input) return;

        input.addEventListener(
            "input",
            () => {
                const value =
                    input.value.trim();

                const clear =
                    $("#clearSearchBtn");

                if (clear) {
                    clear.style.display =
                        value
                            ? "flex"
                            : "none";
                }

                clearTimeout(
                    state.searchTimer
                );

                state.searchTimer =
                    setTimeout(
                        () => performSearch(value),
                        250
                    );
            }
        );
    }


    async function performSearch(value) {
        if (!value) {
            await restoreSidebarLists();
            return;
        }

        const username =
            normalizeUsername(value);

        const [
            people,
            groups,
            channels
        ] = await Promise.all([
            searchProfiles(username),
            searchGroups(username),
            searchChannels(username)
        ]);

        renderSearchResults(
            people,
            groups,
            channels
        );
    }


    async function searchProfiles(username) {
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
            .neq("id", state.user.id)
            .limit(20);

        if (error) {
            console.error(error);
            return [];
        }

        return data || [];
    }


    async function searchGroups(username) {
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
            .limit(20);

        if (error) {
            console.error(error);
            return [];
        }

        return data || [];
    }


    async function searchChannels(username) {
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
            .limit(20);

        if (error) {
            console.error(error);
            return [];
        }

        return data || [];
    }


    function renderSearchResults(
        people,
        groups,
        channels
    ) {
        const list =
            $("#userList");

        if (!list) return;

        list.innerHTML = "";

        const title =
            document.createElement("div");

        title.className =
            "search-results-title";

        title.textContent =
            "Search results";

        list.appendChild(title);


        people.forEach(profile => {
            list.appendChild(
                createContactElement(profile)
            );
        });


        groups.forEach(group => {
            const item =
                document.createElement("button");

            item.type = "button";
            item.className =
                "community-item";

            item.innerHTML = `
                <div class="community-avatar-small">
                    <i class="fa-solid fa-users"></i>
                </div>

                <div class="community-item-info">
                    <strong>
                        ${escapeHTML(group.name)}
                    </strong>

                    <span>
                        @${escapeHTML(group.username)}
                    </span>
                </div>
            `;

            item.addEventListener(
                "click",
                () => {
                    openGroup(group);
                }
            );

            list.appendChild(item);
        });


        channels.forEach(channel => {
            const item =
                document.createElement("button");

            item.type = "button";
            item.className =
                "community-item";

            item.innerHTML = `
                <div class="community-avatar-small">
                    <i class="fa-solid fa-bullhorn"></i>
                </div>

                <div class="community-item-info">
                    <strong>
                        ${escapeHTML(channel.name)}
                    </strong>

                    <span>
                        @${escapeHTML(channel.username)}
                    </span>
                </div>
            `;

            item.addEventListener(
                "click",
                () => {
                    openChannel(channel);
                }
            );

            list.appendChild(item);
        });


        if (
            !people.length &&
            !groups.length &&
            !channels.length
        ) {
            list.innerHTML += `
                <div class="empty-list">
                    No results found.
                </div>
            `;
        }
    }


    async function restoreSidebarLists() {
        const activeTab =
            document.querySelector(
                ".sidebar-tab.active"
            )?.dataset.tab ||
            "contacts";

        if (activeTab === "contacts") {
            await loadContacts();
        }

        if (activeTab === "groups") {
            await loadGroups();
        }

        if (activeTab === "channels") {
            await loadChannels();
        }
    }


    /* =========================================================
       USER PROFILE POPUP
       ========================================================= */

    async function openUserProfile(profile) {
        if (!profile) return;

        state.currentProfileUser =
            profile;

        $("#userProfileName").textContent =
            profile.full_name ||
            profile.username;

        $("#userProfileUsername").textContent =
            "@" + profile.username;

        $("#userProfileBio").textContent =
            profile.bio ||
            "No bio";

        $("#userProfileStatus").textContent =
            profile.show_online === false
                ? "Offline"
                : (
                    profile.last_seen
                        ? `Last seen ${formatDate(profile.last_seen)}`
                        : "Offline"
                );

        setAvatar(
            $("#userProfileAvatar"),
            $("#userProfileAvatarInitial"),
            profile.avatar_url,
            profile.full_name ||
            profile.username
        );

        $("#userProfileVerified").style.display =
            isVerified(profile)
                ? "inline-flex"
                : "none";

        $("#userProfileMenu").style.display =
            "none";

        openModal("userProfileModal");
    }


    /* =========================================================
       NICKNAMES
       ========================================================= */

    async function saveNickname() {
        const profile =
            state.currentProfileUser;

        if (!profile) return;

        const nickname =
            $("#nicknameInput")
                ?.value.trim() || "";

        if (!nickname) {
            showToast(
                "Nickname cannot be empty.",
                "error"
            );
            return;
        }

        const {
            error
        } = await db
            .from("contact_nicknames")
            .upsert({
                owner_id: state.user.id,
                contact_id: profile.id,
                nickname
            }, {
                onConflict:
                    "owner_id,contact_id"
            });

        if (error) {
            console.error(error);

            showToast(
                "Could not save nickname.",
                "error"
            );

            return;
        }

        closeModal("nicknameModal");

        showToast("Nickname saved.");
    }


    async function removeNickname() {
        const profile =
            state.currentProfileUser;

        if (!profile) return;

        const {
            error
        } = await db
            .from("contact_nicknames")
            .delete()
            .eq(
                "owner_id",
                state.user.id
            )
            .eq(
                "contact_id",
                profile.id
            );

        if (error) {
            console.error(error);

            showToast(
                "Could not delete nickname.",
                "error"
            );

            return;
        }

        closeModal("nicknameModal");

        showToast("Nickname deleted.");
    }


    /* =========================================================
       BLOCK
       ========================================================= */

    async function blockUser() {
        const profile =
            state.currentProfileUser;

        if (!profile) return;

        const {
            error
        } = await db
            .from("user_blocks")
            .upsert({
                blocker_id: state.user.id,
                blocked_id: profile.id
            }, {
                onConflict:
                    "blocker_id,blocked_id"
            });

        if (error) {
            console.error(error);

            showToast(
                "Could not block user.",
                "error"
            );

            return;
        }

        closeModal("userProfileModal");

        showToast("User blocked.");
    }


    /* =========================================================
       REPORT
       ========================================================= */

    function openReport() {
        if (!state.currentProfileUser) {
            return;
        }

        openModal("reportModal");
    }


    async function submitReport() {
        const profile =
            state.currentProfileUser;

        if (!profile) return;

        const reason =
            document.querySelector(
                'input[name="reportReason"]:checked'
            )?.value || "other";

        const description =
            $("#reportDescription")
                ?.value.trim() || "";

        const {
            error
        } = await db
            .from("reports")
            .insert({
                reporter_id: state.user.id,
                reported_user_id: profile.id,
                reason,
                description,
                status: "open"
            });

        if (error) {
            console.error(error);

            showToast(
                "Could not submit report.",
                "error"
            );

            return;
        }

        $("#reportDescription").value = "";

        closeModal("reportModal");
        closeModal("userProfileModal");

        showToast("Report submitted.");
    }


    /* =========================================================
       OWNER
       ========================================================= */

    async function checkOwner() {
        if (!state.user) return false;

        const {
            data,
            error
        } = await db.rpc(
            "get_my_role"
        );

        if (error) {
            console.error(error);
            return false;
        }

        return data === "owner";
    }


    async function setupOwnerUI() {
        const isOwner =
            await checkOwner();

        const ownerButton =
            $("#ownerPanelButton");

        if (ownerButton) {
            ownerButton.style.display =
                isOwner
                    ? "flex"
                    : "none";
        }
    }


    async function searchVerifiedUser() {
        const username =
            normalizeUsername(
                $("#ownerVerifiedUsername")
                    ?.value
            );

        const result =
            $("#ownerVerifiedResult");

        if (!result) return;

        if (!username) {
            result.innerHTML = "";
            return;
        }

        const {
            data,
            error
        } = await db
            .from("profiles")
            .select("*")
            .eq("username", username)
            .maybeSingle();

        if (error) {
            console.error(error);
            result.textContent =
                "Search failed.";
            return;
        }

        if (!data) {
            result.innerHTML = `
                <div class="empty-list">
                    User not found.
                </div>
            `;
            return;
        }

        result.innerHTML = `
            <div class="owner-user-result">

                <strong>
                    ${escapeHTML(
                        data.full_name ||
                        data.username
                    )}
                </strong>

                <span>
                    @${escapeHTML(data.username)}
                </span>

                <span>
                    ${
                        isVerified(data)
                            ? (
                                data.verified_until
                                    ? formatRemaining(
                                        data.verified_until
                                    )
                                    : "Permanent"
                            )
                            : "Not verified"
                    }
                </span>

                <button
                    type="button"
                    id="ownerVerifiedActionBtn"
                    class="primary-btn"
                >
                    ${
                        isVerified(data)
                            ? "Remove Verification"
                            : "Give Verification"
                    }
                </button>

            </div>
        `;

        $("#ownerVerifiedActionBtn")
            ?.addEventListener(
                "click",
                () => toggleVerified(data)
            );
    }


    async function toggleVerified(profile) {
        if (!profile) return;

        const verified =
            isVerified(profile);

        const duration =
            Number(
                $("#verifiedDuration")
                    ?.value || 0
            );

        /*
         * Current known RPC:
         * owner_set_verified(uuid,text)
         *
         * It does not safely accept duration yet.
         * We therefore call the existing RPC here.
         */

        const {
            error
        } = await db.rpc(
            "owner_set_verified",
            {
                p_user_id: profile.id,
                p_action:
                    verified
                        ? "remove"
                        : "give"
            }
        );

        if (error) {
            console.error(error);

            showToast(
                error.message ||
                "Could not change verification.",
                "error"
            );

            return;
        }

        /*
         * Duration cannot be safely written from
         * frontend unless the owner RPC supports it.
         * The selected value is therefore not falsely
         * presented as saved.
         */

        if (!verified && duration > 0) {
            showToast(
                "Verification given. Duration storage requires the duration-enabled owner RPC."
            );
        } else {
            showToast(
                verified
                    ? "Verification removed."
                    : "Verification given."
            );
        }

        await searchVerifiedUser();
    }


    /* =========================================================
       MODAL / UI
       ========================================================= */

    function showActiveChat() {
        $("#chatEmpty").style.display =
            "none";

        $("#activeChat").style.display =
            "flex";
    }


    function showEmptyChat() {
        $("#chatEmpty").style.display =
            "flex";

        $("#activeChat").style.display =
            "none";

        state.currentChat = null;
        state.currentChatType = null;
        state.currentOtherUser = null;
        state.currentGroup = null;
        state.currentChannel = null;
    }


    function enableComposer(enabled) {
        const form =
            $("#messageForm");

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

        if (!form) return;

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

        form.classList.toggle(
            "disabled",
            !enabled
        );
    }


    function scrollMessagesToBottom() {
        const container =
            $("#messages");

        if (!container) return;

        requestAnimationFrame(() => {
            container.scrollTop =
                container.scrollHeight;
        });
    }


    function updateCount(selector, value) {
        const element =
            $(selector);

        if (element) {
            element.textContent =
                String(value);
        }
    }


    /* =========================================================
       TABS
       ========================================================= */

    function setupTabs() {
        $$(".sidebar-tab")
            .forEach(tab => {
                tab.addEventListener(
                    "click",
                    async () => {

                        $$(".sidebar-tab")
                            .forEach(item =>
                                item.classList.remove(
                                    "active"
                                )
                            );

                        tab.classList.add("active");

                        const name =
                            tab.dataset.tab;

                        $("#chatsTab").style.display =
                            name === "contacts"
                                ? "block"
                                : "none";

                        $("#groupsTab").style.display =
                            name === "groups"
                                ? "block"
                                : "none";

                        $("#channelsTab").style.display =
                            name === "channels"
                                ? "block"
                                : "none";

                        const search =
                            $("#searchInput");

                        if (search) {
                            search.value = "";
                        }

                        if (name === "contacts") {
                            await loadContacts();
                        }

                        if (name === "groups") {
                            await loadGroups();
                        }

                        if (name === "channels") {
                            await loadChannels();
                        }
                    }
                );
            });
    }


    /* =========================================================
       THEME / DENSITY / LANGUAGE
       ========================================================= */

    function applyTheme(theme) {
        state.theme = theme;

        localStorage.setItem(
            "megchatbox_theme",
            theme
        );

        document.body.dataset.theme =
            theme;

        $$(".appearance-option[data-theme]")
            .forEach(button => {
                button.classList.toggle(
                    "selected",
                    button.dataset.theme ===
                    theme
                );
            });
    }


    function applyDensity(density) {
        state.density = density;

        localStorage.setItem(
            "megchatbox_density",
            density
        );

        document.body.dataset.density =
            density;

        $$(".appearance-option[data-density]")
            .forEach(button => {
                button.classList.toggle(
                    "selected",
                    button.dataset.density ===
                    density
                );
            });
    }


    function applyLanguage(language) {
        state.language = language;

        localStorage.setItem(
            "megchatbox_language",
            language
        );

        $$(".language-option")
            .forEach(button => {
                button.classList.toggle(
                    "selected",
                    button.dataset.language ===
                    language
                );
            });
    }


    /* =========================================================
       REFRESH
       ========================================================= */

    async function refreshCurrentChat() {
        if (
            state.currentChatType ===
            "direct"
        ) {
            await loadDirectMessages();
        }

        if (
            state.currentChatType ===
            "group"
        ) {
            await loadGroupMessages(
                state.currentGroup.id
            );
        }

        if (
            state.currentChatType ===
            "channel"
        ) {
            await loadChannelMessages(
                state.currentChannel.id
            );
        }
    }


    async function refreshAll() {
        await loadContacts();
        await loadGroups();
        await loadChannels();
    }


    /* =========================================================
       REALTIME
       ========================================================= */

    function cleanupRealtime() {
        state.realtimeChannels
            .forEach(channel => {
                try {
                    db.removeChannel(channel);
                } catch {}
            });

        state.realtimeChannels = [];
    }


    function setupRealtime() {
        cleanupRealtime();

        if (!state.user) return;


        /* CONTACT REQUESTS */

        const contactsChannel =
            db
                .channel(
                    `contact-requests-${state.user.id}`
                )
                .on(
                    "postgres_changes",
                    {
                        event: "*",
                        schema: "public",
                        table: "contact_requests"
                    },
                    async payload => {

                        const row =
                            payload.new ||
                            payload.old;

                        if (!row) return;

                        if (
                            row.sender_id !==
                                state.user.id &&
                            row.receiver_id !==
                                state.user.id
                        ) {
                            return;
                        }

                        await loadContacts();

                        if (
                            state.currentOtherUser
                        ) {
                            await updateContactActions();
                        }
                    }
                )
                .subscribe();

        state.realtimeChannels.push(
            contactsChannel
        );


        /* DIRECT MESSAGES */

        const messagesChannel =
            db
                .channel(
                    `messages-${state.user.id}`
                )
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

                        if (!row) return;

                        if (
                            row.sender_id !==
                                state.user.id &&
                            row.receiver_id !==
                                state.user.id
                        ) {
                            return;
                        }

                        if (
                            state.currentChatType ===
                                "direct" &&
                            state.currentOtherUser
                        ) {
                            const belongs =
                                row.sender_id ===
                                    state.currentOtherUser.id ||
                                row.receiver_id ===
                                    state.currentOtherUser.id;

                            if (belongs) {
                                await loadDirectMessages();
                            }
                        }
                    }
                )
                .subscribe();

        state.realtimeChannels.push(
            messagesChannel
        );


        /* GROUP MESSAGES */

        const groupChannel =
            db
                .channel(
                    `group-messages-${state.user.id}`
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
                            state.currentChatType ===
                                "group" &&
                            state.currentGroup &&
                            row?.group_id ===
                                state.currentGroup.id
                        ) {
                            await loadGroupMessages(
                                state.currentGroup.id
                            );
                        }
                    }
                )
                .subscribe();

        state.realtimeChannels.push(
            groupChannel
        );


        /* CHANNEL MESSAGES */

        const channel =
            db
                .channel(
                    `channel-messages-${state.user.id}`
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
                            state.currentChatType ===
                                "channel" &&
                            state.currentChannel &&
                            row?.channel_id ===
                                state.currentChannel.id
                        ) {
                            await loadChannelMessages(
                                state.currentChannel.id
                            );
                        }
                    }
                )
                .subscribe();

        state.realtimeChannels.push(
            channel
        );
    }


    /* =========================================================
       LOGOUT
       ========================================================= */

    async function logout() {
        cleanupRealtime();

        const {
            error
        } = await db.auth.signOut();

        if (error) {
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
       DELETE ACCOUNT
       ========================================================= */

    async function deleteAccount() {
        showToast(
            "Account deletion must be handled by a secure server-side function.",
            "error"
        );
    }


    /* =========================================================
       EVENTS
       ========================================================= */

    function setupEvents() {

        /* SETTINGS */

        $("#settingsBtn")
            ?.addEventListener(
                "click",
                () => openModal("settingsModal")
            );


        $("#profileSettingsBtn")
            ?.addEventListener(
                "click",
                () => {
                    fillProfileForm();
                    closeModal("settingsModal");
                    openModal("profileModal");
                }
            );


        $("#privacySettingsBtn")
            ?.addEventListener(
                "click",
                () => {
                    fillPrivacySettings();
                    closeModal("settingsModal");
                    openModal("privacyModal");
                }
            );


        $("#appearanceSettingsBtn")
            ?.addEventListener(
                "click",
                () => {
                    closeModal("settingsModal");
                    openModal("appearanceModal");
                }
            );


        $("#languageSettingsBtn")
            ?.addEventListener(
                "click",
                () => {
                    closeModal("settingsModal");
                    openModal("languageModal");
                }
            );


        $("#savedMessagesBtn")
            ?.addEventListener(
                "click",
                async () => {
                    closeModal("settingsModal");
                    openModal("savedMessagesModal");
                    await loadSavedMessages();
                }
            );


        $("#savedMessagesChat")
            ?.addEventListener(
                "click",
                async () => {
                    openModal("savedMessagesModal");
                    await loadSavedMessages();
                }
            );


        $("#updatesSettingsBtn")
            ?.addEventListener(
                "click",
                () => {
                    closeModal("settingsModal");
                    openModal("updatesModal");
                }
            );


        $("#ownerPanelButton")
            ?.addEventListener(
                "click",
                () => {
                    closeModal("settingsModal");
                    openModal("ownerModal");
                }
            );


        $("#adminPanelButton")
            ?.addEventListener(
                "click",
                () => {
                    closeModal("settingsModal");
                    openModal("adminModal");
                }
            );


        $("#settingsLogoutBtn")
            ?.addEventListener(
                "click",
                logout
            );


        $("#logoutBtn")
            ?.addEventListener(
                "click",
                logout
            );


        $("#deleteAccountBtn")
            ?.addEventListener(
                "click",
                () => {
                    closeModal("settingsModal");
                    openModal("deleteAccountModal");
                }
            );


        $("#confirmDeleteAccountBtn")
            ?.addEventListener(
                "click",
                deleteAccount
            );


        /* PROFILE */

        $("#myProfileCard")
            ?.addEventListener(
                "click",
                () => {
                    fillProfileForm();
                    openModal("profileModal");
                }
            );


        $("#profileForm")
            ?.addEventListener(
                "submit",
                saveProfile
            );


        $("#profileAvatarInput")
            ?.addEventListener(
                "change",
                changeProfileAvatar
            );


        $("#savePrivacyBtn")
            ?.addEventListener(
                "click",
                savePrivacy
            );


        /* CONTACT */

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


        /* MESSAGE */

        $("#messageForm")
            ?.addEventListener(
                "submit",
                sendMessage
            );


        $("#imageBtn")
            ?.addEventListener(
                "click",
                () => $("#imageInput")?.click()
            );


        $("#imageInput")
            ?.addEventListener(
                "change",
                sendImage
            );


        $("#emojiBtn")
            ?.addEventListener(
                "click",
                () => togglePanel("emojiPanel")
            );


        $("#stickerBtn")
            ?.addEventListener(
                "click",
                () => togglePanel("stickerPanel")
            );


        /* GROUP */

        $("#createGroupBtn")
            ?.addEventListener(
                "click",
                () => openModal("createGroupModal")
            );


        $("#groupForm")
            ?.addEventListener(
                "submit",
                createGroup
            );


        $("#joinGroupOpenBtn")
            ?.addEventListener(
                "click",
                () => openModal("joinGroupModal")
            );


        $("#joinGroupBtn")
            ?.addEventListener(
                "click",
                joinGroup
            );


        $("#groupInviteBtn")
            ?.addEventListener(
                "click",
                () => createInvite("group")
            );


        $("#groupMembersBtn")
            ?.addEventListener(
                "click",
                loadGroupMembers
            );


        $("#leaveGroupBtn")
            ?.addEventListener(
                "click",
                leaveGroup
            );


        /* CHANNEL */

        $("#createChannelBtn")
            ?.addEventListener(
                "click",
                () => openModal("createChannelModal")
            );


        $("#channelForm")
            ?.addEventListener(
                "submit",
                createChannel
            );


        $("#joinChannelOpenBtn")
            ?.addEventListener(
                "click",
                () => openModal("joinChannelModal")
            );


        $("#joinChannelBtn")
            ?.addEventListener(
                "click",
                joinChannel
            );


        $("#channelInviteBtn")
            ?.addEventListener(
                "click",
                () => createInvite("channel")
            );


        $("#channelMembersBtn")
            ?.addEventListener(
                "click",
                loadChannelMembers
            );


        $("#leaveChannelBtn")
            ?.addEventListener(
                "click",
                leaveChannel
            );


        /* USER PROFILE */

        $("#chatAvatarButton")
            ?.addEventListener(
                "click",
                () => {
                    if (
                        state.currentOtherUser
                    ) {
                        openUserProfile(
                            state.currentOtherUser
                        );
                    }

                    if (
                        state.currentGroup
                    ) {
                        showGroupInfo(
                            state.currentGroup
                        );
                    }

                    if (
                        state.currentChannel
                    ) {
                        showChannelInfo(
                            state.currentChannel
                        );
                    }
                }
            );


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
                            ? "flex"
                            : "none";
                }
            );


        $("#editNicknameBtn")
            ?.addEventListener(
                "click",
                () => {
                    $("#userProfileMenu").style.display =
                        "none";

                    $("#nicknameInput").value =
                        "";

                    openModal("nicknameModal");
                }
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


        $("#saveNicknameBtn")
            ?.addEventListener(
                "click",
                saveNickname
            );


        $("#removeNicknameBtnModal")
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
                openReport
            );


        $("#submitReportBtn")
            ?.addEventListener(
                "click",
                submitReport
            );


        /* SEARCH */

        $("#clearSearchBtn")
            ?.addEventListener(
                "click",
                async () => {
                    $("#searchInput").value = "";
                    $("#clearSearchBtn").style.display =
                        "none";

                    await restoreSidebarLists();
                }
            );


        /* OWNER */

        $("#ownerVerifiedSearchBtn")
            ?.addEventListener(
                "click",
                searchVerifiedUser
            );


        /* THEME */

        $$(".appearance-option[data-theme]")
            .forEach(button => {
                button.addEventListener(
                    "click",
                    () =>
                        applyTheme(
                            button.dataset.theme
                        )
                );
            });


        $$(".appearance-option[data-density]")
            .forEach(button => {
                button.addEventListener(
                    "click",
                    () =>
                        applyDensity(
                            button.dataset.density
                        )
                );
            });


        $$(".language-option")
            .forEach(button => {
                button.addEventListener(
                    "click",
                    () =>
                        applyLanguage(
                            button.dataset.language
                        )
                );
            });


        /* MODAL CLOSE */

        $$("[data-close-modal]")
            .forEach(button => {
                button.addEventListener(
                    "click",
                    () => {
                        closeModal(
                            button.dataset.closeModal
                        );
                    }
                );
            });


        /* BACKDROP */

        $$(".modal")
            .forEach(modal => {
                modal.addEventListener(
                    "click",
                    event => {
                        if (
                            event.target ===
                            modal
                        ) {
                            modal.classList.remove(
                                "open"
                            );

                            modal.style.display =
                                "none";
                        }
                    }
                );
            });


        /* ESCAPE */

        document.addEventListener(
            "keydown",
            event => {
                if (event.key === "Escape") {
                    closeAllModals();
                }
            }
        );


        /* MOBILE BACK */

        const mobileBack =
            $("#mobileBackBtn");

        mobileBack?.addEventListener(
            "click",
            () => {
                $(".sidebar")
                    ?.classList.remove(
                        "mobile-hidden"
                    );

                $(".chat-area")
                    ?.classList.remove(
                        "mobile-active"
                    );
            }
        );
    }


    /* =========================================================
       INIT
       ========================================================= */

    async function init() {
        try {
            state.user =
                await getCurrentUser();

            if (!state.user) {
                window.location.href =
                    "index.html";
                return;
            }


            await loadMyProfile();

            if (!state.profile) {
                showToast(
                    "Profile not found.",
                    "error"
                );
                return;
            }


            renderMyProfile();

            applyTheme(state.theme);
            applyDensity(state.density);
            applyLanguage(state.language);

            setupEvents();
            setupTabs();
            setupSearch();

            setupEmojiPanel();
            setupStickerPanel();

            await refreshAll();

            await setupOwnerUI();

            setupRealtime();

            showEmptyChat();

            console.log(
                "MegChatBox dashboard initialized."
            );

        } catch (error) {
            console.error(
                "Dashboard initialization error:",
                error
            );

            showToast(
                "Dashboard failed to initialize.",
                "error"
            );
        }
    }


    /* =========================================================
       START
       ========================================================= */

    init();

})();
