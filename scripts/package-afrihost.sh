#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
npm run build
OUT="$ROOT/out"
DEST="$ROOT/drumsareme-afrihost-upload.zip"
rm -f "$DEST"
(cd "$OUT" && zip -r -q "$DEST" .)
echo "Created: $DEST ($(du -h "$DEST" | cut -f1))"
echo "Upload and extract the ZIP contents into public_html (not the out/ folder name)."
