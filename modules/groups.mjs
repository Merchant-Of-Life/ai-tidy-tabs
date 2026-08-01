// modules/groups.mjs
import { CONFIG, log } from "./config.mjs";
import { normalizeFolderName } from "./ai.mjs";

export function detectStrategy() {
  if (typeof gBrowser?.addTabGroup === "function") return "addTabGroup";
  if (customElements.get("tab-group")) return "domCreation";
  return "syntheticClick";
}

function playFlip(tab, rectBefore) {
  if (!rectBefore) return;
  const rectAfter = tab.getBoundingClientRect();
  const dx = rectBefore.left - rectAfter.left;
  const dy = rectBefore.top - rectAfter.top;
  if (dx === 0 && dy === 0) return;
  if (typeof tab.animate === "function") {
    tab.animate(
      [{ transform: `translate(${dx}px, ${dy}px)`, opacity: 0.7 }, { transform: "translate(0, 0)", opacity: 1 }],
      { duration: 350, easing: "cubic-bezier(0.2, 0, 0, 1)" }
    );
  }
}

function flashGroup(group) {
  if (group && group.classList) {
    group.classList.remove("ai-sorter-highlight");
    void group.offsetWidth; // Trigger reflow
    group.classList.add("ai-sorter-highlight");
    setTimeout(() => {
      group.classList.remove("ai-sorter-highlight");
    }, 600);
  }
}

async function strategyAddTabGroup(tabs, folderName, color) {
  const insertBefore = tabs[0];
  const rectsBefore = new Map(tabs.map((t) => [t, t.getBoundingClientRect()]));

  const group = gBrowser.addTabGroup(tabs, { label: folderName, color, insertBefore });
  if (!group) throw new Error("gBrowser.addTabGroup() returned null/undefined");
  if (group.hasAttribute("collapsed")) group.removeAttribute("collapsed");

  for (const tab of tabs) playFlip(tab, rectsBefore.get(tab));
  flashGroup(group);
  return group;
}

async function strategyDOMCreation(tabs, folderName, color) {
  const firstTab = tabs[0];
  const tabContainer = firstTab.parentNode;
  if (!tabContainer) throw new Error("Cannot find tab container");
  const rectsBefore = new Map(tabs.map((t) => [t, t.getBoundingClientRect()]));

  const group = document.createXULElement ? document.createXULElement("tab-group") : document.createElement("tab-group");
  group.setAttribute("label", folderName);
  group.setAttribute("color", color);
  group.id = `tab-group-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  tabContainer.insertBefore(group, firstTab);
  
  for (const tab of tabs) playFlip(tab, rectsBefore.get(tab));
  
  flashGroup(group);
}

async function strategySyntheticClick(tabs, folderName, color) {
  gBrowser.clearMultiSelectedTabs?.();

  if (typeof gBrowser.selectedTab === "undefined" || gBrowser.selectedTab === null) {
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
      const labelInput = newGroup.querySelector("input, .tab-group-label-input") || document.querySelector(".tab-group-editor input, #tabGroupEditor input");
      if (labelInput) {
        labelInput.value = folderName;
        labelInput.dispatchEvent(new Event("input", { bubbles: true }));
        labelInput.dispatchEvent(new Event("change", { bubbles: true }));
        labelInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, bubbles: true }));
      }
      flashGroup(newGroup);
    } else {
      throw new Error("Could not find newly created tab-group element after context menu action");
    }
  } else {
    throw new Error("No folder creation mechanism found.");
  }
}

export async function createFoldersAndMoveTabs(folderMapping, tabMap) {
  let created = 0, failed = 0, colorIndex = 0;
  const undoData = [], assignedIds = new Set(), hallucinatedIds = [], duplicateIds = new Set();
  
  const tabContainer = document.getElementById("tabbrowser-tabs") || document.querySelector("#tabbrowser-arrowscrollbox");
  const existingGroups = tabContainer ? Array.from(tabContainer.querySelectorAll("tab-group")) : Array.from(document.querySelectorAll("tab-group"));
  const existingByNormName = new Map();
  for (const g of existingGroups) {
    if (!existingByNormName.has(normalizeFolderName(g.label))) existingByNormName.set(normalizeFolderName(g.label), g);
  }

  const strategy = detectStrategy();

  for (const [folderName, folderData] of Object.entries(folderMapping)) {
    try {
      let tabIds = Array.isArray(folderData) ? folderData : folderData?.tabs || [];
      let aiColor = Array.isArray(folderData) ? null : folderData?.color;

      let color = aiColor && CONFIG.VALID_COLORS.has(String(aiColor).toLowerCase()) ? String(aiColor).toLowerCase() : CONFIG.GROUP_COLORS[colorIndex % CONFIG.GROUP_COLORS.length];
      colorIndex++;

      const validIds = [];
      for (const id of tabIds) {
        if (!tabMap.has(id)) { hallucinatedIds.push(id); continue; }
        if (assignedIds.has(id)) { duplicateIds.add(id); continue; }
        assignedIds.add(id);
        validIds.push(id);
      }

      const tabs = validIds.map((id) => tabMap.get(id)).filter((tab) => tab && !tab.closing && tab.parentNode);
      if (tabs.length === 0) { failed++; continue; }

      const normName = normalizeFolderName(folderName);
      const existingGroup = existingByNormName.get(normName);

      if (existingGroup) {
        if (typeof existingGroup.addTabs === "function") {
          const rectsBefore = new Map(tabs.map((t) => [t, t.getBoundingClientRect()]));
          existingGroup.addTabs(tabs);
          for (const tab of tabs) playFlip(tab, rectsBefore.get(tab));
          flashGroup(existingGroup);
          undoData.push({ type: "merged", group: existingGroup, tabs });
          created++;
          continue;
        } else if (typeof gBrowser?.moveTabToGroup === "function") {
          const rectsBefore = new Map(tabs.map((t) => [t, t.getBoundingClientRect()]));
          for (const tab of tabs) {
            gBrowser.moveTabToGroup(tab, existingGroup);
          }
          for (const tab of tabs) playFlip(tab, rectsBefore.get(tab));
          flashGroup(existingGroup);
          undoData.push({ type: "merged", group: existingGroup, tabs });
          created++;
          continue;
        } else {
          failed++;
          continue;
        }
      }

      let group = null;
      switch (strategy) {
        case "addTabGroup": group = await strategyAddTabGroup(tabs, folderName, color); undoData.push({ type: "created", group }); existingByNormName.set(normName, group); break;
        case "domCreation": await strategyDOMCreation(tabs, folderName, color); break;
        case "syntheticClick": await strategySyntheticClick(tabs, folderName, color); break;
      }
      created++;
    } catch (err) {
      log.error(`Failed to create folder "${folderName}":`, err);
      failed++;
    }
  }

  return { created, failed, undoData, hallucinatedIds, duplicateIds: Array.from(duplicateIds) };
}