/* UI for ポーカー道場. Depends on PokerEngine (engine.js), RiverSolver (solver.js), PT_DATA (data.js). */
(function () {
  'use strict';
  var E = window.PokerEngine, D = window.PT_DATA, RS = window.RiverSolver;
  var app = document.getElementById('app');
  var SUIT_SYM = { s: '♠', h: '♥', d: '♦', c: '♣' };

  // ---------- helpers ----------
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function pct(x, d) { return (x * 100).toFixed(d == null ? 1 : d) + '%'; }
  function cardHTML(c, size) {
    var s = typeof c === 'number' ? E.cardStr(c) : c;
    var r = s[0] === 'T' ? '10' : s[0];
    return '<span class="pc ' + s[1] + ' ' + (size || '') + '"><b>' + r + '</b><i>' + SUIT_SYM[s[1]] + '</i></span>';
  }
  function cardsHTML(str, size) { return E.parseCards(str).map(function (c) { return cardHTML(c, size); }).join(''); }
  function toast(msg) {
    var t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
    document.body.appendChild(t); setTimeout(function () { t.remove(); }, 1500);
  }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function randomCombo(label) { return pick(E.classCombos(label)); }

  // ---------- progress ----------
  var KEY = 'poker-dojo-v1';
  var P = { xp: 0, streak: 0, best: 0, stats: {}, scen: {} };
  try { var saved = JSON.parse(localStorage.getItem(KEY) || 'null'); if (saved) P = Object.assign(P, saved); } catch (e) {}
  function save() { try { localStorage.setItem(KEY, JSON.stringify(P)); } catch (e) {} }
  P.skills = P.skills || {};
  // per-skill history (last 12 answers) used to detect weak areas
  function track(skill, ok) {
    var s = P.skills[skill] || (P.skills[skill] = { n: 0, ok: 0, r: [] });
    s.n++; if (ok) s.ok++; s.r.push(ok ? 1 : 0); if (s.r.length > 12) s.r.shift(); save();
  }
  var TITLES = ['ビギナー', 'ルーキー', 'レギュラー', 'グラインダー', 'シャーク', 'クラッシャー', 'ハイローラー', 'レジェンド'];
  function levelOf(xp) { return Math.floor(Math.sqrt(xp / 40)) + 1; }
  function xpFor(lv) { return 40 * (lv - 1) * (lv - 1); }
  function titleOf(lv) { return TITLES[Math.min(TITLES.length - 1, Math.floor((lv - 1) / 3))]; }
  function renderHUD() {
    var lv = levelOf(P.xp), a = xpFor(lv), b = xpFor(lv + 1);
    $('#lvBadge').textContent = 'Lv.' + lv + ' ' + titleOf(lv);
    $('#xpFill').style.width = ((P.xp - a) / (b - a) * 100) + '%';
    $('#streak').textContent = P.streak;
  }
  function award(mode, ok) {
    var before = levelOf(P.xp);
    var st = P.stats[mode] || (P.stats[mode] = { n: 0, ok: 0 });
    st.n++;
    var gain;
    if (ok) { st.ok++; P.streak++; P.best = Math.max(P.best, P.streak); gain = 10 + Math.min(P.streak - 1, 10); }
    else { P.streak = 0; gain = 2; }
    P.xp += gain; save(); renderHUD();
    var after = levelOf(P.xp);
    toast(after > before ? 'レベルアップ! Lv.' + after : '+' + gain + ' XP');
  }
  function acc(mode) { var s = P.stats[mode]; return s && s.n ? Math.round(s.ok / s.n * 100) + '% (' + s.n + '問)' : 'まだ挑戦していません'; }

  // ---------- 13x13 grid ----------
  // cellFn(label) -> {bg, on, title}
  function gridHTML(cellFn, opts) {
    opts = opts || {};
    var h = '<div class="gridwrap"><div class="grid">';
    for (var r = 0; r < 13; r++) for (var c = 0; c < 13; c++) {
      var lab = E.gridLabel(r, c), st = cellFn(lab) || {};
      h += '<button type="button" class="cell' + (st.on ? ' on' : '') + (opts.hl === lab ? ' hl' : '') + '" data-l="' + lab + '" style="' + (st.bg ? 'background:' + st.bg : '') + '" title="' + esc(E.disp(st.title || lab)) + '">' + E.disp(lab.replace(/o$|s$/, '')) + (lab.length === 3 ? '<sub>' + lab[2] + '</sub>' : '') + '</button>';
    }
    return h + '</div></div>' + (opts.noGuide ? '' : GUIDE);
  }
  var GUIDE = '<details class="guide"><summary>表の見方</summary><ul>' +
    '<li>縦と横がカードの数字(左上がA、右下が2)。1マスが「手札2枚の組み合わせ」1種類です。</li>' +
    '<li><b>斜めの線</b>はペア(例: AA)。<b>右上半分</b>は2枚が同じマーク(s=スーテッド、例: AKs)。<b>左下半分</b>は違うマーク(o=オフスーツ、例: AKo)。</li>' +
    '<li>色の付いたマスが、その行動をとる手です。色の意味は表の下の凡例を見てください。白枠で光っているマスが今の問題の手です。</li></ul></details>';
  function mixBG(freqs, colors) { // horizontal stacked gradient
    var stops = [], x = 0;
    freqs.forEach(function (f, i) { if (f <= 0.001) return; var y = x + f * 100; stops.push(colors[i] + ' ' + x.toFixed(1) + '% ' + y.toFixed(1) + '%'); x = y; });
    if (x < 99.9) stops.push('rgba(0,0,0,.35) ' + x.toFixed(1) + '% 100%');
    return 'linear-gradient(90deg,' + stops.join(',') + ')';
  }
  var COL = { raise: '#e5584f', call: '#3bb273', fold: '#66788a', threebet: '#a45ee0' };

  // ---------- router ----------
  var views = {}, ui = {};
  function go(name) { if (location.hash !== '#' + name) location.hash = name; else route(); }
  function route() {
    var name = (location.hash || '#lobby').slice(1);
    if (!views[name]) name = 'lobby';
    app.innerHTML = '';
    window.scrollTo(0, 0);
    $all('nav.rail a').forEach(function (a) { if (a.dataset.view === name || ((name === 'drill' || name === 'course') && a.dataset.view === 'lesson')) { a.setAttribute('aria-current', 'page'); a.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } else a.removeAttribute('aria-current'); });
    views[name]();
  }
  window.addEventListener('hashchange', route);
  function backBtn() { return ''; } // the tab rail replaces per-page back buttons
  app.addEventListener('click', function (e) {
    var g = e.target.closest('[data-go]');
    if (g) { e.preventDefault(); go(g.getAttribute('data-go')); }
  });

  // ================= LOBBY =================
  views.lobby = function () {
    var lv = levelOf(P.xp);
    var total = Object.keys(P.stats).reduce(function (s, k) { return s + P.stats[k].n; }, 0);
    var hand = pick(['AhKh', 'AsAd', 'QcJc', '9d9s', 'KsQs', '7h6h']);
    var modes = [
      ['play', '対戦モード', '5人のボット(格下・同等・格上)と6人卓で実戦。あなたの判断はその場で採点され、記録されます。', 'var(--red)', acc('play')],
      ['lesson', 'オーダーメイドレッスン', '対戦の記録からあなたの弱点を見つけ、専用の特訓とAIコーチのアドバイスを出します。', 'var(--gold)', '記録から分析'],
      ['preflop', 'プリフロップ道場', '手札と席を見て、オープン・3ベット・コール・フォールドを即決する練習。', 'var(--red)', acc('preflop')],
      ['odds', 'オッズ特訓', 'ポットオッズ、アウツ、MDF、コンボ数。毎回ランダムに出題し、勝率はエンジンで正確に計算。', 'var(--blue)', acc('odds')],
      ['scenario', '実戦シナリオ', 'フロップからリバーまでの典型的な12場面。理由つきで最適な行動を学ぶ。', 'var(--gold)', acc('scenario')],
      ['lab', '計算ラボ', '勝率計算・プッシュ/フォールド均衡・リバーGTOソルバー。ソルバーと同じ方法で実際に計算する。', 'var(--purple)', 'ソルバー搭載'],
      ['learn', '理論の書', 'ポジション、オッズ、レンジ、GTO、ブロッカーなど11章と用語集、参考資料。', 'var(--green)', D.theory.length + '章']
    ];
    app.innerHTML =
      '<section class="table hero pop">' +
        '<div style="text-align:left"><div class="eyebrow">今日の練習</div><h1>打って、振り返って、直す。</h1>' +
        '<p class="muted" style="margin:6px 0 0">ボットと対戦すると判断が採点され、弱点に合わせたレッスンが届きます。</p>' +
        '<div class="row" style="margin-top:12px"><button class="btn gold" data-go="play">対戦をはじめる</button><button class="btn ghost" data-go="lesson">レッスンを見る</button></div></div>' +
        '<div class="hand">' + cardsHTML(hand, 'big') + '</div>' +
      '</section>' +
      '<div class="stats" style="margin:18px 0">' +
        '<div class="stat"><div class="v">' + lv + '</div><div class="k">' + titleOf(lv) + '</div></div>' +
        '<div class="stat"><div class="v">' + total + '</div><div class="k">解いた問題</div></div>' +
        '<div class="stat"><div class="v">' + P.best + '</div><div class="k">最高連続正解</div></div>' +
      '</div>' +
      '<div class="modes">' + modes.map(function (m) {
        return '<button class="mode" data-go="' + m[0] + '"><div class="top"><i class="chip" style="--c:' + m[3] + '"></i><h3>' + m[1] + '</h3></div><p>' + m[2] + '</p><div class="meter">' + m[4] + '</div></button>';
      }).join('') + '</div>' +
      '<p class="note-box" style="margin-top:18px">おすすめの回し方: 対戦モードで30ハンド → オーダーメイドレッスンで弱点を確認 → 出された特訓をこなす → また対戦。基礎が不安なら理論の書の1〜3章から。</p>';
  };

  // ================= PREFLOP =================
  var pfMode = 'rfi';
  var RFI_POS = ['UTG', 'HJ', 'CO', 'BTN', 'SB'];
  var SEATS = ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
  function actionMap(spot) { // label -> 'raise'|'fold' or '3bet'|'call'|'fold'
    var m = {};
    if (spot.rfi) {
      var r = E.parseRange(D.rfi[spot.pos]);
      E.CLASS_LABELS.forEach(function (l) { m[l] = r[l] ? 'raise' : 'fold'; });
    } else {
      var t = E.parseRange(spot.threeBet), c = E.parseRange(spot.call);
      E.CLASS_LABELS.forEach(function (l) { m[l] = t[l] ? '3bet' : c[l] ? 'call' : 'fold'; });
    }
    return m;
  }
  function borderHands(m) {
    var out = [];
    for (var r = 0; r < 13; r++) for (var c = 0; c < 13; c++) {
      var l = E.gridLabel(r, c), a = m[l];
      var nb = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]];
      if (nb.some(function (p) { return p[0] >= 0 && p[0] < 13 && p[1] >= 0 && p[1] < 13 && m[E.gridLabel(p[0], p[1])] !== a; })) out.push(l);
    }
    return out;
  }
  function weightedClass() { // by combo count
    var x = Math.random() * 1326;
    for (var i = 0; i < 169; i++) { x -= E.classSize(E.CLASS_LABELS[i]); if (x <= 0) return E.CLASS_LABELS[i]; }
    return '72o';
  }
  function handNote(cls) { // one-line description of why this kind of hand is good or bad
    var R = E.RANKS, hi = cls[0], lo = cls[1], suited = cls[2] === 's', pair = cls.length === 2;
    var gap = R.indexOf(hi) - R.indexOf(lo);
    if (pair) return R.indexOf(hi) >= 8 ? '高いペアはそのままでも強い手です。' : '小さいペアは、フロップでスリーカードになれば大きく勝てる手です(約12%)。';
    if (hi === 'A' && suited) return R.indexOf(lo) <= 3 ? 'A5s〜A2sはストレートやAハイのフラッシュになれるうえ、Aを1枚持つことで相手のAAやAKを減らせます。' : 'Aのスーテッドは、最強のフラッシュ(Aハイ)を作れるのが強みです。';
    if (hi === 'A') return 'Aのオフスーツは、ペアになってもキッカー(もう1枚)の差で負けやすいので、弱いものは早い席では外します。';
    if (suited && gap <= 2) return 'スーテッドのつながった手は、フラッシュとストレートの両方を狙えて、当たると大きく勝てます。';
    if (suited) return 'スーテッドは、フラッシュの分だけオフスーツより価値が上がります(勝率で約3%)。';
    if (R.indexOf(lo) >= 8) return '絵札同士のオフスーツは、ペアになったときに強いのでレンジに入りやすい手です。';
    return 'つながりもマークの一致もないオフスーツは、ペアになっても勝ちきれないことが多い手です。';
  }
  function chartHTML(m, hl) {
    var colors = { raise: COL.raise, '3bet': COL.threebet, call: COL.call, fold: 'rgba(0,0,0,.35)' };
    return gridHTML(function (l) { return { bg: colors[m[l]], on: m[l] !== 'fold' }; }, { hl: hl });
  }
  views.preflop = function () {
    app.innerHTML = backBtn() +
      '<div class="stack"><div class="row" style="justify-content:space-between"><h2>プリフロップ道場</h2><span class="muted num">正答率 ' + acc('preflop') + '</span></div>' +
      '<div class="tabs" role="tablist">' +
        '<button class="tab" role="tab" data-m="rfi" aria-selected="' + (pfMode === 'rfi') + '">オープン判断</button>' +
        '<button class="tab" role="tab" data-m="facing" aria-selected="' + (pfMode === 'facing') + '">オープンされた時</button>' +
        '<button class="tab" role="tab" data-m="charts" aria-selected="' + (pfMode === 'charts') + '">レンジ表を見る</button>' +
      '</div><div id="pfBody" class="stack"></div></div>';
    $all('.tab', app).forEach(function (b) { b.onclick = function () { pfMode = b.dataset.m; views.preflop(); }; });
    if (pfMode === 'charts') return pfCharts();
    pfQuestion();
  };
  function pfQuestion() {
    var body = $('#pfBody');
    var spot;
    if (pfMode === 'rfi') { var pos = pick(RFI_POS); spot = { rfi: true, pos: pos, hero: pos }; }
    else spot = pick(D.facing);
    var m = actionMap(spot);
    var label = Math.random() < 0.55 ? pick(borderHands(m)) : weightedClass();
    var combo = randomCombo(label);
    var heroSeat = spot.rfi ? spot.pos : spot.hero;
    var hi = SEATS.indexOf(heroSeat), vi = spot.rfi ? -1 : SEATS.indexOf(spot.villain);
    var seats = SEATS.map(function (s, i) {
      var cls = i === hi ? 'me' : i === vi ? 'opp' : (spot.rfi ? i < hi : (i < hi && i !== vi)) ? 'out' : '';
      return '<span class="seat ' + cls + '">' + s + '</span>';
    }).join('');
    var story = spot.rfi ? 'あなたは <b>' + spot.pos + '</b>。前の人は全員フォールド。2.5BBでオープンする?' : spot.text;
    var opts = spot.rfi ? [['raise', 'オープン', 'red'], ['fold', 'フォールド', 'slate']] : [['3bet', '3ベット', 'red'], ['call', 'コール', 'blue'], ['fold', 'フォールド', 'slate']];
    body.innerHTML =
      '<section class="table pop"><div class="seats">' + seats + '</div>' +
      '<div class="hand" style="margin:10px 0">' + cardHTML(combo[0], 'big') + cardHTML(combo[1], 'big') + '</div>' +
      '<div class="num muted" style="font-size:13px">' + E.disp(label) + (spot.rfi ? '' : ' · ' + spot.title) + '</div></section>' +
      '<p style="margin:0">' + story + '</p>' +
      '<div class="choices">' + opts.map(function (o) { return '<button class="btn ' + o[2] + '" data-a="' + o[0] + '">' + o[1] + '</button>'; }).join('') + '</div>' +
      '<div id="pfFb"></div>';
    $all('[data-a]', body).forEach(function (b) {
      b.onclick = function () {
        var ans = b.dataset.a, right = m[label], ok = ans === right;
        track(spot.rfi ? 'rfi' : 'facing', ok);
        $all('[data-a]', body).forEach(function (x) { x.disabled = true; if (x.dataset.a === right) x.classList.add('right'); else if (x === b) x.classList.add('wrong'); });
        award('preflop', ok);
        var names = { raise: 'オープン', fold: 'フォールド', '3bet': '3ベット', call: 'コール' };
        var range = spot.rfi ? E.parseRange(D.rfi[spot.pos]) : null;
        var note = spot.rfi ? D.rfiNote[spot.pos] + ' (この席のオープン率 約' + E.rangePercent(range).toFixed(0) + '%)' : spot.note;
        var legend = spot.rfi ? '<span style="--c:' + COL.raise + '">オープン</span><span style="--c:rgba(0,0,0,.5)">フォールド</span>' :
          '<span style="--c:' + COL.threebet + '">3ベット</span><span style="--c:' + COL.call + '">コール</span><span style="--c:rgba(0,0,0,.5)">フォールド</span>';
        $('#pfFb').innerHTML = '<div class="fb pop ' + (ok ? 'ok' : 'ng') + '"><div class="verdict">' + (ok ? '正解!' : '残念…') + '</div>' +
          '<p><b>' + E.disp(label) + '</b> は <b>' + names[right] + '</b> が基本です。</p><p>' + handNote(label) + '</p><p class="muted">' + esc(note) + '</p>' +
          chartHTML(m, label) + '<div class="legend">' + legend + '</div>' +
          '<div class="row" style="margin-top:12px;justify-content:flex-end"><button class="btn gold" id="pfNext">次の問題 →</button></div></div>';
        $('#pfNext').onclick = pfQuestion;
        $('#pfNext').focus({ preventScroll: true });
      };
    });
  }
  function pfCharts() {
    var body = $('#pfBody');
    var spots = RFI_POS.map(function (p) { return { key: 'rfi-' + p, name: p + ' オープン', spot: { rfi: true, pos: p } }; })
      .concat(D.facing.map(function (f) { return { key: f.id, name: f.title, spot: f }; }));
    body.innerHTML = '<label class="f">表を選ぶ<select id="chartSel">' + spots.map(function (s, i) { return '<option value="' + i + '">' + s.name + '</option>'; }).join('') + '</select></label><div id="chartOut"></div>';
    function draw() {
      var s = spots[+$('#chartSel').value], m = actionMap(s.spot);
      var cnt = { raise: 0, '3bet': 0, call: 0 };
      E.CLASS_LABELS.forEach(function (l) { if (cnt[m[l]] != null) cnt[m[l]] += E.classSize(l); });
      var info = s.spot.rfi ? 'オープン ' + (cnt.raise / 13.26).toFixed(1) + '%' : '3ベット ' + (cnt['3bet'] / 13.26).toFixed(1) + '% · コール ' + (cnt.call / 13.26).toFixed(1) + '%';
      $('#chartOut').innerHTML = '<div class="panel stack"><div class="num" style="text-align:center">' + info + '</div>' + chartHTML(m) +
        '<div class="legend"><span style="--c:' + COL.raise + '">オープン</span><span style="--c:' + COL.threebet + '">3ベット</span><span style="--c:' + COL.call + '">コール</span></div>' +
        '<p class="muted" style="margin:0;font-size:13px">' + esc(s.spot.rfi ? D.rfiNote[s.spot.pos] : s.spot.note) + '</p>' +
        '<p class="muted" style="margin:0;font-size:12px">右上(s)はスーテッド、左下(o)はオフスーツ、対角線はペア。</p></div>';
    }
    $('#chartSel').onchange = draw; draw();
  }

  // ================= ODDS =================
  var ODDS_GEN = [genPotOdds, genMDF, genOuts, genCallFold, genCombos];
  views.odds = function () {
    var oa = ui.courseAreas ? ui.courseAreas(null).filter(function (a) { return a.area === 'odds'; })[0] : null;
    app.innerHTML = backBtn() + '<div class="stack"><div class="row" style="justify-content:space-between"><h2>オッズ特訓</h2><span class="muted num">正答率 ' + acc('odds') + '</span></div>' +
      (oa && oa.weak && !oa.done ? ui.courseCard(oa) : '<p class="muted" style="margin:0;font-size:13px">計算が不安なら <button class="linkbtn" data-course="odds">オッズの基礎コース</button> から。</p>') +
      '<div id="oddsBody" class="stack"></div></div>';
    if (ui.bindCourseButtons) ui.bindCourseButtons(app);
    oddsQuestion();
  };
  function oddsQuestion() {
    var q = pick(ODDS_GEN)();
    var body = $('#oddsBody');
    body.innerHTML = '<section class="table pop">' + q.table + '</section><p style="margin:0">' + q.q + '</p>' +
      '<div class="choices">' + q.options.map(function (o, i) { return '<button class="btn" data-i="' + i + '">' + o + '</button>'; }).join('') + '</div><div id="oFb"></div>';
    $all('[data-i]', body).forEach(function (b) {
      b.onclick = function () {
        var i = +b.dataset.i, ok = i === q.answer;
        $all('[data-i]', body).forEach(function (x) { x.disabled = true; if (+x.dataset.i === q.answer) x.classList.add('right'); else if (x === b) x.classList.add('wrong'); });
        award('odds', ok); if (q.skill) track(q.skill, ok);
        var area = ui.courseAreas ? ui.courseAreas(null).filter(function (a) { return a.area === 'odds'; })[0] : null;
        var basics = !ok && area && !area.done && q.skill !== 'combos' ? '<div class="hint" style="margin-top:8px">計算の流れがあやふやなら、<button class="linkbtn" data-course="odds">オッズの基礎コース</button>で「ポットってなに?」から確認できます。</div>' : '';
        $('#oFb').innerHTML = '<div class="fb pop ' + (ok ? 'ok' : 'ng') + '"><div class="verdict">' + (ok ? '正解!' : '残念…') + '</div>' + q.explain + basics +
          '<div class="row" style="margin-top:12px;justify-content:flex-end"><button class="btn gold" id="oNext">次の問題 →</button></div></div>';
        $('#oNext').onclick = oddsQuestion;
        if (ui.bindCourseButtons) ui.bindCourseButtons($('#oFb'));
      };
    });
  }
  function mcOptions(correct, distract, fmt) {
    var seen = {}, list = [];
    [correct].concat(distract).forEach(function (v) { var k = fmt(v); if (!seen[k] && list.length < 4) { seen[k] = 1; list.push(v); } });
    var shuffled = shuffle(list);
    return { options: shuffled.map(fmt), answer: shuffled.indexOf(correct) };
  }
  function potTable(pot, bet) {
    return '<div class="eyebrow">ポットオッズ</div><div style="margin-top:8px"><span class="pot">ポット ' + pot + 'BB</span></div>' +
      '<div style="margin-top:10px;font-family:var(--font-display);font-size:20px">相手のベット <span style="color:var(--gold)">' + bet + 'BB</span></div>';
  }
  function genPotOdds() {
    var pot = pick([6, 10, 12, 20, 24, 30, 40, 60, 80, 100]), f = pick([0.25, 0.33, 0.5, 0.66, 0.75, 1, 1.5, 2]);
    var bet = Math.max(1, Math.round(pot * f));
    var need = bet / (pot + 2 * bet);
    var o = mcOptions(need, [bet / pot, bet / (pot + bet), (pot + bet) / (pot + 2 * bet) - 0.5, need + 0.08, need - 0.07].filter(function (x) { return x > 0.02 && x < 0.95; }), function (x) { return pct(x, 0); });
    return { skill: 'potodds', table: potTable(pot, bet), q: 'コールするのに必要な勝率は?', options: o.options, answer: o.answer,
      explain: '<div class="formula">必要勝率 = コール額 ÷ (ポット + ベット + コール額)<br>= ' + bet + ' ÷ (' + pot + ' + ' + bet + ' + ' + bet + ') = ' + pct(need) + '</div><p class="muted">ベットが大きいほど必要勝率は上がりますが、ポットサイズでも33%、2倍のベットでも40%までしか上がりません。</p>' };
  }
  function genMDF() {
    var pot = pick([10, 20, 30, 40, 60, 100]), f = pick([0.25, 0.33, 0.5, 0.75, 1, 1.5]);
    var bet = Math.max(1, Math.round(pot * f));
    var mdf = pot / (pot + bet);
    var o = mcOptions(mdf, [bet / (pot + 2 * bet), 1 - bet / (pot + 2 * bet) - 0.1, mdf - 0.15, mdf + 0.12, 0.5].filter(function (x) { return x > 0.05 && x < 0.98; }), function (x) { return pct(x, 0); });
    return { skill: 'mdf', table: potTable(pot, bet), q: 'ブラフで食われないために、最低どれくらいの割合でコール(以上)すべき? (MDF)', options: o.options, answer: o.answer,
      explain: '<div class="formula">MDF = ポット ÷ (ポット + ベット) = ' + pot + ' ÷ ' + (pot + bet) + ' = ' + pct(mdf) + '</div><p class="muted">相手が何も持たずにベットしたとき、利益が出なくなる最低ラインです。これより多く降りると、どんな2枚でもブラフするだけで相手が得をします。ただし実際の相手がブラフ不足なら、もっと降りるのが正解になります(エクスプロイト)。</p>' };
  }
  function dealDistinct(n) {
    var deck = shuffle(Array.from({ length: 52 }, function (_, i) { return i; }));
    return deck.slice(0, n);
  }
  function scoreOf(hole, board) { return E.evaluate(hole.concat(board)); }
  function genOutsDeal() {
    for (var t = 0; t < 400; t++) {
      var street = Math.random() < 0.5 ? 3 : 4;
      var d = dealDistinct(4 + street), hero = d.slice(0, 2), vil = d.slice(2, 4), board = d.slice(4);
      if (scoreOf(hero, board) >= scoreOf(vil, board)) continue;
      var outs = E.outs(hero, vil, board);
      if (outs.length >= 2 && outs.length <= 18) return { hero: hero, vil: vil, board: board, outs: outs, street: street };
    }
    return null;
  }
  function dealTable(x, extra) {
    return '<div class="eyebrow">' + (x.street === 3 ? 'フロップ' : 'ターン') + '</div>' +
      '<div class="row" style="justify-content:center;gap:18px;margin-top:6px"><div><div class="muted" style="font-size:12px">あなた</div><div class="hand">' + x.hero.map(function (c) { return cardHTML(c); }).join('') + '</div></div>' +
      '<div><div class="muted" style="font-size:12px">相手(公開)</div><div class="hand">' + x.vil.map(function (c) { return cardHTML(c); }).join('') + '</div></div></div>' +
      '<div class="board">' + x.board.map(function (c) { return cardHTML(c); }).join('') + '</div>' + (extra || '');
  }
  function catName(hole, board) { return E.CAT_NAMES[E.category(scoreOf(hole, board))]; }
  function genOuts() {
    var x = genOutsDeal(); if (!x) return genPotOdds();
    var n = x.outs.length;
    var o = mcOptions(n, [n + 2, n - 2, n + 4, n - 3, n + 1].filter(function (v) { return v > 0; }), function (v) { return v + '枚'; });
    var eqExact = E.equity([[{ c1: x.hero[0], c2: x.hero[1], w: 1 }], [{ c1: x.vil[0], c2: x.vil[1], w: 1 }]], x.board, []).equity[0];
    var rule = x.street === 3 ? n * 4 : n * 2;
    var left = 52 - 4 - x.board.length;
    return { skill: 'outs', table: dealTable(x), q: '次の1枚で、あなたが<b>逆転して単独で勝ちになる</b>カード(アウツ)は何枚?', options: o.options, answer: o.answer,
      explain: '<p>今はあなたが <b>' + catName(x.hero, x.board) + '</b>、相手が <b>' + catName(x.vil, x.board) + '</b>。</p>' +
        '<p>アウツ ' + n + '枚: </p><div class="board" style="justify-content:flex-start;min-height:0">' + x.outs.map(function (c) { return cardHTML(c, 'sm'); }).join('') + '</div>' +
        '<div class="formula">次の1枚で当たる確率 = ' + n + ' ÷ ' + left + ' = ' + pct(n / left) + '<br>' + (x.street === 3 ? '4の法則(2枚見られる) ≒ ' + n + '×4 = ' + Math.min(rule, 100) + '%' : '2の法則 ≒ ' + n + '×2 = ' + rule + '%') + '<br>エンジンの正確な勝率(引き分け込み): ' + pct(eqExact) + '</div>' +
        '<p class="muted">アウツを数えるときは、引いても相手がもっと強くなるカード(例: 相手のフルハウスを作るカード)を除きます。</p>' };
  }
  function genCallFold() {
    for (var t = 0; t < 300; t++) {
      var d = dealDistinct(8), hero = d.slice(0, 2), vil = d.slice(2, 4), board = d.slice(4);
      if (scoreOf(hero, board) >= scoreOf(vil, board)) continue;
      var eq = E.equity([[{ c1: hero[0], c2: hero[1], w: 1 }], [{ c1: vil[0], c2: vil[1], w: 1 }]], board, []).equity[0];
      if (eq < 0.06) continue;
      var pot = pick([10, 20, 30, 40, 60]), f = pick([0.25, 0.33, 0.5, 0.75, 1]), bet = Math.round(pot * f), need = bet / (pot + 2 * bet);
      if (Math.abs(eq - need) < 0.04) continue;
      var x = { hero: hero, vil: vil, board: board, street: 4 };
      var call = eq > need;
      var ev = eq * (pot + bet) - (1 - eq) * bet;
      return { skill: 'callfold', table: dealTable(x, '<span class="pot">ポット ' + pot + 'BB · 相手のベット ' + bet + 'BB</span>'),
        q: '相手の手は見えている前提。リバーは1枚。コールとフォールド、得なのは?', options: ['フォールド', 'コール'], answer: call ? 1 : 0,
        explain: '<div class="formula">あなたの勝率(全' + (52 - 8) + '通りを計算) = ' + pct(eq) + '<br>必要勝率 = ' + bet + ' ÷ ' + (pot + 2 * bet) + ' = ' + pct(need) + '<br>コールの期待値 = ' + pct(eq, 1) + '×' + (pot + bet) + ' − ' + pct(1 - eq, 1) + '×' + bet + ' = ' + (ev >= 0 ? '+' : '') + ev.toFixed(1) + 'BB</div>' +
          '<p class="muted">勝率が必要勝率を上回ればコール、下回ればフォールド。実戦では相手の手は見えないので、相手のレンジ全体に対する勝率で考えます。</p>' };
    }
    return genPotOdds();
  }
  function genCombos() {
    var kinds = [
      function () { var r = pick('AKQJT98765432'.split('')); return r + r; },
      function () { var a = pick(['AK', 'AQ', 'KQ', 'QJ', 'JT', 'A5']); return a + pick(['s', 'o', '']); }
    ];
    var lab = pick(kinds)();
    var labs = lab.length === 2 && lab[0] !== lab[1] ? [lab + 's', lab + 'o'] : [lab];
    var range = {}; labs.forEach(function (l) { range[l] = 1; });
    var blocker = Math.random() < 0.65;
    var dead = [];
    if (blocker) { var r0 = lab[0]; dead = [E.card(r0 + pick(['h', 's', 'd', 'c']))]; }
    var n = E.rangeCombos(range, dead).length;
    var dl = E.disp(lab);
    var name = lab.length === 2 && lab[0] === lab[1] ? dl + '(ポケットペア)' : lab.length === 3 ? dl + (lab[2] === 's' ? '(スーテッド)' : '(オフスーツ)') : dl + '(スーテッド+オフスーツ)';
    var o = mcOptions(n, [n + 3, n - 3, n + 6, Math.max(1, n - 4), n * 2].filter(function (v) { return v > 0; }), function (v) { return v + '通り'; });
    return { skill: 'combos', table: '<div class="eyebrow">コンボ数</div><div style="font-family:var(--font-display);font-size:26px;margin-top:6px">' + name + '</div>' +
        (blocker ? '<div class="board">' + cardHTML(dead[0]) + '<span class="muted" style="font-size:13px">がボードに見えている</span></div>' : ''),
      q: '相手が持ちうる組み合わせは何通り?', options: o.options, answer: o.answer,
      explain: '<div class="formula">ペア6通り · スーテッド4通り · オフスーツ12通り</div>' +
        (blocker ? '<p>ボードに ' + E.disp(E.cardStr(dead[0])) + ' が1枚あるので、そのカードを含む組み合わせが消えます(カードリムーバル)。答えは <b>' + n + '通り</b>。</p>' : '<p>答えは <b>' + n + '通り</b>。</p>') +
        '<p class="muted">相手の「強い手」と「ブラフ」が何通りずつあるかを数えるのが、レンジで考える第一歩です。</p>' };
  }

  // ================= SCENARIOS =================
  views.scenario = function () {
    var done = D.scenarios.filter(function (s) { return P.scen[s.id]; }).length;
    app.innerHTML = backBtn() + '<div class="stack"><div class="row" style="justify-content:space-between"><h2>実戦シナリオ</h2><span class="muted num">クリア ' + done + ' / ' + D.scenarios.length + '</span></div>' +
      '<div class="slist">' + D.scenarios.map(function (s, i) {
        return '<button class="sitem" data-s="' + i + '"><span class="tag">' + s.street + ' · ' + s.tag + '</span><b>' + s.title + '</b><span class="row" style="gap:4px">' + cardsHTML(s.hero, 'sm') + '</span>' + (P.scen[s.id] ? '<span class="done">クリア済み</span>' : '') + '</button>';
      }).join('') + '</div></div>';
    $all('[data-s]', app).forEach(function (b) { b.onclick = function () { scenarioQ(+b.dataset.s); }; });
  };
  function scenarioQ(i) {
    var s = D.scenarios[i];
    app.innerHTML = '<button class="back" id="scBack">← シナリオ一覧</button><div class="stack">' +
      '<div class="row" style="justify-content:space-between"><span class="eyebrow">' + s.street + ' · ' + s.tag + '</span><span class="muted num">' + (i + 1) + ' / ' + D.scenarios.length + '</span></div><h2>' + s.title + '</h2>' +
      '<section class="table pop"><div class="seats"><span class="seat me">あなた ' + s.pos + '</span><span class="seat opp">相手 ' + s.villainPos + '</span></div>' +
      '<div class="board">' + (s.board ? cardsHTML(s.board) : '<span class="muted">プリフロップ</span>') + '</div>' +
      '<span class="pot">ポット ' + s.pot + 'BB · 残りスタック ' + s.stack + 'BB</span>' +
      '<div class="hand" style="margin-top:12px">' + cardsHTML(s.hero, 'big') + '</div></section>' +
      '<p style="margin:0">' + esc(s.story) + '</p>' +
      '<div class="choices">' + s.options.map(function (o, k) { return '<button class="btn" data-k="' + k + '">' + o + '</button>'; }).join('') + '</div><div id="scFb"></div></div>';
    $('#scBack').onclick = views.scenario;
    $all('[data-k]', app).forEach(function (b) {
      b.onclick = function () {
        var k = +b.dataset.k, ok = k === s.answer;
        $all('[data-k]', app).forEach(function (x) { x.disabled = true; if (+x.dataset.k === s.answer) x.classList.add('right'); else if (x === b) x.classList.add('wrong'); });
        award('scenario', ok);
        if (ok) { P.scen[s.id] = 1; save(); }
        var calc = '';
        if (s.villainAssume && s.villainAssume !== 'range') {
          var h = E.parseCards(s.hero), v = E.parseCards(s.villainAssume), b0 = E.parseCards(s.board);
          var r = E.equity([[{ c1: h[0], c2: h[1], w: 1 }], [{ c1: v[0], c2: v[1], w: 1 }]], b0, []);
          calc = '<div class="formula">エンジン計算: 相手を ' + s.villainAssume + ' とした場合のあなたの勝率 = ' + pct(r.equity[0]) + '</div>';
        }
        var lab = s.lab ? '<button class="btn blue" id="scLab">計算ラボでGTOを確認</button>' : '';
        $('#scFb').innerHTML = '<div class="fb pop ' + (ok ? 'ok' : 'ng') + '"><div class="verdict">' + (ok ? '正解!' : '残念…') + '</div><p>答え: <b>' + s.options[s.answer] + '</b></p><p>' + esc(s.explain) + '</p>' + calc +
          '<div class="row" style="margin-top:12px;justify-content:flex-end">' + lab + (i + 1 < D.scenarios.length ? '<button class="btn gold" id="scNext">次のシナリオ →</button>' : '<button class="btn gold" id="scNext">一覧に戻る</button>') + '</div></div>';
        $('#scNext').onclick = function () { if (i + 1 < D.scenarios.length) scenarioQ(i + 1); else views.scenario(); };
        if (s.lab) $('#scLab').onclick = function () { labTab = 'river'; riverPreset = 2; go('lab'); };
      };
    });
  }

  // ================= LEARN =================
  var learnTab = 'theory', learnOpen = null;
  views.learn = function () {
    app.innerHTML = backBtn() + '<div class="stack"><h2>理論の書</h2><div class="tabs">' +
      [['theory', '理論'], ['glossary', '用語集'], ['sources', '参考資料']].map(function (t) { return '<button class="tab" data-t="' + t[0] + '" aria-selected="' + (learnTab === t[0]) + '">' + t[1] + '</button>'; }).join('') +
      '</div><div id="lBody" class="stack"></div></div>';
    $all('[data-t]', app).forEach(function (b) { b.onclick = function () { learnTab = b.dataset.t; views.learn(); }; });
    var body = $('#lBody');
    if (learnTab === 'theory') {
      body.innerHTML = D.theory.map(function (t, i) {
        return '<details class="ch"' + ((learnOpen ? t.id === learnOpen : i === 0) ? ' open id="openCh"' : '') + '><summary><span class="lvl">' + t.level + '</span><span>' + (i + 1) + '. ' + t.title + '</span></summary><div class="prose">' + t.body.join('') + '</div></details>';
      }).join('');
      if (learnOpen && $('#openCh')) { $('#openCh').scrollIntoView({ block: 'start' }); learnOpen = null; }
    } else if (learnTab === 'glossary') {
      body.innerHTML = '<div class="panel"><dl class="gl">' + D.glossary.map(function (g) { return '<dt>' + esc(g[0]) + '</dt><dd>' + esc(g[1]) + '</dd>'; }).join('') + '</dl></div>';
    } else {
      body.innerHTML = D.sources.map(function (g) {
        return '<div class="panel"><h3 style="margin-bottom:10px">' + esc(g.group) + '</h3><ul class="src" style="margin:0;padding-left:18px">' + g.items.map(function (it) {
          return '<li>' + (it[1] ? '<a href="' + esc(it[1]) + '" target="_blank" rel="noopener">' + esc(it[0]) + '</a>' : '<b>' + esc(it[0]) + '</b>') + '<span class="note">' + esc(it[2]) + '</span></li>';
        }).join('') + '</ul></div>';
      }).join('') + '<p class="note-box">プリフロップ表は上の資料などで公開されている一般的な数値(UTG約15〜18%、BTN約40〜45%)に合わせた簡易版です。有料ソルバーの出力をそのまま写したものではありません。</p>';
    }
  };

  // ================= LAB =================
  var labTab = 'equity', riverPreset = 0;
  views.lab = function () {
    app.innerHTML = backBtn() + '<div class="stack"><h2>計算ラボ</h2><div class="tabs">' +
      [['equity', '勝率計算'], ['pushfold', 'プッシュ/フォールド'], ['river', 'リバーGTO']].map(function (t) { return '<button class="tab" data-t="' + t[0] + '" aria-selected="' + (labTab === t[0]) + '">' + t[1] + '</button>'; }).join('') +
      '</div><div id="labBody" class="stack"></div></div>';
    $all('[data-t]', app).forEach(function (b) { b.onclick = function () { labTab = b.dataset.t; views.lab(); }; });
    ({ equity: labEquity, pushfold: labPushFold, river: labRiver })[labTab]();
  };

  // ---- range editor modal ----
  var PRESETS = [['UTGオープン', D.rfi.UTG], ['HJオープン', D.rfi.HJ], ['COオープン', D.rfi.CO], ['BTNオープン', D.rfi.BTN], ['SBオープン', D.rfi.SB],
    ['BB vs BTN コール', D.facing[0].call], ['BB vs BTN 3ベット', D.facing[0].threeBet], ['プレミアム (QQ+,AK)', 'QQ+,AK'], ['全ての手', '22+,A2+,K2+,Q2+,J2+,T2+,92+,82+,72+,62+,52+,42+,32']];
  function rangeEditor(initial, onDone) {
    var r = {};
    try { r = E.parseRange(initial); } catch (e) { r = {}; }
    var modal = document.createElement('div'); modal.className = 'modal';
    modal.innerHTML = '<div class="sheet stack" role="dialog" aria-label="レンジを選ぶ"><div class="row" style="justify-content:space-between"><h3>レンジを選ぶ</h3><span class="num" id="rePct"></span></div>' +
      '<label class="f">プリセット<select id="rePre"><option value="">選んでください</option>' + PRESETS.map(function (p, i) { return '<option value="' + i + '">' + p[0] + '</option>'; }).join('') + '</select></label>' +
      '<div id="reGrid"></div><p class="muted" style="margin:0;font-size:12px">マスをタップで出し入れ。なぞると連続で塗れます。</p>' +
      '<div class="row" style="justify-content:flex-end"><button class="btn ghost small" id="reClr">クリア</button><button class="btn ghost small" id="reCancel">やめる</button><button class="btn gold" id="reOk">決定</button></div></div>';
    document.body.appendChild(modal);
    function draw() {
      $('#reGrid', modal).innerHTML = gridHTML(function (l) { var w = r[l] || 0; return { on: w > 0, bg: w > 0 ? 'rgba(242,193,78,' + (0.35 + 0.65 * w) + ')' : '' }; });
      $('#rePct', modal).textContent = E.rangePercent(r).toFixed(1) + '%';
    }
    draw();
    var painting = null;
    function cellAt(e) { var t = document.elementFromPoint(e.clientX, e.clientY); return t && t.closest && t.closest('.cell'); }
    var g = $('#reGrid', modal);
    g.addEventListener('pointerdown', function (e) {
      var c = cellAt(e); if (!c) return; e.preventDefault();
      var l = c.dataset.l; painting = r[l] ? 0 : 1; if (painting) r[l] = 1; else delete r[l]; draw();
    });
    g.addEventListener('pointermove', function (e) {
      if (painting === null) return; var c = cellAt(e); if (!c) return; var l = c.dataset.l;
      if (painting && !r[l]) { r[l] = 1; draw(); } else if (!painting && r[l]) { delete r[l]; draw(); }
    });
    g.style.touchAction = 'none';
    window.addEventListener('pointerup', function up() { painting = null; });
    $('#rePre', modal).onchange = function () { var p = PRESETS[+this.value]; if (p) { r = E.parseRange(p[1]); draw(); } };
    $('#reClr', modal).onclick = function () { r = {}; draw(); };
    $('#reCancel', modal).onclick = function () { modal.remove(); };
    $('#reOk', modal).onclick = function () { modal.remove(); onDone(E.disp(E.rangeToString(r))); };
  }

  // ---- equity calculator ----
  var eqState = { players: ['AhKh', 'QQ+,AKs,AKo'], board: '' };
  // ---- tap-to-tapSel calculator (default) ----
  var eqMode = 'tap';
  var tapSel = { hero: [E.card('Ah'), E.card('Kh')], vill: [E.card('Qs'), E.card('Qd')], board: [null, null, null, null, null], active: ['board', 0], vmode: 'hand' };
  var VMODES = [['hand', '特定の2枚'], ['random', 'ランダムな手'], ['UTG', 'UTGのオープンレンジ'], ['HJ', 'HJのオープンレンジ'], ['CO', 'COのオープンレンジ'], ['BTN', 'BTNのオープンレンジ'], ['SB', 'SBのオープンレンジ']];
  function labEquity() {
    var body = $('#labBody');
    body.innerHTML = '<div class="tabs"><button class="tab" data-em="tap" aria-selected="' + (eqMode === 'tap') + '">タップで選ぶ</button><button class="tab" data-em="text" aria-selected="' + (eqMode === 'text') + '">文字・レンジで入力</button></div><div id="eqWrap" class="stack"></div>';
    $all('[data-em]', body).forEach(function (b) { b.onclick = function () { eqMode = b.dataset.em; labEquity(); }; });
    if (eqMode === 'tap') labEquityTap(); else labEquityText();
  }
  function labEquityTap() {
    var wrap = $('#eqWrap');
    wrap.innerHTML = '<div class="panel stack"><p class="muted" style="margin:0;font-size:13px">枠をタップしてから、下のカードを選びます。埋まった枠をタップすると外せます。ボードは空(プリフロップ)か3〜5枚。</p>' +
      '<div class="slotrow"><span class="lbl">自分</span><div class="hand" id="slHero"></div></div>' +
      '<div class="slotrow"><span class="lbl">相手</span><div class="stack" style="gap:8px"><select id="slMode">' + VMODES.map(function (m) { return '<option value="' + m[0] + '"' + (tapSel.vmode === m[0] ? ' selected' : '') + '>' + m[1] + '</option>'; }).join('') + '</select><div class="hand" id="slVill"></div></div></div>' +
      '<div class="slotrow"><span class="lbl">ボード</span><div class="hand" id="slBoard" style="flex-wrap:wrap"></div></div>' +
      '<div class="picker" id="picker"></div>' +
      '<div class="row"><button class="btn ghost" id="eqClear">全部クリア</button><button class="btn gold" id="eqRun">計算する</button><span class="muted num" id="eqInfo"></span></div><div class="progress" hidden id="eqProg"><i></i></div></div><div id="eqOut"></div>';
    function used() { return tapSel.hero.concat(tapSel.vmode === 'hand' ? tapSel.vill : [], tapSel.board).filter(function (c) { return c != null; }); }
    function nextEmpty() {
      var order = [['hero', 2]].concat(tapSel.vmode === 'hand' ? [['vill', 2]] : [], [['board', 5]]);
      for (var k = 0; k < order.length; k++) for (var i = 0; i < order[k][1]; i++) if (tapSel[order[k][0]][i] == null) return [order[k][0], i];
      return null;
    }
    function slots() {
      [['hero', 'slHero'], ['vill', 'slVill'], ['board', 'slBoard']].forEach(function (x) {
        var el = $('#' + x[1]);
        if (x[0] === 'vill' && tapSel.vmode !== 'hand') { el.innerHTML = ''; return; }
        el.innerHTML = tapSel[x[0]].map(function (c, i) {
          var act = tapSel.active && tapSel.active[0] === x[0] && tapSel.active[1] === i;
          return '<button type="button" class="slot' + (act ? ' active' : '') + '" data-sl="' + x[0] + ':' + i + '" aria-label="' + (c == null ? '空き枠' : E.disp(E.cardStr(c))) + '">' + (c == null ? '<span class="pc sm empty">+</span>' : cardHTML(c, 'sm')) + '</button>';
        }).join('');
      });
      $all('[data-sl]', wrap).forEach(function (b) { b.onclick = function () {
        var a = b.dataset.sl.split(':'), k = a[0], i = +a[1];
        if (tapSel[k][i] != null) tapSel[k][i] = null;
        tapSel.active = [k, i]; slots(); picker();
      }; });
    }
    function picker() {
      var u = {}; used().forEach(function (c) { u[c] = 1; });
      var h = '';
      for (var s = 0; s < 4; s++) for (var r = 12; r >= 0; r--) {
        var c = (r << 2) | [3, 2, 1, 0][s], str = E.cardStr(c);
        h += '<button type="button" class="pk ' + str[1] + '" data-pk="' + c + '"' + (u[c] ? ' disabled' : '') + '>' + (str[0] === 'T' ? '10' : str[0]) + '<br>' + SUIT_SYM[str[1]] + '</button>';
      }
      $('#picker').innerHTML = h;
      $all('[data-pk]', wrap).forEach(function (b) { b.onclick = function () {
        if (!tapSel.active) tapSel.active = nextEmpty();
        if (!tapSel.active) return;
        tapSel[tapSel.active[0]][tapSel.active[1]] = +b.dataset.pk;
        tapSel.active = nextEmpty(); slots(); picker();
      }; });
    }
    slots(); picker();
    $('#slMode').onchange = function () { tapSel.vmode = this.value; if (tapSel.active && tapSel.active[0] === 'vill' && tapSel.vmode !== 'hand') tapSel.active = nextEmpty(); slots(); picker(); };
    $('#eqClear').onclick = function () { tapSel.hero = [null, null]; tapSel.vill = [null, null]; tapSel.board = [null, null, null, null, null]; tapSel.active = ['hero', 0]; $('#eqOut').innerHTML = ''; slots(); picker(); };
    $('#eqRun').onclick = function () {
      var out = $('#eqOut');
      var hero = tapSel.hero.filter(function (c) { return c != null; }), vill = tapSel.vill.filter(function (c) { return c != null; }), board = tapSel.board.filter(function (c) { return c != null; });
      if (hero.length < 2) { out.innerHTML = '<div class="fb ng">自分のカードを2枚選んでください。</div>'; return; }
      if (tapSel.vmode === 'hand' && vill.length < 2) { out.innerHTML = '<div class="fb ng">相手のカードを2枚選ぶか、上の選択で「ランダムな手」やオープンレンジを選んでください。</div>'; return; }
      var cs = function (a) { return a.map(E.cardStr).join(''); };
      var vstr = tapSel.vmode === 'hand' ? cs(vill) : tapSel.vmode === 'random' ? PRESETS[PRESETS.length - 1][1] : D.rfi[tapSel.vmode];
      eqState.players = [cs(hero), vstr];
      eqState.board = cs(board);
      eqState.names = ['あなた ' + E.disp(cs(hero)), tapSel.vmode === 'hand' ? '相手 ' + E.disp(cs(vill)) : '相手: ' + VMODES.filter(function (m) { return m[0] === tapSel.vmode; })[0][1]];
      runEquity();
    };
  }
  function labEquityText() {
    eqState.names = null;
    var body = $('#eqWrap');
    body.innerHTML = '<div class="panel stack"><p class="muted" style="margin:0;font-size:13px">10は「10」でも「T」でも入力できます。具体的な手(例: AhKh)でも、レンジ(例: QQ+,AKs)でも入力できます。ボードは 0〜5枚(例: Kh9h4c)。カードは A K Q J T 9…2 と s h d c で書きます。</p>' +
      '<div id="eqPlayers" class="stack"></div><div class="row"><button class="btn small ghost" id="eqAdd">+ プレイヤー追加</button></div>' +
      '<label class="f">ボード<input type="text" id="eqBoard" placeholder="空欄ならプリフロップ" value="' + esc(eqState.board) + '"></label>' +
      '<div class="row"><button class="btn gold" id="eqRun">計算する</button><span class="muted num" id="eqInfo"></span></div><div class="progress" hidden id="eqProg"><i></i></div></div><div id="eqOut"></div>';
    function drawPlayers() {
      $('#eqPlayers').innerHTML = eqState.players.map(function (p, i) {
        return '<div class="row" style="flex-wrap:nowrap"><label class="f" style="flex:1">プレイヤー' + (i + 1) + '<input type="text" data-p="' + i + '" value="' + esc(p) + '"></label>' +
          '<button class="btn small ghost" data-g="' + i + '" style="align-self:flex-end">表</button>' + (eqState.players.length > 2 ? '<button class="btn small ghost" data-x="' + i + '" style="align-self:flex-end" aria-label="削除">×</button>' : '') + '</div>';
      }).join('');
      $all('[data-p]').forEach(function (inp) { inp.oninput = function () { eqState.players[+inp.dataset.p] = inp.value; }; });
      $all('[data-g]').forEach(function (b) { b.onclick = function () { var i = +b.dataset.g; rangeEditor(eqState.players[i], function (s) { eqState.players[i] = s; drawPlayers(); }); }; });
      $all('[data-x]').forEach(function (b) { b.onclick = function () { eqState.players.splice(+b.dataset.x, 1); drawPlayers(); }; });
    }
    drawPlayers();
    $('#eqAdd').onclick = function () { if (eqState.players.length < 6) { eqState.players.push('22+,A2s+,KTs+,ATo+'); drawPlayers(); } };
    $('#eqBoard').oninput = function () { eqState.board = this.value; };
    $('#eqRun').onclick = runEquity;
  }
  function runEquity() {
    var out = $('#eqOut'), info = $('#eqInfo'), prog = $('#eqProg');
    var board, lists;
    try {
      board = E.parseCards(eqState.board);
      if (board.length > 5 || (board.length > 0 && board.length < 3)) throw new Error('ボードは0枚か3〜5枚にしてください');
      if (new Set(board).size !== board.length) throw new Error('ボードに同じカードがあります');
      lists = eqState.players.map(function (p, i) {
        var l = E.rangeCombos(E.parseRange(p), board);
        if (!l.length) throw new Error('プレイヤー' + (i + 1) + 'の手が空です(入力を確認してください)');
        return l;
      });
    } catch (e) { out.innerHTML = '<div class="fb ng">' + esc(e.message) + '</div>'; return; }
    var exact = lists.every(function (l) { return l.length === 1; }) && 5 - board.length <= 3;
    if (exact) {
      try { var r = E.equity(lists, board, []); show(r.equity, r.win, r.tie, '全' + r.samples.toLocaleString() + '通りを正確に計算'); }
      catch (e) { out.innerHTML = '<div class="fb ng">' + esc(e.message) + '</div>'; }
      return;
    }
    var target = 300000, done = 0, np = lists.length;
    var acc = { eq: new Array(np).fill(0), win: new Array(np).fill(0), tie: new Array(np).fill(0) };
    prog.hidden = false; $('#eqRun').disabled = true;
    (function step() {
      try {
        var n = 20000, r = E.equity(lists, board, [], { iterations: n, forceMC: true });
        for (var p = 0; p < np; p++) { acc.eq[p] += r.equity[p] * n; acc.win[p] += r.win[p] * n; acc.tie[p] += r.tie[p] * n; }
        done += n;
      } catch (e) { out.innerHTML = '<div class="fb ng">' + esc(e.message) + '</div>'; prog.hidden = true; $('#eqRun').disabled = false; return; }
      $('i', prog).style.width = (done / target * 100) + '%';
      show(acc.eq.map(function (x) { return x / done; }), acc.win.map(function (x) { return x / done; }), acc.tie.map(function (x) { return x / done; }), 'モンテカルロ ' + done.toLocaleString() + '回 (誤差 約±' + (100 / Math.sqrt(done)).toFixed(2) + '%)');
      if (done < target) setTimeout(step, 0); else { prog.hidden = true; $('#eqRun').disabled = false; }
    })();
    function show(eq, win, tie, label) {
      var colors = ['var(--gold)', 'var(--blue)', 'var(--red)', 'var(--green)', 'var(--purple)', 'var(--slate)'];
      info.textContent = label;
      out.innerHTML = '<div class="panel stack"><div class="bars">' + eq.map(function (e, i) {
        return '<div class="bar"><span class="lbl">' + esc(eqState.names ? eqState.names[i] : 'P' + (i + 1) + ' ' + E.disp(eqState.players[i])) + '</span><span class="track"><i style="width:' + (e * 100) + '%;background:' + colors[i] + '"></i></span><span class="num">' + pct(e) + '</span></div>';
      }).join('') + '</div><div class="detail"><table><tr><th>プレイヤー</th><th>勝率</th><th>勝ち</th><th>引分</th></tr>' + eq.map(function (e, i) {
        return '<tr><td>' + (eqState.names ? (i ? '相手' : 'あなた') : 'P' + (i + 1)) + '</td><td>' + pct(e, 2) + '</td><td>' + pct(win[i], 2) + '</td><td>' + pct(tie[i], 2) + '</td></tr>';
      }).join('') + '</table></div><ul class="plain muted"><li><b>勝率</b>: 引き分けを半分の勝ちとして数えた、最後まで行ったときに勝つ確率。</li><li><b>勝ち</b>: 単独で勝つ確率。<b>引分</b>: 同じ強さで山分けになる確率。</li></ul></div>';
    }
  }

  // ---- push / fold ----
  var pfEq = null, pfStack = 10;
  function labPushFold() {
    var body = $('#labBody');
    body.innerHTML = '<div class="panel stack"><p class="muted" style="margin:0;font-size:13px">トーナメントの終盤などでスタックが短いとき、SBとBBの1対1で「SBはオールインかフォールド、BBはコールかフォールド」だけのゲームの<b>ナッシュ均衡</b>を、この場で計算します(アンティなし、SB 0.5BB / BB 1BB)。</p>' +
      '<label class="f">有効スタック <b class="num" id="pfS" style="color:var(--gold);font-size:18px">' + pfStack + 'BB</b><input type="range" id="pfRange" min="1" max="25" step="0.5" value="' + pfStack + '"></label>' +
      '<div id="pfOut"><p class="muted">勝率表を読み込み中…</p></div></div>';
    $('#pfRange').oninput = function () { pfStack = +this.value; $('#pfS').textContent = pfStack + 'BB'; schedule(); };
    var timer;
    function schedule() { clearTimeout(timer); timer = setTimeout(draw, 120); }
    function draw() {
      var r = E.solvePushFold(pfEq, pfStack, 1200);
      var pp = 0, cp = 0;
      E.CLASS_LABELS.forEach(function (l, i) { pp += r.push[i] * E.classSize(l); cp += r.call[i] * E.classSize(l); });
      function g(arr, color) { return gridHTML(function (l) { var f = arr[E.CLASS_INDEX[l]]; return { on: f > 0.5, bg: f > 0.02 ? mixBG([f], [color]) : '', title: l + ' ' + pct(f, 0) }; }); }
      $('#pfOut').innerHTML = '<div class="stack"><div><h3>SB: オールイン <span class="num" style="color:var(--red)">' + (pp / 13.26).toFixed(1) + '%</span></h3>' + g(r.push, COL.raise) + '</div>' +
        '<div><h3>BB: コール <span class="num" style="color:var(--blue)">' + (cp / 13.26).toFixed(1) + '%</span></h3>' + g(r.call, '#4a8be8') + '</div>' +
        '<div class="detail" id="pfDetail">マスをタップすると、その手でオールイン(またはコール)したときの平均の損得が出ます。</div>' +
        '<p class="note-box" style="margin:0">読み方: 色の幅がその手を使う頻度。境目の手は混合戦略になることがあります。スタックを短くするほどSBのオールイン範囲が広がり、BBは「オッズがいいので」広くコールするようになります。</p></div>';
      $all('.cell', $('#pfOut')).forEach(function (c) {
        c.onclick = function () {
          var i = E.CLASS_INDEX[c.dataset.l];
          var ep = r.evPush[i], ec = r.evCall[i];
          $('#pfDetail').innerHTML = '<b class="big">' + E.disp(c.dataset.l) + '</b><ul class="plain">' +
            '<li>SBがオールインした時の平均の損得: <b>' + (ep >= 0 ? '+' : '') + ep.toFixed(2) + 'BB</b>(降りると −0.5BB) → ' + (ep > -0.5 ? '<b class="good">オールインが得</b>' : '<b class="bad">降りる方が得</b>') + '</li>' +
            '<li>BBがコールした時の平均の損得: <b>' + (ec >= 0 ? '+' : '') + ec.toFixed(2) + 'BB</b>(降りると −1BB) → ' + (ec > -1 ? '<b class="good">コールが得</b>' : '<b class="bad">降りる方が得</b>') + '</li></ul>';
        };
      });
    }
    if (pfEq) return draw();
    fetch('data/equity169.json').then(function (res) { if (!res.ok) throw new Error(res.status); return res.json(); }).then(function (a) {
      pfEq = Float32Array.from(a, function (x) { return x / 10000; }); if ($('#pfOut')) draw();
    }).catch(function () { $('#pfOut').innerHTML = '<div class="fb ng">勝率表(data/equity169.json)を読み込めませんでした。ページを再読み込みしてください。</div>'; });
  }

  // ---- river solver ----
  var RIVER_PRESETS = [
    { name: '入門: ナッツかブラフ vs ブラフキャッチャー', board: 'Kh8d5c2s2h', pot: 10, stack: 100, oop: 'KK,43s:0.75', ip: 'QQ', sizes: [1], ipSizes: [], raise: false,
      note: '先に行動するOOPは「最強(KK)か、何もない(43s)」、IPは「ブラフにだけ勝てるQQ」。理論ではOOPは強い手を全部ベットし、ブラフをベットの1/3に混ぜ、IPは50%コールするのが均衡です。計算結果と比べてみてください。' },
    { name: 'Kハイの乾いたボード (広いレンジ)', board: 'Ks9h5d2c7s', pot: 10, stack: 50, oop: 'TT-22,A9s-A2s,K9s-K5s,QTs,Q9s,JTs,J9s,T9s,98s,87s,76s,65s,A9o-A7o,K9o-K8o,QTo,JTo,T9o', ip: 'AA-TT,AK,KQ,KJ,KTs,A5s-A2s,QJs,JTs,T8s,86s,64s,QTo,JTo,T9o', sizes: [0.33, 0.75], ipSizes: [0.33, 0.75], raise: true,
      note: 'BTN(IP)の強いレンジ vs BB(OOP)の中くらいのレンジの例。OOPはほとんどチェックし、IPがレンジ有利を生かしてベットする様子を確認できます。レンジは説明用の例です。' },
    { name: 'シナリオ5: ブラフキャッチャー (K T 6 3 2)', board: 'KhTh6c3s2d', pot: 30, stack: 70, oop: 'K9s-K7s,K9o-K8o,QTs,JTs,T9s,T8s,A6s,76s,99-77,Kc9d', ip: 'AK,KQ,KJ,KTs,TT,66,AhQh,AhJh,Ah9h,Qh9h,Jh9h,QJs,J9s,QJo', sizes: [], ipSizes: [1], raise: false,
      note: 'BB(OOP)はチェックし、BTN(IP)がポットサイズで打つかどうか。IPのレンジは強い手と外れたドロー(♥やQJ)の混合です。Kc9dがどれくらいコールすべきか、ツリーで「チェック → ベット」を開いて確認してください。' }
  ];
  var SIZE_OPTS = [0.25, 0.33, 0.5, 0.75, 1, 1.5];
  var riverResult = null;
  function labRiver() {
    var p = RIVER_PRESETS[riverPreset];
    var body = $('#labBody');
    function sizesHTML(name, sel) { return '<div class="sizes">' + SIZE_OPTS.map(function (f) { return '<label><input type="checkbox" name="' + name + '" value="' + f + '"' + (sel.indexOf(f) >= 0 ? ' checked' : '') + '>' + Math.round(f * 100) + '%</label>'; }).join('') + '</div>'; }
    body.innerHTML = '<div class="panel stack"><p class="muted" style="margin:0;font-size:13px">リバー(最後の5枚目が出た後)の1対1を、有料ソルバーと同じ <b>CFR+</b> という方法で解きます。OOPが先に行動、IPが後。ベットサイズを絞っているので計算は数秒です。</p>' +
      '<label class="f">プリセット<select id="rvPre">' + RIVER_PRESETS.map(function (x, i) { return '<option value="' + i + '"' + (i === riverPreset ? ' selected' : '') + '>' + esc(x.name) + '</option>'; }).join('') + '</select></label>' +
      '<p class="note-box" style="margin:0">' + esc(p.note) + '</p>' +
      '<div class="fgrid"><label class="f">ボード(5枚)<input type="text" id="rvBoard" value="' + p.board + '"></label><label class="f">ポット(BB)<input type="number" id="rvPot" value="' + p.pot + '" min="1"></label><label class="f">残りスタック(BB)<input type="number" id="rvStack" value="' + p.stack + '" min="1"></label></div>' +
      '<div class="row" style="flex-wrap:nowrap"><label class="f" style="flex:1">OOP(先に行動)のレンジ<textarea id="rvOop">' + esc(E.disp(p.oop)) + '</textarea></label><button class="btn small ghost" id="rvOopG" style="align-self:flex-end">表</button></div>' +
      '<div class="row" style="flex-wrap:nowrap"><label class="f" style="flex:1">IP(後に行動)のレンジ<textarea id="rvIp">' + esc(E.disp(p.ip)) + '</textarea></label><button class="btn small ghost" id="rvIpG" style="align-self:flex-end">表</button></div>' +
      '<div class="f"><span class="muted" style="font-size:13px">OOPのベットサイズ(ポット比)</span>' + sizesHTML('oopS', p.sizes) + '</div>' +
      '<div class="f"><span class="muted" style="font-size:13px">IPのベットサイズ(ポット比)</span>' + sizesHTML('ipS', p.ipSizes) + '</div>' +
      '<div class="row"><label class="check"><input type="checkbox" id="rvRaise"' + (p.raise ? ' checked' : '') + '>オールインのレイズを許可</label>' +
      '<label class="check">反復回数<select id="rvIter" style="width:auto"><option>300</option><option selected>600</option><option>1500</option></select></label></div>' +
      '<div class="row"><button class="btn gold" id="rvRun">ソルバーを実行</button><span class="muted num" id="rvInfo"></span></div><div class="progress" hidden id="rvProg"><i></i></div></div><div id="rvOut"></div>';
    $('#rvPre').onchange = function () { riverPreset = +this.value; riverResult = null; labRiver(); };
    $('#rvOopG').onclick = function () { rangeEditor($('#rvOop').value, function (s) { $('#rvOop').value = s; }); };
    $('#rvIpG').onclick = function () { rangeEditor($('#rvIp').value, function (s) { $('#rvIp').value = s; }); };
    $('#rvRun').onclick = runRiver;
  }
  function runRiver() {
    var out = $('#rvOut'), prog = $('#rvProg'), info = $('#rvInfo');
    var solver, cfg;
    try {
      var board = E.parseCards($('#rvBoard').value);
      if (board.length !== 5) throw new Error('ボードはちょうど5枚にしてください');
      if (new Set(board).size !== 5) throw new Error('ボードに同じカードがあります');
      var sz = function (n) { return $all('input[name=' + n + ']:checked').map(function (x) { return +x.value; }); };
      cfg = { board: board, pot: +$('#rvPot').value, stack: +$('#rvStack').value, oopRange: $('#rvOop').value, ipRange: $('#rvIp').value,
        oopBets: sz('oopS'), ipBets: sz('ipS'), allowRaise: $('#rvRaise').checked };
      if (!(cfg.pot > 0) || !(cfg.stack > 0)) throw new Error('ポットとスタックは正の数にしてください');
      solver = new RS.Solver(cfg);
    } catch (e) { out.innerHTML = '<div class="fb ng">' + esc(e.message) + '</div>'; return; }
    var total = +$('#rvIter').value, t0 = performance.now();
    prog.hidden = false; $('#rvRun').disabled = true; out.innerHTML = '';
    info.textContent = 'OOP ' + solver.n[0] + '通り · IP ' + solver.n[1] + '通り';
    (function step() {
      var chunk = Math.min(20, total - solver.iter);
      solver.run(chunk);
      $('i', prog).style.width = (solver.iter / total * 100) + '%';
      if (solver.iter < total) return setTimeout(step, 0);
      var ex = solver.exploitability();
      var sum = solver.summary();
      prog.hidden = true; $('#rvRun').disabled = false;
      info.textContent = ((performance.now() - t0) / 1000).toFixed(1) + '秒 · ' + total + '回反復';
      riverResult = { sum: sum, ex: ex, cfg: cfg, node: sum.nodes[0].id };
      drawRiver();
    })();
  }
  function actionColors(types) {
    var bets = 0;
    return types.map(function (t) {
      if (t === 'fold') return '#66788a';
      if (t === 'check' || t === 'call') return '#3bb273';
      if (t === 'raise') return '#a45ee0';
      bets++; return ['#f2a541', '#e5584f', '#c2334b', '#a45ee0', '#7c3fb0', '#5a2d82'][bets - 1];
    });
  }
  function drawRiver() {
    var R = riverResult, out = $('#rvOut'); if (!R || !out) return;
    var byId = {}; R.sum.nodes.forEach(function (n) { byId[n.id] = n; });
    var nd = byId[R.node];
    // breadcrumb path
    var path = [], cur = nd;
    var parentOf = {}; R.sum.nodes.forEach(function (n) { (n.children || []).forEach(function (c, a) { if (typeof c === 'number') parentOf[c] = { id: n.id, a: a }; }); });
    while (cur) { path.unshift(cur); var pa = parentOf[cur.id]; cur = pa ? byId[pa.id] : null; }
    var crumbs = path.map(function (n, k) {
      var lbl = k === 0 ? '開始' : byId[parentOf[n.id].id].actions[parentOf[n.id].a];
      return '<button data-n="' + n.id + '">' + esc((k === 0 ? '' : (byId[parentOf[n.id].id].player === 0 ? 'OOP ' : 'IP ')) + lbl) + '</button>';
    }).join('<span class="muted">›</span>');
    var colors = actionColors(R.cfg && nd.actionTypes);
    var who = nd.player === 0 ? 'OOP(先に行動)' : 'IP(後に行動)';
    var pot = R.cfg.pot;
    out.innerHTML = '<div class="panel stack">' +
      '<div class="stats"><div class="stat"><div class="v">' + (R.ex / pot * 100).toFixed(2) + '%</div><div class="k">誤差(ポット比)</div></div>' +
      '<div class="stat"><div class="v">' + R.sum.ev[0].toFixed(2) + '</div><div class="k">OOPの期待値 BB</div></div>' +
      '<div class="stat"><div class="v">' + R.sum.ev[1].toFixed(2) + '</div><div class="k">IPの期待値 BB</div></div></div>' +
      '<p class="muted" style="margin:0;font-size:12px">誤差(エクスプロイタビリティ)は「最善の相手に対してどれだけ損をするか」。0に近いほど本物の均衡で、ポットの0.5%以下なら有料ソルバーの一般的な目安と同水準です。</p>' +
      '<div class="crumbs">' + crumbs + '</div>' +
      '<h3>' + who + ' の行動</h3>' +
      '<div class="mix">' + nd.total.map(function (f, a) { return '<i style="width:' + (f * 100) + '%;background:' + colors[a] + '" title="' + esc(nd.actions[a]) + '"></i>'; }).join('') + '</div>' +
      '<div class="legend" style="justify-content:flex-start">' + nd.actions.map(function (a, k) { return '<span style="--c:' + colors[k] + '">' + esc(a) + ' ' + pct(nd.total[k], 0) + '</span>'; }).join('') + '</div>' +
      gridHTML(function (l) { var c = nd.classes[l]; return c ? { on: true, bg: mixBG(c.f, colors), title: l } : null; }) +
      '<div class="detail" id="rvDetail"><span class="muted">マスをタップすると、その手の組み合わせごとの頻度が出ます。</span></div>' +
      '<div class="stack" style="gap:8px"><span class="muted" style="font-size:13px">次の場面を見る:</span><div class="row">' + nd.actions.map(function (a, k) {
        var ch = nd.children[k];
        return typeof ch === 'number' ? '<button class="btn small" data-n="' + ch + '" style="border-left:6px solid ' + colors[k] + '">' + esc(a) + ' の後 →</button>' : '';
      }).join('') + '</div></div></div>';
    $all('[data-n]', out).forEach(function (b) { b.onclick = function () { R.node = +b.dataset.n; drawRiver(); }; });
    $all('.cell', out).forEach(function (c) {
      c.onclick = function () {
        var cl = nd.classes[c.dataset.l];
        if (!cl) { $('#rvDetail').innerHTML = '<span class="muted">' + E.disp(c.dataset.l) + ' はこの場面のレンジにありません。</span>'; return; }
        $('#rvDetail').innerHTML = '<table><tr><th>' + E.disp(c.dataset.l) + '</th>' + nd.actions.map(function (a) { return '<th>' + esc(a.split(' ')[0]) + '</th>'; }).join('') + '</tr>' +
          cl.combos.map(function (cb) { return '<tr><td>' + E.disp(cb.cards) + '</td>' + cb.f.map(function (f) { return '<td>' + pct(f, 0) + '</td>'; }).join('') + '</tr>'; }).join('') + '</table>';
      };
    });
  }

  Object.assign(ui, {
    app: app, views: views, go: go, $: $, $all: $all, esc: esc, cardHTML: cardHTML, gridHTML: gridHTML, mixBG: mixBG, award: award,
    backBtn: backBtn, actionMap: actionMap, chartHTML: chartHTML, P: P, save: save, track: track,
    openTheory: function (id) { learnTab = 'theory'; learnOpen = id; go('learn'); }
  });
  if (window.PT_COURSE) window.PT_COURSE(ui);
  if (window.PT_PLAY) window.PT_PLAY(ui);
  renderHUD();
  route();
})();
