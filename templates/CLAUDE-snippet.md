<!-- ↓ この5行が、AIが最初に読む文書(CLAUDE.md 等)へ貼られます。
     install.mjs が自動で貼ります。貼らないと、地図もフックも「置いてあるだけ」で誰も読みません。
     ★この注釈より下の箇条書きだけが貼られます(作業指示は貼られません)。 -->

- `docs/CODEMAP.md` — 機能→全接点の地図。**既存機能を改修する前に該当項を読み、列挙された全接点に触れたか(または触れない理由)を確認してから完了報告する。改修したら地図を更新する。** 地図に無い機能を触ったら項を足す。
- `guardian/METHOD.md` — **バイブコーディングの弱点と対策のまとめ(最初に読む)**。弱点6つ・対策5層(合否/門/検査/計器/規律)。
- `guardian/RULES.md` — 修繕の作法(推測しない・経路を数える・見えない失敗を作らない)。**実装の前に読む。**
- `guardian/WHY.md` — 各検査が生まれた事故。**検査を足すときは必ずここに1行足す。**
- **完了の判定は `node guardian/verdict.mjs`(合否)が行う** ── 通過 / 差戻 / 注意 / **不明** の4語。
  ★**不明は合格ではない**(測れなかった、という意味)。証拠は `guardian.config.json` の `evidence` に宣言する。
- **近傍照合の門**: `node guardian/neighbors.mjs --list` で修正の【2つ外側】を出し、
  `.guardian/neighbors.answer.json` に **触れた / 影響なし / 報告** + 理由を書く → `--gate` が通るまで完了を名乗らない。
  `--sweep` は全体の棚卸し(死にコード候補・写経の疑い・参照の集中点)。
- 検査: `node guardian/check.mjs`(塊そのものは `node guardian/selfcheck.mjs`)。**外部APIを触る変更をしたら、必ず1往復して中身を読んでから完了報告する**(「エラーが無い」と「中身がある」は別)。
- **この塊を導入した直後なら** `guardian/install.md` を読むこと(地図・不変条件・証拠を埋める手順が書いてある)。

<!-- .claude/settings.json にフックを登録(これが「触る前に地図を差し込む」部分)
{ "hooks": {
  "UserPromptSubmit": [{ "hooks": [
    { "type": "command", "command": "node guardian/hooks/clock.js", "timeout": 10 }]}],
  "PreToolUse": [{ "matcher": "Edit|Write", "hooks": [
    { "type": "command", "command": "node guardian/hooks/codemap.js", "timeout": 15 },
    { "type": "command", "command": "node guardian/hooks/no-fixed-names.js", "timeout": 10 }]}]
}}
-->
