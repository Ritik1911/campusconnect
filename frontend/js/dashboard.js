// ============================
// CampusConnect — dashboard.js
// ============================

const API = "https://campusconnect-f6s5.onrender.com/api";
const currentUser = JSON.parse(localStorage.getItem("cc_user"));
if (!currentUser) window.location.href = "index.html";

document.getElementById("nav-username").textContent = "👤 " + currentUser.username;
document.getElementById("welcome-text").textContent = `Welcome, ${currentUser.fullname.split(" ")[0]}! 👋`;
document.getElementById("welcome-sub").textContent = `${currentUser.stream} · ${currentUser.year} · ${currentUser.semester}`;

function logout() {
  localStorage.removeItem("cc_user");
  window.location.href = "index.html";
}

let activeFilter = "all";
let currentCommentPostId = null;
let lastPostIds = [];
let lastPostsFull = []; // full post objects from the last successful /posts/all load

// Free-tier hosting can be asleep on the first request of the day and take
// 10-40s to wake up, which used to show up to users as a flat "Could not load
// posts/comments" error. Retry a couple of times with a longer timeout before
// actually giving up, so a slow cold-start doesn't look like a broken app.
async function fetchWithRetry(url, options = {}, retries = 2, timeoutMs = 15000) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timer);
      return res;
    } catch (err) {
      clearTimeout(timer);
      if (attempt === retries) throw err;
      await new Promise(r => setTimeout(r, 1200 * (attempt + 1)));
    }
  }
}

function getReadPosts() { return JSON.parse(localStorage.getItem("cc_read") || "[]"); }
function getInterestedPosts() { return JSON.parse(localStorage.getItem("cc_interested") || "[]"); }

// Track which posts this browser has already laid eyes on, so a freshly
// arrived post can be highlighted distinctly instead of blending in (item 5).
function getSeenPosts() { return JSON.parse(localStorage.getItem("cc_seen_posts") || "[]"); }
function markPostsSeen(ids) {
  const seen = new Set(getSeenPosts());
  ids.forEach(id => seen.add(id));
  // Cap stored history so localStorage doesn't grow unbounded
  const trimmed = [...seen].slice(-500);
  localStorage.setItem("cc_seen_posts", JSON.stringify(trimmed));
}

function toggleRead(postId) {
  let read = getReadPosts();
  if (read.includes(postId)) read = read.filter(id => id !== postId);
  else read.push(postId);
  localStorage.setItem("cc_read", JSON.stringify(read));
  loadPosts();
  loadReadSection();
  loadCounts();
}

function toggleInterested(postId) {
  let interested = getInterestedPosts();
  if (interested.includes(postId)) interested = interested.filter(id => id !== postId);
  else interested.push(postId);
  localStorage.setItem("cc_interested", JSON.stringify(interested));
  loadPosts();
}

// READ POSTS MODAL (item 3 — dedicated panel instead of an inline strip)
function showReadPosts() {
  document.getElementById("read-modal").style.display = "flex";
  loadReadSection();
}

async function loadReadSection() {
  const feed = document.getElementById("read-posts-feed");
  const readIds = getReadPosts();

  if (!readIds.length) {
    feed.innerHTML = `<div class="empty-state">No posts marked as read yet.</div>`;
    return;
  }
  feed.innerHTML = `<div class="empty-state">Loading...</div>`;

  try {
    const res = await fetchWithRetry(`${API}/posts/all`);
    const posts = await res.json();
    const readPosts = posts.filter(p => readIds.includes(p._id));

    if (!readPosts.length) {
      feed.innerHTML = `<div class="empty-state">Your read posts have expired or been removed.</div>`;
      return;
    }

    feed.innerHTML = readPosts.map(p => `
      <div class="post-card post-read" style="margin-bottom:14px;">
        <div class="post-card-header">
          <div class="post-topic-badge">${emoji(p.topic)} ${p.topic}</div>
          <div class="post-meta">${timeAgo(p.createdAt)}</div>
        </div>
        <div class="post-title">${esc(p.title)}</div>
        <div class="post-desc">${esc(p.description)}</div>
        <div class="post-footer">
          <div class="post-author">By <span>@${p.username}</span> · ${p.stream} · ${p.year}</div>
          <div class="post-actions">
            <button class="post-action-btn btn-unread" onclick="toggleRead('${p._id}');showReadPosts();">↩ Mark Unread</button>
            <button class="post-contact-btn" onclick="showContact('${p._id}')">📞 Contact</button>
            <button class="post-action-btn" style="border-color:#ff6666;color:#ff6666;" onclick="reportPost('${p._id}')">⚠️ Report</button>
          </div>
        </div>
      </div>`).join("");
  } catch {
    feed.innerHTML = `<div class="empty-state">❌ Could not load read posts. <button class="post-action-btn" onclick="loadReadSection()">🔄 Retry</button></div>`;
  }
}

