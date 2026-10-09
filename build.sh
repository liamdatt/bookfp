#!/usr/bin/env bash
# Renders src/pages.html to pages/NN.png (1440 x 1983) and binds them with openzine.
set -euo pipefail
cd "$(dirname "$0")"

CHROME="${CHROME:-google-chrome}"
COUNT=$(grep -c '<section class="page' src/pages.html)

rm -rf pages && mkdir pages
for i in $(seq 1 "$COUNT"); do
    n=$(printf '%02d' "$i")
    "$CHROME" --headless=new --no-sandbox --disable-gpu --hide-scrollbars \
        --force-device-scale-factor=1 --window-size=1440,1983 \
        --virtual-time-budget=8000 \
        --screenshot="pages/$n.png" "file://$PWD/src/pages.html?p=$i" >/dev/null 2>&1
    echo "rendered pages/$n.png"
done

node tools/openzine/scripts/make-book.mjs --input pages --out flopro-book.html --title "FloPro"
