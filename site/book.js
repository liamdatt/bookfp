// One book on a desk. The cover and every page are live HTML: each leaf is a two-sided element
// hinged on the spine, so turning a page is a rotateY and the links on it stay clickable.
// The chapter pages are lifted from src/pages.html (the same sources the shelf's books print from,
// copied to site/src by build.sh); the cover, contents, contact, and end pages live in index.html.
// #<n> in the URL opens spread n.
(async () => {
    const stage = document.getElementById('stage');
    const rig = document.getElementById('rig');
    const toggle = document.getElementById('toggle');
    const count = document.getElementById('count');
    const hint = document.getElementById('hint');
    const narrow = matchMedia('(max-width: 860px), (orientation: portrait)');

    const PAGE_W = 720, PAGE_H = 991.5; // the print page in src/pages.css

    // Reading order after the cover. Even entries are left-hand pages, odd ones right-hand.
    const PLAN = [
        'contents', ['services', 2],
        ['services', 3], ['services', 4],
        ['services', 5], ['antoinette', 2],
        ['antoinette', 3], ['antoinette', 4],
        ['work', 2], ['work', 3],
        ['work', 4], ['work', 5],
        ['studio', 2], ['studio', 3],
        ['studio', 4], ['studio', 5],
        'contact', 'end',
    ];
    // `at` is the index in PLAN where the chapter starts.
    const CHAPTERS = [
        { name: 'What we do', tab: 'Services', note: 'Consulting, software, and AI.', at: 1 },
        { name: 'Meet Antoinette', tab: 'Antoinette', note: 'The agent we built for ourselves.', at: 5 },
        { name: 'Selected work', tab: 'Work', note: 'Two builds, both still live.', at: 8 },
        { name: 'The studio', tab: 'Studio', note: 'From Kingston, since 2024.', at: 12 },
        { name: 'Let’s talk', tab: 'Talk', note: 'We reply within 4 business hours.', at: 16 },
    ];
    const pad = (n) => String(n).padStart(2, '0');
    const spreadOf = (at) => Math.floor(at / 2) + 1;
    const chapterAt = (i) => [...CHAPTERS].reverse().find((c) => c.at <= i);

    const source = new DOMParser().parseFromString(await (await fetch('src/pages.html')).text(), 'text/html');
    const template = (id) => document.getElementById(`t-${id}`).content.firstElementChild.cloneNode(true);

    function page(entry, i) {
        if (typeof entry === 'string') return template(entry);
        const [book, n] = entry;
        const el = document.importNode(source.querySelectorAll(`.page[data-book="${book}"]`)[n - 1], true);
        el.querySelectorAll('img').forEach((img) => img.setAttribute('src', `src/${img.getAttribute('src')}`));
        // The sources carry each small book's own folio; renumber for this one.
        const folio = el.querySelector('.folio');
        if (folio) {
            const parts = [pad(i + 1), chapterAt(i).name];
            folio.innerHTML = (i % 2 ? parts.reverse() : parts).map((t) => `<span>${t}</span>`).join('');
        }
        return el;
    }

    const pages = PLAN.map(page);
    const SPREADS = pages.length / 2;

    // Leaf 0 is the cover; leaf i carries the right page of spread i and, on its back, the left
    // page of spread i + 1. The last leaf is the back board and never turns.
    const leaves = [];
    for (let i = 0; i <= SPREADS; i++) {
        const leaf = document.createElement('div');
        leaf.className = 'leaf';
        const face = (content, back) => {
            const el = document.createElement('div');
            el.className = `face ${back ? 'face--back' : 'face--front'}`;
            el.append(content);
            leaf.append(el);
        };
        if (i === 0) {
            leaf.classList.add('leaf--cover');
            leaf.append(Object.assign(document.createElement('div'), { className: 'rim' }));
        }
        face(i === 0 ? template('cover') : pages[2 * i - 1], false);
        if (i < SPREADS) face(pages[2 * i], true);
        rig.append(leaf);
        leaves.push(leaf);
    }

    CHAPTERS.forEach((c, n) => {
        const spread = spreadOf(c.at);
        const side = c.at % 2 ? 'R' : 'L';
        const tab = document.createElement('button');
        tab.type = 'button';
        tab.className = 'tab';
        tab.style.setProperty('--n', n);
        tab.dataset.n = n;
        tab.setAttribute('aria-label', `Chapter ${n + 1}: ${c.name}`);
        tab.innerHTML = `<span>${c.tab}</span><span>${c.tab}</span>`; // one per side of the leaf
        tab.addEventListener('click', (e) => { e.stopPropagation(); go(spread, side); });
        leaves[spread].append(tab);

        const li = document.createElement('li');
        li.innerHTML = `<button type="button"><span class="toc__idx">${pad(n + 1)}</span><span class="toc__name">${c.name}<small>${c.note}</small></span><span class="toc__pg">p. ${c.at + 1}</span></button>`;
        li.firstChild.addEventListener('click', () => go(spread, side));
        document.getElementById('toc').append(li);
    });

    let spread = 0; // 0 is closed
    let side = 'L'; // which page is in view when only one fits
    let W = PAGE_W;

    function render() {
        const open = spread > 0;
        stage.classList.toggle('closed', !open);
        leaves.forEach((leaf, i) => {
            const turned = i < spread;
            const was = leaf.classList.contains('turned');
            leaf.classList.toggle('turned', turned);
            // Stacks are a pixel apart so the pile sorts in 3D; leaves riffle when several turn at once.
            leaf.style.setProperty('--z', `${turned ? i + 1 : leaves.length - i}px`);
            leaf.style.setProperty('--a', turned ? '-180deg' : '0deg');
            if (was !== turned) leaf.style.transitionDelay = `${(turned ? spread - 1 - i : i - spread) * 70}ms`;
        });

        let pose;
        if (!open) {
            pose = narrow.matches
                ? `translate(0px, 6vh) rotate(-7deg) scale(0.8) translateX(${-W / 2}px)`
                : `translate(14vw, 1vh) rotate(-13deg) scale(0.76) translateX(${-W / 2}px)`;
        } else {
            const shift = narrow.matches ? (side === 'L' ? W / 2 : -W / 2) : 0;
            pose = `translate(0px, 0px) rotate(0deg) scale(1) translateX(${shift}px)`;
        }
        rig.style.transform = pose;

        toggle.textContent = open ? 'Close the book' : 'Open the book';
        hint.textContent = !open ? (narrow.matches ? 'Tap the cover' : 'Click the cover')
            : narrow.matches ? 'Tap a page or a tab to turn' : 'Click a page or a tab to turn · arrow keys work too';
        const left = 2 * spread - 1;
        count.textContent = !open ? 'Cover'
            : narrow.matches ? `${pad(side === 'L' ? left : left + 1)} / ${pages.length}`
            : `${pad(left)}–${pad(left + 1)} / ${pages.length}`;
        history.replaceState(null, '', open ? `#${spread}` : location.pathname);
    }

    function go(to, toSide = 'L') {
        spread = Math.max(0, Math.min(SPREADS, to));
        side = toSide;
        render();
    }
    function next() {
        if (narrow.matches && spread > 0 && side === 'L') go(spread, 'R');
        else if (spread < SPREADS) go(spread + 1, 'L');
    }
    function prev() {
        if (narrow.matches && side === 'R') go(spread, 'L');
        else go(spread - 1, 'R');
    }

    function fit() {
        const vw = innerWidth, vh = innerHeight;
        const s = narrow.matches
            ? Math.min((vw - 48) / PAGE_W, (vh - 190) / PAGE_H)
            : Math.min((vw - 200) / (2 * PAGE_W), (vh - 150) / PAGE_H);
        W = PAGE_W * s;
        stage.style.setProperty('--s', s);
        stage.style.setProperty('--W', `${W}px`);
        stage.style.setProperty('--H', `${PAGE_H * s}px`);
        render();
    }

    rig.addEventListener('click', (e) => {
        if (e.target.closest('a, button')) return;
        const face = e.target.closest('.face');
        if (!face) return;
        if (face.classList.contains('face--back')) prev(); else next();
    });
    toggle.addEventListener('click', () => go(spread ? 0 : 1));
    document.getElementById('next').addEventListener('click', next);
    document.getElementById('prev').addEventListener('click', prev);
    addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight') next();
        else if (e.key === 'ArrowLeft') prev();
        else if (e.key === 'Escape') go(0);
    });
    let swipeX = null;
    rig.addEventListener('touchstart', (e) => { swipeX = e.touches[0].clientX; }, { passive: true });
    rig.addEventListener('touchend', (e) => {
        const dx = e.changedTouches[0].clientX - swipeX;
        if (Math.abs(dx) > 40) { e.preventDefault(); if (dx < 0) next(); else prev(); }
    });
    addEventListener('resize', fit);
    addEventListener('hashchange', () => go(Number(location.hash.slice(1)) || 0));

    spread = Math.min(SPREADS, Number(location.hash.slice(1)) || 0);
    stage.classList.add('still'); // no animation for the first layout
    fit();
    requestAnimationFrame(() => requestAnimationFrame(() => stage.classList.remove('still')));
})();
