
import { createClient } from "https://esm.sh/@supabase/supabase-js";

// ========================================
// SUPABASE CONFIGURATION
// ========================================

const SUPABASE_URL = "https://dftzcennqaxapouuvgil.supabase.co";

const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRmdHpjZW5ucWF4YXBvdXV2Z2lsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkwMDY2NjYsImV4cCI6MjEwNDU4MjY2Nn0.Fzg9PiCBOgagQb8JUuPRUcFU1pdAtKPdSrwXZJbcWUs";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ========================================
// HTML ELEMENTS
// ========================================

const chatBox = document.getElementById("chat-box");
const chatForm = document.getElementById("chat-form");
const usernameInput = document.getElementById("username-input");
const messageInput = document.getElementById("message-input");
const imageInput = document.getElementById("image-input");
const fileLabelText = document.getElementById("file-label-text");
const typingIndicator = document.getElementById("typing-indicator");

let oldestLoadedMessage = null;

const PAGE_SIZE = 40;

let isThrottled = false;

// ========================================
// UNIQUE USER ID SETUP
// ========================================

if (!localStorage.getItem("chat_user_id")) {
    localStorage.setItem("chat_user_id", crypto.randomUUID());
}

const MY_USER_ID = localStorage.getItem("chat_user_id");

// ========================================
// BAN SYSTEM
// ========================================

async function checkIfBanned() {
    const { data, error } = await supabase
        .from("banned_users")
        .select("id")
        .eq("id", MY_USER_ID)
        .maybeSingle();

    if (error) {
        console.error("Error checking ban status:", error);
        return false;
    }

    return !!data;
}

function handleBanUI() {
    messageInput.disabled = true;
    usernameInput.disabled = true;
    imageInput.disabled = true;

    messageInput.placeholder =
        "You have been banned from this chat by the admin for being dumb";

    const submitBtn = chatForm.querySelector("button[type='submit']");

    if (submitBtn) {
        submitBtn.disabled = true;
    }
}

// ========================================
// IMAGE PICKER
// ========================================

imageInput.addEventListener("change", () => {
    if (imageInput.files.length > 0) {
        fileLabelText.textContent = "✅";
    } else {
        fileLabelText.textContent = "📷";
    }
});

// ========================================
// MESSAGE LENGTH LIMIT
// ========================================

messageInput.addEventListener("input", (event) => {
    const element = event.target;

    const limit = parseInt(
        element.getAttribute("data-maxlength"),
        10
    );

    if (element.value.length > limit) {
        element.value = element.value.slice(0, limit);
    }
});

// ========================================
// RESTORE USERNAME
// ========================================

if (localStorage.getItem("chat_username")) {
    usernameInput.value = localStorage.getItem("chat_username");
}

// ========================================
// CHAT HELPERS
// ========================================

function isAtBottom() {
    return chatBox.scrollTop + chatBox.clientHeight >=
        chatBox.scrollHeight - 10;
}

function formatTime(isoString) {
    if (!isoString) return "";

    const date = new Date(isoString);

    return date.toLocaleDateString([], {
        month: "short",
        day: "numeric"
    }) + " " + date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit"
    });
}

// ========================================
// CREATE MESSAGE HTML
// ========================================

function createMessageMarkup(msg) {
    const msgElement = document.createElement("div");

    msgElement.classList.add("message");

    const usernameSpan = document.createElement("span");

    usernameSpan.classList.add("username");

    usernameSpan.textContent = msg.username;

    usernameSpan.title = `User ID: ${msg.user_id || "Legacy User"}`;

    msgElement.appendChild(usernameSpan);

    if (msg.text) {
        const textSpan = document.createElement("span");

        textSpan.classList.add("text");

        textSpan.textContent = msg.text;

        msgElement.appendChild(textSpan);
    }

    // Render uploaded image

    if (msg.image_url) {
        const imgElement = document.createElement("img");

        imgElement.src = msg.image_url;

        imgElement.classList.add("chat-image");

        imgElement.alt = "Uploaded chat asset";

        imgElement.onclick = () => {
            window.open(msg.image_url, "_blank");
        };

        msgElement.appendChild(imgElement);
    }

    const timeSpan = document.createElement("span");

    timeSpan.classList.add("timestamp");

    timeSpan.textContent = formatTime(msg.created_at);

    msgElement.appendChild(timeSpan);

    return msgElement;
}

// ========================================
// APPEND MESSAGE
// ========================================

