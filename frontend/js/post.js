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
  const val = el.dataset.val;
  const customGroup = document.getElementById("custom-expiry-group");
  if (val === "custom") {
    customGroup.style.display = "block";
    document.getElementById("expires-in").value = "custom";
  } else {
    customGroup.style.display = "none";
    document.getElementById("expires-in").value = val;
  }
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
  const customTopic = document.getElementById("custom-topic").value.trim();
  const finalTopic = selectedTopic === "Other" && customTopic ? customTopic : selectedTopic;

  let expiresIn = 0;
  const expiresVal = document.getElementById("expires-in").value;
  if (expiresVal === "custom") {
    const customVal = parseInt(document.getElementById("custom-expiry-val").value);
    const unit = parseInt(document.getElementById("custom-expiry-unit").value);
    if (!customVal || customVal < 1) return showErr("Please enter a valid number for custom expiry!");
    // convert to hours
    expiresIn = Math.round((customVal * unit) / 60);
    if (expiresIn < 1) expiresIn = 1;
  } else {
    expiresIn = parseInt(expiresVal);
  }

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
        expires_in: expiresIn,
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
    showErr("Cannot connect to server!");
  } finally {
    btn.textContent = "🚀 Publish Post";
    btn.disabled = false;
  }
}