// SAVED POSTS MODAL
function showSavedPosts() {
  const interested = getInterestedPosts();
  const modal = document.getElementById("saved-modal");
  const list = document.getElementById("saved-list");

  if (!interested.length) {
    list.innerHTML = `<div class="empty-state" style="padding:20px;">No saved posts yet. Press ⭐ on any post to save it here!</div>`;
    modal.style.display = "flex";
    return;
  }

  fetchWithRetry(`${API}/posts/all`).then(r => r.json()).then(posts => {
    const saved = posts.filter(p => interested.includes(p._id));
    if (!saved.length) {
      list.innerHTML = `<div class="empty-state" style="padding:20px;">Your saved posts have expired.</div>`;
    } else {
      list.innerHTML = saved.map(p => `
        <div class="post-card post-interested" style="margin-bottom:12px;">
          <div class="post-card-header">
            <div class="post-topic-badge">${emoji(p.topic)} ${p.topic}</div>
            <div class="post-meta">${timeAgo(p.createdAt)}</div>
          </div>
          <div class="post-title">${esc(p.title)}</div>
          <div class="post-desc">${esc(p.description)}</div>
          <div class="post-footer">
            <div class="post-author">By <span>@${p.username}</span> · ${p.stream}</div>
            <div class="post-actions">
              <button class="post-action-btn btn-interested-active" onclick="toggleInterested('${p._id}');showSavedPosts();">⭐ Remove</button>
              <button class="post-contact-btn" onclick="showContact('${p._id}')">📞 Contact</button>
            <button class="post-action-btn" style="border-color:#ff6666;color:#ff6666;" onclick="reportPost('${p._id}')">⚠️ Report</button>
            </div>
          </div>
        </div>`).join("");
    }
    modal.style.display = "flex";
  }).catch(() => {
    list.innerHTML = `<div class="empty-state">❌ Could not load posts. <button class="post-action-btn" onclick="showSavedPosts()">🔄 Retry</button></div>`;
    modal.style.display = "flex";
  });
}

// FILTER
function filterPosts(topic, chipEl) {
  activeFilter = topic;
  document.querySelectorAll(".chip").forEach(c => c.classList.remove("active"));
  chipEl.classList.add("active");
  loadPosts();
  loadSuggestions();
}

// TOPIC COUNTS — shows how many UNREAD (i.e. new-to-you) posts are in each
// topic, and briefly pulses a topic's badge when that count goes up so a
// fresh post is obvious without the user needing to re-scan the numbers.
let lastUnreadCounts = {};
async function loadCounts() {
  try {
    const res = await fetchWithRetry(`${API}/posts/all`);
    const posts = await res.json();
    const readIds = getReadPosts();

    const map = {
      "all": "count-all",
      "Sincere Work": "count-sincere",
      "Fun Work": "count-fun",
      "Get Together": "count-gettogether",
      "Party": "count-party",
      "Earning": "count-earning",
      "Help": "count-help",
      "Learn": "count-learn",
      "Assignment": "count-assignment",
      "Exam": "count-exam",
      "Other": "count-other"
    };
    const validTopics = Object.keys(map).filter(t => t !== "all");

    // Count only UNREAD posts per topic
    const unreadCounts = { all: 0 };
    posts.forEach(p => {
      if (readIds.includes(p._id)) return; // already read, don't count
      const t = validTopics.includes(p.topic) ? p.topic : "Other";
      unreadCounts[t] = (unreadCounts[t] || 0) + 1;
      unreadCounts.all += 1;
    });

    for (const [topic, elId] of Object.entries(map)) {
      const el = document.getElementById(elId);
      if (el) {
        const count = unreadCounts[topic] || 0;
        if (count > 0) {
          if (count > (lastUnreadCounts[topic] || 0)) {
            el.classList.remove("chip-count-pulse");
            void el.offsetWidth; // restart animation
            el.classList.add("chip-count-pulse");
          }
          el.textContent = count;
          el.style.display = "inline-flex";
        } else {
          el.style.display = "none";
        }
      }
    }
    lastUnreadCounts = unreadCounts;
  } catch {}
}

