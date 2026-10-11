(() => {
  const $ = (id) => document.getElementById(id);
  const db = () => window.supabaseClient;
  const state = {
    user: null, profile: null, activeTab: "chats", activeChat: null,
    contacts: [], requests: [], conversations: [], communities: [],
    searchTimer: null, currentSearch: "", settingsTab: "profile", isAdmin: false, isOwner: false
  };

  const escapeHTML = (value = "") => String(value).replace(/[&<>"']/g, (c) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
  function toast(message) {
    const node = $("toast");
    node.textContent = message;
    node.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => node.classList.remove("show"), 2800);
  }
  function setConnection(text, good = true) {
    $("connectionState").textContent = text;
    $("connectionState").previousElementSibling.style.background = good ? "#31bf82" : "#e4a63a";
  }
  function initials(name = "M") {
    return name.trim().split(/\s+/).slice(0,2).map(s => s[0] || "").join("").toUpperCase() || "M";
  }
  function avatarMarkup(profile, extra = "") {
    const name = profile?.full_name || profile?.username || "User";
    if (profile?.avatar_url) return `<span class="avatar ${extra}"><img src="${escapeHTML(profile.avatar_url)}" alt=""></span>`;
    return `<span class="avatar ${extra}">${escapeHTML(initials(name))}</span>`;
  }
  function closeSearchMode() {
    $("searchMode").classList.add("hidden");
    $("conversationList").classList.remove("hidden");
    $("clearSearch").classList.add("hidden");
  }

  async function init() {
    if (!window.megSupabaseReady) {
      setConnection("Setup required", false);
      $("conversationList").innerHTML = '<div class="empty-note">Add your Supabase URL and anon key in <b>supabase.js</b>, then run schema.sql in Supabase SQL Editor.</div>';
      return;
    }
    const { data: { session }, error } = await db().auth.getSession();
    if (error || !session) { location.href = "index.html"; return; }
    state.user = session.user;
    const { data: profile, error: profileError } = await db().from("profiles").select("*").eq("id", state.user.id).maybeSingle();
    if (profileError) {
      setConnection("Database error", false);
      $("conversationList").innerHTML = `<div class="empty-note">Could not load your profile: ${escapeHTML(profileError.message)}<br>Run schema.sql and check RLS policies.</div>`;
      return;
    }
    if (!profile) {
      $("conversationList").innerHTML = '<div class="empty-note">Your account has no profile yet. Sign out and create the profile again, or add your profile in Supabase.</div>';
      setConnection("Profile missing", false);
      return;
    }
    state.profile = profile;
    $("myName").textContent = profile.full_name || profile.username;
    $("myUsername").textContent = "@" + (profile.username || "username");
    $("myAvatar").innerHTML = profile.avatar_url ? `<img src="${escapeHTML(profile.avatar_url)}" alt="">` : escapeHTML(initials(profile.full_name || profile.username));
    const { data: adminRow } = await db().from("app_admins").select("user_id,active_until").eq("user_id", state.user.id).maybeSingle();
    state.isOwner = profile.role === "owner";
    state.isAdmin = state.isOwner || !!adminRow;
    setConnection("Connected");
    bindUI();
    await loadAllLists();
    await showSettingsIfRequested();
    db().channel("megchatbox-v5-changes")
      .on("postgres_changes", {event:"*", schema:"public", table:"messages"}, () => {
        if (state.activeChat) loadMessages(state.activeChat.id);
        loadAllLists();
      })
      .subscribe();
  }

  function bindUI() {
    $("settingsOpen").addEventListener("click", openSettings);
    $("myProfileBtn").addEventListener("click", openProfile);
    $("newChatBtn").addEventListener("click", () => { $("globalSearch").focus(); $("globalSearch").value = ""; runSearch(""); });
    $("welcomeSearchBtn").addEventListener("click", () => $("globalSearch").focus());
    $("globalSearch").addEventListener("input", (e) => {
      $("clearSearch").classList.toggle("hidden", !e.target.value);
      clearTimeout(state.searchTimer);
      state.searchTimer = setTimeout(() => runSearch(e.target.value.trim()), 250);
    });
    $("clearSearch").addEventListener("click", () => { $("globalSearch").value = ""; closeSearchMode(); });
    $("clearHistory").addEventListener("click", () => {
      try { localStorage.removeItem(historyKey()); } catch {}
      if (!state.currentSearch) renderSearchHistory();
      else toast("Search history cleared.");
    });
    document.querySelectorAll(".list-tab").forEach(btn => btn.addEventListener("click", () => {
      document.querySelectorAll(".list-tab").forEach(b => b.classList.toggle("active", b === btn));
      state.activeTab = btn.dataset.list;
      renderConversationList();
    }));
    $("messageForm").addEventListener("submit", sendMessage);
    $("modalClose").addEventListener("click", closeModal);
    $("modalBackdrop").addEventListener("click", e => { if (e.target === $("modalBackdrop")) closeModal(); });
    $("chatInfoBtn").addEventListener("click", () => state.activeChat && openChatInfo());
    $("chatSearchBtn").addEventListener("click", () => state.activeChat && openChatSearch());
    $("savedBtn").addEventListener("click", loadSavedMessages);
    $("emojiBtn").addEventListener("click", () => { $("messageInput").value += " 😊"; $("messageInput").focus(); });
    document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });
  }

  function historyKey() { return `megchatbox_search_history_${state.user.id}`; }
  function addHistory(item) {
    try {
      const list = JSON.parse(localStorage.getItem(historyKey()) || "[]").filter(x => x.id !== item.id);
      list.unshift(item); localStorage.setItem(historyKey(), JSON.stringify(list.slice(0,30)));
    } catch {}
  }
  async function runSearch(query) {
    state.currentSearch = query;
    $("searchMode").classList.remove("hidden");
    $("conversationList").classList.add("hidden");
    $("searchHeading").textContent = query ? "Search results" : "Recent searches";
    if (!query) return renderSearchHistory();
    $("searchResults").innerHTML = '<div class="empty-note">Searching…</div>';
    const pattern = query.replace(/[,%()]/g, " ").trim();
    if (!pattern) { $("searchResults").innerHTML = '<div class="empty-note">Type a name or username.</div>'; return; }
    // Never use hard-coded sample usernames. Search only real database profiles.
    const { data, error } = await db().from("profiles")
      .select("id,username,full_name,bio,avatar_url,is_verified,role")
      .neq("id", state.user.id)
      .or(`username.ilike.%${pattern}%,full_name.ilike.%${pattern}%`)
      .order("username", {ascending:true}).limit(10);
    if (error) {
      $("searchResults").innerHTML = `<div class="empty-note">Search failed: ${escapeHTML(error.message)}<br>Check the profiles table and its SELECT policy.</div>`;
      return;
    }
    const results = (data || []).filter(p => p.username && !p.username_private);
    if (!results.length) {
      $("searchResults").innerHTML = '<div class="empty-note">No matching users found in the database.</div>';
      return;
    }
    $("searchResults").innerHTML = results.map(p => `<div class="person-row">
      ${avatarMarkup(p)}
      <div class="person-info"><strong>${escapeHTML(p.full_name || p.username)} ${p.is_verified ? '<span class="verified">✓</span>' : ''}</strong><small>@${escapeHTML(p.username)}${p.bio ? " · " + escapeHTML(p.bio) : ""}</small></div>
      <button class="mini-btn" data-profile="${escapeHTML(p.id)}">Profile</button>
    </div>`).join("");
    $("searchResults").querySelectorAll("[data-profile]").forEach(btn => btn.addEventListener("click", () => {
      const p = results.find(x => x.id === btn.dataset.profile);
      if (p) { addHistory({id:p.id,type:"user",name:p.full_name || p.username,username:p.username,avatar_url:p.avatar_url}); openPublicProfile(p); }
    }));
  }
  function renderSearchHistory() {
    let items = [];
    try { items = JSON.parse(localStorage.getItem(historyKey()) || "[]"); } catch {}
    $("searchResults").innerHTML = items.length ? items.map(item => `<div class="person-row">
      ${avatarMarkup(item)}
      <div class="person-info"><strong>${escapeHTML(item.name || item.username || "User")}</strong><small>${item.type === "user" ? "@" + escapeHTML(item.username || "") : escapeHTML(item.type || "")}</small></div>
      <button class="mini-btn" data-history="${escapeHTML(item.id)}">Open</button>
    </div>`).join("") : '<div class="empty-note">Your recent searches will appear here.</div>';
    $("searchResults").querySelectorAll("[data-history]").forEach(btn => btn.addEventListener("click", async () => {
      const { data } = await db().from("profiles").select("id,username,full_name,bio,avatar_url,is_verified,role").eq("id", btn.dataset.history).maybeSingle();
      if (data) openPublicProfile(data);
      else toast("This profile is no longer available.");
    }));
  }

  async function loadAllLists() {
    await Promise.all([loadContacts(), loadCommunities()]);
    await loadConversations();
    renderConversationList();
  }
  async function loadContacts() {
    const { data, error } = await db().from("contacts").select("contact_id, nickname, profiles:contact_id(id,username,full_name,avatar_url,is_verified,bio,role)").eq("user_id", state.user.id);
    if (error) { console.warn("Contacts load:", error.message); state.contacts = []; return; }
    state.contacts = (data || []).map(row => ({...row.profiles, nickname:row.nickname})).filter(p => p && p.id);
    const { data: reqs } = await db().from("contact_requests").select("id,from_user,to_user,status,profiles:from_user(id,username,full_name,avatar_url,bio)").eq("to_user", state.user.id).eq("status","pending");
    state.requests = reqs || [];
  }
  async function loadCommunities() {
    const { data, error } = await db().from("community_members").select("community_id, communities:community_id(id,name,username,bio,avatar_url,type,visibility,creator_id)").eq("user_id", state.user.id);
    if (error) { console.warn("Communities load:", error.message); state.communities = []; return; }
    state.communities = (data || []).map(row => row.communities).filter(Boolean);
  }
  async function loadConversations() {
    const { data: memberships, error } = await db().from("chat_members").select("chat_id, chats:chat_id(id,type,title,created_at)").eq("user_id", state.user.id);
    if (error) { console.warn("Chat list:", error.message); state.conversations = []; return; }
    const chats = (memberships || []).map(m => m.chats).filter(Boolean);
    const expanded = [];
    for (const chat of chats) {
      if (chat.type === "direct") {
        const { data: members } = await db().from("chat_members").select("user_id, profiles:user_id(id,username,full_name,avatar_url,is_verified,bio,role)").eq("chat_id", chat.id);
        const other = (members || []).map(m => m.profiles).find(p => p && p.id !== state.user.id);
        if (other) expanded.push({...chat, other, displayName:other.full_name || other.username, avatar_url:other.avatar_url});
      } else {
        expanded.push({...chat, displayName:chat.title || "Group chat"});
      }
    }
    state.conversations = expanded;
  }
  function renderConversationList() {
    const host = $("conversationList");
    let rows = [];
    if (state.activeTab === "contacts") {
      $("listHeading").textContent = "Contacts";
      rows = state.contacts.map(p => ({id:p.id, displayName:p.nickname || p.full_name || p.username, username:p.username, avatar_url:p.avatar_url, is_verified:p.is_verified, kind:"contact", person:p}));
    } else if (state.activeTab === "groups" || state.activeTab === "channels") {
      const type = state.activeTab === "groups" ? "group" : "channel";
      $("listHeading").textContent = state.activeTab === "groups" ? "Your groups" : "Your channels";
      rows = state.communities.filter(c => c.type === type).map(c => ({id:c.id, displayName:c.name, username:c.username, avatar_url:c.avatar_url, kind:type, community:c}));
    } else {
      $("listHeading").textContent = "Recent chats";
      rows = state.conversations.map(c => ({...c, kind:"chat", username:c.other?.username, is_verified:c.other?.is_verified, person:c.other}));
    }
    if (!rows.length && state.requests.length && state.activeTab === "contacts") {
      host.innerHTML = `<div class="section-heading">Contact requests (${state.requests.length})</div>` + state.requests.map(r => `<div class="person-row">${avatarMarkup(r.profiles)}<div class="person-info"><strong>${escapeHTML(r.profiles?.full_name || r.profiles?.username || "User")}</strong><small>Wants to connect</small></div><button class="mini-btn" data-accept="${r.id}">Accept</button></div>`).join("") + '<div class="empty-note">No contacts yet. Search for a username to find people.</div>';
      host.querySelectorAll("[data-accept]").forEach(b => b.addEventListener("click", () => acceptRequest(b.dataset.accept)));
      return;
    }
    if (!rows.length) {
      host.innerHTML = `<div class="empty-note">${state.activeTab === "chats" ? "No chats yet. Search for a real user to get started." : state.activeTab === "contacts" ? "No contacts yet. Search for people and send a contact request." : "No " + state.activeTab + " yet."}</div>`;
      return;
    }
    host.innerHTML = rows.map(row => `<div class="conversation-row" data-row="${escapeHTML(row.id)}" data-kind="${row.kind}">
      ${avatarMarkup(row)}
      <div class="row-copy"><div class="row-top"><strong>${escapeHTML(row.displayName || "User")}</strong>${row.is_verified ? '<span class="verified">✓</span>' : ''}</div><p>${row.username ? "@" + escapeHTML(row.username) : row.kind === "chat" ? "Open conversation" : row.kind}</p></div>
    </div>`).join("");
    host.querySelectorAll("[data-row]").forEach(el => el.addEventListener("click", async () => {
      const row = rows.find(r => r.id === el.dataset.row);
      if (row.kind === "contact") await startDirectChat(row.person);
      else if (row.kind === "chat") openChat(row);
      else openCommunity(row.community);
    }));
  }
  async function acceptRequest(requestId) {
    const request = state.requests.find(r => r.id === requestId);
    if (!request) return;
    const { error } = await db().from("contact_requests").update({status:"accepted"}).eq("id", requestId).eq("to_user", state.user.id);
    if (error) return toast("Could not accept request: " + error.message);
    const { error: e1 } = await db().from("contacts").upsert([{user_id:state.user.id,contact_id:request.from_user},{user_id:request.from_user,contact_id:state.user.id}], {onConflict:"user_id,contact_id"});
    if (e1) return toast("Request accepted, but contact creation failed: " + e1.message);
    await startDirectChat(request.profiles);
    await loadAllLists();
    toast("Contact request accepted.");
  }
  async function sendContactRequest(person) {
    const { data: existing } = await db().from("contact_requests").select("id,status").eq("from_user",state.user.id).eq("to_user",person.id).maybeSingle();
    if (existing?.status === "pending") return toast("Request already sent.");
    if (existing?.status === "accepted") return startDirectChat(person);
    const { error } = await db().from("contact_requests").insert({from_user:state.user.id,to_user:person.id,status:"pending"});
    if (error) return toast("Could not send request: " + error.message);
    toast("Contact request sent.");
  }
  async function startDirectChat(person) {
    if (!person?.id) return;
    const { data: contact } = await db().from("contacts").select("contact_id").eq("user_id",state.user.id).eq("contact_id",person.id).maybeSingle();
    if (!contact) {
      openPublicProfile(person);
      return;
    }
    const { data: myMemberships } = await db().from("chat_members").select("chat_id").eq("user_id",state.user.id);
    let existing = null;
    for (const m of myMemberships || []) {
      const { data: other } = await db().from("chat_members").select("user_id").eq("chat_id",m.chat_id).eq("user_id",person.id).maybeSingle();
      if (other) {
        const { data: c } = await db().from("chats").select("*").eq("id",m.chat_id).eq("type","direct").maybeSingle();
        if (c) { existing = c; break; }
      }
    }
    if (!existing) {
      const { data: newChat, error } = await db().from("chats").insert({type:"direct",created_by:state.user.id}).select("*").single();
      if (error) return toast("Could not create chat: " + error.message);
      const { error: memberError } = await db().from("chat_members").insert([{chat_id:newChat.id,user_id:state.user.id},{chat_id:newChat.id,user_id:person.id}]);
      if (memberError) return toast("Could not add chat members: " + memberError.message);
      existing = newChat;
    }
    await loadConversations();
    const row = state.conversations.find(c => c.id === existing.id);
    if (row) openChat(row);
    else openChat({...existing, other:person, displayName:person.full_name || person.username});
  }
  function openChat(chat) {
    state.activeChat = chat;
    $("welcomeScreen").classList.add("hidden");
    $("chatHeader").classList.remove("hidden");
    $("messageArea").classList.remove("hidden");
    $("chatName").textContent = chat.displayName || chat.title || "Conversation";
    $("chatSubline").textContent = chat.other?.username ? "@" + chat.other.username : chat.type === "direct" ? "Direct chat" : "Community";
    $("chatAvatar").innerHTML = chat.avatar_url ? `<img src="${escapeHTML(chat.avatar_url)}" alt="">` : escapeHTML(initials(chat.displayName || chat.title));
    document.querySelector(".app-shell").classList.add("chat-open");
    loadMessages(chat.id);
  }
  async function loadMessages(chatId) {
    const { data, error } = await db().from("messages").select("id,chat_id,sender_id,content,created_at,deleted_at").eq("chat_id",chatId).order("created_at",{ascending:true}).limit(200);
    if (error) { $("messageList").innerHTML = `<div class="empty-note">Could not load messages: ${escapeHTML(error.message)}</div>`; return; }
    $("messageList").innerHTML = (data || []).map(m => `<article class="message-bubble ${m.sender_id === state.user.id ? "mine" : ""}">${m.deleted_at ? '<i>This message was deleted</i>' : escapeHTML(m.content)}<div class="message-meta">${m.sender_id === state.user.id ? "You · " : ""}${new Date(m.created_at).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}</div></article>`).join("") || '<div class="empty-note">No messages yet. Say hello!</div>';
    $("messageList").scrollTop = $("messageList").scrollHeight;
  }
  async function sendMessage(event) {
    event.preventDefault();
    const content = $("messageInput").value.trim();
    if (!content || !state.activeChat) return;
    const { error } = await db().from("messages").insert({chat_id:state.activeChat.id,sender_id:state.user.id,content});
    if (error) { $("chatNotice").textContent = "Message failed: " + error.message; return; }
    $("messageInput").value = "";
    $("chatNotice").textContent = "";
    await loadMessages(state.activeChat.id);
  }
  function openModal(title, html) {
    $("modalTitle").textContent = title;
    $("modalContent").innerHTML = html;
    $("modalBackdrop").classList.remove("hidden");
  }
  function closeModal() { $("modalBackdrop").classList.add("hidden"); }
  function openPublicProfile(p) {
    const own = p.id === state.user.id;
    openModal("Profile", `${avatarMarkup(p,"avatar-lg")}<h3 style="margin:12px 0 3px;font-size:18px">${escapeHTML(p.full_name || p.username)}</h3><p class="modal-note">@${escapeHTML(p.username || "")} ${p.is_verified ? '<span class="verified">✓ Verified</span>' : ""}</p><p class="modal-note">${escapeHTML(p.bio || "No bio yet.")}</p>${own ? '<button class="primary-btn" id="editOwnProfile">Edit profile</button>' : `<button class="primary-btn" id="requestContact">Add contact</button>`}`);
    if (own) $("editOwnProfile")?.addEventListener("click", openSettings);
    else $("requestContact")?.addEventListener("click", () => sendContactRequest(p));
  }
  function openProfile() { openPublicProfile(state.profile); }
  function openSettings() {
    state.settingsTab = "profile";
    renderSettings();
  }
  function renderSettings() {
    const tabs = ["profile","security","appearance","admin"];
    const nav = `<nav class="settings-nav">${tabs.filter(t => t !== "admin" || state.isAdmin).map(t => `<button data-setting-tab="${t}" class="${state.settingsTab===t?"active":""}">${t[0].toUpperCase()+t.slice(1)}</button>`).join("")}</nav>`;
    let content = "";
    if (state.settingsTab === "profile") {
      content = `<form id="profileSettingsForm"><label class="field-label">Full name</label><input class="field-input" name="full_name" maxlength="60" value="${escapeHTML(state.profile.full_name || "")}" required><label class="field-label">Username</label><input class="field-input" name="username" minlength="${state.isAdmin ? 1 : 5}" maxlength="24" pattern="[A-Za-z0-9_]+" value="${escapeHTML(state.profile.username || "")}" required><label class="field-label">Bio</label><textarea class="field-textarea" name="bio" maxlength="180">${escapeHTML(state.profile.bio || "")}</textarea><label class="field-label">Avatar image URL</label><input class="field-input" name="avatar_url" type="url" value="${escapeHTML(state.profile.avatar_url || "")}" placeholder="https://…"><button class="primary-btn modal-save" type="submit">Save profile</button></form><p class="modal-note">Username must be unique. Upload-based avatars and decoration gallery will be connected in the next build step.</p>`;
    } else if (state.settingsTab === "security") {
      content = `<h3 style="font-size:13px">Privacy</h3><div class="settings-row"><span>Show online status</span><input id="privacyOnline" class="toggle" type="checkbox" ${state.profile.show_online !== false ? "checked" : ""}></div><div class="settings-row"><span>Show last seen</span><input id="privacyLastSeen" class="toggle" type="checkbox" ${state.profile.show_last_seen !== false ? "checked" : ""}></div><div class="settings-row"><span>Join permission</span><span class="modal-note">Community-level setting is configured by its creator.</span></div><h3 style="font-size:13px;margin-top:22px">Connected devices</h3><p class="modal-note">Session/device management requires a trusted server endpoint; browser code cannot securely revoke every other session. This panel will be wired to that endpoint in the security phase.</p><button id="logoutBtn" class="mini-btn danger">Log out on this device</button>`;
    } else if (state.settingsTab === "appearance") {
      content = `<label class="field-label">Theme</label><select id="themeSelect" class="field-select"><option value="light">Light</option><option value="dark">Dark (next UI pass)</option><option value="system">System</option></select><label class="field-label">Chat density</label><select id="densitySelect" class="field-select"><option value="normal">Normal</option><option value="compact">Compact</option></select><p class="modal-note">Profile decorations will use actual image assets (not emoji). The decoration picker and chat-list display are part of the next feature pass.</p><button class="primary-btn modal-save" id="saveAppearance">Save appearance</button>`;
    } else if (state.settingsTab === "admin") {
      content = state.isOwner ? `<h3 style="font-size:13px">Owner Panel</h3><p class="modal-note">Owner-only controls. Admin management, verified management, reports, audit history and community moderation will be added as secure database-backed screens.</p><div class="settings-row"><span>Owner access</span><strong style="color:#18885c">Confirmed</strong></div><button id="adminManageBtn" class="primary-btn modal-save">Admin management</button>` : `<h3 style="font-size:13px">Admin Panel</h3><p class="modal-note">Your admin role is separate from the Owner Panel. Only granted permissions will be shown here.</p><div class="settings-row"><span>Admin access</span><strong style="color:#18885c">Confirmed</strong></div>`;
    }
    openModal("Settings", nav + content);
    $("modalContent").querySelectorAll("[data-setting-tab]").forEach(b => b.addEventListener("click", () => { state.settingsTab = b.dataset.settingTab; renderSettings(); }));
    $("profileSettingsForm")?.addEventListener("submit", saveProfile);
    $("privacyOnline")?.addEventListener("change", () => savePrivacy({show_online:$("privacyOnline").checked}));
    $("privacyLastSeen")?.addEventListener("change", () => savePrivacy({show_last_seen:$("privacyLastSeen").checked}));
    $("logoutBtn")?.addEventListener("click", async () => { await db().auth.signOut(); location.href = "index.html"; });
    $("saveAppearance")?.addEventListener("click", () => {
      localStorage.setItem("megchatbox_theme", $("themeSelect").value);
      localStorage.setItem("megchatbox_density", $("densitySelect").value);
      toast("Appearance preference saved on this browser.");
    });
    $("adminManageBtn")?.addEventListener("click", openAdminManagement);
  }
  async function saveProfile(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form).entries());
    values.username = values.username.trim().toLowerCase();
    if (!state.isAdmin && values.username.length < 5) return toast("Username must be at least 5 characters.");
    if (!/^[a-z0-9_]+$/.test(values.username)) return toast("Username may contain letters, numbers, and underscores only.");
    if (!values.avatar_url) values.avatar_url = null;
    const { data, error } = await db().from("profiles").update(values).eq("id",state.user.id).select("*").single();
    if (error) return toast("Profile save failed: " + error.message);
    state.profile = data;
    $("myName").textContent = data.full_name || data.username;
    $("myUsername").textContent = "@" + data.username;
    $("myAvatar").innerHTML = data.avatar_url ? `<img src="${escapeHTML(data.avatar_url)}" alt="">` : escapeHTML(initials(data.full_name || data.username));
    toast("Profile saved.");
    renderSettings();
  }
  async function savePrivacy(values) {
    const { error } = await db().from("profiles").update(values).eq("id",state.user.id);
    if (error) return toast("Could not save privacy: " + error.message);
    state.profile = {...state.profile,...values};
    toast("Privacy settings saved.");
  }
  async function openAdminManagement() {
    const { data: admins, error } = await db().from("app_admins").select("user_id,role,active_until,profiles:user_id(id,username,full_name)").order("created_at",{ascending:false});
    if (error) return toast("Admin list failed: " + error.message);
    const body = `<p class="modal-note">Granting admin roles must be enforced by database policies/server-side functions. This starter UI does not let a browser client assign privileged roles directly.</p><label class="field-label">Find user by exact username</label><input id="adminLookup" class="field-input" placeholder="username"><button id="adminLookupBtn" class="primary-btn modal-save">Search user</button><div id="adminLookupResult"></div><h3 style="font-size:13px;margin-top:24px">Current admins (${(admins||[]).length})</h3>${(admins||[]).map(a=>`<div class="person-row"><span class="avatar">${escapeHTML(initials(a.profiles?.full_name||a.profiles?.username||"A"))}</span><div class="person-info"><strong>${escapeHTML(a.profiles?.full_name||a.profiles?.username||"Account")}</strong><small>@${escapeHTML(a.profiles?.username||"")} · ${escapeHTML(a.role||"admin")}</small></div></div>`).join("") || '<p class="modal-note">No admins are assigned yet.</p>'}`;
    openModal("Owner · Admin management", body);
    $("adminLookupBtn").addEventListener("click", async () => {
      const username = $("adminLookup").value.trim().replace(/^@/,"").toLowerCase();
      if (!username) return;
      const { data: person, error: e } = await db().from("profiles").select("id,username,full_name").eq("username",username).maybeSingle();
      $("adminLookupResult").innerHTML = e ? `<p class="modal-note">${escapeHTML(e.message)}</p>` : person ? `<div class="person-row"><div class="person-info"><strong>${escapeHTML(person.full_name||person.username)}</strong><small>@${escapeHTML(person.username)}</small></div><span class="modal-note">To grant admin safely, use the trusted server-side admin function described in README.</span></div>` : '<p class="modal-note">User not found.</p>';
    });
  }
  async function openChatInfo() {
    const chat = state.activeChat;
    openModal("Conversation info", `<h3 style="font-size:14px">${escapeHTML(chat.displayName || chat.title || "Chat")}</h3><p class="modal-note">Conversation details and media browser will be expanded in the next build step.</p>${chat.other ? `<button class="mini-btn" id="openOtherProfile">View profile</button>` : ""}`);
    $("openOtherProfile")?.addEventListener("click", () => openPublicProfile(chat.other));
  }
  async function openChatSearch() {
    openModal("Search in chat", `<label class="field-label">Message text</label><input id="inChatQuery" class="field-input" placeholder="Search messages…"><button id="inChatSearchBtn" class="primary-btn modal-save">Search</button><div id="inChatResults"></div>`);
    $("inChatSearchBtn").addEventListener("click", async () => {
      const q = $("inChatQuery").value.trim();
      if (!q) return;
      const { data, error } = await db().from("messages").select("content,created_at,sender_id").eq("chat_id",state.activeChat.id).ilike("content",`%${q}%`).order("created_at",{ascending:false}).limit(50);
      $("inChatResults").innerHTML = error ? `<p class="modal-note">${escapeHTML(error.message)}</p>` : (data||[]).map(m=>`<div class="settings-row"><span>${escapeHTML(m.content)}</span><small>${new Date(m.created_at).toLocaleDateString()}</small></div>`).join("") || '<p class="modal-note">No matching messages.</p>';
    });
  }
  async function openCommunity(community) {
    openModal(community.type === "channel" ? "Channel" : "Group", `${avatarMarkup(community,"avatar-lg")}<h3 style="font-size:17px">${escapeHTML(community.name)}</h3><p class="modal-note">@${escapeHTML(community.username || "")}</p><p class="modal-note">${escapeHTML(community.bio || "No description yet.")}</p><p class="modal-note">${escapeHTML(community.visibility || "private")} · ${community.type === "channel" ? "Channel" : "Group"}</p><p class="modal-note">Community creation, invites, join requests, permissions and creator-only deletion will be added with secure database functions.</p>`);
  }
  async function loadSavedMessages() {
    const { data, error } = await db().from("saved_messages").select("id,message_id,created_at,messages:message_id(id,content,sender_id,created_at)").eq("user_id",state.user.id).order("created_at",{ascending:false}).limit(100);
    if (error) return toast("Saved messages: " + error.message);
    openModal("Saved Messages", (data||[]).map(s=>`<div class="settings-row"><span>${escapeHTML(s.messages?.content || "Media or deleted message")}</span><small>${new Date(s.created_at).toLocaleDateString()}</small></div>`).join("") || '<div class="empty-note">No saved messages yet.</div>');
  }
  async function showSettingsIfRequested() {
    const theme = localStorage.getItem("megchatbox_theme");
    if (theme === "dark") document.body.dataset.theme = "dark";
  }
  init();
})();
