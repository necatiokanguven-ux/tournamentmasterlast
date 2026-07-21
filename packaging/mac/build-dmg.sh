#!/bin/bash
# Build TourMasterMac.dmg on macOS (run on a Mac after extracting TourMasterMac.zip or from repo)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
APP_NAME="Tournament Master"
STAGING_APP="$ROOT/release/Tournament Master.app"
DMG_PATH="$ROOT/release/TourMasterMac.dmg"
VOLUME_NAME="Tournament Master"
BUILD_DIR="$ROOT/release/.dmg-build"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "ERROR: DMG build requires macOS (hdiutil)."
  exit 1
fi

if [[ ! -d "$STAGING_APP" ]]; then
  echo "Building mac app bundle first..."
  powershell -NoProfile -ExecutionPolicy Bypass -File "$ROOT/packaging/build-package-mac.ps1" 2>/dev/null || \
    pwsh -NoProfile -ExecutionPolicy Bypass -File "$ROOT/packaging/build-package-mac.ps1"
fi

if [[ ! -d "$STAGING_APP" ]]; then
  echo "ERROR: Missing $STAGING_APP — run npm run build:package:mac first."
  exit 1
fi

chmod +x "$STAGING_APP/Contents/MacOS/TournamentMaster" 2>/dev/null || true

rm -rf "$BUILD_DIR" "$DMG_PATH"
mkdir -p "$BUILD_DIR"
cp -R "$STAGING_APP" "$BUILD_DIR/"
ln -s /Applications "$BUILD_DIR/Applications"

hdiutil create -volname "$VOLUME_NAME" -srcfolder "$BUILD_DIR" -ov -format UDZO "$DMG_PATH"
rm -rf "$BUILD_DIR"

echo ""
echo "Done: $DMG_PATH"
echo "Distribute this DMG to venue Macs — drag Tournament Master.app to Applications."
