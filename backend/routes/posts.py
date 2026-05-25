from flask import Blueprint, request, jsonify
from config import posts_col, users_col
import time

posts_bp = Blueprint("posts", __name__)


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

    post = {
        "username": data["username"],
        "fullname": user["fullname"],
        "stream": user["stream"],
        "year": user["year"],
        "semester": user["semester"],
        "building": user["building"],
        "location": user["location"],
        "topic": data["topic"],
        "title": data["title"],
        "description": data["description"],
        "contact": data.get("contact", "profile"),
        "createdAt": int(time.time() * 1000),
    }

    result = posts_col.insert_one(post)
    post["_id"] = str(result.inserted_id)

    return jsonify({"message": "Post created!", "post": post}), 201


@posts_bp.route("/all", methods=["GET"])
def get_posts():
    topic = request.args.get("topic")
    query = {}
    if topic and topic != "all":
        query["topic"] = topic

    posts = list(posts_col.find(query).sort("createdAt", -1).limit(50))
    for p in posts:
        p["_id"] = str(p["_id"])

    return jsonify(posts), 200


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
                tips = [{"topic": p["topic"], "title": p["title"], "username": p["username"]} for p in recent]
                for p in tips:
                    p["_id"] = str(p.get("_id", ""))

    return jsonify(tips), 200
