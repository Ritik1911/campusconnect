// ============================
// CampusConnect — admin.js
// Hierarchical Permission System
// ============================
const API = "https://campusconnect-f6s5.onrender.com/api";
const currentUser = JSON.parse(localStorage.getItem("cc_user"));
if (!currentUser) window.location.href = "index.html";

document.getElementById("nav-username").textContent = "👤 " + currentUser.username;
function logout() { localStorage.removeItem("cc_user"); window.location.href = "index.html"; }
function esc(s) { return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
function timeAgo(ts) {
  const mins = Math.floor((Date.now()-ts)/60000);
  if(mins<1) return "Just now"; if(mins<60) return `${mins}m ago`;
  const hrs=Math.floor(mins/60); if(hrs<24) return `${hrs}h ago`;
  return `${Math.floor(hrs/24)}d ago`;
}

let myRole = "user";
let myPermissions = [];
let allPermLabels = {};
let allUsers = [];
let warnTarget = "";
let banTarget = "";
let editTarget = "";

const PERM_ICONS = {
  manage_posts: "📝", manage_users: "👥", ban_users: "🚫",
  warn_users: "⚠️", view_reports: "🔎", delete_reports: "🗑️",
  post_announcements: "📢", view_stats: "📊", create_admin: "👑", view_audit: "📋"
};

// ── TABS ──────────────────────────────────────────────────────
const ALL_TABS = ["overview","reports","users","admins","announce","audit","backup"];
function showTab(tab) {
  ALL_TABS.forEach(t => {
    const el = document.getElementById(`tab-content-${t}`);
    const btn = document.getElementById(`tab-${t}`);
    if(el) el.style.display = t===tab ? "block" : "none";
    if(btn) btn.classList.toggle("tab-active", t===tab);
  });
  if(tab==="reports") loadReportedPosts();
  if(tab==="users") loadUsers();
  if(tab==="admins") loadAdminTree();
  if(tab==="audit") loadAuditLog();
  if(tab==="announce") loadPastAnnouncements();
}

// ── INIT ──────────────────────────────────────────────────────
async function init() {
  let roleData = {};
  try {
    const [roleRes, labelsRes] = await Promise.all([
      fetch(`${API}/admin/my-role?username=${currentUser.username}`),
      fetch(`${API}/admin/permission-labels`)
    ]);
    roleData = await roleRes.json();
    allPermLabels = await labelsRes.json();
    myRole = roleData.role;
    myPermissions = roleData.permissions || [];
  } catch {
    myRole = "user"; myPermissions = [];
  }

  if (!roleData_isAdmin()) {
    document.getElementById("access-denied").style.display = "block";
    return;
  }

  document.getElementById("admin-content").style.display = "block";
  setupUI();
  showTab("overview");
  if(myPermissions.includes("view_stats")) loadStats();
}

function roleData_isAdmin() {
  return myRole === "superadmin" || myRole === "admin";
}

function setupUI() {
  const badge = document.getElementById("admin-nav-badge");
  if(myRole === "superadmin") {
    badge.textContent = "👑 SUPER ADMIN";
    badge.className = "admin-nav-badge superadmin-badge";
    document.getElementById("admin-title").textContent = "👑 Super-Admin Panel";
    document.getElementById("admin-subtitle").textContent = "Full platform control";
  } else {
    badge.textContent = "🛡️ ADMIN";
    badge.className = "admin-nav-badge admin-badge";
    document.getElementById("admin-title").textContent = "🛡️ Admin Panel";
    document.getElementById("admin-subtitle").textContent = "Your assigned permissions: " + myPermissions.map(p => allPermLabels[p] || p).join(", ");
  }

  // Show only tabs that user has permission for
  const tabMap = {
    "tab-overview":  true,
    "tab-reports":   myPermissions.includes("view_reports"),
    "tab-users":     myPermissions.includes("manage_users"),
    "tab-admins":    myPermissions.includes("create_admin") || myRole === "superadmin",
    "tab-announce":  myPermissions.includes("post_announcements"),
    "tab-audit":     myPermissions.includes("view_audit"),
    "tab-backup":    myRole === "superadmin",
  };
  Object.entries(tabMap).forEach(([id, show]) => {
    const el = document.getElementById(id);
    if(el) el.style.display = show ? "inline-block" : "none";
  });

  // Stats section
  if(!myPermissions.includes("view_stats")) {
    const s = document.getElementById("stats-section");
    if(s) s.innerHTML = `<div class="empty-state" style="padding:30px;">📊 You don't have permission to view statistics.</div>`;
  }
}

// ── STATS ─────────────────────────────────────────────────────
async function loadStats() {
  try {
    const res = await fetch(`${API}/admin/stats?username=${currentUser.username}`);
    const s = await res.json();
    if(s.error) return;
    const fields = {
      "s-users":s.total_users,"s-posts":s.total_posts,"s-comments":s.total_comments,
      "s-admins":s.total_admins,"s-banned":s.total_banned,"s-warnings":s.total_warnings,
      "s-today":s.posts_today,"s-new-users":s.users_today
    };
    Object.entries(fields).forEach(([id,val]) => {
      const el = document.getElementById(id);
      if(el) el.textContent = val ?? "—";
    });
    // Chart
    if(window.Chart && s.weekly) {
      const ctx = document.getElementById("weekly-chart");
      if(ctx) {
        new Chart(ctx.getContext("2d"), {
          type:"bar",
          data:{
            labels: s.weekly.map(d=>d.day),
            datasets:[{
              label:"Posts", data: s.weekly.map(d=>d.count),
              backgroundColor:"rgba(108,71,255,0.5)",
              borderColor:"rgba(108,71,255,1)",
              borderWidth:2, borderRadius:6
            }]
          },
          options:{
            responsive:true,
            plugins:{legend:{display:false}},
            scales:{
              x:{ticks:{color:"#9ca3af"},grid:{color:"rgba(255,255,255,0.05)"}},
              y:{ticks:{color:"#9ca3af",stepSize:1},grid:{color:"rgba(255,255,255,0.05)"},beginAtZero:true}
            }
          }
        });
      }
    }
  } catch {}
}

// ── ADMIN TREE ────────────────────────────────────────────────
async function loadAdminTree() {
  const container = document.getElementById("admin-tree-container");
  container.innerHTML = `<div class="empty-state">Loading...</div>`;
  try {
    const res = await fetch(`${API}/admin/admin-tree?username=${currentUser.username}`);
    const admins = await res.json();

    let html = `
      <div class="admin-card" style="margin-bottom:20px;">
        <div class="profile-card-title">👑 Admin Hierarchy</div>
        <div style="padding:12px;background:linear-gradient(135deg,rgba(245,158,11,0.1),rgba(217,119,6,0.05));border:1px solid rgba(245,158,11,0.3);border-radius:12px;margin-bottom:16px;">
          <span class="role-badge superadmin-badge">👑 Super Admin</span>
          <strong style="margin-left:8px;">@${currentUser.username}</strong>
          <span style="color:var(--text-muted);font-size:0.8rem;margin-left:8px;">— Full Access</span>
        </div>`;

    if(!admins.length) {
      html += `<div class="empty-state">No admins created yet. Create one below!</div>`;
    } else {
      admins.forEach(a => {
        const perms = a.permissions || [];
        html += `
          <div style="margin-left:24px;padding:12px;background:var(--bg3);border:1px solid var(--border);border-radius:12px;margin-bottom:10px;">
            <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
              <div>
                <span class="role-badge admin-badge">🛡️ Admin</span>
                <strong style="margin-left:8px;">@${esc(a.username)}</strong>
                <span style="color:var(--text-muted);font-size:0.8rem;margin-left:6px;">— ${a.fullname}</span>
                ${a.banned ? `<span class="role-badge banned-badge" style="margin-left:6px;">🚫 Banned</span>` : ""}
              </div>
              <div style="display:flex;gap:6px;flex-wrap:wrap;">
                <button class="admin-action-btn promote-btn" onclick="openEditPermsModal('${a.username}', ${JSON.stringify(perms).replace(/"/g,'&quot;')})">✏️ Edit Permissions</button>
                <button class="admin-action-btn ban-btn" onclick="revokeAdmin('${a.username}')">❌ Revoke Admin</button>
              </div>
            </div>
            <div style="margin-top:10px;display:flex;flex-wrap:wrap;gap:6px;">
              ${perms.length ? perms.map(p => `<span style="background:rgba(108,71,255,0.15);color:var(--primary-light);padding:3px 10px;border-radius:20px;font-size:0.75rem;">${allPermLabels[p]||p}</span>`).join("") : `<span style="color:var(--text-muted);font-size:0.82rem;">No permissions assigned</span>`}
            </div>
          </div>`;
      });
    }

    html += `</div>`;

    // Create Admin form
    if(myPermissions.includes("create_admin") || myRole === "superadmin") {
      html += `
        <div class="admin-card">
          <div class="profile-card-title">➕ Create New Admin / Partner</div>
          <div class="form-group">
            <label>Username (must be existing user)</label>
            <input type="text" id="new-admin-username" placeholder="e.g. john123" style="width:100%;"/>
          </div>
          <div class="form-group">
            <label>Assign Permissions <span style="color:var(--text-muted);font-size:0.8rem;">(you can only assign what you have)</span></label>
            <div class="perm-grid" id="new-admin-perms">
              ${myPermissions.filter(p => p !== "create_admin" || myRole === "superadmin").map(p => `
                <label class="perm-checkbox">
                  <input type="checkbox" value="${p}" id="np-${p}"/>
                  <span>${PERM_ICONS[p]||""} ${allPermLabels[p]||p}</span>
                </label>`).join("")}
            </div>
          </div>
          <div id="create-admin-error" class="error-msg"></div>
          <div id="create-admin-success" class="success-msg"></div>
          <button class="btn-primary" style="padding:10px 24px;" onclick="createAdmin()">➕ Create Admin</button>
        </div>`;
    }

    container.innerHTML = html;
  } catch(e) {
    container.innerHTML = `<div class="empty-state">Could not load admin tree. ${e.message}</div>`;
  }
}

async function createAdmin() {
  const target = document.getElementById("new-admin-username").value.trim();
  const perms = [...document.querySelectorAll("#new-admin-perms input:checked")].map(i => i.value);
  const errEl = document.getElementById("create-admin-error");
  const sucEl = document.getElementById("create-admin-success");

  if(!target) { errEl.textContent = "Please enter a username!"; errEl.classList.add("show"); return; }
  if(!perms.length) { errEl.textContent = "Please assign at least one permission!"; errEl.classList.add("show"); return; }

  try {
    const res = await fetch(`${API}/admin/create-admin`, {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ creator: currentUser.username, target, permissions: perms })
    });
    const data = await res.json();
    if(res.ok) {
      sucEl.textContent = "✅ " + data.message; sucEl.classList.add("show");
      document.getElementById("new-admin-username").value = "";
      document.querySelectorAll("#new-admin-perms input").forEach(i => i.checked = false);
      setTimeout(loadAdminTree, 1000);
    } else {
      errEl.textContent = data.error; errEl.classList.add("show");
    }
  } catch { errEl.textContent = "Error creating admin!"; errEl.classList.add("show"); }
}

