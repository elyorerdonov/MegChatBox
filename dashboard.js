const supabase = supabaseClient;

let currentUser = null;
let currentProfile = null;
let selectedUser = null;
let currentTab = "chats";
let currentLanguage = localStorage.getItem("msgboxLanguage") || "en";

let messageChannel = null;
let contactChannel = null;


/* =========================================================
   TRANSLATIONS
========================================================= */

const translations = {

    en: {
        chats: "Chats",
        groups: "Groups",
        channels: "Channels",
        searchToChat: "Search for a user to start chatting",
        createGroup: "Create Group",
        createChannel: "Create Channel",
        logout: "Logout",
        settings: "Settings",
        profile: "Profile",
        profileDescription: "Name, username, bio and avatar",
        privacy: "Privacy",
        privacyDescription: "Privacy and account settings",
        appearance: "Appearance",
        appearanceDescription: "Customize MsgBox",
        language: "Language",
        ownerPanel: "Owner Panel",
        ownerPanelDescription: "Manage MsgBox",
        adminPanel: "Admin Panel",
        adminPanelDescription: "Moderation tools",
        addContact: "Add Contact",
        accept: "Accept",
        decline: "Decline",
        welcome: "Welcome to MsgBox",
        verified: "Verified",
        users: "Users",
        admins: "Admins",
        reports: "Reports",
        verifiedBadge: "Verified Badge",
        verifiedDescription: "Give or remove the verified badge.",
        duration: "Duration",
        userControl: "User Control",
        administrators: "Administrators",
        noReports: "No reports yet.",
        searchUsername: "Search username...",
        typeMessage: "Type a message...",
        online: "Online",
        offline: "Offline",
        contactAccepted: "Contact accepted",
        requestSent: "Contact request sent",
        requestDeclined: "Contact request declined",
        noUser: "User not found",
        image: "Image",
        edited: "edited",
        deletedMessage: "Message deleted",
        saveChanges: "Save Changes",
        changePhoto: "Change photo"
    },

    uz: {
        chats: "Chatlar",
        groups: "Guruhlar",
        channels: "Kanallar",
        searchToChat: "Suhbatni boshlash uchun foydalanuvchini qidiring",
        createGroup: "Guruh yaratish",
        createChannel: "Kanal yaratish",
        logout: "Chiqish",
        settings: "Sozlamalar",
        profile: "Profil",
        profileDescription: "Ism, username, bio va avatar",
        privacy: "Maxfiylik",
        privacyDescription: "Maxfiylik va akkaunt sozlamalari",
        appearance: "Ko‘rinish",
        appearanceDescription: "MsgBox ko‘rinishini sozlash",
        language: "Til",
        ownerPanel: "Owner Panel",
        ownerPanelDescription: "MsgBox boshqaruvi",
        adminPanel: "Admin Panel",
        adminPanelDescription: "Moderatsiya vositalari",
        addContact: "Kontakt qo‘shish",
        accept: "Qabul qilish",
        decline: "Rad etish",
        welcome: "MsgBox'ga xush kelibsiz",
        verified: "Tasdiqlangan",
        users: "Foydalanuvchilar",
        admins: "Adminlar",
        reports: "Shikoyatlar",
        verifiedBadge: "Tasdiqlangan belgi",
        verifiedDescription: "Tasdiqlangan belgini berish yoki olib tashlash.",
        duration: "Muddat",
        userControl: "Foydalanuvchi nazorati",
        administrators: "Administratorlar",
        noReports: "Hozircha shikoyatlar yo‘q.",
        searchUsername: "Username qidiring...",
        typeMessage: "Xabar yozing...",
        online: "Online",
        offline: "Offline",
        contactAccepted: "Kontakt qabul qilindi",
        requestSent: "Kontakt so‘rovi yuborildi",
        requestDeclined: "Kontakt so‘rovi rad etildi",
        noUser: "Foydalanuvchi topilmadi",
        image: "Rasm",
        edited: "tahrirlangan",
        deletedMessage: "Xabar o‘chirildi",
        saveChanges: "Saqlash",
        changePhoto: "Rasmni almashtirish"
    },

    ru: {
        chats: "Чаты",
        groups: "Группы",
        channels: "Каналы",
        searchToChat: "Найдите пользователя, чтобы начать чат",
        createGroup: "Создать группу",
        createChannel: "Создать канал",
        logout: "Выйти",
        settings: "Настройки",
        profile: "Профиль",
        profileDescription: "Имя, username, биография и аватар",
        privacy: "Конфиденциальность",
        privacyDescription: "Настройки конфиденциальности и аккаунта",
        appearance: "Внешний вид",
        appearanceDescription: "Настройка MsgBox",
        language: "Язык",
        ownerPanel: "Панель владельца",
        ownerPanelDescription: "Управление MsgBox",
        adminPanel: "Панель администратора",
        adminPanelDescription: "Инструменты модерации",
        addContact: "Добавить контакт",
        accept: "Принять",
        decline: "Отклонить",
        welcome: "Добро пожаловать в MsgBox",
        verified: "Подтверждён",
        users: "Пользователи",
        admins: "Администраторы",
        reports: "Жалобы",
        verifiedBadge: "Подтверждённый значок",
        verifiedDescription: "Выдать или убрать подтверждённый значок.",
        duration: "Срок",
        userControl: "Управление пользователем",
        administrators: "Администраторы",
        noReports: "Жалоб пока нет.",
        searchUsername: "Поиск username...",
        typeMessage: "Введите сообщение...",
        online: "Онлайн",
        offline: "Оффлайн",
        contactAccepted: "Контакт принят",
        requestSent: "Запрос отправлен",
        requestDeclined: "Запрос отклонён",
        noUser: "Пользователь не найден",
        image: "Изображение",
        edited: "изменено",
        deletedMessage: "Сообщение удалено",
        saveChanges: "Сохранить",
        changePhoto: "Изменить фото"
    }
};


