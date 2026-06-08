from flask import Blueprint, request, jsonify
from config import users_col, posts_col, announcements_col, audit_col, warnings_col, notifs_col, SUPER_ADMINS
from bson import ObjectId
import time, datetime

admin_bp = Blueprint("admin", __name__)

# ══════════════════════════════════════════════════════════════
#  PERMISSION DEFINITIONS
# ══════════════════════════════════════════════════════════════
ALL_PERMISSIONS = [
    "manage_posts",       # View/delete any post
    "manage_users",       # View user list
    "ban_users",          # Ban/unban users
    "warn_users",         # Issue warnings
    "view_reports",       # See reported posts
    "delete_reports",     # Delete reported posts
    "post_announcements", # Post platform announcements
    "view_stats",         # See platform statistics
    "create_admin",       # Create child admins/partners
    "view_audit",         # View audit log
]

PERMISSION_LABELS = {
    "manage_posts":       "📝 Manage Posts",
    "manage_users":       "👥 View Users",
    "ban_users":          "🚫 Ban/Unban Users",
    "warn_users":         "⚠️ Warn Users",
    "view_reports":       "🔎 View Reports",
    "delete_reports":     "🗑️ Delete Reported Posts",
    "post_announcements": "📢 Post Announcements",
    "view_stats":         "📊 View Statistics",
    "create_admin":       "👑 Create Sub-Admins",
    "view_audit":         "📋 View Audit Log",
}

# ══════════════════════════════════════════════════════════════
#  HELPERS
# ══════════════════════════════════════════════════════════════
def is_superadmin(username):
    return username in SUPER_ADMINS

def get_user(username):
    return users_col.find_one({"username": username})

def get_permissions(username):
    """Return list of permissions for a user."""
    if is_superadmin(username):
        return ALL_PERMISSIONS[:]
    user = get_user(username)
    if not user:
        return []
    return user.get("permissions", [])

def has_permission(username, perm):
    return perm in get_permissions(username)

def get_role(username):
    if is_superadmin(username):
        return "superadmin"
    user = get_user(username)
    if not user:
        return "user"
    return user.get("role", "user")

def log_action(actor, action, target="", detail=""):
    audit_col.insert_one({
        "actor": actor, "action": action,
        "target": target, "detail": detail,
        "at": int(time.time() * 1000)
    })

def push_notif(to_user, message, notif_type="info"):
    notifs_col.insert_one({
        "to": to_user, "message": message,
        "type": notif_type, "read": False,
        "at": int(time.time() * 1000)
    })

def get_parent(username):
    """Get who created this admin."""
    user = get_user(username)
    return user.get("created_by") if user else None

def propagate_permission_removal(username, removed_perms):
    """When a permission is removed from username, remove it from all children too."""
    # Find all admins created by username
    children = list(users_col.find({"created_by": username}))
    for child in children:
        child_perms = child.get("permissions", [])
        new_perms = [p for p in child_perms if p not in removed_perms]
        if new_perms != child_perms:
            users_col.update_one(
                {"username": child["username"]},
                {"$set": {"permissions": new_perms}}
            )
            push_notif(child["username"], "Some of your admin permissions have been updated.", "role")
            # Recursively propagate down
            propagate_permission_removal(child["username"], removed_perms)

# ══════════════════════════════════════════════════════════════
#  MY ROLE & PERMISSIONS
# ══════════════════════════════════════════════════════════════
@admin_bp.route("/my-role", methods=["GET"])
def my_role():
    username = request.args.get("username", "")
    user = get_user(username)
    perms = get_permissions(username)
    role = get_role(username)
    return jsonify({
        "role": role,
        "permissions": perms,
        "is_admin": role in ["admin", "superadmin"],
        "warnings": warnings_col.count_documents({"username": username}),
        "banned": user.get("banned", False) if user else False,
    }), 200

# ══════════════════════════════════════════════════════════════
#  CREATE CHILD ADMIN
# ══════════════════════════════════════════════════════════════
@admin_bp.route("/create-admin", methods=["POST", "OPTIONS"])
def create_admin():
    if request.method == "OPTIONS": return jsonify({}), 200
    data = request.get_json()
    creator   = data.get("creator", "")
    target    = data.get("target", "")   # existing username
    permissions = data.get("permissions", [])

    # Creator must have create_admin permission
    if not has_permission(creator, "create_admin"):
        return jsonify({"error": "You don't have permission to create admins!"}), 403

    # Target must exist
    target_user = get_user(target)
    if not target_user:
        return jsonify({"error": f"User @{target} not found!"}), 404

    # Cannot grant permissions creator doesn't have
    creator_perms = get_permissions(creator)
    invalid = [p for p in permissions if p not in creator_perms]
    if invalid:
        return jsonify({"error": f"You cannot grant permissions you don't have: {', '.join(invalid)}"}), 403

    # Cannot make another superadmin
    if is_superadmin(target):
        return jsonify({"error": "Cannot modify Super-Admin!"}), 400

    users_col.update_one({"username": target}, {"$set": {
        "role": "admin",
        "permissions": permissions,
        "created_by": creator,
    }})
    log_action(creator, "CREATE_ADMIN", target, f"Permissions: {', '.join(permissions)}")
    push_notif(target, f"You have been granted Admin access by @{creator}!", "role")
    return jsonify({"message": f"@{target} is now an Admin with {len(permissions)} permission(s)!"}), 200

