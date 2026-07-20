#!/bin/bash
# Deploy PokerClup ID Scan API on Hostinger VPS (api.pokerclup.com)
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/pokerclup-id-scan}"
REPO_URL="${REPO_URL:-https://github.com/necatiokanguven-ux/tournamentmasterlast.git}"
BRANCH="${BRANCH:-master}"

echo "==> Deploying id-scan to $APP_DIR"

if [ ! -d "$APP_DIR/.git" ]; then
  sudo mkdir -p "$APP_DIR"
  sudo chown -R "$USER:$USER" "$APP_DIR"
  git clone --depth 1 -b "$BRANCH" "$REPO_URL" "$APP_DIR"
  cd "$APP_DIR"
else
  cd "$APP_DIR"
  git fetch origin "$BRANCH"
  git reset --hard "origin/$BRANCH"
fi

cd vps/id-scan
npm ci --omit=dev || npm install --omit=dev

if [ ! -f .env.local ] && [ -f .env.example ]; then
  cp .env.example .env.local
  echo "WARNING: Edit vps/id-scan/.env.local and set GEMINI_API_KEY before starting."
fi

if command -v pm2 >/dev/null 2>&1; then
  pm2 delete pokerclup-id-scan 2>/dev/null || true
  pm2 start npm --name pokerclup-id-scan -- run start
  pm2 save
  echo "==> PM2 started: pokerclup-id-scan"
else
  echo "PM2 not found. Start manually: cd vps/id-scan && npm run start"
fi

echo "==> Configure nginx/caddy proxy: /api/id-scan -> http://127.0.0.1:3010/api/id-scan"
