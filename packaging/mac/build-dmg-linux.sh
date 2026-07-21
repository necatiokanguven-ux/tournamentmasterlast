#!/bin/bash
# Build TourMasterMac.dmg on Linux (VPS / CI). Requires Tournament Master.app folder path.
set -euo pipefail

APP_PATH="${1:-}"
OUTPUT_DMG="${2:-}"

if [[ -z "$APP_PATH" || -z "$OUTPUT_DMG" ]]; then
  echo "Usage: $0 /path/to/Tournament Master.app /path/to/TourMasterMac.dmg"
  exit 1
fi

if [[ ! -d "$APP_PATH" ]]; then
  echo "ERROR: App bundle not found: $APP_PATH"
  exit 1
fi

VOLUME_NAME="Tournament Master"
WORK="$(mktemp -d /tmp/tm-dmg.XXXXXX)"
APP_BASENAME="$(basename "$APP_PATH")"

cleanup() {
  rm -rf "$WORK"
}
trap cleanup EXIT

if ! command -v genisoimage >/dev/null 2>&1; then
  echo "Installing genisoimage..."
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq genisoimage
fi

mkdir -p "$(dirname "$OUTPUT_DMG")"
cp -R "$APP_PATH" "$WORK/$APP_BASENAME"
ln -sf /Applications "$WORK/Applications"

# Apple-compatible HFS disk image (mountable on macOS)
genisoimage -D -V "$VOLUME_NAME" -no-pad -r -apple -file-mode 0777 -o "$OUTPUT_DMG" "$WORK"

echo "Done: $OUTPUT_DMG ($(du -h "$OUTPUT_DMG" | awk '{print $1}'))"
