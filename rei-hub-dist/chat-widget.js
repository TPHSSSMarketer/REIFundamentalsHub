/**
 * REI Fundamentals Hub — Embeddable Chat Widget
 * ==============================================
 *
 * HOW TO USE (for investors):
 * Copy this ONE line of code into your website, right before </body>:
 *
 *   <script src="https://hub.reifundamentalshub.com/chat-widget.js" data-widget-id="rei-123"></script>
 *
 * That's it! A chat bubble will appear in the bottom-right corner.
 * When visitors click it, they can chat with your AI assistant.
 *
 * The widget ID comes from your REI Hub dashboard → Chat Widget settings.
 */

(function () {
  "use strict";

  // ── Configuration ─────────────────────────────────────────────
  const script = document.currentScript;
  const WIDGET_ID = script?.getAttribute("data-widget-id") || "";
  const API_BASE =
    script?.getAttribute("data-api-url") ||
    script?.src.replace("/chat-widget.js", "") ||
    "";

  if (!WIDGET_ID) {
    console.warn("[REI Chat] Missing data-widget-id attribute");
    return;
  }

  // ── State ─────────────────────────────────────────────────────
  let sessionId = null;
  let executionId = null;
  let visitorId = localStorage.getItem("rei_visitor_id") || generateId();
  let isOpen = false;
  let ws = null;

  localStorage.setItem("rei_visitor_id", visitorId);

  function generateId() {
    return "v_" + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
  }

  // ── Styles ────────────────────────────────────────────────────
  const STYLES = `
    #rei-chat-widget * { box-sizing: border-box; margin: 0; padding: 0; }
    #rei-chat-widget { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }

    .rei-chat-bubble {
      position: fixed;
      bottom: 24px;
      right: 24px;
      width: 60px;
      height: 60px;
      border-radius: 50%;
      background: #1B3A6B;
      color: white;
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      transition: transform 0.2s, box-shadow 0.2s;
      z-index: 99999;
    }
    .rei-chat-bubble:hover {
      transform: scale(1.1);
      box-shadow: 0 6px 16px rgba(0,0,0,0.25);
    }
    .rei-chat-bubble svg { width: 28px; height: 28px; }

    .rei-chat-window {
      position: fixed;
      bottom: 96px;
      right: 24px;
      width: 380px;
      height: 520px;
      border-radius: 16px;
      background: white;
      box-shadow: 0 8px 32px rgba(0,0,0,0.15);
      display: none;
      flex-direction: column;
      overflow: hidden;
      z-index: 99998;
      animation: rei-slide-up 0.3s ease-out;
    }
    .rei-chat-window.open { display: flex; }

    @keyframes rei-slide-up {
      from { opacity: 0; transform: translateY(20px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .rei-chat-header {
      background: #1B3A6B;
      color: white;
      padding: 16px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .rei-chat-header-title { font-size: 16px; font-weight: 600; }
    .rei-chat-header-status { font-size: 12px; opacity: 0.8; margin-top: 2px; }
    .rei-chat-close {
      background: none;
      border: none;
      color: white;
      cursor: pointer;
      padding: 4px;
      opacity: 0.8;
    }
    .rei-chat-close:hover { opacity: 1; }

    .rei-chat-messages {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .rei-chat-msg {
      max-width: 85%;
      padding: 10px 14px;
      border-radius: 16px;
      font-size: 14px;
      line-height: 1.4;
      word-wrap: break-word;
    }
    .rei-chat-msg.assistant {
      background: #F0F2F5;
      color: #1a1a1a;
      align-self: flex-start;
      border-bottom-left-radius: 4px;
    }
    .rei-chat-msg.user {
      background: #1B3A6B;
      color: white;
      align-self: flex-end;
      border-bottom-right-radius: 4px;
    }
    .rei-chat-msg.system {
      background: #FFF3CD;
      color: #856404;
      align-self: center;
      font-size: 12px;
      border-radius: 8px;
    }

    .rei-chat-typing {
      align-self: flex-start;
      padding: 12px 16px;
      background: #F0F2F5;
      border-radius: 16px;
      border-bottom-left-radius: 4px;
      display: none;
    }
    .rei-chat-typing.visible { display: flex; gap: 4px; }
    .rei-chat-typing-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #999;
      animation: rei-typing 1.4s infinite;
    }
    .rei-chat-typing-dot:nth-child(2) { animation-delay: 0.2s; }
    .rei-chat-typing-dot:nth-child(3) { animation-delay: 0.4s; }
    @keyframes rei-typing {
      0%, 60%, 100% { opacity: 0.3; transform: translateY(0); }
      30% { opacity: 1; transform: translateY(-4px); }
    }

    .rei-chat-input-area {
      padding: 12px 16px;
      border-top: 1px solid #E5E7EB;
      display: flex;
      gap: 8px;
      align-items: center;
    }
    .rei-chat-input {
      flex: 1;
      border: 1px solid #D1D5DB;
      border-radius: 24px;
      padding: 10px 16px;
      font-size: 14px;
      outline: none;
      font-family: inherit;
      resize: none;
    }
    .rei-chat-input:focus { border-color: #1B3A6B; }
    .rei-chat-send {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: #1B3A6B;
      color: white;
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .rei-chat-send:hover { background: #2a4d8a; }
    .rei-chat-send:disabled { background: #9CA3AF; cursor: not-allowed; }
    .rei-chat-send svg { width: 18px; height: 18px; }

    .rei-chat-powered {
      text-align: center;
      padding: 6px;
      font-size: 11px;
      color: #9CA3AF;
    }
    .rei-chat-powered a { color: #6B7280; text-decoration: none; }
    .rei-chat-powered a:hover { text-decoration: underline; }

    @media (max-width: 480px) {
      .rei-chat-window {
        bottom: 0;
        right: 0;
        width: 100%;
        height: 100%;
        border-radius: 0;
      }
      .rei-chat-bubble { bottom: 16px; right: 16px; }
    }
  `;

  // ── Build the Widget HTML ─────────────────────────────────────
  function buildWidget() {
    // Inject styles
    const style = document.createElement("style");
    style.textContent = STYLES;
    document.head.appendChild(style);

    // Create container
    const container = document.createElement("div");
    container.id = "rei-chat-widget";

    container.innerHTML = `
      <button class="rei-chat-bubble" id="rei-chat-toggle" aria-label="Open chat">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
        </svg>
      </button>

      <div class="rei-chat-window" id="rei-chat-window">
        <div class="rei-chat-header">
          <div>
            <div class="rei-chat-header-title">Chat with us</div>
            <div class="rei-chat-header-status">We typically reply in seconds</div>
          </div>
          <button class="rei-chat-close" id="rei-chat-close" aria-label="Close chat">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div class="rei-chat-messages" id="rei-chat-messages">
          <div class="rei-chat-typing" id="rei-chat-typing">
            <div class="rei-chat-typing-dot"></div>
            <div class="rei-chat-typing-dot"></div>
            <div class="rei-chat-typing-dot"></div>
          </div>
        </div>

        <div class="rei-chat-input-area">
          <input
            type="text"
            class="rei-chat-input"
            id="rei-chat-input"
            placeholder="Type a message..."
            autocomplete="off"
          />
          <button class="rei-chat-send" id="rei-chat-send" disabled aria-label="Send">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
            </svg>
          </button>
        </div>

        <div class="rei-chat-powered">
          Powered by <a href="https://reifundamentalshub.com" target="_blank">REI Fundamentals Hub</a>
        </div>
      </div>
    `;

    document.body.appendChild(container);

    // Wire up events
    document.getElementById("rei-chat-toggle").addEventListener("click", toggleChat);
    document.getElementById("rei-chat-close").addEventListener("click", toggleChat);
    document.getElementById("rei-chat-send").addEventListener("click", sendMessage);

    const input = document.getElementById("rei-chat-input");
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
    input.addEventListener("input", function () {
      document.getElementById("rei-chat-send").disabled = !input.value.trim();
    });
  }

  // ── Toggle Chat Open/Close ────────────────────────────────────
  function toggleChat() {
    isOpen = !isOpen;
    const window = document.getElementById("rei-chat-window");
    window.classList.toggle("open", isOpen);

    if (isOpen && !sessionId) {
      startSession();
    }

    if (isOpen) {
      setTimeout(() => document.getElementById("rei-chat-input").focus(), 100);
    }
  }

  // ── Start a Chat Session ──────────────────────────────────────
  async function startSession() {
    showTyping(true);

    try {
      const response = await fetch(`${API_BASE}/chat/${WIDGET_ID}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          visitor_id: visitorId,
          page_url: window.location.href,
        }),
      });

      const data = await response.json();

      if (data.status === "unavailable") {
        addMessage("assistant", "Sorry, chat is not available right now. Please try again later.");
        showTyping(false);
        return;
      }

      sessionId = data.session_id;
      executionId = data.execution_id;

      // Show the greeting
      if (data.greeting) {
        addMessage("assistant", data.greeting);
      }

      // Connect WebSocket for real-time updates
      connectWebSocket();
    } catch (error) {
      console.error("[REI Chat] Failed to start session:", error);
      addMessage("system", "Connection failed. Please refresh and try again.");
    }

    showTyping(false);
  }

  // ── Send a Message ────────────────────────────────────────────
  async function sendMessage() {
    const input = document.getElementById("rei-chat-input");
    const message = input.value.trim();
    if (!message || !sessionId) return;

    // Show user message
    addMessage("user", message);
    input.value = "";
    document.getElementById("rei-chat-send").disabled = true;

    // Show typing indicator
    showTyping(true);

    // If WebSocket is connected, use it
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: "message",
          content: message,
          widget_id: WIDGET_ID,
        })
      );
      return; // Response will come via WebSocket
    }

    // Fallback to HTTP
    try {
      const response = await fetch(
        `${API_BASE}/chat/${WIDGET_ID}/message?session_id=${sessionId}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: message,
            visitor_id: visitorId,
            page_url: window.location.href,
          }),
        }
      );

      const data = await response.json();

      if (data.response) {
        addMessage("assistant", data.response);
      } else if (data.status === "human_handling") {
        addMessage("system", "A team member is reviewing your message...");
      }
    } catch (error) {
      console.error("[REI Chat] Failed to send message:", error);
      addMessage("system", "Message failed to send. Please try again.");
    }

    showTyping(false);
  }

  // ── WebSocket Connection ──────────────────────────────────────
  function connectWebSocket() {
    if (!sessionId) return;

    const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${wsProtocol}//${new URL(API_BASE).host}/ws/chat/${sessionId}`;

    try {
      ws = new WebSocket(wsUrl);

      ws.onopen = function () {
        console.log("[REI Chat] WebSocket connected");
      };

      ws.onmessage = function (event) {
        try {
          const data = JSON.parse(event.data);

          if (data.type === "message") {
            showTyping(false);
            addMessage(data.role || "assistant", data.content);
          } else if (data.type === "typing") {
            showTyping(true);
          } else if (data.type === "system") {
            addMessage("system", data.message);
          }
        } catch (e) {
          console.error("[REI Chat] Failed to parse WS message:", e);
        }
      };

      ws.onclose = function () {
        console.log("[REI Chat] WebSocket disconnected");
        // Don't auto-reconnect — fallback to HTTP
        ws = null;
      };

      ws.onerror = function (error) {
        console.error("[REI Chat] WebSocket error:", error);
        ws = null;
      };

      // Ping every 30 seconds to keep alive
      setInterval(function () {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "ping" }));
        }
      }, 30000);
    } catch (e) {
      console.error("[REI Chat] WebSocket connection failed:", e);
    }
  }

  // ── UI Helpers ────────────────────────────────────────────────
  function addMessage(role, content) {
    const container = document.getElementById("rei-chat-messages");
    const typing = document.getElementById("rei-chat-typing");

    const msg = document.createElement("div");
    msg.className = `rei-chat-msg ${role}`;
    msg.textContent = content;

    // Insert before typing indicator
    container.insertBefore(msg, typing);

    // Scroll to bottom
    container.scrollTop = container.scrollHeight;
  }

  function showTyping(show) {
    const typing = document.getElementById("rei-chat-typing");
    if (typing) {
      typing.classList.toggle("visible", show);
    }
    // Scroll to bottom when typing shows
    if (show) {
      const container = document.getElementById("rei-chat-messages");
      container.scrollTop = container.scrollHeight;
    }
  }

  // ── Initialize ────────────────────────────────────────────────
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", buildWidget);
  } else {
    buildWidget();
  }
})();
