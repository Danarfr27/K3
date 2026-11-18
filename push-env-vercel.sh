#!/usr/bin/env bash
# Upload semua env vars K3 AI ke Vercel (sekali jalan).
# Butuh: Vercel CLI terinstall (npm i -g vercel) dan sudah `vercel login`.
# Pakai: bash push-env-vercel.sh
set -e
cd "$(dirname "$0")"

if ! command -v vercel >/dev/null 2>&1; then
  echo "Vercel CLI belum terinstall. Jalankan: npm i -g vercel"
  exit 1
fi

while IFS= read -r line || [ -n "$line" ]; do
  case "$line" in
    \#*|"") continue ;;
  esac
  key="${line%%=*}"
  value="${line#*=}"
  echo "Meng-upload $key ..."
  printf '%s' "$value" | vercel env add "$key" production 2>/dev/null || \
  printf '%s' "$value" | vercel env add "$key" preview 2>/dev/null || \
  echo "  (skip $key — mungkin sudah ada, hapus dulu: vercel env rm $key production)"
done < .env.local

echo "Selesai. Redeploy agar env aktif: vercel --prod"
