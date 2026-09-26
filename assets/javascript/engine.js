/*
 * Thomas Instruments TI-26 — moteur de calcul.
 *
 * Analyseur à descente récursive (aucun eval) :
 *   expression := terme (('+' | '-') terme)*
 *   terme      := unaire (('*' | '/') unaire | unaire implicite)*
 *   unaire     := ('-' | '+') unaire | puissance
 *   puissance  := postfixe ('^' unaire)?          (associatif à droite)
 *   postfixe   := primaire ('!' | '%')*
 *   primaire   := nombre | π | e | fonction primaire | '(' expression ')'?
 *
 * Les parenthèses non fermées sont refermées automatiquement en fin d'expression.
 * « a + b% » vaut a + a×b/100, comme sur une calculatrice de bureau.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CalcEngine = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  class CalcError extends Error {
    constructor(message) {
      super(message);
      this.name = 'CalcError';
    }
  }

  const FUNCTIONS = ['sin', 'cos', 'tan', 'ln', 'log', '√'];
  const OPERATORS = '+-*/^()%!';

  /* Accepte aussi la saisie « humaine » (collage) : × ÷ − et la virgule décimale. */
  function normalize(src) {
    return String(src)
      .replace(/[\s  ]+/g, '')
      .replace(/[−–]/g, '-')
      .replace(/[×x]/g, '*')
      .replace(/[÷:]/g, '/')
      .replace(/,/g, '.')
      .replace(/pi/gi, 'π')
      .replace(/sqrt/gi, '√');
  }

  function tokenize(src) {
    const tokens = [];
    let i = 0;
    while (i < src.length) {
      const ch = src[i];
      if ((ch >= '0' && ch <= '9') || ch === '.') {
        const m = /^(\d*\.?\d*)(E[+-]?\d+)?/.exec(src.slice(i));
        const value = Number(m[0]);
        if (m[1] === '.' || Number.isNaN(value)) throw new CalcError('Nombre invalide');
        tokens.push({ type: 'num', value });
        i += m[0].length;
        continue;
      }
      if (ch === 'π') { tokens.push({ type: 'num', value: Math.PI }); i++; continue; }
      if (ch === 'e') { tokens.push({ type: 'num', value: Math.E }); i++; continue; }
      const fn = FUNCTIONS.find((f) => src.startsWith(f, i));
      if (fn) { tokens.push({ type: 'fn', value: fn }); i += fn.length; continue; }
      if (OPERATORS.includes(ch)) { tokens.push({ type: 'op', value: ch }); i++; continue; }
      throw new CalcError('Caractère inconnu « ' + ch + ' »');
    }
    return tokens;
  }

  const snap = (v) => (Math.abs(v) < 1e-12 ? 0 : v);
  const toRad = (x, deg) => (deg ? (x * Math.PI) / 180 : x);

  function applyFunction(name, x, deg) {
    switch (name) {
      case 'sin': return snap(Math.sin(toRad(x, deg)));
      case 'cos': return snap(Math.cos(toRad(x, deg)));
      case 'tan':
        if (deg && Math.abs(x % 180) === 90) throw new CalcError('Tangente indéfinie');
        return snap(Math.tan(toRad(x, deg)));
      case 'ln':
        if (x <= 0) throw new CalcError('Logarithme d’un nombre ≤ 0');
        return Math.log(x);
      case 'log':
        if (x <= 0) throw new CalcError('Logarithme d’un nombre ≤ 0');
        return Math.log10(x);
      case '√':
        if (x < 0) throw new CalcError('Racine d’un nombre négatif');
        return Math.sqrt(x);
    }
    throw new CalcError('Fonction inconnue');
  }

  function factorial(n) {
    if (n < 0 || !Number.isInteger(n)) throw new CalcError('Factorielle d’un entier positif uniquement');
    if (n > 170) throw new CalcError('Dépassement de capacité');
    let r = 1;
    for (let k = 2; k <= n; k++) r *= k;
    return r;
  }

  function parse(tokens, deg) {
    let pos = 0;
    const peek = () => tokens[pos];
    const isOp = (t, v) => t !== undefined && t.type === 'op' && t.value === v;
    const startsOperand = (t) => t !== undefined && (t.type === 'num' || t.type === 'fn' || isOp(t, '('));

    function expression() {
      let left = term().value;
      while (isOp(peek(), '+') || isOp(peek(), '-')) {
        const op = tokens[pos++].value;
        const right = term();
        const r = right.percent ? left * right.value : right.value;
        left = op === '+' ? left + r : left - r;
      }
      return left;
    }

    function term() {
      let { value, percent } = unary();
      for (;;) {
        const t = peek();
        if (isOp(t, '*') || isOp(t, '/')) {
          pos++;
          const r = unary().value;
          if (t.value === '/' && r === 0) throw new CalcError('Division par zéro');
          value = t.value === '*' ? value * r : value / r;
        } else if (startsOperand(t)) {
          value *= unary().value;
        } else {
          break;
        }
        percent = false;
      }
      return { value, percent };
    }

    function unary() {
      if (isOp(peek(), '-')) {
        pos++;
        const r = unary();
        return { value: -r.value, percent: r.percent };
      }
      if (isOp(peek(), '+')) { pos++; return unary(); }
      return power();
    }

    function power() {
      const base = postfix();
      if (!isOp(peek(), '^')) return base;
      pos++;
      const exp = unary().value;
      return { value: Math.pow(base.value, exp), percent: false };
    }

    function postfix() {
      let value = primary();
      let percent = false;
      for (;;) {
        if (isOp(peek(), '!')) { pos++; value = factorial(value); percent = false; }
        else if (isOp(peek(), '%')) { pos++; value /= 100; percent = true; }
        else break;
      }
      return { value, percent };
    }

    function primary() {
      const t = tokens[pos++];
      if (t === undefined) throw new CalcError('Expression incomplète');
      if (t.type === 'num') return t.value;
      if (t.type === 'fn') {
        const arg = isOp(peek(), '(') ? primary() : postfix().value;
        return applyFunction(t.value, arg, deg);
      }
      if (isOp(t, '(')) {
        const v = expression();
        if (isOp(peek(), ')')) pos++;
        else if (peek() !== undefined) throw new CalcError('Syntaxe invalide');
        return v;
      }
      throw new CalcError(isOp(t, ')') ? 'Parenthèse en trop' : 'Syntaxe invalide');
    }

    const value = expression();
    if (pos < tokens.length) {
      throw new CalcError(isOp(peek(), ')') ? 'Parenthèse en trop' : 'Syntaxe invalide');
    }
    return value;
  }

  function evaluate(src, options) {
    const deg = !options || options.deg !== false;
    const tokens = tokenize(normalize(src));
    if (!tokens.length) throw new CalcError('Expression vide');
    const value = parse(tokens, deg);
    if (Number.isNaN(value)) throw new CalcError('Hors du domaine de définition');
    if (!Number.isFinite(value)) throw new CalcError('Dépassement de capacité');
    const rounded = Number(value.toPrecision(15));
    return rounded === 0 ? 0 : rounded;
  }

  function openParens(src) {
    let n = 0;
    for (const ch of src) {
      if (ch === '(') n++;
      else if (ch === ')') n--;
    }
    return n;
  }

  /* ---------- Formatage (fr-FR) ---------- */

  const NNBSP = ' ';
  const SUPERSCRIPT = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻', '+': '' };
  const sup = (s) => s.replace(/[0-9+-]/g, (c) => SUPERSCRIPT[c]);
  const intFormat = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
  const decFormat = new Intl.NumberFormat('fr-FR', { maximumSignificantDigits: 12 });

  function formatNumber(n) {
    if (n === 0) return '0';
    const abs = Math.abs(n);
    let out;
    if (abs >= 1e15 || abs < 1e-7) {
      const [mantissa, exp] = n.toExponential(9).split('e');
      out = mantissa.replace(/\.?0+$/, '').replace('.', ',') + ' × 10' + sup(exp);
    } else {
      out = (Number.isInteger(n) ? intFormat : decFormat).format(n);
    }
    return out.replace(/-/g, '−');
  }

  /* Représentation interne d'un nombre, réinjectable dans une expression. */
  function toInternal(n) {
    const s = String(n).replace('e+', 'E').replace('e', 'E');
    return n < 0 ? '(' + s + ')' : s;
  }

  const groupInt = (s) => s.replace(/\B(?=(\d{3})+(?!\d))/g, NNBSP);
  const escapeHTML = (s) => s.replace(/[&<>"']/g, (c) => '&#' + c.charCodeAt(0) + ';');
  const OP_GLYPHS = { '+': '+', '-': '−', '*': '×', '/': '÷', '^': '^', '%': '%', '!': '!' };

  /* Expression interne → HTML coloré (le texte inconnu est échappé). */
  function formatExpressionHTML(src, options) {
    let out = '';
    let i = 0;
    while (i < src.length) {
      const rest = src.slice(i);
      const num = /^(\d+\.?\d*|\.\d*)(E[+-]?\d+)?/.exec(rest);
      if (num) {
        const [int, frac] = num[1].split('.');
        let text = groupInt(int) + (frac !== undefined ? ',' + frac : '');
        if (num[2]) text += ' × 10' + sup(num[2].slice(1));
        out += '<span class="t-num">' + text + '</span>';
        i += num[0].length;
        continue;
      }
      const fn = FUNCTIONS.find((f) => src.startsWith(f, i));
      if (fn) {
        out += '<span class="t-fn">' + fn + '</span>';
        i += fn.length;
        continue;
      }
      const ch = src[i];
      if (ch === 'π' || ch === 'e') out += '<span class="t-const">' + ch + '</span>';
      else if (ch === '(' || ch === ')') out += '<span class="t-par">' + ch + '</span>';
      else if (OP_GLYPHS[ch]) out += '<span class="t-op">' + OP_GLYPHS[ch] + '</span>';
      else out += escapeHTML(ch);
      i++;
    }
    if (options && options.ghost) {
      const missing = openParens(src);
      if (missing > 0) out += '<span class="t-ghost">' + ')'.repeat(missing) + '</span>';
    }
    return out;
  }

  return { CalcError, normalize, tokenize, evaluate, openParens, formatNumber, formatExpressionHTML, toInternal };
});
