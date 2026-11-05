import OpenAI from "openai";

export function getProvider(modelId: string) {
  const apiKey = process.env.OPENAI_API_KEY || "";
  const baseURL = process.env.OPENAI_API_BASE || "https://api.openai.com/v1";
  
  const client = new OpenAI({
    apiKey,
    baseURL,
  });

  return {
    id: "sumopod-custom",
    async chatStream({ messages, model, responseStyle }) {
      const targetModel = process.env.OPENAI_MODEL || model;
      
      const response = await client.chat.completions.create({
        model: targetModel,
        messages: messages.map(m => ({
          role: m.role,
          content: m.content,
        })),
        stream: true,
        temperature: responseStyle === "concise" ? 0.3 : 0.7,
      });

      async function* generate() {
        for await (const chunk of response) {
          const content = chunk.choices[0]?.delta?.content || "";
          if (content) {
            yield content;
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
