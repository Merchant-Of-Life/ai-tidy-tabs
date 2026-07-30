// modules/ai.mjs
// System prompt, AI request building, response parsing.
//
// Supports three providers:
//   • Gemini (Google AI Studio)
//   • Ollama (local, no API key)
//   • Custom (any OpenAI-compatible endpoint)

import { CONFIG, log } from "./config.mjs";

/**
 * Build the system prompt for the AI.
 * Includes existing folder names so the AI can reuse them.
 */
export function getSystemPrompt(existingGroups = [], enableIcons = true) {
  const normalizedGroups = existingGroups
    .map((g) => String(g || "").trim())
    .filter(Boolean);

  const existingGroupsText = normalizedGroups.length > 0
    ? `\n\nCRITICAL: The user already has these folders: ${JSON.stringify(normalizedGroups)}. You MUST prioritize putting tabs into these existing folders if they fit. When reusing an existing folder, return its name EXACTLY as given. Do NOT paraphrase existing folder names.`
    : "";

  const emojiRule = enableIcons
    ? `2. Prepend a highly relevant Emoji to every NEW folder name you create (e.g., "💻 Development", "🛒 Shopping", "🎮 Entertainment"). If reusing an existing folder, keep its exact name.`
    : `2. DO NOT use emojis or icons in folder names. Use plain text only.`;

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
  },
  "🛒 Shopping": {
    "color": "pink",
    "tabs": [3]
  }
}`;
}

/** Normalize a folder name for fuzzy comparison (case + whitespace insensitive). */
export function normalizeFolderName(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/**
 * Build the fetch options (URL, headers, body) for the configured provider.
 */
function buildAIRequest(tabPayload, existingGroups = []) {
  const userMessage = JSON.stringify(tabPayload, null, 0);
  const systemPromptText = getSystemPrompt(existingGroups, CONFIG.ENABLE_ICONS);

  switch (CONFIG.PROVIDER) {
    case "gemini": {
      const url = `${CONFIG.GEMINI_ENDPOINT}/${CONFIG.GEMINI_MODEL}:generateContent?key=${CONFIG.GEMINI_API_KEY}`;
      return {
        url,
        options: {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: systemPromptText }] },
            contents: [
              {
                role: "user",
                parts: [
                  {
                    text: `Here are my currently open browser tabs. Categorize them into folders.\n\n${userMessage}`,
                  },
                ],
              },
            ],
            generationConfig: {
              temperature: 0.2,
              responseMimeType: "application/json",
            },
          }),
        },
      };
    }

    case "ollama": {
      return {
        url: CONFIG.OLLAMA_ENDPOINT,
        options: {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: CONFIG.OLLAMA_MODEL,
            messages: [
              { role: "system", content: systemPromptText },
              {
                role: "user",
                content: `Here are my currently open browser tabs. Categorize them into folders.\n\n${userMessage}`,
              },
            ],
            stream: false,
            format: "json",
            options: { temperature: 0.2 },
          }),
        },
      };
    }

    case "custom": {
      const headers = { "Content-Type": "application/json" };
      if (CONFIG.CUSTOM_API_KEY) {
        headers["Authorization"] = `Bearer ${CONFIG.CUSTOM_API_KEY}`;
      }
      return {
        url: CONFIG.CUSTOM_ENDPOINT,
        options: {
          method: "POST",
          headers,
          body: JSON.stringify({
            model: CONFIG.CUSTOM_MODEL,
            messages: [
              { role: "system", content: systemPromptText },
              {
                role: "user",
                content: `Here are my currently open browser tabs. Categorize them into folders.\n\n${userMessage}`,
              },
            ],
            temperature: 0.2,
            response_format: { type: "json_object" },
          }),
        },
      };
    }

    default:
      throw new Error(
        `Unknown AI provider: "${CONFIG.PROVIDER}". Use "gemini", "ollama", or "custom".`
      );
  }
}

/**
 * Parse the AI response body into a normalized folder mapping.
 * Coerces stringified tab IDs to numbers. Strips markdown fences.
 */
async function parseAIResponse(provider, response) {
  if (!response.ok) {
    const errorBody = await response.text().catch(() => "(unreadable)");
    throw new Error(
      `AI API returned HTTP ${response.status}: ${response.statusText}\n${errorBody}`
    );
  }

  const body = await response.json();
  let rawText;

  switch (provider) {
    case "gemini":
      rawText = body?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText)
        throw new Error(
          `Unexpected Gemini response structure:\n${JSON.stringify(body, null, 2).slice(0, 500)}`
        );
      break;

    case "ollama":
      rawText = body?.message?.content;
      if (!rawText)
        throw new Error(
          `Unexpected Ollama response structure:\n${JSON.stringify(body, null, 2).slice(0, 500)}`
        );
      break;

    case "custom":
      rawText = body?.choices?.[0]?.message?.content;
      if (!rawText)
        throw new Error(
          `Unexpected custom API response structure:\n${JSON.stringify(body, null, 2).slice(0, 500)}`
        );
      break;
  }

  rawText = rawText.trim();
  if (rawText.startsWith("```")) {
    rawText = rawText
      .replace(/^```(?:json)?\s*/, "")
      .replace(/\s*```$/, "");
  }

  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch (e) {
    throw new Error(`AI returned invalid JSON:\n${rawText.slice(0, 500)}`);
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(
      `AI returned unexpected type: expected object, got ${typeof parsed}`
    );
  }

  // Normalize each folder's value into { tabs, color }.
  // Coerce stringified numbers to actual numbers.
  const normalized = {};
  for (const [folder, value] of Object.entries(parsed)) {
    let tabIds;
    let color;

    if (Array.isArray(value)) {
      tabIds = value;
    } else if (
      value &&
      typeof value === "object" &&
      Array.isArray(value.tabs)
    ) {
      tabIds = value.tabs;
      color = value.color;
    } else {
      throw new Error(
        `Folder "${folder}" has non-array value: ${JSON.stringify(value)}`
      );
    }

    const coerced = [];
    for (const id of tabIds) {
      let n;
      if (typeof id === "number" && Number.isFinite(id)) {
        n = Math.trunc(id);
      } else if (typeof id === "string" && /^-?\d+$/.test(id.trim())) {
        n = parseInt(id.trim(), 10);
      } else {
        log.warn(
          `Folder "${folder}" contains non-numeric tab ID: ${JSON.stringify(id)} — skipping`
        );
        continue;
      }
      coerced.push(n);
    }
    normalized[folder] = { tabs: coerced, color };
  }

  log.info("AI response parsed successfully:", Object.keys(normalized));
  return normalized;
}

