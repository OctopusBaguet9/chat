import { createClient } from "https://esm.sh/@supabase/supabase-js";

const SUPABASE_URL = "https://dftzcennqaxapouuvgil.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRmdHpjZW5ucWF4YXBvdXV2Z2lsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkwMDY2NjYsImV4cCI6MjEwNDU4MjY2Nn0.Fzg9PiCBOgagQb8JUuPRUcFU1pdAtKPdSrwXZJbcWUs";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const chatBox = document.getElementById("chat-box");
const chatForm = document.getElementById("chat-form");
const usernameInput = document.getElementById("username-input");
const messageInput = document.getElementById("message-input");
const imageInput = document.getElementById("image-input");
const fileLabelText = document.getElementById("file-label-text");

let oldestLoadedMessage = null;
const PAGE_SIZE = 40;
let isThrottled = false;

// --- UNIQUE USER ID SETUP ---
if (!localStorage.getItem("chat_user_id")) {
    localStorage.setItem("chat_user_id", crypto.randomUUID());
}
const MY_USER_ID = localStorage.getItem("chat_user_id");

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
    messageInput.placeholder = "You have been banned from this chat by the admin for being dumb";
    const submitBtn = chatForm.querySelector("button[type='submit']");
    if (submitBtn) submitBtn.disabled = true;
}

// Visual confirmation when an image file is queued up
imageInput.addEventListener("change", () => {
    if (imageInput.files.length > 0) {
        fileLabelText.textContent = "✅";
    } else {
        fileLabelText.textContent = "📷";
    }
});

messageInput.addEventListener('input', (event) => {
    const element = event.target;
    const limit = parseInt(element.getAttribute('data-maxlength'), 10);
    if (element.value.length > limit) {
        element.value = element.value.slice(0, limit);
    }
});

if (localStorage.getItem("chat_username")) {
    usernameInput.value = localStorage.getItem("chat_username");
}

function isAtBottom() {
    return chatBox.scrollTop + chatBox.clientHeight >= chatBox.scrollHeight - 10;
}

function formatTime(isoString) {
    if (!isoString) return "";
    const date = new Date(isoString);
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Updated UI generation to optionally append an image element if an image url exists
function createMessageMarkup(msg) {
    const msgElement = document.createElement("div");
    msgElement.classList.add("message");

    const usernameSpan = document.createElement("span");
    usernameSpan.classList.add("username");
    usernameSpan.textContent = msg.username;
    usernameSpan.title = `User ID: ${msg.user_id || 'Legacy User'}`;
    msgElement.appendChild(usernameSpan);

    if (msg.text) {
        const textSpan = document.createElement("span");
        textSpan.classList.add("text");
        textSpan.textContent = msg.text;
        msgElement.appendChild(textSpan);
    }

    // Render image element if it exists in the message payload
    if (msg.image_url) {
        const imgElement = document.createElement("img");
        imgElement.src = msg.image_url;
        imgElement.classList.add("chat-image");
        imgElement.alt = "Uploaded chat asset";
        imgElement.onclick = () => window.open(msg.image_url, '_blank'); // Click to expand image
        msgElement.appendChild(imgElement);
    }

    const timeSpan = document.createElement("span");
    timeSpan.classList.add("timestamp");
    timeSpan.textContent = formatTime(msg.created_at);
    msgElement.appendChild(timeSpan);

    return msgElement;
}

function appendMessage(msg, { prepend = false } = {}) {
    const msgElement = createMessageMarkup(msg);
    if (prepend) {
        chatBox.insertBefore(msgElement, chatBox.firstChild);
    } else {
        chatBox.appendChild(msgElement);
    }
}

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
    setTimeout(() => { isThrottled = false; }, 500);
}

chatBox.addEventListener("scroll", () => {
    if (chatBox.scrollTop <= 5) {
        loadOlderMessages();
    }
});

function subscribeToMessages() {
    supabase
        .channel("public:messages")
        .on(
            "postgres_changes",
            { event: "INSERT", schema: "public", table: "messages" },
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

chatForm.addEventListener("submit", async e => {
    e.preventDefault();
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

    // Execute upload logic to Supabase storage if a file is present
    if (file) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${crypto.randomUUID()}.${fileExt}`;
        const filePath = `${fileName}`;

        const { error: uploadError } = await supabase.storage
            .from('chat-images')
            .upload(filePath, file);

        if (uploadError) {
            console.error("Error uploading image:", uploadError);
            alert("Failed to upload image. Please try again.");
            return;
        }

        // Generate and collect the public asset link
        const { data: publicUrlData } = supabase.storage
            .from('chat-images')
            .getPublicUrl(filePath);

        image_url = publicUrlData.publicUrl;
    }

    // Save final payload record inside database 
    const { error } = await supabase
        .from("messages")
        .insert([{ username, text, user_id: MY_USER_ID, image_url }]);

    if (error) {
        console.error("Error sending message:", error);
        if (error.code === "42501" || error.message.includes("policy")) {
            handleBanUI();
            alert("Your message was rejected. That's because you are banned, so stop changing the html code. You think your smart, but your not, really");
        } else {
            alert("Failed to send message. Please try again.");
        }
    } else {
        // Clear UI states back to baseline
        messageInput.value = "";
        imageInput.value = "";
        fileLabelText.textContent = "📷";
    }
});

async function init() {
    const isUserBanned = await checkIfBanned();
    if (isUserBanned) {
        handleBanUI();
    }
    await fetchInitialMessages();
    subscribeToMessages();
}

init();
