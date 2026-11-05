// Tambahkan konfigurasi base URL
const OPENAI_BASE_URL = process.env.OPENAI_API_BASE || "https://api.openai.com/v1";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gemini/gemini-3.5-flash-lite";

// Di dalam fungsi POST, ganti URL fetch:
const response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: OPENAI_MODEL, // sekarang menggunakan gemini/gemini-3.5-flash-lite
    messages: messagesForProvider,
    stream: true,
    temperature: 0.7,
  }),
});
