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

function getReadPosts() { return JSON.parse(localStorage.getItem("cc_read") || "[]"); }
function getInterestedPosts() { return JSON.parse(localStorage.getItem("cc_interested") || "[]"); }

function toggleRead(postId) {
  let read = getReadPosts();
  if (read.includes(postId)) read = read.filter(id => id !== postId);
  else read.push(postId);
  localStorage.setItem("cc_read", JSON.stringify(read));
  loadPosts();
  loadReadSection();
}

function toggleInterested(postId) {
  let interested = getInterestedPosts();
  if (interested.includes(postId)) interested = interested.filter(id => id !== postId);
  else interested.push(postId);
  localStorage.setItem("cc_interested", JSON.stringify(interested));
  loadPosts();
}

// READ SECTION
function toggleReadSection() {
  const sec = document.getElementById("read-section");
  const isHidden = sec.style.display === "none";
  sec.style.display = isHidden ? "block" : "none";
  if (isHidden) loadReadSection();
}

async function loadReadSection() {
  const feed = document.getElementById("read-posts-feed");
  const readIds = getReadPosts();

  if (!readIds.length) {
    feed.innerHTML = `<div class="empty-state">No posts marked as read yet.</div>`;
    return;
  }

  try {
    const res = await fetch(`${API}/posts/all`);
    const posts = await res.json();
    const readPosts = posts.filter(p => readIds.includes(p._id));

    if (!readPosts.length) {
      feed.innerHTML = `<div class="empty-state">Your read posts have expired or been removed.</div>`;
      return;
    }

    feed.innerHTML = readPosts.map(p => `
      <div class="post-card post-read">
        <div class="post-card-header">
          <div class="post-topic-badge">${emoji(p.topic)} ${p.topic}</div>
          <div class="post-meta">${timeAgo(p.createdAt)}</div>
        </div>
        <div class="post-title">${esc(p.title)}</div>
        <div class="post-desc">${esc(p.description)}</div>
        <div class="post-footer">
          <div class="post-author">By <span>@${p.username}</span> · ${p.stream} · ${p.year}</div>
          <div class="post-actions">
            <button class="post-action-btn btn-unread" onclick="toggleRead('${p._id}')">↩ Mark Unread</button>
            <button class="post-contact-btn" onclick="showContact('${p.username}')">📞 Contact</button>
          </div>
        </div>
      </div>`).join("");
  } catch {
    feed.innerHTML = `<div class="empty-state">Could not load read posts.</div>`;
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

  fetch(`${API}/posts/all`).then(r => r.json()).then(posts => {
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
              <button class="post-contact-btn" onclick="showContact('${p.username}')">📞 Contact</button>
            </div>
          </div>
        </div>`).join("");
    }
    modal.style.display = "flex";
  }).catch(() => {
    list.innerHTML = `<div class="empty-state">Could not load posts.</div>`;
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

// TOPIC COUNTS
async function loadCounts() {
  try {
    const res = await fetch(`${API}/posts/counts`);
    const counts = await res.json();
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
    for (const [topic, elId] of Object.entries(map)) {
      const el = document.getElementById(elId);
      if (el) {
        if (counts[topic] && counts[topic] > 0) {
          el.textContent = counts[topic];
          el.style.display = "inline-flex";
        } else {
          el.style.display = "none";
        }
      }
    }
  } catch {}
}

// SUGGESTIONS
async function loadSuggestions() {
  const box = document.getElementById("suggestions-box");
  const staticTips = [
    { topic: "Exam", title: "Form a study group for upcoming exams" },
    { topic: "Assignment", title: "Find assignment help from seniors in your stream" },
    { topic: "Earning", title: "Explore freelance opportunities on campus" },
    { topic: "Get Together", title: "Plan a meetup with students from your building" },
  ];
  try {
    const res = await fetch(`${API}/posts/suggestions?username=${currentUser.username}`);
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

    const res = await fetch(url);
    const posts = await res.json();

    const newIds = posts.map(p => p._id).join(",");
    if (silent && newIds === lastPostIds.join(",")) return;
    lastPostIds = posts.map(p => p._id);

    if (!posts.length) {
      feed.innerHTML = `<div class="empty-state">No posts yet in this category. Be the first to post! 🚀</div>`;
      return;
    }

    const readPosts = getReadPosts();
    const interestedPosts = getInterestedPosts();

    feed.innerHTML = posts.map(p => {
      const isRead = readPosts.includes(p._id);
      const isInterested = interestedPosts.includes(p._id);
      const commentCount = (p.comments || []).length;

      return `
      <div class="post-card ${isRead ? 'post-read' : 'post-unread'} ${isInterested ? 'post-interested' : ''}">
        <div class="post-card-header">
          <div class="post-topic-badge">${emoji(p.topic)} ${p.topic}</div>
          <div style="display:flex;align-items:center;gap:8px;">
            ${p.expires_at ? `<span class="post-expiry">⏰ ${timeLeft(p.expires_at)}</span>` : ''}
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
            <button class="post-contact-btn" onclick="showContact('${p.username}')">📞 Contact</button>
          </div>
        </div>
      </div>`;
    }).join("");

  } catch {
    if (!silent) feed.innerHTML = `<div class="empty-state">❌ Could not load posts.</div>`;
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
    const res = await fetch(`${API}/posts/all`);
    const posts = await res.json();
    const post = posts.find(p => p._id === postId);
    const comments = post ? (post.comments || []) : [];
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
    document.getElementById("comments-list").innerHTML = `<div class="empty-state">Could not load comments.</div>`;
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

// CONTACT
async function showContact(username) {
  try {
    const res = await fetch(`${API}/auth/user/${username}`);
    const u = await res.json();
    const modal = document.createElement("div");
    modal.className = "modal-overlay";
    modal.innerHTML = `
      <div class="modal-card">
        <h3>📞 Contact — @${u.username}</h3>
        <div class="modal-info"><strong>Name:</strong> ${u.fullname}</div>
        <div class="modal-info"><strong>Mobile:</strong> ${u.mobile}</div>
        <div class="modal-info"><strong>Email:</strong> ${u.email}</div>
        <div class="modal-info"><strong>Stream:</strong> ${u.stream} · ${u.year} · ${u.semester}</div>
        <div class="modal-info"><strong>Building:</strong> ${u.building}</div>
        <div class="modal-info"><strong>Location:</strong> ${u.location}</div>
        <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕ Close</button>
      </div>`;
    modal.addEventListener("click", e => { if (e.target === modal) modal.remove(); });
    document.body.appendChild(modal);
  } catch { alert("Could not load contact info!"); }
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
function timeLeft(ts) {
  const mins = Math.floor((ts - Date.now()) / 60000);
  if (mins < 0) return "Expired";
  if (mins < 60) return `${mins}m left`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h left`;
  return `${Math.floor(hrs / 24)}d left`;
}
function esc(s) {
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

// Smart auto refresh
setInterval(() => { loadPosts(true); loadCounts(); }, 10000);

// Init
loadSuggestions();
loadPosts();
loadCounts();
