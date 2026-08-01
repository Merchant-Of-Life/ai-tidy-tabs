// modules/config.mjs
// Constants, configuration, and structured logger.
// Every other module imports from here.

export const LOG = "[AI-FolderSorter]";
export const BUILD_VERSION = "1.0.0";

export const CONFIG = {
  // ── AI Provider Settings ───────────────────────────────────────
  get PROVIDER() {
    return Services.prefs.getStringPref(
      "zen.ai-folder-sorter.provider",
      "custom"
    );
  },

  // Gemini
  get GEMINI_API_KEY() {
    return Services.prefs.getStringPref("zen.ai-folder-sorter.gemini_api_key", "");
  },
  get GEMINI_MODEL() {
    return Services.prefs.getStringPref(
      "zen.ai-folder-sorter.gemini_model",
      "gemini-2.5-flash"
    );
  },
  GEMINI_ENDPOINT:
    "https://generativelanguage.googleapis.com/v1beta/models",

  // Ollama (local)
  get OLLAMA_ENDPOINT() {
    return Services.prefs.getStringPref(
      "zen.ai-folder-sorter.ollama_endpoint",
      "http://localhost:11434/api/chat"
    );
  },
  get OLLAMA_MODEL() {
    return Services.prefs.getStringPref(
      "zen.ai-folder-sorter.ollama_model",
      "llama3.1:8b"
    );
  },

  // Custom (OpenAI-compatible: Groq, OpenAI, LM Studio, vLLM, etc.)
  get CUSTOM_ENDPOINT() {
    return Services.prefs.getStringPref(
      "zen.ai-folder-sorter.endpoint",
      "https://api.groq.com/openai/v1/chat/completions"
    );
  },
  get CUSTOM_API_KEY() {
    return Services.prefs.getStringPref("zen.ai-folder-sorter.api_key", "");
  },
  get CUSTOM_MODEL() {
    return Services.prefs.getStringPref(
      "zen.ai-folder-sorter.model",
      "llama-3.3-70b-versatile"
    );
  },

  // ── Behavior ───────────────────────────────────────────────────
  MAX_TABS_PER_REQUEST: 100,
  FETCH_TIMEOUT_MS: 60000,
  VALID_COLORS: new Set([
    "blue", "cyan", "green", "grey", "orange",
    "pink", "purple", "red", "yellow",
  ]),
  GROUP_COLORS: [
    "blue", "cyan", "green", "orange",
    "purple", "red", "yellow", "pink",
  ],
  SKIP_PINNED_TABS: true,
  get ENABLE_ICONS() {
    return Services.prefs.getBoolPref(
      "zen.ai-folder-sorter.enable_icons",
      true
    );
  },
  SKIP_GROUPED_TABS: true,
  DEBOUNCE_MS: 2000,

  // ── Rules system ───────────────────────────────────────────────
  RULES_PREF: "zen.ai-folder-sorter.rules-json",

  // ── Floating fallback button ───────────────────────────────────
  FALLBACK_BUTTON_DELAY_MS: 8000,

  // ── Logging ────────────────────────────────────────────────────
  VERBOSE_LOG: true,

  // ── UI ─────────────────────────────────────────────────────────
  BUTTON_ID: "ai-folder-sorter-btn",
  COMMAND_ID: "cmd_aiFolderSorter",

  // ── Init polling ───────────────────────────────────────────────
  INIT_CHECK_INTERVAL_MS: 100,
  MAX_INIT_CHECKS: 50,

  LOG_PREFIX: LOG,
};

// Structured logger — all modules use this.
export const log = {
  info: (...args) => console.info(LOG, ...args),
  warn: (...args) => console.warn(LOG, ...args),
  error: (...args) => console.error(LOG, ...args),
  debug: (...args) => {
    if (CONFIG.VERBOSE_LOG) console.info(LOG, "[debug]", ...args);
    else console.debug(LOG, ...args);
  },
};
