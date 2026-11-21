/* Poker engine: cards, 5-7 card evaluator, ranges, equity. No DOM. */
const RANKS = "23456789TJQKA";
const SUITS = "shdc"; // spade, heart, diamond, club
const card = (r, s) => r * 4 + s;
const rankOf = c => c >> 2;
const suitOf = c => c & 3;
const cardStr = c => RANKS[rankOf(c)] + SUITS[suitOf(c)];

function straightHigh(mask) {
  // mask: 13-bit rank mask. Returns high rank index of best straight, or -1. Wheel => 3.
  const m = (mask << 1) | ((mask >> 12) & 1);
  for (let h = 13; h >= 4; h--) if (((m >> (h - 4)) & 31) === 31) return h - 1;
  return -1;
}
function topBits(mask, n) {
  const out = [];
  for (let r = 12; r >= 0 && out.length < n; r--) if (mask & (1 << r)) out.push(r);
  return out;
}
function pack(cat, ks) {
  let v = cat;
  for (let i = 0; i < 5; i++) v = v * 16 + (ks[i] ?? 0);
  return v;
}
// Evaluate 5..7 cards. Higher is better. Category = Math.floor(score / 16**5).
function evaluate(cards) {
  const cnt = new Array(13).fill(0);
  const sm = [0, 0, 0, 0], sc = [0, 0, 0, 0];
  let rm = 0;
  for (const c of cards) {
    const r = c >> 2, s = c & 3;
    cnt[r]++; sm[s] |= 1 << r; sc[s]++; rm |= 1 << r;
  }
  for (let s = 0; s < 4; s++) if (sc[s] >= 5) {
    const sh = straightHigh(sm[s]);
    if (sh >= 0) return pack(8, [sh]);
    return pack(5, topBits(sm[s], 5));
  }
  const quads = [], trips = [], pairs = [];
  for (let r = 12; r >= 0; r--) {
    if (cnt[r] === 4) quads.push(r);
    else if (cnt[r] === 3) trips.push(r);
    else if (cnt[r] === 2) pairs.push(r);
  }
  if (quads.length) return pack(7, [quads[0], topBits(rm & ~(1 << quads[0]), 1)[0]]);
  if (trips.length && (trips.length > 1 || pairs.length)) {
    const t = trips[0];
    const p = Math.max(trips.length > 1 ? trips[1] : -1, pairs.length ? pairs[0] : -1);
    return pack(6, [t, p]);
  }
  const sh = straightHigh(rm);
  if (sh >= 0) return pack(4, [sh]);
  if (trips.length) return pack(3, [trips[0], ...topBits(rm & ~(1 << trips[0]), 2)]);
  if (pairs.length >= 2) {
    const [a, b] = pairs;
    return pack(2, [a, b, topBits(rm & ~(1 << a) & ~(1 << b), 1)[0]]);
  }
  if (pairs.length) return pack(1, [pairs[0], ...topBits(rm & ~(1 << pairs[0]), 3)]);
  return pack(0, topBits(rm, 5));
}
const CAT_JA = ["ハイカード", "ワンペア", "ツーペア", "スリーカード", "ストレート", "フラッシュ", "フルハウス", "フォーカード", "ストレートフラッシュ"];
const category = score => Math.floor(score / 1048576);