# ══════════════════════════════════════════════════════════════
#  UPDATE PERMISSIONS
# ══════════════════════════════════════════════════════════════
@admin_bp.route("/update-permissions", methods=["POST", "OPTIONS"])
def update_permissions():
    if request.method == "OPTIONS": return jsonify({}), 200
    data = request.get_json()
    updater     = data.get("updater", "")
    target      = data.get("target", "")
    new_perms   = data.get("permissions", [])

    if is_superadmin(target):
        return jsonify({"error": "Cannot modify Super-Admin!"}), 400

    target_user = get_user(target)
    if not target_user:
        return jsonify({"error": "User not found!"}), 404

    # Only superadmin OR the direct parent can update
    target_parent = target_user.get("created_by", "")
    if not is_superadmin(updater) and updater != target_parent:
        return jsonify({"error": "You can only update permissions of admins you created!"}), 403

    # Cannot grant what updater doesn't have
    updater_perms = get_permissions(updater)
    invalid = [p for p in new_perms if p not in updater_perms]
    if invalid:
        return jsonify({"error": f"You cannot grant: {', '.join(invalid)}"}), 403

    old_perms = target_user.get("permissions", [])
    removed   = [p for p in old_perms if p not in new_perms]

    users_col.update_one({"username": target}, {"$set": {"permissions": new_perms}})

    # Propagate removals down the tree
    if removed:
        propagate_permission_removal(target, removed)

    log_action(updater, "UPDATE_PERMISSIONS", target, f"New: {', '.join(new_perms)}")
    push_notif(target, "Your admin permissions have been updated.", "role")
    return jsonify({"message": f"Permissions updated for @{target}!"}), 200

# ══════════════════════════════════════════════════════════════
#  REVOKE ADMIN
# ══════════════════════════════════════════════════════════════
@admin_bp.route("/revoke-admin", methods=["POST", "OPTIONS"])
def revoke_admin():
    if request.method == "OPTIONS": return jsonify({}), 200
    data = request.get_json()
    revoker = data.get("revoker", "")
    target  = data.get("target", "")

    if is_superadmin(target):
        return jsonify({"error": "Cannot revoke Super-Admin!"}), 400

    target_user = get_user(target)
    if not target_user:
        return jsonify({"error": "User not found!"}), 404

    target_parent = target_user.get("created_by", "")
    if not is_superadmin(revoker) and revoker != target_parent:
        return jsonify({"error": "You can only revoke admins you created!"}), 403

    old_perms = target_user.get("permissions", [])
    users_col.update_one({"username": target}, {"$set": {
        "role": "user", "permissions": [], "created_by": None
    }})
    propagate_permission_removal(target, old_perms)
    log_action(revoker, "REVOKE_ADMIN", target, "All permissions removed")
    push_notif(target, "Your admin access has been revoked.", "role")
    return jsonify({"message": f"@{target} admin access revoked!"}), 200

# ══════════════════════════════════════════════════════════════
#  GET ADMIN TREE (who created whom)
# ══════════════════════════════════════════════════════════════
@admin_bp.route("/admin-tree", methods=["GET"])
def admin_tree():
    username = request.args.get("username", "")
    if not is_superadmin(username) and not has_permission(username, "manage_users"):
        return jsonify({"error": "Unauthorized"}), 403

    if is_superadmin(username):
        # Super admin sees full tree
        admins = list(users_col.find({"role": "admin"}, {"password": 0, "_id": 0, "plain_password": 0}))
    else:
        # Admin sees only their subtree
        admins = list(users_col.find({"created_by": username}, {"password": 0, "_id": 0, "plain_password": 0}))

    for a in admins:
        a["warning_count"] = warnings_col.count_documents({"username": a["username"]})

    return jsonify(admins), 200

