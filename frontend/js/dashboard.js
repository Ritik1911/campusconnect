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

// Read/Unread & Interested stored in localStorage
function getReadPosts() { return JSON.parse(localStorage.getItem("cc_read") || "[]"); }
function getInterestedPosts() { return JSON.parse(localStorage.getItem("cc_interested") || "[]"); }

function markRead(postId) {
  const read = getReadPosts();
  if (!read.includes(postId)) { read.push(postId); localStorage.setItem("cc_read", JSON.stringify(read)); }
}
function toggleRead(postId) {
  let read = getReadPosts();
  if (read.includes(postId)) { read = read.filter(id => id !== postId); }
  else { read.push(postId); }
  localStorage.setItem("cc_read", JSON.stringify(read));
  loadPosts();
}
function toggleInterested(postId) {
  let interested = getInterestedPosts();
  if (interested.includes(postId)) { interested = interested.filter(id => id !== postId); }
  else { interested.push(postId); }
  localStorage.setItem("cc_interested", JSON.stringify(interested));
  loadPosts();
}

function showInterestedPosts() {
  const interested = getInterestedPosts();
  const modal = document.getElementById("interested-modal");
  const list = document.getElementById("interested-list");

  if (!interested.length) {
    list.innerHTML = `<div class="empty-state" style="padding:20px;">No interested posts yet. Mark posts with ⭐ to save them here!</div>`;
  } else {
    list.innerHTML = `<div class="empty-state" style="padding:10px;">You have ${interested.length} saved post(s). They are highlighted in the feed with ⭐.</div>`;
  }
  modal.style.display = "flex";
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
      if (el && counts[topic]) {
        el.textContent = counts[topic];
        el.style.display = "inline-flex";
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
async function loadPosts() {
  const feed = document.getElementById("posts-feed");
  feed.innerHTML = `<div class="empty-state">Loading posts...</div>`;

  try {
    const url = activeFilter === "all"
      ? `${API}/posts/all`
      : `${API}/posts/all?topic=${encodeURIComponent(activeFilter)}`;

    const res = await fetch(url);
    const posts = await res.json();

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
            ${p.expires_at ? `<span class="post-expiry">⏰ Expires ${timeAgo(p.expires_at)}</span>` : ''}
            <div class="post-meta">${timeAgo(p.createdAt)}</div>
          </div>
        </div>
        <div class="post-title">${esc(p.title)}</div>
        <div class="post-desc">${esc(p.description)}</div>
        <div class="post-footer">
          <div class="post-author">
            By <span>@${p.username}</span> · ${p.stream} · ${p.year} · ${p.building}
          </div>
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
    feed.innerHTML = `<div class="empty-state">❌ Could not load posts. Is the backend running?</div>`;
  }
}

// COMMENTS
function openCommentModal(postId) {
  currentCommentPostId = postId;
  document.getElementById("comment-input").value = "";
  document.getElementById("comments-list").innerHTML = `<div class="empty-state">Loading comments...</div>`;
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
  if (!text) return;
  if (!currentCommentPostId) return;

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
    }
  } catch {}
}

// CONTACT MODAL
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
  } catch {
    alert("Could not load contact info!");
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

function esc(s) {
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

// AUTO REFRESH — every 15 seconds
setInterval(() => { loadPosts(); loadCounts(); }, 15000);

// Init
loadSuggestions();
loadPosts();
loadCounts();
