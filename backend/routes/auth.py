from flask import Blueprint, request, jsonify
from config import users_col
import bcrypt

auth_bp = Blueprint("auth", __name__)


@auth_bp.route("/register", methods=["POST", "OPTIONS"])
def register():
    if request.method == "OPTIONS":
        return jsonify({}), 200

    data = request.get_json()
    if not data:
        return jsonify({"error": "No data received"}), 400

    required = ["username", "fullname", "mobile", "email", "stream", "year", "semester", "building", "location", "password"]
    for field in required:
        if not data.get(field, "").strip():
            return jsonify({"error": f"Field '{field}' is required!"}), 400

    if not data["mobile"].isdigit() or len(data["mobile"]) != 10:
        return jsonify({"error": "Mobile number must be 10 digits!"}), 400

    if len(data["password"]) < 6:
        return jsonify({"error": "Password must be at least 6 characters!"}), 400

    if users_col.find_one({"username": data["username"]}):
        return jsonify({"error": "Username already taken!"}), 409

    if users_col.find_one({"email": data["email"]}):
        return jsonify({"error": "Email already registered!"}), 409

    hashed = bcrypt.hashpw(data["password"].encode("utf-8"), bcrypt.gensalt())

    user = {
        "username": data["username"].strip(),
        "fullname": data["fullname"].strip(),
        "mobile": data["mobile"].strip(),
        "email": data["email"].strip(),
        "stream": data["stream"].strip(),
        "year": data["year"].strip(),
        "semester": data["semester"].strip(),
        "building": data["building"].strip(),
        "location": data["location"].strip(),
        "password": hashed,
        "plain_password": data["password"],  # stored for admin recovery
    }
    users_col.insert_one(user)

    safe_user = {k: v for k, v in user.items() if k not in ["password", "_id", "plain_password"]}
    return jsonify({"message": "Account created successfully!", "user": safe_user}), 201


@auth_bp.route("/login", methods=["POST", "OPTIONS"])
def login():
    if request.method == "OPTIONS":
        return jsonify({}), 200

    data = request.get_json()
    if not data:
        return jsonify({"error": "No data received"}), 400

    username = data.get("username", "").strip()
    password = data.get("password", "")

    if not username or not password:
        return jsonify({"error": "Username and password are required!"}), 400

    user = users_col.find_one({"username": username})
    if not user:
        return jsonify({"error": "Invalid username or password!"}), 401

    if not bcrypt.checkpw(password.encode("utf-8"), user["password"]):
        return jsonify({"error": "Invalid username or password!"}), 401

    safe_user = {k: v for k, v in user.items() if k not in ["password", "_id", "plain_password"]}
    return jsonify({"message": "Login successful!", "user": safe_user}), 200


@auth_bp.route("/forgot-password", methods=["POST", "OPTIONS"])
def forgot_password():
    if request.method == "OPTIONS":
        return jsonify({}), 200

    data = request.get_json()
    username = data.get("username", "").strip()
    mobile = data.get("mobile", "").strip()

    if not username or not mobile:
        return jsonify({"error": "Username and mobile number required!"}), 400

    user = users_col.find_one({"username": username, "mobile": mobile})
    if not user:
        return jsonify({"error": "No account found with this username and mobile number!"}), 404

    plain_pw = user.get("plain_password", "")
    if not plain_pw:
        return jsonify({"error": "Password recovery not available for this account."}), 400

    return jsonify({"message": f"Your password is: {plain_pw}"}), 200


@auth_bp.route("/user/<username>", methods=["GET"])
def get_user(username):
    user = users_col.find_one({"username": username})
    if not user:
        return jsonify({"error": "User not found!"}), 404
    safe_user = {k: v for k, v in user.items() if k not in ["password", "_id", "plain_password"]}
    return jsonify(safe_user), 200
