/* ═══════════════════════════════════════════════════════════════════════════
   Helm AI Assistant — Frontend Application
   ═══════════════════════════════════════════════════════════════════════════ */

(function () {
    "use strict";

    // ── Configuration ───────────────────────────────────────────────────
    const API_BASE = "/api";

    // ── State ───────────────────────────────────────────────────────────
    const state = {
        conversationId: null,
        mode: "business",
        isLoading: false,
    };

    // ── DOM References ──────────────────────────────────────────────────
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    const chatMessages = $("#chatMessages");
    const chatInput = $("#chatInput");
    const sendBtn = $("#sendBtn");
    const modeSelect = $("#modeSelect");
    const viewTitle = $("#viewTitle");
    const sidebar = $("#sidebar");
    const menuToggle = $("#menuToggle");
    const themeToggle = $("#themeToggle");
    const newChatBtn = $("#newChat");
    const chatHistoryList = $("#chatHistoryList");
    const dealForm = $("#dealForm");      // null until RE plugin loaded
    const dealResult = $("#dealResult");  // null until RE plugin loaded

    // ── View Titles ─────────────────────────────────────────────────────
    const VIEW_TITLES = {
        chat: "Chat with Grace",
    };

    // ── Navigation ──────────────────────────────────────────────────────
    $$(".nav-item").forEach((btn) => {
        btn.addEventListener("click", () => {
            const view = btn.dataset.view;

            $$(".nav-item").forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");

            $$(".view").forEach((v) => v.classList.remove("active"));
            $(`#view-${view}`).classList.add("active");

            viewTitle.textContent = VIEW_TITLES[view] || "Helm";

            // Close mobile sidebar
            sidebar.classList.remove("open");
        });
    });

    // ── Mobile Menu ─────────────────────────────────────────────────────
    menuToggle.addEventListener("click", () => {
        sidebar.classList.toggle("open");
    });

    // ── Theme Toggle ────────────────────────────────────────────────────
    themeToggle.addEventListener("click", () => {
        const html = document.documentElement;
        const current = html.getAttribute("data-theme");
        const next = current === "dark" ? "light" : "dark";
        html.setAttribute("data-theme", next);
        localStorage.setItem("helm-theme", next);
    });

    // Restore saved theme
    const savedTheme = localStorage.getItem("helm-theme");
    if (savedTheme) document.documentElement.setAttribute("data-theme", savedTheme);

    // ── Mode Selection ──────────────────────────────────────────────────
    modeSelect.addEventListener("change", () => {
        state.mode = modeSelect.value;
    });

    // ── New Chat ────────────────────────────────────────────────────────
    newChatBtn.addEventListener("click", () => {
        startNewChat();
    });

    function startNewChat() {
        state.conversationId = null;
        chatMessages.innerHTML = `
            <div class="welcome-message">
                <div class="welcome-icon">
                    <svg viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="14" stroke="currentColor" stroke-width="2"/><path d="M16 6 L16 26 M10 12 L16 6 L22 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </div>
                <h2>Hey, I'm Grace</h2>
                <p>Your AI-powered command center for business and life.</p>
                <div class="quick-actions">
                    <button class="quick-action" data-prompt="Give me my daily briefing">Daily Briefing</button>
                    <button class="quick-action" data-prompt="What are my priorities today?">Today's Priorities</button>
                    <button class="quick-action" data-prompt="Help me brainstorm ideas">Brainstorm</button>
                    <button class="quick-action" data-prompt="What can you help me with?">What Can You Do?</button>
                </div>
            </div>`;
        bindQuickActions();
        highlightActiveConversation(null);
        chatInput.focus();
    }

    // ── Quick Actions ───────────────────────────────────────────────────
    function bindQuickActions() {
        $$(".quick-action").forEach((btn) => {
            btn.addEventListener("click", () => {
                chatInput.value = btn.dataset.prompt;
                sendMessage();
            });
        });
    }
    bindQuickActions();

    // ── Chat: Auto-resize textarea ──────────────────────────────────────
    chatInput.addEventListener("input", () => {
        chatInput.style.height = "auto";
        chatInput.style.height = Math.min(chatInput.scrollHeight, 150) + "px";
    });

    chatInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    sendBtn.addEventListener("click", sendMessage);

    // ── Chat: Send Message ──────────────────────────────────────────────
    async function sendMessage() {
        const text = chatInput.value.trim();
        if (!text || state.isLoading) return;

        state.isLoading = true;
        sendBtn.disabled = true;

        // Clear welcome screen on first message
        const welcome = chatMessages.querySelector(".welcome-message");
        if (welcome) welcome.remove();

        // Add user message
        appendMessage("user", text);
        chatInput.value = "";
        chatInput.style.height = "auto";

        // Show typing indicator
        const typingEl = showTyping();

        try {
            const res = await fetch(`${API_BASE}/chat`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    message: text,
                    mode: state.mode,
                    conversation_id: state.conversationId,
                }),
            });

            const data = await res.json();
            state.conversationId = data.conversation_id;

            typingEl.remove();
            appendMessage("assistant", data.reply);

            // Refresh the chat history sidebar
            refreshChatHistory();
        } catch (err) {
            typingEl.remove();
            appendMessage(
                "assistant",
                "Sorry, I couldn't reach the server. Please make sure the Helm backend is running."
            );
        } finally {
            state.isLoading = false;
            sendBtn.disabled = false;
            chatInput.focus();
        }
    }

    function appendMessage(role, content) {
        const div = document.createElement("div");
        div.className = `message ${role}`;

        const avatarContent =
            role === "user"
                ? "You"
                : `<svg viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="14" stroke="currentColor" stroke-width="2"/><path d="M16 6 L16 26 M10 12 L16 6 L22 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

        div.innerHTML = `
            <div class="message-avatar">${avatarContent}</div>
            <div class="message-body"><p>${escapeHtml(content)}</p></div>`;

        chatMessages.appendChild(div);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function showTyping() {
        const div = document.createElement("div");
        div.className = "message assistant";
        div.innerHTML = `
            <div class="message-avatar">
                <svg viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="14" stroke="currentColor" stroke-width="2"/><path d="M16 6 L16 26 M10 12 L16 6 L22 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </div>
            <div class="message-body">
                <div class="typing-indicator"><span></span><span></span><span></span></div>
            </div>`;
        chatMessages.appendChild(div);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        return div;
    }

    function escapeHtml(str) {
        const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
        return str.replace(/[&<>"']/g, (c) => map[c]);
    }

    // ── Chat History ────────────────────────────────────────────────────

    async function refreshChatHistory() {
        if (!chatHistoryList) return;

        try {
            const res = await fetch(`${API_BASE}/chat/history`);
            const data = await res.json();
            const convos = data.conversations || [];

            if (convos.length === 0) {
                chatHistoryList.innerHTML = `
                    <div class="chat-history-empty">No conversations yet</div>`;
                return;
            }

            chatHistoryList.innerHTML = convos
                .map((c) => {
                    const isActive = c.id === state.conversationId;
                    const timeStr = formatRelativeTime(c.updated_at);
                    return `
                        <button class="chat-history-item${isActive ? " active" : ""}"
                                data-conversation-id="${escapeHtml(c.id)}"
                                title="${escapeHtml(c.title)}">
                            <div class="chat-history-item-title">${escapeHtml(c.title)}</div>
                            <div class="chat-history-item-meta">
                                <span>${timeStr}</span>
                                <span>${c.message_count} msg${c.message_count !== 1 ? "s" : ""}</span>
                            </div>
                        </button>`;
                })
                .join("");

            // Bind click handlers
            chatHistoryList.querySelectorAll(".chat-history-item").forEach((btn) => {
                btn.addEventListener("click", () => {
                    loadConversation(btn.dataset.conversationId);
                });
            });
        } catch (err) {
            // Silently fail — sidebar history is non-critical
        }
    }

    async function loadConversation(conversationId) {
        if (state.isLoading) return;

        try {
            const res = await fetch(`${API_BASE}/chat/${conversationId}`);
            const data = await res.json();

            state.conversationId = conversationId;

            // Clear chat and render all messages
            chatMessages.innerHTML = "";
            (data.messages || []).forEach((msg) => {
                appendMessage(msg.role, msg.content);
            });

            highlightActiveConversation(conversationId);
            chatInput.focus();

            // Close mobile sidebar
            sidebar.classList.remove("open");
        } catch (err) {
            // If load fails, just stay on current chat
        }
    }

    function highlightActiveConversation(activeId) {
        if (!chatHistoryList) return;
        chatHistoryList.querySelectorAll(".chat-history-item").forEach((btn) => {
            btn.classList.toggle("active", btn.dataset.conversationId === activeId);
        });
    }

    function formatRelativeTime(isoString) {
        const date = new Date(isoString);
        const now = new Date();
        const diffMs = now - date;
        const diffMin = Math.floor(diffMs / 60000);
        const diffHr = Math.floor(diffMs / 3600000);

        if (diffMin < 1) return "just now";
        if (diffMin < 60) return `${diffMin}m ago`;
        if (diffHr < 24) return `${diffHr}h ago`;

        // Show date for older conversations
        return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    }

    // Load chat history on startup
    refreshChatHistory();

    // ── Deal Analyzer (only when RE plugin is loaded) ──────────────────
    if (dealForm) {
        dealForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const btn = dealForm.querySelector("button[type=submit]");
            btn.disabled = true;
            btn.textContent = "Analyzing...";
            dealResult.classList.add("hidden");

            try {
                const payload = {
                    address: $("#dealAddress").value,
                    purchase_price: parseFloat($("#dealPrice").value),
                    rehab_cost: parseFloat($("#dealRehab").value) || 0,
                    after_repair_value: parseFloat($("#dealARV").value) || null,
                    monthly_rent: parseFloat($("#dealRent").value) || null,
                    strategy: $("#dealStrategy").value,
                };

                const res = await fetch(`${API_BASE}/deal/analyze`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });

                const data = await res.json();
                dealResult.textContent = data.reply || JSON.stringify(data, null, 2);
                dealResult.classList.remove("hidden");
            } catch {
                dealResult.textContent = "Unable to reach the server.";
                dealResult.classList.remove("hidden");
            } finally {
                btn.disabled = false;
                btn.textContent = "Analyze Deal";
            }
        });
    }
})();
