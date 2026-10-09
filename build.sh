#!/usr/bin/env bash
# Renders each book in src/pages.html to pages/<book>/NN.png (1440 x 1983), binds it with
# openzine into site/books/<book>.html, and writes the shelf's cover image to site/covers/.
set -euo pipefail
cd "$(dirname "$0")"

CHROME="${CHROME:-google-chrome}"
BOOKS=(services antoinette work studio)
declare -A TITLES=([services]="What we do" [antoinette]="Antoinette" [work]="Selected work" [studio]="The studio")

# The viewer's own colours are CSS variables; this reskins it to the studio graphite. Inside the
# shelf the page is see-through and its chrome stays hidden until the shelf marks it "landed".
THEME='<style>html:root{--paper:#0b0b0b;--ink:#f0eee9;--muted:#8a8782;--grid:#ffffff12;--metric:#ff5b23;--focus:#ff5b23;--hover:#191919;background:transparent}html:root body{background:transparent}html.solo:root{background:#0b0b0b}html .layout{background:#ffffff14}html .layout button{color:#f0eee9a0}html .layout button[aria-pressed=true]{background:#222;color:#f0eee9;box-shadow:none}html .layout button[aria-pressed=false]:hover{color:#f0eee9}html .loading button{background:#222;color:#f0eee9;box-shadow:0 0 0 1px #ffffff28}html header{padding-right:150px}html :is(header,.controls,.layout,.credit,.loading),html .stage::before{transition:opacity .7s ease}html:not(.landed) :is(header,.hint,.controls,.layout,.credit,.loading),html:not(.landed) .stage::before{opacity:0}</style><script>if(window.parent===window)document.documentElement.classList.add("landed","solo")</script>'

rm -rf pages site/books site/covers && mkdir -p pages site/books site/covers
for book in "${BOOKS[@]}"; do
    count=$(grep -c "data-book=\"$book\"" src/pages.html)
    mkdir "pages/$book"
    for i in $(seq 1 "$count"); do
        n=$(printf '%02d' "$i")
        "$CHROME" --headless=new --no-sandbox --disable-gpu --hide-scrollbars \
            --force-device-scale-factor=1 --window-size=1440,1983 \
            --virtual-time-budget=8000 \
            --screenshot="pages/$book/$n.png" "file://$PWD/src/pages.html?book=$book&p=$i" >/dev/null 2>&1
    done
    echo "rendered pages/$book ($count pages)"
    node tools/openzine/scripts/make-book.mjs --input "pages/$book" --out "site/books/$book.html" --title "FloPro — ${TITLES[$book]}"
    THEME="$THEME" node -e '
        const fs = require("fs"), f = process.argv[1];
        fs.writeFileSync(f, fs.readFileSync(f, "utf8").replace("</head>", () => process.env.THEME + "</head>"));
    ' "site/books/$book.html"
    cp "pages/$book/01.png" "site/covers/$book.png"
done
