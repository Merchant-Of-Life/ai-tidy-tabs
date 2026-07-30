<div align="center">

# 🧹🧠 AI Tidy Tabs

**An intelligent, AI-powered tab organization mod for Zen Browser.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Platform: Zen Browser](https://img.shields.io/badge/Browser-Zen-black?logo=firefox&logoColor=white)](https://zen-browser.app/)
[![Mod Loader: Sine](https://img.shields.io/badge/Powered%20by-Sine-blueviolet)](https://github.com/CosmoCreeper/Sine)
[![Version: 1.0.0](https://img.shields.io/badge/Version-1.0.0-success)](#)

*Automatically organize, group, and clean up messy tabs using the power of AI (Gemini, Ollama, OpenAI) natively integrated into your browser's UI.*

[Features](#-features) • [Installation](#-installation) • [Configuration](#-configuration) • [How it Works](#-how-it-works)

---

*(Screenshot placeholder - Add a GIF or image of the Wand button in action here)*

</div>

## 🌟 Features

* **🪄 Native UI Integration:** Adds a beautiful "Magic Wand" button directly to your Zen Browser sidebar/tab strip.
* **🧠 Smart AI Grouping:** Analyzes your open tabs and categorizes them into logical, beautifully named workspaces/folders.
* **⚡ Provider Agnostic:** Use cloud AI like **Gemini** or **OpenAI**, or run it 100% locally and privately using **Ollama**.
* **⚙️ Custom Domain Rules:** Set strict overrides (e.g., all `github.com` tabs always go to "Development") bypassing the AI for speed.
* **🖱️ Context Menu Hooks:** Right-click any tab to quickly add its domain to your custom rules list.
* **🧩 Modular Architecture:** Built exclusively for the [Sine Mod Loader](https://github.com/CosmoCreeper/Sine) using ES Modules.

---

## 🚀 Installation

Because this mod hooks deeply into the browser UI, it requires the **Sine Mod Loader** (which comes pre-installed in modern Zen Browser builds).

### Step 1: Allow Local Scripts in Sine
By default, Sine blocks JavaScript from mods that aren't downloaded from the official store. Since you are installing this from GitHub, you must allow it:
1. Type `about:config` in your URL bar and press Enter.
2. Accept the risk warning.
3. Search for `sine.allow-unsafe-js`.
4. Double-click it to set it to **`true`**.

### Step 2: Install the Mod
1. Open Zen Browser Settings and navigate to the **Mods** section.
2. Click **Open Mods Directory**. (This opens `[Profile Folder]/chrome/sine-mods/`).
3. Inside `sine-mods`, create a new folder named exactly **`ai-folder-sorter`**.
4. Download or clone this repository and place **all files** inside that new folder.
   > *Note: Make sure the `modules` folder is strictly lowercase!*
5. **Restart Zen Browser**. 
6. Go back to the **Mods** section in settings, find **AI Folder Sorter**, and enable it!

---

## ⚙️ Configuration

You can configure the AI provider directly from the Sine Mod settings UI!

1. Open Zen Settings -> **Mods**.
2. Click the ⚙️ **Settings icon** next to **AI Folder Sorter**.
3. **Choose your Provider**:
   * **Gemini (Recommended):** Enter your free Google Gemini API key.
   * **Ollama (Local/Private):** Ensure Ollama is running locally on port `11434`.
   * **Custom / OpenAI:** Enter your custom endpoint URL and Bearer token.

---

## 📁 Repository Structure

```text
ai-tidy-tabs/
├── ai-folder-sorter.uc.mjs  # Main entry script for the Sine Bootloader
├── theme.json               # Sine Mod manifest and metadata
├── preferences.json         # Settings UI schema for Zen Settings
├── userChrome.css           # Visual styling for the Wand button and UI
└── modules/                 # Core ES Modules logic
    ├── ai.mjs               # API requests & prompt engineering
    ├── browser-hooks.mjs    # Right-click context menus
    ├── browser-ui.mjs       # UI injection & workspace listeners
    ├── click-handler.mjs    # The main sorting pipeline
    ├── config.mjs           # Constants and logging
    ├── groups.mjs           # Folder creation and tab moving
    ├── notify.mjs           # Status toasts and error messages
    └── rules.mjs            # Hardcoded domain bypassing logic
```

## 🤝 Contributing
Contributions, issues, and feature requests are welcome! Feel free to check the [issues page](https://github.com/blood0jade-bot/ai-tidy-tabs/issues).

## 📝 License
Distributed under the **MIT License**. See `LICENSE` for more information.

<div align="center">
  <sub>Built with ❤️ for the Zen Browser community.</sub>
</div>
