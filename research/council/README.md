# Guardian Council ── 複数AIを使った、構造破壊の原因研究

**Councilは「複数のAIにGuardianを作らせる」仕組みではない。**
複数のAI(Claude・ChatGPT・Gemini など、モデルもハーネスも違うもの)を使って、
**「LLMがなぜ構造を壊すのか、その挙動をどう機械で止められるか」を研究する**ための手順である。

最終的な事実確認や「これはGuardianのルールにする/しない」の判定は、
AIの多数決ではなく、人と決定論的な仕組み(Guardian本体の検査・門・計器)に戻す。
AIは判定者ではなく、**仮説を出す・反論する・自分の案を壊す**ために使う。

---

## どこから読むか

| 読むもの | 中身 |
|---|---|
| **[VISION.md](VISION.md)** | 将来像(完成形のCouncil設計案)。**いま実装する要求ではない**。実験で必要性が確認されてから作る |
| [protocol/](protocol/) | **いま本当に使う最低限の手順**。今日から手動で回せる |
| [roles/](roles/) | AIに割り当てる役割の説明(固定しない ── ローテーションする) |
| `experiments/` | 実験1回ぶんの記録(問い・文脈・Round0/1/2の生の回答) |
| `findings/` | 実験から昇格した知見。ここだけが「読む価値のある結論」 |

---

## いまの段階(2026-08-29)

**コード0行。全部手動。** Claude Code(このセッション)・ChatGPT・Gemini の3者で、
人(あなた)が各AIへ同じ材料を渡し、回答を持ち帰ってこのリポジトリに記録する。

自動化(orchestrator・adapter・schema・worktree隔離)は**まだ作らない**。
VISION.mdにある通り、**Council自身が壊れる場面を先に観察してから**、
壊れた箇所にだけ機械を足す ── Guardian本体と同じ「事故駆動」の順序を、Council自身にも適用する。

## 進め方(1実験ぶん)

1. `experiments/EXP-NNN/question.md` と `context.md` を用意する(3者に**同じ材料**を渡す)
2. **Round 0(独立回答)**: 3者それぞれに単独で分析させる。互いの回答は見せない → `round0/{claude,chatgpt,gemini}.md`
3. **Round 1(相互批判)**: 3者の回答を全員に見せ、他案の見落とし・誤りを指摘させる → `round1/`
4. **Round 2(自己反証)**: 自分自身の案が失敗するケースを考えさせる ── defend ではなく destroy → `round2/`
5. 人がここまでの記録を読み、`findings/FIND-NNN.md` に**知見**(仮説・観測・反例・未解決・多数決はしない)をまとめる
6. Findingがそのまま Guardian のルールになるわけではない。反証・再実験を経て、
   十分な根拠が揃ったものだけが `RULES.md` / `check.mjs` の検査 / `WHY.md` の事故(由来=予防)に昇格する

詳しい各Roundのやり方は [protocol/](protocol/) を参照。

## 禁止事項(Councilが最初から捨てているもの)

- **多数決をしない。** 複数AIが同じ認知的癖を持っていれば、全員で同じ間違いをする
- **少数意見を消さない。** consensus/dissent/evidence/counterexample/unknown を全部残す
- **モデルと役割を固定しない。**「ClaudeはArchitect」のように決めると、モデルの性質なのか役割の効果なのか区別できなくなる
- **モデルとハーネスを混同しない。**「Claudeの癖」と思ったものが実は Claude Code というハーネスの編集戦略かもしれない
