# ポーカー道場

ノーリミット ホールデム(6人卓・100BB)の学習ツール。ブラウザだけで動きます。

- `engine.js` 役判定・レンジ解析・勝率計算(全通り/モンテカルロ)・プッシュ/フォールド均衡
- `solver.js` リバーのGTOソルバー(CFR+、カードリムーバル対応、誤差を表示)
- `data.js` プリフロップ表(簡易版)・シナリオ・理論・用語集・参考資料
- `app.js` / `index.html` 画面
- `data/equity169.json` 169種類の手どうしのオールイン勝率表(`tools/precompute-equity.js` で生成)

テスト: `node tools/test-engine.js` と `node tools/test-solver.js`