function appendMessage(msg, { prepend = false } = {}) {
    const msgElement = createMessageMarkup(msg);

    if (prepend) {
        chatBox.insertBefore(msgElement, chatBox.firstChild);
    } else {
        chatBox.appendChild(msgElement);
    }
}

// ========================================
// FETCH INITIAL MESSAGES
// ========================================

async function fetchInitialMessages() {
    const { data, error } = await supabase
        .from("messages")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE);

    if (error) {
        console.error("Error fetching messages:", error);
        return;
    }

    if (data.length > 0) {
        data.reverse().forEach(msg => appendMessage(msg));

        oldestLoadedMessage = data[0].created_at;
    }

    chatBox.scrollTop = chatBox.scrollHeight;
}

// ========================================
// LOAD OLDER MESSAGES
// ========================================

async function loadOlderMessages() {
    if (!oldestLoadedMessage || isThrottled) return;

    isThrottled = true;

    const { data, error } = await supabase
        .from("messages")
        .select("*")
        .lt("created_at", oldestLoadedMessage)
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE);

    if (error) {
        console.error("Error loading older messages:", error);

        isThrottled = false;

        return;
    }

    if (data.length === 0) {
        isThrottled = false;
        return;
    }

    data.reverse();

    const oldHeight = chatBox.scrollHeight;

    const fragment = document.createDocumentFragment();

    for (const msg of data) {
        fragment.appendChild(createMessageMarkup(msg));
    }

    chatBox.insertBefore(fragment, chatBox.firstChild);

    oldestLoadedMessage = data[0].created_at;

    chatBox.scrollTop = chatBox.scrollHeight - oldHeight;

    setTimeout(() => {
        isThrottled = false;
    }, 500);
}

chatBox.addEventListener("scroll", () => {
    if (chatBox.scrollTop <= 5) {
        loadOlderMessages();
    }
});

// ========================================
// REALTIME MESSAGE SUBSCRIPTION
// ========================================

function subscribeToMessages() {
    supabase
        .channel("public:messages")
        .on(
            "postgres_changes",
            {
                event: "INSERT",
                schema: "public",
                table: "messages"
            },
            payload => {
                const shouldScroll = isAtBottom();

                appendMessage(payload.new);

                if (shouldScroll) {
                    chatBox.scrollTop = chatBox.scrollHeight;
                }
            }
        )
        .subscribe();
}

// ========================================
// TYPING INDICATOR SYSTEM
// ========================================

// Users currently typing
const typingUsers = new Map();

// Typing configuration
const TYPING_TIMEOUT = 2000;
const TYPING_EXPIRY = 3000;
const TYPING_BROADCAST_INTERVAL = 1000;

// Typing state
let typingTimeout = null;
let lastTypingBroadcast = 0;
let typingSubscribed = false;
let isTyping = false;

// Separate Supabase Realtime channel
const typingChannel = supabase.channel("public-chat-typing", {
    config: {
        broadcast: {
            self: false
        }
    }
});

// ========================================
// UPDATE TYPING INDICATOR UI
// ========================================

function updateTypingIndicator() {
    const now = Date.now();

    // Remove expired users
    for (const [userId, user] of typingUsers) {
        if (now - user.lastSeen > TYPING_EXPIRY) {
            typingUsers.delete(userId);
        }
    }

    const usernames = [...typingUsers.values()]
        .map(user => user.username);

    // Nobody typing
    if (usernames.length === 0) {
        typingIndicator.textContent = "";
        return;
    }

    let text;

    if (usernames.length === 1) {
        text = `${usernames[0]} is typing`;
    } else if (usernames.length === 2) {
        text = `${usernames[0]} and ${usernames[1]} are typing`;
    } else {
        text = `${usernames.length} people are typing`;
    }

    // Create UI safely
    typingIndicator.textContent = "";

    const label = document.createElement("span");

    label.textContent = text;

    const dots = document.createElement("span");

    dots.className = "typing-dots";

    for (let i = 0; i < 3; i++) {
        const dot = document.createElement("span");

        dots.appendChild(dot);
    }

    typingIndicator.appendChild(label);

    typingIndicator.appendChild(dots);
}

// ========================================
// RECEIVE TYPING BROADCASTS
// ========================================

