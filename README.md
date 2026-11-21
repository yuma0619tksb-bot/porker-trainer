# ポーカー道場(porker-trainer)

Texas Hold'em ノーリミット・6人卓・100BB キャッシュの学習ツール。

- `app/index.html` + `app/engine.js` … ブラウザで開くだけで動く学習ページ(学ぶ / プリフロップ / オッズ / 勝率計算)
- `app/engine.js` … 役の判定、レンジ表の読み込み、勝率計算(全数計算とモンテカルロ法)
- `docs/research.md` … 調査メモ(出典つき)
- `tests/engine.test.js` … `node tests/engine.test.js` で計算の検算

レンジ表は公開されている複数の表の中間をとった自作の近似です。GTOソルバーの出力そのものではありません。
