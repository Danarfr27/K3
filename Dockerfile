# syntax=docker/dockerfile:1

# ---------- deps ----------
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund || npm install --no-audit --no-fund

# ---------- build ----------
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---------- run ----------
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN addgroup -S k3 && adduser -S k3 -G k3

COPY --from=builder --chown=k3:k3 /app/.next/standalone ./
COPY --from=builder --chown=k3:k3 /app/.next/static ./.next/static
COPY --from=builder --chown=k3:k3 /app/public ./public

USER k3
EXPOSE 3000

CMD ["node", "server.js"]
