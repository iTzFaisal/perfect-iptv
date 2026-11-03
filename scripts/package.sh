#!/usr/bin/env bash
# Build a Tizen .wgt package for Perfect IPTV.
#
#   npm run package
#
# Optional signing (requires Tizen Studio CLI + a Samsung TV certificate profile):
#   TIZEN_PROFILE=MyTVProfile npm run package
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

NAME="PerfectIPTV"
VERSION="$(xmllint --xpath 'string(/*[local-name()="widget"]/@version)' config.xml 2>/dev/null || true)"
if [[ -z "$VERSION" ]]; then
  echo "Could not read the app version from config.xml (xmllint is required)." >&2
  exit 1
fi

# Tizen only uses config.xml. Fail early if npm metadata has drifted, so the
# WGT filename/version and package.json cannot silently disagree.
if [[ -f package.json ]] && command -v node >/dev/null 2>&1; then
  PKG_VERSION="$(node -p "require('./package.json').version" 2>/dev/null || true)"
  if [[ -n "$PKG_VERSION" && "$PKG_VERSION" != "$VERSION" ]]; then
    echo "Version mismatch:" >&2
    echo "  config.xml   -> $VERSION" >&2
    echo "  package.json -> $PKG_VERSION" >&2
    echo "Update both so the WGT version and npm metadata agree." >&2
    exit 1
  fi
fi

# Tizen TV package IDs must be exactly 10 alphanumeric characters. An invalid
# ID can pass local packaging but fail on the TV with [118, -4] / "Load archive
# info fail", so reject it before building.
APP_ID="$(xmllint --xpath 'string(/*[local-name()="widget"]/*[local-name()="application"]/@id)' config.xml 2>/dev/null || true)"
PKG_ID="$(xmllint --xpath 'string(/*[local-name()="widget"]/*[local-name()="application"]/@package)' config.xml 2>/dev/null || true)"
if [[ ! "$PKG_ID" =~ ^[A-Za-z0-9]{10}$ ]]; then
  echo "Invalid Tizen package ID: '$PKG_ID' (must be exactly 10 alphanumeric characters)." >&2
  exit 1
fi
if [[ "$APP_ID" != "$PKG_ID".* ]]; then
  echo "Invalid Tizen application ID: '$APP_ID' (must start with '$PKG_ID.')." >&2
  exit 1
fi

OUT="$ROOT/dist"
WGT="$OUT/${NAME}-${VERSION}.wgt"

rm -rf "$OUT"
mkdir -p "$OUT"

STAGE="$(mktemp -d "${TMPDIR:-/tmp}/perfect-iptv.XXXXXX")"
trap 'rm -rf "$STAGE"' EXIT

mkdir -p "$STAGE/app"
cp config.xml index.html icon.png "$STAGE/app/"
cp -R css js vendor "$STAGE/app/"

# Keep the widget root clean: config.xml must sit at the archive root.
cd "$STAGE/app"
zip -q -r -X "$WGT" config.xml index.html icon.png css js vendor
cd "$ROOT"

if ! unzip -l "$WGT" | grep ' config.xml$' >/dev/null; then
  echo "Packaging error: config.xml is not at the widget root." >&2
  exit 1
fi

echo "Built: $WGT"
echo "Size:  $(du -h "$WGT" | cut -f1)"
echo "SHA256: $(shasum -a 256 "$WGT" | awk '{print $1}')"

if [[ -n "${TIZEN_PROFILE:-}" ]]; then
  if ! command -v tizen >/dev/null 2>&1; then
    echo ""
    echo "TIZEN_PROFILE is set, but the 'tizen' CLI was not found."
    echo "Install Tizen Studio and add \$TIZEN_STUDIO/tools/ide/bin to PATH."
    exit 1
  fi
  echo ""
  echo "Re-signing with Tizen profile: $TIZEN_PROFILE"
  mkdir -p "$OUT/signed"
  cp "$WGT" "$OUT/signed/${NAME}-input.wgt"
  tizen package -t wgt -s "$TIZEN_PROFILE" -o "$OUT/signed" -- "$OUT/signed/${NAME}-input.wgt"
  SIGNED="$(ls -t "$OUT"/signed/*.wgt 2>/dev/null | head -1 || true)"
  if [[ -n "$SIGNED" ]] && unzip -l "$SIGNED" | grep 'signature1.xml' >/dev/null; then
    cp "$SIGNED" "$OUT/${NAME}-${VERSION}-signed.wgt"
    echo "Signed package: $OUT/${NAME}-${VERSION}-signed.wgt"
  else
    echo "Tizen CLI did not produce a signed .wgt. Check the output above."
    exit 1
  fi
else
  echo ""
  echo "Next: install the unsigned .wgt with Tizen Homebrew (recommended),"
  echo "or sign it with Tizen Studio. See README.md."
fi
