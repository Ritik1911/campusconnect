from flask import Blueprint, request, jsonify
from config import users_col, posts_col, announcements_col, audit_col, warnings_col, notifs_col, SUPER_ADMINS
from bson import ObjectId
import time, datetime

admin_bp = Blueprint("admin", __name__)

# ── ROLE HELPERS ──────────────────────────────────────────────
def get_role(username):
    if username in SUPER_ADMINS:
        return "superadmin"
    user = users_col.find_one({"username": username})
    if user:
        role = user.get("role", "user")
        # If DB says superadmin, add to runtime list
        if role == "superadmin" and username not in SUPER_ADMINS:
            SUPER_ADMINS.append(username)
        return role
    return "user"

def require_admin(username):
    return get_role(username) in ["admin", "superadmin"]

def require_superadmin(username):
    return get_role(username) == "superadmin"

def log_action(actor, action, target="", detail=""):
    """Write to audit log."""
    audit_col.insert_one({
        "actor": actor,
        "action": action,
        "target": target,
        "detail": detail,
        "at": int(time.time() * 1000)
    })

def push_notif(to_user, message, notif_type="info"):
    """Push notification to a user."""
    notifs_col.insert_one({
        "to": to_user,
        "message": message,
        "type": notif_type,
        "read": False,
        "at": int(time.time() * 1000)
    })

# ── MY ROLE ───────────────────────────────────────────────────
@admin_bp.route("/my-role", methods=["GET"])
def my_role():
    username = request.args.get("username", "")
    user = users_col.find_one({"username": username})
    warnings = warnings_col.count_documents({"username": username})
    return jsonify({
        "role": get_role(username),
        "warnings": warnings,
        "banned": user.get("banned", False) if user else False,
        "ban_until": user.get("ban_until") if user else None
    }), 200

# ── PLATFORM STATS ────────────────────────────────────────────
@admin_bp.route("/stats", methods=["GET"])
def get_stats():
    username = request.args.get("username", "")
    if not require_admin(username):
        return jsonify({"error": "Unauthorized"}), 403

    now = int(time.time() * 1000)
    today_start = now - (24 * 3600 * 1000)
    week_start  = now - (7 * 24 * 3600 * 1000)

    total_users   = users_col.count_documents({})
    total_posts   = posts_col.count_documents({})
    total_admins  = users_col.count_documents({"role": "admin"})
    total_banned  = users_col.count_documents({"banned": True})
    reported_posts = posts_col.count_documents({"reports": {"$exists": True, "$ne": []}})
    posts_today   = posts_col.count_documents({"createdAt": {"$gte": today_start}})
    users_today   = users_col.count_documents({"joined_at": {"$gte": today_start}})
    total_warnings = warnings_col.count_documents({})
    total_comments = 0
    for p in posts_col.find({}, {"comments": 1}):
        total_comments += len(p.get("comments", []))

    # Weekly posts per day (last 7 days)
    weekly = []
    for i in range(6, -1, -1):
        day_start = now - ((i+1) * 24 * 3600 * 1000)
        day_end   = now - (i * 24 * 3600 * 1000)
        count = posts_col.count_documents({"createdAt": {"$gte": day_start, "$lt": day_end}})
        label = datetime.datetime.fromtimestamp(day_end/1000).strftime("%a")
        weekly.append({"day": label, "count": count})

    return jsonify({
        "total_users": total_users,
        "total_posts": total_posts,
        "total_admins": total_admins,
        "total_banned": total_banned,
        "reported_posts": reported_posts,
        "posts_today": posts_today,
        "users_today": users_today,
        "total_warnings": total_warnings,
        "total_comments": total_comments,
        "weekly": weekly,
    }), 200

