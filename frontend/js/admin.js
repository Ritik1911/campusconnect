// ============================
// CampusConnect — admin.js
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
let allUsers = [];
let warnTarget = "";
let banTarget = "";

// ── TABS ──────────────────────────────────────────────────────
function showTab(tab) {
  ["overview","reports","users","announce","audit","backup"].forEach(t => {
    document.getElementById(`tab-content-${t}`).style.display = t===tab ? "block" : "none";
    const btn = document.getElementById(`tab-${t}`);
    if(btn) btn.style.background = t===tab ? "var(--primary)" : "";
  });
  if(tab==="reports") loadReportedPosts();
  if(tab==="users") loadUsers();
  if(tab==="audit") loadAuditLog();
  if(tab==="announce") loadPastAnnouncements();
}

// ── INIT ──────────────────────────────────────────────────────
async function init() {
  try {
    const res = await fetch(`${API}/admin/my-role?username=${currentUser.username}`);
    const data = await res.json();
    myRole = data.role;
  } catch { myRole = "user"; }

  if (myRole === "user") {
    document.getElementById("access-denied").style.display = "block";
    return;
  }

  document.getElementById("admin-content").style.display = "block";
  const badge = document.getElementById("admin-nav-badge");

  if (myRole === "superadmin") {
    badge.textContent = "👑 SUPER ADMIN";
    badge.className = "admin-nav-badge superadmin-badge";
    document.getElementById("admin-title").textContent = "👑 Super-Admin Panel";
    document.getElementById("admin-subtitle").textContent = "Full platform control — manage admins, view all stats, backup data";
    document.getElementById("tab-backup").style.display = "inline-block";
  } else {
    badge.textContent = "🛡️ ADMIN";
    badge.className = "admin-nav-badge admin-badge";
    document.getElementById("admin-title").textContent = "🛡️ Admin Panel";
    document.getElementById("admin-subtitle").textContent = "Moderate content, manage users, post announcements";
  }

  showTab("overview");
  loadStats();
}

// ── STATS + CHART ─────────────────────────────────────────────
async function loadStats() {
  try {
    const res = await fetch(`${API}/admin/stats?username=${currentUser.username}`);
    const s = await res.json();
    document.getElementById("s-users").textContent    = s.total_users;
    document.getElementById("s-posts").textContent    = s.total_posts;
    document.getElementById("s-comments").textContent = s.total_comments;
    document.getElementById("s-admins").textContent   = s.total_admins;
    document.getElementById("s-banned").textContent   = s.total_banned;
    document.getElementById("s-warnings").textContent = s.total_warnings;
    document.getElementById("s-today").textContent    = s.posts_today;
    document.getElementById("s-new-users").textContent = s.users_today;

    // Weekly chart
    const ctx = document.getElementById("weekly-chart").getContext("2d");
    new Chart(ctx, {
      type: "bar",
      data: {
        labels: s.weekly.map(d => d.day),
        datasets: [{
          label: "Posts",
          data: s.weekly.map(d => d.count),
          backgroundColor: "rgba(108,71,255,0.5)",
          borderColor: "rgba(108,71,255,1)",
          borderWidth: 2,
          borderRadius: 6,
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: "#9ca3af" }, grid: { color: "rgba(255,255,255,0.05)" } },
          y: { ticks: { color: "#9ca3af", stepSize: 1 }, grid: { color: "rgba(255,255,255,0.05)" }, beginAtZero: true }
        }
      }
    });
  } catch {}
}

// ── USERS TABLE ───────────────────────────────────────────────
async function loadUsers() {
  try {
    const res = await fetch(`${API}/admin/users?username=${currentUser.username}`);
    allUsers = await res.json();
    renderUsers(allUsers);
  } catch {}
}

function filterUsers() {
  const q = document.getElementById("user-search").value.toLowerCase();
  renderUsers(allUsers.filter(u =>
    u.username.toLowerCase().includes(q) || u.fullname.toLowerCase().includes(q) || (u.stream||"").toLowerCase().includes(q)
  ));
}

