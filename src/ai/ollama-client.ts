const OLLAMA_BASE_URL = "http://localhost:11434";
 
export class OllamaClient {
  constructor(private readonly model: string = "qwen2.5:3b") {}
 
  // Простой запрос без streaming — получаем весь ответ разом
  async generate(systemPrompt: string, userPrompt: string): Promise<string> {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        system: systemPrompt,
        prompt: userPrompt,
        stream: false,
      }),
    });
 
    if (!response.ok) {
      throw new Error(`Ollama request failed: ${response.status}`);
    }
 
    const data = await response.json();
    return data.response;
  }
}
 