// Run every course question generator many times: answer must be one of the choices, choices unique.
const vm = require('vm'), fs = require('fs');
const ctx = { window: {} }; ctx.window.PokerEngine = require('../engine.js');
vm.runInNewContext(fs.readFileSync(__dirname + '/../course.js', 'utf8'), ctx);
let ui = { $: () => null, $all: () => [], esc: x => x, P: { stats: { odds: { n: 20, ok: 6 } } }, views: {} };
ctx.window.PT_COURSE(ui);
// reach COURSES through a tiny hack: re-evaluate the source to grab the object
const src = fs.readFileSync(__dirname + '/../course.js', 'utf8').replace("window.PT_COURSE = function", "window.__C = COURSES; window.PT_COURSE = function");
const c2 = { window: { PokerEngine: ctx.window.PokerEngine } }; vm.runInNewContext(src, c2);
let bad = 0, n = 0;
for (const [key, C] of Object.entries(c2.window.__C)) C.steps.forEach((st, i) => {
  if (!st.gen) return;
  for (let k = 0; k < 300; k++) {
    const q = st.gen(); n++;
    const uniq = new Set(q.choices).size === q.choices.length;
    if (!(q.answer >= 0 && q.answer < q.choices.length) || !uniq || q.choices.length < 2) { bad++; if (bad < 5) console.log('BAD', key, i, q); }
    if (q.cards) { ctx.window.PokerEngine.parseCards(q.cards.hand); if (q.cards.board) ctx.window.PokerEngine.parseCards(q.cards.board); }
  }
});
console.log('checked', n, 'bad', bad);
console.log('areas', JSON.stringify(ui.courseAreas([{ dec: [{ type: 'facing', ok: false }, { type: 'facing', ok: false }, { type: 'facing', ok: false }, { type: 'facing', ok: true }] }])));
