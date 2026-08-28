# CODEMAP ── Guardian 自身の地図

★ここは塊が自分自身を開発する現場。塊の仕様は [SPEC.md](../SPEC.md) が正本で、
この地図には**この現場での作業の接点**だけを書く(仕様を写さない)。

(触った機能から書き足していく)

## AI Council(複数AIで構造破壊の原因を研究する場。2026-08-29導入)
- 入口: `research/council/README.md`(進め方・禁止事項)/ `research/council/VISION.md`(将来像。実験で必要性が確認されるまで実装しない)
- 手順: `research/council/protocol/experiment.md` / `research/council/protocol/debate.md` / `research/council/protocol/falsification.md` / `research/council/protocol/promotion.md`
- 実験記録: `research/council/experiments/EXP-001/`(被験体: `pull.mjs` の配布境界事故はなぜ機械検査で防げなかったか)
- ⚠罠の実績: 2026-08-29、正本を分けた直後に `pull.mjs` が正本の全ファイルを配布先へ流し込みかけた(このEXP-001自体がその事故を扱っている)。**`research/` は配布物ではない** ── `pull.mjs` の `現場のもの` に追加済み(触れずに新規フォルダを足すと、次の配布先へ混入する)
