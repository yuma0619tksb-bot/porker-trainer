// Precompute all-in preflop equity of each of the 169 hand classes vs each other (Monte Carlo).
// Output: data/equity169.json = array of 169*169 integers (equity * 10000), row i = hero class i.
const E = require('../engine.js');
const N = +process.argv[2] || 20000;
E.seed(12345);
const L = E.CLASS_LABELS, out = new Array(169 * 169);
const combos = L.map(l => E.rangeCombos({ [l]: 1 }, []));
for (let i = 0; i < 169; i++) {
  for (let j = i; j < 169; j++) {
    if (E.comboPairs(i, j) === 0) { out[i * 169 + j] = out[j * 169 + i] = 5000; continue; }
    const r = E.equity([combos[i], combos[j]], [], [], { iterations: N });
    const v = Math.round(r.equity[0] * 10000);
    out[i * 169 + j] = v; out[j * 169 + i] = 10000 - v;
  }
  if (i % 13 === 12) console.error('row', i);
}
require('fs').writeFileSync(__dirname + '/../data/equity169.json', JSON.stringify(out));
console.error('done');
