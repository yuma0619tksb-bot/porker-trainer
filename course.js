/* 基礎コース: step-by-step lessons from zero for weak areas, chosen from quiz and play data.
 * Registered into app.js through window.PT_COURSE(ui). */
(function () {
  'use strict';
  var E = window.PokerEngine;
  function ri(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  // numeric multiple choice: correct + nearby distractors (unique, positive)
  function numQ(correct, extra, fmt) {
    var seen = {}, out = [];
    [correct].concat(extra).forEach(function (v) { v = Math.round(v * 10) / 10; var k = fmt(v); if (v > 0 && !seen[k] && out.length < 4) { seen[k] = 1; out.push(v); } });
    out = shuffle(out);
    return { choices: out.map(fmt), answer: out.indexOf(Math.round(correct * 10) / 10) };
  }
  var BB = function (v) { return v + 'BB'; }, PCT = function (v) { return v + '%'; }, MAI = function (v) { return v + '枚'; };
  // easy pot/bet pairs whose required equity is a round-ish number
  var EASY = [[10, 5, 25], [20, 10, 25], [10, 10, 33], [30, 30, 33], [20, 5, 17], [30, 10, 20], [40, 20, 25], [60, 20, 20], [20, 20, 33], [50, 25, 25], [12, 3, 17], [30, 15, 25]];

  // ================= COURSES =================
  var COURSES = {
    odds: {
      title: 'オッズの基礎', area: 'odds',
      intro: 'ポットオッズは「このコールは得か損か」を決める道具です。足し算と割り算だけで使えます。1ステップずつ進みましょう。',
      steps: [
        { title: 'ポットってなに?', body: [
            '<p>テーブルの真ん中に集まったチップの合計を<b>ポット</b>と呼びます。勝った人がポットを全部もらいます。</p>',
            '<p>相手が<b>ベット</b>(賭ける)すると、そのチップも真ん中に置かれます。つまりポットが増えます。</p>',
            '<div class="formula">真ん中のチップ = 元のポット + 相手のベット</div>'],
          gen: function () { var p = pick([10, 20, 30, 40]), b = pick([5, 10, 15, 20]);
            var q = numQ(p + b, [p, b, p + 2 * b, p - b], BB);
            return { q: 'ポットが ' + p + 'BB。相手が ' + b + 'BB ベットしました。今、真ん中にあるチップは全部で何BB?', choices: q.choices, answer: q.answer,
              hints: ['真ん中にあるのは「元のポット」と「相手のベット」の2つです。', p + ' + ' + b + ' = ?'], why: p + ' + ' + b + ' = ' + (p + b) + 'BB' }; } },
        { title: 'コールしたら?', body: [
            '<p><b>コール</b>は、相手と同じ額を払って勝負を続けることです。</p>',
            '<p>コールすると自分のチップも真ん中に入るので、ポットはさらに増えます。</p>',
            '<div class="formula">コール後の合計 = 元のポット + 相手のベット + 自分のコール</div>',
            '<p class="muted">相手のベットと自分のコールは同じ額です。</p>'],
          gen: function () { var p = pick([10, 20, 30, 40]), b = pick([5, 10, 20]);
            var q = numQ(p + 2 * b, [p + b, p + 3 * b, 2 * b, p + b + 5], BB);
            return { q: 'ポット ' + p + 'BB に相手が ' + b + 'BB ベット。あなたがコールすると、真ん中は全部で何BB?', choices: q.choices, answer: q.answer,
              hints: ['あなたも ' + b + 'BB 払います。相手のベットと同じ額です。', p + ' + ' + b + ' + ' + b + ' = ?'], why: p + ' + ' + b + ' + ' + b + ' = ' + (p + 2 * b) + 'BB' }; } },
        { title: '割合(%)のおさらい', body: [
            '<p>「AはBの何%?」は、<b>A ÷ B</b> をして100倍します。</p>',
            '<div class="formula">5 は 20 の何%? → 5 ÷ 20 = 0.25 → <b>25%</b></div>',
            '<p>よく出るのは 1/2=50%、1/3≒33%、1/4=25%、1/5=20% です。</p>'],
          gen: function () { var t = pick([[5, 20, 25], [10, 40, 25], [10, 30, 33], [10, 50, 20], [20, 40, 50], [5, 15, 33], [6, 30, 20], [15, 60, 25]]);
            var q = numQ(t[2], [t[2] + 10, t[2] - 8, Math.round(t[0] / (t[1] - t[0]) * 100), 50], PCT);
            return { q: t[0] + ' は ' + t[1] + ' の何%?', choices: q.choices, answer: q.answer,
              hints: [t[0] + ' ÷ ' + t[1] + ' を計算します。', t[0] + ' ÷ ' + t[1] + ' = ' + (t[0] / t[1]).toFixed(2).replace(/0$/, '') + ' → 100倍すると?'], why: t[0] + ' ÷ ' + t[1] + ' = ' + (t[0] / t[1]).toFixed(2) + ' → ' + t[2] + '%' }; } },
        { title: '必要勝率の式', body: [
            '<p>ここが一番大事です。コールして得をするには、最低どれくらい勝てればいいか(<b>必要勝率</b>)を出します。</p>',
            '<div class="formula">必要勝率 = 自分が払う額 ÷ コール後の合計</div>',
            '<p>例: ポット10に相手が5ベット → 払うのは5、コール後の合計は 10+5+5=20 → 5÷20 = <b>25%</b></p>'],
          gen: function () { var t = pick(EASY);
            var q = numQ(t[2], [Math.round(t[1] / t[0] * 100), Math.round(t[1] / (t[0] + t[1]) * 100), t[2] + 10, t[2] - 7], PCT);
            return { q: 'ポット ' + t[0] + 'BB に相手が ' + t[1] + 'BB ベット。コールに必要な勝率は?', choices: q.choices, answer: q.answer,
              hints: ['払う額は ' + t[1] + 'BB。コール後の合計は ' + t[0] + ' + ' + t[1] + ' + ' + t[1] + ' = ' + (t[0] + 2 * t[1]) + 'BB。', t[1] + ' ÷ ' + (t[0] + 2 * t[1]) + ' を%にすると?'],
              why: t[1] + ' ÷ (' + t[0] + ' + ' + t[1] + ' + ' + t[1] + ') = ' + t[1] + ' ÷ ' + (t[0] + 2 * t[1]) + ' ≒ ' + t[2] + '%' }; } },
        { title: 'なぜその式で分かるの?', body: [
            '<p>ポット10に相手が10ベット、あなたがコール10する場面を<b>3回</b>くり返したとします。</p>',
            '<div class="formula">3回で払う額: 10 × 3 = 30<br>1回勝つともらえる額: 10 + 10 + 10 = 30</div>',
            '<p>3回に1回勝てば、払った30と同じ30が戻ってくるので<b>プラスマイナス0</b>。だから必要勝率は 1/3 ≒ 33% です。それより多く勝てるならコールは得です。</p>'],
          gen: function () { var t = pick([[25, 4], [20, 5], [33, 3], [50, 2]]);
            var q = numQ(t[1], [t[1] + 1, t[1] - 1, t[1] * 2, 10], function (v) { return v + '回に1回'; });
            return { q: '必要勝率が ' + t[0] + '% のコール。何回に1回勝てば損しない?', choices: q.choices, answer: q.answer,
              hints: [t[0] + '% は「100回のうち' + t[0] + '回」です。', '100 ÷ ' + t[0] + ' = ?'], why: '100 ÷ ' + t[0] + ' = ' + t[1] + ' なので、' + t[1] + '回に1回勝てばプラスマイナス0' }; } },
        { title: '早見表で覚える', body: [
            '<p>毎回計算しなくても、相手のベットの大きさで決まります。</p>',
            '<div class="formula">ポットの1/3のベット → 20%<br>ポットの半分のベット → 25%<br>ポットの3/4のベット → 30%<br>ポットと同じベット → 33%<br>ポットの2倍のベット → 40%</div>',
            '<p class="muted">大きく賭けられるほど、必要勝率は上がります。</p>'],
          gen: function () { var t = pick([['ポットの1/3', 20], ['ポットの半分', 25], ['ポットの3/4', 30], ['ポットと同じ', 33], ['ポットの2倍', 40]]);
            var q = numQ(t[1], [20, 25, 30, 33, 40, 50].filter(function (x) { return x !== t[1]; }).slice(0, 4), PCT);
            return { q: '相手が「' + t[0] + '」の額をベット。必要な勝率は?', choices: q.choices, answer: q.answer,
              hints: ['上の早見表を見て大丈夫です。', 'ポットを100として計算してもOK。'], why: t[0] + 'のベット → ' + t[1] + '%' }; } },
        { title: 'アウツを数える', body: [
            '<p>次は「自分の勝率」の出し方です。まず、出れば自分が勝てるカードの枚数(<b>アウツ</b>)を数えます。</p>',
            '<p>例: 手札とボードに♥が4枚あるとき、♥は全部で13枚なので、残りは 13 − 4 = <b>9枚</b>。どれか1枚が出ればフラッシュ完成です。</p>',
            '<div class="formula">フラッシュまであと1枚 → 9枚<br>両側が空いたストレート(例: 5-6-7-8) → 8枚<br>真ん中が1枚足りないストレート(例: 5-6-_-8-9) → 4枚</div>'],
          gen: function () { var t = pick([
              ['AhKh', 'Qh7h2c', 9, '♥が手札2枚+ボード2枚で4枚。13−4 = 9枚'],
              ['9s8d', '7c6h2s', 8, '5か10が出ればストレート。5が4枚+10が4枚 = 8枚'],
              ['Js10d', '9h7c2s', 4, '8が出ればストレート。8は4枚'],
              ['6c5c', 'Kc9c2d', 9, '♣が4枚そろっている。13−4 = 9枚'],
              ['10h9h', 'Jc8d3s', 8, 'Qか7が出ればストレート。Qが4枚+7が4枚 = 8枚'],
              ['KdQd', 'Jh10c3s', 8, 'Aか9が出ればストレート。Aが4枚+9が4枚 = 8枚']]);
            var q = numQ(t[2], [t[2] + 4, t[2] - 2, 13, t[2] + 1], MAI);
            return { q: '手札とボードを見て、出ればストレートかフラッシュが完成するカードは何枚?', cards: { hand: t[0], board: t[1] }, choices: q.choices, answer: q.answer,
              hints: ['同じマークが4枚あるならフラッシュ、数字が4つ並んでいるならストレートを狙えます。', 'フラッシュなら 13 − 見えているそのマークの枚数。ストレートなら「足りない数字」1種類につき4枚。'], why: t[3] }; } },
        { title: '2と4の法則', body: [
            '<p>アウツから勝率をざっくり出す方法です。</p>',
            '<div class="formula">残りカードがあと1枚(ターン→リバー) → アウツ × 2 ≒ 勝率%<br>残りカードがあと2枚(フロップでオールイン) → アウツ × 4 ≒ 勝率%</div>',
            '<p>例: フラッシュドロー9枚でターンなら 9×2 = 約18%(正確には約20%)。</p>'],
          gen: function () { var n = pick([4, 8, 9, 12, 15]), two = Math.random() < 0.5, ans = n * (two ? 4 : 2);
            var q = numQ(ans, [n * (two ? 2 : 4), n, ans + 10, Math.max(2, ans - 6)], PCT);
            return { q: 'アウツが ' + n + '枚。' + (two ? 'フロップでオールイン(あと2枚出る)' : 'ターン(あと1枚出る)') + '。勝率はおよそ?', choices: q.choices, answer: q.answer,
              hints: ['あと' + (two ? '2' : '1') + '枚なら「×' + (two ? '4' : '2') + '」です。', n + ' × ' + (two ? 4 : 2) + ' = ?'], why: n + ' × ' + (two ? 4 : 2) + ' = 約' + ans + '%' }; } },
        { title: 'コールかフォールドか', body: [
            '<p>最後に2つを比べます。</p>',
            '<div class="formula">自分の勝率 > 必要勝率 → コール(得)<br>自分の勝率 < 必要勝率 → フォールド(損を避ける)</div>',
            '<p>手順: ①必要勝率を出す → ②アウツ×2(または×4)で自分の勝率を出す → ③比べる。</p>'],
          gen: function () {
            for (var k = 0; k < 50; k++) {
              var t = pick(EASY), n = pick([4, 8, 9, 12, 15]), eq = n * 2;
              if (Math.abs(eq - t[2]) >= 5) break;
            }
            var call = eq > t[2];
            return { q: 'ターン。ポット ' + t[0] + 'BB に相手が ' + t[1] + 'BB ベット。あなたのアウツは ' + n + '枚。コールする?', choices: ['フォールド', 'コール'], answer: call ? 1 : 0,
              hints: ['①必要勝率: ' + t[1] + ' ÷ ' + (t[0] + 2 * t[1]) + ' ≒ ' + t[2] + '%', '②自分の勝率: ' + n + ' × 2 = 約' + eq + '%。③どちらが大きい?'],
              why: '必要勝率 約' + t[2] + '% と自分の勝率 約' + eq + '% を比べて、' + (call ? '勝率の方が大きいのでコール' : '勝率が足りないのでフォールド') }; } },
        { title: '卒業テスト', final: true, body: ['<p>ここまでの総まとめです。3問続けて正解したら卒業です。間違えても何度でも挑戦できます。</p>'], mix: [3, 7, 8] }
      ]
    },
    preflop: {
      title: 'プリフロップの基礎', area: 'preflop',
      intro: '最初の2枚で「参加するか、降りるか」を決める考え方です。席の名前から始めます。',
      steps: [
        { title: '席の名前と順番', body: [
            '<p>6人卓では、毎ハンド行動する順番が決まっています。早い順に <b>UTG → HJ → CO → BTN → SB → BB</b>。</p>',
            '<p>BTN(ボタン)は、フロップ以降いつも<b>最後</b>に行動できる一番有利な席です。</p>'],
          gen: function () { var t = pick([['フロップ以降、一番最後に行動できる席は?', 'BTN'], ['プリフロップで一番最初に行動する席は?', 'UTG'], ['強制で1BB払う席は?', 'BB'], ['BTNのすぐ前の席は?', 'CO']]);
            var opts = shuffle(['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB']).filter(function (x) { return x !== t[1]; }).slice(0, 3).concat([t[1]]); opts = shuffle(opts);
            return { q: t[0], choices: opts, answer: opts.indexOf(t[1]), hints: ['順番は UTG → HJ → CO → BTN → SB → BB。', '最後に行動できる=有利な席はボタン(BTN)です。'], why: '答えは ' + t[1] }; } },
        { title: '手札の書き方', body: [
            '<p>2枚の手札は数字2つと、マークが同じかどうかで書きます。</p>',
            '<div class="formula">同じマーク → s(スーテッド)例: A♥K♥ = AKs<br>違うマーク → o(オフスーツ)例: A♥K♠ = AKo<br>同じ数字 → ペア 例: 7♣7♦ = 77</div>'],
          gen: function () { var t = pick([['KhQh', 'KQs'], ['KhQs', 'KQo'], ['7c7d', '77'], ['As5s', 'A5s'], ['Jd10c', 'J10o'], ['9h8h', '98s']]);
            var base = t[1].replace(/[so]$/, ''), opts = [t[1]];
            if (t[1].length === 2) opts.push(base + 's', base + 'o'); else opts.push(base + (t[1].slice(-1) === 's' ? 'o' : 's'), base);
            opts = shuffle(opts);
            return { q: 'この2枚の書き方は?', cards: { hand: t[0] }, choices: opts, answer: opts.indexOf(t[1]), hints: ['マーク(♠♥♦♣)が同じか見てください。', '同じマークならs、違えばo、同じ数字ならペアで文字なし。'], why: '答えは ' + t[1] }; } },
        { title: 'なぜ前の席は手を絞るの?', body: [
            '<p>前の席ほど、<b>後ろにまだ行動する人が多く</b>残っています。その誰かが強い手を持っている確率が高いので、前の席は強い手だけで参加します。</p>',
            '<div class="formula">UTG: 後ろに5人 → 約17%の手だけ<br>BTN: 後ろに2人 → 約45%の手で参加</div>'],
          gen: function () { var t = pick([['UTG', 5], ['HJ', 4], ['CO', 3], ['BTN', 2], ['SB', 1]]);
            var q = numQ(t[1], [1, 2, 3, 4, 5].filter(function (x) { return x !== t[1]; }).slice(0, 3), function (v) { return v + '人'; });
            return { q: t[0] + ' の後ろに、まだ行動する人は何人?', choices: q.choices, answer: q.answer, hints: ['順番は UTG → HJ → CO → BTN → SB → BB。', t[0] + ' より右に並んでいる席を数えます。'], why: t[0] + ' の後ろは ' + t[1] + '人' }; } },
        { title: '強い手の特徴', body: [
            '<p>強い手には共通点があります。</p>',
            '<div class="formula">① 高い数字(A, K, Q…)<br>② ペア<br>③ 同じマーク(s)はフラッシュを狙えて少し強い<br>④ つながった数字(9-8など)はストレートを狙える</div>'],
          gen: function () { var t = pick([['K9s', 'K9o'], ['A5s', 'A5o'], ['QJo', 'Q5o'], ['99', '94o'], ['98s', '93o'], ['AKo', 'A9o'], ['JJ', 'J8s']]);
            var opts = shuffle(t);
            return { q: 'どちらが強い手?', choices: opts.map(E.disp), answer: opts.indexOf(t[0]), hints: ['高い数字・ペア・同じマーク・つながり、のどれを持っているか比べます。', '数字が同じなら、s(同じマーク)の方が強いです。'], why: E.disp(t[0]) + ' の方が強い' }; } },
        { title: '表の読み方', body: [
            '<p>レンジ表は13×13のマスで、1マスが手札の種類1つです。</p>',
            '<div class="formula">斜めの線 → ペア(AA, KK …)<br>右上半分 → s(同じマーク)<br>左下半分 → o(違うマーク)<br>色が付いたマス → その行動をとる手</div>'],
          gen: function () { var t = pick([['AKs', '右上半分'], ['AKo', '左下半分'], ['77', '斜めの線'], ['J10s', '右上半分'], ['98o', '左下半分'], ['QQ', '斜めの線']]);
            var opts = ['右上半分', '左下半分', '斜めの線'];
            return { q: E.disp(t[0]) + ' は表のどこにある?', choices: opts, answer: opts.indexOf(t[1]), hints: ['s は同じマーク、o は違うマーク、同じ数字2つはペア。', 'ペアは斜め、sは右上、oは左下。'], why: E.disp(t[0]) + ' は' + t[1] }; } },
        { title: '卒業テスト', final: true, body: ['<p>表を見ずに答えてみましょう。3問続けて正解で卒業です。</p>'], mix: [0, 2, 3] }
      ]
    }
  };

  // ================= weakness detection =================
  function recentAcc(skills, keys) {
    var r = [];
    keys.forEach(function (k) { if (skills[k]) r = r.concat(skills[k].r || []); });
    return r.length ? { n: r.length, acc: r.reduce(function (a, b) { return a + b; }, 0) / r.length } : null;
  }
  // hands: optional play records (from cloud). Returns [{area, title, reason, weak, progress}]
  function areas(P, hands) {
    var sk = P.skills || {}, out = [];
    var qo = recentAcc(sk, ['potodds', 'callfold', 'outs', 'mdf']);
    if (!qo && P.stats && P.stats.odds && P.stats.odds.n) qo = { n: P.stats.odds.n, acc: P.stats.odds.ok / P.stats.odds.n };
    var qp = recentAcc(sk, ['rfi', 'facing']);
    if (!qp && P.stats && P.stats.preflop && P.stats.preflop.n) qp = { n: P.stats.preflop.n, acc: P.stats.preflop.ok / P.stats.preflop.n };
    var po = { n: 0, bad: 0 }, pp = { n: 0, bad: 0 };
    (hands || []).forEach(function (h) { (h.dec || []).forEach(function (d) {
      if (d.type === 'facing') { po.n++; if (!d.ok) po.bad++; }
      if (d.type === 'pf-open' || d.type === 'pf-facing') { pp.n++; if (!d.ok) pp.bad++; }
    }); });
    function build(key, q, p, qLabel, pLabel) {
      var reasons = [], weak = false;
      if (q && q.n >= 5) { reasons.push(qLabel + 'の正解率 ' + Math.round(q.acc * 100) + '%(直近' + q.n + '問)'); if (q.acc < 0.6) weak = true; }
      if (p.n) { reasons.push(pLabel + ' ' + p.bad + '回 / ' + p.n + '回'); if (p.bad >= 3 && p.bad / p.n >= 0.25) weak = true; }
      var prog = (P.course || {})[key] || {};
      out.push({ area: key, title: COURSES[key].title, weak: weak, reasons: reasons, step: prog.step || 0, done: !!prog.done, total: COURSES[key].steps.length });
    }
    build('odds', qo, po, 'オッズ特訓', '対戦でオッズの判断ミス');
    build('preflop', qp, pp, 'プリフロップ道場', '対戦でプリフロップのミス');
    out.sort(function (a, b) { return (b.weak - a.weak) || (a.done - b.done); });
    return out;
  }

  window.PT_COURSE = function (ui) {
    var $ = ui.$, $all = ui.$all, esc = ui.esc, P = ui.P;
    P.course = P.course || {};
    var cur = { key: 'odds' };

    ui.courseAreas = function (hands) { return areas(P, hands); };
    ui.openCourse = function (key) { cur.key = key; ui.go('course'); };

    // card markup for "KhQh" style strings (10 allowed)
    function cardsRow(str) { return '<div class="hand" style="justify-content:flex-start">' + E.parseCards(str).map(function (c) { return ui.cardHTML(c); }).join('') + '</div>'; }

    ui.views.course = function () {
      var C = COURSES[cur.key], prog = P.course[cur.key] || (P.course[cur.key] = { step: 0, done: false });
      var stepIdx = Math.min(prog.step, C.steps.length - 1);
      renderStep(C, prog, stepIdx);
    };

    function renderStep(C, prog, i) {
      var st = C.steps[i];
      var dots = C.steps.map(function (s, k) {
        return '<button class="dot' + (k === i ? ' on' : '') + (k < prog.step || prog.done ? ' done' : '') + '" data-step="' + k + '" title="' + esc(s.title) + '"' + (k > prog.step && !prog.done ? ' disabled' : '') + '>' + (k + 1) + '</button>';
      }).join('');
      ui.app.innerHTML = '<button class="back" data-go="lesson">← レッスンに戻る</button><div class="stack">' +
        '<div class="row" style="justify-content:space-between"><h2>' + esc(C.title) + '</h2><span class="num muted">' + (prog.done ? '卒業済み' : 'ステップ ' + (i + 1) + ' / ' + C.steps.length) + '</span></div>' +
        (i === 0 && !prog.step ? '<p class="muted" style="margin:0">' + esc(C.intro) + '</p>' : '') +
        '<div class="dots">' + dots + '</div>' +
        '<div class="panel stack"><h3>' + (i + 1) + '. ' + esc(st.title) + '</h3><div class="prose">' + st.body.join('') + '</div></div>' +
        '<div id="cQ" class="stack"></div></div>';
      $all('[data-step]').forEach(function (b) { b.onclick = function () { renderStep(C, prog, +b.dataset.step); }; });
      if (st.final) finalTest(C, prog, i, st); else question(C, prog, i, st);
    }

    function qHTML(item) {
      return '<div class="panel stack"><div class="eyebrow">確認問題</div><p style="margin:0;font-weight:700">' + esc(item.q) + '</p>' +
        (item.cards ? (item.cards.hand ? '<div><span class="muted" style="font-size:12px">手札</span>' + cardsRow(item.cards.hand) + '</div>' : '') +
          (item.cards.board ? '<div><span class="muted" style="font-size:12px">ボード</span>' + cardsRow(item.cards.board) + '</div>' : '') : '') +
        '<div class="choices">' + item.choices.map(function (c, k) { return '<button class="btn ghost" data-c="' + k + '">' + esc(c) + '</button>'; }).join('') + '</div>' +
        '<div class="row"><button class="btn small ghost" id="cIdk">わからない(ヒント)</button></div><div id="cHint" class="stack" style="gap:6px"></div><div id="cFb"></div></div>';
    }

    function question(C, prog, i, st) {
      var item = st.gen(), wrong = 0, hintsShown = 0;
      var box = $('#cQ'); box.innerHTML = qHTML(item);
      function showHint() {
        if (hintsShown >= item.hints.length) return;
        $('#cHint').insertAdjacentHTML('beforeend', '<div class="hint"><b>ヒント' + (hintsShown + 1) + '</b> ' + esc(item.hints[hintsShown]) + '</div>');
        hintsShown++;
        if (hintsShown >= item.hints.length) $('#cIdk').disabled = true;
      }
      $('#cIdk').onclick = showHint;
      $all('[data-c]', box).forEach(function (b) {
        b.onclick = function () {
          var k = +b.dataset.c, ok = k === item.answer;
          ui.track('course-' + C.area, ok);
          if (!ok) {
            wrong++; b.disabled = true; b.classList.add('wrong');
            if (wrong <= item.hints.length) { while (hintsShown < wrong) showHint(); return; }
            // out of hints: reveal and offer a fresh question
            $all('[data-c]', box).forEach(function (x) { x.disabled = true; if (+x.dataset.c === item.answer) x.classList.add('right'); });
            $('#cFb').innerHTML = '<div class="fb ng pop"><p><b>答え: ' + esc(item.choices[item.answer]) + '</b></p><p>' + esc(item.why) + '</p>' +
              '<div class="row"><button class="btn gold" id="cAgain">似た問題でもう1回</button></div></div>';
            $('#cAgain').onclick = function () { question(C, prog, i, st); };
            return;
          }
          $all('[data-c]', box).forEach(function (x) { x.disabled = true; if (+x.dataset.c === item.answer) x.classList.add('right'); });
          ui.award('course', true);
          var last = i + 1 >= C.steps.length;
          $('#cFb').innerHTML = '<div class="fb ok pop"><p><b>正解!</b> ' + esc(item.why) + '</p>' +
            (wrong === 0 && hintsShown === 0 ? '<p class="good" style="margin:0">ヒントなしで正解。しっかり分かっています。</p>' : '') +
            '<p style="margin:8px 0 0">ここまでで分からないこと・疑問はありますか?</p>' +
            '<div class="row"><button class="btn gold" id="cNext">分かった、次へ →</button><button class="btn ghost" id="cMore">もう1問</button><button class="btn ghost" id="cAsk">質問する</button></div><div id="cAskBox"></div></div>';
          $('#cMore').onclick = function () { question(C, prog, i, st); };
          $('#cNext').onclick = function () {
            if (prog.step <= i) { prog.step = i + 1; ui.save(); }
            renderStep(C, prog, Math.min(i + 1, C.steps.length - 1));
          };
          $('#cAsk').onclick = function () { askBox(C, st, item); };
          $('#cNext').focus({ preventScroll: true });
        };
      });
    }

    function finalTest(C, prog, i, st) {
      var streak = 0;
      (function next() {
        var src = C.steps[st.mix[Math.floor(Math.random() * st.mix.length)]];
        var item = src.gen(), wrong = false;
        var box = $('#cQ');
        box.innerHTML = '<p class="num muted" style="margin:0">連続正解 ' + streak + ' / 3</p>' + qHTML(item);
        $('#cIdk').onclick = function () { $('#cHint').innerHTML = '<div class="hint">' + esc(item.hints[0]) + '</div>'; };
        $all('[data-c]', box).forEach(function (b) {
          b.onclick = function () {
            var ok = +b.dataset.c === item.answer;
            ui.track('course-' + C.area, ok);
            $all('[data-c]', box).forEach(function (x) { x.disabled = true; if (+x.dataset.c === item.answer) x.classList.add('right'); else if (x === b) x.classList.add('wrong'); });
            if (ok) {
              streak++; ui.award('course', true);
              if (streak >= 3) {
                prog.done = true; prog.step = C.steps.length; ui.save();
                $('#cFb').innerHTML = '<div class="fb ok pop"><div class="verdict">卒業!</div><p>' + esc(C.title) + 'を最後までクリアしました。次は実戦形式の練習で、身についたか確かめましょう。</p>' +
                  '<div class="row"><button class="btn gold" data-go="' + (C.area === 'odds' ? 'odds' : 'preflop') + '">' + (C.area === 'odds' ? 'オッズ特訓へ' : 'プリフロップ道場へ') + '</button><button class="btn ghost" data-go="lesson">レッスンへ</button></div></div>';
                return;
              }
              $('#cFb').innerHTML = '<div class="fb ok pop"><p><b>正解!</b> ' + esc(item.why) + '</p><button class="btn gold" id="cN">次の問題 →</button></div>';
            } else {
              streak = 0;
              $('#cFb').innerHTML = '<div class="fb ng pop"><p><b>答え: ' + esc(item.choices[item.answer]) + '</b> ' + esc(item.why) + '</p><p class="muted" style="margin:0">連続正解は0からやり直し。分からなければ上の番号から前のステップを読み直せます。</p><button class="btn gold" id="cN">次の問題 →</button></div>';
            }
            $('#cN').onclick = next;
          };
        });
      })();
    }

    // Ask Claude about this step (the viewer's own question)
    function askBox(C, st, item) {
      var el = $('#cAskBox');
      el.innerHTML = '<div class="stack" style="gap:8px;margin-top:10px"><label class="f">どこが分からない?<textarea id="cAskText" placeholder="例: なぜ自分のコールも足すの?"></textarea></label>' +
        '<div class="row"><button class="btn blue small" id="cAskSend">Claudeに聞く</button><span class="muted" style="font-size:12px">あなたのClaudeの使用量を少し使います</span></div><div id="cAns" class="prose" style="white-space:pre-wrap"></div></div>';
      $('#cAskSend').onclick = async function () {
        var text = $('#cAskText').value.trim(); if (!text) return;
        var out = $('#cAns'), btn = $('#cAskSend');
        var sample = window.claude && window.claude.use ? await window.claude.use('sample') : null;
        if (!sample) { out.textContent = 'この画面ではClaudeに質問できません(claude.aiにサインインして開いてください)。'; return; }
        btn.disabled = true; out.textContent = '考え中…';
        var tmp = document.createElement('div'); tmp.innerHTML = st.body.join('');
        var prompt = 'あなたはポーカーを教える先生です。生徒はポーカー初心者で、算数の説明も丁寧に必要です。\n' +
          '今のレッスン: 「' + C.title + '」のステップ「' + st.title + '」\n説明文: ' + tmp.textContent + '\n' +
          '直前の確認問題: ' + item.q + '(答え: ' + item.choices[item.answer] + '、理由: ' + item.why + ')\n' +
          '生徒の質問: ' + text + '\n\n' +
          '日本語で、スマホで読める短さ(300字以内)で答えてください。具体的な数字の例を1つ使い、手順を分けて説明し、最後に「ここまでで分からないことは?」と聞いてください。表は使わないでください。';
        try { var res = await sample(prompt, { onText: function (u) { out.textContent = u.text; } }); out.textContent = res.text; }
        catch (e) { out.textContent = e && e.code === 'not_granted' ? '質問機能の利用が許可されませんでした。' : '今は答えられませんでした(' + (e && e.code || 'error') + ')。少し待ってもう一度どうぞ。'; }
        btn.disabled = false;
      };
    }

    // card for lesson / odds pages: "you seem to be stuck here, start from basics"
    ui.courseCard = function (a) {
      var label = a.done ? '復習する' : a.step ? '続きから(ステップ ' + Math.min(a.step + 1, a.total) + ')' : '1から始める';
      return '<div class="panel stack course-card' + (a.weak ? ' weak' : '') + '">' +
        '<div class="row" style="justify-content:space-between;flex-wrap:nowrap"><h3>' + (a.weak ? 'まず基礎から: ' : '') + esc(a.title) + '</h3><span class="num muted" style="font-size:12px;white-space:nowrap">' + (a.done ? '卒業済み' : a.step + ' / ' + a.total) + '</span></div>' +
        (a.weak ? '<p style="margin:0">記録を見ると、この分野でつまずいています。ポットの意味から1ステップずつ確認しましょう。</p>' : '<p class="muted" style="margin:0">いつでも1から学び直せます。</p>') +
        (a.reasons.length ? '<p class="muted" style="margin:0;font-size:13px">根拠: ' + esc(a.reasons.join(' · ')) + '</p>' : '') +
        '<div><button class="btn ' + (a.weak ? 'gold' : 'ghost') + ' small" data-course="' + a.area + '">' + label + '</button></div></div>';
    };
    ui.bindCourseButtons = function (root) {
      $all('[data-course]', root).forEach(function (b) { b.onclick = function () { ui.openCourse(b.dataset.course); }; });
    };
  };
})();
