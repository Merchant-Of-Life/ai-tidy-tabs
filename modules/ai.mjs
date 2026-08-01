// modules/ai.mjs
import { CONFIG, log } from "./config.mjs";
import { GeminiProvider } from "./providers/gemini.mjs";
import { OllamaProvider } from "./providers/ollama.mjs";
import { CustomProvider } from "./providers/custom.mjs";

const REGISTRY = {
  gemini: GeminiProvider,
  ollama: OllamaProvider,
  custom: CustomProvider,
};

const _cache = new Map();
const CACHE_MAX = 50;

function getCacheKey(payload, existingGroups, provider, model) {
  const str = [provider, model, existingGroups.slice().sort().join(","), payload.map(t => t.url).join('\0')].join('\u0001');
  let h = 0;
  for (let i = 0; i < str.length; i++) { h = ((h << 5) - h) + str.charCodeAt(i); h |= 0; }
  return h;
}

function estimateTokens(tab) {
  const text = `${tab.title} ${tab.url}`;
  return Math.ceil(text.length / 3.5) + 15; 
}

function createSmartBatches(payload, maxTokens = 6000) {
  const batches = [];
  let current = [];
  let currentTokens = 0;
  
  for (const tab of payload) {
    const t = estimateTokens(tab);
    if (currentTokens + t > maxTokens && current.length > 0) {
      batches.push(current);
      current = [tab];
      currentTokens = t;
    } else {
      current.push(tab);
      currentTokens += t;
    }
  }
  if (current.length) batches.push(current);
  return batches;
}

export async function requestAICategorization(payload, existingGroups = [], signal) {
  const modelForProvider = CONFIG.PROVIDER === "gemini" ? CONFIG.GEMINI_MODEL
    : CONFIG.PROVIDER === "ollama" ? CONFIG.OLLAMA_MODEL
    : CONFIG.CUSTOM_MODEL;
  const key = getCacheKey(payload, existingGroups, CONFIG.PROVIDER, modelForProvider);
  if (_cache.has(key)) {
    log.info("Cache hit — returning cached categorization");
    return _cache.get(key);
  }

  const ProviderClass = REGISTRY[CONFIG.PROVIDER];
  if (!ProviderClass) throw new Error(`Unknown AI provider: "${CONFIG.PROVIDER}".`);

  const provider = new ProviderClass(CONFIG);

  if (provider.healthCheck && !(await provider.healthCheck())) {
    throw new Error("Local provider is not responding. Is it running?");
  }

  const batches = createSmartBatches(payload);
  if (batches.length > 1) {
    log.info(`Splitting ${payload.length} tabs into ${batches.length} smart batches based on token estimates.`);
  }

  const merged = {};

  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b];
    log.info(`Sending batch ${b + 1}/${batches.length} (${batch.length} tabs) via ${CONFIG.PROVIDER}...`);

    const { url, options } = provider.buildRequest(batch, existingGroups);
    const fetchOptions = { ...options, signal };

    const response = await provider.fetchWithRetry(url, fetchOptions);
    const body = await response.json();
    const text = provider.parseResponse(body);
    const batchResult = parseResponseText(text);

    for (const [folderName, folderData] of Object.entries(batchResult)) {
      if (merged[folderName]) {
        merged[folderName].tabs.push(...folderData.tabs);
        if (!merged[folderName].color && folderData.color) {
          merged[folderName].color = folderData.color;
        }
      } else {
        merged[folderName] = { tabs: [...folderData.tabs], color: folderData.color };
      }
    }
  }

  if (_cache.size >= CACHE_MAX) _cache.delete(_cache.keys().next().value);
  _cache.set(key, merged);

  return merged;
}

export function normalizeFolderName(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function parseResponseText(rawText) {
  rawText = rawText.trim();
  if (rawText.startsWith("```")) {
    rawText = rawText.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
  }

  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch (e) {
    throw new Error(`AI returned invalid JSON:\n${rawText.slice(0, 500)}`);
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`AI returned unexpected type: expected object, got ${typeof parsed}`);
  }

  const normalized = {};
  for (const [folder, value] of Object.entries(parsed)) {
    let tabIds;
    let color;

    if (Array.isArray(value)) {
      tabIds = value;
    } else if (value && typeof value === "object" && Array.isArray(value.tabs)) {
      tabIds = value.tabs;
      color = value.color;
    } else {
      throw new Error(`Folder "${folder}" has non-array value.`);
    }

    const coerced = [];
    for (const id of tabIds) {
      let n;
      if (typeof id === "number" && Number.isFinite(id)) n = Math.trunc(id);
      else if (typeof id === "string" && /^-?\d+$/.test(id.trim())) n = parseInt(id.trim(), 10);
      else continue;
      coerced.push(n);
    }
    normalized[folder] = { tabs: coerced, color };
  }
  return normalized;
}