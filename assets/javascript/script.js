(() => {
    'use strict';

    const { evaluate, formatNumber, formatExpressionHTML, openParens, toInternal, normalize, CalcError } = window.CalcEngine;

    const $ = (selector) => document.querySelector(selector);
    const els = {
        calc: $('#calculator'),
        display: $('#display'),
        expr: $('#expr'),
        result: $('#result'),
        errorChip: $('#error-chip'),
        sci: $('#sci'),
        keypad: $('#keypad'),
        btnSci: $('#btn-sci'),
        btnHistory: $('#btn-history'),
        btnTheme: $('#btn-theme'),
        btnAngle: $('#btn-angle'),
        history: $('#history'),
        historyList: $('#history-list'),
        historyEmpty: $('#history-empty'),
        historyClear: $('#history-clear'),
        historyClose: $('#history-close'),
        help: $('#help'),
        toast: $('#toast'),
        themeColor: document.querySelector('meta[name="theme-color"]'),
    };

    /* ---------- Persistance (tolérante aux navigateurs privés) ---------- */

    const store = {
        get(key, fallback) {
            try {
                const raw = localStorage.getItem('ti26:' + key);
                return raw === null ? fallback : JSON.parse(raw);
            } catch {
                return fallback;
            }
        },
        set(key, value) {
            try { localStorage.setItem('ti26:' + key, JSON.stringify(value)); } catch { /* stockage indisponible */ }
        },
    };

    const THEMES = [
        { id: 'aurora', name: 'Aurore', color: '#0b0d17' },
        { id: 'papier', name: 'Papier', color: '#efe9df' },
        { id: 'lcd', name: 'Rétro LCD', color: '#1c1d20' },
        { id: 'synthwave', name: 'Synthwave', color: '#12002b' },
    ];

    const HISTORY_MAX = 50;
    const FN_OPENER = /(sin|cos|tan|ln|log|√)\($/;
    const BINARY = '+-*/^';

    const isValidEntry = (h) => h && typeof h.expr === 'string' && Number.isFinite(h.result);
    const storedAns = store.get('ans', 0);

    const state = {
        expr: '',
        lastExpr: '',
        ans: Number.isFinite(storedAns) ? storedAns : 0,
        evaluated: false,
        error: null,
        deg: store.get('deg', true) !== false,
        sci: store.get('sci', false) === true,
        history: [].concat(store.get('history', [])).filter(isValidEntry).slice(0, HISTORY_MAX),
    };

    /* ---------- Édition de l'expression ---------- */

    const last = () => state.expr.slice(-1);
    const currentNumber = () => (/(\d*\.?\d*)$/.exec(state.expr) || [''])[0];

    /* Après « = », une saisie repart de zéro ou continue avec le résultat. */
    function startFresh() {
        if (state.evaluated) {
            state.expr = '';
            state.evaluated = false;
        }
    }

    function continueWithAns() {
        if (state.evaluated) {
            state.expr = toInternal(state.ans);
            state.evaluated = false;
        }
    }

    function dropTrailingDot() {
        if (last() === '.') state.expr = state.expr.slice(0, -1);
    }

    function inputDigit(d) {
        startFresh();
        const current = currentNumber();
        if (current.replace('.', '').length >= 15) return nudge();
        if (/[)πe!%]$/.test(state.expr)) state.expr += '*';
        if (current === '0') state.expr = state.expr.slice(0, -1);
        state.expr += d;
    }

    function inputDecimal() {
        startFresh();
        if (currentNumber().includes('.') || /E-?\d*$/.test(state.expr)) return nudge();
        if (/[)πe!%]$/.test(state.expr)) state.expr += '*';
        if (!/\d$/.test(state.expr)) state.expr += '0';
        state.expr += '.';
    }

    function inputOperator(op) {
        continueWithAns();
        dropTrailingDot();
        const expr = state.expr;
        const prev = last();

        if (expr === '' || prev === '(') {
            if (op === '-') state.expr += '-';
            else if (expr === '') state.expr = '0' + op;
            else nudge();
            return;
        }
        if (BINARY.includes(prev)) {
            // 2×−3 est autorisé, sinon on remplace l'opérateur précédent.
            if (op === '-' && '*/^'.includes(prev)) { state.expr += '-'; return; }
            const stripped = expr.replace(/[-+*/^]+$/, '');
            if (stripped === '' || stripped.endsWith('(')) {
                state.expr = stripped + (op === '-' ? '-' : '');
                return;
            }
            state.expr = stripped + op;
            return;
        }
        state.expr += op;
    }

    function inputPostfix(suffix) {
        continueWithAns();
        dropTrailingDot();
        if (state.expr === '' || BINARY.includes(last()) || last() === '(') return nudge();
        state.expr += suffix;
    }

    function inputPrefix(prefix) {
        startFresh();
        dropTrailingDot();
        state.expr += prefix;
    }

    function inputAns() {
        startFresh();
        dropTrailingDot();
        if (/[\d)πe!%]$/.test(state.expr)) state.expr += '*';
        state.expr += toInternal(state.ans);
    }

    function inputCloseParen() {
        if (state.evaluated || openParens(state.expr) <= 0 || BINARY.includes(last()) || last() === '(') return nudge();
        dropTrailingDot();
        state.expr += ')';
    }

    function toggleSign() {
        if (state.evaluated) {
            state.expr = toInternal(-state.ans);
            state.evaluated = false;
            return;
        }
        const expr = state.expr;
        const m = /(\d+\.?\d*|π|e)$/.exec(expr);
        if (!m) {
            if (expr === '' || last() === '(' || (BINARY.includes(last()) && last() !== '-')) state.expr += '-';
            else nudge();
            return;
        }
        const i = m.index;
        const before = expr.slice(0, i);
        const prev = before.slice(-1);
        const beforePrev = before.slice(-2, -1);
        const operand = expr.slice(i);

        if (prev === '-' && (before.length === 1 || BINARY.includes(beforePrev) || beforePrev === '(')) {
            state.expr = before.slice(0, -1) + operand; // retire le moins unaire
        } else if (prev === '-') {
            state.expr = before.slice(0, -1) + '+' + operand;
        } else if (prev === '+') {
            state.expr = before.slice(0, -1) + '-' + operand;
        } else if (prev === '' || prev === '(' || BINARY.includes(prev)) {
            state.expr = before + '-' + operand;
        } else {
            nudge();
        }
    }

    function backspace() {
        if (state.evaluated) return clearAll();
        const fn = FN_OPENER.exec(state.expr);
        state.expr = fn ? state.expr.slice(0, fn.index) : state.expr.slice(0, -1);
    }

    function clearAll() {
        state.expr = '';
        state.evaluated = false;
    }

    function equals() {
        if (state.evaluated || !state.expr) return;
        const closed = state.expr + ')'.repeat(Math.max(0, openParens(state.expr)));
        try {
            const value = evaluate(closed, { deg: state.deg });
            state.ans = value;
            state.lastExpr = closed;
            state.evaluated = true;
            store.set('ans', value);
            if (!/^-?[\d.]+$/.test(closed)) pushHistory(closed, value);
            replay(els.result, 'pop');
            if (value === 42) toast('42 — la réponse à la grande question sur la vie, l’univers et le reste ✨');
            else if (value === 1337) toast('Leet 😎');
        } catch (err) {
            state.error = err instanceof CalcError ? err.message : 'Erreur de calcul';
            replay(els.display, 'shake');
            vibrate([12, 40, 12]);
        }
    }

    const COMMANDS = {
        '.': inputDecimal,
        '+': () => inputOperator('+'),
        '-': () => inputOperator('-'),
        '*': () => inputOperator('*'),
        '/': () => inputOperator('/'),
        '^': () => inputOperator('^'),
        '%': () => inputPostfix('%'),
        '!': () => inputPostfix('!'),
        sq: () => inputPostfix('^2'),
        inv: () => inputPostfix('^(-1)'),
        '(': () => inputPrefix('('),
        ')': inputCloseParen,
        sin: () => inputPrefix('sin('),
        cos: () => inputPrefix('cos('),
        tan: () => inputPrefix('tan('),
        ln: () => inputPrefix('ln('),
        log: () => inputPrefix('log('),
        sqrt: () => inputPrefix('√('),
        π: () => inputPrefix('π'),
        e: () => inputPrefix('e'),
        ans: inputAns,
        sign: toggleSign,
        back: backspace,
        clear: clearAll,
        '=': equals,
    };

    function dispatch(cmd) {
        state.error = null;
        if (/^\d$/.test(cmd)) inputDigit(cmd);
        else if (COMMANDS[cmd]) COMMANDS[cmd]();
        render();
    }

    /* ---------- Rendu ---------- */

    function trimIncomplete(expr) {
        let prev;
        do {
            prev = expr;
            expr = expr.replace(FN_OPENER, '').replace(/[-+*/^(.]$/, '');
        } while (expr !== prev);
        return expr;
    }

    function preview() {
        const expr = trimIncomplete(state.expr);
        if (!expr || /^-?[\d.]+$/.test(expr)) return '';
        try {
            return '= ' + formatNumber(evaluate(expr, { deg: state.deg }));
        } catch {
            return '';
        }
    }

    function render() {
        const { display, expr, result } = els;
        display.classList.toggle('is-result', state.evaluated);
        display.classList.toggle('is-error', Boolean(state.error));
        els.errorChip.hidden = !state.error;

        if (state.evaluated) {
            expr.innerHTML = formatExpressionHTML(state.lastExpr) + '<span class="t-eq"> =</span>';
            result.textContent = formatNumber(state.ans);
        } else {
            expr.innerHTML = state.expr
                ? formatExpressionHTML(state.expr, { ghost: true })
                : '<span class="t-placeholder">0</span>';
            result.textContent = state.error || preview();
        }
        fit();
        expr.scrollLeft = expr.scrollWidth;
    }

    /* Réduit la police de la ligne principale pour que le texte tienne sur l'écran. */
    const measureCtx = document.createElement('canvas').getContext('2d');

    function fit() {
        const big = state.evaluated ? els.result : els.expr;
        const small = state.evaluated ? els.expr : els.result;
        small.style.fontSize = '';
        const max = parseFloat(getComputedStyle(els.display).getPropertyValue('--display-size')) || 56;
        const style = getComputedStyle(big);
        measureCtx.font = style.fontWeight + ' ' + max + 'px ' + style.fontFamily;
        const available = big.clientWidth * 0.96;
        const needed = measureCtx.measureText(big.textContent).width;
        const size = needed > available ? Math.max((max * available) / needed, max * 0.4) : max;
        big.style.fontSize = size.toFixed(1) + 'px';
    }

    function renderHistory() {
        els.historyList.innerHTML = state.history.map((h, i) =>
            '<li><button class="history-item" type="button" data-index="' + i + '" style="animation-delay:' + Math.min(i, 10) * 25 + 'ms">' +
            '<span class="h-expr">' + formatExpressionHTML(h.expr) + '</span>' +
            '<span class="h-result">' + formatNumber(h.result) + '</span>' +
            '</button></li>'
        ).join('');
        els.historyEmpty.hidden = state.history.length > 0;
        els.historyClear.disabled = state.history.length === 0;
    }

    function pushHistory(expr, result) {
        if (state.history[0] && state.history[0].expr === expr) return;
        state.history.unshift({ expr, result });
        state.history.length = Math.min(state.history.length, HISTORY_MAX);
        store.set('history', state.history);
        renderHistory();
    }

    /* ---------- Panneaux, thèmes, options ---------- */

    function setHistoryOpen(open) {
        els.history.classList.toggle('is-open', open);
        els.history.inert = !open;
        els.btnHistory.setAttribute('aria-expanded', String(open));
        if (open) els.historyClose.focus({ preventScroll: true });
    }

    const historyOpen = () => els.history.classList.contains('is-open');

    function setSci(open) {
        state.sci = open;
        els.calc.classList.toggle('sci-open', open);
        els.sci.inert = !open;
        els.btnSci.setAttribute('aria-pressed', String(open));
        store.set('sci', open);
        requestAnimationFrame(fit);
    }

    function setAngle(deg) {
        state.deg = deg;
        els.btnAngle.textContent = deg ? 'DEG' : 'RAD';
        els.btnAngle.title = (deg ? 'Degrés' : 'Radians') + ' — cliquer pour changer (D)';
        store.set('deg', deg);
    }

    function applyTheme(id, announce) {
        const theme = THEMES.find((t) => t.id === id) || THEMES[0];
        document.documentElement.dataset.theme = theme.id;
        els.themeColor.setAttribute('content', theme.color);
        store.set('theme', theme.id);
        if (announce) toast('Thème « ' + theme.name + ' »');
        requestAnimationFrame(fit);
    }

    function cycleTheme() {
        const i = THEMES.findIndex((t) => t.id === document.documentElement.dataset.theme);
        applyTheme(THEMES[(i + 1) % THEMES.length].id, true);
    }

    /* ---------- Retours visuels ---------- */

    let toastTimer;
    function toast(message) {
        els.toast.textContent = message;
        els.toast.classList.add('is-visible');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => els.toast.classList.remove('is-visible'), 2400);
    }

    function replay(el, className) {
        el.classList.remove(className);
        void el.offsetWidth; // relance l'animation CSS
        el.classList.add(className);
    }

    function nudge() {
        replay(els.display, 'shake');
        vibrate(8);
    }

    function vibrate(pattern) {
        if (navigator.vibrate) navigator.vibrate(pattern);
    }

    function flashKey(cmd) {
        const key = document.querySelector('[data-input="' + CSS.escape(cmd) + '"]');
        if (!key || key.closest('[inert]')) return;
        key.classList.add('is-pressed');
        setTimeout(() => key.classList.remove('is-pressed'), 130);
    }

    function ripple(event, key) {
        const rect = key.getBoundingClientRect();
        const dot = document.createElement('span');
        dot.className = 'ripple';
        dot.style.left = event.clientX - rect.left + 'px';
        dot.style.top = event.clientY - rect.top + 'px';
        dot.addEventListener('animationend', () => dot.remove());
        key.appendChild(dot);
    }

    /* ---------- Presse-papiers ---------- */

    async function copyResult() {
        if (!state.evaluated) return;
        const text = String(state.ans).replace('.', ',');
        try {
            await navigator.clipboard.writeText(text);
            toast('Copié : ' + text);
        } catch {
            toast('Copie impossible');
        }
    }

    function pasteExpression(text) {
        const clean = normalize(text).replace(/\*\*/g, '^');
        if (!clean || !/^(?:[\d.E+\-*/^()%!πe√]|sin|cos|tan|ln|log)+$/.test(clean)) {
            toast('Contenu collé non reconnu');
            return;
        }
        startFresh();
        state.error = null;
        state.expr += clean;
        render();
    }

    /* ---------- Événements ---------- */

    document.addEventListener('click', (event) => {
        const key = event.target.closest('[data-input]');
        if (key) dispatch(key.dataset.input);
    });

    document.addEventListener('pointerdown', (event) => {
        const key = event.target.closest('.key');
        if (!key) return;
        ripple(event, key);
        if (event.pointerType === 'touch') vibrate(6);
    });

    els.btnSci.addEventListener('click', () => setSci(!state.sci));
    els.btnAngle.addEventListener('click', () => { setAngle(!state.deg); render(); });
    els.btnTheme.addEventListener('click', cycleTheme);
    els.btnHistory.addEventListener('click', () => setHistoryOpen(!historyOpen()));
    els.historyClose.addEventListener('click', () => setHistoryOpen(false));
    els.result.addEventListener('click', copyResult);

    els.historyClear.addEventListener('click', () => {
        state.history = [];
        store.set('history', []);
        renderHistory();
        toast('Historique effacé');
    });

    els.historyList.addEventListener('click', (event) => {
        const item = event.target.closest('.history-item');
        if (!item) return;
        const h = state.history[Number(item.dataset.index)];
        if (!h) return;
        state.ans = h.result;
        state.lastExpr = h.expr;
        state.evaluated = true;
        state.error = null;
        setHistoryOpen(false);
        render();
        replay(els.result, 'pop');
    });

    const KEYMAP = {
        Enter: '=', '=': '=', Backspace: 'back', Delete: 'clear',
        ',': '.', '.': '.', '+': '+', '-': '-', '*': '*', x: '*', '/': '/', ':': '/', '^': '^',
        '(': '(', ')': ')', '%': '%', '!': '!',
        s: 'sin', c: 'cos', t: 'tan', l: 'ln', g: 'log', r: 'sqrt', q: 'sq', i: 'inv',
        p: 'π', e: 'e', a: 'ans', n: 'sign',
    };

    document.addEventListener('keydown', (event) => {
        if (event.target.closest('dialog')) return;
        const { key } = event;

        if ((event.ctrlKey || event.metaKey) && key.toLowerCase() === 'c' && !String(window.getSelection())) {
            event.preventDefault();
            copyResult();
            return;
        }
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        // Entrée/Espace sur un bouton focalisé : on laisse le comportement natif.
        if ((key === 'Enter' || key === ' ') && event.target.closest('button')) return;

        if (key === 'Escape') {
            event.preventDefault();
            if (historyOpen()) setHistoryOpen(false);
            else { dispatch('clear'); flashKey('clear'); }
            return;
        }
        if (key === '?') { event.preventDefault(); els.help.showModal(); return; }
        if (key === 'T') { event.preventDefault(); cycleTheme(); return; }
        if (key === 'h') { event.preventDefault(); setHistoryOpen(!historyOpen()); return; }
        if (key === 'm') { event.preventDefault(); setSci(!state.sci); return; }
        if (key === 'd') { event.preventDefault(); setAngle(!state.deg); render(); return; }

        if (historyOpen()) return;
        const cmd = /^\d$/.test(key) ? key : KEYMAP[key];
        if (!cmd) return;
        event.preventDefault();
        dispatch(cmd);
        flashKey(cmd);
    });

    document.addEventListener('paste', (event) => {
        const text = event.clipboardData && event.clipboardData.getData('text');
        if (!text) return;
        event.preventDefault();
        pasteExpression(text);
    });

    window.addEventListener('resize', fit);

    /* ---------- Démarrage ---------- */

    applyTheme(document.documentElement.dataset.theme, false);
    setAngle(state.deg);
    setSci(state.sci);
    renderHistory();
    render();
    if (document.fonts) document.fonts.ready.then(fit);

    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
        window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => { }));
    }
})();
