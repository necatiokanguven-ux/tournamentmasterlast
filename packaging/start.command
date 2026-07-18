#!/bin/bash
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required. Install from https://nodejs.org/"
  read -r -p "Press Enter to close..."
  exit 1
fi

if lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null 2>&1; then
  echo ""
  echo "ERROR: Port 3000 is already in use."
  lsof -Pi :3000 -sTCP:LISTEN
  echo "Close that program, then run start.command again."
  echo ""
  read -r -p "Press Enter to close..."
  exit 1
fi

if [ ! -d "node_modules" ]; then
  echo "Installing dependencies - first run may take a few minutes..."
  npm install --omit=dev
  if [ $? -ne 0 ]; then
    echo "Failed to install dependencies."
    read -r -p "Press Enter to close..."
    exit 1
  fi
fi

if [ ! -f "dist/server.cjs" ]; then
  echo "ERROR: dist/server.cjs is missing. Re-download TourMasterMac.zip from pokerclup.com/downloads"
  read -r -p "Press Enter to close..."
  exit 1
fi

export NODE_ENV=production
export TM_AUTO_OPEN_BROWSER=1

echo ""
echo "Tournament Master is starting..."
echo "When ready, your browser will open http://localhost:3000 automatically."
echo "Keep this window open during the tournament."
echo ""

node dist/server.cjs
EXIT_CODE=$?

echo ""
if [ "$EXIT_CODE" -ne 0 ]; then
  echo "Server stopped with an error. See the message above."
  echo "If the problem continues, re-download TourMasterMac.zip from pokerclup.com/downloads"
else
  echo "Server stopped."
fi
read -r -p "Press Enter to close..."
exit "$EXIT_CODE"