function renderUsers(users) {
  const tbody = document.getElementById("users-tbody");
  if (!users.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--text-muted);">No users found</td></tr>`;
    return;
  }
  tbody.innerHTML = users.map(u => {
    const role = u.username === "Ritik1911" ? "superadmin" : (u.role || "user");
    const banned = u.banned || false;
    const warnCount = u.warning_count || 0;

    const roleBadge = role==="superadmin"
      ? `<span class="role-badge superadmin-badge">👑 Super Admin</span>`
      : role==="admin"
      ? `<span class="role-badge admin-badge">🛡️ Admin</span>`
      : `<span class="role-badge user-badge">👤 User</span>`;

    const statusBadge = banned
      ? `<span class="role-badge banned-badge">🚫 Banned</span>`
      : `<span class="role-badge active-badge">✅ Active</span>`;

    const warnBadge = warnCount > 0
      ? `<span class="role-badge" style="background:rgba(251,191,36,0.15);color:#fbbf24;border:1px solid rgba(251,191,36,0.3);">⚠️ ${warnCount}</span>`
      : `<span style="color:var(--text-muted);">—</span>`;

    let actions = "";
    if (role !== "superadmin") {
      // Warn button (all admins can warn users)
      if (role !== "admin" || myRole === "superadmin") {
        actions += `<button class="admin-action-btn" style="border-color:#fbbf24;color:#fbbf24;" onclick="openWarnModal('${u.username}')">⚠️ Warn</button>`;
      }
      // Promote/Demote (super-admin only)
      if (myRole === "superadmin") {
        if (role === "user") {
          actions += `<button class="admin-action-btn promote-btn" onclick="promoteUser('${u.username}','admin')">⬆️ Make Admin</button>`;
          actions += `<button class="admin-action-btn" style="border-color:gold;color:gold;" onclick="makeSuperAdmin('${u.username}','add')">👑 Make Super-Admin</button>`;
        } else if (role === "admin") {
          actions += `<button class="admin-action-btn demote-btn" onclick="promoteUser('${u.username}','user')">⬇️ Remove Admin</button>`;
          actions += `<button class="admin-action-btn" style="border-color:gold;color:gold;" onclick="makeSuperAdmin('${u.username}','add')">👑 Make Super-Admin</button>`;
        } else if (role === "superadmin" && u.username !== currentUser.username) {
          actions += `<button class="admin-action-btn demote-btn" onclick="makeSuperAdmin('${u.username}','remove')">⬇️ Remove Super-Admin</button>`;
        }
      }
      // Ban/Unban
      if (!banned) {
        actions += `<button class="admin-action-btn ban-btn" onclick="openBanModal('${u.username}')">🚫 Ban</button>`;
      } else {
        actions += `<button class="admin-action-btn unban-btn" onclick="unbanUser('${u.username}')">✅ Unban</button>`;
      }
    }
    if (!actions) actions = `<span style="color:var(--text-muted);">—</span>`;

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
  if (!reason) return alert("Please enter a reason!");
  try {
    const res = await fetch(`${API}/admin/warn`, {
      method: "POST", headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ requester: currentUser.username, target: warnTarget, reason })
    });
    const data = await res.json();
    alert(data.message || data.error);
    document.getElementById("warn-modal").style.display = "none";
    loadUsers(); loadStats();
  } catch { alert("Error!"); }
}

// ── BAN MODAL ─────────────────────────────────────────────────
function openBanModal(username) {
  banTarget = username;
  document.getElementById("ban-target-name").textContent = "@" + username;
  document.getElementById("ban-duration").value = "0";
  document.querySelectorAll(".expiry-option").forEach(e => e.classList.remove("selected"));
  document.querySelector(".expiry-option[data-val='0']").classList.add("selected");
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
      method: "POST", headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ requester: currentUser.username, target: banTarget, action: "ban", duration_hours: parseInt(duration) })
    });
    const data = await res.json();
    alert(data.message || data.error);
    document.getElementById("ban-modal").style.display = "none";
    loadUsers(); loadStats();
  } catch { alert("Error!"); }
}
async function unbanUser(target) {
  if (!confirm(`Unban @${target}?`)) return;
  try {
    const res = await fetch(`${API}/admin/ban`, {
      method: "POST", headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ requester: currentUser.username, target, action: "unban" })
    });
    const data = await res.json();
    alert(data.message || data.error);
    loadUsers(); loadStats();
  } catch { alert("Error!"); }
}

// ── PROMOTE ───────────────────────────────────────────────────
async function promoteUser(target, role) {
  if (!confirm(`${role==="admin"?"Promote":"Demote"} @${target}?`)) return;
  try {
    const res = await fetch(`${API}/admin/promote`, {
      method: "POST", headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ requester: currentUser.username, target, role })
    });
    const data = await res.json();
    alert(data.message || data.error);
    loadUsers(); loadStats();
  } catch { alert("Error!"); }
}

