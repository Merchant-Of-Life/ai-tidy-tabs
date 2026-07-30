// modules/groups.mjs
// Tab group creation strategies and folder movement.
//
// Strategy priority:
//   1. gBrowser.addTabGroup() — Firefox's native API
//   2. DOM-based <tab-group> creation
//   3. Synthetic click fallback (most fragile)

import { CONFIG, log } from "./config.mjs";
import { normalizeFolderName } from "./ai.mjs";

/** Detect which folder creation strategy is available. */
export function detectStrategy() {
  if (typeof gBrowser?.addTabGroup === "function") {
    log.debug("Detected gBrowser.addTabGroup() — using native strategy.");
    return "addTabGroup";
  }
  if (customElements.get("tab-group")) {
    log.debug(
      "Detected <tab-group> custom element — using DOM creation strategy."
    );
    return "domCreation";
  }
  log.debug("Falling back to synthetic click strategy.");
  return "syntheticClick";
}

// ── Strategy 1: gBrowser.addTabGroup() ──────────────────────────
async function strategyAddTabGroup(tabs, folderName, color) {
  const insertBefore = tabs[0];
  const group = gBrowser.addTabGroup(tabs, {
    label: folderName,
    color: color,
    insertBefore: insertBefore,
  });

  if (!group) {
    throw new Error("gBrowser.addTabGroup() returned null/undefined");
  }

  if (group.hasAttribute("collapsed")) {
    group.removeAttribute("collapsed");
  }

  log.debug("addTabGroup created group:", group);
  return group;
}

