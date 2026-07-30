// modules/browser-ui.mjs
// Sidebar button injection, command registration, workspace hooks.
//
// Injection pattern modeled on Zen-Tab-Wand:
//   - MozXULElement.parseXULToFragment for proper XUL creation
//   - <command> registered in zenCommandSet, button references it
//   - Falls back to #tabbrowser-arrowscrollbox-periphery if no separator
//   - Hooks gZenWorkspaces.onTabBrowserInserted + updateTabsContainers
//   - Floating HTML fallback button if sidebar injection fails

import { CONFIG, log } from "./config.mjs";
import { handleSortClick } from "./click-handler.mjs";

// Lucide "wand-sparkles" icon.
const WAND_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 4V2"/><path d="M15 16v-2"/><path d="M8 9h2"/><path d="M20 9h2"/><path d="M17.8 11.8 19 13"/><path d="M15 9h.01"/><path d="M17.8 6.2 19 5"/><path d="m3 21 9-9"/><path d="M12.2 6.2 11 5"/></svg>`;

function buildButtonXUL() {
  return `<toolbarbutton id="${CONFIG.BUTTON_ID}" command="${CONFIG.COMMAND_ID}" tooltiptext="AI Folder Sorter — Sort tabs into folders" class="toolbarbutton-1 chromeclass-toolbar-additional">
    <hbox class="toolbarbutton-box" align="center" style="pointer-events: none;">${WAND_ICON_SVG}</hbox>
  </toolbarbutton>`;
}

/**
 * Register a <command> in zenCommandSet. The toolbarbutton references
 * it via command="...", so clicks fire the command event. This survives
 * sidebar DOM rebuilds — the commandset persists even if the button is
 * destroyed and re-created.
 */
export function setupCommand() {
  const zenCommands = document.querySelector("commandset#zenCommandSet");
  if (!zenCommands) {
    log.debug("zenCommandSet not found — falling back to direct click listener");
    return false;
  }

  if (!zenCommands.querySelector(`#${CONFIG.COMMAND_ID}`)) {
    try {
      const cmdFragment = window.MozXULElement.parseXULToFragment(
        `<command id="${CONFIG.COMMAND_ID}"/>`
      );
      zenCommands.appendChild(cmdFragment);
    } catch (e) {
      log.error("Failed to register command:", e);
      return false;
    }
  }

  // Guard against double-listener via DOM expando.
  if (!zenCommands._aiSorterCommandListener) {
    const listener = (event) => {
      if (event.target.id === CONFIG.COMMAND_ID) {
        handleSortClick({ currentTarget: null });
      }
    };
    zenCommands.addEventListener("command", listener);
    zenCommands._aiSorterCommandListener = listener;
    log.debug("Command listener attached to zenCommandSet");
  }
  return true;
}

/** Ensure a single host element has our button. Idempotent. */
function ensureButton(host) {
  if (!host || host.querySelector(`#${CONFIG.BUTTON_ID}`)) return;

  try {
    const nativeClearButton = host.querySelector(
      ".zen-workspace-close-unpinned-tabs-button"
    );

    const fragment = window.MozXULElement.parseXULToFragment(buildButtonXUL());
    const button = fragment.firstChild;

    if (nativeClearButton) {
      host.insertBefore(button, nativeClearButton);
    } else {
      host.appendChild(button);
    }

    // Belt-and-suspenders: direct click listener as fallback.
    button.addEventListener("click", (e) => {
      e?.preventDefault?.();
      e?.stopPropagation?.();
      handleSortClick({ currentTarget: button });
    });

    log.debug("Button injected into:", host.id || host.className || host.tagName);
  } catch (e) {
    log.error("Failed to inject button:", e);
  }
}

/**
 * Inject the button into every available separator, with fallbacks.
 * Tries: .pinned-tabs-container-separator → #tabbrowser-arrowscrollbox-periphery → #tabbrowser-tabs
 */
export function addButtonToAllSeparators() {
  const separators = document.querySelectorAll(
    ".pinned-tabs-container-separator"
  );

  if (separators.length > 0) {
    separators.forEach(ensureButton);
    log.info(`✅ Button injected into ${separators.length} separator(s).`);
    return true;
  }

  const periphery = document.querySelector(
    "#tabbrowser-arrowscrollbox-periphery"
  );
  if (periphery) {
    ensureButton(periphery);
    log.info(
      "✅ Button injected into #tabbrowser-arrowscrollbox-periphery (separator fallback)."
    );
    return true;
  }

  const tabsContainer = document.getElementById("tabbrowser-tabs");
  if (tabsContainer) {
    ensureButton(tabsContainer);
    log.info(
      "✅ Button injected into #tabbrowser-tabs (last-resort fallback)."
    );
    return true;
  }

  log.warn("No injection point found.");
  return false;
}

/**
 * Hook gZenWorkspaces lifecycle methods to re-inject the button on
 * workspace switches.
 */
