// Pulls a book off the shelf. The cover that swings out is the live openzine book itself: its
// iframe is posed in 3D so the real paper cover hangs off the CSS spine, and the two fly out
// together. When it lands nothing is swapped — the book you read is the one you pulled.
// #<book> in the URL opens a book directly.
(() => {
    const reader = document.getElementById('reader');
    const frame = document.getElementById('frame');
    const closeBtn = document.getElementById('close');
    const flat = matchMedia('(max-width: 860px), (orientation: portrait)');
    const still = matchMedia('(prefers-reduced-motion: reduce)');

    const AUTO_OPEN = true; // once landed, turn the cover to the first spread
    const OUT = { duration: 1150, easing: 'cubic-bezier(0.45, 0, 0.2, 1)', fill: 'forwards' };
    const BACK = { duration: 900, easing: 'cubic-bezier(0.45, 0, 0.2, 1)' };

    // Every pose uses the same function list so the browser interpolates each part, not a matrix.
    // The move comes before perspective so the vanishing point travels with the book, and the scale
    // sits outside the turn so it sizes the cover on screen (the cover lies along the book's z axis).
    const pose = (dx, dy, z, turn, k) =>
        `translate(${dx}px, ${dy}px) perspective(2000px) translateZ(${z}px) scale(${k}) rotateY(${turn}deg)`;
    const REST = { z: 0, turn: 0 };
    const PEEK = { z: 50, turn: -20 }; // the hover pose in shelf.css
    const LANDED = { z: 0, turn: -90 }; // spine edge-on, cover facing out

    let open = null; // { book, slot }
    let loaded = null; // book id currently in the iframe
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));

    function viewerDoc() {
        try {
            return frame.contentDocument;
        } catch (e) {
            return null; // file:// treats the book as another origin
        }
    }

    // Hovering a book starts loading it, so the viewer is usually ready by the time it is pulled.
    function load(book) {
        if (loaded === book.dataset.book) return;
        loaded = book.dataset.book;
        frame.src = 'books/' + loaded + '.html';
    }

    // Resolves when the viewer in the iframe has finished preparing its pages.
    function viewerReady() {
        return new Promise((resolve) => {
            const started = Date.now();
            const tick = () => {
                const doc = viewerDoc();
                const loading = doc && doc.getElementById('loading');
                let done = false;
                if (loading) done = loading.hidden;
                else if (!doc) done = Date.now() - started > 2500;
                if (done || Date.now() - started > 15000) resolve();
                else setTimeout(tick, 80);
            };
            tick();
        });
    }

    // Where the book starts and lands. The viewer centres its spread box in the window, so a
    // closed cover has its spine edge on the centre of that box and is exactly as tall as it.
    function flightPlan(slot) {
        const r = slot.getBoundingClientRect();
        const doc = viewerDoc();
        const box = doc && doc.querySelector('.frame');
        const b = box && box.getBoundingClientRect();
        const real = !!(b && b.height);
        const cover = real ? b.height : Math.min(0.927 * (innerHeight - 96), ((innerWidth - 48) / 2) * 1.377 * 0.95);
        const ox = real ? b.left + b.width / 2 : innerWidth / 2;
        const oy = real ? b.top + b.height / 2 : innerHeight / 2;
        return { dx: ox - r.right, dy: oy - (r.top + r.height / 2), k: cover / r.height, ox, oy };
    }

    // The shelf book and the live cover share one hinge: the book's is its spine's right edge,
    // the iframe's is the centre of the spread box. t runs 0 (on the shelf) to 1 (landed), and
    // the cover face sits a quarter turn off the spine.
    const bookPose = (p, at, t) => pose(p.dx * t, p.dy * t, at.z, at.turn, 1 + (p.k - 1) * t);
    const coverPose = (p, at, t) =>
        pose(-p.dx * (1 - t), -p.dy * (1 - t), at.z, at.turn + 90, (1 + (p.k - 1) * t) / p.k);

    function setLanded(on) {
        const doc = viewerDoc();
        if (doc) doc.documentElement.classList.toggle('landed', on);
    }

    async function pull(book) {
        if (open) return;
        const slot = book.parentElement;
        const fly = !flat.matches && !still.matches;
        const state = (open = { book, slot });
        const current = () => open === state;
        history.replaceState(null, '', '#' + book.dataset.book);
        document.body.classList.add('reading');
        const started = Date.now();
        const hovered = book.matches(':hover');
        load(book);
        if (fly) slot.classList.add('lifted'); // holds the hover pose while the book loads
        await viewerReady();
        if (!current()) return;

        reader.classList.add('open');
        if (fly && viewerDoc()) {
            const p = flightPlan(slot);
            const from = hovered || Date.now() - started > 350 ? PEEK : REST;
            slot.classList.add('flying', 'live');
            frame.style.transformOrigin = `${p.ox}px ${p.oy}px`;
            reader.classList.add('showing');
            const a = book.animate([{ transform: bookPose(p, from, 0) }, { transform: bookPose(p, LANDED, 1) }], OUT);
            const b = frame.animate([{ transform: coverPose(p, from, 0) }, { transform: coverPose(p, LANDED, 1) }], OUT);
            await Promise.all([a.finished, b.finished]);
            if (!current()) return;
            // Landed, the spine is edge-on and the iframe's pose is the identity, so both can let go.
            slot.classList.add('out');
            a.cancel();
            b.cancel();
            frame.style.transformOrigin = '';
            slot.classList.remove('flying', 'lifted', 'live');
        } else {
            slot.classList.remove('lifted');
            reader.classList.add('showing');
        }
        setLanded(true);
        frame.focus();
        if (AUTO_OPEN && fly) {
            await wait(500);
            const doc = viewerDoc();
            const counter = doc && doc.getElementById('counter');
            if (current() && counter && /^0?1\b/.test(counter.textContent.trim())) doc.getElementById('next').click();
        }
    }

    async function putBack() {
        if (!open) return;
        const { book, slot } = open;
        open = null;
        history.replaceState(null, '', location.pathname + location.search);
        setLanded(false);
        if (slot.classList.contains('out')) {
            // The shelf copy of the cover takes over where the open book is, then flies home.
            const p = flightPlan(slot);
            slot.classList.add('flying');
            book.style.transform = bookPose(p, LANDED, 1);
            slot.classList.remove('out');
            const fade = book.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 280, easing: 'ease-out' });
            reader.classList.remove('showing');
            await fade.finished;
            reader.classList.remove('open');
            const back = book.animate([{ transform: bookPose(p, LANDED, 1) }, { transform: bookPose(p, REST, 0) }], BACK);
            book.style.transform = '';
            await back.finished;
            slot.classList.remove('flying');
        } else {
            book.getAnimations().forEach((a) => a.cancel());
            frame.getAnimations().forEach((a) => a.cancel());
            frame.style.transformOrigin = '';
            slot.classList.remove('flying', 'lifted', 'live', 'out');
            reader.classList.remove('showing', 'open');
            await wait(350);
        }
        if (open) return; // another book was pulled while this one flew home
        frame.src = 'about:blank';
        loaded = null;
        document.body.classList.remove('reading');
        book.focus({ preventScroll: true });
    }

    document.querySelectorAll('.book').forEach((book) => {
        book.addEventListener('click', () => pull(book));
        for (const type of ['pointerenter', 'focus']) book.addEventListener(type, () => open || load(book));
    });
    closeBtn.addEventListener('click', putBack);
    addEventListener('keydown', (e) => e.key === 'Escape' && putBack());
    // Escape pressed while the book itself has focus lands in the iframe, not here.
    frame.addEventListener('load', () => {
        try {
            frame.contentWindow.addEventListener('keydown', (e) => e.key === 'Escape' && putBack());
        } catch (e) {}
    });

    const wanted = document.querySelector(`.book[data-book="${CSS.escape(location.hash.slice(1))}"]`);
    if (wanted) pull(wanted);
})();
