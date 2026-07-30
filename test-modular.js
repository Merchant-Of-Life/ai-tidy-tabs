// tests/test-modular.js
// Structural verification tests for the modular architecture.
// Run: node tests/test-modular.js
//
// These tests verify that:
//   1. All required files exist with the correct extensions
//   2. Each module exports the expected functions
//   3. The entry point imports from all modules
//   4. theme.json is valid and references the correct files
//   5. No .uc.js files exist (Sine only loads .uc.mjs)

const fs = require("fs");
const path = require("path");
const assert = require("assert");

const ROOT = path.resolve(__dirname, "..");

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

// ── File structure ──────────────────────────────────────────────

test("Entry point is .uc.mjs (not .uc.js)", () => {
  assert.ok(
    fs.existsSync(path.join(ROOT, "ai-folder-sorter.uc.mjs")),
    "ai-folder-sorter.uc.mjs exists"
  );
  assert.ok(
    !fs.existsSync(path.join(ROOT, "ai-folder-sorter.uc.js")),
    "ai-folder-sorter.uc.js does NOT exist"
  );
});

test("modules/ directory exists with 9 module files", () => {
  const modulesDir = path.join(ROOT, "modules");
  assert.ok(fs.existsSync(modulesDir), "modules/ directory exists");

  const expected = [
    "config.mjs",
    "tabs.mjs",
    "rules.mjs",
    "ai.mjs",
    "groups.mjs",
    "notify.mjs",
    "browser-ui.mjs",
    "browser-hooks.mjs",
    "click-handler.mjs",
  ];

  for (const name of expected) {
    assert.ok(
      fs.existsSync(path.join(modulesDir, name)),
      `modules/${name} exists`
    );
  }
});

test("All required root files exist", () => {
  for (const f of ["userChrome.css", "theme.json", "preferences.json", "README.md", "LICENSE", "CHANGELOG.md", ".gitignore"]) {
    assert.ok(fs.existsSync(path.join(ROOT, f)), `${f} exists`);
  }
});

// ── Module exports ──────────────────────────────────────────────

test("config.mjs exports CONFIG, LOG, BUILD_VERSION, log", () => {
  const src = fs.readFileSync(path.join(ROOT, "modules/config.mjs"), "utf8");
  assert.ok(src.includes("export const LOG"), "exports LOG");
  assert.ok(src.includes("export const BUILD_VERSION"), "exports BUILD_VERSION");
  assert.ok(src.includes("export const CONFIG"), "exports CONFIG");
  assert.ok(src.includes("export const log"), "exports log");
});

test("tabs.mjs exports extractTabData, domCache, getExistingGroupNames", () => {
  const src = fs.readFileSync(path.join(ROOT, "modules/tabs.mjs"), "utf8");
  assert.ok(src.includes("export function extractTabData"), "exports extractTabData");
  assert.ok(src.includes("export const domCache"), "exports domCache");
  assert.ok(src.includes("export function getExistingGroupNames"), "exports getExistingGroupNames");
});

test("rules.mjs exports readRules, saveRules, addRule, removeRule, findRuleForUrl, applyRulesToTabs", () => {
  const src = fs.readFileSync(path.join(ROOT, "modules/rules.mjs"), "utf8");
  for (const fn of ["readRules", "saveRules", "addRule", "removeRule", "findRuleForUrl", "applyRulesToTabs"]) {
    assert.ok(src.includes(`export function ${fn}`), `exports ${fn}`);
  }
});

test("ai.mjs exports getSystemPrompt, normalizeFolderName, requestAICategorization", () => {
  const src = fs.readFileSync(path.join(ROOT, "modules/ai.mjs"), "utf8");
  assert.ok(src.includes("export function getSystemPrompt"), "exports getSystemPrompt");
  assert.ok(src.includes("export function normalizeFolderName"), "exports normalizeFolderName");
  assert.ok(src.includes("export async function requestAICategorization"), "exports requestAICategorization");
});

test("groups.mjs exports detectStrategy, createFoldersAndMoveTabs", () => {
  const src = fs.readFileSync(path.join(ROOT, "modules/groups.mjs"), "utf8");
  assert.ok(src.includes("export function detectStrategy"), "exports detectStrategy");
  assert.ok(src.includes("export async function createFoldersAndMoveTabs"), "exports createFoldersAndMoveTabs");
});

test("notify.mjs exports showNotification", () => {
  const src = fs.readFileSync(path.join(ROOT, "modules/notify.mjs"), "utf8");
  assert.ok(src.includes("export function showNotification"), "exports showNotification");
});

test("browser-ui.mjs exports setupCommand, addButtonToAllSeparators, setupWorkspaceHooks, injectFloatingFallbackButton", () => {
  const src = fs.readFileSync(path.join(ROOT, "modules/browser-ui.mjs"), "utf8");
  for (const fn of ["setupCommand", "addButtonToAllSeparators", "setupWorkspaceHooks", "injectFloatingFallbackButton"]) {
    assert.ok(src.includes(`export function ${fn}`), `exports ${fn}`);
  }
});

test("browser-hooks.mjs exports setupTabContextMenu", () => {
  const src = fs.readFileSync(path.join(ROOT, "modules/browser-hooks.mjs"), "utf8");
  assert.ok(src.includes("export function setupTabContextMenu"), "exports setupTabContextMenu");
});

