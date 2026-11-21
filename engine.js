/* Poker engine: hand evaluation, ranges, equity, push/fold Nash.
 * Works in the browser (global PokerEngine) and in Node (module.exports).
 * Cards are ints 0..51: rank = c >> 2 (0 = deuce .. 12 = ace), suit = c & 3.
 */
(function (root) {
  'use strict';
  var RANKS = '23456789TJQKA';
  var SUITS = 'cdhs';
  var CAT_NAMES = ['ハイカード', 'ワンペア', 'ツーペア', 'スリーカード', 'ストレート', 'フラッシュ', 'フルハウス', 'フォーカード', 'ストレートフラッシュ'];

  // ---------- cards ----------
  function card(str) {
    var r = RANKS.indexOf(str[0].toUpperCase());
    var s = SUITS.indexOf(str[1].toLowerCase());
    if (r < 0 || s < 0) throw new Error('bad card: ' + str);
    return (r << 2) | s;
  }
  function cardStr(c) { return RANKS[c >> 2] + SUITS[c & 3]; }
  function parseCards(str) {
    var out = [];
    var s = (str || '').replace(/[\s,]+/g, '');
    for (var i = 0; i + 1 < s.length; i += 2) out.push(card(s.substr(i, 2)));
    return out;
  }

  // ---------- evaluator ----------
  var STRAIGHT = new Int8Array(8192); // top rank of best straight in a 13-bit rank mask, -1 if none
  var BITCOUNT = new Int8Array(8192);
  (function () {
    for (var m = 0; m < 8192; m++) {
      var b = 0, x = m; while (x) { b += x & 1; x >>= 1; }
      BITCOUNT[m] = b;
      STRAIGHT[m] = -1;
      for (var top = 12; top >= 4; top--) {
        var need = 0x1f << (top - 4);
        if ((m & need) === need) { STRAIGHT[m] = top; break; }
      }
      if (STRAIGHT[m] < 0 && (m & 0x100f) === 0x100f) STRAIGHT[m] = 3; // wheel A2345
    }
  })();

  function topBits(mask, n) { // encode the n highest set bits as nibbles
    var v = 0, k = 0;
    for (var r = 12; r >= 0 && k < n; r--) if (mask & (1 << r)) { v = (v << 4) | r; k++; }
    while (k < n) { v <<= 4; k++; }
    return v;
  }

  var _cnt = new Int8Array(13);
  // Evaluate 5-7 cards. Bigger score = better hand. Category = score >> 20.
  function evaluate(cards, n) {
    n = n || cards.length;
    var sm0 = 0, sm1 = 0, sm2 = 0, sm3 = 0, all = 0, i, c, r;
    for (i = 0; i < 13; i++) _cnt[i] = 0;
    for (i = 0; i < n; i++) {
      c = cards[i]; r = c >> 2;
      _cnt[r]++; all |= 1 << r;
      switch (c & 3) { case 0: sm0 |= 1 << r; break; case 1: sm1 |= 1 << r; break; case 2: sm2 |= 1 << r; break; default: sm3 |= 1 << r; }
    }
    var fm = BITCOUNT[sm0] >= 5 ? sm0 : BITCOUNT[sm1] >= 5 ? sm1 : BITCOUNT[sm2] >= 5 ? sm2 : BITCOUNT[sm3] >= 5 ? sm3 : 0;
    if (fm) {
      var sf = STRAIGHT[fm];
      if (sf >= 0) return (8 << 20) | sf;
    }
    var quad = -1, trips = -1, trips2 = -1, pair1 = -1, pair2 = -1, pair3 = -1;
    for (r = 12; r >= 0; r--) {
      var k = _cnt[r];
      if (k === 4) quad = r;
      else if (k === 3) { if (trips < 0) trips = r; else if (trips2 < 0) trips2 = r; }
      else if (k === 2) { if (pair1 < 0) pair1 = r; else if (pair2 < 0) pair2 = r; else if (pair3 < 0) pair3 = r; }
    }
    if (quad >= 0) return (7 << 20) | (quad << 4) | topBits(all & ~(1 << quad), 1);
    if (trips >= 0 && (trips2 >= 0 || pair1 >= 0)) {
      var p = trips2 > pair1 ? trips2 : pair1;
      return (6 << 20) | (trips << 4) | p;
    }
    if (fm) return (5 << 20) | topBits(fm, 5);
    var st = STRAIGHT[all];
    if (st >= 0) return (4 << 20) | st;
    if (trips >= 0) return (3 << 20) | (trips << 8) | topBits(all & ~(1 << trips), 2);
    if (pair2 >= 0) return (2 << 20) | (pair1 << 8) | (pair2 << 4) | topBits(all & ~(1 << pair1) & ~(1 << pair2), 1);
    if (pair1 >= 0) return (1 << 20) | (pair1 << 12) | topBits(all & ~(1 << pair1), 3);
    return topBits(all, 5);
  }
  function category(score) { return score >> 20; }

  // ---------- 169 hand classes ----------
  // Grid: row/col 0 = Ace ... 12 = Deuce. Pair on diagonal, suited above (row<col), offsuit below.
  function gridLabel(row, col) {
    var a = 12 - row, b = 12 - col;
    if (row === col) return RANKS[a] + RANKS[a];
    if (row < col) return RANKS[a] + RANKS[b] + 's';
    return RANKS[b] + RANKS[a] + 'o';
  }
  var CLASS_LABELS = [];
  var CLASS_INDEX = {};
  for (var rr = 0; rr < 13; rr++) for (var cc = 0; cc < 13; cc++) {
    var lab = gridLabel(rr, cc);
    CLASS_INDEX[lab] = CLASS_LABELS.length;
    CLASS_LABELS.push(lab);
  }
  function classCombos(label) {
    var hi = RANKS.indexOf(label[0]), lo = RANKS.indexOf(label[1]);
    var out = [], s1, s2;
    if (hi === lo) {
      for (s1 = 0; s1 < 4; s1++) for (s2 = s1 + 1; s2 < 4; s2++) out.push([(hi << 2) | s1, (lo << 2) | s2]);
    } else if (label[2] === 's') {
      for (s1 = 0; s1 < 4; s1++) out.push([(hi << 2) | s1, (lo << 2) | s1]);
    } else {
      for (s1 = 0; s1 < 4; s1++) for (s2 = 0; s2 < 4; s2++) if (s1 !== s2) out.push([(hi << 2) | s1, (lo << 2) | s2]);
    }
    return out;
  }
  function comboClass(c1, c2) {
    var r1 = c1 >> 2, r2 = c2 >> 2;
    var hi = Math.max(r1, r2), lo = Math.min(r1, r2);
    if (hi === lo) return RANKS[hi] + RANKS[lo];
    return RANKS[hi] + RANKS[lo] + ((c1 & 3) === (c2 & 3) ? 's' : 'o');
  }
  function classSize(label) { return label.length === 2 ? 6 : label[2] === 's' ? 4 : 12; }

  // ---------- range parsing ----------
  // Supports: AA, AKs, AKo, AK, 22+, ATs+, A9o+, A2s-A5s, 77-TT, weights "AKo:0.5", specific combos "AsKs".
  function expandToken(tok) {
    tok = tok.trim();
    if (!tok) return [];
    var m;
    if ((m = /^([2-9TJQKA])([cdhs])([2-9TJQKA])([cdhs])$/i.exec(tok))) return [{ combo: [card(m[1] + m[2]), card(m[3] + m[4])] }];
    tok = tok.toUpperCase().replace(/S$/, 's').replace(/O$/, 'o').replace(/S\+$/, 's+').replace(/O\+$/, 'o+');
    tok = tok.replace(/([2-9TJQKA][2-9TJQKA])S-/, '$1s-').replace(/([2-9TJQKA][2-9TJQKA])O-/, '$1o-');
    var labels = [];
    var R = function (ch) { return RANKS.indexOf(ch); };
    if ((m = /^([2-9TJQKA])\1\+$/.exec(tok))) { // 22+
      for (var r = R(m[1]); r <= 12; r++) labels.push(RANKS[r] + RANKS[r]);
    } else if ((m = /^([2-9TJQKA])\1-([2-9TJQKA])\2$/.exec(tok))) { // 22-55
      var a = R(m[1]), b = R(m[2]);
      for (var r2 = Math.min(a, b); r2 <= Math.max(a, b); r2++) labels.push(RANKS[r2] + RANKS[r2]);
    } else if ((m = /^([2-9TJQKA])([2-9TJQKA])([so]?)\+$/.exec(tok))) { // ATs+
      var hi = R(m[1]), lo = R(m[2]);
      for (var k = lo; k < hi; k++) pushSO(labels, RANKS[hi] + RANKS[k], m[3]);
    } else if ((m = /^([2-9TJQKA])([2-9TJQKA])([so]?)-([2-9TJQKA])([2-9TJQKA])([so]?)$/.exec(tok))) { // A2s-A5s
      var h = R(m[1]), l1 = R(m[2]), l2 = R(m[5]);
      for (var k2 = Math.min(l1, l2); k2 <= Math.max(l1, l2); k2++) pushSO(labels, RANKS[h] + RANKS[k2], m[3] || m[6]);
    } else if ((m = /^([2-9TJQKA])([2-9TJQKA])([so]?)$/.exec(tok))) {
      var x = R(m[1]), y = R(m[2]);
      if (x === y) labels.push(m[1] + m[2]);
      else pushSO(labels, RANKS[Math.max(x, y)] + RANKS[Math.min(x, y)], m[3]);
    } else throw new Error('レンジの書き方が読めません: ' + tok);
    return labels.map(function (l) { return { label: l }; });
  }
  function pushSO(arr, base, so) {
    if (so === 's' || so === '') arr.push(base + 's');
    if (so === 'o' || so === '') arr.push(base + 'o');
  }
  // Returns {label: weight}
  function parseRange(str) {
    var out = {};
    (str || '').split(/[,\s]+/).forEach(function (part) {
      if (!part) return;
      var w = 1, idx = part.indexOf(':');
      if (idx >= 0) { w = parseFloat(part.slice(idx + 1)); part = part.slice(0, idx); }
      expandToken(part).forEach(function (e) {
        if (e.label) out[e.label] = w;
        else out[cardStr(e.combo[0]) + cardStr(e.combo[1])] = w;
      });
    });
    return out;
  }
  // Range object {label: weight} -> list of {c1,c2,w}, removing dead cards.
  function rangeCombos(range, dead) {
    var deadMask = {};
    (dead || []).forEach(function (c) { deadMask[c] = 1; });
    var out = [], seen = {};
    Object.keys(range).forEach(function (lab) {
      var w = range[lab];
      if (!(w > 0)) return;
      var list = lab.length === 4 ? [[card(lab.substr(0, 2)), card(lab.substr(2, 2))]] : classCombos(lab);
      list.forEach(function (cb) {
        if (deadMask[cb[0]] || deadMask[cb[1]]) return;
        var k = Math.min(cb[0], cb[1]) * 52 + Math.max(cb[0], cb[1]);
        if (seen[k]) return; seen[k] = 1;
        out.push({ c1: cb[0], c2: cb[1], w: w });
      });
    });
    return out;
  }
  function rangePercent(range) {
    var n = 0;
    Object.keys(range).forEach(function (l) { n += (l.length === 4 ? 1 : classSize(l)) * Math.min(1, range[l]); });
    return n / 1326 * 100;
  }
  function rangeToString(range) {
    var keys = CLASS_LABELS.concat(Object.keys(range).filter(function (k) { return k.length === 4; }));
    return keys.filter(function (l) { return range[l] > 0; })
      .map(function (l) { return range[l] < 1 ? l + ':' + range[l] : l; }).join(',');
  }

  // ---------- RNG ----------
  var _s = (Date.now() ^ 0x9e3779b9) >>> 0;
  function rnd() { // xorshift32
    _s ^= _s << 13; _s >>>= 0; _s ^= _s >>> 17; _s ^= _s << 5; _s >>>= 0;
    return _s / 4294967296;
  }
  function seed(x) { _s = (x >>> 0) || 1; }

  // ---------- equity ----------
  // players: array of combo lists [{c1,c2,w}] (a single known hand = list of one combo).
  // Returns {equity:[...], win:[...], tie:[...], samples, exact}
  function equity(players, board, dead, opts) {
    opts = opts || {};
    board = board || []; dead = dead || [];
    var np = players.length;
    var used = new Uint8Array(52);
    board.forEach(function (c) { used[c] = 1; });
    dead.forEach(function (c) { used[c] = 1; });
    var lists = players.map(function (l) { return l.filter(function (x) { return !used[x.c1] && !used[x.c2]; }); });
    for (var p = 0; p < np; p++) if (!lists[p].length) throw new Error('プレイヤー' + (p + 1) + 'の手札候補がありません');
    var toCome = 5 - board.length;
    var eq = new Float64Array(np), win = new Float64Array(np), tie = new Float64Array(np);
    var total = 0;
    var cards = new Int32Array(7);
    var scores = new Int32Array(np);
    var hands = new Int32Array(np * 2);
    var allSingle = lists.every(function (l) { return l.length === 1; });

    function showdown(bd, weight) {
      var best = -1, nb = 0, p, k;
      for (p = 0; p < np; p++) {
        cards[0] = hands[2 * p]; cards[1] = hands[2 * p + 1];
        for (k = 0; k < 5; k++) cards[2 + k] = bd[k];
        var s = evaluate(cards, 7);
        scores[p] = s;
        if (s > best) { best = s; nb = 1; } else if (s === best) nb++;
      }
      for (p = 0; p < np; p++) if (scores[p] === best) {
        eq[p] += weight / nb;
        if (nb === 1) win[p] += weight; else tie[p] += weight;
      }
      total += weight;
    }

    var bd = new Int32Array(5);
    for (var b = 0; b < board.length; b++) bd[b] = board[b];

    if (allSingle && toCome <= 3 && !opts.forceMC) {
      // exact enumeration
      for (p = 0; p < np; p++) {
        hands[2 * p] = lists[p][0].c1; hands[2 * p + 1] = lists[p][0].c2;
        if (used[hands[2 * p]] || used[hands[2 * p + 1]]) throw new Error('カードが重複しています');
        used[hands[2 * p]] = 1; used[hands[2 * p + 1]] = 1;
      }
      var rest = [];
      for (var c = 0; c < 52; c++) if (!used[c]) rest.push(c);
      var L = rest.length, b0 = board.length;
      if (toCome === 0) showdown(bd, 1);
      else if (toCome === 1) for (var i = 0; i < L; i++) { bd[b0] = rest[i]; showdown(bd, 1); }
      else if (toCome === 2) for (i = 0; i < L; i++) for (var j = i + 1; j < L; j++) { bd[b0] = rest[i]; bd[b0 + 1] = rest[j]; showdown(bd, 1); }
      else for (i = 0; i < L; i++) for (j = i + 1; j < L; j++) for (var k = j + 1; k < L; k++) { bd[b0] = rest[i]; bd[b0 + 1] = rest[j]; bd[b0 + 2] = rest[k]; showdown(bd, 1); }
      return pack(true);
    }

    // Monte Carlo
    var iters = opts.iterations || 60000;
    var cum = lists.map(function (l) {
      var a = new Float64Array(l.length), s = 0;
      for (var i = 0; i < l.length; i++) { s += l[i].w; a[i] = s; }
      return a;
    });
    var taken = new Uint8Array(52);
    var deck = new Int32Array(52);
    var done = 0, tries = 0;
    while (done < iters && tries < iters * 50) {
      tries++;
      taken.set(used);
      var ok = true;
      for (p = 0; p < np && ok; p++) {
        var l = lists[p], cu = cum[p];
        var x = rnd() * cu[cu.length - 1];
        var lo = 0, hi = cu.length - 1;
        while (lo < hi) { var mid = (lo + hi) >> 1; if (cu[mid] > x) hi = mid; else lo = mid + 1; }
        var h = l[lo];
        if (taken[h.c1] || taken[h.c2]) { ok = false; break; }
        taken[h.c1] = 1; taken[h.c2] = 1;
        hands[2 * p] = h.c1; hands[2 * p + 1] = h.c2;
      }
      if (!ok) continue;
      var nd = 0;
      for (c = 0; c < 52; c++) if (!taken[c]) deck[nd++] = c;
      for (var t = 0; t < toCome; t++) {
        var pick = t + Math.floor(rnd() * (nd - t));
        var tmp = deck[t]; deck[t] = deck[pick]; deck[pick] = tmp;
        bd[board.length + t] = deck[t];
      }
      showdown(bd, 1);
      done++;
    }
    if (!done) throw new Error('有効な組み合わせが見つかりません(カードの重複)');
    return pack(false);

    function pack(exact) {
      var r = { equity: [], win: [], tie: [], samples: total, exact: exact };
      for (var p = 0; p < np; p++) { r.equity.push(eq[p] / total); r.win.push(win[p] / total); r.tie.push(tie[p] / total); }
      return r;
    }
  }

  // ---------- outs ----------
  // Cards on the next street that put hero strictly ahead of villain (known hands).
  function outs(hero, villain, board) {
    var used = new Uint8Array(52);
    hero.concat(villain, board).forEach(function (c) { used[c] = 1; });
    var res = [];
    var hv = new Int32Array(7), vv = new Int32Array(7);
    for (var c = 0; c < 52; c++) {
      if (used[c]) continue;
      var bd = board.concat([c]);
      var n = 2 + bd.length;
      hv[0] = hero[0]; hv[1] = hero[1]; vv[0] = villain[0]; vv[1] = villain[1];
      for (var i = 0; i < bd.length; i++) { hv[2 + i] = bd[i]; vv[2 + i] = bd[i]; }
      if (evaluate(hv, n) > evaluate(vv, n)) res.push(c);
    }
    return res;
  }

  // ---------- push / fold (heads-up, SB shoves or folds, BB calls or folds) ----------
  // eqTable: Float32Array(169*169) equity of class i vs class j; computed offline.
  function comboPairs(i, j) { // number of non-conflicting combo pairs between classes i and j
    var a = classCombos(CLASS_LABELS[i]), b = classCombos(CLASS_LABELS[j]), n = 0;
    for (var x = 0; x < a.length; x++) for (var y = 0; y < b.length; y++) {
      var p = a[x], q = b[y];
      if (p[0] !== q[0] && p[0] !== q[1] && p[1] !== q[0] && p[1] !== q[1]) n++;
    }
    return n;
  }
  var _pairs = null;
  function pairTable() {
    if (_pairs) return _pairs;
    _pairs = new Float32Array(169 * 169);
    // depends only on rank/suit structure; cheap enough to compute directly
    for (var i = 0; i < 169; i++) for (var j = i; j < 169; j++) {
      var n = comboPairs(i, j); _pairs[i * 169 + j] = n; _pairs[j * 169 + i] = n;
    }
    return _pairs;
  }
  // Fictitious play. stack = effective stack in BB (incl. posted blinds). Returns push[169], call[169] (0..1).
  function solvePushFold(eqTable, stack, iterations) {
    iterations = iterations || 3000;
    var W = pairTable(), S = stack;
    var push = new Float64Array(169).fill(0.5), call = new Float64Array(169).fill(0.5);
    var i, j, t;
    var evPush = new Float64Array(169), evCall = new Float64Array(169);
    for (t = 1; t <= iterations; t++) {
      // SB best response to BB's average calling strategy
      for (i = 0; i < 169; i++) {
        var num = 0, den = 0;
        for (j = 0; j < 169; j++) {
          var w = W[i * 169 + j]; if (!w) continue;
          var q = call[j];
          num += w * ((1 - q) * 1 + q * (2 * S * eqTable[i * 169 + j] - S));
          den += w;
        }
        evPush[i] = num / den;
      }
      // BB best response to SB's average push strategy
      for (j = 0; j < 169; j++) {
        var num2 = 0, den2 = 0;
        for (i = 0; i < 169; i++) {
          var w2 = W[i * 169 + j] * push[i]; if (!w2) continue;
          num2 += w2 * (2 * S * eqTable[j * 169 + i] - S);
          den2 += w2;
        }
        evCall[j] = den2 > 0 ? num2 / den2 : -1;
      }
      var a = 1 / (t + 1);
      for (i = 0; i < 169; i++) {
        push[i] += a * ((evPush[i] > -0.5 ? 1 : 0) - push[i]);
        call[i] += a * ((evCall[i] > -1 ? 1 : 0) - call[i]);
      }
    }
    return { push: Array.from(push), call: Array.from(call), evPush: Array.from(evPush), evCall: Array.from(evCall) };
  }

  var API = {
    RANKS: RANKS, SUITS: SUITS, CAT_NAMES: CAT_NAMES,
    card: card, cardStr: cardStr, parseCards: parseCards,
    evaluate: evaluate, category: category,
    CLASS_LABELS: CLASS_LABELS, CLASS_INDEX: CLASS_INDEX, gridLabel: gridLabel,
    classCombos: classCombos, comboClass: comboClass, classSize: classSize,
    parseRange: parseRange, rangeCombos: rangeCombos, rangePercent: rangePercent, rangeToString: rangeToString,
    rnd: rnd, seed: seed, equity: equity, outs: outs,
    comboPairs: comboPairs, pairTable: pairTable, solvePushFold: solvePushFold
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.PokerEngine = API;
})(typeof self !== 'undefined' ? self : this);