# ══════════════════════════════════════════════════════════════
#  PLATFORM STATS
# ══════════════════════════════════════════════════════════════
@admin_bp.route("/stats", methods=["GET"])
def get_stats():
    username = request.args.get("username", "")
    if not has_permission(username, "view_stats"):
        return jsonify({"error": "Unauthorized"}), 403

    now = int(time.time() * 1000)
    today_start = now - (24 * 3600 * 1000)

    total_users    = users_col.count_documents({})
    total_posts    = posts_col.count_documents({})
    total_admins   = users_col.count_documents({"role": "admin"})
    total_banned   = users_col.count_documents({"banned": True})
    reported_posts = posts_col.count_documents({"reports": {"$exists": True, "$ne": []}})
    posts_today    = posts_col.count_documents({"createdAt": {"$gte": today_start}})
    users_today    = users_col.count_documents({"joined_at": {"$gte": today_start}})
    total_warnings = warnings_col.count_documents({})
    total_comments = sum(len(p.get("comments", [])) for p in posts_col.find({}, {"comments": 1}))

    weekly = []
    for i in range(6, -1, -1):
        day_start = now - ((i+1) * 24 * 3600 * 1000)
        day_end   = now - (i * 24 * 3600 * 1000)
        count = posts_col.count_documents({"createdAt": {"$gte": day_start, "$lt": day_end}})
        label = datetime.datetime.fromtimestamp(day_end/1000).strftime("%a")
        weekly.append({"day": label, "count": count})

    return jsonify({
        "total_users": total_users, "total_posts": total_posts,
        "total_admins": total_admins, "total_banned": total_banned,
        "reported_posts": reported_posts, "posts_today": posts_today,
        "users_today": users_today, "total_warnings": total_warnings,
        "total_comments": total_comments, "weekly": weekly,
    }), 200

# ══════════════════════════════════════════════════════════════
#  ALL USERS
# ══════════════════════════════════════════════════════════════
@admin_bp.route("/users", methods=["GET"])
def get_all_users():
    username = request.args.get("username", "")
    if not has_permission(username, "manage_users"):
        return jsonify({"error": "Unauthorized"}), 403
    users = list(users_col.find({}, {"password": 0, "_id": 0, "plain_password": 0}))
    for u in users:
        u["warning_count"] = warnings_col.count_documents({"username": u["username"]})
    return jsonify(users), 200

# ══════════════════════════════════════════════════════════════
#  BAN / UNBAN
# ══════════════════════════════════════════════════════════════
@admin_bp.route("/ban", methods=["POST", "OPTIONS"])
def ban_user():
    if request.method == "OPTIONS": return jsonify({}), 200
    data = request.get_json()
    requester  = data.get("requester", "")
    target     = data.get("target", "")
    action     = data.get("action", "ban")
    duration_h = data.get("duration_hours", 0)

    if not has_permission(requester, "ban_users"):
        return jsonify({"error": "You don't have ban permission!"}), 403
    if is_superadmin(target):
        return jsonify({"error": "Cannot ban Super-Admin!"}), 400

    if action == "ban":
        ban_until = None
        if duration_h and int(duration_h) > 0:
            ban_until = int(time.time() * 1000) + int(duration_h) * 3600 * 1000
        users_col.update_one({"username": target}, {"$set": {"banned": True, "ban_until": ban_until}})
        dur_str = f"for {duration_h}h" if duration_h else "permanently"
        log_action(requester, "BAN", target, dur_str)
        push_notif(target, f"Your account has been banned {dur_str}.", "ban")
        return jsonify({"message": f"@{target} banned {dur_str}!"}), 200
    else:
        users_col.update_one({"username": target}, {"$set": {"banned": False, "ban_until": None}})
        log_action(requester, "UNBAN", target, "")
        push_notif(target, "Your account ban has been lifted. Welcome back!", "unban")
        return jsonify({"message": f"@{target} unbanned!"}), 200

# ══════════════════════════════════════════════════════════════
#  WARN USER
# ══════════════════════════════════════════════════════════════
@admin_bp.route("/warn", methods=["POST", "OPTIONS"])
def warn_user():
    if request.method == "OPTIONS": return jsonify({}), 200
    data = request.get_json()
    requester = data.get("requester", "")
    target    = data.get("target", "")
    reason    = data.get("reason", "Violation of community guidelines")

    if not has_permission(requester, "warn_users"):
        return jsonify({"error": "You don't have warn permission!"}), 403
    if is_superadmin(target):
        return jsonify({"error": "Cannot warn Super-Admin!"}), 400

    warnings_col.insert_one({
        "username": target, "reason": reason,
        "issued_by": requester, "at": int(time.time() * 1000)
    })
    log_action(requester, "WARN", target, reason)
    push_notif(target, f"⚠️ Warning received: {reason}", "warning")
    return jsonify({"message": f"Warning issued to @{target}!"}), 200

