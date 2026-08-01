// modules/providers/ollama.mjs
import { AIProvider, getSystemPrompt } from "./base.mjs";

export class OllamaProvider extends AIProvider {
  get maxRetries() { return 0; } // Never hammer a local machine with retries

  async healthCheck() {
    try {
      const res = await fetch(this.config.OLLAMA_ENDPOINT.replace('/api/chat', '/api/tags'), { method: 'GET' });
      return res.ok;
    } catch { 
      return false; 
    }
  }

  buildRequest(payload, existingGroups) {
    const systemPromptText = getSystemPrompt(existingGroups, this.config.ENABLE_ICONS);
    const userMessage = JSON.stringify(payload, null, 0);

    return {
      url: this.config.OLLAMA_ENDPOINT,
      options: {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.config.OLLAMA_MODEL,
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
      }
    };
  }

  parseResponse(body) {
    const text = body?.message?.content;
    if (!text) throw new Error(`Unexpected Ollama response structure:\n${JSON.stringify(body).slice(0, 500)}`);
    return text;
  }
}