import { createClient } from "https://esm.sh/@supabase/supabase-js";

const SUPABASE_URL = "https://dftzcennqaxapouuvgil.supabase.co";
// NOTE: For production, secure your anon key and configure proper RLS rules
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRmdHpjZW5ucWF4YXBvdXV2Z2lsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkwMDY2NjYsImV4cCI6MjEwNDU4MjY2Nn0.Fzg9PiCBOgagQb8JUuPRUcFU1pdAtKPdSrwXZJbcWUs";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const chatBox = document.getElementById("chat-box");
const chatForm = document.getElementById("chat-form");
const usernameInput = document.getElementById("username-input");
const messageInput = document.getElementById("message-input");

let oldestLoadedMessage = null;
const PAGE_SIZE = 40;
let isThrottled = false;

// --- UNIQUE USER ID SETUP ---
// Generates a permanent unique ID for this browser if it doesn't already exist
if (!localStorage.getItem("chat_user_id")) {
    localStorage.setItem("chat_user_id", crypto.randomUUID());
}
const MY_USER_ID = localStorage.getItem("chat_user_id");

// Helper function to check if this user ID is marked as banned in Supabase
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
    return !!data; // Returns true if a record exists
}

// Disable UI interactions if user is banned
function handleBanUI() {
    messageInput.disabled = true;
    usernameInput.disabled = true;
    messageInput.placeholder = "You have been banned from this chat by the admin for being dumb";
    const submitBtn = chatForm.querySelector("button[type='submit']");
    if (submitBtn) submitBtn.disabled = true;
}
// -----------------------------

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
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' +
           date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Updated UI to explicitly show the unique ID on hover or text next to the name
function createMessageMarkup(msg) {
    const msgElement = document.createElement("div");
    msgElement.classList.add("message");

    const usernameSpan = document.createElement("span");
    usernameSpan.classList.add("username");
    // Displays Username and provides the ID inside a title tag (visible on hover)
    usernameSpan.textContent = msg.username;
    usernameSpan.title = `User ID: ${msg.user_id || 'Legacy User'}`;

    // Visual indicator of their unique ID for reporting purposes
    /*
    const idSpan = document.createElement("span");
    idSpan.style.fontSize = "0.65rem";
    idSpan.style.color = "var(--text-muted)";
    idSpan.style.marginBottom = "4px";
    idSpan.textContent = `ID: ${msg.user_id ? msg.user_id.substring(0, 8) : '????'}...`;
    idSpan.title = `Full ID: ${msg.user_id}`;
    */

    const textSpan = document.createElement("span");
    textSpan.classList.add("text");
    textSpan.textContent = msg.text;

    const timeSpan = document.createElement("span");
    timeSpan.classList.add("timestamp");
    timeSpan.textContent = formatTime(msg.created_at);

    msgElement.appendChild(usernameSpan);
    // msgElement.appendChild(idSpan);
    msgElement.appendChild(textSpan);
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
    if (!username || !text) return;

    // 1. Force a strict local check before hitting the network
    const isUserBanned = await checkIfBanned();
    if (isUserBanned) {
        handleBanUI();
        alert("You cannot send messages because you have been banned, idiot");
        return;
    }

    localStorage.setItem("chat_username", username);

    // 2. Attempt insert (Supabase RLS will catch it here if they try to bypass the UI)
    const { error } = await supabase
        .from("messages")
        .insert([{ username, text, user_id: MY_USER_ID }]);

    if (error) {
        console.error("Error sending message:", error);
        
        // If Supabase RLS policy blocked the insert, trigger the ban UI
        if (error.code === "42501" || error.message.includes("policy")) {
            handleBanUI();
            alert("Your message was rejected. That's because you are banned, so stop changing the html code. You think your smart, but your not, really");
        } else {
            alert("Failed to send message. Please try again.");
        }
    } else {
        messageInput.value = "";
    }
});


// Run initialization steps
async function init() {
    const isUserBanned = await checkIfBanned();
    if (isUserBanned) {
        handleBanUI();
    }
    await fetchInitialMessages();
    subscribeToMessages();
}

init();
