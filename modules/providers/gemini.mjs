// modules/providers/gemini.mjs
import { AIProvider, getSystemPrompt } from "./base.mjs";

export class GeminiProvider extends AIProvider {
  buildRequest(payload, existingGroups) {
    const systemPromptText = getSystemPrompt(existingGroups, this.config.ENABLE_ICONS);
    const userMessage = JSON.stringify(payload, null, 0);
    const url = `${this.config.GEMINI_ENDPOINT}/${this.config.GEMINI_MODEL}:generateContent?key=${this.config.GEMINI_API_KEY}`;

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
                { text: `Here are my currently open browser tabs. Categorize them into folders.\n\n${userMessage}` },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: "application/json",
          },
        }),
      }
    };
  }

  parseResponse(body) {
    const text = body?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error(`Unexpected Gemini response structure:\n${JSON.stringify(body).slice(0, 500)}`);
    return text;
  }
}