/* 対戦モード + オーダーメイドレッスン. Registered into app.js through window.PT_PLAY(ui). */
(function () {
  'use strict';
  var E = window.PokerEngine, G = window.PokerGame;

  // ---------- storage: cloud (db capability) with a local fallback ----------
  var LKEY = 'poker-dojo-hands';
  var store = { mode: 'local', db: null, cache: null };
  function localGet() { try { return JSON.parse(localStorage.getItem(LKEY) || '[]'); } catch (e) { return []; } }
  function localSet(a) { try { localStorage.setItem(LKEY, JSON.stringify(a.slice(-500))); } catch (e) {} }
  store.ready = (async function () {
    try {
      var db = window.claude && window.claude.use ? await window.claude.use('db') : null;
      if (!db) return;
      store.db = db; store.mode = 'cloud';
      var pending = localGet(); // hands saved while offline / before cloud was available
      for (var i = 0; i < pending.length; i++) await db.collection('hands').add(pending[i]);
      if (pending.length) localSet([]);
    } catch (e) { store.db = null; store.mode = 'local'; }
  })();
  store.save = async function (rec) {
    if (store.cache) store.cache.unshift(rec);
    await store.ready;
    if (store.db) {
      try { await store.db.collection('hands').add(rec); return; }
      catch (e) { if (e && e.code === 'quota_exceeded') store.full = true; }
    }
    var a = localGet(); a.push(rec); localSet(a);
  };
  store.load = async function () {
    await store.ready;
    var out = [];
    if (store.db) {
      try {
        var snap = await store.db.collection('hands').orderBy('t', 'desc').limit(1000).get();
        out = snap.docs.map(function (d) { return d.data(); });
      } catch (e) { store.loadError = true; }
    }
    out = out.concat(localGet().reverse());
    out.sort(function (a, b) { return b.t - a.t; });
    store.cache = out;
    return out;
  };

  var eqReady = null;
  function loadEq() {
    if (!eqReady) eqReady = fetch('data/equity169.json').then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (a) { G.init(Float32Array.from(a, function (x) { return x / 10000; }), window.PT_DATA); });
    return eqReady;
  }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function bb(chips) { var v = chips / G.BB; return (Math.round(v * 10) / 10).toString(); }

  window.PT_PLAY = function (ui) {
    var $ = ui.$, $all = ui.$all, esc = ui.esc, cardHTML = ui.cardHTML;
    var settings = { coach: true, speed: 650 };
    try { Object.assign(settings, JSON.parse(localStorage.getItem('poker-dojo-play') || '{}')); } catch (e) {}
    function saveSettings() { try { localStorage.setItem('poker-dojo-play', JSON.stringify(settings)); } catch (e) {} }
    var S = { table: null, token: 0, hands: 0, net: 0, lastAct: {}, notes: [], heroResolve: null };

    // ================= PLAY =================
    ui.views.play = function () {
      var token = ++S.token;
      ui.app.innerHTML = ui.backBtn() +
        '<div class="stack"><div class="row" style="justify-content:space-between"><h2>対戦モード</h2><span class="num muted" id="plSess"></span></div>' +
        '<div class="row" style="gap:14px"><label class="check"><input type="checkbox" id="plCoach"' + (settings.coach ? ' checked' : '') + '>その場でコーチが指摘</label>' +
        '<label class="check">速さ<select id="plSpeed" style="width:auto"><option value="1100">ゆっくり</option><option value="650">ふつう</option><option value="250">速い</option></select></label>' +
        '<span class="muted" id="plStore" style="font-size:12px"></span></div>' +
        '<div class="ptable" id="pTable"><p class="muted" style="position:absolute;inset:45% 0 auto;text-align:center">卓を準備中…</p></div>' +
        '<div id="pAct"></div><div id="pNote" class="stack" style="gap:8px"></div>' +
        '<details class="ch" id="pLogBox"><summary><span class="lvl">LOG</span><span>このハンドの流れ</span></summary><div id="pLog" class="detail" style="padding-bottom:10px"></div></details>' +
        '<p class="note-box" style="margin:0">相手: <b style="color:var(--green)">格下</b>(参加しすぎでコールが多い)・<b style="color:var(--gold)">同等</b>(表どおりだが少しブレる)・<b style="color:var(--red)">格上</b>(表どおり+オッズとブラフのバランス)。毎ハンド100BBから始まるキャッシュゲームです。結果はレッスンの分析に使われます。</p></div>';
      $('#plSpeed').value = String(settings.speed);
      $('#plSpeed').onchange = function () { settings.speed = +this.value; saveSettings(); };
      $('#plCoach').onchange = function () { settings.coach = this.checked; saveSettings(); };
      store.ready.then(function () { var el = $('#plStore'); if (el) el.textContent = store.mode === 'cloud' ? '記録: クラウドに保存' : '記録: この端末に保存'; });
      loadEq().then(function () {
        if (token !== S.token) return;
        if (!S.table) S.table = new G.Table();
        runHands(token);
      }).catch(function () { $('#pTable').innerHTML = '<div class="fb ng" style="margin:20px">勝率表を読み込めませんでした。再読み込みしてください。</div>'; });
    };

    async function runHands(token) {
      var t = S.table;
      while (token === S.token) {
        t.newHand(); S.lastAct = {}; S.notes = [];
        renderTable(); renderNote(); renderLog();
        while (!t.done) {
          if (token !== S.token) return;
          var i = t.toAct, act, sit = null, snap = null;
          if (i === 0) {
            if (t.street === 0 && !t.hero.first) { sit = G.preflopSituation(t, 0); t.hero.first = 1; }
            else if (t.street > 0) snap = G.postflopSnapshot(t, 0);
            renderTable(); renderActions();
            act = await new Promise(function (r) { S.heroResolve = r; });
            S.heroResolve = null; $('#pAct') && ($('#pAct').innerHTML = '');
            if (token !== S.token) return;
          } else {
            renderTable(i);
            await sleep(settings.speed);
            if (token !== S.token) return;
            act = G.botAct(t, i);
          }
          var rec = t.apply(i, act);
          S.lastAct[i] = actText(rec);
          if (i === 0) {
            var g = sit ? G.gradePreflop(sit, { type: rec.a === 'raise' ? 'raise' : rec.a }) : snap ? G.gradePostflop(snap, { type: rec.a }) : null;
            if (g) { t.hero.decisions.push(g); if (settings.coach) { S.notes.push(g); renderNote(); } }
          }
          var r = t.advance();
          if (r === 'street') { S.lastAct = {}; }
          renderTable(); renderLog();
          if (r === 'street') await sleep(Math.min(500, settings.speed));
        }
        // hand over
        var hero = t.players[0];
        S.hands++; S.net += hero.net / G.BB;
        var recd = G.heroRecord(t);
        store.save(recd);
        if (t.hero.decisions.length) ui.award('play', t.hero.decisions.every(function (d) { return d.ok; }));
        renderTable(); renderResult(); renderLog();
        await new Promise(function (r) { S.heroResolve = r; });
        S.heroResolve = null;
      }
    }

    function actText(rec) {
      var m = { fold: 'フォールド', check: 'チェック', call: 'コール', bet: 'ベット', raise: 'レイズ' };
      var s = m[rec.a] || rec.a;
      if (rec.a === 'call') s += ' ' + bb(rec.amt);
      if (rec.a === 'bet' || rec.a === 'raise') s += ' ' + bb(rec.to);
      if (rec.allin && rec.a !== 'fold' && rec.a !== 'check') s = 'オールイン ' + (rec.to ? bb(rec.to) : bb(rec.amt));
      return s;
    }

    var SPOTS = [[50, 86], [9, 64], [11, 22], [50, 9], [89, 22], [91, 64]];
    function renderTable(acting) {
      var el = $('#pTable'); if (!el) return;
      var t = S.table, done = t.done, showdown = done && t.result.showdown;
      var html = '<div class="felt"></div>';
      t.players.forEach(function (p, i) {
        var xy = SPOTS[i];
        var isHero = i === 0;
        var showCards = isHero || (showdown && !p.folded);
        var cards = p.folded && !isHero ? '' : p.hole.map(function (c) { return showCards ? cardHTML(c, 'sm') : '<span class="pc sm back"></span>'; }).join('');
        var cls = 'seatbox' + (p.folded ? ' folded' : '') + ((acting === i || (t.toAct === i && !done && isHero)) ? ' acting' : '') + (done && p.won > 0 && t.result ? ' winner' : '');
        var badge = isHero ? '' : '<span class="lvl-' + p.kind + '">' + G.LEVEL_LABEL[p.kind] + '</span>';
        var last = S.lastAct[i] ? '<div class="lastact">' + esc(S.lastAct[i]) + '</div>' : '';
        var bet = p.bet > 0 && !done ? '<div class="betchip"><i class="chip" style="--c:var(--blue);width:12px;height:12px"></i>' + bb(p.bet) + '</div>' : '';
        var net = done && (p.won > 0 || isHero) ? '<div class="lastact" style="color:' + (p.net >= 0 ? 'var(--green)' : 'var(--red)') + '">' + (p.net >= 0 ? '+' : '') + bb(p.net) + 'BB</div>' : '';
        html += '<div class="' + cls + '" style="left:' + xy[0] + '%;top:' + xy[1] + '%">' +
          '<div class="who"><span class="posb' + (p.pos === 'BTN' ? ' dealer' : '') + '">' + p.pos + '</span><b>' + esc(p.name) + '</b>' + badge + '</div>' +
          '<div class="hand">' + cards + '</div>' +
          '<div class="num stk">' + bb(p.stack) + 'BB</div>' + (done ? net : last) + bet + '</div>';
      });
      var pot = t.pot();
      html += '<div class="center"><div class="board">' + t.board.map(function (c) { return cardHTML(c); }).join('') + '</div>' +
        '<span class="pot">ポット ' + bb(pot) + 'BB</span></div>';
      el.innerHTML = html;
      var sess = $('#plSess'); if (sess) sess.textContent = S.hands + 'ハンド · ' + (S.net >= 0 ? '+' : '') + S.net.toFixed(1) + 'BB';
    }

    function renderActions() {
      var el = $('#pAct'); if (!el) return;
      var t = S.table, L = t.legal(0), pot = t.pot();
      var presets = [];
      if (L.canRaise) {
        if (t.street === 0) {
          if (t.raises === 0) presets = [[(2.5 + t.limpers) * G.BB, (2.5 + t.limpers) + 'BB'], [(3 + t.limpers) * G.BB, (3 + t.limpers) + 'BB']];
          else if (t.raises === 1) presets = [[t.currentBet * 3, '3倍'], [t.currentBet * 3.6, '3.6倍']];
          else presets = [[t.currentBet * 2.3, '2.3倍']];
        } else if (t.currentBet === 0) presets = [[pot * 0.33, '33%'], [pot * 0.5, '50%'], [pot * 0.75, '75%'], [pot, 'ポット']];
        else presets = [[t.currentBet * 2.5, '2.5倍'], [t.currentBet * 3.5, '3.5倍']];
        presets = presets.map(function (x) { return [Math.max(L.minTo, Math.min(L.maxTo, Math.round(x[0] / 5) * 5)), x[1]]; })
          .filter(function (x, k, a) { return x[0] < L.maxTo && a.findIndex(function (y) { return y[0] === x[0]; }) === k; });
        presets.push([L.maxTo, 'オールイン']);
      }
      var need = L.toCall ? Math.round(L.toCall / (pot + L.toCall) * 100) : 0;
      var raiseWord = t.currentBet === 0 ? 'ベット' : 'レイズ';
      el.innerHTML = '<div class="panel stack actpanel">' +
        (L.toCall ? '<div class="muted num" style="font-size:12px">コール ' + bb(L.toCall) + 'BB · ポット ' + bb(pot) + 'BB · 必要勝率 ' + need + '%</div>' : '') +
        '<div class="choices" style="grid-template-columns:repeat(2,1fr)">' +
          (L.canCheck ? '<button class="btn blue" data-h="check">チェック</button><button class="btn slate" data-h="fold" disabled>フォールド</button>'
            : '<button class="btn slate" data-h="fold">フォールド</button><button class="btn blue" data-h="call">コール ' + bb(L.toCall) + '</button>') +
        '</div>' +
        (L.canRaise ? '<div class="sizes">' + presets.map(function (x) { return '<button type="button" class="btn small ghost" data-to="' + x[0] + '">' + x[1] + ' <span class="num muted">' + bb(x[0]) + '</span></button>'; }).join('') + '</div>' +
          '<div class="row" style="flex-wrap:nowrap"><input type="range" id="pSlider" min="' + L.minTo + '" max="' + L.maxTo + '" step="5" value="' + (presets[0] ? presets[0][0] : L.minTo) + '" aria-label="' + raiseWord + '額">' +
          '<button class="btn red" id="pRaise" style="white-space:nowrap">' + raiseWord + ' <span id="pAmt" class="num"></span></button></div>' : '') +
        '</div>';
      function setAmt() { var s = $('#pSlider'); if (s) $('#pAmt').textContent = bb(+s.value) + 'BB'; }
      setAmt();
      if ($('#pSlider')) $('#pSlider').oninput = setAmt;
      $all('[data-to]', el).forEach(function (b) { b.onclick = function () { $('#pSlider').value = b.dataset.to; setAmt(); }; });
      $all('[data-h]', el).forEach(function (b) { b.onclick = function () { if (S.heroResolve) S.heroResolve({ type: b.dataset.h }); }; });
      if ($('#pRaise')) $('#pRaise').onclick = function () { if (S.heroResolve) S.heroResolve({ type: 'raise', to: +$('#pSlider').value }); };
    }

    function renderNote() {
      var el = $('#pNote'); if (!el) return;
      el.innerHTML = S.notes.map(function (g) {
        return '<div class="fb pop ' + (g.ok ? 'ok' : 'ng') + '" style="padding:10px 12px"><b style="color:' + (g.ok ? 'var(--green)' : 'var(--red)') + '">' + (g.ok ? 'ナイス判断' : 'コーチより') + '</b> ' + esc(g.msg) + '</div>';
      }).join('');
    }

    function renderResult() {
      var el = $('#pAct'); if (!el) return;
      var t = S.table, h = t.players[0];
      var winners = t.players.filter(function (p) { return p.won > 0; });
      var desc = winners.map(function (p) {
        var hand = t.result.showdown ? ' (' + E.CAT_NAMES[E.category(E.evaluate(p.hole.concat(t.board)))] + ')' : '';
        return esc(p.name) + hand;
      }).join('、');
      var mistakes = t.hero.decisions.filter(function (d) { return !d.ok; }).length;
      el.innerHTML = '<div class="panel stack pop" style="text-align:center"><div class="eyebrow">ハンド終了</div>' +
        '<div style="font-family:var(--font-display);font-size:22px">' + desc + ' の勝ち</div>' +
        '<div class="num" style="color:' + (h.net >= 0 ? 'var(--green)' : 'var(--red)') + '">あなた ' + (h.net >= 0 ? '+' : '') + bb(h.net) + 'BB</div>' +
        (t.hero.decisions.length ? '<div class="muted" style="font-size:13px">判定された判断 ' + t.hero.decisions.length + '回 · 要改善 ' + mistakes + '回</div>' : '') +
        '<div class="row" style="justify-content:center"><button class="btn ghost" data-go="lesson">レッスンを見る</button><button class="btn gold" id="pNext">次のハンド →</button></div></div>';
      $('#pNext').onclick = function () { if (S.heroResolve) S.heroResolve(); };
      $('#pNext').focus({ preventScroll: true });
    }

    function renderLog() {
      var el = $('#pLog'); if (!el) return;
      var t = S.table, st = ['プリフロップ', 'フロップ', 'ターン', 'リバー'], last = -1, html = '';
      t.log.forEach(function (r) {
        if (r.st !== last) { last = r.st; html += '<div style="color:var(--gold);margin-top:6px">' + st[r.st] + (r.st ? ' ' + t.board.slice(0, 2 + r.st).map(E.cardStr).join(' ') : '') + '</div>'; }
        var p = t.players[r.p];
        html += '<div>' + p.pos + ' ' + esc(p.name) + ': ' + esc(actText(r)) + '</div>';
      });
      el.innerHTML = html || '<span class="muted">まだアクションはありません</span>';
    }

    // ================= LESSON =================
    var coachText = '', coachBusy = false;
    ui.views.lesson = function () {
      ui.app.innerHTML = ui.backBtn() + '<div class="stack"><h2>オーダーメイドレッスン</h2><div id="lsBody" class="stack"><p class="muted">プレー履歴を読み込み中…</p></div></div>';
      var timer = setTimeout(function () { var b = $('#lsBody'); if (b && !b.dataset.done) b.insertAdjacentHTML('beforeend', '<p class="note-box">クラウドの履歴にまだ届きません。通信状況を確認してください。</p>'); }, 10000);
      Promise.all([store.load(), loadEq()]).then(function (res) { clearTimeout(timer); renderLesson(res[0]); })
        .catch(function () { clearTimeout(timer); renderLesson(store.cache || []); });
    };

    function statusOf(key, v, n) {
      var T = G.TARGETS[key]; if (v == null) return ['muted', '—'];
      if (n < 20) return ['muted', '参考'];
      if (v < T.lo) return ['low', '低い']; if (v > T.hi) return ['high', '高い']; return ['ok', '目安内'];
    }
    function fmtStat(key, v) { if (v == null) return '—'; return key === 'af' ? v.toFixed(1) : v.toFixed(0) + (G.TARGETS[key].unit === '%' ? '%' : 'pt'); }

    function handLine(h) {
      return '<span class="row" style="gap:3px;flex-wrap:nowrap">' + E.parseCards(h.hole).map(function (c) { return cardHTML(c, 'sm'); }).join('') + '</span>';
    }

    function renderLesson(hands) {
      var body = $('#lsBody'); if (!body) return;
      body.dataset.done = '1';
      if (!hands.length) {
        body.innerHTML = '<div class="panel stack" style="text-align:center"><h3>まだプレー記録がありません</h3><p class="muted" style="margin:0">対戦モードで遊ぶと、あなたの判断を1つずつ採点して、弱点に合わせたレッスンを作ります。まずは30ハンドほど遊んでみてください。</p><div><button class="btn gold" data-go="play">対戦モードへ</button></div></div>';
        return;
      }
      var s = G.aggregate(hands), lk = G.leaks(s);
      var acc = s.dec.n ? Math.round(s.dec.ok / s.dec.n * 100) : null;
      var html = '';
      html += '<div class="stats" style="grid-template-columns:repeat(auto-fit,minmax(130px,1fr))">' +
        '<div class="stat"><div class="v">' + s.n + '</div><div class="k">分析したハンド</div></div>' +
        '<div class="stat"><div class="v" style="color:' + (s.net >= 0 ? 'var(--green)' : 'var(--red)') + '">' + (s.net >= 0 ? '+' : '') + s.net.toFixed(1) + '</div><div class="k">収支 BB</div></div>' +
        '<div class="stat"><div class="v">' + (s.n >= 50 ? s.bb100.toFixed(1) : '—') + '</div><div class="k">100ハンドあたり BB' + (s.n < 50 ? '(50ハンドから)' : '') + '</div></div>' +
        '<div class="stat"><div class="v">' + (acc == null ? '—' : acc + '%') + '</div><div class="k">判断の正確さ</div></div></div>';
      if (s.n < 100) html += '<p class="note-box" style="margin:0">今は ' + s.n + 'ハンド分の分析です。統計は100ハンドを超えると信頼できるようになります。収支は運の影響が大きいので、まず「判断の正確さ」を見てください。</p>';
      if (store.mode !== 'cloud') html += '<p class="note-box" style="margin:0">この画面ではクラウドに接続できないため、この端末の記録だけを分析しています。</p>';

      // weaknesses
      html += '<h3 style="margin-top:8px">あなたの弱点 TOP3</h3>';
      if (!lk.length) html += '<div class="panel"><p style="margin:0">今のところ目立つ弱点はありません。ハンド数を増やすと、より細かく分析できます。</p></div>';
      lk.slice(0, 3).forEach(function (L, k) {
        var ex = L.items.slice(-2).reverse().map(function (it) {
          return '<div class="row" style="gap:8px;flex-wrap:nowrap;align-items:flex-start">' + handLine(it.hand) + '<span style="font-size:13px">' + esc(it.hand.pos) + ' · ' + esc(it.d.msg) + '</span></div>';
        }).join('');
        html += '<div class="panel stack leak"><div class="row" style="justify-content:space-between;flex-wrap:nowrap"><h3><span class="num" style="color:var(--red)">' + (k + 1) + '</span> ' + esc(L.title) + '</h3>' +
          (L.count ? '<span class="num muted" style="font-size:12px;white-space:nowrap">' + L.count + '回' + (L.ev > 0.05 ? ' · 約' + L.ev.toFixed(1) + 'BB損' : '') + '</span>' : '') + '</div>' +
          '<p style="margin:0">' + esc(L.why) + '</p>' + (ex ? '<div class="stack" style="gap:6px">' + ex + '</div>' : '') +
          '<div class="row"><button class="btn small gold" data-drill="' + L.drill + '">この弱点を特訓</button><button class="btn small ghost" data-th="' + L.theory + '">理論を読む</button></div></div>';
      });

      // AI coach
      html += '<div class="panel stack"><div class="row" style="justify-content:space-between"><h3>AIコーチ</h3><button class="btn small blue" id="aiBtn">' + (coachText ? 'もう一度相談' : '分析してもらう') + '</button></div>' +
        '<p class="muted" style="margin:0;font-size:12px">上の統計と間違えたハンドをClaudeに渡して、あなた専用のアドバイスと練習課題を作ります(あなたのClaudeの使用量を使います)。</p>' +
        '<div id="aiOut" class="prose" style="white-space:pre-wrap">' + esc(coachText) + '</div></div>';

      // stats
      html += '<h3 style="margin-top:8px">プレースタイルの数字</h3><div class="panel"><div class="detail"><table><tr><th>項目</th><th>あなた</th><th>目安</th><th>判定</th></tr>' +
        Object.keys(G.TARGETS).map(function (k) {
          var T = G.TARGETS[k], v = s.stat[k], st = statusOf(k, v, s.samples[k] || 0);
          return '<tr><td style="font-family:var(--font-body)">' + T.name + ' <span class="muted">(' + (s.samples[k] || 0) + ')</span></td><td>' + fmtStat(k, v) + '</td><td>' + (k === 'af' ? T.lo + '〜' + T.hi : T.lo + '〜' + T.hi + (T.unit === '%' ? '%' : 'pt')) + '</td><td><span class="pill ' + st[0] + '">' + st[1] + '</span></td></tr>';
        }).join('') + '</table></div><p class="muted" style="margin:8px 0 0;font-size:12px">( )内は数えた回数。少ないうちは参考値です。目安は6人卓キャッシュゲームの一般的な値です。</p></div>';

      // by position
      var order = ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
      var maxAbs = Math.max.apply(null, order.map(function (p) { var b = s.byPos[p]; return b ? Math.abs(b.net) : 0; }).concat([1]));
      html += '<h3 style="margin-top:8px">ポジション別の収支</h3><div class="panel bars">' + order.map(function (p) {
        var b = s.byPos[p] || { n: 0, net: 0, vpip: 0 };
        var w = Math.abs(b.net) / maxAbs * 50;
        return '<div class="bar"><span class="lbl">' + p + ' <span class="muted">(' + b.n + ')</span></span><span class="track" style="position:relative">' +
          '<i style="position:absolute;top:0;bottom:0;' + (b.net >= 0 ? 'left:50%' : 'right:50%') + ';width:' + w + '%;background:' + (b.net >= 0 ? 'var(--green)' : 'var(--red)') + '"></i><i style="position:absolute;left:50%;top:0;bottom:0;width:1px;background:var(--line)"></i></span>' +
          '<span class="num">' + (b.net >= 0 ? '+' : '') + b.net.toFixed(1) + '</span></div>';
      }).join('') + '<p class="muted" style="margin:4px 0 0;font-size:12px">SBとBBはブラインドを払うので、マイナスになるのが普通です。</p></div>';

      // recent mistakes
      var ms = s.mistakes.slice(0, 8);
      html += '<h3 style="margin-top:8px">見直したいハンド</h3>';
      html += ms.length ? '<div class="stack" style="gap:8px">' + ms.map(function (m, k) {
        return '<details class="ch"><summary>' + handLine(m.hand) + '<span style="font-size:13px">' + esc(m.hand.pos) + ' · ' + esc(G.LEAK_INFO[m.d.leak] ? G.LEAK_INFO[m.d.leak].title : '') + '</span></summary>' +
          '<div class="stack" style="gap:6px;padding-bottom:10px"><p style="margin:0">' + esc(m.d.msg) + '</p>' + replayHTML(m.hand) + '</div></details>';
      }).join('') + '</div>' : '<p class="muted">採点で見つかった間違いはまだありません。</p>';

      body.innerHTML = html;
      $all('[data-drill]', body).forEach(function (b) { b.onclick = function () { var d = b.dataset.drill; if (d === 'preflop') { S.drillHands = hands; ui.go('drill'); } else ui.go(d); }; });
      $all('[data-th]', body).forEach(function (b) { b.onclick = function () { ui.openTheory(b.dataset.th); }; });
      $('#aiBtn').onclick = function () { askCoach(s, lk); };
    }

    function replayHTML(h) {
      var st = ['プリフロップ', 'フロップ', 'ターン', 'リバー'], last = -1, out = '';
      var names = ['あなた'].concat((h.opp || []).map(function (o) { return o.n; }));
      var pos = [h.pos].concat((h.opp || []).map(function (o) { return o.pos; }));
      (h.log || []).forEach(function (r) {
        if (r[0] !== last) { last = r[0]; out += '<div style="color:var(--gold);margin-top:4px">' + st[r[0]] + (r[0] ? ' ' + (h.board || '').slice(0, (2 + r[0]) * 2) : '') + '</div>'; }
        var m = { fold: 'フォールド', check: 'チェック', call: 'コール', bet: 'ベット', raise: 'レイズ' };
        out += '<div' + (r[1] === 0 ? ' style="color:var(--gold)"' : '') + '>' + pos[r[1]] + ' ' + esc(names[r[1]]) + ': ' + (m[r[2]] || r[2]) + (r[3] ? ' ' + r[3] + 'BB' : '') + '</div>';
      });
      var shown = (h.opp || []).filter(function (o) { return !o.folded; }).map(function (o) { return esc(o.n) + ' ' + o.hole; }).join(' / ');
      return '<div class="detail">' + out + (shown ? '<div class="muted" style="margin-top:4px">最後まで残った相手: ' + shown + '</div>' : '') + '<div style="margin-top:4px">結果: ' + (h.net >= 0 ? '+' : '') + h.net.toFixed(1) + 'BB</div></div>';
    }

    async function askCoach(s, lk) {
      if (coachBusy) return;
      var out = $('#aiOut'), btn = $('#aiBtn');
      var sample = window.claude && window.claude.use ? await window.claude.use('sample') : null;
      if (!sample) { out.textContent = 'この画面ではAIコーチを使えません(claude.aiにサインインした状態で開いてください)。上の自動分析は使えます。'; return; }
      coachBusy = true; btn.disabled = true; out.textContent = '考え中…';
      var stats = {};
      Object.keys(G.TARGETS).forEach(function (k) { stats[G.TARGETS[k].name] = s.stat[k] == null ? null : Math.round(s.stat[k] * 10) / 10; });
      var mistakes = s.mistakes.slice(0, 6).map(function (m) {
        return { 席: m.hand.pos, 手札: m.hand.hole, ボード: m.hand.board, 指摘: m.d.msg, 結果BB: Math.round(m.hand.net * 10) / 10 };
      });
      var prompt = [
        'あなたはポーカー(ノーリミット・ホールデム、6人卓、100BBのキャッシュゲーム)のコーチです。',
        '生徒はルールは分かる初心者で、趣味で強くなりたい人です。以下は生徒が練習アプリでボット相手に遊んだ記録の自動分析結果です。',
        '',
        'ハンド数: ' + s.n + '、収支: ' + s.net.toFixed(1) + 'BB、判断の正確さ: ' + (s.dec.n ? Math.round(s.dec.ok / s.dec.n * 100) + '%(' + s.dec.n + '回中)' : '未計測'),
        '統計(目安: 参加率20〜30%、レイズ参加率16〜25%、3ベット率6〜12%、Cベット率50〜75%、Cベットに降りる率35〜55%、アグレッション1.8〜4、ショーダウン到達率24〜33%): ' + JSON.stringify(stats),
        '自動判定した弱点(多い順): ' + JSON.stringify(lk.slice(0, 4).map(function (l) { return { 弱点: l.title, 回数: l.count }; })),
        '間違えたハンドの例: ' + JSON.stringify(mistakes),
        '',
        '次の形で、日本語で答えてください。スマホで読むので短く、表は使わず、全体で500字以内。',
        '1. 結論(いちばん直すべき点を1〜2行)',
        '2. なぜそれが損なのか(具体的なハンド例を1つ使って、手順を分けて説明)',
        '3. 次の30ハンドで意識すること(箇条書き3つまで)',
        '4. 最後に、理解を確かめる短いクイズを1問(答えは書かない)',
        'ハンド数が少ないときは、統計は参考値だと一言添えてください。'
      ].join('\n');
      try {
        var res = await sample(prompt, { onText: function (u) { out.textContent = u.text; } });
        coachText = res.text; out.textContent = coachText;
      } catch (e) {
        out.textContent = e && e.code === 'not_granted' ? 'AIコーチの利用が許可されませんでした。上の自動分析は引き続き使えます。' :
          e && e.code === 'rate_limited' ? '今は混み合っています。少し時間をおいてもう一度押してください。' : 'AIコーチに接続できませんでした(' + (e && e.code || 'error') + ')。';
      }
      coachBusy = false; btn.disabled = false; btn.textContent = 'もう一度相談';
    }

    // ================= PERSONAL PREFLOP DRILL =================
    ui.views.drill = function () {
      ui.app.innerHTML = '<button class="back" data-go="lesson">← レッスンに戻る</button><div class="stack"><h2>あなた専用プリフロップ特訓</h2><div id="drBody" class="stack"><p class="muted">準備中…</p></div></div>';
      Promise.all([S.drillHands ? Promise.resolve(S.drillHands) : store.load(), loadEq()]).then(function (r) { drill(r[0]); });
    };
    function drill(hands) {
      var body = $('#drBody'); if (!body) return;
      var items = [];
      hands.forEach(function (h) { (h.dec || []).forEach(function (d) { if (!d.ok && (d.type === 'pf-open' || d.type === 'pf-facing')) items.push(d); }); });
      if (!items.length) { body.innerHTML = '<div class="panel"><p style="margin:0">プリフロップの間違いはまだ記録されていません。通常のプリフロップ道場で練習しましょう。</p><div style="margin-top:10px"><button class="btn gold" data-go="preflop">プリフロップ道場へ</button></div></div>'; return; }
      var D = window.PT_DATA;
      function spotOf(d) { return d.type === 'pf-open' ? { rfi: true, pos: d.pos } : D.facing.filter(function (f) { return f.id === d.spot; })[0]; }
      var stats = { n: 0, ok: 0 };
      (function q() {
        var d = items[Math.floor(Math.random() * items.length)], spot = spotOf(d);
        if (!spot) return;
        var m = ui.actionMap(spot);
        var label = Math.random() < 0.5 ? d.label : nearby(m, d.label);
        var combo = E.classCombos(label)[Math.floor(Math.random() * E.classCombos(label).length)];
        var opts = spot.rfi ? [['raise', 'オープン', 'red'], ['fold', 'フォールド', 'slate']] : [['3bet', '3ベット', 'red'], ['call', 'コール', 'blue'], ['fold', 'フォールド', 'slate']];
        body.innerHTML = '<p class="muted" style="margin:0;font-size:13px">対戦で間違えた場面(' + items.length + '件)と、その近くの手から出題します。正解 ' + stats.ok + ' / ' + stats.n + '</p>' +
          '<section class="table pop"><div class="eyebrow">' + (spot.rfi ? spot.pos + ' · 全員フォールドで回ってきた' : esc(spot.title)) + '</div>' +
          '<div class="hand" style="margin:10px 0">' + cardHTML(combo[0], 'big') + cardHTML(combo[1], 'big') + '</div><div class="num muted">' + label + '</div></section>' +
          '<div class="choices">' + opts.map(function (o) { return '<button class="btn ' + o[2] + '" data-a="' + o[0] + '">' + o[1] + '</button>'; }).join('') + '</div><div id="drFb"></div>';
        $all('[data-a]', body).forEach(function (b) {
          b.onclick = function () {
            var right = m[label], ok = b.dataset.a === right;
            stats.n++; if (ok) stats.ok++;
            $all('[data-a]', body).forEach(function (x) { x.disabled = true; if (x.dataset.a === right) x.classList.add('right'); else if (x === b) x.classList.add('wrong'); });
            ui.award('drill', ok);
            var nm = { raise: 'オープン', fold: 'フォールド', '3bet': '3ベット', call: 'コール' };
            $('#drFb').innerHTML = '<div class="fb pop ' + (ok ? 'ok' : 'ng') + '"><div class="verdict">' + (ok ? '正解!' : '残念…') + '</div><p>' + label + ' は <b>' + nm[right] + '</b>。</p>' +
              ui.chartHTML(m, label) + '<div class="row" style="margin-top:12px;justify-content:flex-end"><button class="btn gold" id="drNext">次へ →</button></div></div>';
            $('#drNext').onclick = q;
          };
        });
      })();
    }
    function nearby(m, label) {
      var idx = E.CLASS_INDEX[label], r = Math.floor(idx / 13), c = idx % 13, cand = [];
      [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(function (d) { var rr = r + d[0], cc = c + d[1]; if (rr >= 0 && rr < 13 && cc >= 0 && cc < 13) cand.push(E.gridLabel(rr, cc)); });
      return cand[Math.floor(Math.random() * cand.length)] || label;
    }

    // stop the running table when leaving the play view
    window.addEventListener('hashchange', function () { if (location.hash !== '#play') { S.token++; if (S.heroResolve) S.heroResolve({ type: 'fold' }); } });
  };
})();
