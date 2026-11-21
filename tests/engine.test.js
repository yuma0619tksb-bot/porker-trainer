// node tests/engine.test.js : checks evaluator frequencies and known equities
const E = require('../app/engine.js');
const P = s => (s.match(/../g) || []).map(x => E.card(E.RANKS.indexOf(x[0]), E.SUITS.indexOf(x[1])));
let fail = 0;
const near = (name, got, exp, tol) => { const ok = Math.abs(got - exp) <= tol; if (!ok) fail++; console.log(ok ? 'ok  ' : 'FAIL', name, got.toFixed(3), 'expected', exp); };
// 7-card category frequencies (%), 1M random hands
const cnt = new Array(9).fill(0), N = 1e6;
for (let i = 0; i < N; i++) { const d = new Set(); while (d.size < 7) d.add((Math.random() * 52) | 0); cnt[E.category(E.evaluate([...d]))]++; }
[17.41, 43.82, 23.50, 4.83, 4.62, 3.03, 2.60, 0.168, 0.0311].forEach((e, i) => near(E.CAT_JA[i], cnt[i] / N * 100, e, Math.max(0.15, e * 0.1)));
// exact postflop equity: AhKh vs QsJs on Th9h2c, compare with Monte Carlo
const ex = E.eqOf(E.exactEquity(P('AhKh'), P('QsJs'), P('Th9h2c')));
near('exact vs MC (flop)', ex * 100, E.eqOf(E.mcEquity(P('AhKh'), P('QsJs'), P('Th9h2c'), 200000)) * 100, 0.5);
near('AsAh vs KsKh preflop', E.eqOf(E.mcEquity(P('AsAh'), P('KsKh'), [], 300000)) * 100, 82.64, 0.4);
near('UTG range %', E.rangePercent(E.parseRange("22+, A2s+, K9s+, QTs+, JTs, T9s, 98s, ATo+, KJo+")), 17.6, 0.1);
process.exit(fail ? 1 : 0);
