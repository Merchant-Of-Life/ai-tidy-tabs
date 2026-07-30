// modules/click-handler.mjs
// Main sort pipeline — rules first, then AI.
//
// Pipeline:
//   1. Extract tab data
//   2. Apply rules (domain → folder) — matched tabs bypass AI
//   3. Send unmatched tabs to AI
//   4. Create/merge folders for both phases
//   5. Report results with warnings

import { CONFIG, log } from "./config.mjs";
import { extractTabData, getExistingGroupNames } from "./tabs.mjs";
import { applyRulesToTabs } from "./rules.mjs";
import { requestAICategorization } from "./ai.mjs";
import { createFoldersAndMoveTabs, detectStrategy } from "./groups.mjs";
import { showNotification } from "./notify.mjs";

// Debounce guard — prevents double-clicks from triggering overlapping sorts.
let _lastRun = 0;

function isDebounced() {
  const now = Date.now();
  if (now - _lastRun < CONFIG.DEBOUNCE_MS) {
    log.warn("Action debounced — please wait before clicking again.");
    return true;
  }
  _lastRun = now;
  return false;
}

/**
 * The main sort pipeline. Called when the user clicks the trigger button
 * or presses the keyboard shortcut.
 *
 * @param {Event} event - Click event (may be null when triggered via command)
 */
export async function handleSortClick(event) {
  if (isDebounced()) return;

  // Find ALL instances of our button (one per separator) for visual feedback.
  const buttons = document.querySelectorAll(`#${CONFIG.BUTTON_ID}`);

  buttons.forEach((btn) => {
    btn.setAttribute("disabled", "true");
    btn.classList.add("sorting");
  });

  try {
    log.info("═══ Starting AI tab sort ═══");
    const { tabMap, payload } = extractTabData();

    if (payload.length === 0) {
      showNotification("All tabs are already sorted!", "success");
      return;
    }

    // ── Phase 1.5: Apply rules first ────────────────────────────
    const { matched, unmatched, folderMapping: rulesMapping } =
      applyRulesToTabs(payload, tabMap);

    if (matched.length > 0) {
      log.info(
        `Rules phase: ${matched.length} tab(s) matched. Creating rule folders...`
      );
      const rulesResult = await createFoldersAndMoveTabs(rulesMapping, tabMap);
      log.info(
        `Rules phase complete: ${rulesResult.created} folder(s) created/merged, ${rulesResult.failed} failed.`
      );
    }

    // ── Phase 2: AI categorization for unmatched tabs ──────────
    let aiMapping = {};
    let aiCreated = 0;
    let aiFailed = 0;
    let aiUndoData = [];
    let aiHallucinatedIds = [];
    let aiDuplicateIds = [];

    if (unmatched.length > 0) {
      const existingGroups = getExistingGroupNames();
      // Include folders we just created from rules so AI can merge into them.
      for (const folderName of Object.keys(rulesMapping)) {
        if (!existingGroups.includes(folderName))
          existingGroups.push(folderName);
      }

      log.info(
        `AI phase: sending ${unmatched.length} unmatched tab(s) to AI...`
      );
      aiMapping = await requestAICategorization(unmatched, existingGroups);

      const aiFolderCount = Object.keys(aiMapping).length;
      if (aiFolderCount === 0 && matched.length === 0) {
        showNotification(
          "AI returned empty categorization. Try again.",
          "warning"
        );
        return;
      }

      if (aiFolderCount > 0) {
        log.info(
          `AI suggested ${aiFolderCount} folders:`,
          Object.keys(aiMapping)
        );
        const aiResult = await createFoldersAndMoveTabs(aiMapping, tabMap);
        aiCreated = aiResult.created;
        aiFailed = aiResult.failed;
        aiUndoData = aiResult.undoData;
        aiHallucinatedIds = aiResult.hallucinatedIds || [];
        aiDuplicateIds = aiResult.duplicateIds || [];
      }
    } else if (matched.length > 0) {
      log.info("All tabs matched rules — AI call skipped entirely.");
    }

    // ── Phase 3: Merge results ──────────────────────────────────
    const allFolderMapping = { ...rulesMapping, ...aiMapping };
    const created =
      (matched.length > 0 ? Object.keys(rulesMapping).length : 0) + aiCreated;
    const failed = aiFailed;
    const undoData = aiUndoData;

    // Compute unassigned tab IDs (tabs the AI omitted).
    const assignedSet = new Set();
    for (const fd of Object.values(allFolderMapping)) {
      const ids = Array.isArray(fd) ? fd : fd?.tabs || [];
      for (const id of ids) {
        if (tabMap.has(id)) assignedSet.add(id);
      }
    }
    const unassignedIds = payload
      .map((p) => p.id)
      .filter((id) => !assignedSet.has(id));

    // ── Phase 4: Report ─────────────────────────────────────────
    const warnings = [];
    if (unassignedIds.length > 0)
      warnings.push(`${unassignedIds.length} tab(s) not categorized`);
    if (aiHallucinatedIds.length > 0)
      warnings.push(`${aiHallucinatedIds.length} hallucinated ID(s) ignored`);
    if (aiDuplicateIds.length > 0)
      warnings.push(
        `${aiDuplicateIds.length} duplicate assignment(s) resolved`
      );

    const rulesNote =
      matched.length > 0
        ? ` (${matched.length} via rules, ${unmatched.length} via AI)`
        : "";

    let message, type;
    if (failed === 0 && warnings.length === 0) {
      message = `✨ Sorted ${payload.length} tabs into ${created} folder(s)!${rulesNote}`;
      type = "success";
    } else if (failed === 0) {
      message = `✨ Sorted ${payload.length} tabs into ${created} folder(s).${rulesNote} Warnings: ${warnings.join(", ")}.`;
      type = "warning";
    } else {
      message = `Sorted into ${created} folder(s); ${failed} failed. ${warnings.length ? "Warnings: " + warnings.join(", ") + "." : ""} Check console.`;
      type = "warning";
    }
    showNotification(message, type, undoData);

    log.info(
      `═══ Sort complete: ${created} created, ${failed} failed ═══`
    );
  } catch (err) {
    log.error("Sort pipeline failed:", err);
    showNotification(`Sort failed: ${err.message}`, "error");
  } finally {
    buttons.forEach((btn) => {
      btn.removeAttribute("disabled");
      btn.classList.remove("sorting");
    });
  }
}
