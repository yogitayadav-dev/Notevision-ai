import os
import requests
import markdown
from datetime import datetime
from flask import Flask, render_template, request, jsonify, session
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from dotenv import load_dotenv
from groq import Groq
from werkzeug.utils import secure_filename

# Load .env
load_dotenv()

app = Flask(__name__)
app.secret_key = os.environ.get("FLASK_SECRET_KEY", "any_random_string_here")
CORS(app)

# Ensure upload folder exists
UPLOAD_FOLDER = "static/uploads"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER

# Database
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///database.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)

client = Groq(api_key=os.environ.get("GROQ_API_KEY"))

# Database Models
class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(150), unique=True, nullable=False)
    password = db.Column(db.String(150), nullable=False)

class Conversation(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(200))

class Chat(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    conversation_id = db.Column(db.Integer, db.ForeignKey('conversation.id'))
    message = db.Column(db.Text)
    response = db.Column(db.Text)

class Memory(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    key = db.Column(db.String(100))
    value = db.Column(db.String(500))

class Note(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(200))
    extracted_text = db.Column(db.Text)
    summary = db.Column(db.Text)
    file_type = db.Column(db.String(50))
    created_at = db.Column(db.String(100))

class UserMemory(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    key = db.Column(db.String(100))
    value = db.Column(db.String(500))

with app.app_context():
    db.create_all()

# --- PAGE ROUTING ---
@app.route("/")
def home():
    return render_template("index.html")

@app.route("/login")
def login_page():
    return render_template("login.html")

@app.route("/dashboard")
def dashboard():
    return render_template("dashboard.html")

# --- AUTH API ROUTES ---
@app.route("/api/signup", methods=["POST"])
def api_signup():
    data = request.get_json()
    email = data.get("email")
    password = data.get("password")

    if not email or not password:
        return jsonify({"error": "Missing email or password"}), 400

    user_exists = User.query.filter_by(email=email).first()
    if user_exists:
        return jsonify({"error": "User already exists!"}), 400

    new_user = User(email=email, password=password) # Simple Text for Testing
    db.session.add(new_user)
    db.session.commit()
    return jsonify({"message": "Signup Successful! Now please login."}), 201

@app.route("/api/login", methods=["POST"])
def api_login():
    data = request.get_json()
    email = data.get("email")
    password = data.get("password")

    user = User.query.filter_by(email=email, password=password).first()
    if user:
        # Dummy token string for localStorage compatibility
        return jsonify({"token": "mock-jwt-token-xyz123", "message": "Login Successful 😭🔥"}), 200
    else:
        return jsonify({"error": "Invalid email or password"}), 401

# --- CHAT & IMAGE AI ROUTES ---
@app.route("/chat", methods=["POST"])
def chat():
    data = request.get_json()
    user_message = data.get("message")
    mode = data.get("mode", "casual")
    conversation_id = session.get("conversation_id")

    if not user_message:
        return jsonify({"reply": "Please type something."})

    if "my name is" in user_message.lower():
        name = user_message.lower().split("is")[-1].strip().title()
        existing_mem = UserMemory.query.filter_by(key="name").first()
        if existing_mem:
            existing_mem.value = name
        else:
            new_mem = UserMemory(key="name", value=name)
            db.session.add(new_mem)
        db.session.commit()

    name_mem = UserMemory.query.filter_by(key="name").first()
    user_name = name_mem.value if name_mem else "User"

    mode_prompts = {
        "casual": "You are a casual friendly AI friend.",
        "coding": "You are an expert programmer.",
        "research": "You are a deep research AI.",
        "study": "You are a teacher AI.",
        "fun": "You are a funny entertaining AI.",
        "creative": "You are a highly creative AI.",
        "debug": "You are an expert debugging AI.",
        "interview": "You are an interview prep AI.",
        "motivation": "You are a motivational coach.",
        "anime": "You are a cute anime-style AI friend.",
        "therapy": "You are a calm emotional support AI."
    }

    try:
        current_time_info = f"Current date: {datetime.now().strftime('%d %B %Y')}\nCurrent time: {datetime.now().strftime('%I:%M %p')}"
        
        messages = [
            {
                "role": "system",
                "content": f"""{mode_prompts.get(mode, 'You are a helpful AI.')} {current_time_info} User name: {user_name} Rules: 1. Detailed answers. 2. Full HTML/CSS. 3. Use Markdown."""
            }
        ]

        if conversation_id:
            old_chats = Chat.query.filter_by(conversation_id=conversation_id).all()
            for chat_entry in old_chats:
                messages.append({"role": "user", "content": chat_entry.message})
                messages.append({"role": "assistant", "content": chat_entry.response})

        messages.append({"role": "user", "content": user_message})

        completion = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=messages
        )
        raw_reply = completion.choices[0].message.content
        
        ai_reply_html = markdown.markdown(raw_reply, extensions=["fenced_code"])

        if not conversation_id:
            new_conv = Conversation(title=user_message[:30])
            db.session.add(new_conv)
            db.session.commit()
            conversation_id = new_conv.id
            session["conversation_id"] = conversation_id

        new_chat = Chat(
            conversation_id=conversation_id,
            message=user_message,
            response=raw_reply
        )
        db.session.add(new_chat)
        db.session.commit()

        return jsonify({"reply": ai_reply_html, "conversation_id": conversation_id})

    except Exception as e:
        return jsonify({"reply": f"Error: {str(e)}"}), 500

@app.route("/history")
def history():
    conversations = Conversation.query.order_by(Conversation.id.desc()).all()
    return jsonify([{"id": c.id, "title": c.title} for c in conversations])

@app.route("/conversation/<int:conversation_id>")
def load_conversation(conversation_id):
    session["conversation_id"] = conversation_id
    chats = Chat.query.filter_by(conversation_id=conversation_id).all()
    return jsonify([{"message": c.message, "response": markdown.markdown(c.response, extensions=["fenced_code"])} for c in chats])

@app.route("/new_chat", methods=["POST"])
def new_chat():
    session.pop("conversation_id", None)
    return jsonify({"message": "New chat created"})

@app.route("/clear", methods=["POST"])
def clear():
    Chat.query.delete()
    Conversation.query.delete()
    Memory.query.delete()
    session.pop("conversation_id", None)
    db.session.commit()
    return jsonify({"message": "Chats cleared"})

@app.route("/delete/<int:id>", methods=["DELETE"])
def delete_chat(id):
    try:
        Chat.query.filter_by(conversation_id=id).delete()
        conversation = Conversation.query.get(id)
        if conversation:
            db.session.delete(conversation)
            db.session.commit()
            return jsonify({"message": "Deleted"})
        return jsonify({"message": "Not found"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/rename/<int:id>", methods=["POST"])
def rename_chat(id):
    try:
        data = request.get_json()
        new_title = data.get("title")
        conversation = Conversation.query.get(id)
        if conversation:
            conversation.title = new_title
            db.session.commit()
            return jsonify({"message": "Renamed"})
        return jsonify({"message": "Not found"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/generate-image", methods=["POST"])
def generate_image():
    data = request.json
    prompt = data.get("prompt")
    API_URL = "https://huggingface.co"
    
    hf_token = os.environ.get("HUGGINGFACE_API_KEY")
    headers = {"Authorization": f"Bearer {hf_token}"}
    
    response = requests.post(API_URL, headers=headers, json={"inputs": prompt})
    
    os.makedirs("static", exist_ok=True)
    with open("static/generated.png", "wb") as f:
        f.write(response.content)
        
    return jsonify({"image": "/static/generated.png"})

@app.route("/upload", methods=["POST"])
def upload_file():
    if "file" not in request.files:
        return jsonify({"error": "No file part in the request"}), 400

    file = request.files["file"]

    if file.filename == "":
        return jsonify({"error": "No file selected"}), 400

    if file:
        filename = secure_filename(file.filename)
        filepath = os.path.join(app.config["UPLOAD_FOLDER"], filename)
        file.save(filepath)

        try:
            extracted_text = "OCR functionality is temporarily disabled."
            new_note = Note(
                title=filename,
                extracted_text=extracted_text,
                summary="OCR disabled",
                file_type=filename.split(".")[-1] if "." in filename else "unknown",
                created_at=datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            )
            db.session.add(new_note)
            db.session.commit()

            return jsonify({
                "message": "File uploaded successfully (OCR skipped)",
                "extracted_text": extracted_text,
                "note_id": new_note.id
            })
        except Exception as e:
            return jsonify({"error": f"Processing failed: {str(e)}"}), 500

if __name__ == "__main__":
    app.run(debug=True)