function openEditPermsModal(username, currentPerms) {
  editTarget = username;
  document.getElementById("edit-target-name").textContent = "@" + username;
  const container = document.getElementById("edit-perms-container");
  container.innerHTML = myPermissions.map(p => `
    <label class="perm-checkbox">
      <input type="checkbox" value="${p}" ${currentPerms.includes(p) ? "checked" : ""}/>
      <span>${PERM_ICONS[p]||""} ${allPermLabels[p]||p}</span>
    </label>`).join("");
  document.getElementById("edit-perms-modal").style.display = "flex";
}

async function saveEditPerms() {
  const perms = [...document.querySelectorAll("#edit-perms-container input:checked")].map(i => i.value);
  try {
    const res = await fetch(`${API}/admin/update-permissions`, {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ updater: currentUser.username, target: editTarget, permissions: perms })
    });
    const data = await res.json();
    alert(data.message || data.error);
    document.getElementById("edit-perms-modal").style.display = "none";
    loadAdminTree();
  } catch { alert("Error!"); }
}

async function revokeAdmin(target) {
  if(!confirm(`Revoke ALL admin access from @${target}? Their sub-admins will also lose permissions.`)) return;
  try {
    const res = await fetch(`${API}/admin/revoke-admin`, {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ revoker: currentUser.username, target })
    });
    const data = await res.json();
    alert(data.message || data.error);
    loadAdminTree();
  } catch { alert("Error!"); }
}

