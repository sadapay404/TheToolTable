#!/usr/bin/env bash
# Rebuilds the dev sandbox after a reset: deps + headless-Chrome test harness.
set -e
cd "$(dirname "$0")/.."
[ -d node_modules ] || npm install --ignore-scripts --no-audit --no-fund 2>&1 | tail -1
H=/home/user/browsertest
if [ ! -d $H/node_modules ]; then
  mkdir -p $H && cd $H && npm init -y >/dev/null && npm i --ignore-scripts --no-audit --no-fund puppeteer-core @sparticuz/chromium 2>&1 | tail -1
  mkdir -p /tmp/al2023x && cd /tmp/al2023x && node -e "const z=require('zlib'),fs=require('fs');fs.writeFileSync('/tmp/al2023.tar',z.brotliDecompressSync(fs.readFileSync('$H/node_modules/@sparticuz/chromium/bin/al2023.tar.br')))" && tar xf /tmp/al2023.tar
  cp "$OLDPWD/scripts/harness/"*.mjs $H/ 2>/dev/null || cp /home/user/TheToolTab/scripts/harness/*.mjs $H/
fi
echo recovered
