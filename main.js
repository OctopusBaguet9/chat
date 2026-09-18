import { createClient } from "https://esm.sh/@supabase/supabase-js";

    const SUPABASE_URL = "https://dftzcennqaxapouuvgil.supabase.co";
    const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRmdHpjZW5ucWF4YXBvdXV2Z2lsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkwMDY2NjYsImV4cCI6MjEwNDU4MjY2Nn0.Fzg9PiCBOgagQb8JUuPRUcFU1pdAtKPdSrwXZJbcWUs";
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    const chatBox = document.getElementById("chat-box");
    const chatForm = document.getElementById("chat-form");
    const usernameInput = document.getElementById("username-input");
    const messageInput = document.getElementById("message-input");

    let oldestLoadedMessage = null;
    const PAGE_SIZE = 40;
    let isThrottled = false;

    messageInput.addEventListener('input', (event) => {
        const element = event.target;
        const limit = parseInt(element.getAttribute('data-maxlength'), 10);
        
        // If the entered text exceeds the character limit, slice it
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

    // Helper function to format timestamps cleanly
    function formatTime(isoString) {
        if (!isoString) return "";
        const date = new Date(isoString);
        return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + 
               date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    // Helper function to build HTML structure for a single message bubble
    function createMessageMarkup(msg) {
        const msgElement = document.createElement("div");
        msgElement.classList.add("message");

        const usernameSpan = document.createElement("span");
        usernameSpan.classList.add("username");
        usernameSpan.textContent = msg.username;

        const textSpan = document.createElement("span");
        textSpan.classList.add("text");
        textSpan.textContent = msg.text;

        const timeSpan = document.createElement("span");
        timeSpan.classList.add("timestamp");
        timeSpan.textContent = formatTime(msg.created_at);

        msgElement.appendChild(usernameSpan);
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

        localStorage.setItem("chat_username", username);

        const { error } = await supabase
            .from("messages")
            .insert([{ username, text }]);

        if (error) {
            console.error("Error sending message:", error);
            alert("Failed to send message.");
        } else {
            messageInput.value = "";
        }
    });

    fetchInitialMessages();
    subscribeToMessages();