// ── USERS TABLE ───────────────────────────────────────────────
async function loadUsers() {
  try {
    const res = await fetch(`${API}/admin/users?username=${currentUser.username}`);
    allUsers = await res.json();
    if(allUsers.error) { document.getElementById("users-tbody").innerHTML = `<tr><td colspan="7" style="color:var(--text-muted);text-align:center;">${allUsers.error}</td></tr>`; return; }
    filterUsers();
  } catch {}
}

function filterUsers() {
  const q = (document.getElementById("user-search")?.value||"").toLowerCase();
  const filtered = allUsers.filter(u =>
    u.username.toLowerCase().includes(q) || u.fullname.toLowerCase().includes(q)
  );
  renderUsers(filtered);
}

function renderUsers(users) {
  const tbody = document.getElementById("users-tbody");
  if(!users.length) { tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--text-muted);">No users found</td></tr>`; return; }
  tbody.innerHTML = users.map(u => {
    const role = u.username === currentUser.username && myRole==="superadmin" ? "superadmin" : (u.role||"user");
    const banned = u.banned||false;
    const roleBadge = role==="superadmin" ? `<span class="role-badge superadmin-badge">👑 Super Admin</span>`
      : role==="admin" ? `<span class="role-badge admin-badge">🛡️ Admin</span>`
      : `<span class="role-badge user-badge">👤 User</span>`;
    const statusBadge = banned ? `<span class="role-badge banned-badge">🚫 Banned</span>` : `<span class="role-badge active-badge">✅ Active</span>`;
    const warnBadge = u.warning_count>0 ? `<span class="role-badge" style="background:rgba(251,191,36,0.15);color:#fbbf24;">⚠️ ${u.warning_count}</span>` : "—";

    let actions = "";
    if(role !== "superadmin") {
      if(myPermissions.includes("warn_users")) actions += `<button class="admin-action-btn" style="border-color:#fbbf24;color:#fbbf24;" onclick="openWarnModal('${u.username}')">⚠️ Warn</button>`;
      if(myPermissions.includes("ban_users")) {
        if(!banned) actions += `<button class="admin-action-btn ban-btn" onclick="openBanModal('${u.username}')">🚫 Ban</button>`;
        else actions += `<button class="admin-action-btn unban-btn" onclick="unbanUser('${u.username}')">✅ Unban</button>`;
      }
    }
    if(!actions) actions = `<span style="color:var(--text-muted);">—</span>`;

    return `<tr>
      <td><strong>@${esc(u.username)}</strong></td>
      <td>${esc(u.fullname)}</td>
      <td>${esc(u.stream)}</td>
      <td>${roleBadge}</td>
      <td>${statusBadge}</td>
      <td>${warnBadge}</td>
      <td><div style="display:flex;gap:4px;flex-wrap:wrap;">${actions}</div></td>
    </tr>`;
  }).join("");
}

