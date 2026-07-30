// modules/tabs.mjs
// Tab extraction and DOM caching utilities.

import { CONFIG, log } from "./config.mjs";

// Cached DOM lookups for the toolbar button injection points.
// Invalidate on workspace changes (the active workspace's separator changes).
export const domCache = {
  separators: null,
  commandSet: null,

  getSeparators() {
    if (!this.separators || !this.separators.length) {
      this.separators = document.querySelectorAll(
        ".pinned-tabs-container-separator"
      );
    }
    return this.separators;
  },

  getCommandSet() {
    if (!this.commandSet) {
      this.commandSet = document.querySelector("commandset#zenCommandSet");
    }
    return this.commandSet;
  },

  invalidate() {
    this.separators = null;
    this.commandSet = null;
  },
};

/**
 * Collect all sortable tabs from gBrowser.
 *
 * Each tab object in the output has:
 *   - id:    A stable per-sort identifier (monotonic counter, not _tPos).
 *   - title: The tab's display label, with URL fallback for pending tabs.
 *   - url:   The tab's current URI.
 *
 * Skips: pinned tabs, already-grouped tabs, about:/chrome: pages.
 *
 * @returns {{ tabMap: Map<number, Tab>, payload: Array<{id,title,url}> }}
 */
export function extractTabData() {
  const allTabs = gBrowser.tabs;
  const payload = [];
  const tabMap = new Map();
  let nextId = 0;

  for (const tab of allTabs) {
    if (CONFIG.SKIP_PINNED_TABS && tab.pinned) {
      log.debug(`Skipping pinned tab: "${tab.label}"`);
      continue;
    }

    if (
      CONFIG.SKIP_GROUPED_TABS &&
      (tab.tabGroup ||
        (tab.parentNode &&
          tab.parentNode.tagName &&
          tab.parentNode.tagName.toLowerCase() === "tab-group"))
    ) {
      log.debug(`Skipping already-grouped tab: "${tab.label}"`);
      continue;
    }

    const url = tab.linkedBrowser?.currentURI?.spec || "";
    if (!url || url.startsWith("about:") || url.startsWith("chrome://")) {
      log.debug(`Skipping internal tab: "${tab.label}" (${url})`);
      continue;
    }

    const id = nextId++;

    // Pending/unloaded tabs may have empty labels — fall back to URL.
    let title = tab.label || "";
    if (!title || title === "(Untitled)") {
      try {
        const u = new URL(url);
        title =
          u.hostname +
          (u.pathname && u.pathname !== "/" ? u.pathname : "");
      } catch {
        title = "(Untitled)";
      }
    }

    tabMap.set(id, tab);
    payload.push({ id, title, url });
  }

  log.info(
    `Extracted ${payload.length} sortable tabs (${allTabs.length} total)`
  );
  return { tabMap, payload };
}

/**
 * Get names of existing tab groups in the CURRENT workspace only.
 *
 * Zen's workspace tabs live inside #tabbrowser-tabs > arrowscrollbox.
 * Groups that are descendants of that container are in the active workspace.
 */
export function getExistingGroupNames() {
  const container =
    document.getElementById("tabbrowser-tabs") ||
    document.querySelector("#tabbrowser-arrowscrollbox");

  let groups;
  if (container) {
    groups = Array.from(container.querySelectorAll("tab-group"));
  } else {
    groups = Array.from(document.querySelectorAll("tab-group"));
  }

  return groups
    .map((g) => g.label || g.getAttribute?.("label") || "")
    .map((s) => String(s || "").trim())
    .filter(Boolean);
}
