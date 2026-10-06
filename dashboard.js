/* =========================================================
   MegChatBox Dashboard
   Frontend + Supabase-ready architecture
========================================================= */

(() => {
  "use strict";

  /* =======================================================
     GLOBAL STATE
  ======================================================= */

  const state = {
    currentUser: null,
    currentProfile: null,

    selectedUser: null,
    selectedChatId: null,

    currentTab: "chats",
    currentSettingsSection: "profile",

    currentCommunityType: "all",
    currentSearchType: "all",

    replyTo: null,

    searchHistory:
      JSON.parse(localStorage.getItem("megchatbox_search_history") || "[]"),

    savedMessages:
      JSON.parse(localStorage.getItem("megchatbox_saved_messages") || "[]"),

    notifications:
      JSON.parse(localStorage.getItem("megchatbox_notifications") || "[]"),

    devices:
      JSON.parse(localStorage.getItem("megchatbox_devices") || "[]"),

    contacts: [],
    chats: [],
    communities: [],
    messages: [],

    adminPermissions: {},

    privacy: JSON.parse(
      localStorage.getItem("megchatbox_privacy") ||
      JSON.stringify({
        lastSeen: true,
        online: true,
        acceptedOnly: true
      })
    ),

    appearance: JSON.parse(
      localStorage.getItem("megchatbox_appearance") ||
      JSON.stringify({
        theme: "dark",
        compact: false,
        wallpaper: ""
      })
    ),

    decoration: "dragon",

    selectedCommunityPrivacy: "public",

    selectedCommunityType: "group",

    currentProfileForDrawer: null
  };


  /* =======================================================
     DOM
  ======================================================= */

  const $ = (selector, parent = document) =>
    parent.querySelector(selector);

  const $$ = (selector, parent = document) =>
    [...parent.querySelectorAll(selector)];


  /* =======================================================
     SUPABASE
  ======================================================= */

  const getSupabaseClient = () => {

    if (
      window.supabaseClient &&
      typeof window.supabaseClient.from === "function"
    ) {
      return window.supabaseClient;
    }

    if (
      window.supabase &&
      typeof window.supabase.from === "function"
    ) {
      return window.supabase;
    }

    return null;
  };


  const db = () => getSupabaseClient();


  /* =======================================================
     HELPERS
  ======================================================= */

  const escapeHtml = (value = "") => {
    const div = document.createElement("div");
    div.textContent = String(value);
    return div.innerHTML;
  };


  const normalizeUsername = (value = "") => {
    return String(value)
      .trim()
      .replace(/^@+/, "")
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "");
  };


  const formatTime = (dateValue) => {

    if (!dateValue) return "";

    const date = new Date(dateValue);

    if (Number.isNaN(date.getTime())) return "";

    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit"
    });
  };


  const formatDateTime = (dateValue) => {

    if (!dateValue) return "";

    const date = new Date(dateValue);

    if (Number.isNaN(date.getTime())) return "";

    return date.toLocaleString();
  };


  const formatLastSeen = (dateValue) => {

    if (!dateValue) return "Last seen unavailable";

    const date = new Date(dateValue);

    if (Number.isNaN(date.getTime())) {
      return "Last seen unavailable";
    }

    const diff = Date.now() - date.getTime();

    if (diff < 45 * 1000) {
      return "Online";
    }

    if (diff < 60 * 60 * 1000) {
      return `Last seen ${Math.max(
        1,
        Math.floor(diff / 60000)
      )} min ago`;
    }

    if (diff < 24 * 60 * 60 * 1000) {
      return `Last seen ${Math.floor(
        diff / 3600000
      )}h ago`;
    }

    return `Last seen ${Math.floor(
      diff / 86400000
    )}d ago`;
  };


  const avatarHtml = (profile, sizeClass = "avatar-sm") => {

    if (profile?.avatar_url) {
      return `
        <div class="avatar ${sizeClass}">
          <img
            src="${escapeHtml(profile.avatar_url)}"
            alt=""
            loading="lazy"
          />
        </div>
      `;
    }

    const source =
      profile?.full_name ||
      profile?.username ||
      "?";

    const letter = source
      .trim()
      .charAt(0)
      .toUpperCase() || "?";

    return `
      <div class="avatar ${sizeClass}">
        <span>${escapeHtml(letter)}</span>
      </div>
    `;
  };


  const verifiedBadge = (profile) => {

    if (!profile?.is_verified) {
      return "";
    }

    return `
      <span
        class="verified-badge"
        title="Verified"
      >
        ✓
      </span>
    `;
  };


  const generatePrivateUsername = () => {

    const chars =
      "abcdefghijklmnopqrstuvwxyz0123456789";

    const length =
      Math.floor(Math.random() * 6) + 10;

    let result = "";

    for (let i = 0; i < length; i++) {
      result += chars[
        Math.floor(Math.random() * chars.length)
      ];
    }

    return result;
  };


  const showToast = (
    message,
    type = "success"
  ) => {

    const container = $("#toastContainer");

    if (!container) return;

    const toast =
      document.createElement("div");

    toast.className =
      `toast ${type}`;

    toast.textContent = message;

    container.appendChild(toast);

    setTimeout(() => {
      toast.remove();
    }, 3500);
  };


  const saveLocalState = () => {

    localStorage.setItem(
      "megchatbox_search_history",
      JSON.stringify(
        state.searchHistory.slice(0, 30)
      )
    );

    localStorage.setItem(
      "megchatbox_saved_messages",
      JSON.stringify(
        state.savedMessages
      )
    );

    localStorage.setItem(
      "megchatbox_notifications",
      JSON.stringify(
        state.notifications
      )
    );

    localStorage.setItem(
      "megchatbox_devices",
      JSON.stringify(
        state.devices
      )
    );

    localStorage.setItem(
      "megchatbox_privacy",
      JSON.stringify(
        state.privacy
      )
    );

    localStorage.setItem(
      "megchatbox_appearance",
      JSON.stringify(
        state.appearance
      )
    );

  };


  /* =======================================================
     SESSION
  ======================================================= */

  async function checkSession() {

    const client = db();

    if (client) {

      try {

        const {
          data,
          error
        } = await client.auth.getSession();

        if (!error && data?.session?.user) {

          state.currentUser =
            data.session.user;

          return true;
        }

      } catch (error) {
        console.warn(
          "Supabase session error:",
          error
        );
      }
    }


    const localLoggedIn =
      localStorage.getItem(
        "messageAppLoggedIn"
      ) === "true";

    if (!localLoggedIn) {
      window.location.href = "index.html";
      return false;
    }


    try {

      state.currentUser =
        JSON.parse(
          localStorage.getItem(
            "messageAppUser"
          ) || "null"
        );

    } catch {
      state.currentUser = null;
    }


    if (!state.currentUser) {

      state.currentUser = {
        id: "local-demo-user",
        email:
          "demo@megchatbox.local"
      };

    }

    return true;
  }


  /* =======================================================
     PROFILE
  ======================================================= */

  async function loadMyProfile() {

    const client = db();

    if (
      client &&
      state.currentUser?.id &&
      !String(state.currentUser.id)
        .startsWith("local-")
    ) {

      try {

        const {
          data,
          error
        } = await client
          .from("profiles")
          .select("*")
          .eq(
            "id",
            state.currentUser.id
          )
          .single();

        if (!error && data) {

          state.currentProfile = data;

          state.adminPermissions =
            data.admin_permissions || {};

          return;
        }

      } catch (error) {
        console.warn(
          "Profile loading failed:",
          error
        );
      }
    }


    let localProfile = null;

    try {
      localProfile = JSON.parse(
        localStorage.getItem(
          "megchatbox_demo_profile"
        ) || "null"
      );
    } catch {
      localProfile = null;
    }


    state.currentProfile =
      localProfile || {

        id:
          state.currentUser?.id ||
          "local-demo-user",

        username:
          localStorage.getItem(
            "megchatbox_username"
          ) || "owner",

        full_name:
          localStorage.getItem(
            "megchatbox_fullname"
          ) || "MegChatBox User",

        bio: "",

        nickname: "",

        avatar_url: "",

        role: "owner",

        is_verified: true,

        verified_until: null,

        last_seen: new Date().toISOString(),

        account_blocked: false,

        messaging_blocked: false,

        admin_permissions: {}

      };

    state.adminPermissions =
      state.currentProfile.admin_permissions ||
      {};
  }


  async function updatePresence() {

    const client = db();

    if (!client || !state.currentUser?.id) {
      return;
    }

    try {

      await client
        .from("profiles")
        .update({
          last_seen:
            new Date().toISOString()
        })
        .eq(
          "id",
          state.currentUser.id
        );

    } catch (error) {

      console.warn(
        "Presence update failed:",
        error
      );

    }
  }


  /* =======================================================
     ROLE / PERMISSIONS
  ======================================================= */

  const isOwner = () => {

    const profile =
      state.currentProfile;

    return (
      profile?.role === "owner" ||
      profile?.username === "owner"
    );
  };


  const isAdmin = () => {

    return (
      isOwner() ||
      state.currentProfile?.role === "admin"
    );
  };


  const hasPermission = (
    permission
  ) => {

    if (isOwner()) {
      return true;
    }

    if (!isAdmin()) {
      return false;
    }

    return (
      state.adminPermissions?.[
        permission
      ] === true
    );
  };


  const canModerateUser = (profile) => {

    if (!profile) {
      return false;
    }

    if (
      profile.role === "owner" ||
      profile.username === "owner"
    ) {
      return false;
    }

    return (
      isOwner() ||
      hasPermission("manage_users")
    );
  };


  /* =======================================================
     MINI PROFILE
  ======================================================= */

  function renderMiniProfile() {

    const profile =
      state.currentProfile;

    if (!profile) return;

    $("#miniAvatar").outerHTML =
      avatarHtml(
        profile,
        "avatar-md"
      ).replace(
        'class="avatar avatar-md"',
        'id="miniAvatar" class="avatar avatar-md"'
      );

    $("#miniName").textContent =
      profile.full_name ||
      profile.username ||
      "User";

    $("#miniUsername").textContent =
      `@${profile.username || ""}`;

    $("#miniVerified").innerHTML =
      verifiedBadge(profile);

    renderSettingsProfile();
  }


  function renderSettingsProfile() {

    const p =
      state.currentProfile;

    if (!p) return;

    const nameInput =
      $("#profileNameInput");

    const nickInput =
      $("#profileNicknameInput");

    const userInput =
      $("#profileUsernameInput");

    const bioInput =
      $("#profileBioInput");

    if (nameInput)
      nameInput.value =
        p.full_name || "";

    if (nickInput)
      nickInput.value =
        p.nickname || "";

    if (userInput)
      userInput.value =
        p.username || "";

    if (bioInput)
      bioInput.value =
        p.bio || "";


    const avatarEl =
      $("#settingsAvatar");

    if (avatarEl) {

      avatarEl.outerHTML =
        avatarHtml(
          p,
          "avatar-xl"
        ).replace(
          'class="avatar avatar-xl"',
          'id="settingsAvatar" class="avatar avatar-xl"'
        );

    }


    const email =
      p.email ||
      state.currentUser?.email ||
      "Unavailable";

    if ($("#securityEmail")) {
      $("#securityEmail")
        .textContent = email;
    }


    renderDecorationGrid();
  }


  /* =======================================================
     SETTINGS
  ======================================================= */

  function initSettings() {

    $$(".settings-nav-item")
      .forEach(button => {

        button.addEventListener(
          "click",
          () => {

            const section =
              button.dataset
                .settingsSection;

            $$(".settings-nav-item")
              .forEach(item =>
                item.classList.remove(
                  "active"
                )
              );

            $$(".settings-section")
              .forEach(item =>
                item.classList.remove(
                  "active"
                )
              );

            button.classList.add(
              "active"
            );

            const target =
              $(`#settings-${section}`);

            if (target) {
              target.classList.add(
                "active"
              );
            }

            state.currentSettingsSection =
              section;
          }
        );

      });


    $$(".appearance-option")
      .forEach(button => {

        button.addEventListener(
          "click",
          () => {

            const theme =
              button.dataset.theme;

            state.appearance.theme =
              theme;

            applyTheme();

            $$(".appearance-option")
              .forEach(item =>
                item.classList.remove(
                  "active"
                )
              );

            button.classList.add(
              "active"
            );

            saveLocalState();

          }
        );

      });


    $("#compactModeToggle")
      ?.addEventListener(
        "click",
        () => {

          state.appearance.compact =
            !state.appearance.compact;

          applyTheme();
          saveLocalState();

        }
      );


    $$(".toggle-switch[data-privacy-key]")
      .forEach(button => {

        const key =
          button.dataset.privacyKey;

        if (state.privacy[key]) {
          button.classList.add("active");
        } else {
          button.classList.remove("active");
        }


        button.addEventListener(
          "click",
          () => {

            state.privacy[key] =
              !state.privacy[key];

            button.classList.toggle(
              "active",
              state.privacy[key]
            );

            saveLocalState();

          }
        );

      });


    $("#joinPermissionToggle")
      ?.addEventListener(
        "click",
        () => {

          const button =
            $("#joinPermissionToggle");

          button.classList.toggle(
            "active"
          );

          saveLocalState();

        }
      );


    $("#saveProfileButton")
      ?.addEventListener(
        "click",
        saveProfile
      );


    $("#changeAvatarButton")
      ?.addEventListener(
        "click",
        () => {
          $("#avatarInput")?.click();
        }
      );


    $("#avatarInput")
      ?.addEventListener(
        "change",
        previewAvatar
      );


    $("#uploadWallpaperButton")
      ?.addEventListener(
        "click",
        () => {
          $("#wallpaperInput")?.click();
        }
      );


    $("#wallpaperInput")
      ?.addEventListener(
        "change",
        handleWallpaper
      );


    $("#removeWallpaperButton")
      ?.addEventListener(
        "click",
        removeWallpaper
      );


    $("#devicesButton")
      ?.addEventListener(
        "click",
        openDevicesModal
      );


    $("#changePasswordButton")
      ?.addEventListener(
        "click",
        changePassword
      );


    $("#changeEmailButton")
      ?.addEventListener(
        "click",
        changeEmail
      );


    $("#tipsButton")
      ?.addEventListener(
        "click",
        openTips
      );


    $("#settingsLogout")
      ?.addEventListener(
        "click",
        logout
      );


    $("#deleteAccountButton")
      ?.addEventListener(
        "click",
        deleteAccount
      );


    $("#languageSelect")
      ?.addEventListener(
        "change",
        (event) => {

          localStorage.setItem(
            "megchatbox_language",
            event.target.value
          );

          showToast(
            "Language preference saved."
          );

        }
      );

    applyTheme();
  }


  async function saveProfile() {

    if (!state.currentProfile) {
      return;
    }

    const fullName =
      $("#profileNameInput")?.value
        .trim() || "";

    const nickname =
      $("#profileNicknameInput")?.value
        .trim() || "";

    const username =
      normalizeUsername(
        $("#profileUsernameInput")
          ?.value || ""
      );

    const bio =
      $("#profileBioInput")?.value
        .trim() || "";


    const minLength =
      isAdmin() && hasPermission("edit_user")
        ? 1
        : 5;

    if (username.length < minLength) {

      showToast(
        `Username must contain at least ${minLength} character(s).`,
        "error"
      );

      return;
    }


    if (
      username === "owner" &&
      !isOwner()
    ) {

      showToast(
        "The owner username is protected.",
        "error"
      );

      return;
    }


    const updates = {
      full_name: fullName,
      nickname,
      username,
      bio
    };


    const client = db();


    if (
      client &&
      state.currentUser?.id &&
      !String(state.currentUser.id)
        .startsWith("local-")
    ) {

      try {

        const {
          data,
          error
        } = await client
          .from("profiles")
          .update(updates)
          .eq(
            "id",
            state.currentUser.id
          )
          .select()
          .single();

        if (error) {
          throw error;
        }

        state.currentProfile =
          data;

      } catch (error) {

        console.error(error);

        showToast(
          "Profile could not be saved. Check Supabase/RLS.",
          "error"
        );

        return;
      }

    } else {

      state.currentProfile = {
        ...state.currentProfile,
        ...updates
      };

      localStorage.setItem(
        "megchatbox_demo_profile",
        JSON.stringify(
          state.currentProfile
        )
      );

      localStorage.setItem(
        "megchatbox_username",
        username
      );

      localStorage.setItem(
        "megchatbox_fullname",
        fullName
      );
    }


    renderMiniProfile();

    showToast(
      "Profile updated."
    );
  }


  function previewAvatar(event) {

    const file =
      event.target.files?.[0];

    if (!file) return;

    if (!file.type.startsWith("image/")) {

      showToast(
        "Please select an image.",
        "error"
      );

      return;
    }

    const reader =
      new FileReader();

    reader.onload = () => {

      const url =
        String(reader.result);

      state.currentProfile.avatar_url =
        url;

      renderMiniProfile();

      showToast(
        "Avatar preview updated. Upload it to Supabase Storage for permanent saving."
      );

    };

    reader.readAsDataURL(file);
  }


  function handleWallpaper(event) {

    const file =
      event.target.files?.[0];

    if (!file) return;

    const reader =
      new FileReader();

    reader.onload = () => {

      state.appearance.wallpaper =
        String(reader.result);

      saveLocalState();

      applyWallpaper();

      if ($("#wallpaperName")) {
        $("#wallpaperName")
          .textContent =
          file.name;
      }

      showToast(
        "Wallpaper applied."
      );
    };

    reader.readAsDataURL(file);
  }


  function removeWallpaper() {

    state.appearance.wallpaper = "";

    saveLocalState();

    applyWallpaper();

    if ($("#wallpaperName")) {
      $("#wallpaperName").textContent =
        "No custom wallpaper";
    }

    showToast(
      "Wallpaper removed."
    );
  }


  function applyWallpaper() {

    const messages =
      $("#messages");

    if (!messages) return;

    if (
      state.appearance.wallpaper
    ) {

      messages.style.backgroundImage =
        `url("${state.appearance.wallpaper}")`;

    } else {

      messages.style.backgroundImage =
        "none";
    }
  }


  function applyTheme() {

    const theme =
      state.appearance.theme;

    document.body.classList.toggle(
      "compact-mode",
      !!state.appearance.compact
    );


    let isLight = false;

    if (theme === "light") {
      isLight = true;
    }

    if (theme === "system") {

      isLight =
        window.matchMedia &&
        window.matchMedia(
          "(prefers-color-scheme: light)"
        ).matches;
    }

    document.body.classList.toggle(
      "light-theme",
      isLight
    );

    $$(".appearance-option")
      .forEach(button => {

        button.classList.toggle(
          "active",
          button.dataset.theme ===
          theme
        );

      });


    const compactButton =
      $("#compactModeToggle");

    compactButton?.classList.toggle(
      "active",
      !!state.appearance.compact
    );

    applyWallpaper();
  }


  async function changePassword() {

    const client = db();

    if (!client) {

      showToast(
        "Supabase Auth is required.",
        "error"
      );

      return;
    }

    try {

      const email =
        state.currentUser?.email;

      const { error } =
        await client.auth
          .resetPasswordForEmail(
            email
          );

      if (error) throw error;

      showToast(
        "Password reset instructions sent."
      );

    } catch (error) {

      console.error(error);

      showToast(
        "Password change request failed.",
        "error"
      );
    }
  }


  async function changeEmail() {

    const client = db();

    if (!client) {

      showToast(
        "Supabase Auth is required.",
        "error"
      );

      return;
    }

    const newEmail =
      prompt(
        "Enter the new email address:"
      );

    if (!newEmail) return;

    try {

      const { error } =
        await client.auth.updateUser({
          email: newEmail.trim()
        });

      if (error) throw error;

      showToast(
        "Email change request sent."
      );

    } catch (error) {

      console.error(error);

      showToast(
        "Unable to change email.",
        "error"
      );
    }
  }


  function openTips() {

    showToast(
      "MegChatBox Tips will appear here."
    );
  }


  async function deleteAccount() {

    const confirmed =
      confirm(
        "Delete your MegChatBox account? This action cannot be undone."
      );

    if (!confirmed) return;

    showToast(
      "Account deletion must be performed by a secure server-side function.",
      "error"
    );
  }


  /* =======================================================
     DECORATIONS
  ======================================================= */

  const decorations = [

    {
      id: "dragon",
      emoji: "🐉",
      name: "Dragon"
    },

    {
      id: "demon",
      emoji: "🔴👁️",
      name: "Demon Red Eyes"
    },

    {
      id: "lightning",
      emoji: "⚡",
      name: "Lightning"
    },

    {
      id: "fire",
      emoji: "🔥",
      name: "Fire"
    },

    {
      id: "ice",
      emoji: "❄️",
      name: "Ice"
    },

    {
      id: "moon",
      emoji: "🌙",
      name: "Moon"
    },

    {
      id: "star",
      emoji: "⭐",
      name: "Star"
    },

    {
      id: "diamond",
      emoji: "💎",
      name: "Diamond"
    },

    {
      id: "pixel",
      emoji: "👾",
      name: "Pixel"
    },

    {
      id: "galaxy",
      emoji: "🌌",
      name: "Galaxy"
    },

    {
      id: "meteor",
      emoji: "☄️",
      name: "Meteor"
    }

  ];


  function renderDecorationGrid() {

    const grid =
      $("#decorationGrid");

    if (!grid) return;

    grid.innerHTML =
      decorations
        .map(item => {

          return `
            <button
              class="decoration-option ${
                state.decoration === item.id
                  ? "active"
                  : ""
              }"
              data-decoration="${item.id}"
            >
              <div class="decoration-preview">
                ${item.emoji}
              </div>

              <div class="decoration-name">
                ${escapeHtml(item.name)}
              </div>
            </button>
          `;

        })
        .join("");


    $$(".decoration-option")
      .forEach(button => {

        button.addEventListener(
          "click",
          () => {

            state.decoration =
              button.dataset.decoration;

            renderDecorationGrid();

            updateOwnDecoration();

          }
        );

      });
  }


  async function updateOwnDecoration() {

    const item =
      decorations.find(
        x => x.id === state.decoration
      );

    const client = db();

    if (
      client &&
      state.currentUser?.id &&
      !String(state.currentUser.id)
        .startsWith("local-")
    ) {

      try {

        await client
          .from("profiles")
          .update({
            decoration:
              item?.id || "dragon"
          })
          .eq(
            "id",
            state.currentUser.id
          );

      } catch (error) {

        console.warn(
          "Decoration DB update failed:",
          error
        );

      }
    }

    showToast(
      `${item?.name || "Decoration"} selected.`
    );

    if (
      state.currentProfile
    ) {

      state.currentProfile.decoration =
        item?.id ||
        "dragon";

    }
  }


  const getDecorationEmoji =
    (profile) => {

      const id =
        profile?.decoration ||
        state.decoration;

      return (
        decorations.find(
          x => x.id === id
        )?.emoji || "✨"
      );
    };


  /* =======================================================
     GLOBAL NAVIGATION
  ======================================================= */

  function initNavigation() {

    $$(".nav-item[data-tab]")
      .forEach(button => {

        button.addEventListener(
          "click",
          () => {

            switchTab(
              button.dataset.tab
            );

            closeSidebarMobile();

          }
        );

      });

  }


  function switchTab(tabName) {

    state.currentTab =
      tabName;

    $$(".nav-item[data-tab]")
      .forEach(item => {

        item.classList.toggle(
          "active",
          item.dataset.tab ===
          tabName
        );

      });

    $$(".tab-panel")
      .forEach(panel => {

        panel.classList.toggle(
          "active",
          panel.id ===
          `tab-${tabName}`
        );

      });


    if (tabName === "contacts") {
      loadContacts();
    }

    if (tabName === "saved") {
      renderSavedMessages();
    }

    if (tabName === "notifications") {
      renderNotifications();
    }

    if (tabName === "communities") {
      loadCommunities();
    }
  }


  /* =======================================================
     GLOBAL SEARCH
  ======================================================= */

  function openGlobalSearch() {

    $("#globalSearchMode")
      ?.classList.remove(
        "hidden"
      );

    document.body.style.overflow =
      "hidden";

    renderSearchHistory();

    setTimeout(() => {
      $("#globalSearchInput")?.focus();
    }, 40);
  }


  function closeGlobalSearch() {

    $("#globalSearchMode")
      ?.classList.add(
        "hidden"
      );

    document.body.style.overflow =
      "";

    $("#globalSearchInput")
      .value = "";

    $("#searchSuggestions")
      ?.classList.add("hidden");

    $("#globalSearchResults")
      ?.classList.add("hidden");

    $("#searchHistoryHeader")
      ?.classList.remove("hidden");

    $("#searchHistory")
      ?.classList.remove("hidden");
  }


  function initGlobalSearch() {

    $("#openGlobalSearch")
      ?.addEventListener(
        "click",
        openGlobalSearch
      );

    $("#mobileSearch")
      ?.addEventListener(
        "click",
        openGlobalSearch
      );

    $("#closeGlobalSearch")
      ?.addEventListener(
        "click",
        closeGlobalSearch
      );

    $("#clearGlobalSearch")
      ?.addEventListener(
        "click",
        () => {

          $("#globalSearchInput")
            .value = "";

          $("#globalSearchInput")
            .focus();

          renderSearchHistory();

        }
      );


    $("#clearSearchHistory")
      ?.addEventListener(
        "click",
        () => {

          state.searchHistory =
            [];

          saveLocalState();

          renderSearchHistory();

          showToast(
            "Search history cleared."
          );

        }
      );


    $("#globalSearchInput")
      ?.addEventListener(
        "input",
        debounce(
          handleGlobalSearchInput,
          250
        )
      );


    $$(".search-filter")
      .forEach(button => {

        button.addEventListener(
          "click",
          () => {

            state.currentSearchType =
              button.dataset.searchType;

            $$(".search-filter")
              .forEach(item =>
                item.classList.remove(
                  "active"
                )
              );

            button.classList.add(
              "active"
            );

            const query =
              $("#globalSearchInput")
                ?.value
                ?.trim();

            if (query) {
              runGlobalSearch(query);
            }

          }
        );

      });
  }


  function renderSearchHistory() {

    const container =
      $("#searchHistory");

    if (!container) return;

    if (!state.searchHistory.length) {

      container.innerHTML = `
        <div class="empty-list">
          <div class="empty-icon">
            <i class="fa-solid fa-clock-rotate-left"></i>
          </div>

          <p>
            Your recent searches will appear here.
          </p>
        </div>
      `;

      return;
    }


    container.innerHTML =
      state.searchHistory
        .map(item => {

          return `
            <div
              class="history-item"
              data-history-value="${escapeHtml(item)}"
            >

              <i class="fa-solid fa-clock"></i>

              <div>
                <strong>
                  ${escapeHtml(item)}
                </strong>
              </div>

              <button
                class="icon-btn tiny remove-history"
                data-remove-history="${escapeHtml(item)}"
              >
                <i class="fa-solid fa-xmark"></i>
              </button>

            </div>
          `;

        })
        .join("");


    $$(".history-item", container)
      .forEach(item => {

        item.addEventListener(
          "click",
          event => {

            if (
              event.target.closest(
                ".remove-history"
              )
            ) {
              return;
            }

            const value =
              item.dataset.historyValue;

            $("#globalSearchInput")
              .value = value;

            handleGlobalSearchInput();

          }
        );

      });


    $$(".remove-history", container)
      .forEach(button => {

        button.addEventListener(
          "click",
          () => {

            state.searchHistory =
              state.searchHistory.filter(
                item =>
                  item !==
                  button.dataset.removeHistory
              );

            saveLocalState();

            renderSearchHistory();
          }
        );

      });
  }


  async function handleGlobalSearchInput() {

    const query =
      $("#globalSearchInput")
        ?.value
        ?.trim() || "";


    if (!query) {

      $("#searchSuggestions")
        ?.classList.add(
          "hidden"
        );

      $("#globalSearchResults")
        ?.classList.add(
          "hidden"
        );

      $("#searchHistoryHeader")
        ?.classList.remove(
          "hidden"
        );

      $("#searchHistory")
        ?.classList.remove(
          "hidden"
        );

      return;
    }


    $("#searchHistoryHeader")
      ?.classList.add(
        "hidden"
      );

    $("#searchHistory")
      ?.classList.add(
        "hidden"
      );

    await runGlobalSearch(query);
  }


  async function runGlobalSearch(query) {

    const normalized =
      normalizeUsername(query);

    const suggestions =
      generateSuggestions(
        normalized
      );

    renderSuggestions(
      suggestions
    );


    if (normalized.length >= 1) {

      await searchProfiles(
        normalized
      );

    }
  }


  function generateSuggestions(
    query
  ) {

    if (!query) {
      return [];
    }


    const demo = [

      "abd",
      "abde",
      "abd1",
      "abd123",
      "abdullah",
      "abdul",
      "abdulaziz",
      "abdu",
      "abdurahmon",
      "abduvali"

    ];


    const own =
      state.currentProfile
        ?.username || "";


    const source = [
      own,
      ...demo,

      ...state.contacts
        .map(
          x =>
            x.username || ""
        ),

      ...state.chats
        .map(
          x =>
            x.username || ""
        )

    ];


    const unique =
      [...new Set(source)]
        .filter(
          value =>
            normalizeUsername(value)
              .startsWith(query)
        )
        .slice(0, 10);


    return unique;
  }


  function renderSuggestions(
    suggestions
  ) {

    const wrapper =
      $("#searchSuggestions");

    const list =
      $("#suggestionList");

    if (!wrapper || !list) {
      return;
    }


    if (!suggestions.length) {

      wrapper.classList.add(
        "hidden"
      );

      return;
    }


    wrapper.classList.remove(
      "hidden"
    );


    list.innerHTML =
      suggestions
        .slice(0, 10)
        .map(username => {

          return `
            <div
              class="suggestion-item"
              data-suggestion="${escapeHtml(username)}"
            >

              ${avatarHtml(
                {
                  username
                },
                "avatar-sm"
              )}

              <div>
                <strong>
                  @${escapeHtml(username)}
                </strong>

                <div
                  class="chat-status"
                >
                  Username suggestion
                </div>
              </div>

              <i
                class="fa-solid fa-arrow-up-right-from-square"
              ></i>

            </div>
          `;

        })
        .join("");


    $$(".suggestion-item", list)
      .forEach(item => {

        item.addEventListener(
          "click",
          () => {

            const value =
              item.dataset.suggestion;

            $("#globalSearchInput")
              .value = value;

            runGlobalSearch(
              value
            );
          }
        );
      });
  }


  async function searchProfiles(
    query
  ) {

    const client = db();

    let results = [];


    if (client) {

      try {

        const {
          data,
          error
        } = await client
          .from("profiles")
          .select(`
            id,
            username,
            full_name,
            nickname,
            bio,
            avatar_url,
            role,
            is_verified,
            verified_until,
            last_seen,
            account_blocked,
            account_blocked_until,
            messaging_blocked,
            messaging_blocked_until,
            decoration
          `)
          .ilike(
            "username",
            `${query}%`
          )
          .limit(10);

        if (!error) {
          results =
            data || [];
        }

      } catch (error) {

        console.warn(
          "Global search failed:",
          error
        );
      }
    }


    if (!results.length) {

      const merged = [
        state.currentProfile,
        ...state.contacts,
        ...state.chats
      ].filter(Boolean);


      const map =
        new Map();

      merged.forEach(profile => {

        const username =
          normalizeUsername(
            profile.username || ""
          );

        if (
          username &&
          username.startsWith(query)
        ) {
          map.set(
            profile.id ||
            username,
            profile
          );
        }

      });

      results =
        [...map.values()]
          .slice(0, 10);
    }


    renderSearchResults(
      results
    );


    addSearchHistory(
      query
    );
  }


  function renderSearchResults(
    results
  ) {

    const wrapper =
      $("#globalSearchResults");

    const list =
      $("#searchResultList");

    if (!wrapper || !list) return;

    wrapper.classList.remove(
      "hidden"
    );


    if (!results.length) {

      list.innerHTML = `
        <div class="empty-list">
          <div class="empty-icon">
            <i class="fa-solid fa-magnifying-glass"></i>
          </div>

          <p>No matching users found.</p>
        </div>
      `;

      return;
    }


    list.innerHTML =
      results
        .map(profile => {

          return `
            <div
              class="search-result-item"
              data-user-id="${escapeHtml(profile.id || "")}"
            >

              ${avatarHtml(profile)}

              <div>

                <div
                  class="contact-name"
                >
                  <strong>
                    ${escapeHtml(
                      profile.full_name ||
                      profile.username ||
                      "User"
                    )}
                  </strong>

                  ${verifiedBadge(profile)}
                </div>

                <div class="contact-username">
                  @${escapeHtml(
                    profile.username || ""
                  )}
                </div>

                <div class="contact-bio">
                  ${escapeHtml(
                    profile.bio || ""
                  )}
                </div>

              </div>

              <i
                class="fa-solid fa-chevron-right"
              ></i>

            </div>
          `;

        })
        .join("");


    $$(".search-result-item", list)
      .forEach(item => {

        item.addEventListener(
          "click",
          () => {

            const profile =
              results.find(
                x =>
                  String(x.id) ===
                  String(
                    item.dataset.userId
                  )
              );

            if (!profile) {
              return;
            }

            openProfileDrawer(
              profile
            );

          }
        );

      });
  }


  function addSearchHistory(
    value
  ) {

    const normalized =
      value.trim();

    if (!normalized) return;

    state.searchHistory =
      [
        normalized,
        ...state.searchHistory.filter(
          item =>
            item !== normalized
        )
      ].slice(0, 30);

    saveLocalState();
  }


  /* =======================================================
     CONTACTS
  ======================================================= */

  async function loadContacts() {

    const client = db();

    let contacts = [];


    if (
      client &&
      state.currentUser?.id
    ) {

      try {

        const { data, error } =
          await client
            .from(
              "contact_requests"
            )
            .select("*")
            .or(
              `sender_id.eq.${state.currentUser.id},receiver_id.eq.${state.currentUser.id}`
            )
            .eq(
              "status",
              "accepted"
            );

        if (!error) {

          contacts =
            data || [];
        }

      } catch (error) {

        console.warn(
          "Contacts load error:",
          error
        );
      }
    }


    state.contacts =
      state.contacts.length
        ? state.contacts
        : contacts;

    renderContacts();
  }


  function renderContacts() {

    const list =
      $("#contactsList");

    if (!list) return;


    if (!state.contacts.length) {

      list.innerHTML = `
        <div class="empty-state-card">
          <div class="empty-icon">
            <i class="fa-solid fa-address-book"></i>
          </div>

          <h3>No contacts yet</h3>

          <p>
            Search by username and send a contact request.
          </p>

        </div>
      `;

      return;
    }


    list.innerHTML =
      state.contacts
        .map(contact => {

          const profile =
            contact.profile ||
            contact;

          return `
            <article class="contact-card">

              <div class="contact-top">

                ${avatarHtml(profile)}

                <div class="contact-info">

                  <div class="contact-name">

                    <strong>
                      ${escapeHtml(
                        profile.nickname ||
                        profile.full_name ||
                        profile.username ||
                        "User"
                      )}
                    </strong>

                    ${verifiedBadge(profile)}

                  </div>

                  <div class="contact-username">
                    @${escapeHtml(
                      profile.username || ""
                    )}
                  </div>

                </div>

              </div>

              <div class="contact-bio">
                ${escapeHtml(
                  profile.bio || ""
                )}
              </div>

              <div class="contact-actions">

                <button
                  class="secondary-btn contact-open-profile"
                  data-contact-id="${escapeHtml(
                    profile.id || ""
                  )}"
                >
                  Profile
                </button>

                <button
                  class="primary-btn contact-message"
                  data-contact-id="${escapeHtml(
                    profile.id || ""
                  )}"
                >
                  Message
                </button>

              </div>

            </article>
          `;

        })
        .join("");


    $$(".contact-open-profile", list)
      .forEach(button => {

        button.addEventListener(
          "click",
          () => {

            const profile =
              findProfileById(
                button.dataset.contactId
              );

            if (profile) {
              openProfileDrawer(
                profile
              );
            }

          }
        );
      });


    $$(".contact-message", list)
      .forEach(button => {

        button.addEventListener(
          "click",
          () => {

            const profile =
              findProfileById(
                button.dataset.contactId
              );

            if (profile) {
              openChatWithUser(
                profile
              );
            }

          }
        );
      });

  }


  async function sendContactRequest(
    profile
  ) {

    if (!profile) return;

    if (
      profile.account_blocked
    ) {

      showToast(
        "This account is unavailable.",
        "error"
      );

      return;
    }


    const client = db();

    if (
      client &&
      state.currentUser?.id &&
      profile.id
    ) {

      try {

        const {
          error
        } = await client
          .from("contact_requests")
          .insert({
            sender_id:
              state.currentUser.id,

            receiver_id:
              profile.id,

            status: "pending"
          });

        if (error) {
          throw error;
        }

      } catch (error) {

        console.error(error);

        showToast(
          "Contact request failed. Check your RLS policy.",
          "error"
        );

        return;
      }
    }


    addNotification({
      type:
        "contact_request",
      text:
        `Contact request sent to @${profile.username}.`
    });


    showToast(
      "Contact request sent."
    );
  }


  /* =======================================================
     CHAT
  ======================================================= */

  function openChatWithUser(
    profile
  ) {

    if (!profile) return;


    if (
      state.currentProfile?.messaging_blocked
    ) {

      showToast(
        "Messaging is blocked on your account.",
        "error"
      );

      return;
    }


    if (
      profile.account_blocked
    ) {

      showToast(
        "This account is blocked.",
        "error"
      );

      return;
    }


    state.selectedUser =
      profile;

    state.selectedChatId =
      profile.id;


    switchTab("chats");


    $("#chatEmptyState")
      ?.classList.add("hidden");

    $("#activeChat")
      ?.classList.remove("hidden");

    $(".chat-layout")
      ?.classList.add("chat-selected");


    renderActiveChatHeader(
      profile
    );

    loadMessages(
      profile
    );


    if (window.innerWidth <= 820) {
      $("#chatWindow")
        ?.scrollIntoView({
          behavior: "smooth"
        });
    }
  }


  function renderActiveChatHeader(
    profile
  ) {

    $("#chatAvatar").outerHTML =
      avatarHtml(
        profile,
        "avatar-sm"
      ).replace(
        'class="avatar avatar-sm"',
        'id="chatAvatar" class="avatar avatar-sm"'
      );


    $("#chatName").textContent =
      profile.full_name ||
      profile.username ||
      "User";


    $("#chatVerified").innerHTML =
      verifiedBadge(profile);


    const online =
      profile.is_online === true ||
      (
        profile.last_seen &&
        Date.now() -
        new Date(
          profile.last_seen
        ).getTime() <
        60 * 1000
      );


    $("#chatStatus")
      .textContent =
      online
        ? "Online"
        : formatLastSeen(
            profile.last_seen
          );
  }


  async function loadMessages(
    profile
  ) {

    const client = db();

    let messages = [];


    if (
      client &&
      state.currentUser?.id &&
      profile?.id &&
      !String(profile.id)
        .startsWith("local-")
    ) {

      try {

        const {
          data,
          error
        } = await client
          .from("messages")
          .select("*")
          .or(
            `and(sender_id.eq.${state.currentUser.id},receiver_id.eq.${profile.id}),and(sender_id.eq.${profile.id},receiver_id.eq.${state.currentUser.id})`
          )
          .order(
            "created_at",
            {
              ascending: true
            }
          );

        if (!error) {
          messages =
            data || [];
        }

      } catch (error) {

        console.warn(
          "Messages load error:",
          error
        );
      }
    }


    state.messages =
      messages;


    renderMessages(
      state.messages
    );


    applyWallpaper();
  }


  function renderMessages(
    messages
  ) {

    const container =
      $("#messages");

    if (!container) return;


    if (!messages.length) {

      container.innerHTML = `
        <div
          style="
            margin:auto;
            text-align:center;
            color:var(--text-dim);
            max-width:330px;
            padding:25px;
          "
        >
          <div
            class="empty-chat-icon"
            style="margin:0 auto 12px"
          >
            <i class="fa-regular fa-message"></i>
          </div>

          <strong>
            No messages yet
          </strong>

          <p
            style="font-size:11px;line-height:1.5"
          >
            Start the conversation.
          </p>
        </div>
      `;

      return;
    }


    container.innerHTML =
      messages
        .map(message =>
          renderMessage(message)
        )
        .join("");


    initMessageActions();

    container.scrollTop =
      container.scrollHeight;
  }


  function renderMessage(
    message
  ) {

    const mine =
      String(message.sender_id) ===
      String(
        state.currentUser?.id
      );


    const deleted =
      message.is_deleted === true ||
      message.deleted === true;


    const reply =
      message.reply_to;


    const content =
      deleted
        ? `
          <div class="deleted-message">
            Message deleted
          </div>
        `
        : `
          ${
            reply
              ? `
                <div
                  style="
                    padding:6px 8px;
                    border-left:2px solid var(--accent);
                    margin-bottom:7px;
                    background:rgba(0,0,0,.12);
                    border-radius:6px;
                    font-size:10px;
                  "
                >
                  ${escapeHtml(
                    reply.content || ""
                  )}
                </div>
              `
              : ""
          }

          ${
            message.file_url &&
            message.mime_type?.startsWith(
              "image/"
            )
              ? `
                <div class="message-media">
                  <img
                    src="${escapeHtml(
                      message.file_url
                    )}"
                    alt=""
                    loading="lazy"
                  />
                </div>
              `
              : ""
          }

          ${
            message.file_url &&
            message.mime_type ===
              "video/mp4"
              ? `
                <div class="message-media">
                  <video
                    src="${escapeHtml(
                      message.file_url
                    )}"
                    controls
                  ></video>
                </div>
              `
              : ""
          }

          ${
            message.file_url &&
            !message.mime_type?.startsWith(
              "image/"
            ) &&
            message.mime_type !==
              "video/mp4"
              ? `
                <div class="message-file">
                  <i class="fa-solid fa-file"></i>

                  <span>
                    ${escapeHtml(
                      message.file_name ||
                      "File"
                    )}
                  </span>
                </div>
              `
              : ""
          }

          ${
            message.content
              ? `
                <div class="message-text">
                  ${escapeHtml(
                    message.content
                  )}
                </div>
              `
              : ""
          }
        `;


    const reactions =
      Array.isArray(
        message.reactions
      ) &&
      message.reactions.length
        ? `
          <div class="message-reactions">
            ${message.reactions
              .map(
                reaction =>
                  `<span class="reaction">${escapeHtml(
                    reaction
                  )}</span>`
              )
              .join("")}
          </div>
        `
        : "";


    return `
      <div
        class="message-row ${
          mine ? "mine" : ""
        }"
        data-message-id="${escapeHtml(
          message.id || ""
        )}"
      >

        <div class="message-bubble-wrap">

          <div class="message-actions">

            <button
              class="message-action"
              data-action="reply"
              title="Reply"
            >
              <i class="fa-solid fa-reply"></i>
            </button>

            ${
              mine
                ? `
                  <button
                    class="message-action"
                    data-action="edit"
                    title="Edit"
                  >
                    <i class="fa-solid fa-pen"></i>
                  </button>

                  <button
                    class="message-action"
                    data-action="delete"
                    title="Delete"
                  >
                    <i class="fa-solid fa-trash"></i>
                  </button>
                `
                : ""
            }

            <button
              class="message-action"
              data-action="save"
              title="Save"
            >
              <i class="fa-solid fa-bookmark"></i>
            </button>

            <button
              class="message-action"
              data-action="react"
              title="React"
            >
              <i class="fa-regular fa-face-smile"></i>
            </button>

            <button
              class="message-action"
              data-action="pin"
              title="Pin"
            >
              <i class="fa-solid fa-thumbtack"></i>
            </button>

            <button
              class="message-action"
              data-action="report"
              title="Report"
            >
              <i class="fa-solid fa-flag"></i>
            </button>

          </div>


          <div class="message-bubble">

            ${
              !mine &&
              state.selectedUser?.username
                ? `
                  <div class="message-sender">
                    @${escapeHtml(
                      state.selectedUser.username
                    )}
                  </div>
                `
                : ""
            }

            ${content}

            ${reactions}

            <div class="message-meta">

              <span>
                ${formatTime(
                  message.created_at
                )}
              </span>

              ${
                mine
                  ? `
                    <span
                      class="message-status"
                      title="Delivered / Seen"
                    >
                      ${
                        message.seen
                          ? "✓✓"
                          : "✓"
                      }
                    </span>
                  `
                  : ""
              }

            </div>

          </div>

        </div>

      </div>
    `;
  }


  function initMessageActions() {

    $$(".message-action")
      .forEach(button => {

        button.addEventListener(
          "click",
          () => {

            const row =
              button.closest(
                ".message-row"
              );

            const messageId =
              row?.dataset.messageId;

            const action =
              button.dataset.action;

            handleMessageAction(
              action,
              messageId
            );

          }
        );

      });
  }


  function findMessageById(
    id
  ) {

    return state.messages.find(
      message =>
        String(message.id) ===
        String(id)
    );
  }


  async function handleMessageAction(
    action,
    messageId
  ) {

    const message =
      findMessageById(
        messageId
      );

    if (!message) {
      return;
    }


    switch (action) {

      case "reply":
        setReply(message);
        break;

      case "edit":
        if (
          String(message.sender_id) !==
          String(
            state.currentUser?.id
          )
        ) {
          showToast(
            "Only your own messages can be edited.",
            "error"
          );
          return;
        }

        await editMessage(message);
        break;

      case "delete":
        if (
          String(message.sender_id) !==
          String(
            state.currentUser?.id
          )
        ) {
          showToast(
            "Only your own messages can be deleted.",
            "error"
          );
          return;
        }

        await deleteMessage(message);
        break;

      case "save":
        saveMessage(message);
        break;

      case "react":
        reactToMessage(message);
        break;

      case "pin":
        pinMessage(message);
        break;

      case "report":
        reportMessage(message);
        break;

    }
  }


  function setReply(message) {

    state.replyTo =
      message;

    $("#replyBar")
      ?.classList.remove(
        "hidden"
      );

    $("#replyUser")
      .textContent =
      message.sender_id ===
      state.currentUser?.id
        ? "You"
        : (
          state.selectedUser
            ?.username
            ? `@${state.selectedUser.username}`
            : "User"
        );

    $("#replyMessage")
      .textContent =
      message.content ||
      "Media";

    $("#messageInput")
      ?.focus();
  }


  function cancelReply() {

    state.replyTo = null;

    $("#replyBar")
      ?.classList.add(
        "hidden"
      );
  }


  async function editMessage(
    message
  ) {

    const newContent =
      prompt(
        "Edit message:",
        message.content || ""
      );

    if (newContent === null) {
      return;
    }


    if (!newContent.trim()) {
      return;
    }


    const client = db();

    if (
      client &&
      message.id &&
      !String(message.id)
        .startsWith("local-")
    ) {

      try {

        const {
          error
        } = await client
          .from("messages")
          .update({
            content:
              newContent.trim(),
            edited: true
          })
          .eq(
            "id",
            message.id
          );

        if (error) throw error;

      } catch (error) {

        console.error(error);

        showToast(
          "Message edit failed.",
          "error"
        );

        return;
      }
    }


    message.content =
      newContent.trim();

    message.edited = true;

    renderMessages(
      state.messages
    );

    showToast(
      "Message edited."
    );
  }


  async function deleteMessage(
    message
  ) {

    const confirmed =
      confirm(
        "Delete this message?"
      );

    if (!confirmed) return;


    const client = db();

    if (
      client &&
      message.id &&
      !String(message.id)
        .startsWith("local-")
    ) {

      try {

        const {
          error
        } = await client
          .from("messages")
          .update({
            is_deleted: true,
            content: null
          })
          .eq(
            "id",
            message.id
          )
          .eq(
            "sender_id",
            state.currentUser.id
          );

        if (error) throw error;

      } catch (error) {

        console.error(error);

        showToast(
          "Message delete failed.",
          "error"
        );

        return;
      }
    }


    message.is_deleted =
      true;

    message.content =
      null;

    renderMessages(
      state.messages
    );

    showToast(
      "Message deleted."
    );
  }


  function saveMessage(
    message
  ) {

    const exists =
      state.savedMessages.some(
        item =>
          String(item.id) ===
          String(message.id)
      );


    if (exists) {

      state.savedMessages =
        state.savedMessages.filter(
          item =>
            String(item.id) !==
            String(message.id)
        );

      showToast(
        "Message removed from Saved Messages."
      );

    } else {

      state.savedMessages.push({
        ...message,
        original_chat:
          state.selectedUser
            ? {
                id:
                  state.selectedUser.id,
                username:
                  state.selectedUser.username
              }
            : null,

        saved_at:
          new Date().toISOString()
      });

      showToast(
        "Message saved."
      );

    }


    saveLocalState();

    if (
      state.currentTab ===
      "saved"
    ) {
      renderSavedMessages();
    }
  }


  function reactToMessage(
    message
  ) {

    const reaction =
      prompt(
        "Reaction:",
        "❤️"
      );

    if (!reaction) {
      return;
    }


    if (!Array.isArray(
      message.reactions
    )) {
      message.reactions = [];
    }


    message.reactions.push(
      reaction
    );

    renderMessages(
      state.messages
    );
  }


  function pinMessage(
    message
  ) {

    message.pinned = true;

    showToast(
      "Message pinned."
    );
  }


  async function reportMessage(
    message
  ) {

    const options =
      [
        "Spam",
        "Harassment",
        "Inappropriate content",
        "Fake account",
        "Other"
      ];

    const result =
      prompt(
        `Report reason:\n\n${options
          .map(
            (item, index) =>
              `${index + 1}. ${item}`
          )
          .join("\n")}\n\nEnter 1-5:`
      );

    const index =
      Number(result) - 1;

    if (
      !Number.isInteger(index) ||
      !options[index]
    ) {
      return;
    }


    await createReport({
      target_type:
        "message",

      target_id:
        message.id,

      reason:
        options[index]
    });


    showToast(
      "Report submitted."
    );
  }


  async function createReport(
    report
  ) {

    const client = db();

    if (
      client &&
      state.currentUser?.id
    ) {

      try {

        const {
          error
        } = await client
          .from("reports")
          .insert({
            reporter_id:
              state.currentUser.id,

            ...report,

            status:
              "open"
          });

        if (error) throw error;

      } catch (error) {

        console.warn(
          "Report DB insert failed:",
          error
        );
      }
    }


    addNotification({
      type: "report",
      text:
        "Your report has been submitted."
    });
  }


  /* =======================================================
     SEND MESSAGE
  ======================================================= */

  function initComposer() {

    const input =
      $("#messageInput");

    const send =
      $("#sendMessageButton");


    input?.addEventListener(
      "input",
      () => {

        autoResizeTextarea(
          input
        );

        send.disabled =
          !input.value.trim();

      }
    );


    input?.addEventListener(
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


    send?.addEventListener(
      "click",
      sendMessage
    );


    $("#cancelReply")
      ?.addEventListener(
        "click",
        cancelReply
      );


    $("#attachButton")
      ?.addEventListener(
        "click",
        () =>
          $("#fileInput")?.click()
      );


    $("#fileInput")
      ?.addEventListener(
        "change",
        handleFileSelection
      );


    $("#emojiButton")
      ?.addEventListener(
        "click",
        () => {

          $("#stickerPanel")
            ?.classList.add(
              "hidden"
            );

          $("#emojiPanel")
            ?.classList.toggle(
              "hidden"
            );
        }
      );


    $("#stickerButton")
      ?.addEventListener(
        "click",
        () => {

          $("#emojiPanel")
            ?.classList.add(
              "hidden"
            );

          $("#stickerPanel")
            ?.classList.toggle(
              "hidden"
            );

        }
      );


    buildEmojiPicker();
    buildStickerPicker();
  }


  function autoResizeTextarea(
    input
  ) {

    input.style.height =
      "auto";

    input.style.height =
      Math.min(
        input.scrollHeight,
        120
      ) + "px";
  }


  async function sendMessage() {

    const input =
      $("#messageInput");

    const value =
      input?.value
        ?.trim() || "";


    if (!value) return;


    if (!state.selectedUser) {

      showToast(
        "Select a chat first.",
        "error"
      );

      return;
    }


    if (
      state.currentProfile?.messaging_blocked
    ) {

      showToast(
        "Messaging is blocked on your account.",
        "error"
      );

      return;
    }


    const client = db();


    if (
      client &&
      state.currentUser?.id &&
      state.selectedUser?.id &&
      !String(
        state.selectedUser.id
      ).startsWith("local-")
    ) {

      try {

        const {
          data,
          error
        } = await client
          .from("messages")
          .insert({
            sender_id:
              state.currentUser.id,

            receiver_id:
              state.selectedUser.id,

            content:
              value,

            reply_to:
              state.replyTo?.id ||
              null
          })
          .select()
          .single();

        if (error) {
          throw error;
        }

        state.messages.push(
          data
        );

      } catch (error) {

        console.error(error);

        showToast(
          "Message could not be sent. Check RLS.",
          "error"
        );

        return;
      }

    } else {

      state.messages.push({

        id:
          `local-${Date.now()}`,

        sender_id:
          state.currentUser?.id,

        receiver_id:
          state.selectedUser?.id,

        content:
          value,

        created_at:
          new Date().toISOString(),

        seen: false,

        reply_to:
          state.replyTo
            ? {
                id:
                  state.replyTo.id,

                content:
                  state.replyTo.content
              }
            : null
      });
    }


    input.value = "";

    autoResizeTextarea(
      input
    );

    $("#sendMessageButton")
      .disabled = true;

    cancelReply();

    $("#emojiPanel")
      ?.classList.add(
        "hidden"
      );

    $("#stickerPanel")
      ?.classList.add(
        "hidden"
      );

    renderMessages(
      state.messages
    );
  }


  async function handleFileSelection(
    event
  ) {

    const files =
      [...(
        event.target.files || []
      )];

    if (!files.length) return;


    for (const file of files) {

      await sendFileMessage(
        file
      );

    }

    event.target.value = "";
  }


  async function sendFileMessage(
    file
  ) {

    if (!state.selectedUser) {
      return;
    }


    /*
      For permanent media:
      Supabase Storage bucket -> chat-media
      then insert the public/signed URL
      into messages.
    */

    const client = db();


    if (
      client &&
      !String(
        state.selectedUser.id
      ).startsWith("local-")
    ) {

      showToast(
        "Storage upload hook is ready; connect your 'chat-media' bucket for permanent files."
      );

      return;
    }


    state.messages.push({

      id:
        `local-file-${Date.now()}`,

      sender_id:
        state.currentUser?.id,

      receiver_id:
        state.selectedUser?.id,

      content:
        file.name,

      file_name:
        file.name,

      mime_type:
        file.type,

      created_at:
        new Date().toISOString()
    });


    renderMessages(
      state.messages
    );
  }


  function buildEmojiPicker() {

    const emojis = [
      "😀","😂","🤣","😊",
      "😍","🥰","😘","😎",
      "🤔","😴","😭","😡",
      "🤯","😱","👍","👎",
      "👏","🙏","❤️","🔥",
      "🎉","✨","💯","✅",
      "❌","💀","👀","🚀",
      "💎","⭐","😂","🙌"
    ];


    const grid =
      $("#emojiGrid");

    if (!grid) return;


    grid.innerHTML =
      emojis
        .map(
          emoji =>
            `
              <button
                class="emoji-button"
                type="button"
                data-emoji="${emoji}"
              >
                ${emoji}
              </button>
            `
        )
        .join("");


    $$(".emoji-button", grid)
      .forEach(button => {

        button.addEventListener(
          "click",
          () => {

            insertTextAtCursor(
              $("#messageInput"),
              button.dataset.emoji
            );

          }
        );

      });
  }


  function buildStickerPicker() {

    const stickers = [
      "😂",
      "🤣",
      "😭",
      "😎",
      "🔥",
      "❤️",
      "💀",
      "👀",
      "🤯",
      "🥳",
      "😡",
      "🙏"
    ];


    const grid =
      $("#stickerGrid");

    if (!grid) return;


    grid.innerHTML =
      stickers
        .map(
          sticker =>
            `
              <button
                class="sticker-button"
                type="button"
                data-sticker="${sticker}"
              >
                ${sticker}
              </button>
            `
        )
        .join("");


    $$(".sticker-button", grid)
      .forEach(button => {

        button.addEventListener(
          "click",
          () => {

            insertTextAtCursor(
              $("#messageInput"),
              button.dataset.sticker
            );

            $("#stickerPanel")
              ?.classList.add(
                "hidden"
              );
          }
        );

      });
  }


  function insertTextAtCursor(
    input,
    text
  ) {

    if (!input) return;

    const start =
      input.selectionStart;

    const end =
      input.selectionEnd;


    input.value =
      input.value.slice(
        0,
        start
      ) +
      text +
      input.value.slice(
        end
      );


    input.selectionStart =
      input.selectionEnd =
        start + text.length;

    input.focus();


    autoResizeTextarea(
      input
    );

    $("#sendMessageButton")
      .disabled =
      !input.value.trim();
  }


  /* =======================================================
     SAVED MESSAGES
  ======================================================= */

  function renderSavedMessages() {

    const list =
      $("#savedMessagesList");

    if (!list) return;


    if (!state.savedMessages.length) {

      list.innerHTML = `
        <div class="empty-state-card">
          <div class="empty-icon">
            <i class="fa-solid fa-bookmark"></i>
          </div>

          <h3>No saved messages</h3>

          <p>
            Save a message from any chat.
          </p>
        </div>
      `;

      return;
    }


    list.innerHTML =
      [...state.savedMessages]
        .reverse()
        .map(item => {

          return `
            <article class="saved-card">

              ${avatarHtml(
                state.selectedUser || {},
                "avatar-sm"
              )}

              <div class="saved-content">

                <strong>
                  Saved message
                </strong>

                <div class="saved-message">
                  ${escapeHtml(
                    item.content ||
                    item.file_name ||
                    "Media"
                  )}
                </div>

                <div class="saved-meta">
                  ${formatDateTime(
                    item.saved_at ||
                    item.created_at
                  )}
                </div>

              </div>

              <button
                class="icon-btn tiny remove-saved"
                data-saved-id="${escapeHtml(
                  item.id || ""
                )}"
                title="Unsave"
              >
                <i class="fa-solid fa-xmark"></i>
              </button>

            </article>
          `;

        })
        .join("");


    $$(".remove-saved", list)
      .forEach(button => {

        button.addEventListener(
          "click",
          () => {

            state.savedMessages =
              state.savedMessages.filter(
                item =>
                  String(item.id) !==
                  String(
                    button.dataset.savedId
                  )
              );

            saveLocalState();
            renderSavedMessages();

          }
        );

      });
  }


  /* =======================================================
     NOTIFICATIONS
  ======================================================= */

  function addNotification(
    notification
  ) {

    state.notifications.push({
      id:
        `notification-${Date.now()}-${Math.random()}`,

      created_at:
        new Date().toISOString(),

      read: false,

      ...notification
    });

    saveLocalState();

    updateNotificationBadges();

    if (
      state.currentTab ===
      "notifications"
    ) {
      renderNotifications();
    }
  }


  function renderNotifications() {

    const list =
      $("#notificationsList");

    if (!list) return;


    if (!state.notifications.length) {

      list.innerHTML = `
        <div class="empty-state-card">
          <div class="empty-icon">
            <i class="fa-regular fa-bell"></i>
          </div>

          <h3>No notifications</h3>

          <p>
            New activity will appear here.
          </p>
        </div>
      `;

      updateNotificationBadges();

      return;
    }


    list.innerHTML =
      [...state.notifications]
        .reverse()
        .map(item => {

          return `
            <article
              class="notification-card ${
                item.read
                  ? ""
                  : "unread"
              }"
              data-notification-id="${escapeHtml(
                item.id
              )}"
            >

              <div class="notification-icon">
                <i class="fa-solid fa-bell"></i>
              </div>

              <div>

                <div>
                  ${escapeHtml(
                    item.text || ""
                  )}
                </div>

                <div class="notification-meta">
                  ${formatDateTime(
                    item.created_at
                  )}
                </div>

              </div>

            </article>
          `;

        })
        .join("");


    $$(".notification-card", list)
      .forEach(item => {

        item.addEventListener(
          "click",
          () => {

            const notification =
              state.notifications.find(
                x =>
                  String(x.id) ===
                  String(
                    item.dataset.notificationId
                  )
              );

            if (!notification) {
              return;
            }

            notification.read = true;

            saveLocalState();
            renderNotifications();

          }
        );

      });


    updateNotificationBadges();
  }


  function updateNotificationBadges() {

    const unread =
      state.notifications.filter(
        x =>
          !x.read
      ).length;


    const count =
      $("#notificationCount");

    if (count) {

      count.textContent =
        unread;

      count.classList.toggle(
        "hidden",
        unread === 0
      );
    }
  }


  function initNotifications() {

    $("#clearNotifications")
      ?.addEventListener(
        "click",
        () => {

          state.notifications = [];

          saveLocalState();

          renderNotifications();

          showToast(
            "Notifications cleared."
          );

        }
      );

    updateNotificationBadges();
  }


  /* =======================================================
     COMMUNITIES
  ======================================================= */

  async function loadCommunities() {

    const client = db();

    let communities = [];


    if (client) {

      try {

        const {
          data,
          error
        } = await client
          .from("communities")
          .select("*")
          .order(
            "created_at",
            {
              ascending: false
            }
          );

        if (!error) {
          communities =
            data || [];
        }

      } catch (error) {

        console.warn(
          "Communities table is not connected yet:",
          error
        );

      }

    }


    state.communities =
      communities;

    renderCommunities();
  }


  function renderCommunities() {

    const list =
      $("#communitiesList");

    if (!list) return;


    let communities =
      state.communities;


    if (
      state.currentCommunityType !==
      "all"
    ) {

      communities =
        communities.filter(
          item =>
            item.type ===
            state.currentCommunityType
        );
    }


    if (!communities.length) {

      list.innerHTML = `
        <div class="empty-state-card">
          <div class="empty-icon">
            <i class="fa-solid fa-users"></i>
          </div>

          <h3>No communities</h3>

          <p>
            Create a group or channel to start.
          </p>
        </div>
      `;

      return;
    }


    list.innerHTML =
      communities.map(
        community => {

          return `
            <article class="community-card">

              <div class="community-top">

                <div class="community-avatar">
                  ${
                    community.avatar_url
                      ? `
                        <img
                          src="${escapeHtml(
                            community.avatar_url
                          )}"
                          alt=""
                        />
                      `
                      : `
                        <i
                          class="fa-solid ${
                            community.type ===
                            "channel"
                              ? "fa-bullhorn"
                              : "fa-users"
                          }"
                        ></i>
                      `
                  }
                </div>


                <div class="community-info">

                  <div class="community-name">
                    <strong>
                      ${escapeHtml(
                        community.name ||
                        "Community"
                      )}
                    </strong>
                  </div>

                  <div class="community-username">
                    ${
                      community.username
                        ? `@${escapeHtml(
                            community.username
                          )}`
                        : "Private community"
                    }
                  </div>

                </div>

              </div>


              <div class="community-bio">
                ${escapeHtml(
                  community.bio || ""
                )}
              </div>


              <div class="community-actions">

                <button
                  class="secondary-btn"
                  data-community-profile="${escapeHtml(
                    community.id || ""
                  )}"
                >
                  Profile
                </button>

                <button
                  class="primary-btn"
                  data-community-open="${escapeHtml(
                    community.id || ""
                  )}"
                >
                  Open
                </button>

              </div>

            </article>
          `;

        }
      ).join("");


    $$(
      "[data-community-open]",
      list
    ).forEach(button => {

      button.addEventListener(
        "click",
        () => {

          showToast(
            "Community chat screen is ready for database connection."
          );

        }
      );

    });

  }


  async function createCommunity(
    event
  ) {

    event.preventDefault();


    const type =
      $("#communityType")
        ?.value || "group";

    const name =
      $("#communityName")
        ?.value
        ?.trim() || "";

    let username =
      normalizeUsername(
        $("#communityUsername")
          ?.value || ""
      );

    const bio =
      $("#communityBio")
        ?.value
        ?.trim() || "";


    if (!name) {

      showToast(
        "Community name is required.",
        "error"
      );

      return;
    }


    if (
      state.selectedCommunityPrivacy ===
      "private"
    ) {

      username =
        generatePrivateUsername();
    }


    if (
      state.selectedCommunityPrivacy ===
        "public" &&
      username.length < 5
    ) {

      showToast(
        "Public username must contain at least 5 characters.",
        "error"
      );

      return;
    }


    const payload = {

      name,

      username:
        username || null,

      bio,

      type,

      visibility:
        state.selectedCommunityPrivacy,

      creator_id:
        state.currentUser?.id || null,

      created_at:
        new Date().toISOString()

    };


    const client = db();


    if (
      client &&
      state.currentUser?.id &&
      !String(
        state.currentUser.id
      ).startsWith("local-")
    ) {

      try {

        const {
          data,
          error
        } = await client
          .from("communities")
          .insert(payload)
          .select()
          .single();

        if (error) throw error;

        state.communities.unshift(
          data
        );

      } catch (error) {

        console.error(error);

        showToast(
          "Community creation failed. Create the communities table first.",
          "error"
        );

        return;
      }

    } else {

      state.communities.unshift({
        id:
          `local-community-${Date.now()}`,
        ...payload
      });
    }


    closeModal(
      "communityModal"
    );

    $("#communityForm")
      ?.reset();

    state.selectedCommunityPrivacy =
      "public";

    renderCommunities();

    showToast(
      `${type === "channel" ? "Channel" : "Group"} created.`
    );
  }


  /* =======================================================
     OWNER / ADMIN
  ======================================================= */

  function openOwnerAdminPanel() {

    if (!isAdmin()) {

      showToast(
        "You do not have access to this panel.",
        "error"
      );

      return;
    }


    $("#ownerAdminModal")
      ?.classList.remove(
        "hidden"
      );


    configureAdminPanel();

    loadAdminOverview();
  }


  function configureAdminPanel() {

    const ownerOnly =
      isOwner();


    $$(".owner-only")
      .forEach(item => {

        item.classList.toggle(
          "hidden",
          !ownerOnly
        );

      });


    $("#moderationTitle")
      .textContent =
      ownerOnly
        ? "Owner Panel"
        : "Admin Panel";

  }


  async function loadAdminOverview() {

    const client = db();


    let users = 0;
    let admins = 0;
    let verified = 0;
    let reports = 0;


    if (client) {

      try {

        const userResult =
          await client
            .from("profiles")
            .select(
              "id",
              {
                count: "exact",
                head: true
              }
            );

        users =
          userResult.count || 0;

      } catch {}


      try {

        const result =
          await client
            .from("profiles")
            .select(
              "id",
              {
                count: "exact",
                head: true
              }
            )
            .in(
              "role",
              [
                "admin",
                "owner"
              ]
            );

        admins =
          result.count || 0;

      } catch {}


      try {

        const result =
          await client
            .from("profiles")
            .select(
              "id",
              {
                count: "exact",
                head: true
              }
            )
            .eq(
              "is_verified",
              true
            );

        verified =
          result.count || 0;

      } catch {}


      try {

        const result =
          await client
            .from("reports")
            .select(
              "id",
              {
                count: "exact",
                head: true
              }
            )
            .eq(
              "status",
              "open"
            );

        reports =
          result.count || 0;

      } catch {}

    }


    $("#statUsers")
      .textContent = users;

    $("#statAdmins")
      .textContent = admins;

    $("#statVerified")
      .textContent = verified;

    $("#statReports")
      .textContent = reports;


    if (!client) {

      $("#statUsers")
        .textContent =
        "—";

      $("#statAdmins")
        .textContent =
        "—";

      $("#statVerified")
        .textContent =
        "—";

      $("#statReports")
        .textContent =
        "—";
    }
  }


  function initAdminPanel() {

    $("#ownerAdminButton")
      ?.addEventListener(
        "click",
        openOwnerAdminPanel
      );


    $$(".admin-nav")
      .forEach(button => {

        button.addEventListener(
          "click",
          () => {

            const section =
              button.dataset.adminSection;

            $$(".admin-nav")
              .forEach(item =>
                item.classList.remove(
                  "active"
                )
              );

            $$(".admin-section")
              .forEach(item =>
                item.classList.remove(
                  "active"
                )
              );

            button.classList.add(
              "active"
            );

            $(`#admin-${section}`)
              ?.classList.add(
                "active"
              );


            if (
              section === "admins"
            ) {
              loadAdminList();
            }

            if (
              section === "reports"
            ) {
              loadReports();
            }

            if (
              section === "history"
            ) {
              loadAdminHistory();
            }

          }
        );

      });


    $("#adminUserSearch")
      ?.addEventListener(
        "input",
        debounce(
          searchAdminUsers,
          250
        )
      );


    $("#addAdminButton")
      ?.addEventListener(
        "click",
        addAdminByUsername
      );


    $("#adminBotSend")
      ?.addEventListener(
        "click",
        runAdminBot
      );


    $("#adminBotInput")
      ?.addEventListener(
        "keydown",
        event => {

          if (
            event.key === "Enter"
          ) {

            event.preventDefault();

            runAdminBot();
          }

        }
      );


    $(
      "#ownerProtectionToggle"
    )?.addEventListener(
      "click",
      toggleOwnerProtection
    );


    $(
      "#communityProtectionToggle"
    )?.addEventListener(
      "click",
      toggleCommunityProtection
    );


    [
      "#historyTypeFilter",
      "#historyActionFilter",
      "#historyAdminSearch"
    ].forEach(selector => {

      $(selector)
        ?.addEventListener(
          "input",
          debounce(
            loadAdminHistory,
            200
          )
        );

      $(selector)
        ?.addEventListener(
          "change",
          loadAdminHistory
        );

    });

  }


  async function searchAdminUsers() {

    const query =
      normalizeUsername(
        $("#adminUserSearch")
          ?.value || ""
      );

    const list =
      $("#adminUserResults");

    if (!list) return;


    if (!query) {

      list.innerHTML = "";

      return;
    }


    const client = db();

    let profiles = [];


    if (client) {

      try {

        const {
          data,
          error
        } = await client
          .from("profiles")
          .select("*")
          .ilike(
            "username",
            `%${query}%`
          )
          .limit(30);

        if (!error) {

          profiles =
            data || [];
        }

      } catch (error) {

        console.warn(
          error
        );

      }

    }


    renderAdminUserResults(
      profiles
    );
  }


  function renderAdminUserResults(
    profiles
  ) {

    const list =
      $("#adminUserResults");

    if (!list) return;


    if (!profiles.length) {

      list.innerHTML = `
        <div class="empty-state-card">
          <p>No users found.</p>
        </div>
      `;

      return;
    }


    list.innerHTML =
      profiles
        .map(profile => {

          const protectedUser =
            profile.role === "owner" ||
            profile.username === "owner";


          return `
            <div class="admin-user-card">

              ${avatarHtml(profile)}

              <div class="admin-card-info">

                <strong>
                  ${escapeHtml(
                    profile.full_name ||
                    profile.username ||
                    "User"
                  )}

                  ${verifiedBadge(profile)}
                </strong>

                <span>
                  @${escapeHtml(
                    profile.username || ""
                  )}
                </span>

                <span>
                  Role:
                  ${escapeHtml(
                    profile.role || "user"
                  )}
                </span>

              </div>


              <div class="admin-card-actions">

                ${
                  profile.is_verified
                    ? `
                      <button
                        class="danger-btn"
                        data-admin-action="remove_verified"
                        data-user-id="${escapeHtml(
                          profile.id
                        )}"
                      >
                        Remove Verified
                      </button>
                    `
                    : `
                      <button
                        class="secondary-btn"
                        data-admin-action="verified"
                        data-user-id="${escapeHtml(
                          profile.id
                        )}"
                      >
                        Verified
                      </button>
                    `
                }


                ${
                  !protectedUser
                    ? `
                      <button
                        class="secondary-btn"
                        data-admin-action="block"
                        data-user-id="${escapeHtml(
                          profile.id
                        )}"
                      >
                        Block
                      </button>

                      <button
                        class="danger-btn"
                        data-admin-action="ban"
                        data-user-id="${escapeHtml(
                          profile.id
                        )}"
                      >
                        Ban
                      </button>
                    `
                    : ""
                }

              </div>

            </div>
          `;

        })
        .join("");


    $$("[data-admin-action]", list)
      .forEach(button => {

        button.addEventListener(
          "click",
          () => {

            const action =
              button.dataset.adminAction;

            const userId =
              button.dataset.userId;

            executeAdminUserAction(
              action,
              userId
            );

          }
        );

      });
  }


  async function executeAdminUserAction(
    action,
    userId
  ) {

    const allowed =
      isOwner() ||
      hasPermission(
        action === "verified" ||
        action === "remove_verified"
          ? "verified"
          : action === "block"
            ? "user_block"
            : action === "ban"
              ? "user_ban"
              : ""
      );


    if (!allowed) {

      showToast(
        "You don't have permission for this action.",
        "error"
      );

      return;
    }


    const target =
      findProfileById(
        userId
      );


    if (
      target &&
      (
        target.role === "owner" ||
        target.username === "owner"
      )
    ) {

      showToast(
        "Owner protection prevents this action.",
        "error"
      );

      return;
    }


    const rpcMap = {

      verified:
        "admin_set_verified",

      remove_verified:
        "admin_remove_verified",

      block:
        "admin_block_user",

      ban:
        "admin_ban_user"

    };


    const rpc =
      rpcMap[action];


    const client = db();


    if (client && rpc) {

      try {

        const {
          error
        } = await client.rpc(
          rpc,
          {
            target_user_id:
              userId
          }
        );

        if (error) throw error;

      } catch (error) {

        console.error(
          error
        );

        showToast(
          `Action failed. Create the ${rpc} server function/RPC.`,
          "error"
        );

        return;
      }
    }


    addAdminLog({
      action,
      target_user_id:
        userId
    });


    showToast(
      `Action "${action}" completed.`
    );
  }


  async function loadAdminList() {

    const client = db();

    const list =
      $("#adminList");

    if (!list) return;


    if (!client) {

      list.innerHTML = `
        <div class="empty-state-card">
          <p>
            Connect Supabase to load administrators.
          </p>
        </div>
      `;

      return;
    }


    try {

      const {
        data,
        error
      } = await client
        .from("profiles")
        .select(`
          id,
          username,
          full_name,
          avatar_url,
          role,
          is_verified,
          admin_permissions,
          admin_duration_until
        `)
        .in(
          "role",
          [
            "admin",
            "owner"
          ]
        )
        .order(
          "role",
          {
            ascending: true
          }
        );


      if (error) {
        throw error;
      }


      const admins =
        data || [];


      $("#adminCountLabel")
        .textContent =
        `${admins.length} admins`;


      list.innerHTML =
        admins
          .map(admin => {

            const owner =
              admin.role ===
              "owner";

            return `
              <div class="admin-card-row">

                ${avatarHtml(admin)}

                <div class="admin-card-info">

                  <strong>
                    ${escapeHtml(
                      admin.full_name ||
                      admin.username ||
                      "Admin"
                    )}

                    ${verifiedBadge(admin)}
                  </strong>

                  <span>
                    @${escapeHtml(
                      admin.username || ""
                    )}
                  </span>

                  <span>
                    ${
                      owner
                        ? "Permanent Owner"
                        : (
                          admin.admin_duration_until
                            ? `Until ${formatDateTime(
                                admin.admin_duration_until
                              )}`
                            : "Admin"
                        )
                    }
                  </span>

                </div>


                ${
                  owner
                    ? `
                      <span
                        style="
                          color:var(--yellow);
                          font-size:10px;
                          font-weight:800;
                        "
                      >
                        OWNER
                      </span>
                    `
                    : `
                      <button
                        class="danger-btn"
                        data-remove-admin="${escapeHtml(
                          admin.id
                        )}"
                      >
                        Remove
                      </button>
                    `
                }

              </div>
            `;

          })
          .join("");


      $$("[data-remove-admin]", list)
        .forEach(button => {

          button.addEventListener(
            "click",
            () =>
              removeAdmin(
                button.dataset
                  .removeAdmin
              )
          );

        });

    } catch (error) {

      console.error(error);

      list.innerHTML = `
        <div class="empty-state-card">
          <p>
            Admin data could not be loaded.
          </p>
        </div>
      `;
    }
  }


  async function addAdminByUsername() {

    if (!isOwner()) {

      showToast(
        "Only the Owner can add admins.",
        "error"
      );

      return;
    }


    const username =
      normalizeUsername(
        prompt(
          "Admin username:"
        ) || ""
      );

    if (!username) return;


    const permissionInput =
      prompt(
        "Permissions (comma separated):\n\nverified,user_block,user_ban,manage_reports,manage_groups,manage_channels,manage_invites,edit_user"
      );


    const permissions = {};

    String(
      permissionInput || ""
    )
      .split(",")
      .map(x => x.trim())
      .filter(Boolean)
      .forEach(key => {
        permissions[key] = true;
      });


    const durationInput =
      prompt(
        "Duration:\npermanent\n1d\n7d\n30d\ncustom"
      ) || "permanent";


    let until = null;


    if (
      durationInput !==
      "permanent"
    ) {

      const dayMap = {

        "1d": 1,
        "7d": 7,
        "30d": 30

      };


      const days =
        dayMap[
          durationInput
        ] ||
        Number(
          durationInput.replace(
            /\D/g,
            ""
          )
        ) ||
        0;


      if (days > 0) {

        until =
          new Date(
            Date.now() +
            days *
            86400000
          ).toISOString();
      }
    }


    const client = db();

    if (!client) {

      showToast(
        "Supabase required.",
        "error"
      );

      return;
    }


    try {

      const {
        data,
        error
      } = await client
        .from("profiles")
        .select("id,username")
        .eq(
          "username",
          username
        )
        .single();


      if (error) throw error;


      const {
        error:
          updateError
      } = await client
        .from("profiles")
        .update({

          role: "admin",

          admin_permissions:
            permissions,

          admin_duration_until:
            until

        })
        .eq(
          "id",
          data.id
        );


      if (updateError) {
        throw updateError;
      }


      await addAdminLog({
        action:
          "add_admin",
        target_user_id:
          data.id,
        details:
          {
            permissions,
            duration:
              until
                ? "temporary"
                : "permanent"
          }
      });


      showToast(
        "Admin added."
      );

      loadAdminList();

    } catch (error) {

      console.error(error);

      showToast(
        "Could not add admin.",
        "error"
      );
    }
  }


  async function removeAdmin(
    userId
  ) {

    if (!isOwner()) {

      showToast(
        "Only the Owner can remove admins.",
        "error"
      );

      return;
    }


    const confirmed =
      confirm(
        "Remove admin role from this user?"
      );

    if (!confirmed) {
      return;
    }


    const client = db();

    if (!client) {
      return;
    }


    try {

      const {
        error
      } = await client
        .from("profiles")
        .update({
          role: "user",
          admin_permissions: {},
          admin_duration_until: null
        })
        .eq(
          "id",
          userId
        );


      if (error) {
        throw error;
      }


      await addAdminLog({
        action:
          "remove_admin",

        target_user_id:
          userId
      });


      showToast(
        "Admin removed."
      );

      loadAdminList();

    } catch (error) {

      console.error(error);

      showToast(
        "Unable to remove admin.",
        "error"
      );
    }
  }


  async function loadReports() {

    const client = db();

    const list =
      $("#reportsList");

    if (!list) return;


    if (!client) {

      list.innerHTML = `
        <div class="empty-state-card">
          <p>
            Connect Supabase to load reports.
          </p>
        </div>
      `;

      return;
    }


    try {

      const {
        data,
        error
      } = await client
        .from("reports")
        .select("*")
        .order(
          "created_at",
          {
            ascending: false
          }
        );

      if (error) {
        throw error;
      }


      if (!data?.length) {

        list.innerHTML = `
          <div class="empty-state-card">
            <div class="empty-icon">
              <i class="fa-solid fa-flag"></i>
            </div>

            <h3>No reports</h3>

            <p>
              There are no submitted reports.
            </p>
          </div>
        `;

        return;
      }


      list.innerHTML =
        data.map(report => {

          return `
            <div class="admin-card-row">

              <div
                class="notification-icon"
              >
                <i class="fa-solid fa-flag"></i>
              </div>

              <div class="admin-card-info">

                <strong>
                  ${escapeHtml(
                    report.reason ||
                    "Report"
                  )}
                </strong>

                <span>
                  ${
                    report.target_type ||
                    "unknown"
                  }
                  •
                  ${
                    report.status ||
                    "open"
                  }
                </span>

                <span>
                  ${formatDateTime(
                    report.created_at
                  )}
                </span>

              </div>

              ${
                hasPermission(
                  "manage_reports"
                )
                  ? `
                    <button
                      class="secondary-btn"
                      data-report-id="${escapeHtml(
                        report.id
                      )}"
                    >
                      Review
                    </button>
                  `
                  : ""
              }

            </div>
          `;

        }).join("");

    } catch (error) {

      console.error(error);

      list.innerHTML = `
        <div class="empty-state-card">
          <p>Could not load reports.</p>
        </div>
      `;
    }
  }


  async function loadAdminHistory() {

    const client = db();

    const list =
      $("#adminHistoryList");

    if (!list) return;


    if (!client) {

      list.innerHTML = `
        <div class="empty-state-card">
          <p>
            Connect Supabase to load activity history.
          </p>
        </div>
      `;

      return;
    }


    const type =
      $("#historyTypeFilter")
        ?.value || "all";

    const action =
      $("#historyActionFilter")
        ?.value || "all";

    const adminSearch =
      normalizeUsername(
        $("#historyAdminSearch")
          ?.value || ""
      );


    try {

      let query =
        client
          .from("admin_activity_logs")
          .select("*")
          .order(
            "created_at",
            {
              ascending: false
            }
          )
          .limit(100);


      if (
        action !==
        "all"
      ) {

        query =
          query.eq(
            "action",
            action
          );
      }


      if (
        type ===
        "permanent"
      ) {

        query =
          query.eq(
            "duration_type",
            "permanent"
          );

      } else if (
        type ===
        "temporary"
      ) {

        query =
          query.eq(
            "duration_type",
            "temporary"
          );
      }


      const {
        data,
        error
      } = await query;

      if (error) {
        throw error;
      }


      let logs =
        data || [];


      if (adminSearch) {

        logs =
          logs.filter(
            item =>
              normalizeUsername(
                item.admin_username || ""
              ).includes(
                adminSearch
              )
          );
      }


      list.innerHTML =
        logs.length
          ? logs.map(
              renderHistoryRow
            ).join("")
          : `
            <div class="empty-state-card">
              <p>No history items found.</p>
            </div>
          `;

    } catch (error) {

      console.error(error);

      list.innerHTML = `
        <div class="empty-state-card">
          <p>
            History table is not connected yet.
          </p>
        </div>
      `;
    }
  }


  function renderHistoryRow(
    item
  ) {

    return `
      <div class="history-row">

        <div class="history-row-top">

          <div class="history-action">
            ${escapeHtml(
              item.action ||
              "action"
            )}
          </div>

          <div class="history-time">
            ${formatDateTime(
              item.created_at
            )}
          </div>

        </div>

        <div class="history-row-details">

          Admin:
          @${escapeHtml(
            item.admin_username ||
            "unknown"
          )}

          ${
            item.target_username
              ? `
                <br>
                Target:
                @${escapeHtml(
                  item.target_username
                )}
              `
              : ""
          }

        </div>

      </div>
    `;
  }


  async function addAdminLog(
    log
  ) {

    const client = db();

    if (
      client &&
      state.currentUser?.id
    ) {

      try {

        await client
          .from("admin_activity_logs")
          .insert({

            admin_id:
              state.currentUser.id,

            admin_username:
              state.currentProfile
                ?.username,

            created_at:
              new Date().toISOString(),

            ...log

          });

      } catch (error) {

        console.warn(
          "Admin log error:",
          error
        );
      }
    }
  }


  function runAdminBot() {

    const input =
      $("#adminBotInput");

    const chat =
      $("#adminBotChat");

    const command =
      input?.value
        ?.trim() || "";

    if (!command) {
      return;
    }


    chat.insertAdjacentHTML(
      "beforeend",
      `
        <div
          style="
            margin:7px 0;
            text-align:right;
          "
        >
          <div
            style="
              display:inline-block;
              background:rgba(39,211,255,.10);
              padding:8px 10px;
              border-radius:10px;
              font-size:11px;
            "
          >
            ${escapeHtml(
              command
            )}
          </div>
        </div>
      `
    );


    let response =
      "I don't recognize that command.";


    const lower =
      command.toLowerCase();


    if (
      lower === "/help"
    ) {

      response =
        "/help — show commands\n" +
        "/stats — platform statistics\n" +
        "/reports — open reports\n" +
        "/admins — administrator list\n" +
        "/owner — owner protection status";

    } else if (
      lower === "/stats"
    ) {

      response =
        "Use Overview for platform statistics.";

    } else if (
      lower === "/reports"
    ) {

      response =
        "Open Reports section to review reports.";

    } else if (
      lower === "/admins"
    ) {

      response =
        "Open Admins section to manage administrators.";

    } else if (
      lower === "/owner"
    ) {

      response =
        "Owner protection is enabled by default.";

    }


    chat.insertAdjacentHTML(
      "beforeend",
      `
        <div
          style="
            margin:7px 0;
          "
        >
          <div
            class="bot-message"
            style="white-space:pre-line"
          >
            ${escapeHtml(
              response
            )}
          </div>
        </div>
      `
    );


    chat.scrollTop =
      chat.scrollHeight;

    input.value = "";
  }


  async function toggleOwnerProtection() {

    const button =
      $("#ownerProtectionToggle");

    button?.classList.toggle(
      "active"
    );


    if (!isOwner()) {

      showToast(
        "Only the Owner can change owner protection.",
        "error"
      );

      button?.classList.add(
        "active"
      );

      return;
    }


    await addAdminLog({
      action:
        "owner_protection_change"
    });

    showToast(
      "Owner protection setting updated."
    );
  }


  async function toggleCommunityProtection() {

    const button =
      $("#communityProtectionToggle");

    button?.classList.toggle(
      "active"
    );


    if (!isOwner()) {

      showToast(
        "Only the Owner can change community protection.",
        "error"
      );

      button?.classList.add(
        "active"
      );

      return;
    }


    await addAdminLog({
      action:
        "community_protection_change"
    });

    showToast(
      "Community protection setting updated."
    );
  }


  /* =======================================================
     PROFILE DRAWER
  ======================================================= */

  function openProfileDrawer(
    profile
  ) {

    if (!profile) return;


    state.currentProfileForDrawer =
      profile;


    $("#profileOverlay")
      ?.classList.remove(
        "hidden"
      );


    $("#profileDrawer")
      ?.classList.add(
        "open"
      );


    renderProfileDrawer(
      profile
    );
  }


  function closeProfileDrawer() {

    $("#profileOverlay")
      ?.classList.add(
        "hidden"
      );

    $("#profileDrawer")
      ?.classList.remove(
        "open"
      );

    state.currentProfileForDrawer =
      null;
  }


  function renderProfileDrawer(
    profile
  ) {

    $("#drawerAvatar").outerHTML =
      avatarHtml(
        profile,
        "avatar-xxl"
      ).replace(
        'class="avatar avatar-xxl"',
        'id="drawerAvatar" class="avatar avatar-xxl"'
      );


    $("#drawerName")
      .textContent =
      profile.full_name ||
      profile.username ||
      "User";


    $("#drawerVerified")
      .innerHTML =
      verifiedBadge(profile);


    $("#drawerUsername")
      .textContent =
      `@${profile.username || ""}`;


    $("#drawerOnline")
      .textContent =
      profile.is_online
        ? "Online"
        : formatLastSeen(
            profile.last_seen
          );


    $("#drawerOnline")
      .style.color =
      profile.is_online
        ? "var(--green)"
        : "var(--text-dim)";


    $("#drawerFullName")
      .textContent =
      profile.full_name ||
      "—";


    $("#drawerNickname")
      .textContent =
      profile.nickname ||
      "—";


    $("#drawerLastSeen")
      .textContent =
      formatLastSeen(
        profile.last_seen
      );


    $("#drawerBio")
      .textContent =
      profile.bio ||
      "No bio yet.";


    $("#drawerDecoration")
      .textContent =
      getDecorationEmoji(
        profile
      );


    const actions =
      $("#drawerActions");

    const own =
      String(profile.id) ===
      String(
        state.currentProfile?.id
      );


    if (own) {

      actions.innerHTML = `
        <button
          class="primary-btn full-width"
          id="drawerEditOwnProfile"
        >
          <i class="fa-solid fa-pen"></i>
          Edit Profile
        </button>
      `;

      $("#drawerEditOwnProfile")
        ?.addEventListener(
          "click",
          () => {

            closeProfileDrawer();

            switchTab(
              "settings"
            );

            $(
              '[data-settings-section="profile"]'
            )?.click();

          }
        );

    } else {

      actions.innerHTML = `
        <button
          class="primary-btn full-width"
          id="drawerMessageButton"
        >
          <i class="fa-solid fa-message"></i>
          Message
        </button>

        <button
          class="secondary-btn full-width"
          id="drawerContactButton"
        >
          <i class="fa-solid fa-user-plus"></i>
          Add Contact
        </button>
      `;


      $("#drawerMessageButton")
        ?.addEventListener(
          "click",
          () => {

            closeProfileDrawer();

            openChatWithUser(
              profile
            );

          }
        );


      $("#drawerContactButton")
        ?.addEventListener(
          "click",
          () => {

            sendContactRequest(
              profile
            );

          }
        );
    }


    addSearchHistory(
      profile.username ||
      ""
    );
  }


  function initProfileDrawer() {

    $("#miniProfileButton")
      ?.addEventListener(
        "click",
        event => {

          if (
            event.target.closest(
              "#miniProfileMenu"
            )
          ) {
            return;
          }

          openProfileDrawer(
            state.currentProfile
          );

        }
      );


    $("#miniProfileMenu")
      ?.addEventListener(
        "click",
        event => {

          event.stopPropagation();

          const menu =
            $("#miniProfileContext");

          menu.classList.toggle(
            "hidden"
          );

          if (
            !menu.classList.contains(
              "hidden"
            )
          ) {

            const rect =
              $("#miniProfileMenu")
                .getBoundingClientRect();

            menu.style.left =
              `${rect.right + 5}px`;

            menu.style.top =
              `${rect.top}px`;
          }
        }
      );


    $$("#miniProfileContext button")
      .forEach(button => {

        button.addEventListener(
          "click",
          () => {

            const action =
              button.dataset.menuAction;

            $("#miniProfileContext")
              .classList.add(
                "hidden"
              );

            if (action === "profile") {
              openProfileDrawer(
                state.currentProfile
              );
            }

            if (action === "settings") {
              switchTab(
                "settings"
              );
            }

          }
        );
      });


    $("#closeProfileDrawer")
      ?.addEventListener(
        "click",
        closeProfileDrawer
      );


    $("#profileOverlay")
      ?.addEventListener(
        "click",
        closeProfileDrawer
      );


    $("#chatProfileButton")
      ?.addEventListener(
        "click",
        () => {

          if (state.selectedUser) {

            openProfileDrawer(
              state.selectedUser
            );

          }

        }
      );


    $("#chatUserHeader")
      ?.addEventListener(
        "click",
        () => {

          if (state.selectedUser) {

            openProfileDrawer(
              state.selectedUser
            );

          }
        }
      );


    $$(".profile-media-tab")
      .forEach(button => {

        button.addEventListener(
          "click",
          () => {

            $$(".profile-media-tab")
              .forEach(item =>
                item.classList.remove(
                  "active"
                )
              );

            button.classList.add(
              "active"
            );

            renderProfileMedia(
              button.dataset.mediaTab
            );

          }
        );

      });

  }


  function renderProfileMedia(
    type
  ) {

    const container =
      $("#profileMediaContent");

    if (!container) return;


    const media =
      state.messages.filter(
        message => {

          const mime =
            message.mime_type ||
            "";

          if (type === "photos") {
            return mime.startsWith(
              "image/"
            );
          }

          if (type === "videos") {
            return mime.startsWith(
              "video/"
            );
          }

          if (type === "files") {
            return message.file_url &&
              !mime.startsWith(
                "image/"
              ) &&
              !mime.startsWith(
                "video/"
              );
          }

          return !!message.file_url;
        }
      );


    if (!media.length) {

      container.innerHTML = `
        <div class="empty-media">
          No ${escapeHtml(type)} yet.
        </div>
      `;

      return;
    }


    container.innerHTML =
      media
        .map(item => {

          return `
            <div
              style="
                padding:8px 10px;
                border:1px solid var(--border);
                border-radius:10px;
                margin-bottom:7px;
                font-size:11px;
              "
            >
              ${escapeHtml(
                item.file_name ||
                item.content ||
                "Media"
              )}
            </div>
          `;

        })
        .join("");
  }


  /* =======================================================
     DEVICES
  ======================================================= */

  function openDevicesModal() {

    $("#devicesModal")
      ?.classList.remove(
        "hidden"
      );

    renderDevices();
  }


  function renderDevices() {

    const list =
      $("#devicesList");

    if (!list) return;


    if (!state.devices.length) {

      state.devices = [
        {
          id:
            "current-device",

          device:
            "Desktop",

          browser:
            navigator.userAgent.includes(
              "Chrome"
            )
              ? "Chrome"
              : navigator.userAgent.includes(
                    "Firefox"
                  )
                ? "Firefox"
                : "Browser",

          last_active:
            new Date().toISOString(),

          login_time:
            new Date().toISOString(),

          current:
            true
        }
      ];

      saveLocalState();
    }


    list.innerHTML =
      state.devices
        .map(device => {

          return `
            <div class="device-card">

              <div class="device-icon">
                <i
                  class="fa-solid ${
                    device.device ===
                    "Mobile"
                      ? "fa-mobile-screen"
                      : "fa-desktop"
                  }"
                ></i>
              </div>

              <div class="device-info">

                <strong>
                  ${escapeHtml(
                    device.device
                  )}

                  ${
                    device.current
                      ? " • This device"
                      : ""
                  }
                </strong>

                <span>
                  Browser:
                  ${escapeHtml(
                    device.browser
                  )}
                </span>

                <span>
                  Last active:
                  ${formatDateTime(
                    device.last_active
                  )}
                </span>

                <span>
                  Login:
                  ${formatDateTime(
                    device.login_time
                  )}
                </span>

              </div>


              ${
                !device.current
                  ? `
                    <button
                      class="danger-btn"
                      data-device-id="${escapeHtml(
                        device.id
                      )}"
                    >
                      Logout
                    </button>
                  `
                  : ""
              }

            </div>
          `;

        })
        .join("");


    $$("[data-device-id]", list)
      .forEach(button => {

        button.addEventListener(
          "click",
          () => {

            state.devices =
              state.devices.filter(
                device =>
                  String(device.id) !==
                  String(
                    button.dataset.deviceId
                  )
              );

            saveLocalState();

            renderDevices();

            showToast(
              "Device session removed."
            );

          }
        );
      });


    const oldSessions =
      state.devices.filter(
        device =>
          !device.current &&
          Date.now() -
          new Date(
            device.login_time
          ).getTime() >
          24 * 60 * 60 * 1000
      );


    if (oldSessions.length) {

      // UI support for the 24-hour cleanup rule.
      // Actual session termination must use Supabase Auth.
      console.info(
        "Sessions older than 24h:",
        oldSessions
      );
    }
  }


  /* =======================================================
     COMMUNITY / INVITE EVENTS
  ======================================================= */

  function openCommunityModal(
    type
  ) {

    state.selectedCommunityType =
      type;


    $("#communityType")
      .value =
      type;


    $("#communityModalTitle")
      .textContent =
      type === "channel"
        ? "Create Channel"
        : "Create Group";


    $("#communityModal")
      ?.classList.remove(
        "hidden"
      );


    $("#communityForm")?.reset();


    state.selectedCommunityPrivacy =
      "public";


    $$(".privacy-card")
      .forEach(button => {

        button.classList.toggle(
          "active",
          button.dataset.communityPrivacy ===
          "public"
        );

      });


    $("#privateUsernamePreview")
      ?.classList.add(
        "hidden"
      );
  }


  function initCommunityModal() {

    $("#createGroupBtn")
      ?.addEventListener(
        "click",
        () =>
          openCommunityModal(
            "group"
          )
      );

    $("#createChannelBtn")
      ?.addEventListener(
        "click",
        () =>
          openCommunityModal(
            "channel"
          )
      );

    $("#communitiesCreateGroup")
      ?.addEventListener(
        "click",
        () =>
          openCommunityModal(
            "group"
          )
      );

    $("#communitiesCreateChannel")
      ?.addEventListener(
        "click",
        () =>
          openCommunityModal(
            "channel"
          )
      );


    $("#communityForm")
      ?.addEventListener(
        "submit",
        createCommunity
      );


    $$(".privacy-card")
      .forEach(button => {

        button.addEventListener(
          "click",
          () => {

            state.selectedCommunityPrivacy =
              button.dataset
                .communityPrivacy;


            $$(".privacy-card")
              .forEach(item =>
                item.classList.remove(
                  "active"
                )
              );

            button.classList.add(
              "active"
            );


            const preview =
              $("#privateUsernamePreview");

            if (
              state.selectedCommunityPrivacy ===
              "private"
            ) {

              preview.classList.remove(
                "hidden"
              );

              $("#privateUsernameText")
                .textContent =
                `@${generatePrivateUsername()}`;

            } else {

              preview.classList.add(
                "hidden"
              );
            }
          }
        );
      });
  }


  /* =======================================================
     COMMUNITY FILTER
  ======================================================= */

  function initCommunityTabs() {

    $$(".community-tab")
      .forEach(button => {

        button.addEventListener(
          "click",
          () => {

            state.currentCommunityType =
              button.dataset
                .communityType;


            $$(".community-tab")
              .forEach(item =>
                item.classList.remove(
                  "active"
                )
              );

            button.classList.add(
              "active"
            );

            renderCommunities();

          }
        );

      });
  }


  /* =======================================================
     CHAT SEARCH
  ======================================================= */

  function initChatSearch() {

    $("#chatSearchButton")
      ?.addEventListener(
        "click",
        () => {

          $("#messageSearchBar")
            ?.classList.remove(
              "hidden"
            );

          $("#messageSearchInput")
            ?.focus();
        }
      );


    $("#closeMessageSearch")
      ?.addEventListener(
        "click",
        () => {

          $("#messageSearchBar")
            ?.classList.add(
              "hidden"
            );

          $("#messageSearchInput")
            .value = "";

          renderMessages(
            state.messages
          );
        }
      );


    $("#messageSearchInput")
      ?.addEventListener(
        "input",
        debounce(
          searchMessagesInChat,
          200
        )
      );

  }


  function searchMessagesInChat() {

    const query =
      $("#messageSearchInput")
        ?.value
        ?.trim()
        ?.toLowerCase() || "";


    if (!query) {

      renderMessages(
        state.messages
      );

      return;
    }


    const filtered =
      state.messages.filter(
        message =>
          String(
            message.content || ""
          )
            .toLowerCase()
            .includes(query)
      );


    renderMessages(
      filtered
    );
  }


  /* =======================================================
     CHAT MENU
  ======================================================= */

  function initChatMenu() {

    $("#chatMenuButton")
      ?.addEventListener(
        "click",
        event => {

          const menu =
            $("#contextMenu");

          menu.innerHTML = `
            <button data-chat-menu="profile">
              <i class="fa-solid fa-user"></i>
              Profile
            </button>

            <button data-chat-menu="search">
              <i class="fa-solid fa-magnifying-glass"></i>
              Search
            </button>

            <button data-chat-menu="report">
              <i class="fa-solid fa-flag"></i>
              Report
            </button>

            <button data-chat-menu="clear">
              <i class="fa-solid fa-trash"></i>
              Clear chat
            </button>
          `;

          menu.classList.remove(
            "hidden"
          );


          const rect =
            event.currentTarget
              .getBoundingClientRect();


          menu.style.right =
            `${Math.max(
              8,
              window.innerWidth -
              rect.right
            )}px`;

          menu.style.top =
            `${rect.bottom + 6}px`;


          $$(
            "[data-chat-menu]",
            menu
          ).forEach(button => {

            button.addEventListener(
              "click",
              () => {

                const action =
                  button.dataset
                    .chatMenu;

                menu.classList.add(
                  "hidden"
                );


                if (
                  action ===
                  "profile"
                ) {

                  if (
                    state.selectedUser
                  ) {
                    openProfileDrawer(
                      state.selectedUser
                    );
                  }

                }


                if (
                  action ===
                  "search"
                ) {

                  $("#chatSearchButton")
                    ?.click();

                }


                if (
                  action ===
                  "report"
                ) {

                  if (
                    state.selectedUser
                  ) {

                    createReport({
                      target_type:
                        "user",

                      target_id:
                        state.selectedUser.id,

                      reason:
                        "Other"
                    });

                    showToast(
                      "Report submitted."
                    );
                  }

                }


                if (
                  action ===
                  "clear"
                ) {

                  state.messages = [];

                  renderMessages(
                    state.messages
                  );

                  showToast(
                    "Local chat view cleared."
                  );
                }

              }
            );
          });

        }
      );
  }


  /* =======================================================
     CHAT LIST
  ======================================================= */

  async function loadChatList() {

    /*
      Chat-list backend depends on your conversations schema.
      We still render contacts as available chats.
    */

    state.chats =
      state.chats.length
        ? state.chats
        : state.contacts.map(
            item =>
              item.profile ||
              item
          );

    renderChatList();
  }


  function renderChatList(
    query = ""
  ) {

    const list =
      $("#chatList");

    if (!list) return;


    const normalized =
      query
        .toLowerCase()
        .trim();


    const chats =
      state.chats.filter(
        chat => {

          if (!normalized) {
            return true;
          }

          return (
            String(
              chat.username || ""
            )
              .toLowerCase()
              .includes(
                normalized
              ) ||
            String(
              chat.full_name || ""
            )
              .toLowerCase()
              .includes(
                normalized
              )
          );

        }
      );


    if (!chats.length) {

      list.innerHTML = `
        <div class="empty-list">
          <div class="empty-icon">
            <i class="fa-regular fa-comments"></i>
          </div>

          <h3>No chats</h3>

          <p>
            Your accepted contacts will appear here.
          </p>
        </div>
      `;

      return;
    }


    list.innerHTML =
      chats
        .map(
          chat => {

            return `
              <div
                class="chat-item ${
                  String(chat.id) ===
                  String(
                    state.selectedChatId
                  )
                    ? "active"
                    : ""
                }"
                data-chat-user-id="${escapeHtml(
                  chat.id || ""
                )}"
              >

                ${avatarHtml(
                  chat
                )}

                <div class="chat-item-info">

                  <div class="chat-item-name">

                    <strong>
                      ${escapeHtml(
                        chat.nickname ||
                        chat.full_name ||
                        chat.username ||
                        "User"
                      )}
                    </strong>

                    ${verifiedBadge(chat)}

                  </div>

                  <div class="chat-preview-row">

                    <div class="chat-preview">
                      ${
                        chat.last_message ||
                        "No messages yet"
                      }
                    </div>

                  </div>

                </div>

                <div class="chat-item-meta">

                  <span class="chat-time">
                    ${
                      chat.last_message_time
                        ? formatTime(
                            chat.last_message_time
                          )
                        : ""
                    }
                  </span>

                </div>

              </div>
            `;
          }
        )
        .join("");


    $$(".chat-item", list)
      .forEach(item => {

        item.addEventListener(
          "click",
          () => {

            const profile =
              findProfileById(
                item.dataset
                  .chatUserId
              );

            if (profile) {

              openChatWithUser(
                profile
              );
            }

          }
        );

      });
  }


  /* =======================================================
     SEARCH CHATS
  ======================================================= */

  function initChatListSearch() {

    $("#chatListSearch")
      ?.addEventListener(
        "input",
        event =>
          renderChatList(
            event.target.value
          )
      );
  }


  /* =======================================================
     FIND PROFILE
  ======================================================= */

  function findProfileById(
    id
  ) {

    const all = [
      state.currentProfile,
      ...state.contacts.map(
        x => x.profile || x
      ),
      ...state.chats
    ].filter(Boolean);


    return all.find(
      profile =>
        String(profile.id) ===
        String(id)
    );
  }


  /* =======================================================
     MODALS
  ======================================================= */

  function openModal(
    id
  ) {

    $(`#${id}`)
      ?.classList.remove(
        "hidden"
      );
  }


  function closeModal(
    id
  ) {

    $(`#${id}`)
      ?.classList.add(
        "hidden"
      );
  }


  function initModals() {

    $$("[data-close-modal]")
      .forEach(button => {

        button.addEventListener(
          "click",
          () => {

            closeModal(
              button.dataset
                .closeModal
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
              event.target !==
              overlay
            ) {
              return;
            }

            overlay.classList.add(
              "hidden"
            );

          }
        );

      });

  }


  /* =======================================================
     MOBILE
  ======================================================= */

  function initMobile() {

    $("#openSidebar")
      ?.addEventListener(
        "click",
        () => {

          $("#sidebar")
            ?.classList.add(
              "open"
            );
        }
      );


    $("#mobileCloseSidebar")
      ?.addEventListener(
        "click",
        closeSidebarMobile
      );


    document.addEventListener(
      "click",
      event => {

        const sidebar =
          $("#sidebar");

        const open =
          sidebar?.classList.contains(
            "open"
          );

        if (
          open &&
          !sidebar.contains(
            event.target
          ) &&
          !event.target.closest(
            "#openSidebar"
          )
        ) {

          closeSidebarMobile();
        }

      }
    );
  }


  function closeSidebarMobile() {

    $("#sidebar")
      ?.classList.remove(
        "open"
      );
  }


  /* =======================================================
     REFRESH
  ======================================================= */

  function initRefresh() {

    $("#refreshChatsButton")
      ?.addEventListener(
        "click",
        async () => {

          await loadContacts();

          await loadChatList();

          showToast(
            "Chats refreshed."
          );
        }
      );
  }


  /* =======================================================
     KEYBOARD
  ======================================================= */

  function initKeyboard() {

    document.addEventListener(
      "keydown",
      event => {

        if (
          (event.ctrlKey ||
            event.metaKey) &&
          event.key.toLowerCase() ===
          "k"
        ) {

          event.preventDefault();

          openGlobalSearch();
        }


        if (
          event.key ===
          "Escape"
        ) {

          closeGlobalSearch();

          closeProfileDrawer();

          $("#contextMenu")
            ?.classList.add(
              "hidden"
            );

          $("#miniProfileContext")
            ?.classList.add(
              "hidden"
            );

        }

      }
    );
  }


  /* =======================================================
     LOGOUT
  ======================================================= */

  async function logout() {

    const confirmed =
      confirm(
        "Log out of MegChatBox?"
      );

    if (!confirmed) {
      return;
    }


    const client = db();


    if (client) {

      try {
        await client.auth.signOut();
      } catch (error) {
        console.warn(error);
      }

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


  /* =======================================================
     UTIL
  ======================================================= */

  function debounce(
    callback,
    delay
  ) {

    let timeout;

    return (...args) => {

      clearTimeout(
        timeout
      );

      timeout =
        setTimeout(
          () =>
            callback(...args),
          delay
        );
    };
  }


  /* =======================================================
     REALTIME
  ======================================================= */

  function initRealtime() {

    const client = db();

    if (
      !client ||
      !state.currentUser?.id
    ) {
      return;
    }


    try {

      const channel =
        client.channel(
          "megchatbox-realtime"
        );


      channel
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "messages"
          },
          payload => {

            const message =
              payload.new;


            const related =
              String(
                message.sender_id
              ) ===
              String(
                state.currentUser.id
              ) ||
              String(
                message.receiver_id
              ) ===
              String(
                state.currentUser.id
              );


            if (!related) {
              return;
            }


            if (
              state.selectedUser &&
              (
                String(
                  message.sender_id
                ) ===
                String(
                  state.selectedUser.id
                ) ||
                String(
                  message.receiver_id
                ) ===
                String(
                  state.selectedUser.id
                )
              )
            ) {

              const exists =
                state.messages.some(
                  item =>
                    String(
                      item.id
                    ) ===
                    String(
                      message.id
                    )
                );


              if (!exists) {

                state.messages.push(
                  message
                );

                renderMessages(
                  state.messages
                );
              }

            } else {

              addNotification({
                type:
                  "message",

                text:
                  "New message received."
              });

            }

          }
        )
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table:
              "contact_requests"
          },
          () => {

            addNotification({
              type:
                "contact_request",

              text:
                "New contact request."
            });

          }
        )
        .subscribe();

    } catch (error) {

      console.warn(
        "Realtime initialization failed:",
        error
      );
    }
  }


  /* =======================================================
     CHAT SEARCH PROFILE
  ======================================================= */

  function initContactSearch() {

    $("#contactSearchButton")
      ?.addEventListener(
        "click",
        openGlobalSearch
      );


    $("#contactSearchInput")
      ?.addEventListener(
        "input",
        event => {

          const query =
            event.target.value
              .toLowerCase()
              .trim();


          const cards =
            $$(".contact-card");


          cards.forEach(card => {

            const text =
              card.textContent
                .toLowerCase();

            card.style.display =
              !query ||
              text.includes(query)
                ? ""
                : "none";
          });

        }
      );
  }


  /* =======================================================
     CHAT BACKUP / DATA
  ======================================================= */

  function restoreDemoData() {

    if (
      state.currentProfile &&
      state.currentProfile.username
    ) {

      const demoUsers = [

        {
          id:
            "demo-alex",

          username:
            "alex",

          full_name:
            "Alex",

          nickname:
            "Alex",

          bio:
            "MegChatBox user",

          avatar_url:
            "",

          role:
            "user",

          is_verified:
            false,

          last_seen:
            new Date(
              Date.now() -
              15 *
              60000
            ).toISOString(),

          is_online:
            false
        },

        {
          id:
            "demo-abd",

          username:
            "abd123",

          full_name:
            "Abdullah",

          nickname:
            "",

          bio:
            "Hello from MegChatBox.",

          avatar_url:
            "",

          role:
            "user",

          is_verified:
            false,

          last_seen:
            new Date().toISOString(),

          is_online:
            true
        }

      ];


      /*
        Demo users are kept only in frontend state.
        They are NOT added to Supabase.
      */

      if (
        state.contacts.length === 0
      ) {
        state.contacts =
          [];
      }

      if (
        !state.chats.length &&
        state.currentProfile.role !==
          "user"
      ) {
        state.chats =
          [];
      }


      /*
        We don't automatically add fake contacts
        so real user search remains the default.
      */

    }
  }


  /* =======================================================
     INITIALIZE
  ======================================================= */

  async function init() {

    const valid =
      await checkSession();

    if (!valid) return;


    await loadMyProfile();

    restoreDemoData();

    renderMiniProfile();

    initNavigation();

    initSettings();

    initGlobalSearch();

    initProfileDrawer();

    initCommunityModal();

    initCommunityTabs();

    initComposer();

    initChatSearch();

    initChatMenu();

    initChatListSearch();

    initContactSearch();

    initNotifications();

    initAdminPanel();

    initModals();

    initMobile();

    initKeyboard();

    initRefresh();

    await loadContacts();

    await loadChatList();

    await loadCommunities();

    renderSavedMessages();

    renderNotifications();

    initRealtime();

    await updatePresence();


    /*
      Keep current online timestamp fresh.
    */

    setInterval(
      updatePresence,
      60 * 1000
    );

  }


  /* =======================================================
     START
  ======================================================= */

  document.addEventListener(
    "DOMContentLoaded",
    init
  );

})();