// SUGGESTIONS — closeable, and re-openable whenever the user wants it back
function suggestionsHidden() { return localStorage.getItem("cc_suggestions_hidden") === "1"; }

function applySuggestionsVisibility() {
  const hidden = suggestionsHidden();
  document.getElementById("suggestions-title").style.display = hidden ? "none" : "flex";
  document.getElementById("suggestions-box").style.display = hidden ? "none" : "grid";
  document.getElementById("suggestions-restore-btn").style.display = hidden ? "inline-block" : "none";
}

function hideSuggestions() {
  localStorage.setItem("cc_suggestions_hidden", "1");
  applySuggestionsVisibility();
}

function showSuggestionsBox() {
  localStorage.removeItem("cc_suggestions_hidden");
  applySuggestionsVisibility();
  loadSuggestions();
}

async function loadSuggestions() {
  applySuggestionsVisibility();
  if (suggestionsHidden()) return;
  const box = document.getElementById("suggestions-box");
  const staticTips = [
    { topic: "Exam", title: "Form a study group for upcoming exams" },
    { topic: "Assignment", title: "Find assignment help from seniors in your stream" },
    { topic: "Earning", title: "Explore freelance opportunities on campus" },
    { topic: "Get Together", title: "Plan a meetup with students from your building" },
  ];
  try {
    const res = await fetchWithRetry(`${API}/posts/suggestions?username=${currentUser.username}`);
    const data = await res.json();
    const tips = data.length ? data : staticTips;
    box.innerHTML = tips.slice(0, 4).map(t => `
      <div class="suggestion-card">
        <div class="suggestion-tag">💡 ${t.topic}</div>
        <div class="suggestion-text">${esc(t.title)}</div>
      </div>`).join("");
  } catch {
    box.innerHTML = staticTips.map(t => `
      <div class="suggestion-card">
        <div class="suggestion-tag">💡 ${t.topic}</div>
        <div class="suggestion-text">${t.title}</div>
      </div>`).join("");
  }
}

// POSTS
async function loadPosts(silent = false) {
  const feed = document.getElementById("posts-feed");
  if (!silent) feed.innerHTML = `<div class="empty-state">Loading posts...</div>`;

  try {
    const url = activeFilter === "all"
      ? `${API}/posts/all`
      : `${API}/posts/all?topic=${encodeURIComponent(activeFilter)}`;

    const res = await fetchWithRetry(url);
    const posts = await res.json();

    const newIds = posts.map(p => p._id).join(",");
    if (silent && newIds === lastPostIds.join(",")) return;
    lastPostIds = posts.map(p => p._id);
    lastPostsFull = posts;

    if (!posts.length) {
      feed.innerHTML = `<div class="empty-state">No posts yet in this category. Be the first to post! 🚀</div>`;
      return;
    }

    const readPosts = getReadPosts();
    const interestedPosts = getInterestedPosts();
    const seenPosts = getSeenPosts();

    feed.innerHTML = posts.map(p => {
      const isRead = readPosts.includes(p._id);
      const isInterested = interestedPosts.includes(p._id);
      const isNew = !seenPosts.includes(p._id) && !isRead;
      const commentCount = (p.comments || []).length;

      return `
      <div class="post-card ${isRead ? 'post-read' : 'post-unread'} ${isInterested ? 'post-interested' : ''} ${isNew ? 'post-new' : ''}">
        <div class="post-card-header">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            ${isNew ? `<span class="new-post-badge">🆕 New</span>` : ''}
            <div class="post-topic-badge">${emoji(p.topic)} ${p.topic}</div>
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            ${p.expires_at ? `<span class="post-expiry" data-expires="${p.expires_at}">⏰ ${formatCountdown(p.expires_at)}</span>` : ''}
            <div class="post-meta">${timeAgo(p.createdAt)}</div>
          </div>
        </div>
        <div class="post-title">${esc(p.title)}</div>
        <div class="post-desc">${esc(p.description)}</div>
        <div class="post-footer">
          <div class="post-author">By <span>@${p.username}</span> · ${p.stream} · ${p.year} · ${p.building}</div>
          <div class="post-actions">
            <button class="post-action-btn ${isRead ? 'btn-read' : 'btn-unread'}" onclick="toggleRead('${p._id}')">
              ${isRead ? '✅ Read' : '👁 Unread'}
            </button>
            <button class="post-action-btn ${isInterested ? 'btn-interested-active' : 'btn-interested'}" onclick="toggleInterested('${p._id}')">
              ${isInterested ? '⭐ Saved' : '☆ Save'}
            </button>
            <button class="post-action-btn btn-comment" onclick="openCommentModal('${p._id}')">
              💬 ${commentCount > 0 ? commentCount : ''} Comment
            </button>
            <button class="post-contact-btn" onclick="showContact('${p._id}')">📞 Contact</button>
            <button class="post-action-btn" style="border-color:#ff6666;color:#ff6666;" onclick="reportPost('${p._id}')">⚠️ Report</button>
          </div>
        </div>
      </div>`;
    }).join("");

    // Let the "New" highlight sit on screen for a few seconds, then
    // remember these posts as seen so they don't stay highlighted forever.
    setTimeout(() => markPostsSeen(posts.map(p => p._id)), 4000);

  } catch {
    if (!silent) feed.innerHTML = `<div class="empty-state">❌ Could not load posts. <button class="post-action-btn" onclick="loadPosts()">🔄 Retry</button></div>`;
  }
}

