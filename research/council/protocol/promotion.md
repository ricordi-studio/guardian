# Finding から Guardian のルールへ

## 多数決はしない

「Claude○ Codex○ Gemini○ Antigravity× → 3対1で採用」はやらない。
複数のLLMが同じ認知的傾向を持っていれば、全員で同じ間違いをする ── consensusは正しさの証明にならない。

`findings/FIND-NNN.md` には、判定ではなく**観測**を書く:

```
# FIND-NNN: <タイトル>

## Observation
Round 0〜2 から見えた現象を書く(意見ではなく、誰が何を言ったかの要約)

## Consensus
3者が一致した点

## Disagreement
一致しなかった点(★消さない)

## Evidence
裏付けとなる具体的な事実(コード・ログ・既存のWHY.mdの事故)

## Counterexample
Round 2 で出た反例

## Unknown
まだ分からないこと(★「不明」はGuardian本体と同じく失敗ではない。まだ表現できていない領域として残す)
```

## 昇格の経路

```
Incident(実在の事故)
  → Experiment(Council で3者に検討させる)
  → Finding(上のフォーマットで記録)
  → Hypothesis(一般化できそうな仮説)
  → Counterexample(反証を試みる。1回のCouncilで終わらせない)
  → Repeated Experiment(必要なら別の事故でも同じ仮説を試す)
  → Mechanism(機械的にどう抑止・検出するか具体化)
  → Guardian Rule(RULES.md の条文 / check.mjs の検査 / hooks の門 / WHY.md の事故として記録)
```

**Findingがそのまま採用にはならない。** 十分な根拠(反証を試みても崩れなかった)が揃うまでは
Findingのまま置いておく。急いでルール化しない ── Guardian本体の「文章だけでは守られない」原則の逆で、
**根拠が薄いうちに機械化すると、その機械自体が誤検出を生む**(README「配るときの約束」6:誤検出は検査全体の信用を殺す)。

## 弱い対策と強い対策

Findingを採用するとき、可能な限り自然言語の注意書きではなく、決定論的な仕組みへ変換する:

| 弱い | 強い |
|---|---|
| 「既存の構造を壊さないよう注意してください」 | 新規Domain typeの定義数を検査する |
| | Layer dependencyを検査する |
| | Unknown routing pathを拒否する |
| | Duplicated capabilityを検査する |

Guardianは「LLMに正しく考えさせる」だけでなく、「間違った行動を取れない環境を作る」ことを目標にする。

## 採用は人が決める

RULES.md / check.mjs / hooks への反映は、Guardian本体の「改善の還流」(README参照)と同じく
**人の承認を挟む**。AI(このセッションを含む)が勝手に取り込まない。
