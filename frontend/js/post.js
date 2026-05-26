// ============================
// CampusConnect — post.js
// ============================

const API = "https://campusconnect-f6s5.onrender.com/api";
const currentUser = JSON.parse(localStorage.getItem("cc_user"));
if (!currentUser) window.location.href = "index.html";

document.getElementById("nav-username").textContent = "👤 " + currentUser.username;

function logout() {
  localStorage.removeItem("cc_user");
  window.location.href = "index.html";
}

let selectedTopic = "";

function selectTopic(el) {
  document.querySelectorAll(".topic-tile").forEach(t => t.classList.remove("selected"));
  el.classList.add("selected");
  selectedTopic = el.dataset.topic;
  document.getElementById("custom-topic-group").style.display =
    selectedTopic === "Other" ? "block" : "none";
}

function selectContact(el) {
  document.querySelectorAll(".contact-option").forEach(c => c.classList.remove("selected"));
  el.classList.add("selected");
  document.getElementById("contact-pref").value = el.dataset.val;
}

function selectExpiry(el) {
  document.querySelectorAll(".expiry-option").forEach(e => e.classList.remove("selected"));
  el.classList.add("selected");
  document.getElementById("expires-in").value = el.dataset.val;
}

document.getElementById("post-title").addEventListener("input", function () {
  document.getElementById("title-count").textContent = this.value.length + "/100";
});
document.getElementById("post-desc").addEventListener("input", function () {
  document.getElementById("desc-count").textContent = this.value.length + "/500";
});

function showErr(msg) {
  const el = document.getElementById("post-error");
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 4000);
}

async function submitPost() {
  const btn = document.getElementById("post-btn");
  const title = document.getElementById("post-title").value.trim();
  const desc = document.getElementById("post-desc").value.trim();
  const contact = document.getElementById("contact-pref").value;
  const expiresIn = document.getElementById("expires-in").value;
  const customTopic = document.getElementById("custom-topic").value.trim();

  const finalTopic = selectedTopic === "Other" && customTopic ? customTopic : selectedTopic;

  if (!finalTopic) return showErr("Please select a topic!");
  if (!title) return showErr("Please write a post title!");
  if (!desc) return showErr("Please write a description!");

  btn.textContent = "Publishing...";
  btn.disabled = true;

  try {
    const res = await fetch(`${API}/posts/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: currentUser.username,
        topic: finalTopic,
        title,
        description: desc,
        contact,
        expires_in: parseInt(expiresIn),
      }),
    });
    const result = await res.json();

    if (!res.ok) {
      showErr(result.error || "Failed to create post!");
      return;
    }

    const successEl = document.getElementById("post-success");
    successEl.textContent = "✅ Post published! Redirecting to dashboard...";
    successEl.classList.add("show");

    setTimeout(() => window.location.href = "dashboard.html", 1500);

  } catch {
    showErr("Cannot connect to server! Is the backend running?");
  } finally {
    btn.textContent = "🚀 Publish Post";
    btn.disabled = false;
  }
}