function t(key) {
    return translations[currentLanguage]?.[key]
        || translations.en[key]
        || key;
}


/* =========================================================
   HELPERS
========================================================= */

function $(id) {
    return document.getElementById(id);
}


function showToast(message) {
    const toast = $("toast");

    if (!toast) return;

    toast.textContent = message;
    toast.classList.add("show");

    setTimeout(() => {
        toast.classList.remove("show");
    }, 2500);
}


function openModal(id) {
    const modal = $(id);

    if (modal) {
        modal.classList.add("active");
    }
}


function closeModal(id) {
    const modal = $(id);

    if (modal) {
        modal.classList.remove("active");
    }
}


function getInitial(name) {
    return (name || "?").trim().charAt(0).toUpperCase();
}


function escapeHtml(value) {

    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}


/* =========================================================
   LANGUAGE
========================================================= */

function applyLanguage() {

    document.documentElement.lang = currentLanguage;

    document.querySelectorAll("[data-i18n]").forEach(element => {

        const key = element.dataset.i18n;

        if (translations[currentLanguage]?.[key]) {
            element.textContent = translations[currentLanguage][key];
        }

    });


    $("searchInput")?.setAttribute(
        "placeholder",
        t("searchUsername")
    );

    $("messageInput")?.setAttribute(
        "placeholder",
        t("typeMessage")
    );


    $("currentLanguageText").textContent =
        currentLanguage === "en"
            ? "English"
            : currentLanguage === "uz"
                ? "O‘zbek"
                : "Русский";


    document.querySelectorAll(".language-check").forEach(check => {
        check.style.display =
            check.dataset.check === currentLanguage
                ? "block"
                : "none";
    });
}


function setLanguage(language) {

    if (!translations[language]) return;

    currentLanguage = language;

    localStorage.setItem(
        "msgboxLanguage",
        language
    );

    applyLanguage();

    closeModal("languageModal");

    showToast(
        language === "uz"
            ? "Til o‘zgartirildi"
            : language === "ru"
                ? "Язык изменён"
                : "Language changed"
    );
}


/* =========================================================
   AUTH
========================================================= */

async function loadSession() {

    const { data, error } =
        await supabase.auth.getSession();

    if (error || !data.session) {
        window.location.href = "index.html";
        return false;
    }

    currentUser = data.session.user;

    return true;
}


/* =========================================================
   PROFILE
========================================================= */

async function loadMyProfile() {

    const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", currentUser.id)
        .single();

    if (error || !data) {

        console.error("Profile error:", error);

        showToast("Profile could not be loaded");

        return false;
    }

    currentProfile = data;

    renderMyProfile();
    setupRoleUI();

    return true;
}


function renderMyProfile() {

    if (!currentProfile) return;

    $("myName").textContent =
        currentProfile.full_name || "User";

    $("myUsername").textContent =
        "@" + (currentProfile.username || "");

    $("myAvatar").textContent =
        getInitial(currentProfile.full_name);


    if (currentProfile.avatar_url) {

        $("myAvatar").style.backgroundImage =
            `url("${currentProfile.avatar_url}")`;

        $("myAvatar").style.backgroundSize = "cover";
        $("myAvatar").style.backgroundPosition = "center";
        $("myAvatar").textContent = "";

    } else {

        $("myAvatar").style.backgroundImage = "";
    }


    $("myVerified").style.display =
        currentProfile.is_verified === true
            ? "inline-flex"
            : "none";
}


function setupRoleUI() {

    const isOwner =
        currentProfile?.role === "owner";

    const isAdmin =
        currentProfile?.role === "admin";


    $("ownerPanelButton").style.display =
        isOwner
            ? "flex"
            : "none";


    $("adminPanelButton").style.display =
        isOwner || isAdmin
            ? "flex"
            : "none";


    $("createGroupBtn").style.display =
        isOwner || isAdmin
            ? "flex"
            : "flex";


    $("createChannelBtn").style.display =
        isOwner || isAdmin
            ? "flex"
            : "flex";
}


/* =========================================================
   BLOCK CHECK
========================================================= */

function isBlocked(profile) {

    if (!profile) return false;

    if (profile.account_blocked === true) {
        return true;
    }

    if (
        profile.account_blocked_until &&
        new Date(profile.account_blocked_until) > new Date()
    ) {
        return true;
    }

    return false;
}


function isMessagingBlocked(profile) {

    if (!profile) return false;

    if (profile.messaging_blocked === true) {
        return true;
    }

    if (
        profile.messaging_blocked_until &&
        new Date(profile.messaging_blocked_until) > new Date()
    ) {
        return true;
    }

    return false;
}


/* =========================================================
   SEARCH USERS
========================================================= */

let searchTimer = null;

function setupSearch() {

    $("searchInput").addEventListener(
        "input",
        () => {

            clearTimeout(searchTimer);

            const username =
                $("searchInput").value
                    .trim()
                    .toLowerCase();

            if (!username) {

                loadDefaultList();

                return;
            }

            searchTimer = setTimeout(
                () => searchUsers(username),
                300
            );
        }
    );
}


async function searchUsers(username) {

    const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .ilike("username", username)
        .limit(10);

    if (error) {

        console.error(error);

        showToast("Search failed");

        return;
    }


    renderUserResults(data || []);
}


