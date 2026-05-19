/* --- GLOBAL VARIABLES --- */
let currentConversationId = null;
let currentMode = "casual";

const chatBox = document.getElementById("chat-box");
const historyList = document.getElementById("historyList");
const toggleBtn = document.getElementById("themeToggle");
const menuBtn = document.getElementById("menuBtn");
const dropdown = document.getElementById("dropdownMenu");

/* --- 1. PAGE LOAD INITIALIZATION --- */
window.onload = () => {
    // केवल डैशबोर्ड पेज पर हिस्ट्री लोड करें अगर एलिमेंट मौजूद हो
    if (historyList) {
        loadHistory();
    }

    // थीम सेटअप
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme === "light") {
        document.body.classList.add("light-mode");
        if (toggleBtn) toggleBtn.innerHTML = "☀️";
    } else {
        if (toggleBtn) toggleBtn.innerHTML = "🌙";
    }
};

/* --- 2. THEME TOGGLE --- */
if (toggleBtn) {
    toggleBtn.addEventListener("click", () => {
        document.body.classList.toggle("light-mode");
        const themeEmoji = document.getElementById("themeEmoji");
        if (document.body.classList.contains("light-mode")) {
            if (themeEmoji) themeEmoji.innerText = "☀️";
            localStorage.setItem("theme", "light");
        } else {
            if (themeEmoji) themeEmoji.innerText = "🌙";
            localStorage.setItem("theme", "dark");
        }
    });
}

/* --- 3. MODE SELECTOR --- */
const modeSelect = document.getElementById("modeSelect");
if (modeSelect) {
    modeSelect.addEventListener("change", function() {
        currentMode = this.value;
    });
}

/* --- 4. LOAD CHAT HISTORY --- */
async function loadHistory() {
    try {
        const response = await fetch("/history");
        const chats = await response.json();
        
        if (!historyList) return;
        historyList.innerHTML = "";

        chats.forEach(chat => {
            const item = document.createElement("div");
            item.className = "history-item";
            item.innerHTML = `
                <span onclick="loadConversation(${chat.id})">${chat.title}</span>
                <div class="history-actions">
                    <button onclick="event.stopPropagation(); renameChat(${chat.id})">✏️</button>
                    <button onclick="event.stopPropagation(); deleteChat(${chat.id})">❌</button>
                </div>
            `;
            historyList.appendChild(item);
        });
    } catch (e) {
        console.error("History load error:", e);
    }
}

/* --- 5. SEND MESSAGE TO AI --- */
async function sendMessage() {
    const input = document.getElementById("message");
    if (!input || !chatBox) return;
    const message = input.value;
    
    if (message.trim() === "") return;

    chatBox.innerHTML += `<div class="user">${message}</div>`;
    input.value = "";

    const typingId = "typing-" + Date.now();
    chatBox.innerHTML += `
        <div class="bot" id="${typingId}">
            <div class="typing">
                <span></span>
                <span></span>
                <span></span>
            </div>
        </div>
    `;
    chatBox.scrollTop = chatBox.scrollHeight;

    try {
        const response = await fetch("/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                message: message,
                mode: currentMode
            })
        });

        const data = await response.json();
        document.getElementById(typingId)?.remove();

        const botDiv = document.createElement("div");
        botDiv.className = "bot";
        botDiv.innerHTML = data.reply;
        chatBox.appendChild(botDiv);
        
        if (data.conversation_id) {
            if (!currentConversationId) {
                currentConversationId = data.conversation_id;
                loadHistory(); 
            }
        }

        addCopyButtons();
        chatBox.scrollTop = chatBox.scrollHeight;
    } catch (error) {
        document.getElementById(typingId)?.remove();
        chatBox.innerHTML += `<div class="bot">Error: Connection lost.</div>`;
    }
}

/* --- 6. LOAD SPECIFIC CONVERSATION --- */
async function loadConversation(id) {
    if (!chatBox) return;
    currentConversationId = id;
    const response = await fetch(`/conversation/${id}`);
    const chats = await response.json();
    chatBox.innerHTML = "";

    chats.forEach(chat => {
        chatBox.innerHTML += `
            <div class="user">${chat.message}</div>
            <div class="bot">${chat.response}</div>
        `;
    });
    addCopyButtons();
    chatBox.scrollTop = chatBox.scrollHeight;
}

/* --- 7. NEW CHAT & MANAGEMENTS --- */
const newChatBtn = document.getElementById("newChatBtn");
if (newChatBtn) {
    newChatBtn.addEventListener("click", async () => {
        await fetch("/new_chat", { method: "POST" });
        currentConversationId = null;
        if (chatBox) chatBox.innerHTML = "";
        loadHistory();
    });
}

