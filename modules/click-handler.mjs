// modules/click-handler.mjs
import { CONFIG, log } from "./config.mjs";
import { extractTabData, getExistingGroupNames } from "./tabs.mjs";
import { applyRulesToTabs } from "./rules.mjs";
import { requestAICategorization } from "./ai.mjs";
import { createFoldersAndMoveTabs } from "./groups.mjs";
import { showNotification } from "./notify.mjs";
import { setButtonState, setButtonStage } from "./browser-ui.mjs";

let _lastRun = 0;
let currentAbortController = null;

function isDebounced() {
  const now = Date.now();
  if (now - _lastRun < CONFIG.DEBOUNCE_MS) {
    return true;
  }
  _lastRun = now;
  return false;
}

export async function handleSortClick(event) {
  if (isDebounced()) return;

  if (currentAbortController) {
    currentAbortController.abort();
  }
  currentAbortController = new AbortController();
  const signal = currentAbortController.signal;

  setButtonState("processing");

  try {
    const { tabMap, payload } = extractTabData();

    if (payload.length === 0) {
      showNotification("All tabs are already sorted!", "success");
      setButtonState("success");
      return;
    }

    setButtonStage("rules");
    const { matched, unmatched, folderMapping: rulesMapping } = applyRulesToTabs(payload, tabMap);

    let totalUndoData = [];

    if (matched.length > 0) {
      setButtonStage("grouping");
      const rulesResult = await createFoldersAndMoveTabs(rulesMapping, tabMap);
      totalUndoData = totalUndoData.concat(rulesResult.undoData || []);
    }

    let aiMapping = {};
    let aiCreated = 0;
    let aiFailed = 0;
    let aiHallucinatedIds = [];
    let aiDuplicateIds = [];

    if (unmatched.length > 0) {
      setButtonStage("ai");
      const existingGroups = getExistingGroupNames();
      for (const folderName of Object.keys(rulesMapping)) {
        if (!existingGroups.includes(folderName)) existingGroups.push(folderName);
      }
      
      aiMapping = await requestAICategorization(unmatched, existingGroups, signal);

      const aiFolderCount = Object.keys(aiMapping).length;
      if (aiFolderCount === 0 && matched.length === 0) {
        showNotification("AI returned empty categorization. Try again.", "warning");
        setButtonState("success");
        return;
      }

      if (aiFolderCount > 0) {
        setButtonStage("grouping");
        const aiResult = await createFoldersAndMoveTabs(aiMapping, tabMap);
        aiCreated = aiResult.created;
        aiFailed = aiResult.failed;
        totalUndoData = totalUndoData.concat(aiResult.undoData || []);
        aiHallucinatedIds = aiResult.hallucinatedIds || [];
        aiDuplicateIds = aiResult.duplicateIds || [];
      }
    }

    const allFolderMapping = { ...rulesMapping, ...aiMapping };
    const created = (matched.length > 0 ? Object.keys(rulesMapping).length : 0) + aiCreated;
    const failed = aiFailed;
    const undoData = totalUndoData;

    const assignedSet = new Set();
    for (const fd of Object.values(allFolderMapping)) {
      const ids = Array.isArray(fd) ? fd : fd?.tabs || [];
      for (const id of ids) {
        if (tabMap.has(id)) assignedSet.add(id);
      }
    }
    const unassignedIds = payload.map((p) => p.id).filter((id) => !assignedSet.has(id));

    const warnings = [];
    if (unassignedIds.length > 0) warnings.push(`${unassignedIds.length} tab(s) not categorized`);
    if (aiHallucinatedIds.length > 0) warnings.push(`${aiHallucinatedIds.length} hallucinated ID(s) ignored`);
    if (aiDuplicateIds.length > 0) warnings.push(`${aiDuplicateIds.length} duplicate assignment(s) resolved`);

    let message, type;
    if (failed === 0 && warnings.length === 0) {
      message = `✨ Sorted ${payload.length} tabs into ${created} folder(s)!`;
      type = "success";
    } else if (failed === 0) {
      message = `✨ Sorted ${payload.length} tabs into ${created} folder(s). Warnings: ${warnings.join(", ")}.`;
      type = "warning";
    } else {
      message = `Sorted into ${created} folder(s); ${failed} failed. Check console.`;
      type = "warning";
    }
    showNotification(message, type, undoData);
    setButtonState("success");

  } catch (err) {
    if (err.name === "AbortError" || err.message === "Aborted") {
      log.info("AI sort aborted by new click.");
      return;
    }
    log.error("Sort pipeline failed:", err);
    showNotification(`Sort failed: ${err.message}`, "error");
    setButtonState("idle");
  }
}