test("click-handler.mjs exports handleSortClick", () => {
  const src = fs.readFileSync(path.join(ROOT, "modules/click-handler.mjs"), "utf8");
  assert.ok(src.includes("export async function handleSortClick"), "exports handleSortClick");
});

// ── Entry point ─────────────────────────────────────────────────

test("Entry point imports from all modules", () => {
  const src = fs.readFileSync(path.join(ROOT, "ai-folder-sorter.uc.mjs"), "utf8");
  for (const mod of ["config", "browser-ui", "browser-hooks", "groups", "click-handler"]) {
    assert.ok(src.includes(`./modules/${mod}.mjs`), `imports from ${mod}.mjs`);
  }
});

test("Entry point is under 150 lines", () => {
  const src = fs.readFileSync(path.join(ROOT, "ai-folder-sorter.uc.mjs"), "utf8");
  const lines = src.split("\n").length;
  assert.ok(lines < 150, `entry point is ${lines} lines (should be < 150)`);
});

// ── theme.json ──────────────────────────────────────────────────

test("theme.json is valid JSON with correct structure", () => {
  const theme = JSON.parse(fs.readFileSync(path.join(ROOT, "theme.json"), "utf8"));
  assert.strictEqual(theme.id, "ai-folder-sorter");
  assert.strictEqual(theme.version, "1.5.0");
  assert.ok(theme.scripts["ai-folder-sorter.uc.mjs"], "references .uc.mjs");
  assert.ok(!theme.scripts["ai-folder-sorter.uc.js"], "does NOT reference .uc.js");
  assert.strictEqual(theme.preferences, "preferences.json");
  assert.ok("supportsUnload" in theme, "has supportsUnload");
  assert.ok("ai" in theme, "has ai field");
});

// ── Version consistency ─────────────────────────────────────────

test("Version is 1.5.0 across all files", () => {
  const entrySrc = fs.readFileSync(path.join(ROOT, "ai-folder-sorter.uc.mjs"), "utf8");
  const configSrc = fs.readFileSync(path.join(ROOT, "modules/config.mjs"), "utf8");
  const theme = JSON.parse(fs.readFileSync(path.join(ROOT, "theme.json"), "utf8"));

  assert.ok(entrySrc.includes("@version        1.5.0"), "entry point version header");
  assert.ok(configSrc.includes('BUILD_VERSION = "1.5.0"'), "config BUILD_VERSION");
  assert.strictEqual(theme.version, "1.5.0", "theme.json version");
});

// ── Syntax validation ───────────────────────────────────────────

test("All .mjs files pass Node syntax check", () => {
  const { execSync } = require("child_process");
  const files = [
    "ai-folder-sorter.uc.mjs",
    "modules/config.mjs",
    "modules/tabs.mjs",
    "modules/rules.mjs",
    "modules/ai.mjs",
    "modules/groups.mjs",
    "modules/notify.mjs",
    "modules/browser-ui.mjs",
    "modules/browser-hooks.mjs",
    "modules/click-handler.mjs",
  ];

  for (const f of files) {
    const fullPath = path.join(ROOT, f);
    try {
      execSync(`node --check "${fullPath}"`, { stdio: "pipe" });
    } catch (e) {
      assert.fail(`${f} has a syntax error: ${e.stderr?.toString() || e.message}`);
    }
  }
});

// ── Key features present ────────────────────────────────────────

test("Rules system is present and integrated", () => {
  const clickSrc = fs.readFileSync(path.join(ROOT, "modules/click-handler.mjs"), "utf8");
  assert.ok(clickSrc.includes("applyRulesToTabs"), "click-handler calls applyRulesToTabs");
  assert.ok(clickSrc.includes("Rules phase"), "click-handler has rules phase");
  assert.ok(clickSrc.includes("AI call skipped"), "AI is skipped when all tabs match rules");
});

test("Floating fallback button is present", () => {
  const uiSrc = fs.readFileSync(path.join(ROOT, "modules/browser-ui.mjs"), "utf8");
  assert.ok(uiSrc.includes("injectFloatingFallbackButton"), "function exists");
  assert.ok(uiSrc.includes("ai-folder-sorter-fallback"), "uses unique ID");
});

test("Context menu is present", () => {
  const hooksSrc = fs.readFileSync(path.join(ROOT, "modules/browser-hooks.mjs"), "utf8");
  assert.ok(hooksSrc.includes("Always sort"), "has 'Always sort' label");
  assert.ok(hooksSrc.includes("New folder"), "has 'New folder' option");
  assert.ok(hooksSrc.includes("Remove rule"), "has 'Remove rule' option");
});

test("AbortController timeout is present", () => {
  const aiSrc = fs.readFileSync(path.join(ROOT, "modules/ai.mjs"), "utf8");
  assert.ok(aiSrc.includes("AbortController"), "uses AbortController");
  assert.ok(aiSrc.includes("FETCH_TIMEOUT_MS"), "respects timeout config");
});

// ── Run ─────────────────────────────────────────────────────────

(async () => {
  let pass = 0, fail = 0;
  for (const { name, fn } of tests) {
    try {
      await fn();
      console.log(`  ✓ ${name}`);
      pass++;
    } catch (e) {
      console.log(`  ✗ ${name}`);
      console.log(`      ${e.message}`);
      fail++;
    }
  }
  console.log("");
  console.log(`Result: ${pass} passed, ${fail} failed (of ${tests.length})`);
  process.exit(fail > 0 ? 1 : 0);
})();
