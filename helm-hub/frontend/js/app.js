/* ═══════════════════════════════════════════════════════════════════════════
   Helm AI Assistant — Frontend Application
   ═══════════════════════════════════════════════════════════════════════════ */

(function () {
    "use strict";

    // ── Configuration ───────────────────────────────────────────────────
    const API_BASE = "/api";

    // ── Auth ─────────────────────────────────────────────────────────────
    function getApiKey() {
        return localStorage.getItem("helm-api-key") || "";
    }

    function setApiKey(key) {
        localStorage.setItem("helm-api-key", key);
    }

    function authHeaders() {
        const key = getApiKey();
        return key ? { "X-API-Key": key } : {};
    }

    /**
     * Wrapper around fetch that injects auth headers automatically.
     * If a 401 is returned, prompts for an API key and retries once.
     */
    async function apiFetch(url, options = {}) {
        const headers = { ...authHeaders(), ...(options.headers || {}) };
        const res = await fetch(url, { ...options, headers });

        if (res.status === 401) {
            const key = promptApiKey();
            if (key) {
                setApiKey(key);
                const retryHeaders = { ...authHeaders(), ...(options.headers || {}) };
                return fetch(url, { ...options, headers: retryHeaders });
            }
        }
        return res;
    }

    function promptApiKey() {
        const key = prompt(
            "Enter your Helm API Key to continue.\n\n" +
            "This is the API_KEYS value from your .env file."
        );
        if (key && key.trim()) {
            setApiKey(key.trim());
            return key.trim();
        }
        return null;
    }

    // Check auth on page load — attempt a lightweight call
    async function checkAuth() {
        const key = getApiKey();
        if (!key) {
            promptApiKey();
            return;
        }
        try {
            const res = await fetch(`${API_BASE}/modes`, { headers: authHeaders() });
            if (res.status === 401) {
                promptApiKey();
            }
        } catch {
            // Server may not be running — don't block the UI
        }
    }

    checkAuth();

    // ── Toast Utility ─────────────────────────────────────────────────
    function showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        if (!container) return;
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        container.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }

    // ── State ───────────────────────────────────────────────────────────
    const state = {
        conversationId: null,
        mode: "business",
        isLoading: false,
        monitoringInterval: null,
    };

    // ── DOM References ──────────────────────────────────────────────────
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    const chatMessages = $("#chatMessages");
    const chatInput = $("#chatInput");
    const sendBtn = $("#sendBtn");
    const modeSelect = $("#modeSelect");
    const viewTitle = $("#topbar-title");
    const sidebar = $("#sidebar");
    const menuToggle = $("#menuToggle");
    const themeToggle = $("#themeToggle");
    const newChatBtn = $("#newChat");
    const chatHistoryList = $("#chatHistoryList");
    const dealForm = $("#dealForm");
    const dealResult = $("#dealResult");

    // ── View Titles ─────────────────────────────────────────────────────
    const VIEW_TITLES = {
        chat: "Chat",
        deal: "Deal Analyzer",
        briefing: "Daily Briefing",
        agents: "Agents",
        integrations: "Integrations",
        monitoring: "Monitoring",
        settings: "Settings",
        account: "Account",
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
            if (view === "monitoring") loadMonitoring();
            if (view === "settings") loadSettings();
            if (view === "account") loadAccount();

            // Close mobile sidebar
            sidebar.classList.remove("open");

            // Stop monitoring auto-refresh when leaving the view
            if (view !== "monitoring") stopMonitoringAutoRefresh();
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
            const res = await apiFetch(`${API_BASE}/modes`);
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
                <h2>Your AI Command Center</h2>
                <p>Ask Helm anything — business strategy, deal analysis, daily briefings, or real estate decisions.</p>
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
            const res = await apiFetch(`${API_BASE}/chat`, {
                method: "POST",
                headers: { "Content-Type": "application/json", ...authHeaders() },
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
            const res = await apiFetch(`${API_BASE}/chat/history`);
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
            const res = await apiFetch(`${API_BASE}/chat/${conversationId}`);
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
            const res = await apiFetch(`${API_BASE}/agents`);
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

        // AI Backends
        try {
            const res = await apiFetch(`${API_BASE}/system/info`);
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
            const res = await apiFetch(`${API_BASE}/integrations`);
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
            // Fetch all modes — installed plugins contribute theirs
            const res = await apiFetch(`${API_BASE}/modes`);
            const data = await res.json();
            const modes = data.modes || [];

            container.innerHTML = modes
                .map((m) => {
                    const isActive = state.mode === m.id;
                    return `
                        <button class="option-card${isActive ? " option-active" : ""}"
                                data-mode-id="${escapeHtml(m.id)}">
                            <div class="option-card-header">
                                <div class="option-card-name">${escapeHtml(m.label)}</div>
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
            const res = await apiFetch(`${API_BASE}/output-styles`);
            const data = await res.json();
            const styles = data.styles || [];

            const savedStyle = localStorage.getItem("helm-style") || "default";

            container.innerHTML = styles
                .map((s) => {
                    const isActive = savedStyle === s.id;
                    return `
                        <button class="option-card${isActive ? " option-active" : ""}"
                                data-style-id="${escapeHtml(s.id)}">
                            <div class="option-card-header">
                                <div class="option-card-name">${escapeHtml(s.label)}</div>
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
            const res = await apiFetch(`${API_BASE}/system/info`);
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

    // ═════════════════════════════════════════════════════════════════════
    // ── Account Page ────────────────────────────────────────────────────
    // ═════════════════════════════════════════════════════════════════════

    async function loadAccount() {
        loadAccountPlan();
        loadBillingSection();
        loadPluginMarketplace();
    }

    async function loadAccountPlan() {
        const container = $("#accountPlan");
        if (!container) return;

        try {
            const res = await apiFetch(`${API_BASE}/account`);
            const data = await res.json();

            const planLabels = { base: "Base", pro: "Pro", enterprise: "Enterprise" };
            const planLabel = planLabels[data.plan] || data.plan;

            container.innerHTML = `
                <div class="plan-card">
                    <div class="plan-card-header">
                        <div class="plan-card-name">${escapeHtml(data.name)}</div>
                        <span class="badge badge-plan">${escapeHtml(planLabel)}</span>
                    </div>
                    <div class="plan-features">
                        ${Object.entries(data.features || {})
                            .map(([feature, enabled]) => `
                                <div class="plan-feature">
                                    <span class="plan-feature-icon">${enabled ? "+" : "-"}</span>
                                    <span class="plan-feature-name">${escapeHtml(feature.replace(/_/g, " "))}</span>
                                    ${!enabled ? '<span class="badge badge-upgrade">Pro</span>' : ""}
                                </div>`)
                            .join("")}
                    </div>
                </div>`;
        } catch {
            container.innerHTML = `<div class="empty-state">Could not load account info.</div>`;
        }
    }

    // ── Billing Section ─────────────────────────────────────────────────

    async function loadBillingSection() {
        const container = $("#billingSection");
        if (!container) return;

        try {
            const res = await apiFetch(`${API_BASE}/billing/status`);
            const data = await res.json();

            const stripeReady = data.stripe_configured;
            const paypalReady = data.paypal_configured;

            if (!stripeReady && !paypalReady) {
                container.innerHTML = `
                    <div class="empty-state">Payment processing is not yet configured. Contact your administrator.</div>`;
                return;
            }

            const basePlan = data.plans?.base || {};
            const reiPlugin = data.plans?.rei_plugin || {};

            container.innerHTML = `
                <div class="billing-plans">
                    <div class="billing-plan-card">
                        <div class="billing-plan-header">
                            <div class="billing-plan-name">Helm Base Plan</div>
                            <span class="badge badge-plan">Subscription</span>
                        </div>
                        <p class="billing-plan-desc">Full access to Grace AI assistant, chat, agents, voice, and integrations.</p>
                        <div class="billing-plan-actions">
                            ${stripeReady && basePlan.stripe_price_id ? `<button class="btn-billing btn-stripe" data-plan="base" data-provider="stripe">Subscribe with Stripe</button>` : ""}
                            ${paypalReady && basePlan.paypal_plan_id ? `<button class="btn-billing btn-paypal" data-plan="base" data-provider="paypal">Subscribe with PayPal</button>` : ""}
                        </div>
                    </div>

                    <div class="billing-plan-card">
                        <div class="billing-plan-header">
                            <div class="billing-plan-name">REI Plugin</div>
                            <span class="badge badge-plugin">Add-on</span>
                        </div>
                        <p class="billing-plan-desc">Deal analysis, comps, portfolio tracking, BRRRR calculator. Adds Real Estate mode.</p>
                        <div class="billing-plan-actions">
                            ${stripeReady && reiPlugin.stripe_price_id ? `<button class="btn-billing btn-stripe" data-plan="rei_plugin" data-provider="stripe">Add with Stripe</button>` : ""}
                            ${paypalReady && reiPlugin.paypal_plan_id ? `<button class="btn-billing btn-paypal" data-plan="rei_plugin" data-provider="paypal">Add with PayPal</button>` : ""}
                        </div>
                    </div>
                </div>

                ${stripeReady ? `
                <div class="billing-manage">
                    <button class="btn-small" id="billingManageBtn">Manage Subscription (Stripe Portal)</button>
                </div>` : ""}`;

            // Bind billing buttons
            container.querySelectorAll(".btn-billing").forEach((btn) => {
                btn.addEventListener("click", () => handleBillingClick(btn.dataset.plan, btn.dataset.provider));
            });

            const manageBtn = $("#billingManageBtn");
            if (manageBtn) {
                manageBtn.addEventListener("click", handleManageSubscription);
            }
        } catch {
            container.innerHTML = `<div class="empty-state">Could not load billing info.</div>`;
        }
    }

    async function handleBillingClick(plan, provider) {
        const email = prompt("Enter your email address for billing:");
        if (!email || !email.includes("@")) return;

        try {
            if (provider === "stripe") {
                const res = await apiFetch(`${API_BASE}/billing/stripe/checkout`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", ...authHeaders() },
                    body: JSON.stringify({ plan, email }),
                });
                const data = await res.json();
                if (data.checkout_url) {
                    window.open(data.checkout_url, "_blank");
                } else {
                    showToast(data.detail || "Failed to create checkout session.", 'error');
                }
            } else if (provider === "paypal") {
                const name = prompt("Enter your full name:") || "";
                const res = await apiFetch(`${API_BASE}/billing/paypal/subscribe`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", ...authHeaders() },
                    body: JSON.stringify({ plan, email, name }),
                });
                const data = await res.json();
                if (data.approve_url) {
                    window.open(data.approve_url, "_blank");
                } else {
                    showToast(data.detail || "Failed to create subscription.", 'error');
                }
            }
        } catch {
            showToast("Could not connect to billing service. Please try again.", 'error');
        }
    }

    async function handleManageSubscription() {
        const customerId = prompt("Enter your Stripe Customer ID (cus_...):");
        if (!customerId) return;

        try {
            const res = await apiFetch(`${API_BASE}/billing/stripe/portal`, {
                method: "POST",
                headers: { "Content-Type": "application/json", ...authHeaders() },
                body: JSON.stringify({
                    customer_id: customerId,
                    return_url: window.location.href,
                }),
            });
            const data = await res.json();
            if (data.portal_url) {
                window.open(data.portal_url, "_blank");
            } else {
                showToast(data.detail || "Failed to open billing portal.", 'error');
            }
        } catch {
            showToast("Could not connect to billing service.", 'error');
        }
    }

    async function loadPluginMarketplace() {
        const industryGrid = $("#industryPlugins");
        const softwareGrid = $("#softwarePlugins");

        try {
            const res = await apiFetch(`${API_BASE}/account/plugins/available`);
            const data = await res.json();
            const plugins = data.plugins || [];

            const industry = plugins.filter((p) => p.category === "industry");
            const software = plugins.filter((p) => p.category === "software");

            if (industryGrid) renderPluginGrid(industryGrid, industry);
            if (softwareGrid) renderPluginGrid(softwareGrid, software);
        } catch {
            if (industryGrid) industryGrid.innerHTML = `<div class="empty-state">Could not load plugins.</div>`;
            if (softwareGrid) softwareGrid.innerHTML = `<div class="empty-state">Could not load plugins.</div>`;
        }
    }

    function renderPluginGrid(container, plugins) {
        if (plugins.length === 0) {
            container.innerHTML = `<div class="empty-state">None available yet.</div>`;
            return;
        }

        container.innerHTML = plugins
            .map((p) => {
                const statusBadge = p.installed
                    ? '<span class="badge badge-active">Installed</span>'
                    : p.coming_soon
                    ? '<span class="badge badge-soon">Coming Soon</span>'
                    : '<span class="badge badge-upgrade">Pro</span>';

                const purchaseBtn = !p.installed && !p.coming_soon && p.purchasable
                    ? `<div class="plugin-card-actions">
                           <button class="btn-small plugin-buy-btn" data-plugin-id="${escapeHtml(p.id)}">Purchase</button>
                       </div>`
                    : "";

                return `
                    <div class="plugin-card${p.installed ? " plugin-installed" : ""}${p.coming_soon ? " plugin-soon" : ""}">
                        <div class="plugin-card-header">
                            <div class="plugin-card-name">${escapeHtml(p.name)}</div>
                            ${statusBadge}
                        </div>
                        <p class="plugin-card-desc">${escapeHtml(p.description)}</p>
                        <div class="plugin-card-price">${escapeHtml(p.price)}</div>
                        ${purchaseBtn}
                    </div>`;
            })
            .join("");

        // Bind purchase buttons
        container.querySelectorAll(".plugin-buy-btn").forEach((btn) => {
            btn.addEventListener("click", () => {
                const pluginId = btn.dataset.pluginId;
                handleBillingClick(pluginId === "rei" ? "rei_plugin" : pluginId, "stripe");
            });
        });
    }

    // ═════════════════════════════════════════════════════════════════════
    // ── Monitoring Page ──────────────────────────────────────────────────
    // ═════════════════════════════════════════════════════════════════════

    async function loadMonitoring() {
        loadMonitoringStats();
        loadMonitoringIntegrations();
        loadMonitoringGHL();
        loadMonitoringTenants();
        loadMonitoringAgentLogs();

        // Wire refresh buttons
        const refreshInt = $("#monRefreshIntegrations");
        if (refreshInt) {
            refreshInt.onclick = () => {
                loadMonitoringStats();
                loadMonitoringIntegrations();
            };
        }
        const refreshLogs = $("#monRefreshLogs");
        if (refreshLogs) {
            refreshLogs.onclick = () => loadMonitoringAgentLogs();
        }

        // Start auto-refresh (every 30 seconds)
        startMonitoringAutoRefresh();
    }

    function startMonitoringAutoRefresh() {
        stopMonitoringAutoRefresh();
        state.monitoringInterval = setInterval(() => {
            loadMonitoringStats();
            loadMonitoringIntegrations();
            loadMonitoringAgentLogs();
        }, 30000);
    }

    function stopMonitoringAutoRefresh() {
        if (state.monitoringInterval) {
            clearInterval(state.monitoringInterval);
            state.monitoringInterval = null;
        }
    }

    async function loadMonitoringStats() {
        const statHealth = $("#stat-system-status");
        const statIntegrations = $("#stat-active-integrations");
        const statTotalIntegrations = $("#stat-total-integrations");
        const statTenants = $("#monStatTenants");
        const statAgentRuns = $("#monStatAgentRuns");

        // Health
        try {
            const res = await apiFetch(`${API_BASE}/health/detailed`);
            const data = await res.json();
            if (statHealth) {
                statHealth.textContent = data.status === "healthy" ? "Healthy" : data.status || "Unknown";
                statHealth.style.color = data.status === "healthy" ? "var(--success)" : "var(--warning)";
            }
            if (statIntegrations && data.integrations) {
                statIntegrations.textContent = data.integrations?.active ?? '—';
            }
            if (statTotalIntegrations && data.integrations) {
                statTotalIntegrations.textContent = data.integrations?.total ?? '—';
            }
        } catch {
            if (statHealth) statHealth.textContent = "Offline";
            if (statHealth) statHealth.style.color = "var(--danger)";
        }

        // Tenants
        try {
            const res = await apiFetch(`${API_BASE}/tenants`);
            const data = await res.json();
            const tenants = data.tenants || [];
            if (statTenants) statTenants.textContent = String(tenants.length);
        } catch {
            if (statTenants) statTenants.textContent = "0";
        }

        // Agent runs
        try {
            const res = await apiFetch(`${API_BASE}/agents/logs`);
            const data = await res.json();
            const logs = data.logs || [];
            if (statAgentRuns) statAgentRuns.textContent = String(logs.length);
        } catch {
            if (statAgentRuns) statAgentRuns.textContent = "0";
        }
    }

    async function loadMonitoringIntegrations() {
        const grid = $("#monIntegrationsGrid");
        if (!grid) return;

        try {
            const res = await apiFetch(`${API_BASE}/health/detailed`);
            const data = await res.json();
            const plugins = data.integrations?.plugins || {};

            if (Object.keys(plugins).length === 0) {
                grid.innerHTML = `<div class="empty-state">No integrations registered.</div>`;
                return;
            }

            grid.innerHTML = Object.entries(plugins)
                .map(([name, info]) => {
                    const isActive = info.active;
                    const statusClass = isActive ? "status-ok" : "status-off";
                    const statusText = isActive ? "Active" : "Inactive";
                    return `
                        <div class="monitoring-integration-item">
                            <div class="monitoring-integration-header">
                                <span class="status-dot ${statusClass}"></span>
                                <span class="monitoring-integration-name">${escapeHtml(name)}</span>
                            </div>
                            <div class="monitoring-integration-detail">
                                <span class="monitoring-integration-category">${escapeHtml(info.category || "integration")}</span>
                                <span class="monitoring-integration-status">${statusText}</span>
                            </div>
                            ${info.description ? `<div class="monitoring-integration-desc">${escapeHtml(info.description)}</div>` : ""}
                        </div>`;
                })
                .join("");
        } catch {
            grid.innerHTML = `<div class="empty-state">Could not load integration health.</div>`;
        }
    }

    async function loadMonitoringGHL() {
        const container = $("#monGHLStatus");
        if (!container) return;

        try {
            const res = await apiFetch(`${API_BASE}/ghl/status`);
            const data = await res.json();

            const isConfigured = data.configured;
            const isConnected = data.connected;

            container.innerHTML = `
                <div class="monitoring-ghl-grid">
                    <div class="settings-row">
                        <div>
                            <div class="settings-row-label">Configuration</div>
                            <div class="settings-row-desc">API credentials and client setup</div>
                        </div>
                        <span class="status-dot ${isConfigured ? "status-ok" : "status-off"}"></span>
                    </div>
                    <div class="settings-row">
                        <div>
                            <div class="settings-row-label">Connection</div>
                            <div class="settings-row-desc">Active OAuth session with GHL</div>
                        </div>
                        <span class="status-dot ${isConnected ? "status-ok" : "status-off"}"></span>
                    </div>
                    ${data.location_id ? `
                    <div class="settings-row">
                        <div>
                            <div class="settings-row-label">Location ID</div>
                        </div>
                        <div class="settings-row-value">${escapeHtml(data.location_id)}</div>
                    </div>` : ""}
                </div>`;
        } catch {
            container.innerHTML = `<div class="empty-state">Could not load GHL status.</div>`;
        }
    }

    async function loadMonitoringTenants() {
        const container = $("#monTenantsList");
        if (!container) return;

        try {
            const res = await apiFetch(`${API_BASE}/tenants`);
            const data = await res.json();
            const tenants = data.tenants || [];

            if (tenants.length === 0) {
                container.innerHTML = `<div class="empty-state">No tenants registered. The system is running in standalone mode.</div>`;
                return;
            }

            container.innerHTML = `
                <div class="monitoring-tenants-table">
                    <div class="monitoring-table-header">
                        <span>Name</span>
                        <span>Status</span>
                        <span>Channels</span>
                        <span>Created</span>
                    </div>
                    ${tenants.map((t) => {
                        const channels = [];
                        if (t.telegram_chat_id) channels.push("Telegram");
                        if (t.whatsapp_phone) channels.push("WhatsApp");
                        if (t.ghl_location_id) channels.push("GHL");
                        return `
                            <div class="monitoring-table-row">
                                <span class="monitoring-tenant-name">${escapeHtml(t.name)}</span>
                                <span><span class="status-dot ${t.is_active ? "status-ok" : "status-off"}"></span></span>
                                <span class="monitoring-tenant-channels">${channels.length > 0 ? channels.join(", ") : "None"}</span>
                                <span class="monitoring-tenant-date">${t.created_at ? formatRelativeTime(t.created_at) : "--"}</span>
                            </div>`;
                    }).join("")}
                </div>`;
        } catch {
            container.innerHTML = `<div class="empty-state">Could not load tenants.</div>`;
        }
    }

    async function loadMonitoringAgentLogs() {
        const container = $("#monAgentLogs");
        if (!container) return;

        try {
            const res = await apiFetch(`${API_BASE}/agents/logs`);
            const data = await res.json();
            const logs = data.logs || [];

            if (logs.length === 0) {
                container.innerHTML = `<div class="empty-state">No agent activity recorded yet.</div>`;
                return;
            }

            container.innerHTML = logs
                .slice(0, 50)
                .map((log) => {
                    const statusClass = log.status === "completed" ? "log-success"
                        : log.status === "failed" ? "log-error"
                        : "log-pending";
                    const duration = log.duration_ms ? `${(log.duration_ms / 1000).toFixed(1)}s` : "--";
                    return `
                        <div class="agent-log-item ${statusClass}">
                            <div class="agent-log-header">
                                <span class="agent-log-name">${escapeHtml(log.agent_name || "unknown")}</span>
                                <span class="agent-log-status badge badge-${log.status === "completed" ? "active" : log.status === "failed" ? "error" : "pending"}">${escapeHtml(log.status)}</span>
                            </div>
                            <div class="agent-log-task">${escapeHtml(log.task || "")}</div>
                            <div class="agent-log-meta">
                                <span>${duration}</span>
                                ${log.created_at ? `<span>${formatRelativeTime(log.created_at)}</span>` : ""}
                            </div>
                            ${log.error ? `<div class="agent-log-error">${escapeHtml(log.error)}</div>` : ""}
                        </div>`;
                })
                .join("");
        } catch {
            container.innerHTML = `<div class="empty-state">Could not load agent logs.</div>`;
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

                const res = await apiFetch(`${API_BASE}/deal/analyze`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", ...authHeaders() },
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
