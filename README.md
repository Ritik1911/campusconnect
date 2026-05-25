# CampusConnect — Setup Guide

## Project Structure
```
campusconnect_final/
├── backend/
│   ├── app.py              ← Main Flask server
│   ├── config.py           ← MongoDB connection
│   ├── requirements.txt    ← Python packages
│   ├── .env                ← Your credentials (edit this!)
│   └── routes/
│       ├── auth.py         ← Login/Register APIs
│       └── posts.py        ← Posts APIs
└── frontend/
    ├── index.html          ← Login / Register
    ├── dashboard.html      ← Main feed
    ├── post.html           ← Create post
    ├── css/style.css
    └── js/
        ├── auth.js
        ├── dashboard.js
        └── post.js
```

---

## Step 1 — Edit the .env file

Open `backend/.env` and fill in your details:

```
MONGO_URI=mongodb+srv://YOUR_USERNAME:YOUR_PASSWORD@freecluster.gtcjmcw.mongodb.net/campusconnect
SECRET_KEY=campusconnect_secret_2024
```

Replace YOUR_USERNAME and YOUR_PASSWORD with your MongoDB Atlas credentials.

**Important:** If your password has special characters like @, #, !, encode them:
- @ → %40
- # → %23
- ! → %21

---

## Step 2 — Install Python packages

Open terminal in the `backend/` folder and run:

```
pip install -r requirements.txt
```

---

## Step 3 — Start the backend

```
python app.py
```

You should see:
```
MongoDB Connected Successfully!
Server starting at http://127.0.0.1:5000
```

---

## Step 4 — Open the frontend

1. Install the "Live Server" extension in VS Code
2. Open the `frontend/` folder in VS Code
3. Right-click `index.html` → Open with Live Server
4. Browser opens at http://127.0.0.1:5500

---

## Step 5 — Test it

1. Click Register → Fill all fields → Create account
2. You will be redirected to Dashboard
3. Click Post → Choose topic → Create your first post
4. See it appear on Dashboard!

---

## Troubleshooting

**"Cannot connect to server"**
→ Make sure `python app.py` is running in terminal

**"MongoDB Authentication Failed"**
→ Wrong password in .env file. Reset your MongoDB Atlas password and update .env

**"Username already taken"**
→ Try a different username

---

## APIs Available

| Method | URL | What it does |
|--------|-----|-------------|
| POST | /api/auth/register | Create account |
| POST | /api/auth/login | Login |
| GET | /api/auth/user/:username | Get user info |
| POST | /api/posts/create | Create post |
| GET | /api/posts/all | Get all posts |
| GET | /api/posts/all?topic=Exam | Filter by topic |
| GET | /api/posts/suggestions | Get suggestions |