# ── ALL USERS ─────────────────────────────────────────────────
@admin_bp.route("/users", methods=["GET"])
def get_all_users():
    username = request.args.get("username", "")
    if not require_admin(username):
        return jsonify({"error": "Unauthorized"}), 403
    users = list(users_col.find({}, {"password": 0, "_id": 0}))
    # Attach warning count
    for u in users:
        u["warning_count"] = warnings_col.count_documents({"username": u["username"]})
    return jsonify(users), 200

# ── PROMOTE / DEMOTE ──────────────────────────────────────────
@admin_bp.route("/promote", methods=["POST", "OPTIONS"])
def promote_user():
    if request.method == "OPTIONS": return jsonify({}), 200
    data = request.get_json()
    requester = data.get("requester", "")
    target    = data.get("target", "")
    role      = data.get("role", "admin")

    if not require_superadmin(requester):
        return jsonify({"error": "Only Super-Admin can promote/demote!"}), 403
    if target in SUPER_ADMINS:
        return jsonify({"error": "Cannot change Super-Admin role!"}), 400

    users_col.update_one({"username": target}, {"$set": {"role": role}})
    action_str = "promoted to Admin" if role == "admin" else "demoted to User"
    log_action(requester, f"ROLE_CHANGE", target, action_str)
    push_notif(target, f"You have been {action_str} by Super-Admin.", "role")
    return jsonify({"message": f"@{target} has been {action_str}!"}), 200

# ── ADD / REMOVE SUPER-ADMIN ─────────────────────────────────
@admin_bp.route("/set-superadmin", methods=["POST", "OPTIONS"])
def set_superadmin():
    if request.method == "OPTIONS": return jsonify({}), 200
    data = request.get_json()
    requester = data.get("requester", "")
    target    = data.get("target", "")
    action    = data.get("action", "add")  # "add" or "remove"

    if not require_superadmin(requester):
        return jsonify({"error": "Only Super-Admin can manage Super-Admins!"}), 403

    if action == "add":
        if target not in SUPER_ADMINS:
            SUPER_ADMINS.append(target)
        # Also set role in DB for persistence
        users_col.update_one({"username": target}, {"$set": {"role": "superadmin"}})
        log_action(requester, "SUPERADMIN_ADD", target, "Added as Super-Admin")
        push_notif(target, "🎉 You have been granted Super-Admin access!", "role")
        return jsonify({"message": f"@{target} is now a Super-Admin!"}), 200
    else:
        if target in SUPER_ADMINS and target != requester:
            SUPER_ADMINS.remove(target)
        users_col.update_one({"username": target}, {"$set": {"role": "user"}})
        log_action(requester, "SUPERADMIN_REMOVE", target, "Removed from Super-Admin")
        push_notif(target, "Your Super-Admin access has been removed.", "role")
        return jsonify({"message": f"@{target} Super-Admin access removed!"}), 200


# ── BAN / UNBAN ───────────────────────────────────────────────
@admin_bp.route("/ban", methods=["POST", "OPTIONS"])
def ban_user():
    if request.method == "OPTIONS": return jsonify({}), 200
    data = request.get_json()
    requester  = data.get("requester", "")
    target     = data.get("target", "")
    action     = data.get("action", "ban")
    duration_h = data.get("duration_hours", 0)  # 0 = permanent

    if not require_admin(requester):
        return jsonify({"error": "Unauthorized"}), 403
    if target in SUPER_ADMINS:
        return jsonify({"error": "Cannot ban Super-Admin!"}), 400
    target_role = get_role(target)
    if target_role == "admin" and not require_superadmin(requester):
        return jsonify({"error": "Only Super-Admin can ban Admins!"}), 403

    if action == "ban":
        ban_until = None
        if duration_h and int(duration_h) > 0:
            ban_until = int(time.time() * 1000) + int(duration_h) * 3600 * 1000
        users_col.update_one({"username": target}, {"$set": {"banned": True, "ban_until": ban_until}})
        dur_str = f"for {duration_h}h" if duration_h else "permanently"
        log_action(requester, "BAN", target, dur_str)
        push_notif(target, f"Your account has been banned {dur_str} by an Admin.", "ban")
        return jsonify({"message": f"@{target} banned {dur_str}!"}), 200
    else:
        users_col.update_one({"username": target}, {"$set": {"banned": False, "ban_until": None}})
        log_action(requester, "UNBAN", target, "")
        push_notif(target, "Your account ban has been lifted. Welcome back!", "unban")
        return jsonify({"message": f"@{target} has been unbanned!"}), 200