// ── Strategy 2: Direct DOM creation ─────────────────────────────
async function strategyDOMCreation(tabs, folderName, color) {
  const firstTab = tabs[0];
  const tabContainer = firstTab.parentNode;

  if (!tabContainer) {
    throw new Error(
      "Cannot find tab container (parentNode of first tab is null)"
    );
  }

  const group = document.createXULElement
    ? document.createXULElement("tab-group")
    : document.createElement("tab-group");

  group.setAttribute("label", folderName);
  group.setAttribute("color", color);
  group.id = `tab-group-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  tabContainer.insertBefore(group, firstTab);

  for (const tab of tabs) {
    group.appendChild(tab);
  }

  log.debug("DOM-created tab-group:", group);
}

// ── Strategy 3: Synthetic click fallback ────────────────────────
async function strategySyntheticClick(tabs, folderName, color) {
  gBrowser.clearMultiSelectedTabs?.();

  // Only set selectedTab if it's null (don't yank the user's active tab).
  if (
    typeof gBrowser.selectedTab === "undefined" ||
    gBrowser.selectedTab === null
  ) {
    gBrowser.selectedTab = tabs[0];
  }

  for (let i = 0; i < tabs.length; i++) {
    if (typeof gBrowser.addToMultiSelectedTabs === "function") {
      gBrowser.addToMultiSelectedTabs(tabs[i]);
    } else {
      tabs[i].setAttribute("multiselected", "true");
    }
  }

  const groupMenuItem = document.getElementById("context_addTabGroup");

  if (groupMenuItem && !groupMenuItem.hidden && !groupMenuItem.disabled) {
    groupMenuItem.doCommand?.() || groupMenuItem.click();
    await new Promise((resolve) => setTimeout(resolve, 300));

    const allGroups = document.querySelectorAll("tab-group");
    const newGroup = allGroups[allGroups.length - 1];

    if (newGroup) {
      newGroup.setAttribute("label", folderName);
      newGroup.setAttribute("color", color);

      const labelInput =
        newGroup.querySelector("input, .tab-group-label-input") ||
        document.querySelector(
          ".tab-group-editor input, #tabGroupEditor input"
        );

      if (labelInput) {
        labelInput.value = folderName;
        labelInput.dispatchEvent(new Event("input", { bubbles: true }));
        labelInput.dispatchEvent(new Event("change", { bubbles: true }));
        labelInput.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "Enter",
            code: "Enter",
            keyCode: 13,
            bubbles: true,
          })
        );
      }

      log.debug("Synthetic-click created group:", newGroup);
    } else {
      throw new Error(
        "Could not find newly created tab-group element after context menu action"
      );
    }
  } else {
    const zenNewFolderBtn =
      document.querySelector('[data-action="new-folder"]') ||
      document.querySelector('.zen-sidebar-action-button[title*="folder" i]') ||
      document.querySelector('.zen-sidebar-action-button[title*="group" i]');

    if (zenNewFolderBtn) {
      zenNewFolderBtn.click();
      await new Promise((resolve) => setTimeout(resolve, 300));

      const modal =
        document.querySelector(".zen-folder-create-dialog") ||
        document.querySelector('[role="dialog"]');

      if (modal) {
        const nameInput = modal.querySelector("input");
        if (nameInput) {
          nameInput.value = folderName;
          nameInput.dispatchEvent(new Event("input", { bubbles: true }));
        }

        const submitBtn =
          modal.querySelector('button[type="submit"]') ||
          modal.querySelector(".confirm-btn, .zen-dialog-accept");

        if (submitBtn) {
          submitBtn.click();
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
      }
    } else {
      throw new Error(
        "No folder creation mechanism found. Verify tab groups are enabled in about:config."
      );
    }
  }
}

/**
 * Create folders/tab-groups and move tabs into them.
 *
 * Features:
 *   - Fuzzy folder-name matching (prevents duplicate folders)
 *   - Color validation against allowed palette
 *   - Tracks hallucinated and duplicate tab IDs
 *   - Returns undo data for the notification's Undo button
 *
 * @param {Object} folderMapping - { "FolderName": { color?, tabs: [...] } }
 * @param {Map<number, Tab>} tabMap
 * @returns {Promise<{created, failed, undoData, hallucinatedIds, duplicateIds}>}
 */
export async function createFoldersAndMoveTabs(folderMapping, tabMap) {
  let created = 0;
  let failed = 0;
  let colorIndex = 0;
  const undoData = [];
  const assignedIds = new Set();
  const hallucinatedIds = [];
  const duplicateIds = new Set();

  // Pre-compute existing groups with normalized names for fuzzy matching.
  const tabContainer =
    document.getElementById("tabbrowser-tabs") ||
    document.querySelector("#tabbrowser-arrowscrollbox");
  const existingGroups = tabContainer
    ? Array.from(tabContainer.querySelectorAll("tab-group"))
    : Array.from(document.querySelectorAll("tab-group"));
  const existingByNormName = new Map();
  for (const g of existingGroups) {
    const key = normalizeFolderName(g.label);
    if (!existingByNormName.has(key)) {
      existingByNormName.set(key, g);
    }
  }

  const strategy = detectStrategy();
  log.info(`Using folder creation strategy: ${strategy}`);

  for (const [folderName, folderData] of Object.entries(folderMapping)) {
    try {
      // Normalize to { tabs, color } shape.
      let tabIds;
      let aiColor;
      if (Array.isArray(folderData)) {
        tabIds = folderData;
      } else if (folderData && typeof folderData === "object") {
        tabIds = Array.isArray(folderData.tabs) ? folderData.tabs : [];
        aiColor = folderData.color;
      } else {
        tabIds = [];
      }

      // Validate color — fall back to cycle if invalid.
      let color;
      if (aiColor && CONFIG.VALID_COLORS.has(String(aiColor).toLowerCase())) {
        color = String(aiColor).toLowerCase();
      } else {
        color =
          CONFIG.GROUP_COLORS[colorIndex % CONFIG.GROUP_COLORS.length];
        if (aiColor) {
          log.warn(
            `Folder "${folderName}": AI returned invalid color "${aiColor}", using "${color}" instead.`
          );
        }
      }
      colorIndex++;

      // Track assignments and detect duplicates/hallucinations.
      for (const id of tabIds) {
        if (!tabMap.has(id)) {
          hallucinatedIds.push(id);
          continue;
        }
        if (assignedIds.has(id)) {
          duplicateIds.add(id);
          continue;
        }
        assignedIds.add(id);
      }

      const tabs = tabIds
        .map((id) => tabMap.get(id))
        .filter((tab) => tab && !tab.closing && tab.parentNode);

      if (tabs.length === 0) {
        log.warn(`Folder "${folderName}": No valid tabs found. Skipping.`);
        failed++;
        continue;
      }

      // Try merging into existing group (fuzzy match).
      const normName = normalizeFolderName(folderName);
      const existingGroup = existingByNormName.get(normName);

      if (existingGroup) {
        if (typeof existingGroup.addTabs === "function") {
          existingGroup.addTabs(tabs);
          undoData.push({ type: "merged", group: existingGroup, tabs });
          log.info(
            `✅ Merged ${tabs.length} tabs into existing folder "${existingGroup.label}"`
          );
          created++;
          continue;
        } else if (typeof gBrowser?.moveTabToGroup === "function") {
          try {
            for (const tab of tabs) {
              gBrowser.moveTabToGroup(tab, existingGroup);
            }
            undoData.push({ type: "merged", group: existingGroup, tabs });
            log.info(
              `✅ Merged ${tabs.length} tabs via moveTabToGroup into "${existingGroup.label}"`
            );
            created++;
            continue;
          } catch (e) {
            log.warn(
              `moveTabToGroup failed for "${folderName}": ${e.message}. Skipping.`
            );
            failed++;
            continue;
          }
        } else {
          log.warn(
            `Existing folder "${existingGroup.label}" found but no merge API. Skipping to avoid duplicate.`
          );
          failed++;
          continue;
        }
      }

      // Create new group via the chosen strategy.
      let group = null;
      switch (strategy) {
        case "addTabGroup":
          group = await strategyAddTabGroup(tabs, folderName, color);
          undoData.push({ type: "created", group });
          existingByNormName.set(normName, group);
          break;

        case "domCreation":
          await strategyDOMCreation(tabs, folderName, color);
          break;

        case "syntheticClick":
          await strategySyntheticClick(tabs, folderName, color);
          break;

        default:
          throw new Error(`Unknown strategy: ${strategy}`);
      }

      log.info(
        `✅ Created folder "${folderName}" (${color}) with ${tabs.length} tab(s)`
      );
      created++;
    } catch (err) {
      log.error(`❌ Failed to create folder "${folderName}":`, err);
      failed++;
    }
  }

  if (hallucinatedIds.length > 0) {
    log.warn(
      `AI returned ${hallucinatedIds.length} tab ID(s) not in the input: ${JSON.stringify(hallucinatedIds)}`
    );
  }
  if (duplicateIds.size > 0) {
    log.warn(
      `AI assigned ${duplicateIds.size} tab ID(s) to multiple folders: ${JSON.stringify(Array.from(duplicateIds))}`
    );
  }

  return {
    created,
    failed,
    undoData,
    hallucinatedIds,
    duplicateIds: Array.from(duplicateIds),
  };
}
