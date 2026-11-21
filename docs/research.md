# ポーカー学習ツール 調査メモ(段階1)

前提: Texas Hold'em ノーリミット・6人卓・100BB・キャッシュゲーム
作成: 2026-11-21

> 注意: 「GTO(ゲーム理論最適)」はソルバーが出す**近似解**です。同じ状況でもソフトや設定(ベットサイズの選択肢・レーキ等)で数字は変わります。本ツールの数値は「目安」として扱います。有料教材の内容は丸写しせず、自分の言葉で要約し出典を付けています。

---

## 1. 情報源(おすすめ順)

### 書籍
- **Modern Poker Theory**(Michael Acevedo, 2019)… ソルバー時代のGTO入門の定番。プリフロップ〜ポストフロップの考え方。中級向け。[出版社](https://www.simonandschuster.com/books/Modern-Poker-Theory/Michael-Acevedo/9781909457898)
- **Applications of No-Limit Hold'em**(Matthew Janda)… レンジ単位で考える理論書。やや難。[PokerNews](https://www.pokernews.com/books/applications-of-no-limit-hold-em.htm)
- **The Mathematics of Poker**(Chen & Ankenman)… 数学的基礎。難しいので後回しでOK。[PokerListings書籍一覧](https://www.pokerlistings.com/poker-books-and-videos)
- 初心者向けの書籍一覧: [casino.org Top20](https://www.casino.org/blog/top-20-texas-hold-em-books/)

### 無料サイト
- **PokerStrategy.com 6-max プリフロップレンジ講座** … ポジション別のオープン・3bet・4betのサイズとレンジ例が具体的。ただしGTOではなく「NL200の標準的な相手」向けの実戦寄り。[概要](https://www.pokerstrategy.com/strategy/bss/no-limit-6-max-preflop-ranges/)
- **PokerSkill オープンレンジ表** … ポジション別のオープン表(簡略版)。[リンク](https://www.pokerskill.com/charts/opening-ranges/)
- **アウツ・オッズの早見表** … [BlackRain79](https://www.blackrain79.com/2021/07/poker-odds-cheat-sheet.html)、日本語なら [NT Poker(オッズ/アウツ)](https://ntpoker.jp/en/education/beginner/odds_outs)
- PokerNews 学習ハブ / レンジ表まとめ: [リンク](https://www.pokernews.com/poker-range-charts)

### YouTube(タイトル・概要ベース。動画の中身は直接は見ていません)
- 学習向けチャンネルの紹介記事: [BlackRain79のまとめ](https://www.blackrain79.com/2018/08/best-poker-youtube-channel.html)、[PokerStrategy「Strategy with Barry」紹介](https://www.pokerstrategy.com/news/content/The-best-free-strategy-resource-in-poker-l-Strategy-with-Barry_140778/)
- 使い方: 理論の「なぜ」を動画で聞き、数字はこのツールで練習、という分担が向いています。

---

## 2. 第1弾で使う内容

### 2-1. ポジション別オープン(RFI)レンジの目安(100BB)

出典ごとに幅があります(タイト〜ルース)。

| ポジション | PokerSkill(簡略) | PokerStrategy(実戦寄り) | ソルバー系の一般的な目安※ |
|---|---|---|---|
| UTG(LJ) | 約14% | 約13% | 15〜18% |
| HJ | 約19% | ― | 20〜23%(DeucesCracked記事も同じ) |
| CO | 約26% | 約32% | 27〜30% |
| BTN | 約43% | 約62% | 40〜48% |
| SB | 約33%(レイズorフォールド) | 約31% | 40%前後(リンプを混ぜる戦略もあり) |

※ソルバー系の目安は複数記事([DeucesCracked HJ/CO記事](https://www.deucescracked.com/blog/poker-hijack-cutoff-opening-ranges-6max-guide-2026)など)と一般的な数値から。正確な表は有料ソフト(GTO Wizard等)が持っているため、ツールでは**公開情報を元にした自作の近似表**を使う方針を提案します。

レンジ例(PokerSkill, UTG 約14%): 22+, ATs+, A5s-A2s, KTs+, QTs+, JTs, T9s, 98s, AJo+, KQo
レンジ例(PokerSkill, BTN 約43%): 22+, 全てのスーテッドA・K, Q4s+ …, A2o+, K8o+, Q9o+, J9o+, T9o, 98o

**サイズの目安**: オープン2〜2.5BB(SBは3BB)。3betはインポジションで約3倍、アウトオブポジションで約3.5〜4倍(例: 2.5BBオープンにBTNから7〜8BB、SBから9BB程度)。出典: PokerStrategy 各ポジション講座。

**3betの考え方(要点)**: 強い手(QQ+, AK)で価値の3bet、A5s〜A2sのような「ブロッカー」を持つ手でブラフ3bet。早いポジションのオープンほど相手のレンジが強いので3betも狭くする。

### 2-2. 確率・オッズ計算(練習問題の材料)

- **ポットオッズ**: コールに必要な勝率 = コール額 ÷(ポット + 相手のベット + コール額)
  - 例: ポット100にベット50 → 50 ÷ 200 = **25%** 勝てればコールしてよい
- **アウツ**: 次のカードで完成する枚数。フラッシュドロー9、オープンエンドストレートドロー8、ガットショット4、両方(コンボドロー)15前後
- **2と4のルール**: フロップ→ターンまで2枚見られるなら アウツ×4%、1枚だけなら アウツ×2%(アウツが多いと少し過大評価になる)
- **エクイティ**: 今オールインしたら何%勝つか(引き分けは半分)。例: AA vs KK ≒ 82%:18%、ペア vs 2枚オーバー ≒ 55:45
- **MDF(最低限守る頻度)**: 相手のベットに対しフォールドしすぎない目安 = ポット ÷(ポット + ベット)
- 出典: [Wikipedia: Pot odds](https://Www.Wikipedia.org/wiki/Pot_odds)、[ThePokerBank](https://www.thepokerbank.com/strategy/mathematics/pot-odds/)、[BlackRain79早見表](https://www.blackrain79.com/2021/07/poker-odds-cheat-sheet.html)

### 2-3. 主要用語(第1弾の解説ページ候補)

ポジション(UTG/HJ/CO/BTN/SB/BB)、RFI(最初のオープン)、3bet/4bet、レンジ、コンボ(AKs=4通り、AKo=12通り、ペア=6通り)、スーテッド/オフスーツ、ブロッカー、エクイティ、ポットオッズ、インプライドオッズ、EV(期待値)、GTO/エクスプロイト、Cベット、ドロー、ナッツ、SPR(スタックとポットの比)

---

## 3. ソルバーに近い計算をブラウザで作る方法

### 3-1. エクイティ計算(第1弾で実装可能)
- **役の判定器**: 7枚から最強の5枚役を高速判定する部品。既存の無料ライブラリあり([poker-odds-machine](https://github.com/emileindik/poker-odds-machine)、[holdem-monte-carlo-evaluator](https://www.npmjs.com/package/holdem-monte-carlo-evaluator)、Cactus Kev方式[poker-hand-evaluator](https://npmjs.org/package/poker-hand-evaluator))。自作も可能。
- **全数計算**: フロップ以降のハンドvsハンドは残りカードが少ないので全パターン計算 → **誤差ゼロ**。
- **モンテカルロ法**: プリフロップやレンジvsレンジはランダムに数万回配って平均。1万回で誤差 約±0.5%、10万回で約±0.15%。スマホでも1秒前後の見込み。
- → エクイティ計算は**有名ソフトとほぼ同じ精度が出せます**。

### 3-2. 最適戦略(GTO)の計算(第2弾向け、難しい)
- ソルバーは **CFR(反事実的後悔最小化)** という手法で、自分同士で何百万回も対戦させて戦略を近づけます。[解説(英語)](https://int8.io/counterfactual-regret-minimization-for-poker-ai/)
- **プリフロップ全体の計算はブラウザでは非現実的**(有料ソフトもサーバーで事前計算)。→ 第1弾は公開情報ベースの近似表を使う。
- **ポストフロップ**: ブラウザで動くオープンソースのソルバー [WASM Postflop](https://www.github.com/b-inary/wasm-postflop)([本体](https://www.github.com/b-inary/postflop-solver))がある。ただし開発は終了済み・ライセンスが厳しめ(AGPL系、要確認)・計算に数十秒〜数分とメモリが必要。
- → 第2弾の現実的な案: **代表的な場面を事前に計算して答えを保存**しておき、クイズとして出す。

---

## 4. 懸念点(判断していただきたいこと)
1. レンジ表は出典で幅が大きい(BTNで43%〜62%)。どれを「正解」にするか → 提案: ソルバー系の目安に近い中間の表を自作し、出典を併記
2. 有料ソフトの表そのものは使えない(規約・著作権)。精度は「有名ソフトに近い」までで、完全一致は無理
3. 第2弾のポストフロップは事前計算が必要で、作業量が大きい