# ── WARN USER ─────────────────────────────────────────────────
@admin_bp.route("/warn", methods=["POST", "OPTIONS"])
def warn_user():
    if request.method == "OPTIONS": return jsonify({}), 200
    data = request.get_json()
    requester = data.get("requester", "")
    target    = data.get("target", "")
    reason    = data.get("reason", "Violation of community guidelines")

    if not require_admin(requester):
        return jsonify({"error": "Unauthorized"}), 403
    if target in SUPER_ADMINS:
        return jsonify({"error": "Cannot warn Super-Admin!"}), 400

    warnings_col.insert_one({
        "username": target,
        "reason": reason,
        "issued_by": requester,
        "at": int(time.time() * 1000)
    })
    log_action(requester, "WARN", target, reason)
    push_notif(target, f"⚠️ You received a warning: {reason}", "warning")
    return jsonify({"message": f"Warning issued to @{target}!"}), 200

# ── DELETE POST ───────────────────────────────────────────────
@admin_bp.route("/delete-post/<post_id>", methods=["DELETE", "OPTIONS"])
def delete_post(post_id):
    if request.method == "OPTIONS": return jsonify({}), 200
    username = request.args.get("username", "")
    if not require_admin(username):
        return jsonify({"error": "Unauthorized"}), 403
    post = posts_col.find_one({"_id": ObjectId(post_id)})
    if post:
        log_action(username, "DELETE_POST", post.get("username",""), post.get("title",""))
        push_notif(post.get("username",""), f"Your post '{post.get('title','')}' was removed by an Admin.", "warning")
    posts_col.delete_one({"_id": ObjectId(post_id)})
    return jsonify({"message": "Post deleted!"}), 200

# ── REPORT POST ───────────────────────────────────────────────
@admin_bp.route("/report-post/<post_id>", methods=["POST", "OPTIONS"])
def report_post(post_id):
    if request.method == "OPTIONS": return jsonify({}), 200
    data = request.get_json()
    reporter = data.get("username", "")
    reason   = data.get("reason", "Inappropriate content")
    if not reporter:
        return jsonify({"error": "Username required"}), 400
    report = {"username": reporter, "reason": reason, "at": int(time.time() * 1000)}
    posts_col.update_one({"_id": ObjectId(post_id)}, {"$push": {"reports": report}})
    log_action(reporter, "REPORT_POST", post_id, reason)
    return jsonify({"message": "Post reported! Admins will review it."}), 200

# ── REPORTED POSTS ────────────────────────────────────────────
@admin_bp.route("/reported-posts", methods=["GET"])
def get_reported_posts():
    username = request.args.get("username", "")
    if not require_admin(username):
        return jsonify({"error": "Unauthorized"}), 403
    posts = list(posts_col.find({"reports": {"$exists": True, "$ne": []}}).sort("createdAt", -1))
    for p in posts:
        p["_id"] = str(p["_id"])
    return jsonify(posts), 200

# ── ANNOUNCEMENT ──────────────────────────────────────────────
@admin_bp.route("/announce", methods=["POST", "OPTIONS"])
def announce():
    if request.method == "OPTIONS": return jsonify({}), 200
    data = request.get_json()
    username = data.get("username", "")
    message  = data.get("message", "").strip()
    title    = data.get("title", "").strip()
    if not require_admin(username):
        return jsonify({"error": "Unauthorized"}), 403
    if not message or not title:
        return jsonify({"error": "Title and message required!"}), 400
    ann = {
        "username": username,
        "title": title,
        "message": message,
        "createdAt": int(time.time() * 1000),
        "role": get_role(username)
    }
    result = announcements_col.insert_one(ann)
    ann["_id"] = str(result.inserted_id)
    log_action(username, "ANNOUNCEMENT", "", title)
    return jsonify({"message": "Announcement posted!", "announcement": ann}), 201