async function renameChat(id) {
    const newTitle = prompt("Enter new chat title:");
    if (!newTitle) return;
    await fetch(`/rename/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle })
    });
    loadHistory();
}

async function deleteChat(id) {
    if(confirm("Delete this chat?")) {
        await fetch(`/delete/${id}`, { method: "DELETE" });
        if (currentConversationId === id && chatBox) {
            chatBox.innerHTML = "";
            currentConversationId = null;
        }
        loadHistory();
    }
}

function addCopyButtons() {
    document.querySelectorAll("pre").forEach(block => {
        if (block.querySelector(".copy-btn")) return;
        const button = document.createElement("button");
        button.innerText = "Copy";
        button.className = "copy-btn";
        button.onclick = () => {
            const codeText = block.innerText.replace("Copy", "");
            navigator.clipboard.writeText(codeText);
            button.innerText = "Copied!";
            setTimeout(() => { button.innerText = "Copy"; }, 2000);
        };
        block.prepend(button);
    });
}

const messageInput = document.getElementById("message");
if (messageInput) {
    messageInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") sendMessage();
    });
}

if (menuBtn && dropdown) {
    menuBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        dropdown.style.display = dropdown.style.display === "block" ? "none" : "block";
    });
}

// Global click handler Dropdown को बंद करने के लिए
window.onclick = () => { 
    if (dropdown) dropdown.style.display = "none"; 
};

/* --- 8. VOICE TO TEXT FEATURE --- */
const voiceBtn = document.getElementById("voiceBtn");
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

if (SpeechRecognition && voiceBtn) {
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.lang = "en-US"; 

    voiceBtn.addEventListener("click", () => {
        voiceBtn.classList.add("recording"); 
        recognition.start();
    });

    recognition.onresult = (event) => {
        const text = event.results[0][0].transcript; 
        const inputField = document.getElementById("message");
        if (inputField) {
            inputField.value = text;
            inputField.focus();
        }
        voiceBtn.classList.remove("recording");
    };

    recognition.onerror = () => { voiceBtn.classList.remove("recording"); };
    recognition.onend = () => { voiceBtn.classList.remove("recording"); };
}

/* --- 9. MEDIA & UPLOAD HANDLERS --- */
const uploadBtn = document.getElementById("uploadBtn");
const imageInput = document.getElementById("imageInput");
const previewImage = document.getElementById("previewImage");
const cameraBtn = document.getElementById("cameraBtn");
const cameraPreview = document.getElementById("cameraPreview");

if (uploadBtn && imageInput) {
    uploadBtn.addEventListener("click", () => {
        imageInput.click();
    });
}

if (imageInput && previewImage) {
    imageInput.addEventListener("change", () => {
        const file = imageInput.files[0];
        if (file) {
            previewImage.src = URL.createObjectURL(file);
            previewImage.style.display = "block";
        }
    });
}

if (cameraBtn && cameraPreview) {
    cameraBtn.addEventListener("click", async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            cameraPreview.srcObject = stream;
            cameraPreview.style.display = "block";
        } catch (err) {
            console.error("Camera access error:", err);
            alert("Unable to access camera.");
        }
    });
}

/* --- 10. AUTHENTICATION FUNCTIONS (LOGIN & SIGNUP) 😭🔥 --- */
function loginUser() {
    const emailField = document.getElementById("email");
    const passwordField = document.getElementById("password");
    
    if (!emailField || !passwordField) return;

    const email = emailField.value;
    const password = passwordField.value;

    if (!email || !password) {
        alert("Please fill all fields");
        return;
    }

    fetch("/api/login", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ email, password })
    })
    .then(res => res.json())
    .then(data => {
        console.log(data);
        if (data.token) {
            alert("Login Successful 😭🔥");
            localStorage.setItem("token", data.token);
            window.location.href = "/dashboard";
        } else {
            alert(data.error || "Login failed");
        }
    })
    .catch(err => {
        console.log(err);
        alert("Server Error");
    });
}

function signupUser() {
    const emailField = document.getElementById("email");
    const passwordField = document.getElementById("password");
    
    if (!emailField || !passwordField) return;

    const email = emailField.value;
    const password = passwordField.value;

    if (!email || !password) {
        alert("Please fill all fields");
        return;
    }

    fetch("/api/signup", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ email, password })
    })
    .then(res => res.json())
    .then(data => {
        alert(data.message || data.error);
    })
    .catch(err => {
        console.log(err);
        alert("Signup Error");
    });
}
