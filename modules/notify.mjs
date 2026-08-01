// modules/notify.mjs
import { log } from "./config.mjs";

export function showNotification(message, type = "success", undoData = null) {
  log.info(`[${type.toUpperCase()}] ${message}`);

  const undoCallback = (notification, buttonInfo, event) => {
    if (!undoData) return false;
    for (const item of undoData) {
      try {
        if (item.type === "created" && item.group) {
          if (typeof item.group.ungroupTabs === "function") item.group.ungroupTabs();
        } else if (item.type === "merged" && item.group && item.tabs) {
          item.tabs.forEach((t) => {
            try {
              if (typeof item.group.removeTab === "function") {
                item.group.removeTab(t);
              } else if (typeof gBrowser?.ungroupTab === "function") {
                gBrowser.ungroupTab(t);
              } else {
                t.group = null; // last resort — verify this actually detaches the tab on your build
              }
            } catch (e) {
              log.error("Failed to undo merge:", e);
            }
          });
        }
      } catch (e) {
        log.error("Failed to undo group:", e);
      }
    }
    return false;
  };

  const buttons = [];
  if (undoData && undoData.length > 0) {
    buttons.push({ label: "Undo", accessKey: "U", callback: undoCallback });
  }

  try {
    const notifyBox = gBrowser.getNotificationBox?.();
    if (notifyBox) {
      const priority = type === "error" ? notifyBox.PRIORITY_CRITICAL_HIGH ?? 10 : type === "warning" ? notifyBox.PRIORITY_WARNING_LOW ?? 4 : notifyBox.PRIORITY_INFO_LOW ?? 1;
      const existing = notifyBox.getNotificationWithValue?.("ai-folder-sorter");
      if (existing) notifyBox.removeNotification(existing);

      try {
        notifyBox.appendNotification(
          "ai-folder-sorter",
          { label: message, priority },
          buttons
        );
      } catch (e1) {
        log.debug("Newer appendNotification failed, retrying legacy:", e1);
        notifyBox.appendNotification(message, "ai-folder-sorter", null, priority, buttons);
      }
      setTimeout(() => {
        try { const n = notifyBox.getNotificationWithValue?.("ai-folder-sorter"); if (n) notifyBox.removeNotification(n); } catch (_) {}
      }, 5000);
      return;
    }
  } catch (e) {
    log.debug("Built-in notification failed, using toast fallback:", e);
  }

  const toast = document.createElement("div");
  toast.id = "ai-folder-sorter-toast";
  toast.className = `ai-sorter-toast ${type}`;

  Object.assign(toast.style, {
    position: "fixed",
    top: "16px",
    right: "16px",
    zIndex: "999999",
    opacity: "0",
    transform: "translateY(-10px)",
    transition: "opacity 200ms ease, transform 200ms ease",
  });

  const textSpan = document.createElement("span");
  textSpan.textContent = message;
  toast.appendChild(textSpan);

  let dismissTimer;
  if (undoData && undoData.length > 0) {
    const undoBtn = document.createElement("button");
    undoBtn.textContent = "Undo";
    Object.assign(undoBtn.style, {
      background: "rgba(128,128,128,0.2)",
      border: "none",
      color: "currentColor",
      padding: "4px 8px",
      borderRadius: "4px",
      cursor: "pointer",
      fontWeight: "bold",
    });
    undoBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
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