@admin_bp.route("/announcements", methods=["GET"])
def get_announcements():
    anns = list(announcements_col.find({}).sort("createdAt", -1).limit(10))
    for a in anns:
        a["_id"] = str(a["_id"])
    return jsonify(anns), 200

# ── AUDIT LOGS ────────────────────────────────────────────────
@admin_bp.route("/audit-logs", methods=["GET"])
def get_audit_logs():
    username = request.args.get("username", "")
    if not require_admin(username):
        return jsonify({"error": "Unauthorized"}), 403
    logs = list(audit_col.find({}).sort("at", -1).limit(100))
    for l in logs:
        l["_id"] = str(l["_id"])
    return jsonify(logs), 200

# ── NOTIFICATIONS ─────────────────────────────────────────────
@admin_bp.route("/notifications", methods=["GET"])
def get_notifications():
    username = request.args.get("username", "")
    notifs = list(notifs_col.find({"to": username}).sort("at", -1).limit(20))
    for n in notifs:
        n["_id"] = str(n["_id"])
    return jsonify(notifs), 200

@admin_bp.route("/notifications/read", methods=["POST", "OPTIONS"])
def mark_notifs_read():
    if request.method == "OPTIONS": return jsonify({}), 200
    data = request.get_json()
    username = data.get("username", "")
    notifs_col.update_many({"to": username, "read": False}, {"$set": {"read": True}})
    return jsonify({"message": "Marked as read"}), 200

@admin_bp.route("/notifications/count", methods=["GET"])
def notif_count():
    username = request.args.get("username", "")
    count = notifs_col.count_documents({"to": username, "read": False})
    return jsonify({"count": count}), 200

# ── COMMENT NOTIFY (called from posts route) ──────────────────
@admin_bp.route("/notify-comment", methods=["POST", "OPTIONS"])
def notify_comment():
    if request.method == "OPTIONS": return jsonify({}), 200
    data = request.get_json()
    post_owner = data.get("post_owner", "")
    commenter  = data.get("commenter", "")
    post_title = data.get("post_title", "")
    if post_owner and post_owner != commenter:
        push_notif(post_owner, f"@{commenter} commented on your post: '{post_title}'", "comment")
    return jsonify({"ok": True}), 200

# ── WARNINGS LIST ─────────────────────────────────────────────
@admin_bp.route("/warnings/<username>", methods=["GET"])
def get_warnings(username):
    requester = request.args.get("requester", "")
    if requester != username and not require_admin(requester):
        return jsonify({"error": "Unauthorized"}), 403
    warns = list(warnings_col.find({"username": username}).sort("at", -1))
    for w in warns:
        w["_id"] = str(w["_id"])
    return jsonify(warns), 200

# ── DB BACKUP (export collections as JSON) ───────────────────
@admin_bp.route("/backup", methods=["GET"])
def backup():
    username = request.args.get("username", "")
    if not require_superadmin(username):
        return jsonify({"error": "Only Super-Admin can backup!"}), 403

    users  = list(users_col.find({}, {"password": 0, "_id": 0, "plain_password": 0}))
    posts  = list(posts_col.find({}, {"_id": 0}))
    for p in posts:
        if "_id" in p: p["_id"] = str(p["_id"])

    log_action(username, "BACKUP", "", "Full backup downloaded")
    return jsonify({
        "backup_at": int(time.time() * 1000),
        "users_count": len(users),
        "posts_count": len(posts),
        "users": users,
        "posts": posts,
    }), 200
