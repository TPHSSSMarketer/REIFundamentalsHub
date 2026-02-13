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
    const dealForm = $("#dealForm");
    const dealResult = $("#dealResult");

    // ── View Titles ─────────────────────────────────────────────────────
    const VIEW_TITLES = {
        chat: "Chat with Helm",
        portfolio: "Portfolio",
        deals: "Deal Analyzer",
        tasks: "Tasks",
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

            // Load data for the view
            if (view === "portfolio") loadPortfolio();

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
        state.conversationId = null;
        chatMessages.innerHTML = `
            <div class="welcome-message">
                <div class="welcome-icon">
                    <svg viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="14" stroke="currentColor" stroke-width="2"/><path d="M16 6 L16 26 M10 12 L16 6 L22 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </div>
                <h2>Welcome to Helm</h2>
                <p>Your AI-powered command center for business and life.</p>
                <div class="quick-actions">
                    <button class="quick-action" data-prompt="Give me my daily briefing">Daily Briefing</button>
                    <button class="quick-action" data-prompt="Show me my portfolio overview">Portfolio Overview</button>
                    <button class="quick-action" data-prompt="Help me analyze a new deal">Analyze a Deal</button>
                    <button class="quick-action" data-prompt="What are my priorities today?">Today's Priorities</button>
                </div>
            </div>`;
        bindQuickActions();
        chatInput.focus();
    });

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

    // ── Portfolio ───────────────────────────────────────────────────────
    async function loadPortfolio() {
        try {
            const res = await fetch(`${API_BASE}/portfolio`);
            const data = await res.json();

            if (data.total_properties > 0) {
                $("#statProperties").textContent = data.total_properties;
                $("#statValue").textContent = `$${(data.total_value || 0).toLocaleString()}`;
                $("#statIncome").textContent = `$${(data.total_monthly_income || 0).toLocaleString()}/mo`;
                $("#statCapRate").textContent = data.average_cap_rate
                    ? `${data.average_cap_rate.toFixed(1)}%`
                    : "--";
                $("#portfolioPlaceholder").style.display = "none";
            }
        } catch {
            // Integration not connected — show placeholder
        }
    }

    // ── Deal Analyzer ───────────────────────────────────────────────────
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
            dealResult.textContent = "Unable to reach the server. Make sure Helm is running.";
            dealResult.classList.remove("hidden");
        } finally {
            btn.disabled = false;
            btn.textContent = "Analyze Deal";
        }
    });

    // ── Tasks (simple add via prompt) ───────────────────────────────────
    const addTaskBtn = $("#addTaskBtn");
    if (addTaskBtn) {
        addTaskBtn.addEventListener("click", () => {
            // Switch to chat and pre-fill
            $$(".nav-item").forEach((b) => b.classList.remove("active"));
            $('[data-view="chat"]').classList.add("active");
            $$(".view").forEach((v) => v.classList.remove("active"));
            $("#view-chat").classList.add("active");
            viewTitle.textContent = VIEW_TITLES.chat;

            chatInput.value = "Help me create a task list for today.";
            chatInput.focus();
        });
    }
})();
