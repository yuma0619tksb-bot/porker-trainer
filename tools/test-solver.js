const E = require('../engine.js'); const S = require('../solver.js');
function solve(cfg, it) {
  const s = new S.Solver(cfg); const t = Date.now();
  s.run(it); const ex = s.exploitability();
  const sum = s.summary();
  return { s, sum, ex, ms: Date.now() - t };
}
// Toy: polarized OOP (nuts KK vs air 43s) vs bluff-catcher QQ, pot 10, pot-size bet only, IP cannot bet.
let r = solve({ board: E.parseCards('Kh8d5c2s2h'), pot: 10, stack: 100, oopRange: 'KK,43s:0.75', ipRange: 'QQ', oopBets: [1], ipBets: [], allowRaise: false }, 2000);
const root = r.sum.nodes[0];
console.log('toy exploitability', r.ex.toFixed(4), 'ms', r.ms);
console.log('KK', root.classes.KK.f, '43s', root.classes['43s'].f, root.actions);
const facing = r.sum.nodes.find(n => n.player === 1 && n.actions[0] === 'フォールド');
console.log('IP vs bet', facing.actions, facing.classes.QQ.f, '(expect call 0.5)');
console.log('EV', r.sum.ev);
// Realistic: wide ranges
r = solve({ board: E.parseCards('Ks9h5d2c7s'), pot: 10, stack: 50,
  oopRange: '22+,A2s+,K9s+,Q9s+,J9s+,T9s,98s,87s,76s,65s,AJo+,KQo',
  ipRange: '22+,A2s+,K5s+,Q8s+,J8s+,T8s+,97s+,86s+,75s+,64s+,54s,A8o+,KTo+,QTo+,JTo',
  oopBets: [0.33, 0.75], ipBets: [0.33, 0.75], allowRaise: true }, 300);
console.log('wide combos', r.s.n, 'nodes', r.s.nodes.length, 'expl', (r.ex / 10 * 100).toFixed(2) + '% pot', 'ms', r.ms, 'ev', r.sum.ev);
console.log('root total', r.sum.nodes[0].actions, r.sum.nodes[0].total.map(x => x.toFixed(2)));
