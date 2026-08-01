// modules/unload.mjs
import { log } from "./config.mjs";

const state = {
  commandListener: null,
  zenCommandSet: null,
  workspaceHooksInstalled: false,
  originalOnTabBrowserInserted: null,
  originalUpdateTabsContainers: null,
  keydownListener: null,
  fallbackTimeoutScheduled: false,
  fallbackTimeout: null,
  initObserver: null,
  lastWsReady: false,
  contextMenuInstalled: false,
  contextMenuTracker: null,
};

export const StateManager = {
  set(key, value) {
    state[key] = value;
  },
  get(key) {
    return state[key];
  },
  clear(key) {
    state[key] = null;
  }
};

export function unload() {
  log.info("Unloading AI Folder Sorter and cleaning up resources...");

  if (state.keydownListener) {
    document.removeEventListener("keydown", state.keydownListener);
    state.keydownListener = null;
  }

  if (state.fallbackTimeout) {
    clearTimeout(state.fallbackTimeout);
    state.fallbackTimeout = null;
  }

  const floatingBtn = document.getElementById("ai-folder-sorter-fallback");
  if (floatingBtn) floatingBtn.remove();

  if (state.zenCommandSet && state.commandListener) {
    state.zenCommandSet.removeEventListener("command", state.commandListener);
    state.commandListener = null;
  }
  
  const cmdNode = document.getElementById("cmd_aiFolderSorter");
  if (cmdNode) cmdNode.remove();

  const buttons = document.querySelectorAll("#ai-folder-sorter-btn");
  buttons.forEach(btn => btn.remove());

  if (state.workspaceHooksInstalled && typeof window.gZenWorkspaces !== "undefined") {
    if (state.originalOnTabBrowserInserted) {
      window.gZenWorkspaces.onTabBrowserInserted = state.originalOnTabBrowserInserted;
    }
    if (state.originalUpdateTabsContainers) {
      window.gZenWorkspaces.updateTabsContainers = state.originalUpdateTabsContainers;
    }
    state.workspaceHooksInstalled = false;
  }

  if (state.initObserver) {
    state.initObserver.disconnect();
    state.initObserver = null;
  }

  const tabMenu = document.getElementById("tabContextMenu");
  if (tabMenu && state.contextMenuTracker) {
    tabMenu.removeEventListener("popupshowing", state.contextMenuTracker);
    state.contextMenuTracker = null;
  }
  const contextMenu = document.getElementById("context_aiFolderSorter_addRule");
  if (contextMenu) contextMenu.remove();

  log.info("Unload complete.");
}