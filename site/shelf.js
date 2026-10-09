// Pulls a book off the shelf: the book flies out and turns its cover to face you, then the
// openzine viewer for that book fades in over it. #<book> in the URL opens a book directly.
(() => {
    const reader = document.getElementById('reader');
    const frame = document.getElementById('frame');
    const closeBtn = document.getElementById('close');
    const flat = matchMedia('(max-width: 860px), (orientation: portrait)');
    const still = matchMedia('(prefers-reduced-motion: reduce)');
    // Every pose uses the same function list so the browser interpolates each part, not a matrix.
    // The move comes before perspective so the vanishing point travels with the book, and the scale
    // sits outside the turn so it sizes the cover on screen (the cover lies along the book's z axis).
    const pose = (dx, dy, z, turn, k) =>
        `translate(${dx}px, ${dy}px) perspective(2000px) translateZ(${z}px) scale(${k}) rotateY(${turn}deg)`;
    const REST = pose(0, 0, 0, 0, 1);
    const PEEK = pose(0, 0, 50, -20, 1); // the hover pose in shelf.css
    let open = null; // { book, slot, flight }
    let loaded = null; // book id currently in the iframe

    // Hovering a book starts loading it, so the viewer is usually ready by the time the book lands.
    function load(book) {
        if (loaded === book.dataset.book) return;
        loaded = book.dataset.book;
        frame.src = 'books/' + loaded + '.html';
    }

    // Where the viewer draws the closed front cover on a landscape screen: its spine edge on
    // the centre line, vertically centred, filling most of the stage between the two 48px bars.
    function landing(slot) {
        const r = slot.getBoundingClientRect();
        const height = Math.min(0.927 * (innerHeight - 96), ((innerWidth - 48) / 2) * 1.377 * 0.95);
        const dx = innerWidth / 2 - r.right;
        const dy = innerHeight / 2 - (r.top + r.height / 2);
        return pose(dx, dy, 0, -90, height / r.height);
    }

    // Resolves when the viewer in the iframe has finished preparing its pages.
    function viewerReady() {
        return new Promise((resolve) => {
            const started = Date.now();
            const tick = () => {
                let done = false;
                let doc = null;
                try {
                    doc = frame.contentDocument;
                } catch (e) {}
                const loading = doc && doc.getElementById('loading');
                if (loading) done = loading.hidden;
                else if (!doc) done = Date.now() - started > 2500; // file:// blocks the peek; just wait a moment
                if (done || Date.now() - started > 15000) resolve();
                else setTimeout(tick, 120);
            };
            tick();
        });
    }

    async function pull(book) {
        if (open) return;
        const slot = book.parentElement;
        const animate = !flat.matches && !still.matches;
        open = { book, slot, flight: null };
        history.replaceState(null, '', '#' + book.dataset.book);
        document.body.classList.add('reading');
        load(book);
        reader.classList.add('open');
        const ready = viewerReady();

        if (animate) {
            slot.classList.add('flying');
            const from = book.matches(':hover') ? PEEK : REST;
            open.flight = book.animate([{ transform: from }, { transform: landing(slot) }], {
                duration: 1100,
                easing: 'cubic-bezier(0.45, 0, 0.2, 1)',
                fill: 'forwards',
            });
            await open.flight.finished;
        }
        await ready;
        if (!open || open.book !== book) return;
        // The viewer comes up underneath the flown cover, then the cover dissolves into it.
        reader.classList.add('ready');
        if (animate) book.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 600, delay: 300, easing: 'ease-in-out', fill: 'forwards' });
        frame.focus();
    }

    async function putBack() {
        if (!open) return;
        const { book, slot, flight } = open;
        history.replaceState(null, '', location.pathname + location.search);
        reader.classList.remove('ready');
        if (flight) {
            book.getAnimations().forEach((a) => a !== flight && a.cancel());
            reader.classList.remove('open');
            const back = book.animate([{ transform: landing(slot) }, { transform: REST }], {
                duration: 900,
                easing: 'cubic-bezier(0.45, 0, 0.2, 1)',
            });
            flight.cancel();
            await back.finished;
            slot.classList.remove('flying');
        } else {
            reader.classList.remove('open');
            await new Promise((r) => setTimeout(r, 350));
        }
        frame.src = 'about:blank';
        loaded = null;
        document.body.classList.remove('reading');
        open = null;
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
