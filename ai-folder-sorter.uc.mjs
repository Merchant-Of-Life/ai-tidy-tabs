// ==UserScript==
// @name           AI Folder Sorter for Zen Browser
// @description    Uses AI to automatically sort open tabs into Zen Browser Folders
// @version        1.0.0
// @author         thy-fool
// @compatibility  Zen Browser (Firefox 128+ fork)
// @loadOrder      5
// ==/UserScript==

// ════════════════════════════════════════════════════════════════════════
//  AI Folder Sorter — Entry Point
//
//  This file is the orchestrator. All logic lives in ./modules/*.mjs.
//  Sine loads this file via import() because it ends in .uc.mjs.
//
//  Architecture:
//    config.mjs         — constants, CONFIG, log helper
//    tabs.mjs            — extractTabData, domCache, getExistingGroupNames
//    rules.mjs           — domain→folder rules (bypass AI)
//    ai.mjs              — system prompt, request building, response parsing
//    groups.mjs          — folder creation strategies
//    notify.mjs          — notification bar + toast fallback
//    browser-ui.mjs      — button injection, command, workspace hooks
//    browser-hooks.mjs   — right-click "Add to Rule" context menu
//    click-handler.mjs   — main sort pipeline (rules → AI → folders)
// ════════════════════════════════════════════════════════════════════════

import { CONFIG, LOG, BUILD_VERSION, log } from "./modules/config.mjs";
import { setupCommand, addButtonToAllSeparators, setupWorkspaceHooks, injectFloatingFallbackButton } from "./modules/browser-ui.mjs";
import { setupTabContextMenu } from "./modules/browser-hooks.mjs";
import { detectStrategy } from "./modules/groups.mjs";
import { handleSortClick } from "./modules/click-handler.mjs";

console.log(`${LOG} Script loaded (v${BUILD_VERSION}). Ready to initialize.`);

/**
 * Check whether the browser is ready for UI injection.
 * gZenWorkspaces is a SOFT check (tracked but not required).
 */
function checkReadiness() {
  const gBrowserReady = typeof gBrowser !== "undefined" && gBrowser?.tabContainer;
  const commandSetExists = !!document.querySelector("commandset#zenCommandSet");
  const separatorExists = document.querySelectorAll(".pinned-tabs-container-separator").length > 0;
  const peripheryExists = !!document.querySelector("#tabbrowser-arrowscrollbox-periphery");
  const tabsContainerExists = !!document.getElementById("tabbrowser-tabs");
  const gZenWorkspacesReady = typeof window.gZenWorkspaces !== "undefined";

  const hasInjectionPoint = separatorExists || peripheryExists || tabsContainerExists;
  const ready = gBrowserReady && commandSetExists && hasInjectionPoint;

  if (!ready) {
    log.debug(`Readiness: gBrowser=${gBrowserReady} cmd=${commandSetExists} sep=${separatorExists} periph=${peripheryExists} tabs=${tabsContainerExists} ws=${gZenWorkspacesReady}`);
  }
  checkReadiness._lastWsReady = gZenWorkspacesReady;
  return ready;
}

/** Try to initialize. Returns true on success. Idempotent. */
function tryInitialize() {
  try {
    if (!checkReadiness()) return false;

    log.info("Readiness check passed — injecting UI...");

    const cmdOk = setupCommand();
    log.info(`  setupCommand: ${cmdOk ? "OK" : "skipped"}`);

    const injectOk = addButtonToAllSeparators();
    log.info(`  addButtonToAllSeparators: ${injectOk ? "OK" : "FAILED"}`);

    if (checkReadiness._lastWsReady) {
      const wsOk = setupWorkspaceHooks();
      log.info(`  setupWorkspaceHooks: ${wsOk ? "OK" : "skipped"}`);
    } else {
      log.warn("  gZenWorkspaces not available — workspace hooks skipped.");
    }

    setupTabContextMenu();
    log.info("  setupTabContextMenu: OK");

    // Keyboard shortcut: Ctrl+Shift+S
    if (!document._aiSorterKeyListener) {
      document.addEventListener("keydown", (e) => {
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "S") {
          e.preventDefault();
          e.stopPropagation();
          handleSortClick({ currentTarget: null });
        }
      });
      document._aiSorterKeyListener = true;
      log.info("  keyboard shortcut Ctrl+Shift+S: registered");
    }

    // Schedule floating fallback button as safety net.
    if (!document._aiSorterFallbackScheduled) {
      document._aiSorterFallbackScheduled = true;
      setTimeout(() => {
        const sidebarBtn = document.getElementById(CONFIG.BUTTON_ID);
        if (!sidebarBtn || sidebarBtn.offsetWidth === 0) {
          log.warn(`Sidebar button not visible after ${CONFIG.FALLBACK_BUTTON_DELAY_MS}ms — injecting floating fallback.`);
          injectFloatingFallbackButton();
        }
      }, CONFIG.FALLBACK_BUTTON_DELAY_MS);
    }

    log.info(`✅ ${LOG} initialized successfully! (v${BUILD_VERSION})`);
    log.info(`   Provider: ${CONFIG.PROVIDER}`);
    log.info(`   Strategy: ${detectStrategy()}`);
    log.info(`   Trigger:  Click the ✨ wand button, or press Ctrl+Shift+S`);
    log.info(`   Rules:    Right-click any tab → "Always sort [host] into..."`);
    return true;
  } catch (e) {
    log.error("Init attempt threw:", e);
    log.error("Stack:", e?.stack);
    return false;
  }
}

/** Initialize with polling. Zen may inject globals asynchronously. */
function init() {
  log.info(`Initializing ${LOG}...`);

  if (tryInitialize()) return;

  let checkCount = 0;
  const intervalId = setInterval(() => {
    checkCount++;
    if (tryInitialize()) {
      clearInterval(intervalId);
    } else if (checkCount >= CONFIG.MAX_INIT_CHECKS) {
      clearInterval(intervalId);
      log.error(
        `Initialization timed out after ${(checkCount * CONFIG.INIT_CHECK_INTERVAL_MS) / 1000}s. ` +
        "Open the Browser Console (Ctrl+Shift+J) and look for readiness logs."
      );
    }
  }, CONFIG.INIT_CHECK_INTERVAL_MS);
}

// ── Kick off ──────────────────────────────────────────────────────
if (document.readyState === "complete" || document.readyState === "interactive") {
  init();
} else {
  document.addEventListener("DOMContentLoaded", init, { once: true });
}