// ── WARN MODAL ────────────────────────────────────────────────
function openWarnModal(username) {
  warnTarget = username;
  document.getElementById("warn-target-name").textContent = "@" + username;
  document.getElementById("warn-reason").value = "";
  document.getElementById("warn-modal").style.display = "flex";
}
async function submitWarn() {
  const reason = document.getElementById("warn-reason").value.trim();
  if(!reason) return alert("Please enter a reason!");
  try {
    const res = await fetch(`${API}/admin/warn`, {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ requester: currentUser.username, target: warnTarget, reason })
    });
    const data = await res.json();
    alert(data.message || data.error);
    document.getElementById("warn-modal").style.display = "none";
    loadUsers();
  } catch { alert("Error!"); }
}

// ── BAN MODAL ─────────────────────────────────────────────────
function openBanModal(username) {
  banTarget = username;
  document.getElementById("ban-target-name").textContent = "@" + username;
  document.getElementById("ban-duration").value = "0";
  document.querySelectorAll(".expiry-option").forEach(e => e.classList.remove("selected"));
  document.querySelector(".expiry-option[data-val='0']")?.classList.add("selected");
  document.getElementById("ban-modal").style.display = "flex";
}
function selectBanDur(el) {
  document.querySelectorAll(".expiry-option").forEach(e => e.classList.remove("selected"));
  el.classList.add("selected");
  document.getElementById("ban-duration").value = el.dataset.val;
}
async function submitBan() {
  const duration = document.getElementById("ban-duration").value;
  try {
    const res = await fetch(`${API}/admin/ban`, {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ requester: currentUser.username, target: banTarget, action:"ban", duration_hours: parseInt(duration) })
    });
    const data = await res.json();
    alert(data.message || data.error);
    document.getElementById("ban-modal").style.display = "none";
    loadUsers();
  } catch { alert("Error!"); }
}
async function unbanUser(target) {
  if(!confirm(`Unban @${target}?`)) return;
  try {
    const res = await fetch(`${API}/admin/ban`, {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ requester: currentUser.username, target, action:"unban" })
    });
    const data = await res.json();
    alert(data.message || data.error);
    loadUsers();
  } catch { alert("Error!"); }
}

