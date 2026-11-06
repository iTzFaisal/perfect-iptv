#!/usr/bin/env bash
# Install a signed .wgt on a Samsung TV over the local network.
#
#   scripts/deploy.sh 192.168.1.50 [dist/PerfectIPTV-0.1.1.wgt]
#
# Requires Tizen Studio (sdb + tizen CLI), Developer Mode on the TV, and a
# Samsung certificate that includes the TV's DUID. Tizen Homebrew is easier
# for most people: https://github.com/SushyDev/tizen-homebrew
set -euo pipefail

TV_IP="${1:-}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WGT="${2:-}"
if [[ -z "$WGT" ]]; then
  # Prefer the newest package in dist/ (a signed build is usually newer than
  # the unsigned one). The script no longer creates a -latest alias.
  WGT="$(ls -t "$ROOT"/dist/PerfectIPTV-*.wgt 2>/dev/null | head -1 || true)"
fi

if [[ -z "$TV_IP" ]]; then
  echo "Usage: scripts/deploy.sh <tv-ip> [path/to/app.wgt]" >&2
  exit 1
fi
if [[ ! -f "$WGT" ]]; then
  echo "Package not found: $WGT" >&2
  echo "Run 'npm run package' first." >&2
  exit 1
fi
if ! command -v sdb >/dev/null 2>&1 || ! command -v tizen >/dev/null 2>&1; then
  echo "sdb/tizen not found. Install Tizen Studio and add its tools to PATH:"
  echo '  export PATH="$HOME/tizen-studio/tools:$HOME/tizen-studio/tools/ide/bin:$PATH"'
  exit 1
fi

echo "Connecting to $TV_IP:26101 ..."
sdb connect "$TV_IP:26101" || true
sdb devices

echo "Installing $(basename "$WGT") ..."
tizen install -n "$(basename "$WGT")" -s "$TV_IP:26101" -- "$(dirname "$WGT")"

echo "Launching iTzFaisal1.PerfectIPTV ..."
tizen run -p "iTzFaisal1.PerfectIPTV" -s "$TV_IP:26101" || \
  tizen run -p "iTzFaisal1" -s "$TV_IP:26101" || true
