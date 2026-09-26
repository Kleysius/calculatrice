const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluate, formatNumber, formatExpressionHTML, toInternal, openParens, CalcError } = require('../assets/javascript/engine.js');

const approx = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} ≈ ${expected}`);

test('opérations de base et priorités', () => {
  assert.equal(evaluate('1+2*3'), 7);
  assert.equal(evaluate('(1+2)*3'), 9);
  assert.equal(evaluate('10/4'), 2.5);
  assert.equal(evaluate('2^3^2'), 512);
  assert.equal(evaluate('-2^2'), -4);
  assert.equal(evaluate('2^-1'), 0.5);
  assert.equal(evaluate('2*-3'), -6);
  assert.equal(evaluate('--3'), 3);
});

test('précision flottante corrigée', () => {
  assert.equal(evaluate('0.1+0.2'), 0.3);
  assert.equal(evaluate('1/3*3'), 1);
  assert.equal(evaluate('1.1*1.1'), 1.21);
});

test('multiplication implicite et parenthèses auto-fermées', () => {
  approx(evaluate('2π'), 2 * Math.PI);
  assert.equal(evaluate('2(3+4)'), 14);
  assert.equal(evaluate('(2)(3)'), 6);
  assert.equal(evaluate('((2+3'), 5);
  assert.equal(openParens('sin((2'), 2);
});

test('pourcentages façon calculatrice de bureau', () => {
  assert.equal(evaluate('10%'), 0.1);
  assert.equal(evaluate('200+10%'), 220);
  assert.equal(evaluate('200-10%'), 180);
  assert.equal(evaluate('50*10%'), 5);
});

test('fonctions scientifiques', () => {
  assert.equal(evaluate('sin(30)'), 0.5);
  assert.equal(evaluate('cos(90)'), 0);
  assert.equal(evaluate('sin(180)'), 0);
  assert.equal(evaluate('sin(π)', { deg: false }), 0);
  assert.equal(evaluate('tan(45)'), 1);
  assert.equal(evaluate('√(16)'), 4);
  assert.equal(evaluate('√9+1'), 4);
  assert.equal(evaluate('log(1000)'), 3);
  assert.equal(evaluate('ln(e)'), 1);
  assert.equal(evaluate('5!'), 120);
  assert.equal(evaluate('sin(30)^2'), 0.25);
});

test('erreurs explicites', () => {
  const fails = (src, msg) => assert.throws(() => evaluate(src), (e) => e instanceof CalcError && msg.test(e.message));
  fails('1/0', /zéro/);
  fails('2+', /incomplète/);
  fails('√(-1)', /négatif/);
  fails('ln(0)', /Logarithme/);
  fails('tan(90)', /indéfinie/);
  fails('2.5!', /Factorielle/);
  fails('1+2)', /Parenthèse/);
  fails('10^400', /capacité/);
  fails('alert(1)', /inconnu/);
});

test('saisie collée normalisée', () => {
  assert.equal(evaluate('1 234,5 × 2'), 2469);
  assert.equal(evaluate('10 ÷ 4 − 1'), 1.5);
});

test('formatage français', () => {
  assert.equal(formatNumber(1234567.5), '1 234 567,5');
  assert.equal(formatNumber(-42), '−42');
  assert.equal(formatNumber(1.5e20), '1,5 × 10²⁰');
  assert.equal(formatNumber(2e-9), '2 × 10⁻⁹');
  assert.equal(formatNumber(123456789012345), '123 456 789 012 345');
});

test('réinjection du résultat', () => {
  assert.equal(toInternal(-5), '(-5)');
  assert.equal(evaluate(toInternal(-5) + '^2'), 25);
  assert.equal(evaluate(toInternal(1.5e21) + '*2'), 3e21);
});

test('affichage de l’expression', () => {
  const html = formatExpressionHTML('1234.5*sin(30', { ghost: true });
  assert.match(html, /1 234,5/);
  assert.match(html, /×/);
  assert.match(html, /t-ghost">\)</);
  assert.equal(formatExpressionHTML('<b>'), '&#60;b&#62;');
});