// ── REPORTED POSTS ────────────────────────────────────────────
async function loadReportedPosts() {
  const feed = document.getElementById("reported-feed");
  try {
    const res = await fetch(`${API}/admin/reported-posts?username=${currentUser.username}`);
    const posts = await res.json();
    if(posts.error) { feed.innerHTML = `<div class="empty-state">${posts.error}</div>`; return; }
    if(!posts.length) { feed.innerHTML = `<div class="empty-state">✅ No reported posts!</div>`; return; }
    feed.innerHTML = posts.map(p => `
      <div class="post-card" style="border-left:3px solid #ff4444;">
        <div class="post-card-header">
          <div class="post-topic-badge">⚠️ ${esc(p.topic)}</div>
          <div class="post-meta">${timeAgo(p.createdAt)}</div>
        </div>
        <div class="post-title">${esc(p.title)}</div>
        <div class="post-desc">${esc(p.description)}</div>
        <div style="margin:8px 0;padding:10px;background:rgba(255,68,68,0.08);border-radius:8px;font-size:0.82rem;color:#ff8888;">
          ⚠️ Reported ${p.reports.length}x: ${p.reports.slice(0,3).map(r=>`"${esc(r.reason)}" by @${esc(r.username)}`).join(" · ")}
        </div>
        <div class="post-footer">
          <div class="post-author">By <span>@${esc(p.username)}</span></div>
          <div class="post-actions">
            ${myPermissions.includes("delete_reports") ? `<button class="admin-action-btn ban-btn" onclick="deletePost('${p._id}')">🗑️ Delete Post</button>` : ""}
            ${myPermissions.includes("warn_users") ? `<button class="admin-action-btn" style="border-color:#fbbf24;color:#fbbf24;" onclick="openWarnModal('${p.username}')">⚠️ Warn Author</button>` : ""}
          </div>
        </div>
      </div>`).join("");
  } catch { feed.innerHTML = `<div class="empty-state">Could not load reported posts.</div>`; }
}

async function deletePost(postId) {
  if(!confirm("Delete this post permanently?")) return;
  try {
    const res = await fetch(`${API}/admin/delete-post/${postId}?username=${currentUser.username}`, { method:"DELETE" });
    const data = await res.json();
    alert(data.message || data.error);
    loadReportedPosts();
  } catch { alert("Error!"); }
}