# ══════════════════════════════════════════════════════════════
#  DELETE POST
# ══════════════════════════════════════════════════════════════
@admin_bp.route("/delete-post/<post_id>", methods=["DELETE", "OPTIONS"])
def delete_post(post_id):
    if request.method == "OPTIONS": return jsonify({}), 200
    username = request.args.get("username", "")
    if not has_permission(username, "delete_reports"):
        return jsonify({"error": "You don't have permission to delete posts!"}), 403
    post = posts_col.find_one({"_id": ObjectId(post_id)})
    if post:
        log_action(username, "DELETE_POST", post.get("username",""), post.get("title",""))
        push_notif(post.get("username",""), f"Your post '{post.get('title','')}' was removed by an Admin.", "warning")
    posts_col.delete_one({"_id": ObjectId(post_id)})
    return jsonify({"message": "Post deleted!"}), 200

# ══════════════════════════════════════════════════════════════
#  REPORT POST
# ══════════════════════════════════════════════════════════════
@admin_bp.route("/report-post/<post_id>", methods=["POST", "OPTIONS"])
def report_post(post_id):
    if request.method == "OPTIONS": return jsonify({}), 200
    data = request.get_json()
    reporter = data.get("username", "")
    reason   = data.get("reason", "Inappropriate content")
    if not reporter:
        return jsonify({"error": "Username required"}), 400
    posts_col.update_one({"_id": ObjectId(post_id)}, {"$push": {"reports": {
        "username": reporter, "reason": reason, "at": int(time.time() * 1000)
    }}})
    log_action(reporter, "REPORT_POST", post_id, reason)
    return jsonify({"message": "Post reported! Admins will review it."}), 200

# ══════════════════════════════════════════════════════════════
#  REPORTED POSTS
# ══════════════════════════════════════════════════════════════
@admin_bp.route("/reported-posts", methods=["GET"])
def get_reported_posts():
    username = request.args.get("username", "")
    if not has_permission(username, "view_reports"):
        return jsonify({"error": "Unauthorized"}), 403
    posts = list(posts_col.find({"reports": {"$exists": True, "$ne": []}}).sort("createdAt", -1))
    for p in posts:
        p["_id"] = str(p["_id"])
    return jsonify(posts), 200

# ══════════════════════════════════════════════════════════════
#  ANNOUNCEMENT
# ══════════════════════════════════════════════════════════════
@admin_bp.route("/announce", methods=["POST", "OPTIONS"])
def announce():
    if request.method == "OPTIONS": return jsonify({}), 200
    data = request.get_json()
    username = data.get("username", "")
    message  = data.get("message", "").strip()
    title    = data.get("title", "").strip()
    if not has_permission(username, "post_announcements"):
        return jsonify({"error": "You don't have announcement permission!"}), 403
    if not message or not title:
        return jsonify({"error": "Title and message required!"}), 400
    ann = {
        "username": username, "title": title, "message": message,
        "createdAt": int(time.time() * 1000), "role": get_role(username)
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

# ══════════════════════════════════════════════════════════════
#  AUDIT LOG
# ══════════════════════════════════════════════════════════════
@admin_bp.route("/audit-logs", methods=["GET"])
def get_audit_logs():
    username = request.args.get("username", "")
    if not has_permission(username, "view_audit"):
        return jsonify({"error": "Unauthorized"}), 403
    logs = list(audit_col.find({}).sort("at", -1).limit(100))
    for l in logs:
        l["_id"] = str(l["_id"])
    return jsonify(logs), 200

# ══════════════════════════════════════════════════════════════
#  NOTIFICATIONS
# ══════════════════════════════════════════════════════════════
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

# ══════════════════════════════════════════════════════════════
#  BACKUP (superadmin only)
# ══════════════════════════════════════════════════════════════
@admin_bp.route("/backup", methods=["GET"])
def backup():
    username = request.args.get("username", "")
    if not is_superadmin(username):
        return jsonify({"error": "Only Super-Admin can backup!"}), 403
    users = list(users_col.find({}, {"password": 0, "_id": 0, "plain_password": 0}))
    posts = list(posts_col.find({}))
    for p in posts:
        p["_id"] = str(p["_id"])
    log_action(username, "BACKUP", "", "Full backup downloaded")
    return jsonify({
        "backup_at": int(time.time() * 1000),
        "users_count": len(users), "posts_count": len(posts),
        "users": users, "posts": posts,
    }), 200

# ══════════════════════════════════════════════════════════════
#  PERMISSION LABELS (for frontend)
# ══════════════════════════════════════════════════════════════
@admin_bp.route("/permission-labels", methods=["GET"])
def permission_labels():
    return jsonify(PERMISSION_LABELS), 200
