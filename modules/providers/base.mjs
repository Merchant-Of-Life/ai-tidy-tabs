// modules/providers/base.mjs
import { log } from "../config.mjs";

export function getSystemPrompt(existingGroups = [], enableIcons = true) {
  const normalizedGroups = existingGroups.map((g) => String(g || "").trim()).filter(Boolean);
  const existingGroupsText = normalizedGroups.length > 0
    ? `\n\nCRITICAL: The user already has these folders: ${JSON.stringify(normalizedGroups)}. You MUST prioritize putting tabs into these existing folders if they fit. When reusing an existing folder, return its name EXACTLY as given.`
    : "";

  const emojiRule = enableIcons
    ? `2. Prepend a highly relevant Emoji to every NEW folder name you create.`
    : `2. DO NOT use emojis or icons in folder names.`;

  return `You are a tab categorization engine. You will receive a JSON array of browser tabs, each with an "id" (an integer), "title", and "url".

Your task:
1. Analyze the tabs and categorize them into short, logical folder names.
${emojiRule}
3. Assign an appropriate color for each folder from this list: "blue", "cyan", "green", "orange", "purple", "red", "yellow", "pink".
4. Aim for 2-7 folders. Do not create a folder for a single tab unless it truly doesn't fit elsewhere.
5. Every tab ID from the input MUST appear in exactly one folder in the output. Do NOT omit any tab. Do NOT put a tab in more than one folder.
6. Tab IDs in the output MUST be integers (e.g. 5), not strings (e.g. "5").${existingGroupsText}

Return ONLY a valid JSON object. No markdown fences, no explanation, no extra text.
The JSON format must be exactly like this:
{
  "💻 Development": {
    "color": "blue",
    "tabs": [1, 2]
  }
}`;
}

export class AIProvider {
  constructor(config) {
    this.config = config;
  }

  buildRequest(payload, existingGroups) { throw new Error("implement"); }
  parseResponse(body) { throw new Error("implement"); }

  get maxRetries() { return 2; }
  get backoffMs() { return 1000; }

  async fetchWithRetry(url, options) {
    // FIX: lastErr used to stay `undefined` if every attempt hit a 429 —
    // throwing `undefined` instead of an Error crashes the caller when it
    // reads `err.name`. Now it's always a real Error.
    let lastErr = new Error("Request failed after retries (no response received).");
    for (let i = 0; i <= this.maxRetries; i++) {
      try {
        const res = await fetch(url, options);
        if (res.status === 429) {
          lastErr = new Error(`HTTP 429: rate limited after ${this.maxRetries + 1} attempt(s).`);
          const delay = this.backoffMs * (2 ** i);
          log.warn(`Rate limited. Retrying in ${delay}ms...`);
          await new Promise((resolve, reject) => {
            const timer = setTimeout(resolve, delay);
            if (options.signal) {
              options.signal.addEventListener('abort', () => {
                clearTimeout(timer);
                reject(new DOMException("Aborted", "AbortError"));
              }, { once: true });
            }
          });
          continue;
        }
        if (!res.ok) {
            const errText = await res.text().catch(() => "");
            throw new Error(`HTTP ${res.status}: ${res.statusText} - ${errText}`);
        }
        return res;
      } catch (e) {
        if (e.name === "AbortError" || e.message === "Aborted") throw e;
        lastErr = e;
      }
    }
    throw lastErr;
  }
}