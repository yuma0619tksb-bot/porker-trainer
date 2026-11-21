/* River GTO solver (CFR+ with vectorised hand evaluation and card-removal aware showdowns).
 * Requires PokerEngine (engine.js). Works in a Web Worker and in Node.
 * Game: river, OOP acts first. Pot already in the middle, both players have `stack` behind.
 */
(function (root) {
  'use strict';
  var E = root.PokerEngine || (typeof require !== 'undefined' ? require('./engine.js') : null);

  // ---------- tree ----------
  // cfg: {pot, stack, oopBets:[fractions], ipBets:[fractions], allowRaise:bool}
  function buildTree(cfg) {
    var pot = cfg.pot, stack = cfg.stack;
    var id = 0;
    function betAmount(frac, c) { // bet size relative to current pot (pot + both contributions)
      var cur = pot + 2 * c;
      return Math.min(stack - c, Math.round(frac * cur * 100) / 100);
    }
    function sizesFor(fracs, c) {
      var seen = {}, out = [];
      fracs.forEach(function (f) {
        var a = betAmount(f, c);
        if (a <= 0) return;
        var allin = a >= stack - c - 1e-9;
        var key = allin ? 'allin' : a.toFixed(2);
        if (seen[key]) return; seen[key] = 1;
        out.push({ amt: a, allin: allin, frac: f });
      });
      return out;
    }
    function action(player, c, path) { // node where `player` acts with no bet facing
      var acts = [], ch = [];
      acts.push({ type: 'check', label: 'チェック' });
      ch.push(player === 0 ? action(1, c, path + 'X') : { kind: 'showdown', c: c });
      sizesFor(player === 0 ? cfg.oopBets : cfg.ipBets, c).forEach(function (s) {
        acts.push({ type: 'bet', amt: s.amt, label: s.allin ? 'オールイン ' + fmt(s.amt) : 'ベット ' + fmt(s.amt) + ' (' + Math.round(s.frac * 100) + '%)' });
        ch.push(facing(1 - player, c, c + s.amt, s.allin, path + 'B' + s.amt));
      });
      return mk(player, acts, ch, path);
    }
    function facing(player, cMe, cOpp, oppAllin, path) { // `player` faces a bet: contributions cMe < cOpp
      var acts = [{ type: 'fold', label: 'フォールド' }, { type: 'call', label: 'コール ' + fmt(cOpp - cMe) }];
      var ch = [{ kind: 'fold', folder: player, cFolder: cMe, cWinner: cOpp }, { kind: 'showdown', c: cOpp }];
      if (cfg.allowRaise && !oppAllin && stack > cOpp) {
        acts.push({ type: 'raise', amt: stack, label: 'オールインレイズ ' + fmt(stack) });
        var callNode = { kind: 'showdown', c: stack };
        var foldNode = { kind: 'fold', folder: 1 - player, cFolder: cOpp, cWinner: stack };
        ch.push(mk(1 - player, [{ type: 'fold', label: 'フォールド' }, { type: 'call', label: 'コール ' + fmt(stack - cOpp) }], [foldNode, callNode], path + 'R'));
      }
      return mk(player, acts, ch, path);
    }
    function mk(player, acts, ch, path) { return { kind: 'act', id: id++, player: player, actions: acts, children: ch, path: path }; }
    function fmt(x) { return (Math.round(x * 10) / 10) + 'bb'; }
    var rootNode = action(0, 0, '');
    rootNode.count = id;
    return rootNode;
  }

  // ---------- solver ----------
  function Solver(cfg) {
    this.cfg = cfg;
    var board = cfg.board;
    var deadMask = {};
    board.forEach(function (c) { deadMask[c] = 1; });
    var self = this;
    this.hands = [cfg.oopRange, cfg.ipRange].map(function (rangeStr) {
      var combos = E.rangeCombos(E.parseRange(rangeStr), board);
      var cards = new Int32Array(7);
      for (var k = 0; k < 5; k++) cards[2 + k] = board[k];
      combos.forEach(function (h) { cards[0] = h.c1; cards[1] = h.c2; h.s = E.evaluate(cards, 7); });
      return combos;
    });
    if (!this.hands[0].length || !this.hands[1].length) throw new Error('レンジがボードと重なって空になりました');
    this.n = [this.hands[0].length, this.hands[1].length];
    // sorted orders (ascending strength) for showdown sweeps
    this.order = this.hands.map(function (hs) {
      var idx = hs.map(function (_, i) { return i; });
      idx.sort(function (a, b) { return hs[a].s - hs[b].s; });
      return idx;
    });
    this.tree = buildTree(cfg);
    this.nodes = [];
    (function walk(nd) {
      if (nd.kind !== 'act') return;
      var nh = self.n[nd.player], na = nd.actions.length;
      nd.regret = new Float64Array(nh * na);
      nd.strat = new Float64Array(nh * na);
      self.nodes.push(nd);
      nd.children.forEach(walk);
    })(this.tree);
    this.iter = 0;
    this.initReach = this.hands.map(function (hs) { return Float64Array.from(hs.map(function (h) { return h.w; })); });
    // matchup normaliser: sum over non-conflicting pairs of w0*w1
    this.norm = this.blockedSum(0, this.initReach[1]).reduce(function (a, v, i) { return a + v * self.initReach[0][i]; }, 0);
  }

  // For traverser p's hands: sum of opponent reach over non-conflicting opponent hands.
  Solver.prototype.blockedSum = function (p, oppReach) {
    var me = this.hands[p], opp = this.hands[1 - p];
    var card = new Float64Array(52), total = 0, i;
    for (i = 0; i < opp.length; i++) { var r = oppReach[i]; total += r; card[opp[i].c1] += r; card[opp[i].c2] += r; }
    var sameIdx = this.sameMap(p);
    var out = new Float64Array(me.length);
    for (i = 0; i < me.length; i++) {
      var v = total - card[me[i].c1] - card[me[i].c2];
      var j = sameIdx[i]; if (j >= 0) v += oppReach[j];
      out[i] = v;
    }
    return out;
  };
  Solver.prototype.sameMap = function (p) { // index of identical combo in opponent list
    if (!this._same) this._same = [];
    if (this._same[p]) return this._same[p];
    var opp = this.hands[1 - p], key = {};
    opp.forEach(function (h, i) { key[h.c1 * 52 + h.c2] = i; key[h.c2 * 52 + h.c1] = i; });
    var arr = new Int32Array(this.hands[p].length);
    this.hands[p].forEach(function (h, i) { var k = key[h.c1 * 52 + h.c2]; arr[i] = k === undefined ? -1 : k; });
    this._same[p] = arr;
    return arr;
  };

  // Showdown values for traverser p: win -> pot + c, lose -> -c, tie -> pot/2, weighted by opp reach.
  Solver.prototype.showdown = function (p, oppReach, c) {
    var me = this.hands[p], opp = this.hands[1 - p];
    var om = this.order[1 - p], mm = this.order[p];
    var pot = this.cfg.pot;
    var nMe = me.length, nOpp = opp.length;
    var winR = new Float64Array(nMe), loseR = new Float64Array(nMe);
    var card = new Float64Array(52), cum = 0, j = 0, i, k, h, o;
    // weaker sweep (ascending)
    for (k = 0; k < nMe; k++) {
      i = mm[k]; h = me[i];
      while (j < nOpp && opp[om[j]].s < h.s) { o = opp[om[j]]; var r = oppReach[om[j]]; cum += r; card[o.c1] += r; card[o.c2] += r; j++; }
      winR[i] = cum - card[h.c1] - card[h.c2];
    }
    // stronger sweep (descending)
    card.fill(0); cum = 0; j = nOpp - 1;
    for (k = nMe - 1; k >= 0; k--) {
      i = mm[k]; h = me[i];
      while (j >= 0 && opp[om[j]].s > h.s) { o = opp[om[j]]; var r2 = oppReach[om[j]]; cum += r2; card[o.c1] += r2; card[o.c2] += r2; j--; }
      loseR[i] = cum - card[h.c1] - card[h.c2];
    }
    var avail = this.blockedSum(p, oppReach);
    var out = new Float64Array(nMe);
    for (i = 0; i < nMe; i++) {
      var tie = avail[i] - winR[i] - loseR[i];
      if (tie < 0) tie = 0;
      out[i] = winR[i] * (pot + c) - loseR[i] * c + tie * pot / 2;
    }
    return out;
  };

  Solver.prototype.terminal = function (nd, p, oppReach) {
    if (nd.kind === 'showdown') return this.showdown(p, oppReach, nd.c);
    var avail = this.blockedSum(p, oppReach);
    var v = nd.folder === p ? -nd.cFolder : this.cfg.pot + nd.cFolder;
    for (var i = 0; i < avail.length; i++) avail[i] *= v;
    return avail;
  };

  Solver.prototype.currentStrategy = function (nd) {
    var nh = this.n[nd.player], na = nd.actions.length, s = new Float64Array(nh * na);
    for (var h = 0; h < nh; h++) {
      var sum = 0, a;
      for (a = 0; a < na; a++) { var r = nd.regret[h * na + a]; if (r > 0) sum += r; }
      for (a = 0; a < na; a++) s[h * na + a] = sum > 0 ? Math.max(0, nd.regret[h * na + a]) / sum : 1 / na;
    }
    return s;
  };
  Solver.prototype.averageStrategy = function (nd) {
    var nh = this.n[nd.player], na = nd.actions.length, s = new Float64Array(nh * na);
    for (var h = 0; h < nh; h++) {
      var sum = 0, a;
      for (a = 0; a < na; a++) sum += nd.strat[h * na + a];
      for (a = 0; a < na; a++) s[h * na + a] = sum > 0 ? nd.strat[h * na + a] / sum : 1 / na;
    }
    return s;
  };

  // CFR+ traversal for player p. ownReach is p's reach (for strategy averaging), oppReach the opponent's.
  Solver.prototype.cfr = function (nd, p, ownReach, oppReach, weight) {
    if (nd.kind !== 'act') return this.terminal(nd, p, oppReach);
    var na = nd.actions.length, a, h;
    var strat = this.currentStrategy(nd);
    if (nd.player === p) {
      var nh = this.n[p];
      var vals = [], node = new Float64Array(nh);
      for (a = 0; a < na; a++) {
        var r = new Float64Array(nh);
        for (h = 0; h < nh; h++) r[h] = ownReach[h] * strat[h * na + a];
        var v = this.cfr(nd.children[a], p, r, oppReach, weight);
        vals.push(v);
        for (h = 0; h < nh; h++) node[h] += strat[h * na + a] * v[h];
      }
      for (h = 0; h < nh; h++) for (a = 0; a < na; a++) {
        var idx = h * na + a;
        nd.regret[idx] = Math.max(0, nd.regret[idx] + vals[a][h] - node[h]);
        nd.strat[idx] += weight * ownReach[h] * strat[idx];
      }
      return node;
    }
    var no = this.n[1 - p], sum = new Float64Array(this.n[p]);
    for (a = 0; a < na; a++) {
      var r2 = new Float64Array(no);
      for (h = 0; h < no; h++) r2[h] = oppReach[h] * strat[h * na + a];
      var v2 = this.cfr(nd.children[a], p, ownReach, r2, weight);
      for (h = 0; h < sum.length; h++) sum[h] += v2[h];
    }
    return sum;
  };

  Solver.prototype.run = function (iterations, onProgress) {
    for (var t = 0; t < iterations; t++) {
      this.iter++;
      var w = this.iter; // linear averaging (CFR+)
      this.cfr(this.tree, 0, this.initReach[0], this.initReach[1], w);
      this.cfr(this.tree, 1, this.initReach[1], this.initReach[0], w);
      if (onProgress && (t % 20 === 19 || t === iterations - 1)) onProgress(this.iter);
    }
  };

  // Best response value of p against the opponent's average strategy.
  Solver.prototype.br = function (nd, p, oppReach) {
    if (nd.kind !== 'act') return this.terminal(nd, p, oppReach);
    var na = nd.actions.length, a, h;
    if (nd.player === p) {
      var best = null;
      for (a = 0; a < na; a++) {
        var v = this.br(nd.children[a], p, oppReach);
        if (!best) best = v; else for (h = 0; h < v.length; h++) if (v[h] > best[h]) best[h] = v[h];
      }
      return best;
    }
    var strat = this.averageStrategy(nd), no = this.n[1 - p], sum = new Float64Array(this.n[p]);
    for (a = 0; a < na; a++) {
      var r = new Float64Array(no);
      for (h = 0; h < no; h++) r[h] = oppReach[h] * strat[h * na + a];
      var v2 = this.br(nd.children[a], p, r);
      for (h = 0; h < sum.length; h++) sum[h] += v2[h];
    }
    return sum;
  };
  Solver.prototype.exploitability = function () {
    var tot = 0;
    for (var p = 0; p < 2; p++) {
      var v = this.br(this.tree, p, this.initReach[1 - p]);
      var s = 0;
      for (var h = 0; h < v.length; h++) s += v[h] * this.initReach[p][h];
      tot += s / this.norm;
    }
    return (tot - this.cfg.pot) / 2; // chips; 0 = perfect equilibrium
  };

  // Expected value of each hand of p when both play the average strategy.
  Solver.prototype.evAvg = function (nd, p, oppReach) {
    if (nd.kind !== 'act') return this.terminal(nd, p, oppReach);
    var na = nd.actions.length, a, h, strat = this.averageStrategy(nd);
    if (nd.player === p) {
      var nh = this.n[p], out = new Float64Array(nh);
      for (a = 0; a < na; a++) {
        var v = this.evAvg(nd.children[a], p, oppReach);
        for (h = 0; h < nh; h++) out[h] += strat[h * na + a] * v[h];
      }
      return out;
    }
    var no = this.n[1 - p], sum = new Float64Array(this.n[p]);
    for (a = 0; a < na; a++) {
      var r = new Float64Array(no);
      for (h = 0; h < no; h++) r[h] = oppReach[h] * strat[h * na + a];
      var v2 = this.evAvg(nd.children[a], p, r);
      for (h = 0; h < sum.length; h++) sum[h] += v2[h];
    }
    return sum;
  };

  // Summarise a node: per hand-class average strategy, weighted by reach of that player into the node.
  Solver.prototype.summary = function () {
    var self = this, out = [];
    function walk(nd, reach) { // reach: [Float64Array, Float64Array]
      if (nd.kind !== 'act') return;
      var p = nd.player, na = nd.actions.length, strat = self.averageStrategy(nd), hs = self.hands[p];
      var classes = {}, total = new Float64Array(na), wsum = 0, h, a;
      for (h = 0; h < hs.length; h++) {
        var w = reach[p][h]; if (w <= 1e-12) continue;
        var lab = E.comboClass(hs[h].c1, hs[h].c2);
        var c = classes[lab] || (classes[lab] = { w: 0, f: new Array(na).fill(0), combos: [] });
        c.w += w;
        var combo = { cards: E.cardStr(hs[h].c1) + E.cardStr(hs[h].c2), w: w, f: [] };
        for (a = 0; a < na; a++) { c.f[a] += w * strat[h * na + a]; total[a] += w * strat[h * na + a]; combo.f.push(strat[h * na + a]); }
        c.combos.push(combo);
        wsum += w;
      }
      Object.keys(classes).forEach(function (k) { var c = classes[k]; c.f = c.f.map(function (x) { return x / c.w; }); });
      out.push({
        id: nd.id, path: nd.path, player: p, actions: nd.actions.map(function (x) { return x.label; }),
        actionTypes: nd.actions.map(function (x) { return x.type; }),
        total: Array.from(total).map(function (x) { return wsum ? x / wsum : 0; }), classes: classes, reachWeight: wsum
      });
      for (a = 0; a < na; a++) {
        var nr = [Float64Array.from(reach[0]), Float64Array.from(reach[1])];
        for (h = 0; h < hs.length; h++) nr[p][h] *= strat[h * na + a];
        nd.children[a].label = nd.actions[a].label;
        if (nd.children[a].kind === 'act') { nd.children[a].parent = nd.id; nd.children[a].via = a; }
        walk(nd.children[a], nr);
      }
    }
    walk(this.tree, [this.initReach[0], this.initReach[1]]);
    // attach parent links
    var byId = {};
    out.forEach(function (s) { byId[s.id] = s; });
    (function link(nd) {
      if (nd.kind !== 'act') return;
      byId[nd.id].children = nd.children.map(function (c) { return c.kind === 'act' ? c.id : c.kind; });
      nd.children.forEach(link);
    })(this.tree);
    var ev = [0, 1].map(function (p) {
      var v = self.evAvg(self.tree, p, self.initReach[1 - p]);
      var s = 0; for (var h = 0; h < v.length; h++) s += v[h] * self.initReach[p][h];
      return s / self.norm;
    });
    return { nodes: out, ev: ev, combos: this.n.slice() };
  };

  var API = { buildTree: buildTree, Solver: Solver };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.RiverSolver = API;
})(typeof self !== 'undefined' ? self : this);
