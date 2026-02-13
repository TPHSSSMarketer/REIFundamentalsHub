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
    const dealForm = $("#dealForm");
    const dealResult = $("#dealResult");

    // ── View Titles ─────────────────────────────────────────────────────
    const VIEW_TITLES = {
        chat: "Chat with Grace",
        agents: "AI Agents",
        integrations: "Integrations",
        settings: "Settings",
    };

    // ── Navigation ──────────────────────────────────────────────────────
    $$(".nav-item").forEach((btn) => {
        btn.addEventListener("click", () => {
            const view = btn.dataset.view;

            $$(".nav-item").forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");

            $$(".view").forEach((v) => v.classList.remove("active"));
            const viewEl = $(`#view-${view}`);
            if (viewEl) viewEl.classList.add("active");

            viewTitle.textContent = VIEW_TITLES[view] || "Helm";

            // Load data for the view
            if (view === "agents") loadAgents();
            if (view === "integrations") loadIntegrations();
            if (view === "settings") loadSettings();

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
        applyTheme(next);
    });

    function applyTheme(theme) {
        document.documentElement.setAttribute("data-theme", theme);
        localStorage.setItem("helm-theme", theme);
        const sel = $("#settingsTheme");
        if (sel) sel.value = theme;
    }

    // Restore saved theme
    const savedTheme = localStorage.getItem("helm-theme");
    if (savedTheme) applyTheme(savedTheme);

    // Settings theme selector sync
    const settingsTheme = $("#settingsTheme");
    if (settingsTheme) {
        settingsTheme.value = document.documentElement.getAttribute("data-theme") || "dark";
        settingsTheme.addEventListener("change", () => applyTheme(settingsTheme.value));
    }

    // ── Mode Selection ──────────────────────────────────────────────────
    modeSelect.addEventListener("change", () => {
        state.mode = modeSelect.value;
        localStorage.setItem("helm-mode", state.mode);
    });

    // ── Dynamic Mode Loading ────────────────────────────────────────────
    async function loadModes() {
        try {
            const res = await fetch(`${API_BASE}/modes`);
            const data = await res.json();
            const modes = data.modes || [];

            modeSelect.innerHTML = modes
                .map((m) => `<option value="${m.id}">${m.label}</option>`)
                .join("");

            // Restore saved mode
            const saved = localStorage.getItem("helm-mode");
            if (saved && modes.some((m) => m.id === saved)) {
                modeSelect.value = saved;
                state.mode = saved;
            } else if (modes.length > 0) {
                state.mode = modes[0].id;
            }
        } catch {
            // Fallback: hardcoded modes
            modeSelect.innerHTML = `
                <option value="business">Business</option>
                <option value="personal">Personal</option>`;
        }
    }

    loadModes();

    // ── New Chat ────────────────────────────────────────────────────────
    newChatBtn.addEventListener("click", () => startNewChat());

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

        const welcome = chatMessages.querySelector(".welcome-message");
        if (welcome) welcome.remove();

        appendMessage("user", text);
        chatInput.value = "";
        chatInput.style.height = "auto";

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

            chatHistoryList.querySelectorAll(".chat-history-item").forEach((btn) => {
                btn.addEventListener("click", () => {
                    loadConversation(btn.dataset.conversationId);
                });
            });
        } catch (err) {
            // Silently fail
        }
    }

    async function loadConversation(conversationId) {
        if (state.isLoading) return;

        try {
            const res = await fetch(`${API_BASE}/chat/${conversationId}`);
            const data = await res.json();

            state.conversationId = conversationId;

            chatMessages.innerHTML = "";
            (data.messages || []).forEach((msg) => {
                appendMessage(msg.role, msg.content);
            });

            highlightActiveConversation(conversationId);
            chatInput.focus();
            sidebar.classList.remove("open");
        } catch (err) {
            // Stay on current chat
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

        return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    }

    refreshChatHistory();

    // ═════════════════════════════════════════════════════════════════════
    // ── Agents Page ─────────────────────────────────────────────────────
    // ═════════════════════════════════════════════════════════════════════

    const SCOPE_ICONS = {
        project: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/></svg>`,
        personal: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
    };

    async function loadAgents() {
        const grid = $("#agentsGrid");
        if (!grid) return;

        try {
            const res = await fetch(`${API_BASE}/agents`);
            const data = await res.json();
            const agents = data.agents || [];

            if (agents.length === 0) {
                grid.innerHTML = `<div class="empty-state">No agents available.</div>`;
                return;
            }

            grid.innerHTML = agents
                .map((a) => {
                    const icon = SCOPE_ICONS[a.scope] || SCOPE_ICONS.project;
                    const pluginBadge = a.requires_plugins?.length
                        ? `<span class="badge badge-plugin">${a.requires_plugins[0]}</span>`
                        : "";
                    return `
                        <div class="agent-card">
                            <div class="agent-card-header">
                                <div class="agent-card-icon">${icon}</div>
                                <div>
                                    <div class="agent-card-name">${escapeHtml(a.name)}</div>
                                    <div class="agent-card-scope">${escapeHtml(a.scope)} ${pluginBadge}</div>
                                </div>
                            </div>
                            <p class="agent-card-desc">${escapeHtml(a.description)}</p>
                        </div>`;
                })
                .join("");
        } catch {
            grid.innerHTML = `<div class="empty-state">Could not load agents. Is the backend running?</div>`;
        }
    }

    // ═════════════════════════════════════════════════════════════════════
    // ── Integrations Page ───────────────────────────────────────────────
    // ═════════════════════════════════════════════════════════════════════

    async function loadIntegrations() {
        const backendsGrid = $("#backendsGrid");
        const intGrid = $("#integrationsGrid");
        const plugGrid = $("#pluginsGrid");

        // AI Backends
        try {
            const res = await fetch(`${API_BASE}/system/info`);
            const data = await res.json();
            const backends = data.backends || {};
            const activeBackend = data.ai_backend || "";

            if (backendsGrid) {
                backendsGrid.innerHTML = Object.entries(backends)
                    .map(([key, b]) => {
                        const isActive = activeBackend === key;
                        const statusClass = b.configured ? "status-ok" : "status-off";
                        const statusText = b.configured
                            ? isActive ? "Active" : "Ready"
                            : "Not configured";
                        return `
                            <div class="integration-card${isActive ? " integration-active" : ""}">
                                <div class="integration-card-header">
                                    <div class="integration-card-name">${escapeHtml(b.label)}</div>
                                    <span class="status-dot ${statusClass}"></span>
                                </div>
                                <div class="integration-card-status">${statusText}</div>
                                ${b.model ? `<div class="integration-card-detail">Model: ${escapeHtml(b.model)}</div>` : ""}
                            </div>`;
                    })
                    .join("");
            }
        } catch {
            if (backendsGrid) backendsGrid.innerHTML = `<div class="empty-state">Could not load backend info.</div>`;
        }

        // Service Integrations
        try {
            const res = await fetch(`${API_BASE}/integrations`);
            const data = await res.json();
            const integrations = data.integrations || data.active || [];

            if (intGrid) {
                if (Array.isArray(integrations) && integrations.length > 0) {
                    intGrid.innerHTML = integrations
                        .map((name) => `
                            <div class="integration-card">
                                <div class="integration-card-header">
                                    <div class="integration-card-name">${escapeHtml(String(name))}</div>
                                    <span class="status-dot status-ok"></span>
                                </div>
                                <div class="integration-card-status">Connected</div>
                            </div>`)
                        .join("");
                } else if (typeof integrations === "object") {
                    // Status report format: { active: [...], inactive: [...] }
                    const active = data.active || [];
                    const inactive = data.inactive || [];
                    const all = [
                        ...active.map((n) => ({ name: n, active: true })),
                        ...inactive.map((n) => ({ name: n, active: false })),
                    ];
                    if (all.length === 0) {
                        intGrid.innerHTML = `<div class="empty-state">No integrations registered.</div>`;
                    } else {
                        intGrid.innerHTML = all
                            .map((i) => `
                                <div class="integration-card">
                                    <div class="integration-card-header">
                                        <div class="integration-card-name">${escapeHtml(i.name)}</div>
                                        <span class="status-dot ${i.active ? "status-ok" : "status-off"}"></span>
                                    </div>
                                    <div class="integration-card-status">${i.active ? "Connected" : "Not configured"}</div>
                                </div>`)
                            .join("");
                    }
                } else {
                    intGrid.innerHTML = `<div class="empty-state">No integrations registered.</div>`;
                }
            }
        } catch {
            if (intGrid) intGrid.innerHTML = `<div class="empty-state">Could not load integrations.</div>`;
        }

        // Plugins
        try {
            const res = await fetch(`${API_BASE}/plugins`);
            const data = await res.json();
            const plugins = data.plugins || [];

            if (plugGrid) {
                if (plugins.length === 0) {
                    plugGrid.innerHTML = `<div class="empty-state">No plugins loaded.</div>`;
                } else {
                    plugGrid.innerHTML = plugins
                        .map((p) => `
                            <div class="integration-card">
                                <div class="integration-card-header">
                                    <div class="integration-card-name">${escapeHtml(p.name || p)}</div>
                                    <span class="status-dot status-ok"></span>
                                </div>
                                <div class="integration-card-status">v${escapeHtml(p.version || "1.0")}</div>
                                ${p.description ? `<div class="integration-card-detail">${escapeHtml(p.description)}</div>` : ""}
                            </div>`)
                        .join("");
                }
            }
        } catch {
            if (plugGrid) plugGrid.innerHTML = `<div class="empty-state">Could not load plugins.</div>`;
        }
    }

    // ═════════════════════════════════════════════════════════════════════
    // ── Settings Page ───────────────────────────────────────────────────
    // ═════════════════════════════════════════════════════════════════════

    async function loadSettings() {
        loadSettingsModes();
        loadSettingsStyles();
        loadSettingsSystem();
    }

    async function loadSettingsModes() {
        const container = $("#settingsModes");
        if (!container) return;

        try {
            const res = await fetch(`${API_BASE}/modes`);
            const data = await res.json();
            const modes = data.modes || [];

            container.innerHTML = modes
                .map((m) => {
                    const isActive = state.mode === m.id;
                    const sourceBadge = m.source === "plugin"
                        ? `<span class="badge badge-plugin">plugin</span>`
                        : "";
                    return `
                        <button class="option-card${isActive ? " option-active" : ""}"
                                data-mode-id="${escapeHtml(m.id)}">
                            <div class="option-card-header">
                                <div class="option-card-name">${escapeHtml(m.label)} ${sourceBadge}</div>
                                ${isActive ? '<span class="badge badge-active">Active</span>' : ""}
                            </div>
                            <div class="option-card-desc">${escapeHtml(m.description)}</div>
                        </button>`;
                })
                .join("");

            container.querySelectorAll(".option-card").forEach((btn) => {
                btn.addEventListener("click", () => {
                    const modeId = btn.dataset.modeId;
                    state.mode = modeId;
                    modeSelect.value = modeId;
                    localStorage.setItem("helm-mode", modeId);
                    loadSettingsModes(); // re-render to update active state
                });
            });
        } catch {
            container.innerHTML = `<div class="empty-state">Could not load modes.</div>`;
        }
    }

    async function loadSettingsStyles() {
        const container = $("#settingsStyles");
        if (!container) return;

        try {
            const res = await fetch(`${API_BASE}/output-styles`);
            const data = await res.json();
            const styles = data.styles || [];

            const savedStyle = localStorage.getItem("helm-style") || "default";

            container.innerHTML = styles
                .map((s) => {
                    const isActive = savedStyle === s.id;
                    const sourceBadge = s.source === "plugin"
                        ? `<span class="badge badge-plugin">plugin</span>`
                        : "";
                    return `
                        <button class="option-card${isActive ? " option-active" : ""}"
                                data-style-id="${escapeHtml(s.id)}">
                            <div class="option-card-header">
                                <div class="option-card-name">${escapeHtml(s.label)} ${sourceBadge}</div>
                                ${isActive ? '<span class="badge badge-active">Active</span>' : ""}
                            </div>
                            <div class="option-card-desc">${escapeHtml(s.description)}</div>
                        </button>`;
                })
                .join("");

            container.querySelectorAll(".option-card").forEach((btn) => {
                btn.addEventListener("click", () => {
                    localStorage.setItem("helm-style", btn.dataset.styleId);
                    loadSettingsStyles();
                });
            });
        } catch {
            container.innerHTML = `<div class="empty-state">Could not load styles.</div>`;
        }
    }

    async function loadSettingsSystem() {
        const container = $("#settingsSystem");
        if (!container) return;

        try {
            const res = await fetch(`${API_BASE}/system/info`);
            const data = await res.json();

            const rows = [
                ["AI Backend", data.ai_backend || "unknown"],
                ["Environment", data.app_env || "production"],
                ["Debug Mode", data.debug ? "On" : "Off"],
            ];

            container.innerHTML = rows
                .map(([label, value]) => `
                    <div class="settings-row">
                        <div class="settings-row-label">${escapeHtml(label)}</div>
                        <div class="settings-row-value">${escapeHtml(value)}</div>
                    </div>`)
                .join("");
        } catch {
            container.innerHTML = `<div class="empty-state">Could not load system info.</div>`;
        }
    }

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
