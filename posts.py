from flask import Blueprint, request, jsonify
from config import posts_col, users_col
import time

posts_bp = Blueprint("posts", __name__)

VALID_TOPICS = ["Sincere Work", "Fun Work", "Get Together", "Party", "Earning", "Help", "Learn", "Assignment", "Exam", "Other"]

def normalize_topic(topic):
    """If topic is not a standard one, keep it as-is (custom topic)."""
    return topic.strip() if topic else "Other"


@posts_bp.route("/create", methods=["POST", "OPTIONS"])
def create_post():
    if request.method == "OPTIONS":
        return jsonify({}), 200

    data = request.get_json()
    if not data:
        return jsonify({"error": "No data received"}), 400

    required = ["username", "topic", "title", "description"]
    for field in required:
        if not data.get(field, "").strip():
            return jsonify({"error": f"Field '{field}' is required!"}), 400

    user = users_col.find_one({"username": data["username"]})
    if not user:
        return jsonify({"error": "User not found!"}), 404

    expires_in = data.get("expires_in", 0)
    expires_at = None
    if expires_in and int(expires_in) > 0:
        expires_at = int(time.time() * 1000) + (int(expires_in) * 3600 * 1000)

    post = {
        "username": data["username"],
        "fullname": user["fullname"],
        "stream": user["stream"],
        "year": user["year"],
        "semester": user["semester"],
        "building": user["building"],
        "location": user["location"],
        "topic": normalize_topic(data["topic"]),
        "title": data["title"],
        "description": data["description"],
        "contact": data.get("contact", "profile"),
        "comments": [],
        "requests": [],  # access requests for "profile" contact method: [{username, status, at}]
        "createdAt": int(time.time() * 1000),
        "expires_at": expires_at,
    }

    result = posts_col.insert_one(post)
    post["_id"] = str(result.inserted_id)
    return jsonify({"message": "Post created!", "post": post}), 201


@posts_bp.route("/all", methods=["GET"])
def get_posts():
    topic = request.args.get("topic")
    now = int(time.time() * 1000)

    all_posts = list(posts_col.find({}).sort("createdAt", -1).limit(200))

    active_posts = []
    for p in all_posts:
        p["_id"] = str(p["_id"])
        if p.get("expires_at") and p["expires_at"] < now:
            continue
        active_posts.append(p)

    if topic and topic != "all":
        if topic == "Other":
            # Show posts whose topic is not in standard list (custom topics) AND posts with topic "Other"
            active_posts = [p for p in active_posts if p.get("topic") not in VALID_TOPICS or p.get("topic") == "Other"]
        else:
            active_posts = [p for p in active_posts if p.get("topic") == topic]

    return jsonify(active_posts), 200


@posts_bp.route("/<post_id>", methods=["GET"])
def get_single_post(post_id):
    """Fetch one post fresh (lighter than /all — used for comments & contact checks)."""
    from bson import ObjectId
    try:
        post = posts_col.find_one({"_id": ObjectId(post_id)})
    except Exception:
        return jsonify({"error": "Invalid post id"}), 400
    if not post:
        return jsonify({"error": "Post not found"}), 404
    post["_id"] = str(post["_id"])
    return jsonify(post), 200


@posts_bp.route("/counts", methods=["GET"])
def get_counts():
    now = int(time.time() * 1000)
    counts = {}

    all_posts = list(posts_col.find({}))
    total = 0
    for p in all_posts:
        if p.get("expires_at") and p["expires_at"] < now:
            continue
        t = p.get("topic", "Other")
        # Custom topics count under "Other"
        key = t if t in VALID_TOPICS else "Other"
        counts[key] = counts.get(key, 0) + 1
        total += 1

    counts["all"] = total
    return jsonify(counts), 200


