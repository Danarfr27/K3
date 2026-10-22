# K3 AI — Cyber Intelligence Assistant

A **serverless AI chatbot** with a modern hacker-terminal interface, built with
**Next.js (App Router) + TypeScript + Tailwind CSS**. Streaming chat, persistent
conversation history, memory, file uploads and image generation — all through
Next.js Route Handlers. Deploys to Vercel (or any Node host via Docker).

```
OPEN WEB → NEW CHAT → TYPE MESSAGE → STREAM AI RESPONSE → CONTINUE
→ SAVE HISTORY → USE MEMORY → ATTACH FILE → GENERATE IMAGE
```

---

## Quick start

```bash
cp .env.example .env.local   # required — fill in OpenRouter credentials
npm install
npm run dev                  # http://localhost:3000
```

Production build:

```bash
npm run build
npm start
```

> K3 requires OpenRouter credentials for chat and image generation.
> Set `OPENROUTER_API_KEY` or `OPENROUTER_API_KEYS` to connect a real model.

## Environment

See `.env.example`:

| Variable              | Purpose                               |
| --------------------- | ------------------------------------- |
| `OPENROUTER_API_KEY`  | OpenRouter key (server-side only)     |
| `OPENROUTER_API_KEYS` | Comma-separated OpenRouter keys       |
| `OPENROUTER_MODEL`    | OpenRouter model id                   |
| `IMAGE_API_KEY`       | Image provider key (server-side only) |
| `IMAGE_BASE_URL`      | Image provider base URL               |
| `IMAGE_MODEL`         | Image model id                        |

Never commit `.env*`. Keys are read only inside Route Handlers.

## Architecture

```
Browser
  ↓
Next.js (App Router)
  ↓
Route Handlers (serverless)
  ├─ /api/chat            GET meta · POST stream chat · DELETE clear memory
  ├─ /api/generate-image  POST image synthesis
  ├─ /api/upload          POST validated file upload · GET meta
  └─ /api/conversations   GET list/one · POST create · DELETE remove
  ↓
AI Provider (via lib/ai/client.ts abstraction)
```

### Provider abstraction

`lib/ai/client.ts` defines the `AIProvider` interface:

```ts
interface AIProvider {
  chat(options): Promise<string>;
  streamChat(options): Promise<ReadableStream<Uint8Array>>;
  generateImage(prompt): Promise<string>;
}
```

Ships with `OpenRouterProvider`. Add another provider by implementing the same
interface and registering it in `getProvider()`.

### Memory

`lib/memory/` keeps durable user facts (`remember …`, `my name is …`, …) plus a
rolling-context builder: system prompt + memory notes + a bounded window of
recent messages — never a blind history dump. Toggle per session in Settings;
clear with **CLEAR MEMORY**.

### Storage

Server stores (conversations, messages, uploads, memory) are in-memory
abstractions behind `lib/chat/*` and `lib/memory/*` — perfect for a single
serverless instance / dev. Swap the internals for Vercel KV / Postgres /
Upstash without touching the API routes or the UI.

## Security

- API keys server-side only; no `NEXT_PUBLIC_` secrets
- Input validation + sanitized errors (no stack traces to the browser)
- File validation: size, MIME, extension allow-list
- Simple in-memory rate limiting abstraction (`lib/utils/ratelimit.ts`)
- Request size limits on every route

## Performance

No WebGL / Three.js / heavy canvas. Visuals are pure CSS (grid, scanlines,
cursor blink, subtle glow) and honor `prefers-reduced-motion`. The only
dependencies are `next`, `react`, `react-dom`.

## Structure

```
app/                App Router pages + Route Handlers
components/         chat · sidebar · image · ui
lib/                ai · memory · chat · image · utils (abstraction layer)
types/              shared TypeScript contracts
```

## Deploy

- **Vercel**: import the repo, set env vars, deploy. Done.
- **Docker**: a multi-stage `Dockerfile` (standalone output) is included.

---

K3 AI is a safe, general-purpose assistant. It does not include — and must not
be extended with — malware, credential theft, brute force, exploit execution
or unauthorized scanning capabilities.