// ── ANNOUNCEMENT ──────────────────────────────────────────────
async function postAnnouncement() {
  const title = document.getElementById("ann-title").value.trim();
  const msg   = document.getElementById("ann-msg").value.trim();
  const errEl = document.getElementById("ann-error");
  const sucEl = document.getElementById("ann-success");
  if(!title||!msg) { errEl.textContent = "Title and message required!"; errEl.classList.add("show"); return; }
  try {
    const res = await fetch(`${API}/admin/announce`, {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ username: currentUser.username, title, message: msg })
    });
    const data = await res.json();
    if(res.ok) {
      sucEl.textContent = "✅ " + data.message; sucEl.classList.add("show");
      document.getElementById("ann-title").value = "";
      document.getElementById("ann-msg").value = "";
      loadPastAnnouncements();
    } else { errEl.textContent = data.error; errEl.classList.add("show"); }
  } catch { alert("Error!"); }
}

async function loadPastAnnouncements() {
  try {
    const res = await fetch(`${API}/admin/announcements`);
    const anns = await res.json();
    const el = document.getElementById("past-announcements");
    if(!el) return;
    if(!anns.length) { el.innerHTML = `<div class="empty-state">No announcements yet.</div>`; return; }
    el.innerHTML = anns.map(a => `
      <div class="announcement-card">
        <div class="ann-header">
          <span class="ann-badge ${a.role==='superadmin'?'superadmin-badge':'admin-badge'}">${a.role==='superadmin'?'👑':'🛡️'} ${a.role==='superadmin'?'Super Admin':'Admin'}</span>
          <strong>${esc(a.title)}</strong>
          <span class="post-meta">${timeAgo(a.createdAt)}</span>
        </div>
        <div style="color:var(--text);margin-top:8px;">${esc(a.message)}</div>
        <div style="font-size:0.78rem;color:var(--text-muted);margin-top:6px;">By @${esc(a.username)}</div>
      </div>`).join("");
  } catch {}
}

// ── AUDIT LOG ─────────────────────────────────────────────────
async function loadAuditLog() {
  const tbody = document.getElementById("audit-tbody");
  try {
    const res = await fetch(`${API}/admin/audit-logs?username=${currentUser.username}`);
    const logs = await res.json();
    if(logs.error) { tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);">${logs.error}</td></tr>`; return; }
    if(!logs.length) { tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);">No audit logs yet.</td></tr>`; return; }
    const colors = { BAN:"#f87171",UNBAN:"#4ade80",WARN:"#fbbf24",DELETE_POST:"#f87171",CREATE_ADMIN:"#a78bfa",UPDATE_PERMISSIONS:"#60a5fa",REVOKE_ADMIN:"#fb923c",ANNOUNCEMENT:"#60a5fa",BACKUP:"#34d399",REPORT_POST:"#fb923c" };
    tbody.innerHTML = logs.map(l => `
      <tr>
        <td style="color:var(--text-muted);font-size:0.8rem;">${timeAgo(l.at)}</td>
        <td><strong>@${esc(l.actor)}</strong></td>
        <td><span style="background:rgba(150,150,150,0.15);color:${colors[l.action]||'#9ca3af'};padding:3px 10px;border-radius:20px;font-size:0.78rem;font-weight:700;">${esc(l.action)}</span></td>
        <td>${l.target?`@${esc(l.target)}`:"—"}</td>
        <td style="color:var(--text-muted);font-size:0.82rem;">${esc(l.detail)||"—"}</td>
      </tr>`).join("");
  } catch { tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);">Could not load.</td></tr>`; }
}

// ── BACKUP ────────────────────────────────────────────────────
async function downloadBackup() {
  try {
    const res = await fetch(`${API}/admin/backup?username=${currentUser.username}`);
    const data = await res.json();
    if(!res.ok) { alert(data.error); return; }
    const blob = new Blob([JSON.stringify(data,null,2)], {type:"application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `campusconnect_backup_${new Date().toISOString().split("T")[0]}.json`;
    a.click(); URL.revokeObjectURL(url);
  } catch { alert("Backup failed!"); }
}

init();