function subscribeToTyping() {
    typingChannel
        .on(
            "broadcast",
            {
                event: "typing"
            },
            ({ payload }) => {

                if (!payload) return;

                // Ignore our own user ID
                if (payload.user_id === MY_USER_ID) {
                    return;
                }

                if (!payload.user_id || !payload.username) {
                    return;
                }

                if (payload.is_typing) {

                    typingUsers.set(payload.user_id, {
                        username: payload.username,
                        lastSeen: Date.now()
                    });

                } else {

                    typingUsers.delete(payload.user_id);

                }

                updateTypingIndicator();
            }
        )
        .subscribe(status => {
            typingSubscribed = status === "SUBSCRIBED";
        });
}

// ========================================
// SEND TYPING BROADCAST
// ========================================

async function broadcastTyping(typing) {

    if (!typingSubscribed) return;

    const username = usernameInput.value.trim();

    if (!username) return;

    try {
        await typingChannel.send({
            type: "broadcast",
            event: "typing",
            payload: {
                user_id: MY_USER_ID,
                username: username,
                is_typing: typing
            }
        });
    } catch (error) {
        console.error("Typing broadcast error:", error);
    }
}

// ========================================
// HANDLE USER TYPING
// ========================================

function handleTyping() {

    const username = usernameInput.value.trim();

    // Don't broadcast if no username
    if (!username) {
        stopTyping();
        return;
    }

    // Empty message means stopped typing
    if (!messageInput.value.trim()) {
        stopTyping();
        return;
    }

    const now = Date.now();

    // Broadcast periodically while typing
    if (now - lastTypingBroadcast >= TYPING_BROADCAST_INTERVAL) {

        lastTypingBroadcast = now;

        if (!isTyping) {
            isTyping = true;
        }

        broadcastTyping(true);
    }

    // Reset inactivity timeout
    clearTimeout(typingTimeout);

    typingTimeout = setTimeout(() => {
        stopTyping();
    }, TYPING_TIMEOUT);
}

// ========================================
// STOP TYPING
// ========================================

function stopTyping() {

    clearTimeout(typingTimeout);

    typingTimeout = null;

    if (!isTyping) return;

    isTyping = false;

    broadcastTyping(false);
}

// Listen for message input
messageInput.addEventListener("input", handleTyping);

// ========================================
// CLEAN UP STALE TYPING USERS
// ========================================

setInterval(() => {
    updateTypingIndicator();
}, 1000);

// ========================================
// CHAT FORM SUBMISSION
// ========================================

chatForm.addEventListener("submit", async e => {

    e.preventDefault();

    // Immediately stop typing
    stopTyping();

    const username = usernameInput.value.trim();

    const text = messageInput.value.trim();

    const file = imageInput.files[0];

    // Block empty payload submissions
    if (!username || (!text && !file)) return;

    const isUserBanned = await checkIfBanned();

    if (isUserBanned) {
        handleBanUI();

        alert("You cannot send messages because you have been banned, idiot");

        return;
    }

    localStorage.setItem("chat_username", username);

    let image_url = null;

    // ====================================
    // IMAGE UPLOAD
    // ====================================

    if (file) {

        const fileExt = file.name.split(".").pop();

        const fileName = `${crypto.randomUUID()}.${fileExt}`;

        const filePath = `${fileName}`;

        const { error: uploadError } = await supabase.storage
            .from("chat-images")
            .upload(filePath, file);

        if (uploadError) {

            console.error("Error uploading image:", uploadError);

            alert("Failed to upload image. Please try again.");

            return;
        }

        // Generate public image URL
        const { data: publicUrlData } = supabase.storage
            .from("chat-images")
            .getPublicUrl(filePath);

        image_url = publicUrlData.publicUrl;
    }

    // ====================================
    // SAVE MESSAGE TO DATABASE
    // ====================================

    const { error } = await supabase
        .from("messages")
        .insert([
            {
                username,
                text,
                user_id: MY_USER_ID,
                image_url
            }
        ]);

    if (error) {

        console.error("Error sending message:", error);

        if (
            error.code === "42501" ||
            error.message.includes("policy")
        ) {

            handleBanUI();

            alert(
                "Your message was rejected. That's because you are banned, so stop changing the html code. You think your smart, but your not, really"
            );

        } else {

            alert("Failed to send message. Please try again.");

        }

    } else {

        // Reset UI
        messageInput.value = "";

        imageInput.value = "";

        fileLabelText.textContent = "📷";

        stopTyping();

    }

});

// ========================================
// INITIALIZE CHAT
// ========================================

async function init() {

    const isUserBanned = await checkIfBanned();

    if (isUserBanned) {
        handleBanUI();
    }

    await fetchInitialMessages();

    // Start message updates
    subscribeToMessages();

    // Start typing indicator
    subscribeToTyping();

}

init();
