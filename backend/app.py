from flask import Flask
from flask_cors import CORS
from routes.auth import auth_bp
from routes.posts import posts_bp

app = Flask(__name__)

# Allow all origins — fixes the CORS issue completely
CORS(app)

@app.after_request
def add_cors_headers(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
    return response

app.register_blueprint(auth_bp, url_prefix="/api/auth")
app.register_blueprint(posts_bp, url_prefix="/api/posts")

@app.route("/")
def index():
    return {"message": "CampusConnect API is running!", "status": "ok"}

if __name__ == "__main__":
    print("Server starting at http://127.0.0.1:5000")
    app.run(debug=True, port=5000, host="127.0.0.1")
