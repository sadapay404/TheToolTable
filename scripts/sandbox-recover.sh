#!/usr/bin/env bash
# Rebuilds the dev sandbox after a reset: deps + headless-Chrome test harness.
set -e
cd "$(dirname "$0")/.."
[ -d node_modules ] || npm install --ignore-scripts --no-audit --no-fund 2>&1 | tail -1
# Browser harness deps live outside the app (they must never reach the shipped bundle).
H="${TTT_HARNESS_MODULES:-$HOME/browsertest}"
if [ ! -d "$H/node_modules" ]; then
  mkdir -p "$H" && (cd "$H" && npm init -y >/dev/null && npm i --ignore-scripts --no-audit --no-fund puppeteer-core @sparticuz/chromium 2>&1 | tail -1)
fi
# The bundled Chromium needs a few Amazon-Linux libs on this image; unpack them once.
if [ ! -d /tmp/al2023x/lib ]; then
  mkdir -p /tmp/al2023x
  node -e "const z=require('zlib'),fs=require('fs');fs.writeFileSync('/tmp/al2023.tar',z.brotliDecompressSync(fs.readFileSync(process.argv[1])))" "$H/node_modules/@sparticuz/chromium/bin/al2023.tar.br"
  tar -xf /tmp/al2023.tar -C /tmp/al2023x
fi
echo "recovered — run: LD_LIBRARY_PATH=/tmp/al2023x/lib TTT_HARNESS_MODULES=$H npm run smoke" 
