// Simulate hands with the hero played by a bot; check chip conservation, termination and stats.
global.PokerEngine = require('../engine.js');
const G = require('../game.js');
const eq = Float32Array.from(require('../data/equity169.json'), x => x / 10000);
// minimal PT_DATA from data.js
const vm = require('vm'); const ctx = { window: {} }; vm.runInNewContext(require('fs').readFileSync(__dirname + '/../data.js', 'utf8'), ctx);
G.init(eq, ctx.window.PT_DATA);
const N = +process.argv[2] || 300;
const t = new G.Table({ lineup: ['fish', 'fish', 'reg', 'reg', 'pro'] });
t.players[0].kind = 'reg';
const hands = []; const net = {}; let t0 = Date.now(), maxSteps = 0;
for (let h = 0; h < N; h++) {
  t.newHand();
  let steps = 0;
  while (!t.done) {
    const i = t.toAct;
    let snap = null, sit = null;
    if (i === 0) { if (t.street === 0 && !t.hero.first) { sit = G.preflopSituation(t, 0); t.hero.first = 1; } else if (t.street > 0) snap = G.postflopSnapshot(t, 0); }
    const act = G.botAct(t, i);
    const rec = t.apply(i, act);
    if (sit) { const g = G.gradePreflop(sit, rec.a === 'raise' ? { type: 'raise' } : { type: rec.a }); if (g) t.hero.decisions.push(g); }
    if (snap) { const g = G.gradePostflop(snap, { type: rec.a }); if (g) t.hero.decisions.push(g); }
    t.advance();
    if (++steps > 200) throw new Error('loop');
  }
  maxSteps = Math.max(maxSteps, steps);
  const sum = t.players.reduce((s, p) => s + p.stack, 0);
  if (sum !== 6 * G.START) throw new Error('chips not conserved ' + sum);
  t.players.forEach(p => net[p.kind + ':' + p.name] = (net[p.kind + ':' + p.name] || 0) + p.net / 10);
  hands.push(t.players[0] && G.heroRecord(t));
}
const s = G.aggregate(hands);
console.log('hands', N, 'ms/hand', ((Date.now() - t0) / N).toFixed(1), 'maxSteps', maxSteps);
console.log('net BB by player', net);
console.log('hero(reg) stats', Object.fromEntries(Object.entries(s.stat).map(([k, v]) => [k, v == null ? null : +v.toFixed(1)])), 'dec', s.dec);
console.log('leaks', G.leaks(s).map(l => l.title + ' x' + l.count));
console.log('sample mistake', s.mistakes[0] && s.mistakes[0].d.msg);
