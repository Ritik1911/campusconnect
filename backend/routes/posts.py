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
