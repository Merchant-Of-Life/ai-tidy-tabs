// ==UserScript==
// @name           AI Folder Sorter for Zen Browser
// @description    Uses AI to automatically sort open tabs into Zen Browser Folders
// @version        1.3.0
// @author         Merchant-Of-life
// @compatibility  Zen Browser (Firefox 128+ fork)
// @loadOrder      5
// ==/UserScript==

import { CONFIG, LOG, BUILD_VERSION, log } from "./modules/config.mjs";
import { setupCommand, addButtonToAllSeparators, setupWorkspaceHooks, registerKeyboardShortcut, scheduleFallbackButton } from "./modules/browser-ui.mjs";
import { setupTabContextMenu } from "./modules/browser-hooks.mjs";
import { detectStrategy } from "./modules/groups.mjs";
import { StateManager, unload } from "./modules/unload.mjs";

console.log(`${LOG} Script loaded (v${BUILD_VERSION}). Ready to initialize.`);

function checkReadiness() {
  const gBrowserReady = typeof gBrowser !== "undefined" && gBrowser?.tabContainer;
  const commandSetExists = !!document.querySelector("commandset#zenCommandSet");
  const separatorExists = document.querySelectorAll(".pinned-tabs-container-separator").length > 0;
  const peripheryExists = !!document.querySelector("#tabbrowser-arrowscrollbox-periphery");
  const tabsContainerExists = !!document.getElementById("tabbrowser-tabs");
  const gZenWorkspacesReady = typeof window.gZenWorkspaces !== "undefined";

  const hasInjectionPoint = separatorExists || peripheryExists || tabsContainerExists;
  const ready = gBrowserReady && commandSetExists && hasInjectionPoint;

  StateManager.set("lastWsReady", gZenWorkspacesReady);
  return ready;
}

function tryInitialize() {
  try {
    if (!checkReadiness()) return false;

    log.info("Readiness check passed — injecting UI...");
    setupCommand();
    addButtonToAllSeparators();

    if (StateManager.get("lastWsReady")) {
      setupWorkspaceHooks();
    }
    setupTabContextMenu();
    registerKeyboardShortcut();
    scheduleFallbackButton();

    log.info(`✅ ${LOG} initialized successfully! (v${BUILD_VERSION})`);
    log.info(`   Strategy: ${detectStrategy()}`);
    log.info(`   Trigger:  Click the ✨ wand button, or press Ctrl+Shift+G`);
    return true;
  } catch (e) {
    log.error("Init attempt threw:", e);
    return false;
  }
}

function init() {
  log.info(`Initializing ${LOG}...`);
  if (tryInitialize()) return;

  const initObserver = new MutationObserver((mutations, obs) => {
    if (tryInitialize()) {
      obs.disconnect();
      StateManager.clear("initObserver");
    }
  });

  initObserver.observe(document.documentElement, {
    childList: true,
    subtree: true
  });
  StateManager.set("initObserver", initObserver);
}

export function onUnload() {
  unload();
}

if (typeof window !== "undefined") {
  if (window.gBrowserInit && window.gBrowserInit.delayedStartupFinished) {
    init();
  } else {
    const observer = (subject, topic) => {
      if (subject === window) {
        Services.obs.removeObserver(observer, "browser-delayed-startup-finished");
        init();
      }
    };
    Services.obs.addObserver(observer, "browser-delayed-startup-finished");
  }
}