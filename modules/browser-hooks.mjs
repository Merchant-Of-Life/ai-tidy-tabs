// modules/browser-hooks.mjs
import { log } from "./config.mjs";
import { getExistingGroupNames } from "./tabs.mjs";
import { readRules, addRule, removeRule, findRuleForUrl } from "./rules.mjs";
import { showNotification } from "./notify.mjs";
import { StateManager } from "./unload.mjs";

let _contextMenuTab = null;

export function setupTabContextMenu() {
  const tabMenu = document.getElementById("tabContextMenu");
  if (!tabMenu) {
    log.warn("tabContextMenu not found — context menu items will not be added.");
    return false;
  }

  if (StateManager.get("contextMenuInstalled")) return true;
  StateManager.set("contextMenuInstalled", true);

  const menuItem = document.createXULElement("menu");
  menuItem.id = "context_aiFolderSorter_addRule";
  menuItem.setAttribute("label", "Always sort this site into...");
  menuItem.setAttribute("accesskey", "s");

  const submenu = document.createXULElement("menupopup");
  submenu.id = "context_aiFolderSorter_addRule_submenu";
  menuItem.appendChild(submenu);

  submenu.addEventListener("popupshowing", (e) => {
    e.stopPropagation();
    populateAddRuleSubmenu(submenu);
  });

  const moveToGroup = document.getElementById("context_moveTabToGroup");
  if (moveToGroup && moveToGroup.parentNode) {
    moveToGroup.parentNode.insertBefore(menuItem, moveToGroup.nextSibling);
  } else {
    tabMenu.appendChild(menuItem);
  }

  const tracker = () => {
    _contextMenuTab = gBrowser?.selectedTab || null;
  };
  tabMenu.addEventListener("popupshowing", tracker);
  StateManager.set("contextMenuTracker", tracker);

  log.debug("Context menu item added to tabContextMenu");
  return true;
}

function populateAddRuleSubmenu(submenu) {
  while (submenu.firstChild) submenu.removeChild(submenu.firstChild);

  const tab = _contextMenuTab || gBrowser?.selectedTab;
  const url = tab?.linkedBrowser?.currentURI?.spec || "";
  let hostname = "";
  try {
    hostname = url ? new URL(url).hostname : "";
  } catch {}

  const parentMenu = submenu.parentNode;
  if (parentMenu && hostname) {
    parentMenu.setAttribute("label", `Always sort ${hostname} into...`);
  }

  if (!hostname) {
    if (parentMenu) parentMenu.hidden = true;
    return;
  }
  if (parentMenu) parentMenu.hidden = false;

  const currentRule = findRuleForUrl(url);
  const existingGroups = getExistingGroupNames();

  const folderSet = new Set(existingGroups);
  for (const r of readRules()) folderSet.add(r.folder);
  const folders = Array.from(folderSet).sort((a, b) => a.localeCompare(b));

  for (const folder of folders) {
    const item = document.createXULElement("menuitem");
    item.setAttribute("label", folder);
    if (currentRule && currentRule.folder === folder) {
      item.setAttribute("checked", "true");
    }
    item.addEventListener("command", () => {
      addRule(hostname, folder, null);
      showNotification(`✅ Added rule: ${hostname} → ${folder}`, "success");
    });
    submenu.appendChild(item);
  }

  if (folders.length > 0) {
    const sep = document.createXULElement("menuseparator");
    submenu.appendChild(sep);
  }

  const newFolderItem = document.createXULElement("menuitem");
  newFolderItem.setAttribute("label", "✨ New folder...");
  newFolderItem.addEventListener("command", () => {
    const name = prompt(
      `Create a new folder rule for ${hostname}.\n\nFolder name:`,
      "💻 New Folder"
    );
    if (name && name.trim()) {
      addRule(hostname, name.trim(), null);
      showNotification(
        `✅ Added rule: ${hostname} → ${name.trim()}`,
        "success"
      );
    }
  });
  submenu.appendChild(newFolderItem);

  if (currentRule) {
    const removeItem = document.createXULElement("menuitem");
    removeItem.setAttribute(
      "label",
      `🗑️ Remove rule (${currentRule.domain} → ${currentRule.folder})`
    );
    removeItem.addEventListener("command", () => {
      removeRule(currentRule.domain);
      showNotification(`🗑️ Removed rule for ${currentRule.domain}`, "success");
    });
    submenu.appendChild(removeItem);
  }
}