function renderUserResults(users) {

    const list = $("userList");

    list.innerHTML = "";


    if (!users.length) {

        list.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-user-slash"></i>
                <p>${escapeHtml(t("noUser"))}</p>
            </div>
        `;

        return;
    }


    users.forEach(user => {

        if (user.id === currentUser.id) return;

        const item = document.createElement("div");

        item.className = "chat-item";

        item.innerHTML = `
            <div class="profile-avatar">
                ${escapeHtml(getInitial(user.full_name))}
            </div>

            <div class="chat-item-info">
                <h3>
                    ${escapeHtml(user.full_name)}

                    ${
                        user.is_verified
                            ? `<span class="verified-badge">✓</span>`
                            : ""
                    }
                </h3>

                <p>@${escapeHtml(user.username)}</p>
            </div>
        `;

        item.addEventListener(
            "click",
            () => openUserChat(user)
        );

        list.appendChild(item);
    });
}


/* =========================================================
   CONTACTS
========================================================= */

async function loadDefaultList() {

    if (!currentUser) return;

    if (currentTab !== "chats") {

        if (currentTab === "groups") {
            await loadGroups();
        }

        if (currentTab === "channels") {
            await loadChannels();
        }

        return;
    }


    const { data, error } = await supabase
        .from("contact_requests")
        .select("*")
        .eq("status", "accepted")
        .or(
            `sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`
        );


    if (error) {

        console.error(error);

        renderUserResults([]);

        return;
    }


    const ids = (data || []).map(request => {

        return request.sender_id === currentUser.id
            ? request.receiver_id
            : request.sender_id;

    });


    if (!ids.length) {

        $("userList").innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-comments"></i>
                <p>${escapeHtml(t("searchToChat"))}</p>
            </div>
        `;

        return;
    }


    const { data: users } = await supabase
        .from("profiles")
        .select("*")
        .in("id", ids);


    renderUserResults(users || []);
}


/* =========================================================
   OPEN USER CHAT
========================================================= */

async function openUserChat(user) {

    if (!user) return;

    selectedUser = user;

    $("chatName").textContent =
        user.full_name || user.username;

    $("chatStatus").textContent =
        user.last_seen
            ? t("offline")
            : t("offline");


    $("chatAvatar").textContent =
        getInitial(user.full_name);


    $("chatVerified").style.display =
        user.is_verified
            ? "inline-flex"
            : "none";


    $("messages").innerHTML = "";


    document.querySelector(".app")
        ?.classList.add("chat-open");


    await updateContactActions();

    await loadMessages();

    updateMessageInputState();
}


/* =========================================================
   CONTACT ACTIONS
========================================================= */

async function getContactRequest() {

    if (!selectedUser) return null;

    const { data } = await supabase
        .from("contact_requests")
        .select("*")
        .or(
            `and(sender_id.eq.${currentUser.id},receiver_id.eq.${selectedUser.id}),and(sender_id.eq.${selectedUser.id},receiver_id.eq.${currentUser.id})`
        )
        .order("created_at", {
            ascending: false
        })
        .limit(1);

    return data?.[0] || null;
}


async function updateContactActions() {

    const addBtn = $("addContactBtn");
    const acceptBtn = $("acceptContactBtn");
    const declineBtn = $("declineContactBtn");

    addBtn.style.display = "none";
    acceptBtn.style.display = "none";
    declineBtn.style.display = "none";


    if (!selectedUser) return;


    const request = await getContactRequest();


    if (!request) {

        addBtn.style.display = "inline-flex";

        $("chatStatus").textContent =
            "Not a contact";

        return;
    }


    if (request.status === "accepted") {

        $("chatStatus").textContent =
            t("online");

        return;
    }


    if (request.status === "pending") {

        if (request.receiver_id === currentUser.id) {

            acceptBtn.style.display = "inline-flex";
            declineBtn.style.display = "inline-flex";

            $("chatStatus").textContent =
                "Incoming contact request";

        } else {

            $("chatStatus").textContent =
                "Contact request pending";
        }

        return;
    }


    if (request.status === "declined") {

        addBtn.style.display = "inline-flex";

        return;
    }
}


async function sendContactRequest() {

    if (!selectedUser) return;


    const { error } = await supabase
        .from("contact_requests")
        .insert({
            sender_id: currentUser.id,
            receiver_id: selectedUser.id,
            status: "pending"
        });


    if (error) {

        console.error(error);

        if (error.code === "23505") {
            showToast("Request already exists");
        } else {
            showToast(error.message);
        }

        return;
    }


    showToast(t("requestSent"));

    await updateContactActions();
}


async function updateContactRequest(status) {

    if (!selectedUser) return;


    const request = await getContactRequest();

    if (!request) return;


    const { error } = await supabase
        .from("contact_requests")
        .update({ status })
        .eq("id", request.id)
        .eq("receiver_id", currentUser.id);


    if (error) {

        console.error(error);

        showToast(error.message);

        return;
    }


    showToast(
        status === "accepted"
            ? t("contactAccepted")
            : t("requestDeclined")
    );


    await updateContactActions();

    await loadDefaultList();

    updateMessageInputState();
}


/* =========================================================
   MESSAGE STATE
========================================================= */

async function isAcceptedContact() {

    if (!selectedUser) return false;

    const request = await getContactRequest();

    return request?.status === "accepted";
}


function updateMessageInputState() {

    const enabled =
        selectedUser &&
        currentProfile &&
        !isMessagingBlocked(currentProfile);


    const messageInput = $("messageInput");
    const sendButton = $("sendButton");
    const imageBtn = $("imageBtn");
    const emojiBtn = $("emojiBtn");
    const stickerBtn = $("stickerBtn");


    if (!enabled) {

        messageInput.disabled = true;
        sendButton.disabled = true;
        imageBtn.disabled = true;
        emojiBtn.disabled = true;
        stickerBtn.disabled = true;

        return;
    }


    isAcceptedContact().then(accepted => {

        messageInput.disabled = !accepted;
        sendButton.disabled = !accepted;
        imageBtn.disabled = !accepted;
        emojiBtn.disabled = !accepted;
        stickerBtn.disabled = !accepted;

    });
}


/* =========================================================
   LOAD MESSAGES
========================================================= */

