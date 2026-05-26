// ============================
// CampusConnect — auth.js
// ============================

const API = "https://campusconnect-f6s5.onrender.com/api";

function showTab(tab) {
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
  document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
  document.getElementById(tab + "-tab").classList.add("active");
  document.querySelectorAll(".tab-btn").forEach(b => {
    if (b.textContent.toLowerCase().includes(tab)) b.classList.add("active");
  });
}

function showError(id, msg) {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 5000);
}

function showSuccess(id, msg) {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.classList.add("show");
}

// REGISTER
async function registerUser() {
  const btn = document.getElementById("reg-btn");
  const data = {
    username: document.getElementById("reg-username").value.trim(),
    fullname: document.getElementById("reg-fullname").value.trim(),
    mobile:   document.getElementById("reg-mobile").value.trim(),
    email:    document.getElementById("reg-email").value.trim(),
    stream:   document.getElementById("reg-stream").value,
    year:     document.getElementById("reg-year").value,
    semester: document.getElementById("reg-semester").value,
    building: document.getElementById("reg-building").value.trim(),
    location: document.getElementById("reg-location").value.trim(),
    password: document.getElementById("reg-password").value,
  };

  for (const [key, val] of Object.entries(data)) {
    if (!val) return showError("reg-error", `Please fill in all fields! (${key} is empty)`);
  }
  if (!/^\d{10}$/.test(data.mobile)) return showError("reg-error", "Mobile number must be exactly 10 digits!");
  if (data.password.length < 6) return showError("reg-error", "Password must be at least 6 characters!");

  btn.textContent = "Creating account...";
  btn.disabled = true;

  try {
    const res = await fetch(`${API}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const result = await res.json();

    if (!res.ok) {
      showError("reg-error", result.error || "Registration failed!");
      return;
    }

    localStorage.setItem("cc_user", JSON.stringify(result.user));
    window.location.href = "dashboard.html";

  } catch (err) {
    showError("reg-error", "Cannot connect to server!");
  } finally {
    btn.textContent = "Create Account →";
    btn.disabled = false;
  }
}

// LOGIN
async function loginUser() {
  const btn = document.getElementById("login-btn");
  const username = document.getElementById("login-username").value.trim();
  const password = document.getElementById("login-password").value;

  if (!username || !password) return showError("login-error", "Please enter username and password!");

  btn.textContent = "Logging in...";
  btn.disabled = true;

  try {
    const res = await fetch(`${API}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const result = await res.json();

    if (!res.ok) {
      showError("login-error", result.error || "Login failed!");
      return;
    }

    localStorage.setItem("cc_user", JSON.stringify(result.user));
    window.location.href = "dashboard.html";

  } catch (err) {
    showError("login-error", "Cannot connect to server!");
  } finally {
    btn.textContent = "Login →";
    btn.disabled = false;
  }
}

// FORGOT PASSWORD
async function recoverPassword() {
  const btn = document.getElementById("forgot-btn");
  const username = document.getElementById("forgot-username").value.trim();
  const mobile = document.getElementById("forgot-mobile").value.trim();

  if (!username || !mobile) return showError("forgot-error", "Please enter username and mobile number!");

  btn.textContent = "Recovering...";
  btn.disabled = true;

  try {
    const res = await fetch(`${API}/auth/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, mobile }),
    });
    const result = await res.json();

    if (!res.ok) {
      showError("forgot-error", result.error || "Recovery failed!");
      return;
    }

    showSuccess("forgot-success", "✅ " + result.message);

  } catch (err) {
    showError("forgot-error", "Cannot connect to server!");
  } finally {
    btn.textContent = "Recover Password →";
    btn.disabled = false;
  }
}

function logout() {
  localStorage.removeItem("cc_user");
  window.location.href = "index.html";
}

// Enter key support
document.addEventListener("keydown", e => {
  if (e.key !== "Enter") return;
  const active = document.querySelector(".tab-content.active");
  if (active?.id === "login-tab") loginUser();
  else if (active?.id === "register-tab") registerUser();
  else if (active?.id === "forgot-tab") recoverPassword();
});
