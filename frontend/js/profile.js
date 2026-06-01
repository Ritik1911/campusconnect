// ============================
// CampusConnect — profile.js
// ============================

const API = "https://campusconnect-f6s5.onrender.com/api";
const currentUser = JSON.parse(localStorage.getItem("cc_user"));
if (!currentUser) window.location.href = "index.html";

document.getElementById("nav-username").textContent = "👤 " + currentUser.username;

function logout() {
  localStorage.removeItem("cc_user");
  window.location.href = "index.html";
}

function getReadPosts() { return JSON.parse(localStorage.getItem("cc_read") || "[]"); }
function getInterestedPosts() { return JSON.parse(localStorage.getItem("cc_interested") || "[]"); }

function esc(s) {
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}
function timeAgo(ts) {
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
function emoji(topic) {
  const map = { "Sincere Work":"📚","Fun Work":"🎮","Get Together":"🤝","Party":"🎉","Earning":"💰","Help":"🆘","Learn":"🧠","Assignment":"📝","Exam":"📊","Other":"💬" };
  return map[topic] || "💬";
}

// Fill profile details
function fillProfile() {
  const u = currentUser;
  const initials = u.fullname.split(" ").map(n => n[0]).join("").toUpperCase().slice(0,2);
  document.getElementById("profile-avatar").textContent = initials;
  document.getElementById("profile-name").textContent = u.fullname;
  document.getElementById("profile-username-tag").textContent = "@" + u.username;
  document.getElementById("nav-username").textContent = "👤 " + u.username;

  document.getElementById("badge-stream").textContent = u.stream;
  document.getElementById("badge-year").textContent = u.year;
  document.getElementById("badge-sem").textContent = u.semester;

  document.getElementById("d-fullname").textContent = u.fullname;
  document.getElementById("d-username").textContent = "@" + u.username;
  document.getElementById("d-mobile").textContent = u.mobile;
  document.getElementById("d-email").textContent = u.email;
  document.getElementById("d-stream").textContent = u.stream;
  document.getElementById("d-year").textContent = u.year;
  document.getElementById("d-semester").textContent = u.semester;
  document.getElementById("d-building").textContent = u.building;
  document.getElementById("d-location").textContent = u.location;

  const readCount = getReadPosts().length;
  const savedCount = getInterestedPosts().length;
  document.getElementById("stat-read").textContent = readCount;
  document.getElementById("stat-saved").textContent = savedCount;
  document.getElementById("a-read").textContent = readCount + " posts";
  document.getElementById("a-saved").textContent = savedCount + " posts";
  document.getElementById("a-since").textContent = "CampusConnect Member";
}

function renderPostCard(p, extra = "") {
  return `
  <div class="post-card">
    <div class="post-card-header">
      <div class="post-topic-badge">${emoji(p.topic)} ${p.topic}</div>
      <div class="post-meta">${timeAgo(p.createdAt)}</div>
    </div>
    <div class="post-title">${esc(p.title)}</div>
    <div class="post-desc">${esc(p.description)}</div>
    <div class="post-footer">
      <div class="post-author">By <span>@${p.username}</span> · ${p.stream} · ${p.year}</div>
      ${extra}
    </div>
  </div>`;
}

async function loadMyPosts() {
  const feed = document.getElementById("my-posts-feed");
  try {
    const res = await fetch(`${API}/posts/all`);
    const posts = await res.json();
    const myPosts = posts.filter(p => p.username === currentUser.username);

    document.getElementById("stat-posts").textContent = myPosts.length;
    document.getElementById("a-posts").textContent = myPosts.length + " posts";

    if (!myPosts.length) {
      feed.innerHTML = `<div class="empty-state">You haven't posted anything yet. <a href="post.html" style="color:var(--primary-light);">Create your first post!</a></div>`;
      return;
    }
    feed.innerHTML = myPosts.map(p => renderPostCard(p)).join("");
  } catch {
    feed.innerHTML = `<div class="empty-state">Could not load your posts.</div>`;
  }
}

async function loadReadPosts() {
  const feed = document.getElementById("read-posts-feed");
  const readIds = getReadPosts();

  if (!readIds.length) {
    feed.innerHTML = `<div class="empty-state">No posts marked as read yet. Go to <a href="dashboard.html" style="color:var(--primary-light);">Dashboard</a> and mark posts as read!</div>`;
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

    feed.innerHTML = readPosts.map(p => renderPostCard(p, `
      <button class="post-action-btn btn-read" onclick="markUnread('${p._id}')">✅ Mark Unread</button>
    `)).join("");
  } catch {
    feed.innerHTML = `<div class="empty-state">Could not load read posts.</div>`;
  }
}

function markUnread(postId) {
  let read = getReadPosts().filter(id => id !== postId);
  localStorage.setItem("cc_read", JSON.stringify(read));
  loadReadPosts();
  document.getElementById("stat-read").textContent = read.length;
}

// Init
fillProfile();
loadMyPosts();
loadReadPosts();