// ── REPORTED POSTS ────────────────────────────────────────────
async function loadReportedPosts() {
  const feed = document.getElementById("reported-feed");
  try {
    const res = await fetch(`${API}/admin/reported-posts?username=${currentUser.username}`);
    const posts = await res.json();
    if (!posts.length) {
      feed.innerHTML = `<div class="empty-state">✅ No reported posts. Everything looks clean!</div>`;
      return;
    }
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
          <div class="post-author">By <span>@${esc(p.username)}</span> · ${esc(p.stream)}</div>
          <div class="post-actions">
            <button class="admin-action-btn ban-btn" onclick="deletePost('${p._id}')">🗑️ Delete Post</button>
            <button class="admin-action-btn" style="border-color:#fbbf24;color:#fbbf24;" onclick="openWarnModal('${p.username}')">⚠️ Warn Author</button>
          </div>
        </div>
      </div>`).join("");
  } catch {
    feed.innerHTML = `<div class="empty-state">Could not load reported posts.</div>`;
  }
}

async function deletePost(postId) {
  if (!confirm("Delete this post permanently?")) return;
  try {
    const res = await fetch(`${API}/admin/delete-post/${postId}?username=${currentUser.username}`, { method: "DELETE" });
    const data = await res.json();
    alert(data.message || data.error);
    loadReportedPosts(); loadStats();
  } catch { alert("Error!"); }
}

// ── ANNOUNCEMENT ──────────────────────────────────────────────
async function postAnnouncement() {
  const title = document.getElementById("ann-title").value.trim();
  const msg   = document.getElementById("ann-msg").value.trim();
  const errEl = document.getElementById("ann-error");
  const sucEl = document.getElementById("ann-success");
  if (!title || !msg) {
    errEl.textContent = "Title and message required!"; errEl.classList.add("show"); return;
  }
  try {
    const res = await fetch(`${API}/admin/announce`, {
      method: "POST", headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ username: currentUser.username, title, message: msg })
    });
    const data = await res.json();
    if (res.ok) {
      sucEl.textContent = "✅ " + data.message; sucEl.classList.add("show");
      document.getElementById("ann-title").value = "";
      document.getElementById("ann-msg").value = "";
      loadPastAnnouncements();
    }
  } catch { alert("Error!"); }
}

async function loadPastAnnouncements() {
  try {
    const res = await fetch(`${API}/admin/announcements`);
    const anns = await res.json();
    const el = document.getElementById("past-announcements");
    if (!anns.length) { el.innerHTML = `<div class="empty-state">No announcements yet.</div>`; return; }
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
    if (!logs.length) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);">No audit logs yet.</td></tr>`;
      return;
    }
    const actionColor = { BAN:"#f87171", UNBAN:"#4ade80", WARN:"#fbbf24", DELETE_POST:"#f87171", ROLE_CHANGE:"#a78bfa", ANNOUNCEMENT:"#60a5fa", BACKUP:"#34d399", REPORT_POST:"#fb923c" };
    tbody.innerHTML = logs.map(l => `
      <tr>
        <td style="color:var(--text-muted);font-size:0.8rem;">${timeAgo(l.at)}</td>
        <td><strong>@${esc(l.actor)}</strong></td>
        <td><span style="background:rgba(${actionColor[l.action]||'#9ca3af'},0.15);color:${actionColor[l.action]||'#9ca3af'};padding:3px 10px;border-radius:20px;font-size:0.78rem;font-weight:700;">${esc(l.action)}</span></td>
        <td>${l.target ? `@${esc(l.target)}` : '—'}</td>
        <td style="color:var(--text-muted);font-size:0.82rem;">${esc(l.detail)||'—'}</td>
      </tr>`).join("");
  } catch {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);">Could not load audit logs.</td></tr>`;
  }
}

// ── BACKUP ────────────────────────────────────────────────────
async function downloadBackup() {
  try {
    const res = await fetch(`${API}/admin/backup?username=${currentUser.username}`);
    const data = await res.json();
    if (!res.ok) { alert(data.error); return; }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url;
    a.download = `campusconnect_backup_${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  } catch { alert("Backup failed!"); }
}

async function clearExpiredPosts() {
  if (!confirm("This will delete all expired posts permanently. Are you sure?")) return;
  alert("Feature coming soon — contact database admin.");
}

async function makeSuperAdmin(target, action) {
  const msg = action === "add"
    ? `Give @${target} FULL Super-Admin powers? They will have the same access as you!`
    : `Remove Super-Admin access from @${target}?`;
  if (!confirm(msg)) return;
  try {
    const res = await fetch(`${API}/admin/set-superadmin`, {
      method: "POST", headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ requester: currentUser.username, target, action })
    });
    const data = await res.json();
    alert(data.message || data.error);
    loadUsers(); loadStats();
  } catch { alert("Error!"); }
}

init();
