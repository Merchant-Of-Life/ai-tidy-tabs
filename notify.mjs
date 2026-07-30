// modules/notify.mjs
// Notification bar + toast fallback.
//
// Uses Firefox's built-in notification bar when available,
// falls back to a custom DOM toast.

import { CONFIG, log } from "./config.mjs";

/**
 * Display a brief notification to the user.
 *
 * @param {string} message - The message to show
 * @param {"success"|"warning"|"error"} type
 * @param {Array} [undoData] - If provided, an Undo button is added
 */
export function showNotification(message, type = "success", undoData = null) {
  log.info(`[${type.toUpperCase()}] ${message}`);

  const undoCallback = () => {
    if (!undoData) return;
    for (const item of undoData) {
      try {
        if (item.type === "created" && item.group) {
          if (typeof item.group.ungroupTabs === "function") {
            item.group.ungroupTabs();
          }
        } else if (item.type === "merged" && item.group && item.tabs) {
          item.tabs.forEach((t) => {
            if (typeof t.group !== "undefined") t.group = null;
          });
        }
      } catch (e) {
        log.error("Failed to undo group:", e);
      }
    }
  };

  const buttons = [];
  if (undoData && undoData.length > 0) {
    buttons.push({ label: "Undo", accessKey: "U", callback: undoCallback });
  }

  // ── Try Firefox's built-in notification bar ──────────────────
  try {
    const notifyBox = gBrowser.getNotificationBox?.();
    if (notifyBox) {
      const priority =
        type === "error"
          ? notifyBox.PRIORITY_CRITICAL_HIGH ??
            notifyBox.PRIORITY_WARNING_HIGH ??
            10
          : type === "warning"
            ? notifyBox.PRIORITY_WARNING_LOW ?? 4
            : notifyBox.PRIORITY_INFO_LOW ?? 1;

      const existing = notifyBox.getNotificationWithValue?.(
        "ai-folder-sorter"
      );
      if (existing) {
        notifyBox.removeNotification(existing);
      }

      try {
        // Firefox 118+ signature
        notifyBox.appendNotification(
          "ai-folder-sorter",
          { label: message, priority },
          priority,
          buttons
        );
      } catch (e1) {
        // Legacy signature fallback
        log.debug("Newer appendNotification failed, retrying legacy:", e1);
        notifyBox.appendNotification(
          message,
          "ai-folder-sorter",
          null,
          priority,
          buttons
        );
      }

      setTimeout(() => {
        try {
          const n = notifyBox.getNotificationWithValue?.("ai-folder-sorter");
          if (n) notifyBox.removeNotification(n);
        } catch (_) {}
      }, 5000);

      return;
    }
  } catch (e) {
    log.debug("Built-in notification failed, using toast fallback:", e);
  }

  // ── Fallback: Custom DOM toast ────────────────────────────────
  const toast = document.createElement("div");
  toast.id = "ai-folder-sorter-toast";

  const colors = {
    success: { bg: "#2d7d46", border: "#4caf50" },
    warning: { bg: "#7d6e2d", border: "#ff9800" },
    error: { bg: "#7d2d2d", border: "#f44336" },
  };
  const c = colors[type] || colors.success;

  Object.assign(toast.style, {
    position: "fixed",
    top: "16px",
    right: "16px",
    zIndex: "999999",
    padding: "12px 20px",
    borderRadius: "8px",
    background: c.bg,
    borderLeft: `4px solid ${c.border}`,
    color: "#fff",
    fontSize: "13px",
    fontFamily: "system-ui, -apple-system, sans-serif",
    boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
    opacity: "0",
    transform: "translateY(-10px)",
    transition: "opacity 200ms ease, transform 200ms ease",
    maxWidth: "400px",
    wordWrap: "break-word",
    display: "flex",
    alignItems: "center",
    gap: "12px",
  });

  const textSpan = document.createElement("span");
  textSpan.textContent = message;
  toast.appendChild(textSpan);

  let dismissTimer;

  if (undoData && undoData.length > 0) {
    const undoBtn = document.createElement("button");
    undoBtn.textContent = "Undo";
    Object.assign(undoBtn.style, {
      background: "rgba(255,255,255,0.2)",
      border: "none",
      color: "#fff",
      padding: "4px 8px",
      borderRadius: "4px",
      cursor: "pointer",
      fontWeight: "bold",
    });
    undoBtn.addEventListener("click", () => {
      undoBtn.disabled = true;
      undoBtn.textContent = "Undoing...";
      clearTimeout(dismissTimer);
      undoCallback();
      toast.style.opacity = "0";
      setTimeout(() => toast.remove(), 250);
    });
    toast.appendChild(undoBtn);
  }

  document.getElementById("ai-folder-sorter-toast")?.remove();
  document.documentElement.appendChild(toast);

  requestAnimationFrame(() => {
    toast.style.opacity = "1";
    toast.style.transform = "translateY(0)";
  });

  dismissTimer = setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(-10px)";
    setTimeout(() => toast.remove(), 250);
  }, 5000);
}
