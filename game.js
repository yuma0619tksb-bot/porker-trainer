/* 6-max No-Limit Hold'em table: engine, range model, bots (3 levels), and grading of the hero's decisions.
 * No DOM. Works in the browser (global PokerGame) and in Node.
 * Chips: 1BB = 10 chips. SB 5, BB 10, everyone starts each hand with 100BB (auto top-up).
 */
(function (root) {
  'use strict';
  var E = root.PokerEngine || (typeof require !== 'undefined' ? require('./engine.js') : null);
  var BB = 10, SB = 5, START = 1000;
  var POS6 = ['BTN', 'SB', 'BB', 'UTG', 'HJ', 'CO']; // offset from button
  var RFI = null, FACING = null; // filled by init from PT_DATA

  // ---------- preflop ranking (percentile of each class, 0 = best) ----------
  var PCT = null, ORDER = null;
  function init(eqTable, data) {
    var W = E.pairTable(), avg = new Float64Array(169);
    for (var i = 0; i < 169; i++) {
      var s = 0, w = 0;
      for (var j = 0; j < 169; j++) { s += W[i * 169 + j] * eqTable[i * 169 + j]; w += W[i * 169 + j]; }
      avg[i] = s / w;
    }
    // blend raw all-in equity with playability (suited/connected bonus) so suited connectors rank sensibly
    var score = E.CLASS_LABELS.map(function (l, i) {
      var hi = E.RANKS.indexOf(l[0]), lo = E.RANKS.indexOf(l[1]);
      var bonus = 0;
      if (l[2] === 's') bonus += 0.025;
      if (l.length === 3) { var gap = hi - lo; bonus += gap === 1 ? 0.02 : gap === 2 ? 0.01 : 0; }
      return { l: l, i: i, s: avg[i] + bonus };
    });
    score.sort(function (a, b) { return b.s - a.s; });
    PCT = {}; ORDER = [];
    var cum = 0;
    score.forEach(function (x) { var n = E.classSize(x.l); PCT[x.l] = (cum + n / 2) / 1326 * 100; cum += n; ORDER.push(x.l); });
    if (data) {
      RFI = {}; Object.keys(data.rfi).forEach(function (p) { RFI[p] = E.parseRange(data.rfi[p]); });
      FACING = data.facing.map(function (f) { return { f: f, t: E.parseRange(f.threeBet), c: E.parseRange(f.call) }; });
    }
  }
  function pctOf(label) { return PCT[label]; }
  function rfiPct(pos) { return RFI && RFI[pos] ? E.rangePercent(RFI[pos]) : 20; }

  // ---------- range model ----------
  // A player's range = weighted combos. Starts from a percentile band, narrowed by postflop actions.
  function bandRange(lo, hi) {
    var out = [];
    E.CLASS_LABELS.forEach(function (l) {
      var p = PCT[l];
      if (p < lo || p > hi) return;
      E.classCombos(l).forEach(function (cb) { out.push({ c1: cb[0], c2: cb[1], w: 1 }); });
    });
    return out;
  }
  function chartRange(rangeObj) {
    var out = [];
    Object.keys(rangeObj).forEach(function (l) { E.classCombos(l).forEach(function (cb) { out.push({ c1: cb[0], c2: cb[1], w: 1 }); }); });
    return out;
  }
  function hasDraw(c1, c2, board) {
    if (board.length >= 5) return 0;
    var cards = [c1, c2].concat(board), suit = [0, 0, 0, 0], holeSuit = [0, 0, 0, 0], mask = 0, i;
    for (i = 0; i < cards.length; i++) { suit[cards[i] & 3]++; mask |= 1 << (cards[i] >> 2); }
    holeSuit[c1 & 3] = 1; holeSuit[c2 & 3] = 1;
    for (i = 0; i < 4; i++) if (suit[i] === 4 && holeSuit[i]) return 2; // flush draw
    var m = ((mask & 0x1fff) << 1) | ((mask >> 12) & 1); // bit0 = ace-low
    var hm = (1 << ((c1 >> 2) + 1)) | (1 << ((c2 >> 2) + 1));
    for (var lo = 0; lo <= 9; lo++) {
      var win = 0x1f << lo, cnt = 0, x = m & win;
      while (x) { cnt += x & 1; x >>= 1; }
      if (cnt >= 4 && (hm & win)) return 1; // straight draw (gutshot or open-ended)
    }
    return 0;
  }
  var _buf = new Int32Array(7);
  function madeCat(c1, c2, board) {
    _buf[0] = c1; _buf[1] = c2;
    for (var i = 0; i < board.length; i++) _buf[2 + i] = board[i];
    var s = E.evaluate(_buf, 2 + board.length);
    // a hand that only plays the board does not count
    var cat = s >> 20;
    var boardScore = 0;
    if (board.length >= 5) { boardScore = E.evaluate(board, 5) >> 20; }
    else { var bc = boardCategory(board); boardScore = bc; }
    return cat > boardScore ? cat : 0;
  }
  function boardCategory(board) { // made category of the board alone (pairs/trips) for 3-4 cards
    var cnt = {}, mx = 1, pairs = 0;
    board.forEach(function (c) { var r = c >> 2; cnt[r] = (cnt[r] || 0) + 1; });
    Object.keys(cnt).forEach(function (r) { if (cnt[r] > mx) mx = cnt[r]; if (cnt[r] === 2) pairs++; });
    return mx >= 3 ? 3 : pairs >= 2 ? 2 : pairs === 1 ? 1 : 0;
  }
  // Narrow a range after a postflop action. kind: 'bet' (bet/raise) or 'call'.
  function narrow(range, board, kind) {
    range.forEach(function (h) {
      if (h.w <= 0) return;
      var cat = madeCat(h.c1, h.c2, board), dr = hasDraw(h.c1, h.c2, board);
      var m;
      if (kind === 'bet') m = cat >= 2 ? 1 : cat === 1 ? 0.7 : dr ? 0.6 : 0.25;
      else m = cat >= 1 ? 1 : dr ? 0.9 : 0.12;
      h.w *= m;
    });
  }
  function liveRange(range, dead) {
    var d = {}; dead.forEach(function (c) { d[c] = 1; });
    return range.filter(function (h) { return h.w > 0.001 && !d[h.c1] && !d[h.c2]; });
  }

  // ---------- table ----------
  var BOT_POOL = {
    fish: ['カモメ', 'ポテト', 'ラッキー', 'マンボウ'],
    reg: ['ミナト', 'アオイ', 'ケンジ', 'ソラ'],
    pro: ['シン', 'レイ', 'クロウ']
  };
  var LEVEL_LABEL = { fish: '格下', reg: '同等', pro: '格上' };
  function Table(opts) {
    opts = opts || {};
    var lineup = opts.lineup || shuffle(['fish', 'fish', 'reg', 'reg', 'pro']);
    var used = {};
    this.players = [{ name: 'あなた', kind: 'hero', stack: START }].concat(lineup.map(function (k) {
      var names = BOT_POOL[k].filter(function (n) { return !used[n]; }); var n = names[Math.floor(Math.random() * names.length)]; used[n] = 1;
      return { name: n, kind: k, stack: START };
    }));
    this.button = Math.floor(Math.random() * 6);
    this.handNo = 0;
  }
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  Table.prototype.posOf = function (i) { return POS6[(i - this.button + 6) % 6]; };
  Table.prototype.seatAt = function (pos) { return (this.button + POS6.indexOf(pos)) % 6; };

  Table.prototype.newHand = function () {
    this.handNo++;
    this.button = (this.button + 1) % 6;
    var deck = shuffle(Array.from({ length: 52 }, function (_, i) { return i; }));
    var self = this;
    this.deck = deck; this.board = []; this.street = 0; this.log = []; this.done = false; this.result = null;
    this.players.forEach(function (p, i) {
      p.stack = START; p.hole = [deck.pop(), deck.pop()]; p.bet = 0; p.total = 0; p.folded = false; p.allin = false; p.acted = false;
      p.pos = self.posOf(i); p.line = null; p.range = null; p.pfAggr = false;
    });
    this.raises = 0; this.limpers = 0; this.callers = 0; this.opener = -1; this.pfAggressor = -1; this.lastAggressor = -1;
    this.streetBets = 0; this.firstBettor = -1;
    this.post(this.seatAt('SB'), SB); this.post(this.seatAt('BB'), BB);
    this.currentBet = BB; this.minRaise = BB;
    this.toAct = this.seatAt('UTG');
    this.hero = { decisions: [], first: null };
  };
  Table.prototype.post = function (i, amt) {
    var p = this.players[i]; var a = Math.min(amt, p.stack);
    p.stack -= a; p.bet += a; p.total += a; if (!p.stack) p.allin = true;
  };
  Table.prototype.pot = function () { return this.players.reduce(function (s, p) { return s + p.total; }, 0); };
  Table.prototype.active = function () { return this.players.filter(function (p) { return !p.folded; }); };
  Table.prototype.canAct = function (i) { var p = this.players[i]; return !p.folded && !p.allin; };
  Table.prototype.needsAction = function (i) {
    var p = this.players[i];
    return !p.folded && !p.allin && (!p.acted || p.bet < this.currentBet);
  };
  Table.prototype.legal = function (i) {
    var p = this.players[i], toCall = Math.min(this.currentBet - p.bet, p.stack);
    var maxTo = p.bet + p.stack;
    var minTo = Math.min(maxTo, this.currentBet + this.minRaise);
    var othersCanAct = this.players.some(function (q, k) { return k !== i && !q.folded && !q.allin; });
    return { toCall: toCall, canCheck: toCall === 0, minTo: minTo, maxTo: maxTo, canRaise: maxTo > this.currentBet && othersCanAct };
  };

  // action: {type:'fold'|'check'|'call'|'raise', to}
  Table.prototype.apply = function (i, act) {
    var p = this.players[i], L = this.legal(i);
    var potBefore = this.pot(), facing = L.toCall;
    var rec = { st: this.street, p: i, a: act.type, facing: facing, pot: potBefore };
    if (act.type === 'fold') { if (facing === 0) { act = { type: 'check' }; rec.a = 'check'; } else p.folded = true; }
    if (act.type === 'check') { if (facing > 0) { act = { type: 'call' }; rec.a = 'call'; } }
    if (act.type === 'call') { this.post(i, facing); rec.amt = facing; }
    if (act.type === 'raise') {
      var to = Math.max(L.minTo, Math.min(L.maxTo, Math.round(act.to)));
      if (to <= this.currentBet) { this.post(i, facing); rec.a = 'call'; rec.amt = facing; }
      else {
        var inc = to - this.currentBet;
        this.post(i, to - p.bet);
        if (inc >= this.minRaise) this.minRaise = inc;
        rec.a = this.currentBet === 0 ? 'bet' : 'raise'; rec.to = to;
        this.currentBet = to;
        var self = this;
        this.players.forEach(function (q, k) { if (k !== i) q.acted = false; });
        this.lastAggressor = i;
        if (this.street === 0) { this.raises++; this.pfAggressor = i; if (this.raises === 1) this.opener = i; }
        else { this.streetBets++; if (this.firstBettor < 0) this.firstBettor = i; }
      }
    }
    if (rec.a === 'call' && this.street === 0) { if (this.raises === 0) this.limpers++; else this.callers++; }
    p.acted = true;
    rec.allin = p.allin;
    this.log.push(rec);
    this.updateLine(i, rec);
    return rec;
  };
  // track each player's preflop line and narrow ranges postflop
  Table.prototype.updateLine = function (i, rec) {
    var p = this.players[i];
    if (this.street === 0) {
      if (rec.a === 'raise' || rec.a === 'bet') p.line = this.raises === 1 ? 'open' : this.raises === 2 ? '3bet' : '4bet';
      else if (rec.a === 'call') p.line = this.raises === 0 ? 'limp' : this.raises === 1 ? (p.pos === 'BB' ? 'bbcall' : 'call') : 'call3';
      else if (rec.a === 'check') p.line = 'bbcheck';
    } else if (p.range && (rec.a === 'bet' || rec.a === 'raise' || rec.a === 'call')) {
      narrow(p.range, this.board, rec.a === 'call' ? 'call' : 'bet');
    }
  };
  Table.prototype.initRanges = function () { // called when the flop is dealt
    var self = this;
    this.players.forEach(function (p) {
      if (p.folded) return;
      var r;
      var loose = p.kind === 'fish';
      switch (p.line) {
        case 'open': r = RFI && RFI[p.pos] && !loose ? chartRange(RFI[p.pos]) : bandRange(0, loose ? 25 : rfiPct(p.pos)); break;
        case '3bet': r = bandRange(0, loose ? 12 : 8); break;
        case '4bet': r = bandRange(0, 4); break;
        case 'call3': r = bandRange(2, loose ? 30 : 14); break;
        case 'call': r = bandRange(loose ? 0 : 4, loose ? 50 : 28); break;
        case 'bbcall': r = bandRange(5, loose ? 70 : 55); break;
        case 'limp': r = bandRange(loose ? 3 : 8, loose ? 60 : 45); break;
        default: r = bandRange(8, 100);
      }
      p.range = r;
    });
  };
  Table.prototype.nextToAct = function () {
    for (var k = 0; k < 6; k++) {
      var i = (this.toAct + k) % 6;
      if (this.needsAction(i)) return i;
    }
    return -1;
  };
  // Advance after an action. Returns 'act' (someone must act), 'street', or 'end'.
  Table.prototype.advance = function () {
    if (this.active().length === 1) { this.finish(); return 'end'; }
    var nxt = this.nextToAct();
    if (nxt >= 0) { this.toAct = nxt; return 'act'; }
    // round over
    this.players.forEach(function (p) { p.bet = 0; p.acted = false; });
    var canBet = this.players.filter(function (p) { return !p.folded && !p.allin; }).length;
    if (this.street === 3) { this.finish(); return 'end'; }
    this.street++;
    if (this.street === 1) { this.board.push(this.deck.pop(), this.deck.pop(), this.deck.pop()); this.initRanges(); }
    else this.board.push(this.deck.pop());
    this.currentBet = 0; this.minRaise = BB; this.streetBets = 0; this.firstBettor = -1;
    this.toAct = (this.button + 1) % 6;
    if (canBet <= 1) return this.advance(); // run it out
    var n = this.nextToAct();
    if (n < 0) return this.advance();
    this.toAct = n;
    return 'street';
  };
  Table.prototype.finish = function () {
    var ps = this.players, self = this;
    var alive = ps.filter(function (p) { return !p.folded; });
    var showdown = alive.length > 1;
    if (showdown) while (this.board.length < 5) this.board.push(this.deck.pop());
    var scores = ps.map(function (p) { return p.folded ? -1 : E.evaluate(p.hole.concat(self.board)); });
    var levels = Array.from(new Set(ps.map(function (p) { return p.total; }))).filter(function (x) { return x > 0; }).sort(function (a, b) { return a - b; });
    var won = ps.map(function () { return 0; }), prev = 0;
    levels.forEach(function (lv) {
      var amt = 0;
      ps.forEach(function (p) { amt += Math.max(0, Math.min(p.total, lv) - prev); });
      var elig = ps.map(function (p, i) { return i; }).filter(function (i) { return !ps[i].folded && ps[i].total >= lv; });
      if (!elig.length) elig = ps.map(function (p, i) { return i; }).filter(function (i) { return !ps[i].folded; });
      var best = Math.max.apply(null, elig.map(function (i) { return scores[i]; }));
      var winners = elig.filter(function (i) { return scores[i] === best; });
      var share = Math.floor(amt / winners.length), rem = amt - share * winners.length;
      winners.forEach(function (i, k) { won[i] += share + (k < rem ? 1 : 0); });
      prev = lv;
    });
    ps.forEach(function (p, i) { p.stack += won[i]; p.won = won[i]; p.net = p.stack - START; });
    this.done = true;
    this.result = { showdown: showdown, won: won, scores: scores, pot: levels.length ? this.pot() : 0 };
  };

  // ---------- bots ----------
  function botAct(t, i) {
    var p = t.players[i], L = t.legal(i);
    if (t.street === 0) return botPreflop(t, i, p, L);
    return botPostflop(t, i, p, L);
  }
  function rnd() { return Math.random(); }
  function botPreflop(t, i, p, L) {
    var lab = E.comboClass(p.hole[0], p.hole[1]), pc = PCT[lab], k = p.kind;
    var noise = k === 'reg' ? (rnd() - 0.5) * 6 : k === 'pro' ? (rnd() - 0.5) * 2 : 0;
    var openerPos = t.opener >= 0 ? t.players[t.opener].pos : null;
    var lateOpen = openerPos === 'BTN' || openerPos === 'CO' || openerPos === 'SB';
    var ip = p.pos === 'BTN' || (p.pos === 'CO' && openerPos !== 'BTN');
    if (t.raises === 0) {
      if (k === 'fish') {
        if (pc < 7) return raiseTo(t, L, BB * (2.5 + t.limpers) + (rnd() < 0.5 ? 10 : 0));
        if (L.canCheck) return { type: 'check' };
        if (pc < 48) return { type: 'call' };
        return { type: 'fold' };
      }
      if (L.canCheck) { // BB with limpers
        if (pc < (k === 'pro' ? 14 : 10)) return raiseTo(t, L, BB * (3.5 + t.limpers));
        return { type: 'check' };
      }
      var inChart = RFI[p.pos] && RFI[p.pos][lab];
      var open = inChart ? true : false;
      if (k === 'reg' && !open && pc < rfiPct(p.pos) + noise) open = rnd() < 0.5;
      if (k === 'reg' && open && pc > rfiPct(p.pos) - 3 + noise) open = rnd() < 0.6;
      if (t.limpers > 0) open = pc < rfiPct(p.pos) * 0.7;
      return open ? raiseTo(t, L, BB * (2.5 + t.limpers)) : { type: 'fold' };
    }
    if (t.raises === 1) {
      var spot = FACING && FACING.filter(function (x) { return x.f.hero === p.pos && x.f.villain === openerPos; })[0];
      if (k !== 'fish' && spot && t.callers === 0) {
        if (spot.t[lab]) return raiseTo(t, L, t.currentBet * (ip ? 3 : 3.6));
        if (spot.c[lab]) return { type: 'call' };
        if (k === 'reg' && pc < 22 && rnd() < 0.25) return { type: 'call' };
        return { type: 'fold' };
      }
      var t3, tc;
      if (k === 'fish') { t3 = 3; tc = 45; }
      else {
        var base = rfiPct(openerPos || 'CO');
        t3 = (k === 'pro' ? 0.35 : 0.3) * base;
        tc = p.pos === 'BB' ? Math.min(60, base * 1.6) : (ip ? 0.75 : 0.45) * base;
        if (p.pos === 'SB') tc = t3;
        tc = Math.max(t3, tc) + noise;
        if (t.callers > 0) { t3 *= 0.7; tc *= 0.8; }
      }
      if (pc < t3) return raiseTo(t, L, t.currentBet * (ip ? 3 : 3.6) + t.callers * t.currentBet);
      if (k === 'pro' && /^A[2-5]s$/.test(lab) && rnd() < 0.5) return raiseTo(t, L, t.currentBet * (ip ? 3 : 3.6));
      if (pc < tc) return { type: 'call' };
      return { type: 'fold' };
    }
    if (t.raises === 2) {
      var v4 = k === 'fish' ? 1.5 : 2.6, c4 = k === 'fish' ? 18 : k === 'pro' ? 8 : 6;
      if (pc < v4) return raiseTo(t, L, t.currentBet * 2.3);
      if (pc < c4) return { type: 'call' };
      return { type: 'fold' };
    }
    // 4bet+
    if (pc < (k === 'fish' ? 3 : 1.6)) return raiseTo(t, L, L.maxTo);
    if (pc < (k === 'fish' ? 5 : 2.8)) return { type: 'call' };
    return { type: 'fold' };
  }
  function raiseTo(t, L, to) {
    if (!L.canRaise) return { type: L.canCheck ? 'check' : 'call' };
    to = Math.round(to);
    if (to >= L.maxTo * 0.6) to = L.maxTo; // commit
    return { type: 'raise', to: to };
  }
  // equity of player i vs the ranges of the other live players
  function equityVsRanges(t, i, iters) {
    var p = t.players[i], dead = p.hole.concat(t.board);
    var lists = [[{ c1: p.hole[0], c2: p.hole[1], w: 1 }]];
    t.players.forEach(function (q, k) {
      if (k === i || q.folded) return;
      var r = liveRange(q.range || bandRange(0, 100), dead);
      if (!r.length) r = liveRange(bandRange(0, 100), dead);
      lists.push(r);
    });
    try { return E.equity(lists, t.board, [], { iterations: iters || 400, forceMC: true }).equity[0]; }
    catch (e) { return 0.5; }
  }
  function sizeBet(t, L, frac) {
    var pot = t.pot();
    var to = t.currentBet + Math.max(BB, Math.round(pot * frac + (t.currentBet ? t.currentBet : 0)));
    if (t.currentBet === 0) to = Math.max(BB, Math.round(pot * frac));
    return raiseTo(t, L, Math.max(L.minTo, to));
  }
  function dryBoard(board) {
    var suits = [0, 0, 0, 0]; board.forEach(function (c) { suits[c & 3]++; });
    var rs = board.map(function (c) { return c >> 2; }).sort(function (a, b) { return a - b; });
    var conn = 0; for (var k = 1; k < rs.length; k++) if (rs[k] - rs[k - 1] <= 2 && rs[k] !== rs[k - 1]) conn++;
    return Math.max.apply(null, suits) < 3 && conn <= 1;
  }
  function botPostflop(t, i, p, L) {
    var k = p.kind, eq = equityVsRanges(t, i, 350), nOpp = t.active().length - 1;
    var pot = t.pot(), toCall = L.toCall, need = toCall / (pot + toCall);
    var dr = hasDraw(p.hole[0], p.hole[1], t.board);
    var river = t.street === 3;
    var multi = nOpp > 1;
    if (toCall > 0) {
      var bigEq = k === 'fish' ? 0.82 : k === 'pro' ? 0.7 : 0.75;
      if (eq > bigEq && L.canRaise && rnd() < (k === 'fish' ? 0.25 : k === 'pro' ? 0.6 : 0.45)) return sizeBet(t, L, k === 'pro' ? 0.9 : 1);
      if (k === 'pro' && !river && dr && L.canRaise && t.streetBets === 1 && rnd() < 0.2) return sizeBet(t, L, 0.9);
      if (k === 'fish') return (eq > need * 0.65 || eq > 0.3 || dr) ? { type: 'call' } : { type: 'fold' };
      var margin = k === 'pro' ? -0.02 : 0.03;
      if (eq > need + margin) return { type: 'call' };
      if (!river && dr && eq > need * 0.75) return { type: 'call' }; // implied odds
      return { type: 'fold' };
    }
    // no bet facing
    var aggr = t.lastAggressorPrev === i || t.pfAggressor === i;
    if (k === 'fish') {
      if (eq > 0.72 && rnd() < 0.7) return sizeBet(t, L, 0.5);
      if (rnd() < 0.06) return sizeBet(t, L, 0.4);
      return { type: 'check' };
    }
    var valueTh = multi ? 0.62 : (k === 'pro' ? 0.58 : 0.62);
    if (eq > valueTh) return sizeBet(t, L, dryBoard(t.board) ? 0.4 : 0.7);
    if (t.street === 1 && aggr && !multi) {
      var cb = k === 'pro' ? (dryBoard(t.board) ? 0.7 : 0.4) : 0.65;
      if (rnd() < cb) return sizeBet(t, L, dryBoard(t.board) ? 0.33 : 0.6);
    }
    if (!river && dr && rnd() < (k === 'pro' ? 0.45 : 0.3)) return sizeBet(t, L, 0.6);
    if (river && k === 'pro' && eq < 0.25 && !multi && rnd() < 0.3) return sizeBet(t, L, 0.75);
    return { type: 'check' };
  }

  // ---------- grading the hero ----------
  // Snapshot before the hero acts; then grade(snapshot, action) after.
  function preflopSituation(t, i) {
    var p = t.players[i];
    return { pos: p.pos, raises: t.raises, limpers: t.limpers, callers: t.callers, openerPos: t.opener >= 0 ? t.players[t.opener].pos : null,
      label: E.comboClass(p.hole[0], p.hole[1]) };
  }
  var ACT_JA = { raise: 'レイズ', '3bet': '3ベット', call: 'コール', fold: 'フォールド', limp: 'リンプ(コールで参加)', check: 'チェック' };
  function gradePreflop(sit, act) {
    var lab = sit.label, a = act.type;
    if (sit.raises === 0 && sit.pos !== 'BB' && RFI[sit.pos]) {
      var exp = RFI[sit.pos][lab] ? 'raise' : 'fold';
      var mine = a === 'raise' ? 'raise' : a === 'fold' ? 'fold' : 'limp';
      var ok = mine === exp;
      var msg;
      if (ok) msg = sit.pos + 'から ' + lab + ' は' + (exp === 'raise' ? 'オープン' : 'フォールド') + 'で正解。';
      else if (mine === 'limp') msg = 'リンプ(コールだけで参加)は不利になりやすい。' + lab + ' は' + (exp === 'raise' ? 'レイズで参加' : 'フォールド') + 'が基本。';
      else if (exp === 'raise') msg = sit.pos + 'では ' + lab + ' はオープンできる手。降りすぎ。';
      else msg = sit.pos + 'では ' + lab + ' は弱すぎる。参加しすぎ。';
      return { type: 'pf-open', pos: sit.pos, label: lab, ok: ok, exp: exp, mine: mine, leak: ok ? null : (mine === 'fold' ? 'pf-tight' : mine === 'limp' ? 'pf-limp' : 'pf-loose'), msg: msg + (sit.limpers ? '(リンパーがいる時は少し絞って大きめにレイズ)' : '') };
    }
    if (sit.raises === 1 && sit.callers === 0 && FACING) {
      var spot = FACING.filter(function (x) { return x.f.hero === sit.pos && x.f.villain === sit.openerPos; })[0];
      if (!spot) return null;
      var exp2 = spot.t[lab] ? '3bet' : spot.c[lab] ? 'call' : 'fold';
      var mine2 = a === 'raise' ? '3bet' : a === 'call' ? 'call' : 'fold';
      var ok2 = exp2 === mine2;
      var order = { fold: 0, call: 1, '3bet': 2 };
      return { type: 'pf-facing', spot: spot.f.id, pos: sit.pos, label: lab, ok: ok2, exp: exp2, mine: mine2,
        leak: ok2 ? null : (order[mine2] < order[exp2] ? 'pf-tight' : 'pf-loose'),
        msg: spot.f.title + ': ' + lab + ' は ' + ACT_JA[exp2] + ' が基本' + (ok2 ? '。正解。' : '(あなたは' + ACT_JA[mine2] + ')。') };
    }
    return null;
  }
  // Postflop: facing a bet (call/fold/raise) or checking back on the river.
  function postflopSnapshot(t, i) {
    var L = t.legal(i), pot = t.pot();
    return { st: t.street, toCall: L.toCall, pot: pot, eq: equityVsRanges(t, i, 1500), nOpp: t.active().length - 1,
      lastToAct: isLastToAct(t, i), board: t.board.slice(), hole: t.players[i].hole.slice() };
  }
  function isLastToAct(t, i) {
    // last to act postflop = closest live player to the button going backwards
    for (var d = 0; d < 6; d++) { var s = (t.button - d + 6) % 6; if (!t.players[s].folded && !t.players[s].allin) return s === i; }
    return false;
  }
  function gradePostflop(snap, act) {
    var st = ['', 'フロップ', 'ターン', 'リバー'][snap.st];
    var bb = function (x) { return (x / BB).toFixed(1); };
    if (snap.toCall > 0) {
      var need = snap.toCall / (snap.pot + snap.toCall), eq = snap.eq;
      var tol = snap.st === 3 ? 0.06 : 0.1;
      var evCall = eq * (snap.pot + snap.toCall) - snap.toCall;
      var base = { type: 'facing', st: snap.st, eq: eq, need: need, toCall: snap.toCall, pot: snap.pot };
      if (act.type === 'fold' && eq > need + tol) return Object.assign(base, { ok: false, leak: 'overfold', ev: evCall,
        msg: st + 'で降りすぎ。相手のレンジに対する勝率 ' + Math.round(eq * 100) + '% > 必要勝率 ' + Math.round(need * 100) + '%。コールの期待値は約 +' + bb(evCall) + 'BB。' });
      if (act.type === 'call' && eq < need - tol) return Object.assign(base, { ok: false, leak: 'overcall', ev: -evCall,
        msg: st + 'でコールしすぎ。勝率 ' + Math.round(eq * 100) + '% < 必要勝率 ' + Math.round(need * 100) + '%。このコールの期待値は約 ' + bb(evCall) + 'BB。' });
      return Object.assign(base, { ok: true, msg: st + 'の判断は妥当(勝率 ' + Math.round(eq * 100) + '% / 必要勝率 ' + Math.round(need * 100) + '%)。' });
    }
    if (snap.st === 3 && snap.lastToAct && snap.nOpp === 1 && act.type === 'check' && snap.eq > 0.8)
      return { type: 'value', st: 3, eq: snap.eq, ok: false, leak: 'missed-value', ev: 0,
        msg: 'リバーでバリューの取り損ね。相手のレンジに対して勝率 ' + Math.round(snap.eq * 100) + '%あるので、ベットすれば弱い手からお金をもらえた。' };
    return null;
  }

  // ---------- per-hand record + stats flags ----------
  function heroRecord(t) {
    var h = t.players[0], self = this;
    var log = t.log;
    var pre = log.filter(function (r) { return r.st === 0; });
    var heroPre = pre.filter(function (r) { return r.p === 0; });
    var f = {};
    f.vpip = heroPre.some(function (r) { return r.a === 'call' || r.a === 'raise' || r.a === 'bet'; });
    f.pfr = heroPre.some(function (r) { return r.a === 'raise' || r.a === 'bet'; });
    // 3bet opportunity: hero's first decision faced exactly one raise
    var raisesBefore = 0, firstIdx = -1;
    for (var k = 0; k < pre.length; k++) { if (pre[k].p === 0) { firstIdx = k; break; } if (pre[k].a === 'raise' || pre[k].a === 'bet') raisesBefore++; }
    f.tbOpp = raisesBefore === 1;
    f.tb = f.tbOpp && firstIdx >= 0 && (pre[firstIdx].a === 'raise');
    var flop = log.filter(function (r) { return r.st === 1; });
    f.sawFlop = t.board.length >= 3 && !pre.some(function (r) { return r.p === 0 && r.a === 'fold'; });
    // c-bet: hero was preflop aggressor, first flop bet opportunity
    if (t.pfAggressor === 0) {
      var firstBetIdx = flop.findIndex(function (r) { return r.a === 'bet'; });
      var heroFirst = flop.findIndex(function (r) { return r.p === 0; });
      if (heroFirst >= 0 && (firstBetIdx < 0 || firstBetIdx >= heroFirst)) { f.cbOpp = true; f.cb = flop[heroFirst].a === 'bet'; }
    } else if (t.pfAggressor > 0) {
      var fb = flop.findIndex(function (r) { return r.a === 'bet'; });
      if (fb >= 0 && flop[fb].p === t.pfAggressor) {
        var resp = flop.slice(fb + 1).filter(function (r) { return r.p === 0; })[0];
        if (resp) { f.fcbOpp = true; f.fcb = resp.a === 'fold'; }
      }
    }
    var post = log.filter(function (r) { return r.st >= 1 && r.p === 0; });
    f.aggr = post.filter(function (r) { return r.a === 'bet' || r.a === 'raise'; }).length;
    f.calls = post.filter(function (r) { return r.a === 'call'; }).length;
    f.wtsd = !!(t.result.showdown && !h.folded);
    f.wsd = f.wtsd && h.won > 0;
    return {
      v: 1, t: Date.now(), pos: h.pos, hole: E.cardStr(h.hole[0]) + E.cardStr(h.hole[1]), label: E.comboClass(h.hole[0], h.hole[1]),
      board: t.board.map(E.cardStr).join(''), net: h.net / BB, f: f,
      dec: t.hero.decisions,
      opp: t.players.slice(1).map(function (p) { return { n: p.name, k: p.kind, pos: p.pos, hole: E.cardStr(p.hole[0]) + E.cardStr(p.hole[1]), net: p.net / BB, folded: p.folded }; }),
      log: log.map(function (r) { return [r.st, r.p, r.a, (r.to || r.amt || 0) / BB, r.pot / BB]; })
    };
  }

  // ---------- aggregate stats + leaks ----------
  var TARGETS = {
    vpip: { lo: 20, hi: 30, name: '参加率(VPIP)', unit: '%' },
    pfr: { lo: 16, hi: 25, name: 'レイズ参加率(PFR)', unit: '%' },
    gap: { lo: 0, hi: 7, name: '参加率とレイズ率の差', unit: 'pt' },
    tb: { lo: 6, hi: 12, name: '3ベット率', unit: '%' },
    cb: { lo: 50, hi: 75, name: 'Cベット率', unit: '%' },
    fcb: { lo: 35, hi: 55, name: 'Cベットに降りる率', unit: '%' },
    af: { lo: 1.8, hi: 4, name: 'アグレッション(ベット÷コール)', unit: '' },
    wtsd: { lo: 24, hi: 33, name: 'ショーダウン到達率', unit: '%' },
    wsd: { lo: 48, hi: 100, name: 'ショーダウン勝率', unit: '%' }
  };
  function aggregate(hands) {
    var n = hands.length, s = { n: n, net: 0, vpip: 0, pfr: 0, tbOpp: 0, tb: 0, cbOpp: 0, cb: 0, fcbOpp: 0, fcb: 0, aggr: 0, calls: 0, saw: 0, wtsd: 0, wsd: 0, byPos: {}, dec: { n: 0, ok: 0 }, leaks: {}, mistakes: [] };
    hands.forEach(function (h) {
      var f = h.f || {};
      s.net += h.net;
      if (f.vpip) s.vpip++; if (f.pfr) s.pfr++;
      if (f.tbOpp) { s.tbOpp++; if (f.tb) s.tb++; }
      if (f.cbOpp) { s.cbOpp++; if (f.cb) s.cb++; }
      if (f.fcbOpp) { s.fcbOpp++; if (f.fcb) s.fcb++; }
      s.aggr += f.aggr || 0; s.calls += f.calls || 0;
      if (f.sawFlop) s.saw++;
      if (f.wtsd) { s.wtsd++; if (f.wsd) s.wsd++; }
      var bp = s.byPos[h.pos] || (s.byPos[h.pos] = { n: 0, net: 0, vpip: 0 });
      bp.n++; bp.net += h.net; if (f.vpip) bp.vpip++;
      (h.dec || []).forEach(function (d) {
        s.dec.n++; if (d.ok) s.dec.ok++;
        if (!d.ok && d.leak) {
          var L = s.leaks[d.leak] || (s.leaks[d.leak] = { n: 0, ev: 0, items: [] });
          L.n++; L.ev += Math.abs(d.ev || 0) / BB; L.items.push({ hand: h, d: d });
          s.mistakes.push({ hand: h, d: d });
        }
      });
    });
    var pc = function (a, b) { return b ? a / b * 100 : null; };
    s.stat = {
      vpip: pc(s.vpip, n), pfr: pc(s.pfr, n), tb: pc(s.tb, s.tbOpp), cb: pc(s.cb, s.cbOpp), fcb: pc(s.fcb, s.fcbOpp),
      af: s.calls ? s.aggr / s.calls : (s.aggr ? 9 : null), wtsd: pc(s.wtsd, s.saw), wsd: pc(s.wsd, s.wtsd)
    };
    s.stat.gap = s.stat.vpip != null ? s.stat.vpip - s.stat.pfr : null;
    s.samples = { vpip: n, pfr: n, gap: n, tb: s.tbOpp, cb: s.cbOpp, fcb: s.fcbOpp, af: s.aggr + s.calls, wtsd: s.saw, wsd: s.wtsd };
    s.bb100 = n ? s.net / n * 100 : 0;
    return s;
  }
  // Build the ranked list of weaknesses with lessons.
  var LEAK_INFO = {
    'pf-loose': { title: 'プリフロップで参加しすぎ', drill: 'preflop', theory: 't1', why: '表の外の弱い手で参加すると、フロップ以降に2番目に強い手で大きく負けやすくなります。' },
    'pf-tight': { title: 'プリフロップで降りすぎ', drill: 'preflop', theory: 't1', why: '参加できる手を捨てると、ブラインドを払うだけで少しずつ負けます。特に後ろの席(CO・BTN)では広く参加します。' },
    'pf-limp': { title: 'リンプ(コールだけで参加)', drill: 'preflop', theory: 't1', why: 'リンプすると相手を降ろせず、主導権も取れません。参加するならレイズ、しないならフォールドが基本です。' },
    'overcall': { title: 'オッズが足りないのにコール', drill: 'odds', theory: 't2', why: '必要勝率より勝率が低いコールは、続けるほど負けます。コール前に「コール額 ÷ コール後のポット」を計算しましょう。' },
    'overfold': { title: '勝率が足りているのにフォールド', drill: 'odds', theory: 't6', why: '降りすぎると、相手はどんな手でもベットするだけで得をします。MDF(守るべき割合)を意識しましょう。' },
    'missed-value': { title: 'リバーのバリュー取り損ね', drill: 'scenario', theory: 't6', why: '強い手でチェックすると、相手の弱い手から追加のチップをもらえません。小さくでもベットしましょう。' }
  };
  function leaks(s) {
    var out = [];
    Object.keys(s.leaks).forEach(function (k) {
      var L = s.leaks[k], info = LEAK_INFO[k];
      out.push({ key: k, title: info.title, why: info.why, drill: info.drill, theory: info.theory, count: L.n, ev: L.ev, items: L.items, score: L.n * 2 + L.ev });
    });
    var st = s.stat;
    function statLeak(key, cond, title, why, drill, theory, sev) {
      if (s.samples[key] < (key === 'vpip' || key === 'pfr' || key === 'gap' ? 30 : 12) || st[key] == null) return;
      if (cond) out.push({ key: 'stat-' + key, title: title, why: why, drill: drill, theory: theory, count: 0, ev: 0, items: [], score: sev, stat: key });
    }
    var F = function (k, d) { return st[k] == null ? '—' : st[k].toFixed(d); };
    statLeak('vpip', st.vpip > TARGETS.vpip.hi, '参加する手が多すぎる', '参加率が ' + F('vpip', 0) + '% と高めです(目安20〜30%)。席ごとのオープン表を見直しましょう。', 'preflop', 't1', 6);
    statLeak('vpip', st.vpip < TARGETS.vpip.lo, '参加する手が少なすぎる', '参加率が ' + F('vpip', 0) + '% と低めです(目安20〜30%)。BTNやCOではもっと広く参加できます。', 'preflop', 't1', 5);
    statLeak('gap', st.gap > TARGETS.gap.hi, 'コールでの参加が多い', '参加率とレイズ率の差が ' + F('gap', 0) + 'pt あります。受け身の参加は不利なので、参加するならレイズを基本にしましょう。', 'preflop', 't1', 5);
    statLeak('tb', st.tb < TARGETS.tb.lo, '3ベットが少ない', '相手のオープンに対する3ベット率が ' + F('tb', 0) + '% です(目安6〜12%)。強い手とA5sのようなブロッカー付きの手で3ベットしましょう。', 'preflop', 't8', 4);
    statLeak('fcb', st.fcb > TARGETS.fcb.hi, 'Cベットに降りすぎ', 'Cベットに ' + F('fcb', 0) + '% 降りています(目安35〜55%)。小さいCベットにはペアやドローで粘りましょう。', 'odds', 't6', 5);
    statLeak('cb', st.cb < TARGETS.cb.lo, 'Cベットが少ない', 'プリフロップでレイズした後のCベットが ' + F('cb', 0) + '% です。乾いたボードでは小さく高頻度に打ちましょう。', 'scenario', 't7', 3);
    statLeak('af', st.af < TARGETS.af.lo, '受け身すぎる(コールが多い)', 'ベット÷コールが ' + F('af', 1) + ' です(目安1.8〜4)。強い手とドローは自分からベット・レイズしましょう。', 'scenario', 't6', 4);
    statLeak('wtsd', st.wtsd > 40 && st.wsd != null && st.wsd < 45, 'ショーダウンまで行きすぎ', 'フロップを見た後 ' + F('wtsd', 0) + '% でショーダウンまで行き、勝率が低めです。弱いペアで最後まで付いていっていないか見直しましょう。', 'odds', 't2', 4);
    out.sort(function (a, b) { return b.score - a.score; });
    return out;
  }

  var API = {
    BB: BB, START: START, POS6: POS6, LEVEL_LABEL: LEVEL_LABEL, TARGETS: TARGETS, LEAK_INFO: LEAK_INFO,
    init: init, pctOf: pctOf, Table: Table, botAct: botAct, equityVsRanges: equityVsRanges,
    preflopSituation: preflopSituation, gradePreflop: gradePreflop, postflopSnapshot: postflopSnapshot, gradePostflop: gradePostflop,
    heroRecord: heroRecord, aggregate: aggregate, leaks: leaks, hasDraw: hasDraw
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.PokerGame = API;
})(typeof self !== 'undefined' ? self : this);
