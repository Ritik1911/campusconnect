// ============================
// CampusConnect — dashboard.js
// ============================

const API = "http://127.0.0.1:5000/api";
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

function filterPosts(topic, chipEl) {
  activeFilter = topic;
  document.querySelectorAll(".chip").forEach(c => c.classList.remove("active"));
  chipEl.classList.add("active");
  loadPosts();
  loadSuggestions();
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

    feed.innerHTML = posts.map(p => `
      <div class="post-card">
        <div class="post-card-header">
          <div class="post-topic-badge">${emoji(p.topic)} ${p.topic}</div>
          <div class="post-meta">${timeAgo(p.createdAt)}</div>
        </div>
        <div class="post-title">${esc(p.title)}</div>
        <div class="post-desc">${esc(p.description)}</div>
        <div class="post-footer">
          <div class="post-author">
            By <span>@${p.username}</span> · ${p.stream} · ${p.year} · ${p.building}
          </div>
          <button class="post-contact-btn" onclick="showContact('${p.username}')">📞 Contact</button>
        </div>
      </div>`).join("");

  } catch {
    feed.innerHTML = `<div class="empty-state">❌ Could not load posts. Is the backend running?</div>`;
  }
}

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

// Init
loadSuggestions();
loadPosts();