async function loadMessages() {

    if (!selectedUser) return;

    const accepted = await isAcceptedContact();

    if (!accepted) {

        $("messages").innerHTML = `
            <div class="welcome-message">
                <div class="welcome-icon">
                    <i class="fa-solid fa-user-lock"></i>
                </div>

                <h2>Contact required</h2>

                <p>
                    Accept the contact request before chatting.
                </p>
            </div>
        `;

        return;
    }


    const { data, error } = await supabase
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

        showToast(error.message);

        return;
    }


    renderMessages(data || []);

    markMessagesDelivered();
    markMessagesSeen();
}


function renderMessages(messages) {

    const container = $("messages");

    container.innerHTML = "";


    if (!messages.length) {

        container.innerHTML = `
            <div class="welcome-message">
                <div class="welcome-icon">
                    <i class="fa-solid fa-comments"></i>
                </div>

                <h2>${escapeHtml(selectedUser.full_name)}</h2>

                <p>Start your conversation.</p>
            </div>
        `;

        return;
    }


    messages.forEach(message => {

        const wrapper = document.createElement("div");

        wrapper.className =
            message.sender_id === currentUser.id
                ? "message sent"
                : "message received";


        if (message.deleted_at) {

            wrapper.innerHTML = `
                <div class="message-bubble deleted">
                    ${escapeHtml(t("deletedMessage"))}
                </div>
            `;

        } else if (message.message_type === "image") {

            wrapper.innerHTML = `
                <div class="message-bubble">
                    <div class="message-image">
                        ${escapeHtml(t("image"))}
                    </div>
                    ${renderMessageMeta(message)}
                </div>
            `;

        } else {

            wrapper.innerHTML = `
                <div class="message-bubble">

                    <div class="message-content">
                        ${escapeHtml(message.content)}
                    </div>

                    ${renderMessageMeta(message)}

                </div>
            `;

        }


        if (
            message.sender_id === currentUser.id &&
            !message.deleted_at
        ) {

            wrapper.addEventListener(
                "contextmenu",
                event => {

                    event.preventDefault();

                    showMessageMenu(message);
                }
            );
        }


        container.appendChild(wrapper);
    });


    container.scrollTop =
        container.scrollHeight;
}


function renderMessageMeta(message) {

    const time = new Date(
        message.created_at
    ).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit"
    });


    let status = "";

    if (message.sender_id === currentUser.id) {

        if (message.seen_at) {
            status = " ✓✓";
        } else if (message.delivered_at) {
            status = " ✓";
        } else {
            status = " ✓";
        }
    }


    const edited =
        message.edited_at
            ? ` · ${escapeHtml(t("edited"))}`
            : "";


    return `
        <div class="message-meta">
            ${time}${edited}${status}
        </div>
    `;
}


/* =========================================================
   SEND MESSAGE
========================================================= */

async function sendMessage(content) {

    if (!selectedUser) return;

    const accepted = await isAcceptedContact();

    if (!accepted) return;


    if (isMessagingBlocked(currentProfile)) {

        showToast("Messaging is blocked");

        return;
    }


    const text = content.trim();

    if (!text) return;


    const { error } = await supabase
        .from("messages")
        .insert({
            sender_id: currentUser.id,
            receiver_id: selectedUser.id,
            content: text,
            message_type: "text"
        });


    if (error) {

        console.error(error);

        showToast(error.message);

        return;
    }


    $("messageInput").value = "";

    await loadMessages();
}


/* =========================================================
   IMAGE
========================================================= */

async function sendImage(file) {

    if (!file || !selectedUser) return;

    const accepted = await isAcceptedContact();

    if (!accepted) return;


    const extension =
        file.name.split(".").pop() || "jpg";


    const path =
        `${currentUser.id}/${crypto.randomUUID()}.${extension}`;


    const { error: uploadError } =
        await supabase.storage
            .from("chat-media")
            .upload(path, file);


    if (uploadError) {

        console.error(uploadError);

        showToast(uploadError.message);

        return;
    }


    const { error } = await supabase
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

        showToast(error.message);

        return;
    }


    await loadMessages();
}


/* =========================================================
   MESSAGE EDIT / DELETE
========================================================= */

