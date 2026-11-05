export function getProvider(modelId: string) {
  const apiKey = process.env.OPENAI_API_KEY || "";
  const baseURL = process.env.OPENAI_API_BASE || "https://api.openai.com/v1";
  const targetModel = process.env.OPENAI_MODEL || modelId;

  return {
    id: "sumopod-custom",
    async chatStream({ messages, responseStyle }) {
      const response = await fetch(`${baseURL.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: targetModel,
          messages: messages.map(m => ({ role: m.role, content: m.content })),
          stream: true,
          temperature: responseStyle === "concise" ? 0.3 : 0.7,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Sumopod API error (${response.status}): ${errText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body reader available.");

      const decoder = new TextEncoder(); // wait, decoder text pake TextDecoder()
      const textDecoder = new TextDecoder();

      async function* generate() {
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += textDecoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const dataStr = trimmed.replace(/^data:\s*/, "");
            if (dataStr === "[DONE]") return;
            try {
              const json = JSON.parse(dataStr);
              const content = json.choices[0]?.delta?.content || "";
              if (content) yield content;
            } catch {
              // ignore parse error on partial chunks
            }
          }
        }
      }

      return generate();
    }
  };
}

export function isRealProvider(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}
