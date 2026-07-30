// modules/rules.mjs
// Domain → folder rules that bypass AI.
//
// Rules are stored as JSON in the pref zen.ai-folder-sorter.rules-json.
// Format:
//   [{"domain": "github.com", "folder": "💻 Dev", "color": "blue"}, ...]
//
// When the user triggers a sort, we first check every open tab against
// the rules. Tabs that match go straight into their assigned folder.
// Only the remaining tabs are sent to the AI.

import { CONFIG, log } from "./config.mjs";

/** Read rules from the pref. Returns an array (never throws). */
export function readRules() {
  try {
    const raw = Services.prefs.getStringPref(CONFIG.RULES_PREF, "[]");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (r) =>
        r && typeof r.domain === "string" && typeof r.folder === "string"
    );
  } catch (e) {
    log.warn("Failed to read rules pref:", e);
    return [];
  }
}

/** Save the rules array to the pref. */
export function saveRules(rules) {
  try {
    Services.prefs.setStringPref(CONFIG.RULES_PREF, JSON.stringify(rules));
    log.info(`Saved ${rules.length} rule(s) to pref.`);
  } catch (e) {
    log.error("Failed to save rules pref:", e);
  }
}

/**
 * Add or update a rule for a specific domain.
 * If a rule for this domain already exists, it's replaced.
 */
export function addRule(domain, folder, color) {
  if (!domain || !folder) {
    log.warn("addRule: domain and folder are required");
    return;
  }
  const rules = readRules();
  const filtered = rules.filter((r) => r.domain !== domain);
  filtered.push({ domain, folder, color: color || null });
  saveRules(filtered);
}

/** Remove a rule for a specific domain. */
export function removeRule(domain) {
  const rules = readRules();
  const filtered = rules.filter((r) => r.domain !== domain);
  if (filtered.length !== rules.length) {
    saveRules(filtered);
  }
}

/**
 * Find a matching rule for a URL.
 * Matches hostname exactly, then walks up to parent domains
 * (e.g. rule "github.com" matches "docs.github.com").
 */
export function findRuleForUrl(url) {
  if (!url) return null;
  let hostname;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return null;
  }
  if (!hostname) return null;

  const rules = readRules();
  if (rules.length === 0) return null;

  // Exact match first
  let match = rules.find((r) => r.domain === hostname);
  if (match) return match;

  // Parent-domain match
  const parts = hostname.split(".");
  for (let i = 1; i < parts.length - 1; i++) {
    const parent = parts.slice(i).join(".");
    match = rules.find((r) => r.domain === parent);
    if (match) return match;
  }

  return null;
}

/**
 * Apply rules to the extracted tab list.
 * Splits tabs into matched (go to their rule folder) and unmatched (go to AI).
 *
 * @param {Array<{id,title,url}>} payload
 * @param {Map<number, Tab>} tabMap
 * @returns {{matched: Array, unmatched: Array, folderMapping: Object}}
 */
export function applyRulesToTabs(payload, tabMap) {
  const rules = readRules();
  if (rules.length === 0) {
    return { matched: [], unmatched: payload, folderMapping: {} };
  }

  const matched = [];
  const unmatched = [];
  const folderMapping = {};

  for (const tabData of payload) {
    const rule = findRuleForUrl(tabData.url);
    if (rule) {
      matched.push({ tab: tabData, rule });
      if (!folderMapping[rule.folder]) {
        folderMapping[rule.folder] = { tabs: [], color: rule.color };
      }
      folderMapping[rule.folder].tabs.push(tabData.id);
    } else {
      unmatched.push(tabData);
    }
  }

  if (matched.length > 0) {
    log.info(
      `Rules matched ${matched.length}/${payload.length} tabs. ${unmatched.length} will go to AI.`
    );
  }
  return { matched, unmatched, folderMapping };
}