@posts_bp.route("/<post_id>/comment", methods=["POST", "OPTIONS"])
def add_comment(post_id):
    if request.method == "OPTIONS":
        return jsonify({}), 200

    from bson import ObjectId
    data = request.get_json()
    username = data.get("username", "").strip()
    text = data.get("text", "").strip()

    if not username or not text:
        return jsonify({"error": "Username and comment text required!"}), 400

    comment = {
        "username": username,
        "text": text,
        "createdAt": int(time.time() * 1000)
    }

    post = posts_col.find_one({"_id": ObjectId(post_id)})
    posts_col.update_one(
        {"_id": ObjectId(post_id)},
        {"$push": {"comments": comment}}
    )
    # Notify post owner
    if post and post.get("username") and post["username"] != username:
        from config import notifs_col
        notifs_col.insert_one({
            "to": post["username"],
            "message": f"@{username} commented on your post: '{post.get('title', '')}'",
            "type": "comment",
            "read": False,
            "at": int(time.time() * 1000)
        })
    return jsonify({"message": "Comment added!", "comment": comment}), 201


@posts_bp.route("/<post_id>/contact", methods=["GET"])
def get_contact_info(post_id):
    """
    Return exactly what the viewer is allowed to see, based on the poster's
    Preferred Contact Method:
      - whatsapp -> poster's WhatsApp/mobile number only
      - meet     -> just a "meet on campus" message, no personal info
      - comment  -> no contact info at all, comments only
      - profile  -> full profile, but ONLY after the poster approves a request
    """
    from bson import ObjectId
    viewer = request.args.get("viewer", "").strip()
    try:
        post = posts_col.find_one({"_id": ObjectId(post_id)})
    except Exception:
        return jsonify({"error": "Invalid post id"}), 400
    if not post:
        return jsonify({"error": "Post not found"}), 404

    owner_username = post.get("username", "")
    method = post.get("contact", "profile")

    # Post owner viewing their own post always sees full info
    if viewer and viewer == owner_username:
        owner = users_col.find_one({"username": owner_username})
        return jsonify({
            "type": "profile", "method": method,
            "fullname": owner.get("fullname"), "mobile": owner.get("mobile"),
            "email": owner.get("email"), "stream": owner.get("stream"),
            "year": owner.get("year"), "semester": owner.get("semester"),
            "building": owner.get("building"), "location": owner.get("location"),
        }), 200

    owner = users_col.find_one({"username": owner_username})
    if not owner:
        return jsonify({"error": "Post owner not found"}), 404

    if method == "whatsapp":
        return jsonify({"type": "whatsapp", "fullname": owner.get("fullname"), "mobile": owner.get("mobile")}), 200

    if method == "meet":
        return jsonify({"type": "meet", "fullname": owner.get("fullname"),
                         "message": "Prefers to meet on campus in person. Comment on the post to arrange a time & place!"}), 200

    if method == "comment":
        return jsonify({"type": "comment", "fullname": owner.get("fullname"),
                         "message": "This user only takes contact through comments on the post."}), 200

    # method == "profile" (default) — needs the poster's explicit permission
    reqs = post.get("requests", [])
    mine = next((r for r in reqs if r.get("username") == viewer), None)
    if mine and mine.get("status") == "approved":
        return jsonify({
            "type": "profile", "method": method,
            "fullname": owner.get("fullname"), "mobile": owner.get("mobile"),
            "email": owner.get("email"), "stream": owner.get("stream"),
            "year": owner.get("year"), "semester": owner.get("semester"),
            "building": owner.get("building"), "location": owner.get("location"),
        }), 200
    elif mine and mine.get("status") == "pending":
        return jsonify({"type": "pending", "fullname": owner.get("fullname")}), 200
    elif mine and mine.get("status") == "denied":
        return jsonify({"type": "denied", "fullname": owner.get("fullname")}), 200
    else:
        return jsonify({"type": "none", "fullname": owner.get("fullname")}), 200


