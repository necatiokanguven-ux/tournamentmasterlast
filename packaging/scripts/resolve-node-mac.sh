#!/bin/bash
# Resolve Node.js for macOS packages: embedded runtime first, then system PATH.

resolve_mac_node() {
  local base_dir="${1:-.}"
  local arch
  arch="$(uname -m)"

  case "$arch" in
    arm64) candidate="$base_dir/runtime/mac-arm64/node" ;;
    x86_64) candidate="$base_dir/runtime/mac-x64/node" ;;
    *) candidate="" ;;
  esac

  if [ -n "$candidate" ] && [ -x "$candidate" ]; then
    echo "$candidate"
    return 0
  fi

  if command -v node >/dev/null 2>&1; then
    command -v node
    return 0
  fi

  return 1
}