// COMMENTS
function openCommentModal(postId) {
  currentCommentPostId = postId;
  document.getElementById("comment-input").value = "";
  document.getElementById("comments-list").innerHTML = `<div class="empty-state">Loading...</div>`;
  document.getElementById("comment-modal").style.display = "flex";
  loadComments(postId);
}
function closeCommentModal() {
  document.getElementById("comment-modal").style.display = "none";
  currentCommentPostId = null;
}
async function loadComments(postId) {
  try {
    const res = await fetchWithRetry(`${API}/posts/${postId}`);
    const post = await res.json();
    const comments = (post && post.comments) ? post.comments : [];
    const list = document.getElementById("comments-list");
    if (!comments.length) {
      list.innerHTML = `<div class="empty-state" style="padding:10px;">No comments yet. Be the first!</div>`;
      return;
    }
    list.innerHTML = comments.map(c => `
      <div style="padding:10px;border-bottom:1px solid var(--border);margin-bottom:6px;">
        <div style="font-weight:600;color:var(--primary-light);">@${esc(c.username)}</div>
        <div style="margin-top:4px;color:var(--text);">${esc(c.text)}</div>
        <div style="font-size:0.75rem;color:var(--text-muted);margin-top:4px;">${timeAgo(c.createdAt)}</div>
      </div>`).join("");
  } catch {
    document.getElementById("comments-list").innerHTML = `<div class="empty-state">❌ Could not load comments. <button class="post-action-btn" onclick="loadComments('${postId}')">🔄 Retry</button></div>`;
  }
}
async function submitComment() {
  const text = document.getElementById("comment-input").value.trim();
  if (!text || !currentCommentPostId) return;
  try {
    const res = await fetch(`${API}/posts/${currentCommentPostId}/comment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: currentUser.username, text })
    });
    if (res.ok) {
      document.getElementById("comment-input").value = "";
      loadComments(currentCommentPostId);
      loadCounts();
      loadPosts(true);
    }
  } catch {}
}

// CONTACT — gated by the poster's Preferred Contact Method (item 9)
async function showContact(postId) {
  const modal = document.createElement("div");
  modal.className = "modal-overlay";
  modal.innerHTML = `<div class="modal-card"><div class="empty-state">Loading...</div></div>`;
  modal.addEventListener("click", e => { if (e.target === modal) modal.remove(); });
  document.body.appendChild(modal);

  try {
    const res = await fetchWithRetry(`${API}/posts/${postId}/contact?viewer=${encodeURIComponent(currentUser.username)}`);
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || "Failed");

    let body = "";
    if (d.type === "profile") {
      body = `
        <h3>📞 Contact — @${esc(d.fullname||"")}</h3>
        <div class="modal-info"><strong>Name:</strong> ${esc(d.fullname||"")}</div>
        <div class="modal-info"><strong>Mobile:</strong> ${esc(d.mobile||"")}</div>
        <div class="modal-info"><strong>Email:</strong> ${esc(d.email||"")}</div>
        <div class="modal-info"><strong>Stream:</strong> ${esc(d.stream||"")} · ${esc(d.year||"")} · ${esc(d.semester||"")}</div>
        <div class="modal-info"><strong>Building:</strong> ${esc(d.building||"")}</div>
        <div class="modal-info"><strong>Location:</strong> ${esc(d.location||"")}</div>`;
    } else if (d.type === "whatsapp") {
      const digits = (d.mobile || "").replace(/\D/g, "");
      body = `
        <h3>💬 WhatsApp — @${esc(d.fullname||"")}</h3>
        <div class="modal-info"><strong>Number:</strong> ${esc(d.mobile||"")}</div>
        ${digits ? `<a class="btn-primary" style="display:inline-block;text-align:center;margin-top:12px;text-decoration:none;" target="_blank" href="https://wa.me/91${digits}">💬 Open in WhatsApp</a>` : ""}`;
    } else if (d.type === "meet") {
      body = `
        <h3>🤝 Meet on Campus</h3>
        <p style="color:var(--text-muted);margin-top:8px;">${esc(d.message||"")}</p>`;
    } else if (d.type === "comment") {
      body = `
        <h3>💬 Comment Only</h3>
        <p style="color:var(--text-muted);margin-top:8px;">${esc(d.message||"")}</p>
        <button class="btn-primary" style="margin-top:10px;" onclick="this.closest('.modal-overlay').remove();openCommentModal('${postId}')">💬 Open Comments</button>`;
    } else if (d.type === "pending") {
      body = `
        <h3>⏳ Request Pending</h3>
        <p style="color:var(--text-muted);margin-top:8px;">You've asked @${esc(d.fullname||"")} for permission to view their profile. You'll get a notification once they respond.</p>`;
    } else if (d.type === "denied") {
      body = `
        <h3>🙅 Request Declined</h3>
        <p style="color:var(--text-muted);margin-top:8px;">@${esc(d.fullname||"")} declined your last request.</p>
        <button class="btn-primary" style="margin-top:10px;" onclick="requestContactAccess('${postId}', this)">🔁 Ask Again</button>`;
    } else {
      // "none" — profile method, no request sent yet
      body = `
        <h3>🔒 Permission Needed</h3>
        <p style="color:var(--text-muted);margin-top:8px;">@${esc(d.fullname||"")} shares their profile only with people they approve. Send a request to view it?</p>
        <button class="btn-primary" style="margin-top:10px;" onclick="requestContactAccess('${postId}', this)">🔔 Request Access</button>`;
    }

    modal.querySelector(".modal-card").innerHTML = `
      ${body}
      <button class="modal-close" style="margin-top:14px;" onclick="this.closest('.modal-overlay').remove()">✕ Close</button>`;
  } catch {
    modal.querySelector(".modal-card").innerHTML = `
      <div class="empty-state">❌ Could not load contact info.</div>
      <button class="post-action-btn" onclick="this.closest('.modal-overlay').remove();showContact('${postId}')">🔄 Retry</button>
      <button class="modal-close" style="margin-top:10px;" onclick="this.closest('.modal-overlay').remove()">✕ Close</button>`;
  }
}

async function requestContactAccess(postId, btnEl) {
  btnEl.disabled = true;
  btnEl.textContent = "Sending...";
  try {
    const res = await fetch(`${API}/posts/${postId}/request-contact`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: currentUser.username })
    });
    const data = await res.json();
    if (res.ok) {
      btnEl.closest(".modal-card").innerHTML = `
        <h3>✅ Request Sent</h3>
        <p style="color:var(--text-muted);margin-top:8px;">${esc(data.message)}</p>
        <button class="modal-close" style="margin-top:10px;" onclick="this.closest('.modal-overlay').remove()">✕ Close</button>`;
    } else {
      alert(data.error || "Could not send request!");
      btnEl.disabled = false;
      btnEl.textContent = "🔔 Request Access";
    }
  } catch {
    alert("Could not reach the server. Please try again.");
    btnEl.disabled = false;
  }
}

// Approve/deny a profile-view request straight from the notifications panel
async function respondToAccessRequest(postId, requester, action, btnEl) {
  btnEl.closest(".access-request-actions").querySelectorAll("button").forEach(b => b.disabled = true);
  try {
    const res = await fetch(`${API}/posts/${postId}/respond-contact`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ owner: currentUser.username, requester, action })
    });
    const data = await res.json();
    btnEl.closest(".access-request-actions").innerHTML =
      `<span style="color:var(--text-muted);font-size:0.8rem;">${action === "approve" ? "✅ Approved" : "🚫 Declined"}</span>`;
  } catch {
    alert("Could not reach the server. Please try again.");
  }
}

// HELPERS
function emoji(topic) {
  const map = { "Sincere Work":"📚","Fun Work":"🎮","Get Together":"🤝","Party":"🎉","Earning":"💰","Help":"🆘","Learn":"🧠","Assignment":"📝","Exam":"📊","Other":"💬" };
  return map[topic] || "💬";
}
function timeAgo(ts) {
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
function formatCountdown(ts) {
  let diff = Math.floor((ts - Date.now()) / 1000); // seconds remaining
  if (diff <= 0) return "Expired";
  const days = Math.floor(diff / 86400); diff -= days * 86400;
  const hrs  = Math.floor(diff / 3600);  diff -= hrs * 3600;
  const mins = Math.floor(diff / 60);    diff -= mins * 60;
  const secs = diff;
  const pad = n => String(n).padStart(2, "0");
  if (days > 0) return `${days}d ${pad(hrs)}:${pad(mins)}:${pad(secs)} left`;
  return `${pad(hrs)}:${pad(mins)}:${pad(secs)} left`;
}

// Live-updating countdown: ticks every second so posts show a running timer
// instead of a value that only changes when the post list re-renders.
function tickCountdowns() {
  document.querySelectorAll(".post-expiry[data-expires]").forEach(el => {
    const ts = parseInt(el.dataset.expires, 10);
    if (!ts) return;
    el.textContent = "⏰ " + formatCountdown(ts);
  });
}
setInterval(tickCountdowns, 1000);
function esc(s) {
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

// Smart auto refresh
setInterval(() => { loadPosts(true); loadCounts(); }, 10000);
setInterval(loadAnnouncements, 20000);

// Init
loadSuggestions();
loadPosts();
loadCounts();
loadMyRole();

// ── ROLE & ADMIN FEATURES ──────────────────────────────────────

let myRole = "user";

async function loadMyRole() {
  try {
    const res = await fetchWithRetry(`${API}/admin/my-role?username=${currentUser.username}`);
    const data = await res.json();
    myRole = data.role;

    // Show admin link in navbar
    if (myRole === "admin" || myRole === "superadmin") {
      const adminLink = document.getElementById("admin-nav-link");
      if (adminLink) adminLink.style.display = "inline-block";
    }

    // Show announcements
    loadAnnouncements();
  } catch {}
}

async function loadAnnouncements() {
  try {
    const res = await fetchWithRetry(`${API}/admin/announcements`);
    const anns = await res.json();
    const section = document.getElementById("announcements-section");
    const feed = document.getElementById("announcements-feed");

    checkAnnouncementPopup(anns);

    if (!anns.length) return;
    section.style.display = "block";
    feed.innerHTML = anns.map(a => `
      <div class="announcement-card">
        <div class="ann-header">
          <span class="ann-badge ${a.role === 'superadmin' ? 'superadmin-badge' : 'admin-badge'}">
            ${a.role === 'superadmin' ? '👑 Super Admin' : '🛡️ Admin'}
          </span>
          <span style="font-weight:700;font-size:1rem;">${esc(a.title)}</span>
          <span class="post-meta">${timeAgo(a.createdAt)}</span>
        </div>
        <div style="color:var(--text);margin-top:8px;">${esc(a.message)}</div>
        <div style="font-size:0.78rem;color:var(--text-muted);margin-top:6px;">Posted by @${esc(a.username)}</div>
      </div>`).join("");
  } catch {}
}

// Simple popup so an Admin/Super-Admin announcement can't be missed (item 4):
// remember the newest announcement id we've already shown, and pop up a
// modal the moment a different (newer) one shows up.
function checkAnnouncementPopup(anns) {
  if (!anns.length) return;
  const latest = anns[0];
  const lastSeen = localStorage.getItem("cc_last_seen_announcement");

  if (lastSeen === null) {
    // First time ever checking on this browser — just set the baseline,
    // don't pop up for announcements that already existed before now.
    localStorage.setItem("cc_last_seen_announcement", latest._id);
    return;
  }
  if (lastSeen !== latest._id) {
    localStorage.setItem("cc_last_seen_announcement", latest._id);
    const modal = document.createElement("div");
    modal.className = "modal-overlay";
    modal.innerHTML = `
      <div class="modal-card" style="text-align:center;">
        <div style="font-size:2.4rem;">📢</div>
        <h3 style="margin-top:8px;">New Announcement</h3>
        <span class="ann-badge ${latest.role === 'superadmin' ? 'superadmin-badge' : 'admin-badge'}" style="margin-top:10px;display:inline-flex;">
          ${latest.role === 'superadmin' ? '👑 Super Admin' : '🛡️ Admin'}
        </span>
        <div style="font-weight:700;font-size:1.05rem;margin-top:10px;">${esc(latest.title)}</div>
        <div style="color:var(--text);margin-top:8px;">${esc(latest.message)}</div>
        <div style="font-size:0.78rem;color:var(--text-muted);margin-top:8px;">Posted by @${esc(latest.username)}</div>
        <button class="btn-primary" style="margin-top:16px;" onclick="this.closest('.modal-overlay').remove()">Got it</button>
      </div>`;
    modal.addEventListener("click", e => { if (e.target === modal) modal.remove(); });
    document.body.appendChild(modal);
  }
}

async function reportPost(postId) {
  const reason = prompt("Why are you reporting this post?", "Inappropriate content");
  if (!reason) return;
  try {
    const res = await fetch(`${API}/admin/report-post/${postId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: currentUser.username, reason })
    });
    const data = await res.json();
    alert(data.message || "Reported!");
  } catch { alert("Error reporting post!"); }
}

