#!/usr/bin/env bash
# Fast static gate: syntax, XML, versions, script manifest, whitespace.
# Runs in under two seconds on a warm machine.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

for f in js/*.js js/lib/*.js; do
  [ -e "$f" ] || continue
  node --check "$f"
done

xmllint --noout config.xml
node scripts/check-version.js
node scripts/check-manifest.js
git diff --check