/**
 * Main AI request orchestrator.
 * Splits large payloads into batches. Adds AbortController timeout.
 */
export async function requestAICategorization(payload, existingGroups = []) {
  const maxPerRequest = Math.max(1, CONFIG.MAX_TABS_PER_REQUEST || 100);
  const batches = [];
  for (let i = 0; i < payload.length; i += maxPerRequest) {
    batches.push(payload.slice(i, i + maxPerRequest));
  }
  if (batches.length > 1) {
    log.info(
      `Splitting ${payload.length} tabs into ${batches.length} batches of ≤${maxPerRequest}.`
    );
  }

  const merged = {};

  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b];
    log.info(
      `Sending batch ${b + 1}/${batches.length} (${batch.length} tabs) to AI via ${CONFIG.PROVIDER}...`
    );

    const { url, options } = buildAIRequest(batch, existingGroups);

    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      CONFIG.FETCH_TIMEOUT_MS
    );
    const fetchOptions = { ...options, signal: controller.signal };

    let response;
    try {
      response = await fetch(url, fetchOptions);
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === "AbortError") {
        throw new Error(
          `AI request timed out after ${CONFIG.FETCH_TIMEOUT_MS / 1000}s. Check your endpoint or increase FETCH_TIMEOUT_MS.`
        );
      }
      throw new Error(`Network error reaching AI endpoint: ${err.message}`);
    }
    clearTimeout(timeoutId);

    const batchResult = await parseAIResponse(CONFIG.PROVIDER, response);

    for (const [folderName, folderData] of Object.entries(batchResult)) {
      if (merged[folderName]) {
        merged[folderName].tabs.push(...folderData.tabs);
        if (!merged[folderName].color && folderData.color) {
          merged[folderName].color = folderData.color;
        }
      } else {
        merged[folderName] = {
          tabs: [...folderData.tabs],
          color: folderData.color,
        };
      }
    }
  }

  return merged;
}