@posts_bp.route("/<post_id>/request-contact", methods=["POST", "OPTIONS"])
def request_contact(post_id):
    """Viewer asks the poster for permission to view their profile."""
    if request.method == "OPTIONS":
        return jsonify({}), 200
    from bson import ObjectId
    data = request.get_json() or {}
    username = data.get("username", "").strip()
    if not username:
        return jsonify({"error": "Username required"}), 400

    try:
        post = posts_col.find_one({"_id": ObjectId(post_id)})
    except Exception:
        return jsonify({"error": "Invalid post id"}), 400
    if not post:
        return jsonify({"error": "Post not found"}), 404
    if post.get("contact", "profile") != "profile":
        return jsonify({"error": "This post doesn't use profile-view permission."}), 400
    if post.get("username") == username:
        return jsonify({"error": "This is your own post!"}), 400

    reqs = post.get("requests", [])
    existing = next((r for r in reqs if r.get("username") == username), None)
    if existing and existing.get("status") in ("approved", "pending"):
        return jsonify({"message": "Request already sent!", "status": existing.get("status")}), 200

    new_entry = {"username": username, "status": "pending", "at": int(time.time() * 1000)}
    if existing:
        posts_col.update_one(
            {"_id": ObjectId(post_id), "requests.username": username},
            {"$set": {"requests.$.status": "pending", "requests.$.at": new_entry["at"]}}
        )
    else:
        posts_col.update_one({"_id": ObjectId(post_id)}, {"$push": {"requests": new_entry}})

    from config import notifs_col
    notifs_col.insert_one({
        "to": post["username"],
        "message": f"@{username} requested permission to view your profile for '{post.get('title','')}'",
        "type": "access_request",
        "post_id": post_id,
        "requester": username,
        "read": False,
        "at": int(time.time() * 1000)
    })
    return jsonify({"message": "Request sent! You'll be notified once the poster responds."}), 200


@posts_bp.route("/<post_id>/respond-contact", methods=["POST", "OPTIONS"])
def respond_contact(post_id):
    """Poster approves or denies a pending profile-view request."""
    if request.method == "OPTIONS":
        return jsonify({}), 200
    from bson import ObjectId
    data = request.get_json() or {}
    owner = data.get("owner", "").strip()
    requester = data.get("requester", "").strip()
    action = data.get("action", "")  # "approve" or "deny"

    try:
        post = posts_col.find_one({"_id": ObjectId(post_id)})
    except Exception:
        return jsonify({"error": "Invalid post id"}), 400
    if not post:
        return jsonify({"error": "Post not found"}), 404
    if post.get("username") != owner:
        return jsonify({"error": "Only the post owner can respond to this request."}), 403
    if action not in ("approve", "deny"):
        return jsonify({"error": "Invalid action"}), 400

    new_status = "approved" if action == "approve" else "denied"
    posts_col.update_one(
        {"_id": ObjectId(post_id), "requests.username": requester},
        {"$set": {"requests.$.status": new_status}}
    )

    from config import notifs_col
    notifs_col.insert_one({
        "to": requester,
        "message": (f"@{owner} approved your request to view their profile for '{post.get('title','')}'"
                     if new_status == "approved"
                     else f"@{owner} declined your request to view their profile for '{post.get('title','')}'"),
        "type": "access_approved" if new_status == "approved" else "access_denied",
        "post_id": post_id,
        "read": False,
        "at": int(time.time() * 1000)
    })
    return jsonify({"message": f"Request {new_status}!"}), 200


@posts_bp.route("/suggestions", methods=["GET"])
def suggestions():
    username = request.args.get("username", "")
    tips = [
        {"topic": "Exam", "title": "Create a study group for your semester exams"},
        {"topic": "Assignment", "title": "Find assignment help from seniors"},
        {"topic": "Earning", "title": "Explore freelance opportunities on campus"},
        {"topic": "Help", "title": "Help someone or get help from your community"},
    ]
    if username:
        user = users_col.find_one({"username": username})
        if user:
            recent = list(posts_col.find(
                {"stream": user["stream"], "username": {"$ne": username}}
            ).sort("createdAt", -1).limit(4))
            if recent:
                tips = [{"topic": p["topic"], "title": p["title"]} for p in recent]
    return jsonify(tips), 200
