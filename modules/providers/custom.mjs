// modules/providers/custom.mjs
import { AIProvider, getSystemPrompt } from "./base.mjs";

export class CustomProvider extends AIProvider {
  buildRequest(payload, existingGroups) {
    const systemPromptText = getSystemPrompt(existingGroups, this.config.ENABLE_ICONS);
    const userMessage = JSON.stringify(payload, null, 0);

    const headers = { "Content-Type": "application/json" };
    if (this.config.CUSTOM_API_KEY) {
      headers["Authorization"] = `Bearer ${this.config.CUSTOM_API_KEY}`;
    }

    return {
      url: this.config.CUSTOM_ENDPOINT,
      options: {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: this.config.CUSTOM_MODEL,
          messages: [
            { role: "system", content: systemPromptText },
            { role: "user", content: `Here are my currently open browser tabs. Categorize them into folders.\n\n${userMessage}` },
          ],
          temperature: 0.2,
          response_format: { type: "json_object" },
        }),
      }
    };
  }

  parseResponse(body) {
    const text = body?.choices?.[0]?.message?.content;
    if (!text) throw new Error(`Unexpected custom API response structure:\n${JSON.stringify(body).slice(0, 500)}`);
    return text;
  }
}