/* ---------- hand classes & ranges ---------- */
// class name like "AKs", "AKo", "77". Grid: row i, col j over ranks A..2.
function className(r1, r2, suited) {
  const hi = Math.max(r1, r2), lo = Math.min(r1, r2);
  if (hi === lo) return RANKS[hi] + RANKS[lo];
  return RANKS[hi] + RANKS[lo] + (suited ? "s" : "o");
}
function classOfCards(a, b) { return className(rankOf(a), rankOf(b), suitOf(a) === suitOf(b)); }
function classCombos(name) {
  return name.length === 2 ? 6 : name[2] === "s" ? 4 : 12;
}
function allClasses() {
  const out = [];
  for (let i = 12; i >= 0; i--) for (let j = 12; j >= 0; j--) {
    if (i === j) out.push(RANKS[i] + RANKS[j]);
    else if (i > j) out.push(RANKS[i] + RANKS[j] + "s");
    else out.push(RANKS[j] + RANKS[i] + "o");
  }
  return out; // 169, row-major in grid order (row i = first rank high->low)
}
const R = ch => RANKS.indexOf(ch);
function parseRange(str) {
  const set = new Set();
  for (let tok of str.split(",").map(t => t.trim()).filter(Boolean)) {
    if (tok.includes("-")) {
      const [a, b] = tok.split("-");
      if (a.length === 2) { // pairs 99-66
        for (let r = R(b[0]); r <= R(a[0]); r++) set.add(RANKS[r] + RANKS[r]);
      } else { // A5s-A2s
        const hi = R(a[0]), suf = a[2];
        for (let r = R(b[1]); r <= R(a[1]); r++) set.add(RANKS[hi] + RANKS[r] + suf);
      }
      continue;
    }
    const plus = tok.endsWith("+");
    if (plus) tok = tok.slice(0, -1);
    if (tok.length === 2) {
      const r0 = R(tok[0]);
      if (plus) for (let r = r0; r <= 12; r++) set.add(RANKS[r] + RANKS[r]);
      else set.add(tok);
    } else {
      const hi = R(tok[0]), lo = R(tok[1]), suf = tok[2];
      if (plus) for (let r = lo; r < hi; r++) set.add(RANKS[hi] + RANKS[r] + suf);
      else set.add(tok);
    }
  }
  return set;
}
function rangePercent(set) {
  let n = 0; for (const c of set) n += classCombos(c);
  return n / 1326 * 100;
}
// all concrete 2-card combos of a class
function combosOf(name) {
  const hi = R(name[0]), lo = R(name[1]);
  const out = [];
  for (let s1 = 0; s1 < 4; s1++) for (let s2 = 0; s2 < 4; s2++) {
    if (hi === lo) { if (s2 > s1) out.push([card(hi, s1), card(lo, s2)]); }
    else if (name[2] === "s" ? s1 === s2 : s1 !== s2) out.push([card(hi, s1), card(lo, s2)]);
  }
  return out;
}

/* ---------- equity ---------- */
function deckWithout(used) {
  const u = new Set(used), d = [];
  for (let c = 0; c < 52; c++) if (!u.has(c)) d.push(c);
  return d;
}
// Exact equity of hero vs villain (both known), board 3-5 cards. Returns {win,tie,lose,n}
function exactEquity(hero, vill, board) {
  const deck = deckWithout([...hero, ...vill, ...board]);
  const need = 5 - board.length;
  let win = 0, tie = 0, lose = 0, n = 0;
  const run = b => {
    const h = evaluate([...hero, ...b]), v = evaluate([...vill, ...b]);
    if (h > v) win++; else if (h === v) tie++; else lose++;
    n++;
  };
  if (need === 0) run(board);
  else if (need === 1) for (const c of deck) run([...board, c]);
  else if (need === 2) for (let i = 0; i < deck.length; i++) for (let j = i + 1; j < deck.length; j++) run([...board, deck[i], deck[j]]);
  else throw new Error("exactEquity needs 3+ board cards");
  return { win, tie, lose, n };
}
// Monte Carlo. villain: array of 2 cards, or array of combos (range), or null (random).
function mcEquity(hero, villain, board, iters, rng = Math.random) {
  let win = 0, tie = 0, lose = 0, n = 0;
  const isCombo = villain && villain.length === 2 && typeof villain[0] === "number";
  const used0 = new Set([...hero, ...board, ...(isCombo ? villain : [])]);
  const base = []; for (let c = 0; c < 52; c++) if (!used0.has(c)) base.push(c);
  const combos = !isCombo && villain ? villain.filter(([a, b]) => !used0.has(a) && !used0.has(b)) : null;
  if (combos && !combos.length) return { win: 0, tie: 0, lose: 0, n: 0 };
  const deck = base.slice();
  for (let it = 0; it < iters; it++) {
    let v;
    if (isCombo) v = villain;
    else if (combos) v = combos[(rng() * combos.length) | 0];
    else v = null;
    // partial shuffle of deck excluding v
    let len = deck.length;
    const pick = [];
    const needV = v ? 0 : 2, needB = 5 - board.length, total = needV + needB;
    let k = 0;
    while (pick.length < total) {
      const idx = k + ((rng() * (len - k)) | 0);
      const c = deck[idx]; deck[idx] = deck[k]; deck[k] = c; k++;
      if (v && (c === v[0] || c === v[1])) continue;
      pick.push(c);
    }
    const vv = v || [pick[0], pick[1]];
    const b = board.concat(pick.slice(needV));
    const h = evaluate([...hero, ...b]), w = evaluate([...vv, ...b]);
    if (h > w) win++; else if (h === w) tie++; else lose++;
    n++;
  }
  return { win, tie, lose, n };
}
const eqOf = r => r.n ? (r.win + r.tie / 2) / r.n : 0;

if (typeof module !== "undefined") module.exports = { RANKS, SUITS, card, rankOf, suitOf, cardStr, evaluate, category, CAT_JA, className, classOfCards, classCombos, allClasses, parseRange, rangePercent, combosOf, deckWithout, exactEquity, mcEquity, eqOf };