// Override loadPosts to add role badges + report button + ban check
const _origLoadPosts = loadPosts;

// ── NOTIFICATIONS ─────────────────────────────────────────────
async function loadNotifCount() {
  try {
    const res = await fetchWithRetry(`${API}/admin/notifications/count?username=${currentUser.username}`);
    const data = await res.json();
    const badge = document.getElementById("notif-count");
    if (badge) {
      badge.textContent = data.count || "";
      badge.style.display = data.count > 0 ? "inline-flex" : "none";
    }
  } catch {}
}

function notifIcon(type) {
  const map = { comment:"💬", warning:"⚠️", ban:"🚫", unban:"✅", role:"🛡️",
    announcement:"📢", access_request:"🔒", access_approved:"✅", access_denied:"🙅" };
  return map[type] || "🔔";
}

async function showNotifications() {
  try {
    const res = await fetchWithRetry(`${API}/admin/notifications?username=${currentUser.username}`);
    const notifs = await res.json();

    // Mark as read
    fetch(`${API}/admin/notifications/read`, {
      method: "POST", headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ username: currentUser.username })
    });

    const modal = document.createElement("div");
    modal.className = "modal-overlay";
    modal.innerHTML = `
      <div class="modal-card" style="max-width:480px;width:95%;max-height:80vh;overflow-y:auto;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
          <h3>🔔 Notifications</h3>
          <button class="btn-logout" onclick="this.closest('.modal-overlay').remove()">✕</button>
        </div>
        ${!notifs.length
          ? `<div class="empty-state">No notifications yet.</div>`
          : notifs.map(n => `
            <div style="padding:12px;border-bottom:1px solid var(--border);display:flex;gap:10px;align-items:flex-start;">
              <div style="font-size:1.2rem;">${notifIcon(n.type)}</div>
              <div style="flex:1;">
                <div style="color:var(--text);font-size:0.88rem;">${esc(n.message)}</div>
                <div style="color:var(--text-muted);font-size:0.75rem;margin-top:3px;">${timeAgo(n.at)}</div>
                ${n.type === "access_request" ? `
                  <div class="access-request-actions" style="margin-top:8px;display:flex;gap:8px;">
                    <button class="admin-action-btn promote-btn" onclick="respondToAccessRequest('${n.post_id}','${esc(n.requester)}','approve',this)">✅ Approve</button>
                    <button class="admin-action-btn ban-btn" onclick="respondToAccessRequest('${n.post_id}','${esc(n.requester)}','deny',this)">🚫 Deny</button>
                  </div>` : ""}
              </div>
            </div>`).join("")}
      </div>`;
    modal.addEventListener("click", e => { if(e.target===modal) modal.remove(); });
    document.body.appendChild(modal);

    const badge = document.getElementById("notif-count");
    if (badge) badge.style.display = "none";
  } catch {}
}

// Poll notifications every 30 seconds
setInterval(loadNotifCount, 30000);
loadNotifCount();