async function showMessageMenu(message) {

    const action = prompt(
        "Type E to edit or D to delete"
    );

    if (!action) return;


    if (action.toLowerCase() === "e") {

        const newText = prompt(
            "New message:",
            message.content
        );

        if (!newText?.trim()) return;


        const { error } = await supabase.rpc(
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


        await loadMessages();

        return;
    }


    if (action.toLowerCase() === "d") {

        const confirmed =
            confirm("Delete this message?");

        if (!confirmed) return;


        const { error } = await supabase.rpc(
            "delete_message",
            {
                p_message_id: message.id
            }
        );


        if (error) {

            console.error(error);

            showToast(error.message);

            return;
        }


        await loadMessages();
    }
}


/* =========================================================
   DELIVERED / SEEN
========================================================= */

async function markMessagesDelivered() {

    if (!selectedUser) return;

    try {

        await supabase.rpc(
            "mark_messages_delivered",
            {
                p_other_user_id: selectedUser.id
            }
        );

    } catch (error) {

        console.error(error);
    }
}


async function markMessagesSeen() {

    if (!selectedUser) return;

    try {

        await supabase.rpc(
            "mark_chat_seen",
            {
                p_other_user_id: selectedUser.id
            }
        );

    } catch (error) {

        console.error(error);
    }
}


/* =========================================================
   EMOJI
========================================================= */

function setupEmoji() {

    $("emojiBtn").addEventListener(
        "click",
        () => {

            $("emojiPanel").classList.toggle(
                "active"
            );
        }
    );


    document.querySelectorAll(
        "#emojiPanel button"
    ).forEach(button => {

        button.addEventListener(
            "click",
            () => {

                $("messageInput").value +=
                    button.textContent;

                $("messageInput").focus();
            }
        );
    });
}


/* =========================================================
   PROFILE MODAL
========================================================= */

function openProfileSettings() {

    if (!currentProfile) return;


    $("profileFullName").value =
        currentProfile.full_name || "";

    $("profileUsername").value =
        currentProfile.username || "";

    $("profileBio").value =
        currentProfile.bio || "";


    $("profileEditAvatar").textContent =
        getInitial(currentProfile.full_name);


    openModal("profileModal");
}


async function uploadAvatar(file) {

    if (!file || !currentUser) return null;


    const extension =
        file.name.split(".").pop() || "jpg";


    const path =
        `${currentUser.id}/avatar.${extension}`;


    const { error } =
        await supabase.storage
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


    const { data } =
        supabase.storage
            .from("avatars")
            .getPublicUrl(path);


    return data.publicUrl;
}


async function saveProfile(event) {

    event.preventDefault();


    const fullName =
        $("profileFullName").value.trim();

    const username =
        $("profileUsername").value
            .trim()
            .toLowerCase();

    const bio =
        $("profileBio").value.trim();


    if (!fullName || !username) {

        showToast("Name and username are required");

        return;
    }


    if (!/^[a-z0-9_]{3,32}$/.test(username)) {

        showToast(
            "Username must contain only a-z, 0-9 and _"
        );

        return;
    }


    let avatarUrl =
        currentProfile.avatar_url || null;


    const file =
        $("profileAvatarInput").files?.[0];


    if (file) {

        const uploaded =
            await uploadAvatar(file);

        if (uploaded) {
            avatarUrl = uploaded;
        }
    }


    const { data, error } = await supabase
        .from("profiles")
        .update({

            full_name: fullName,
            username,
            bio,
            avatar_url: avatarUrl

        })
        .eq("id", currentUser.id)
        .select()
        .single();


    if (error) {

        console.error(error);

        if (error.code === "23505") {
            showToast("Username already exists");
        } else {
            showToast(error.message);
        }

        return;
    }


    currentProfile = data;

    renderMyProfile();

    closeModal("profileModal");

    showToast(
        currentLanguage === "uz"
            ? "Profil saqlandi"
            : currentLanguage === "ru"
                ? "Профиль сохранён"
                : "Profile saved"
    );
}


/* =========================================================
   OWNER PANEL
========================================================= */

async function searchOwnerUser(inputId, resultId) {

    const username =
        $(inputId).value.trim().toLowerCase();


    if (!username) return null;


    const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("username", username)
        .maybeSingle();


    if (error) {

        console.error(error);

        showToast(error.message);

        return null;
    }


    if (!data) {

        $(resultId).innerHTML = `
            <div class="empty-state">
                ${escapeHtml(t("noUser"))}
            </div>
        `;

        return null;
    }


    return data;
}


async function ownerVerifiedSearch() {

    if (currentProfile?.role !== "owner") return;


    const user = await searchOwnerUser(
        "ownerVerifiedUsername",
        "ownerVerifiedResult"
    );


    if (!user) return;


    $("ownerVerifiedResult").innerHTML = `

        <div class="owner-user-card">

            <div>
                <strong>
                    ${escapeHtml(user.full_name)}
                </strong>

                <span>
                    @${escapeHtml(user.username)}
                </span>
            </div>

            <button id="ownerVerifyAction">
                ${
                    user.is_verified
                        ? "Remove"
                        : "Verify"
                }
            </button>

        </div>
    `;


    $("ownerVerifyAction")
        .addEventListener(
            "click",
            () => ownerToggleVerified(user)
        );
}


async function ownerToggleVerified(user) {

    const isVerified =
        user.is_verified === true;


    let duration = null;


    if (!isVerified) {

        const selected =
            $("verifiedDuration").value;

        duration =
            selected === "permanent"
                ? null
                : Number(selected);
    }


    const { error } = await supabase.rpc(
        "owner_set_verified",
        {
            target_user_id: user.id,
            give_verified: !isVerified,
            duration_days: duration
        }
    );


    if (error) {

        console.error(error);

        showToast(error.message);

        return;
    }


    showToast(
        !isVerified
            ? "Verified badge added"
            : "Verified badge removed"
    );


    await ownerVerifiedSearch();
}


/* =========================================================
   OWNER MODERATION
========================================================= */

async function ownerModerationSearch() {

    if (
        currentProfile?.role !== "owner" &&
        currentProfile?.role !== "admin"
    ) return;


    const user = await searchOwnerUser(
        "ownerModerationUsername",
        "ownerModerationResult"
    );


    if (!user) return;


    const isOwner =
        user.role === "owner";


    $("ownerModerationResult").innerHTML = `

        <div class="owner-user-card">

            <div>
                <strong>
                    ${escapeHtml(user.full_name)}
                </strong>

                <span>
                    @${escapeHtml(user.username)}
                </span>
            </div>

            <div class="moderation-actions">

                <button
                    id="blockAccountBtn"
                    ${isOwner ? "disabled" : ""}
                >
                    Block Account
                </button>

                <button
                    id="blockMessagingBtn"
                    ${isOwner ? "disabled" : ""}
                >
                    Block Messaging
                </button>

                <button
                    id="unblockUserBtn"
                    ${isOwner ? "disabled" : ""}
                >
                    Unblock
                </button>

            </div>

        </div>
    `;


    $("blockAccountBtn")
        .addEventListener(
            "click",
            () => moderateUser(
                user,
                "account",
                true
            )
        );


    $("blockMessagingBtn")
        .addEventListener(
            "click",
            () => moderateUser(
                user,
                "messaging",
                true
            )
        );


    $("unblockUserBtn")
        .addEventListener(
            "click",
            () => moderateUser(
                user,
                "account",
                false
            )
        );
}


async function moderateUser(
    user,
    blockType,
    active
) {

    const reason =
        active
            ? prompt("Reason:")
            : null;


    const { error } = await supabase.rpc(
        "owner_set_user_block",
        {
            target_user_id: user.id,
            block_type: blockType,
            reason_text: reason,
            duration_days: null,
            make_active: active
        }
    );


    if (error) {

        console.error(error);

        showToast(error.message);

        return;
    }


    showToast(
        active
            ? "Restriction applied"
            : "Restriction removed"
    );


    await ownerModerationSearch();
}


/* =========================================================
   OWNER ADMINS
========================================================= */

async function ownerAdminSearch() {

    if (currentProfile?.role !== "owner") return;


    const user = await searchOwnerUser(
        "ownerAdminUsername",
        "ownerAdminResult"
    );


    if (!user) return;


    const isAdmin =
        user.role === "admin";


    $("ownerAdminResult").innerHTML = `

        <div class="owner-user-card">

            <div>
                <strong>
                    ${escapeHtml(user.full_name)}
                </strong>

                <span>
                    @${escapeHtml(user.username)}
                </span>
            </div>

            <button id="ownerAdminAction">
                ${
                    isAdmin
                        ? "Remove Admin"
                        : "Make Admin"
                }
            </button>

        </div>
    `;


    $("ownerAdminAction")
        .addEventListener(
            "click",
            () => ownerToggleAdmin(
                user,
                !isAdmin
            )
        );
}


async function ownerToggleAdmin(
    user,
    makeAdmin
) {

    const { error } = await supabase.rpc(
        "owner_set_admin",
        {
            target_user_id: user.id,
            make_admin: makeAdmin
        }
    );


    if (error) {

        console.error(error);

        showToast(error.message);

        return;
    }


    showToast(
        makeAdmin
            ? "Admin added"
            : "Admin removed"
    );


    await ownerAdminSearch();

    await loadMyProfile();
}


/* =========================================================
   REPORTS
========================================================= */

async function loadReports(targetId) {

    const container =
        $(targetId);

    if (!container) return;


    const { data, error } = await supabase
        .from("reports")
        .select("*")
        .order("created_at", {
            ascending: false
        });


    if (error) {

        console.error(error);

        container.innerHTML = `
            <div class="empty-state">
                ${escapeHtml(error.message)}
            </div>
        `;

        return;
    }


    if (!data?.length) {

        container.innerHTML = `
            <div class="empty-state">
                ${escapeHtml(t("noReports"))}
            </div>
        `;

        return;
    }


    container.innerHTML = "";


    data.forEach(report => {

        const item =
            document.createElement("div");

        item.className = "report-item";


        item.innerHTML = `

            <div>
                <strong>
                    Report #${report.id}
                </strong>

                <p>
                    ${escapeHtml(report.reason)}
                </p>

                <small>
                    ${escapeHtml(report.description || "")}
                </small>
            </div>

            <div>

                <span>
                    ${escapeHtml(report.status)}
                </span>

                <button
                    class="report-review-btn"
                    data-id="${report.id}"
                >
                    Review
                </button>

            </div>
        `;


        container.appendChild(item);
    });


    container
        .querySelectorAll(".report-review-btn")
        .forEach(button => {

            button.addEventListener(
                "click",
                () => updateReport(
                    Number(button.dataset.id)
                )
            );

        });
}


async function updateReport(reportId) {

    const status =
        prompt(
            "Enter status: reviewed or dismissed",
            "reviewed"
        );


    if (
        status !== "reviewed" &&
        status !== "dismissed"
    ) return;


    const { error } = await supabase.rpc(
        "admin_update_report",
        {
            report_id: reportId,
            new_status: status
        }
    );


    if (error) {

        console.error(error);

        showToast(error.message);

        return;
    }


    await loadReports(
        "ownerReportsList"
    );

    showToast("Report updated");
}


/* =========================================================
   GROUPS
========================================================= */

async function createGroup(event) {

    event.preventDefault();


    if (!currentUser) return;


    const name =
        $("groupName").value.trim();

    const username =
        $("groupUsername").value
            .trim()
            .toLowerCase();

    const bio =
        $("groupBio").value.trim();


    if (!name) {

        showToast("Group name is required");

        return;
    }


    if (
        username &&
        !/^[a-z0-9_]{3,32}$/.test(username)
    ) {

        showToast("Invalid group username");

        return;
    }


    const { data, error } = await supabase
        .from("groups")
        .insert({
            owner_id: currentUser.id,
            name,
            username: username || null,
            bio
        })
        .select()
        .single();


    if (error) {

        console.error(error);

        showToast(error.message);

        return;
    }


    const { error: memberError } =
        await supabase
            .from("group_members")
            .insert({
                group_id: data.id,
                user_id: currentUser.id,
                role: "owner"
            });


    if (memberError) {

        console.error(memberError);

        showToast(memberError.message);

        return;
    }


    closeModal("createGroupModal");

    $("groupForm").reset();

    showToast("Group created");

    await loadGroups();
}


/* =========================================================
   CHANNELS
========================================================= */

async function createChannel(event) {

    event.preventDefault();


    if (!currentUser) return;


    const name =
        $("channelName").value.trim();

    const username =
        $("channelUsername").value
            .trim()
            .toLowerCase();

    const bio =
        $("channelBio").value.trim();


    if (!name) {

        showToast("Channel name is required");

        return;
    }


    if (
        username &&
        !/^[a-z0-9_]{3,32}$/.test(username)
    ) {

        showToast("Invalid channel username");

        return;
    }


    const { data, error } = await supabase
        .from("channels")
        .insert({
            owner_id: currentUser.id,
            name,
            username: username || null,
            bio
        })
        .select()
        .single();


    if (error) {

        console.error(error);

        showToast(error.message);

        return;
    }


    const { error: memberError } =
        await supabase
            .from("channel_members")
            .insert({
                channel_id: data.id,
                user_id: currentUser.id,
                role: "owner"
            });


    if (memberError) {

        console.error(memberError);

        showToast(memberError.message);

        return;
    }


    closeModal("createChannelModal");

    $("channelForm").reset();

    showToast("Channel created");

    await loadChannels();
}


/* =========================================================
   GROUP LIST
========================================================= */

async function loadGroups() {

    const { data, error } = await supabase
        .from("groups")
        .select("*")
        .order("created_at", {
            ascending: false
        });


    if (error) {

        console.error(error);

        return;
    }


    const list = $("userList");

    list.innerHTML = "";


    if (!data?.length) {

        list.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-users"></i>
                <p>No groups yet.</p>
            </div>
        `;

        return;
    }


    data.forEach(group => {

        const item =
            document.createElement("div");

        item.className = "chat-item";


        item.innerHTML = `
            <div class="profile-avatar">
                ${escapeHtml(
                    getInitial(group.name)
                )}
            </div>

            <div class="chat-item-info">

                <h3>
                    ${escapeHtml(group.name)}
                </h3>

                <p>
                    ${
                        group.username
                            ? "@" + escapeHtml(group.username)
                            : "Group"
                    }
                </p>

            </div>
        `;


        item.addEventListener(
            "click",
            () => {

                showToast(
                    "Group chat will be connected next"
                );

            }
        );


        list.appendChild(item);
    });
}


/* =========================================================
   CHANNEL LIST
========================================================= */

async function loadChannels() {

    const { data, error } = await supabase
        .from("channels")
        .select("*")
        .order("created_at", {
            ascending: false
        });


    if (error) {

        console.error(error);

        return;
    }


    const list = $("userList");

    list.innerHTML = "";


    if (!data?.length) {

        list.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-bullhorn"></i>
                <p>No channels yet.</p>
            </div>
        `;

        return;
    }


    data.forEach(channel => {

        const item =
            document.createElement("div");

        item.className = "chat-item";


        item.innerHTML = `
            <div class="profile-avatar">
                ${escapeHtml(
                    getInitial(channel.name)
                )}
            </div>

            <div class="chat-item-info">

                <h3>
                    ${escapeHtml(channel.name)}
                </h3>

                <p>
                    ${
                        channel.username
                            ? "@" + escapeHtml(channel.username)
                            : "Channel"
                    }
                </p>

            </div>
        `;


        item.addEventListener(
            "click",
            () => {

                showToast(
                    "Channel chat will be connected next"
                );

            }
        );


        list.appendChild(item);
    });
}


/* =========================================================
   TABS
========================================================= */

function setupTabs() {

    document.querySelectorAll(
        ".sidebar-tab"
    ).forEach(tab => {

        tab.addEventListener(
            "click",
            async () => {

                document.querySelectorAll(
                    ".sidebar-tab"
                ).forEach(item => {

                    item.classList.remove(
                        "active"
                    );

                });


                tab.classList.add("active");


                currentTab =
                    tab.dataset.tab;


                if (currentTab === "chats") {
                    await loadDefaultList();
                }

                if (currentTab === "groups") {
                    await loadGroups();
                }

                if (currentTab === "channels") {
                    await loadChannels();
                }

            }
        );
    });
}


/* =========================================================
   MOBILE
========================================================= */

function setupMobile() {

    $("mobileBackBtn")
        ?.addEventListener(
            "click",
            () => {

                document.querySelector(".app")
                    ?.classList.remove(
                        "chat-open"
                    );

            }
        );
}


/* =========================================================
   LOGOUT
========================================================= */

async function logout() {

    await supabase.auth.signOut();

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

    messageChannel =
        supabase
            .channel("msgbox-messages")
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "messages"
                },
                async payload => {

                    const message =
                        payload.new;


                    if (!message) return;


                    if (
                        selectedUser &&
                        (
                            (
                                message.sender_id === currentUser.id &&
                                message.receiver_id === selectedUser.id
                            )
                            ||
                            (
                                message.sender_id === selectedUser.id &&
                                message.receiver_id === currentUser.id
                            )
                        )
                    ) {

                        await loadMessages();
                    }

                }
            )
            .subscribe();


    contactChannel =
        supabase
            .channel("msgbox-contact-requests")
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "contact_requests"
                },
                async payload => {

                    const row =
                        payload.new;


                    if (
                        row?.receiver_id === currentUser.id ||
                        row?.sender_id === currentUser.id
                    ) {

                        await updateContactActions();

                        if (currentTab === "chats") {
                            await loadDefaultList();
                        }

                    }

                }
            )
            .subscribe();
}


