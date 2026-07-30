# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] — 2025-07-30

### Initial release 🎉

AI Folder Sorter for Zen Browser — sort your open tabs into smart folders with one click, powered by AI.

### Added

- **Multi-provider AI support** — works with Google Gemini, local Ollama, or any OpenAI-compatible endpoint (Groq, OpenAI, LM Studio, vLLM, etc.)
- **Rules system** — pin specific domains to specific folders (`github.com → 💻 Dev`). Rules are checked before the AI call, so matched tabs bypass AI entirely and save tokens
- **Right-click context menu** — right-click any tab → "Always sort `[hostname]` into..." to add a rule instantly, with a submenu of existing folders plus "New folder..." and "Remove rule"
- **Smart folder matching** — case-insensitive, whitespace-insensitive matching prevents duplicate folders when the AI returns slightly different names
- **Color validation** — AI-suggested colors validated against Zen's palette; invalid colors fall back to a deterministic cycle
- **Fetch timeout** — 60-second `AbortController` timeout prevents the button from getting stuck if the AI hangs
- **Tab batching** — large tab sets (>100 tabs) are split into batches to respect token limits
- **Floating fallback button** — if sidebar injection fails, a draggable purple button appears in the top-right corner so you can still trigger sorts
- **Keyboard shortcut** — `Ctrl+Shift+S` (`Cmd+Shift+S` on Mac) triggers a sort without clicking
- **Undo support** — notifications include an Undo button to revert the last sort
- **Workspace hooks** — hooks `gZenWorkspaces.onTabBrowserInserted` and `updateTabsContainers` so the button re-injects on workspace switches
- **Verbose logging** — every init step is logged to the Browser Console for easy debugging
- **Modular architecture** — 10 focused ES modules, each with a single responsibility

### Architecture

```
ai-folder-sorter.uc.mjs          Entry point (~145 lines — just imports + init)
├── modules/
│   ├── config.mjs               Constants, CONFIG, log helper
│   ├── tabs.mjs                 Tab extraction, DOM cache, group lookup
│   ├── rules.mjs                Domain→folder rules system
│   ├── ai.mjs                   System prompt, request building, parsing
│   ├── groups.mjs               Folder creation strategies
│   ├── notify.mjs               Notification bar + toast fallback
│   ├── browser-ui.mjs           Button injection, command, workspace hooks
│   ├── browser-hooks.mjs        Right-click context menu
│   └── click-handler.mjs        Main sort pipeline (rules → AI → folders)
├── userChrome.css               Button styles + animations
├── theme.json                   Sine mod metadata
└── preferences.json             Settings panel definition
```
