import os
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv()

MONGO_URI = os.getenv("MONGO_URI")

if not MONGO_URI or "YOUR_USERNAME" in MONGO_URI:
    raise Exception("ERROR: Please set your MONGO_URI in the .env file!")

try:
    client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
    client.admin.command("ping")
    db = client["campusconnect"]
    users_col     = db["users"]
    posts_col     = db["posts"]
    announcements_col = db["announcements"]
    audit_col     = db["audit_logs"]
    warnings_col  = db["warnings"]
    notifs_col    = db["notifications"]
    print("MongoDB Connected Successfully!")
except Exception as e:
    raise Exception(f"MongoDB Connection Failed: {e}")


SUPER_ADMINS = ["s17pratik1"]