/* =========================================================
   EVENT SETUP
========================================================= */

function setupEvents() {

    /* Settings */

    $("settingsBtn")
        .addEventListener(
            "click",
            () => openModal("settingsModal")
        );


    $("closeSettingsBtn")
        .addEventListener(
            "click",
            () => closeModal("settingsModal")
        );


    /* Profile */

    $("myProfileBtn")
        .addEventListener(
            "click",
            openProfileSettings
        );


    $("profileSettingsBtn")
        .addEventListener(
            "click",
            () => {

                closeModal("settingsModal");

                openProfileSettings();

            }
        );


    $("closeProfileBtn")
        .addEventListener(
            "click",
            () => closeModal("profileModal")
        );


    $("profileForm")
        .addEventListener(
            "submit",
            saveProfile
        );


    /* Language */

    $("languageSettingsBtn")
        .addEventListener(
            "click",
            () => {

                closeModal("settingsModal");

                openModal("languageModal");

            }
        );


    $("closeLanguageBtn")
        .addEventListener(
            "click",
            () => closeModal("languageModal")
        );


    document.querySelectorAll(
        ".language-option"
    ).forEach(option => {

        option.addEventListener(
            "click",
            () => {

                setLanguage(
                    option.dataset.language
                );

            }
        );

    });


    /* Owner */

    $("ownerPanelButton")
        .addEventListener(
            "click",
            () => {

                closeModal("settingsModal");

                openModal("ownerModal");

                loadReports(
                    "ownerReportsList"
                );

            }
        );


    $("closeOwnerBtn")
        .addEventListener(
            "click",
            () => closeModal("ownerModal")
        );


    $("ownerVerifiedSearchBtn")
        .addEventListener(
            "click",
            ownerVerifiedSearch
        );


    $("ownerModerationSearchBtn")
        .addEventListener(
            "click",
            ownerModerationSearch
        );


    $("ownerAdminSearchBtn")
        .addEventListener(
            "click",
            ownerAdminSearch
        );


    /* Owner tabs */

    document.querySelectorAll(
        ".owner-tab"
    ).forEach(tab => {

        tab.addEventListener(
            "click",
            () => {

                document.querySelectorAll(
                    ".owner-tab"
                ).forEach(item =>
                    item.classList.remove("active")
                );


                document.querySelectorAll(
                    ".owner-section"
                ).forEach(section =>
                    section.classList.remove("active")
                );


                tab.classList.add("active");


                const target =
                    tab.dataset.ownerTab;


                const section =
                    $(
                        `owner${target.charAt(0).toUpperCase() + target.slice(1)}Section`
                    );


                section?.classList.add("active");

            }
        );
    });


    /* Admin */

    $("adminPanelButton")
        .addEventListener(
            "click",
            () => {

                closeModal("settingsModal");

                openModal("adminModal");

            }
        );


    $("closeAdminBtn")
        .addEventListener(
            "click",
            () => closeModal("adminModal")
        );


    $("openAdminReportsBtn")
        .addEventListener(
            "click",
            async () => {

                closeModal("adminModal");

                openModal("ownerModal");

                document.querySelector(
                    '[data-owner-tab="reports"]'
                )?.click();

                await loadReports(
                    "ownerReportsList"
                );

            }
        );


    $("openAdminUsersBtn")
        .addEventListener(
            "click",
            () => {

                closeModal("adminModal");

                openModal("ownerModal");

                document.querySelector(
                    '[data-owner-tab="users"]'
                )?.click();

            }
        );


    $("openAdminGroupsBtn")
        .addEventListener(
            "click",
            () => {

                closeModal("adminModal");

                showToast(
                    "Group moderation is coming next"
                );

            }
        );


    $("openAdminChannelsBtn")
        .addEventListener(
            "click",
            () => {

                closeModal("adminModal");

                showToast(
                    "Channel moderation is coming next"
                );

            }
        );


    /* Create Group */

    $("createGroupBtn")
        .addEventListener(
            "click",
            () => openModal("createGroupModal")
        );


    $("closeGroupBtn")
        .addEventListener(
            "click",
            () => closeModal("createGroupModal")
        );


    $("groupForm")
        .addEventListener(
            "submit",
            createGroup
        );


    /* Create Channel */

    $("createChannelBtn")
        .addEventListener(
            "click",
            () => openModal("createChannelModal")
        );


    $("closeChannelBtn")
        .addEventListener(
            "click",
            () => closeModal("createChannelModal")
        );


    $("channelForm")
        .addEventListener(
            "submit",
            createChannel
        );


    /* Contact */

    $("addContactBtn")
        .addEventListener(
            "click",
            sendContactRequest
        );


    $("acceptContactBtn")
        .addEventListener(
            "click",
            () => updateContactRequest("accepted")
        );


    $("declineContactBtn")
        .addEventListener(
            "click",
            () => updateContactRequest("declined")
        );


    /* Message */

    $("messageForm")
        .addEventListener(
            "submit",
            event => {

                event.preventDefault();

                sendMessage(
                    $("messageInput").value
                );

            }
        );


    $("imageBtn")
        .addEventListener(
            "click",
            () => $("imageInput").click()
        );


    $("imageInput")
        .addEventListener(
            "change",
            event => {

                const file =
                    event.target.files?.[0];

                if (file) {
                    sendImage(file);
                }

                event.target.value = "";

            }
        );


    $("stickerBtn")
        .addEventListener(
            "click",
            () => showToast(
                "Stickers will be connected next"
            )
        );


    /* Emoji */

    setupEmoji();


    /* Search */

    setupSearch();


    /* Tabs */

    setupTabs();


    /* Mobile */

    setupMobile();


    /* Logout */

    $("logoutBtn")
        .addEventListener(
            "click",
            logout
        );


    $("settingsLogoutBtn")
        .addEventListener(
            "click",
            logout
        );


    /* Avatar */

    $("profileAvatarInput")
        .addEventListener(
            "change",
            event => {

                const file =
                    event.target.files?.[0];

                if (!file) return;

                const reader =
                    new FileReader();

                reader.onload = () => {

                    $("profileEditAvatar")
                        .style.backgroundImage =
                        `url("${reader.result}")`;

                    $("profileEditAvatar")
                        .style.backgroundSize =
                        "cover";

                    $("profileEditAvatar")
                        .style.backgroundPosition =
                        "center";

                    $("profileEditAvatar")
                        .textContent = "";

                };

                reader.readAsDataURL(file);

            }
        );


    /* Close when clicking outside */

    document.querySelectorAll(
        ".modal-overlay"
    ).forEach(overlay => {

        overlay.addEventListener(
            "click",
            event => {

                if (event.target === overlay) {

                    overlay.classList.remove(
                        "active"
                    );

                }

            }
        );

    });
}


/* =========================================================
   INITIALIZE
========================================================= */

async function init() {

    applyLanguage();


    const sessionLoaded =
        await loadSession();

    if (!sessionLoaded) return;


    const profileLoaded =
        await loadMyProfile();

    if (!profileLoaded) return;


    setupEvents();

    setupRealtime();

    await loadDefaultList();


    $("messageInput").disabled = true;
    $("sendButton").disabled = true;
    $("imageBtn").disabled = true;
    $("emojiBtn").disabled = true;
    $("stickerBtn").disabled = true;
}


init();
