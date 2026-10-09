// One book on a desk. The book is the openzine viewer (books/flopro.html) in a see-through iframe,
// so the paper, its curl and its lighting are the renderer's own. This page poses it on the desk,
// and lays the things a picture of a page cannot do over it: chapter tabs, and an invisible live
// copy of the pages in view so their links and contents entries can be clicked and read aloud.
// The same pages, opened as ?print=<n>, are what build.sh photographs to bind the book.
// The chapter pages are lifted from src/pages.html (copied to site/src by build.sh); the cover,
// contents, contact, and end pages live in index.html. #<n> in the URL opens spread n.
(async () => {
    const stage = document.getElementById('stage');
    const viewer = document.getElementById('viewer');
    const live = document.getElementById('live');
    const tabs = document.getElementById('tabs');
    const glow = document.getElementById('glow');
    const toggle = document.getElementById('toggle');
    const count = document.getElementById('count');
    const hint = document.getElementById('hint');
    const narrow = matchMedia('(max-width: 860px), (orientation: portrait)');

    const PAGE_W = 720, PAGE_RATIO = 1.377; // the print page in src/pages.css

    // Reading order between the covers. Even entries are left-hand pages, odd ones right-hand.
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
    const chapterAt = (i) => [...CHAPTERS].reverse().find((c) => c.at <= i);
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));

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

    // Every page of the bound book, in the viewer's order: front cover, PLAN, back cover.
    const pages = [template('cover'), ...PLAN.map(page), template('back')];
    const SPREADS = PLAN.length / 2;

    CHAPTERS.forEach((c, n) => {
        c.page = c.at + 1; // index in `pages`
        c.spread = Math.floor(c.at / 2) + 1;
        const li = document.createElement('li');
        li.innerHTML = `<button type="button"><span class="toc__idx">${pad(n + 1)}</span><span class="toc__name">${c.name}<small>${c.note}</small></span><span class="toc__pg">p. ${c.at + 1}</span></button>`;
        li.firstChild.addEventListener('click', () => open(c));
        pages[1].querySelector('.toc').append(li);

        c.el = document.createElement('button');
        c.el.type = 'button';
        c.el.className = 'tab';
        c.el.dataset.n = n;
        c.el.style.setProperty('--n', n);
        c.el.setAttribute('aria-label', `Chapter ${n + 1}: ${c.name}`);
        c.el.innerHTML = `<span>${c.tab}</span>`;
        c.el.addEventListener('click', () => open(c));
        tabs.append(c.el);
    });

    const print = new URLSearchParams(location.search).get('print');
    if (print !== null) {
        document.documentElement.classList.add('single');
        document.body.replaceChildren(pages[Number(print)]);
        return;
    }

    let book = null; // the viewer's window.flipBook, once its pages are ready
    let closed = true;
    let opening = false; // the cover is on its way open, so seeing it is not a reason to close
    let shown = '';

    const viewerDoc = () => {
        try { return viewer.contentDocument; } catch (e) { return null; }
    };
    const single = () => (book ? book.getMode() === 'single' : narrow.matches);

    // The viewer centres a spread box in its window; a page is half of it, or all of it when a
    // narrow screen shows one page at a time. Until the viewer has laid out, guess its box.
    function frame() {
        const r = viewerDoc()?.querySelector('.frame')?.getBoundingClientRect();
        if (r?.height) return r;
        const one = single();
        const h = one ? Math.min(innerHeight - 190, (innerWidth - 48) * PAGE_RATIO) : Math.min(0.927 * (innerHeight - 96), ((innerWidth - 48) / 2) * PAGE_RATIO * 0.95);
        const w = (one ? 1 : 2) * (h / PAGE_RATIO);
        return { left: (innerWidth - w) / 2, top: (innerHeight - h) / 2, width: w, height: h };
    }

    // Where the paper is inside that box, as [left, top, width, height] fractions of it. In a spread
    // the box is the two pages. Alone, a page is drawn smaller, and the closed cover a little larger.
    const HALF = [0.5, 0, 0.5, 1], ONE_PAGE = [0.134, 0.1225, 0.832, 0.7525], ONE_COVER = [0.03, 0.08, 0.94, 0.84];

    function layout() {
        const f = frame();
        const one = single();
        const rect = ([l, t, w, h]) => ({ x: f.left + l * f.width, y: f.top + t * f.height, w: w * f.width, h: h * f.height });
        const p = rect(one ? ONE_PAGE : HALF); // the right-hand page, or the only one
        const c = rect(one ? ONE_COVER : HALF); // the closed cover
        const set = (k, v) => stage.style.setProperty(k, typeof v === 'number' ? `${v}px` : v);
        set('--px', p.x); set('--py', p.y); set('--pw', p.w); set('--ph', p.h);
        set('--cx', c.x); set('--cy', c.y); set('--cw', c.w); set('--ch', c.h);
        set('--lx', one ? p.x : f.left); // the left-hand page, where there is one
        set('--s', String(p.w / PAGE_W));
        // Closed, the book lies askew on the desk, turned about the middle of its cover.
        const cx = c.x + c.w / 2, cy = c.y + c.h / 2;
        set('--ox', cx); set('--oy', cy);
        const to = narrow.matches ? [innerWidth / 2, innerHeight * 0.56, -7, 0.8] : [innerWidth * 0.64, innerHeight * 0.51, -13, 0.76];
        set('--pose', closed ? `translate(${to[0] - cx}px, ${to[1] - cy}px) rotate(${to[2]}deg) scale(${to[3]})` : 'translate(0px, 0px) rotate(0deg) scale(1)');
        stage.classList.toggle('one', one);
        stage.classList.toggle('closed', closed);
    }

    // Called whenever the viewer shows something new.
    function show(state) {
        const visible = state.visiblePages.map((n) => n - 1);
        const at = visible.length ? visible[0] : pages.length - 1; // index of the first page in view
        const onCover = at === 0;
        if (opening && !onCover) opening = false;
        if (!closed && !opening && onCover) { closed = true; layout(); } // turned back to the cover

        // The live copy of what is in view. In a spread, even pages sit left.
        live.replaceChildren(...visible.map((i) => {
            const slot = document.createElement('div');
            slot.className = state.mode !== 'single' && i % 2 ? 'slot slot--l' : 'slot';
            slot.append(pages[i]);
            return slot;
        }));
        glow.classList.remove('on');

        // A tab stays on the fore-edge until its chapter's first spread has been turned past.
        CHAPTERS.forEach((c) => {
            const passed = at > (state.mode === 'single' ? c.page : 2 * c.spread);
            if (c.el.classList.contains('passed') === passed) return;
            c.el.classList.add('hop');
            setTimeout(() => { c.el.classList.toggle('passed', passed); c.el.classList.remove('hop'); }, 260);
        });

        toggle.textContent = closed ? 'Open the book' : 'Close the book';
        const touch = narrow.matches;
        hint.textContent = closed ? (touch ? 'Tap the cover' : 'Click the cover')
            : touch ? 'Swipe or tap a page to turn' : 'Drag or click a page to turn · tabs jump to a chapter';
        count.textContent = onCover ? 'Cover' : at === pages.length - 1 ? 'Back cover'
            : `${visible.map((i) => pad(i)).join('–')} / ${PLAN.length}`;
        history.replaceState(null, '', closed || onCover ? location.pathname : `#${Math.min(SPREADS, Math.ceil(at / 2))}`);
    }

    // The viewer has no change event, so watch its state.
    function watch() {
        const state = book.getState();
        const key = state && `${state.mode}:${state.visiblePages.join(',')}:${closed}`;
        if (state && key !== shown) {
            show(state);
            shown = `${state.mode}:${state.visiblePages.join(',')}:${closed}`;
        }
        setTimeout(watch, 100);
    }

    // Opens the book, to a chapter when one is given.
    async function open(chapter) {
        if (!book) return;
        if (closed) {
            closed = false;
            opening = true;
            layout();
            await wait(520); // let it start to straighten before the cover lifts
        }
        if (chapter) {
            if (book.getMode() === 'single') book.goToPage(chapter.page); else book.goToSpread(chapter.spread);
        } else if (book.getState().visiblePages[0] === 1) book.next();
    }
    function close() {
        if (!book || closed) return;
        opening = false;
        book.goToPage(0); // show() lays it back on the desk when the cover comes round
    }

    document.getElementById('cover').addEventListener('click', () => open());
    toggle.addEventListener('click', () => (closed ? open() : close()));
    document.getElementById('next').addEventListener('click', () => book?.next());
    document.getElementById('prev').addEventListener('click', () => book?.previous());
    addEventListener('keydown', (e) => {
        if (e.key === 'Escape') close();
        else if (e.target.closest('a, button')) return;
        else if (closed && (e.key === 'ArrowRight' || e.key === 'Enter')) open();
        else if (e.key === 'ArrowRight') book?.next();
        else if (e.key === 'ArrowLeft') book?.previous();
    });

    // A link in the live copy is invisible, so underline the one under the pointer.
    live.addEventListener('pointerover', (e) => {
        const link = e.target.closest('a, button');
        if (!link) return;
        const r = (link.querySelector('.toc__name') || link).getBoundingClientRect();
        glow.style.cssText = `left:${r.left}px;top:${r.bottom + 2}px;width:${r.width}px`;
        glow.classList.add('on');
    });
    live.addEventListener('pointerout', () => glow.classList.remove('on'));

    const settle = () => { // lay out without animating
        stage.classList.add('still');
        layout();
        requestAnimationFrame(() => requestAnimationFrame(() => stage.classList.remove('still')));
    };
    addEventListener('resize', layout);
    settle();

    // Wait for the viewer to finish preparing its pages, then swap it in for the cover picture.
    const started = Date.now();
    while (!(viewerDoc()?.getElementById('loading')?.hidden && viewer.contentWindow.flipBook?.getState())) {
        if (Date.now() - started > 30000) return;
        await wait(80);
    }
    book = viewer.contentWindow.flipBook;
    viewer.contentWindow.addEventListener('keydown', (e) => e.key === 'Escape' && close()); // focus is often in the book
    new ResizeObserver(layout).observe(viewerDoc().querySelector('.frame'));
    settle();
    stage.classList.add('ready');
    watch();
    const wanted = Number(location.hash.slice(1));
    if (wanted) open(CHAPTERS.find((c) => c.spread === wanted) || { page: Math.min(pages.length - 1, wanted * 2 - 1), spread: Math.min(SPREADS, wanted) });
})();