export function setupWorkspaceHooks() {
  if (typeof window.gZenWorkspaces === "undefined") {
    log.debug("gZenWorkspaces not available — workspace hooks skipped");
    return false;
  }

  if (window.gZenWorkspaces._aiSorterHooksInstalled) {
    log.debug("Workspace hooks already installed — skipping");
    return true;
  }
  window.gZenWorkspaces._aiSorterHooksInstalled = true;

  const originalOnTabBrowserInserted =
    window.gZenWorkspaces.onTabBrowserInserted;
  const originalUpdateTabsContainers =
    window.gZenWorkspaces.updateTabsContainers;

  window.gZenWorkspaces.onTabBrowserInserted = function (event) {
    if (typeof originalOnTabBrowserInserted === "function") {
      try {
        originalOnTabBrowserInserted.call(window.gZenWorkspaces, event);
      } catch (e) {
        log.error("Original onTabBrowserInserted threw:", e);
      }
    }
    setTimeout(() => addButtonToAllSeparators(), 0);
  };

  window.gZenWorkspaces.updateTabsContainers = function (...args) {
    if (typeof originalUpdateTabsContainers === "function") {
      try {
        originalUpdateTabsContainers.apply(window.gZenWorkspaces, args);
      } catch (e) {
        log.error("Original updateTabsContainers threw:", e);
      }
    }
    setTimeout(() => addButtonToAllSeparators(), 0);
  };

  log.debug("Workspace hooks installed on gZenWorkspaces");
  return true;
}

/**
 * Inject a floating HTML button as a last-resort fallback.
 * If sidebar injection fails after FALLBACK_BUTTON_DELAY_MS, this
 * guarantees the user can still trigger sorts.
 *
 * The button is draggable (Shift+drag) and its position is saved.
 */
export function injectFloatingFallbackButton() {
  if (document.getElementById("ai-folder-sorter-fallback")) return;

  const btn = document.createElementNS("http://www.w3.org/1999/xhtml", "div");
  btn.id = "ai-folder-sorter-fallback";
  btn.setAttribute("role", "button");
  btn.setAttribute("aria-label", "AI Folder Sorter (fallback button)");
  btn.title =
    "AI Folder Sorter — Click to sort tabs.\n\nShift+Drag to reposition.";

  const savedPos = Services.prefs.getStringPref(
    "zen.ai-folder-sorter.fallback-pos",
    ""
  );
  let pos = { top: 60, right: 16 };
  if (savedPos) {
    try {
      pos = JSON.parse(savedPos);
    } catch {}
  }

  Object.assign(btn.style, {
    position: "fixed",
    top: `${pos.top}px`,
    right: `${pos.right}px`,
    zIndex: "2147483647",
    width: "40px",
    height: "40px",
    borderRadius: "50%",
    background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
    border: "2px solid rgba(255,255,255,0.3)",
    boxShadow: "0 4px 12px rgba(99, 102, 241, 0.4)",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "white",
    userSelect: "none",
    transition: "transform 120ms ease, box-shadow 120ms ease",
    fontFamily: "system-ui, -apple-system, sans-serif",
  });

  btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 4V2"/><path d="M15 16v-2"/><path d="M8 9h2"/><path d="M20 9h2"/><path d="M17.8 11.8 19 13"/><path d="M15 9h.01"/><path d="M17.8 6.2 19 5"/><path d="m3 21 9-9"/><path d="M12.2 6.2 11 5"/></svg>`;

  btn.addEventListener("mouseenter", () => {
    btn.style.transform = "scale(1.1)";
    btn.style.boxShadow = "0 6px 20px rgba(99, 102, 241, 0.6)";
  });
  btn.addEventListener("mouseleave", () => {
    btn.style.transform = "scale(1)";
    btn.style.boxShadow = "0 4px 12px rgba(99, 102, 241, 0.4)";
  });

  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    handleSortClick({ currentTarget: null });
    btn.style.animation = "ai-wand-wiggle 550ms ease-in-out";
    setTimeout(() => {
      btn.style.animation = "";
    }, 600);
  });

  // Shift+drag to reposition
  let isDragging = false;
  let dragStartX = 0, dragStartY = 0;
  let btnStartX = 0, btnStartY = 0;

  btn.addEventListener("mousedown", (e) => {
    if (e.button !== 0 || !e.shiftKey) return;
    isDragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    btnStartX = btn.offsetLeft;
    btnStartY = btn.offsetTop;
    e.preventDefault();
  });

  document.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    btn.style.left = `${btnStartX + e.clientX - dragStartX}px`;
    btn.style.top = `${btnStartY + e.clientY - dragStartY}px`;
    btn.style.right = "auto";
  });

  document.addEventListener("mouseup", () => {
    if (!isDragging) return;
    isDragging = false;
    const newPos = {
      top: btn.offsetTop,
      right: window.innerWidth - btn.offsetLeft - btn.offsetWidth,
    };
    try {
      Services.prefs.setStringPref(
        "zen.ai-folder-sorter.fallback-pos",
        JSON.stringify(newPos)
      );
    } catch {}
  });

  document.documentElement.appendChild(btn);
  log.info(
    `🆘 Floating fallback button injected at top:${pos.top}px right:${pos.right}px. Click to sort, Shift+drag to reposition.`
  );

  try {
    const hide = Services.prefs.getBoolPref(
      "zen.ai-folder-sorter.hide-fallback",
      false
    );
    if (hide) btn.style.display = "none";
  } catch {}
}
