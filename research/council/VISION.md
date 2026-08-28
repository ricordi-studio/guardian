# Guardian Council ── 将来像(VISION)

★**これは実装要求ではない。**完成形として「こうなり得る」という設計案であり、
[protocol/](protocol/) の手動実験を重ねて**必要性が確認された部分だけ**を実装する。
最初から全部作らない ── Guardian本体が「実際の事故から必要な契約を発見する」思想なのに、
Councilだけ先に器(orchestrator・adapter・schema・worktree)を固めるのは自己矛盾だから
(2026-08-29、ChatGPT との検討で合意)。

出典: 2026-08-29、依頼主が ChatGPT に相談して得た "Guardian Council Experiment Harness SPEC Draft v0.1"。
実装のたたき台としてではなく、**Councilが目指す完成形の記録**としてここに残す。

---

## 1. Purpose

Guardian Council Experiment Harness は、複数のLLM / Coding Agentを用いて、
LLMがソフトウェア構造を壊す挙動を観測し、その原因を分析し、その挙動を制御する方法を発見するための研究基盤である。

目的は、複数AIによる多数決や、AI同士に最終設計を決定させることではない。
Guardianが目指すものは、**情報・作法・器を適切に分離し、美しく構造化されたソフトウェアを、
LLM特有の悪い挙動を制御することで継続的に維持できる状態**である。Councilは、そのための実験装置である。

## 2. Core Principle

Councilでは、AIを判定者として扱わない。AIは、仮説を出す/設計を提案する/反論する/
失敗条件を探す/コードを書く/他のAIの案を批判する、ために使う。
最終的な事実確認や契約違反判定は、可能な限り決定論的な仕組みで行う。

```
LLM
 ↓
Proposal / Implementation / Critique
 ↓
Deterministic Observation
 ↓
Finding
 ↓
Guardian Rule / Contract / Test
```

Councilの目的は「正しい答えをAIに選ばせること」ではない。目的は、**未知の失敗パターンを発見すること**である。

## 3. Research Target

- **3.1 Local Optimization** ── 「既存構造との整合性」より「目の前の要求を最小差分で満たすこと」を優先する挙動
- **3.2 Structural Drift** ── 変更を繰り返すことで責務境界・レイヤー・データモデル・抽象化・命名・API境界が徐々に崩れる現象
- **3.3 Duplication by Convenience** ── 既存機能を再利用・拡張せず、似た処理を新たに作る挙動
- **3.4 Hidden Coupling** ── 短期的には動作するが、別モジュールや内部状態への暗黙依存を増加させる変更
- **3.5 Contract Avoidance** ── 既存契約を拡張するより、契約外の経路を追加して要求を満たそうとする挙動
- **3.6 Prompt Pressure Failure** ── 設計原則が文書化されていても、強い実装要求を受けるとLLMが原則より要求達成を優先する現象

## 4. Architecture(将来像)

```
research/council/
├── README.md
├── protocol/     ← experiment / debate / falsification / promotion
├── roles/        ← architect / skeptic / investigator / simplifier
├── schemas/      ← proposal / critique / finding の構造(★まだ無い)
├── adapters/     ← claude / codex / gemini / antigravity(★まだ無い)
├── orchestrator/ ← 自動実行(★まだ無い)
└── runs/         ← 自動実行の生ログ。原則gitignore。重要な発見だけ findings/ へ昇格
```

`runs/` は原則として研究中の一時データとし、必要なものだけを正式な Finding へ昇格させる。

## 5. Isolation(将来像)

各AIは同じ実験条件(同じ repository / commit / test state / incident / task)から開始するが、
**同じ作業ディレクトリを共有してはならない**(`worktrees/claude/`, `codex/`, `gemini/`, `antigravity/`)。
AI同士が直接互いの作業ツリーを変更してはならない。

## 6. Experiment Reproducibility

すべての実験について、最低限以下を記録する:

```
experiment_id
repository, repository_commit
provider, model, model_version
agent, agent_version
system_instruction, project_instruction
available_tools, permissions
input_prompt
start_state, result
diff, test_result, guardian_result
```

可能な限り、同じ条件で再実行できることを要求する。

## 7〜10. Council Protocol(4段階)

- **ROUND 0 — Blind Analysis**: 全AIに同じ入力を与える。互いの回答は見せない。各AIは独立して
  Observation / Hypothesis / Proposed mechanism / Expected benefit / Risk / Unknown を回答する。
- **ROUND 1 — Cross Review**: 各回答を他のAIへ公開し、Strong points / Weak points / Missing assumptions /
  Possible false positives / Possible false negatives / Unnecessary complexity / Evidence required を書かせる。
  目的は合意形成ではなく**見落としを増幅して発見すること**。
- **ROUND 2 — Falsification**: 各AIに自分自身の案を攻撃させる。「あなた自身の提案が失敗する具体的ケースを作れ」。
  出力: Counterexample / Failure condition / Why mechanism fails / Possible mitigation / Remaining unknown。
  **defend your proposal ではなく destroy your proposal を優先する。**
- **ROUND 3 — Experiment**(将来像): 各AIに独立worktreeで実際にコード変更を行わせ、diff / tests / Guardian checks /
  structural metrics を収集する。

## 11. No Majority Vote

Councilでは多数決を行わない。「3対1で採用」はやらない ── 複数のLLMが同じ認知的傾向を持つ可能性があるため、
Consensusは正しさの証明にならない。代わりに Consensus / Disagreement / Evidence / Counterexample / Unknown を保存する。
**少数意見を削除してはならない。**

## 12〜13. Role Separation / Agent ≠ Model

モデルごとに固定役割を割り当てない(「Claude=Architect」のように固定すると、モデル性能と役割効果を区別できない)。
実験ごとに役割をローテーションし、**Model effect / Role effect / Harness effect** を分離して観測する。

Councilでは Model / Agent Harness / System Prompt / Project Instructions / Tools / Permissions / Context / Repository
を区別する。「Claude Model + Claude Code」で起きた挙動を、単純に「Claudeの性質」と判断してはならない。
同じモデルでもハーネスによって挙動が変わり得る。

## 14〜15. Incident Corpus / Minimal Reproduction(将来像)

Guardianは実際の開発プロジェクトから発生した事故を `incidents/` に蓄積し(Context / Expected structure /
LLM request / Actual change / Why it looked reasonable / Why it was structurally wrong / Detection method /
Potential prevention)、可能なものは `fixtures/` に**最小再現ケース**を作る。
これにより同じ事故を Claude Code / Codex / Gemini / Antigravity / 将来のAgent に繰り返し与えられる。

## 16. Finding

Councilで発見された知見は Finding として記録する(例: Observation / Hypothesis / Observed比率 /
Potential mitigation / Counterexamples / Unknown)。

## 17. Promotion

Findingはそのまま Guardian Rule にはならない:

```
Incident → Experiment → Finding → Hypothesis → Counterexample → Repeated Experiment → Mechanism → Guardian Rule
```

十分に再現性がないものは UNKNOWN として残す。

## 18. Guardian Integration

Councilから発見された対策は、可能な限り自然言語の注意書きではなく、Contract / Static check / Structural check /
Test / Hook / Schema / Dependency rule / Architecture constraint へ変換する。
Guardianは「LLMに正しく考えさせる」だけでなく、「間違った行動を取れない環境を作る」ことを目標とする。

## 19. Research Loop

```
Real Project → Incident → Minimal Reproduction → Multi-Agent Experiment → Cross Review →
Falsification → Finding → Mechanism Proposal → Repeated Experiment → Guardian Rule → Real Project
```

## 20. Structural Goal

Guardianが最終的に守るものは、単なるコード品質ではない。**情報・作法・器の分離**である。
LLMが新しい要求を受けたとき、情報を変えるべき要求なのか/作法を変えるべき要求なのか/器を変えるべき要求なのか、
を混同すると構造劣化が起きる。Guardianはこの混同を、可能な限り機械的に検出・防止する。

## 21. Ultimate Question

「LLMに美しいコードを書かせるにはどうすればよいか」ではない。
「LLMが美しい構造を壊す典型的な行動を特定し、その行動が起こせない、または即座に検出される開発環境をどう設計するか」
であり、究極的には「LLM自身の判断能力に依存せず、美しい構造化が自然に維持される仕組みを作れるか」を研究する。

## 22. Non Goals

AIモデルランキング / Claude vs Codex vs Gemini の勝敗 / 回答多数決 / 最も賢いAIの決定 /
AIによる自動設計承認 / 完全自律開発 ── これらは目的としない。モデル比較は観測値として扱うが目的ではない。

## 23〜26. Phase 1〜4(将来像・段階的実装)

- **Phase 1**: Claude Code / Codex / Gemini CLI の3Agentのみ。`guardian council run <experiment>` で
  ROUND0(独立回答)→ROUND1(相互批判)→ROUND2(反証)→結果集約。出力は
  `research/council/runs/<experiment-id>/{manifest.json, claude/, codex/, gemini/, blind/, reviews/, falsification/, summary.json}`
- **Phase 2**: isolated git worktrees / implementation experiment / diff collection / Guardian automatic evaluation を追加
- **Phase 3**: Incident Corpus と連携し、`guardian council replay INC-014` のように過去の事故を現在のAgentへ再試験
- **Phase 4**: Guardianの変更そのものをCouncilで検証する(New Guardian Rule → Incident corpus replay →
  Before/After comparison)。新しいルールが本当に事故を減らしているかを測定する

## 27. Success Criteria

AIの評価点では測らない。既知事故の再発率 / 未知事故の発見数 / 構造違反検出率 / False Positive / False Negative /
UNKNOWN発生数 / 事故→Rule昇格数 / Rule導入前後の事故率 を見る。**UNKNOWNは失敗ではない**──
Guardianの契約でまだ表現できていない領域を示す研究対象である。

## 28. Principle

Councilの最重要原則: **AIの賢さを信頼してGuardianを作らない。**
AIの失敗を観測し、失敗のパターンを理解し、失敗できる自由を少しずつ削っていく。
その結果として、LLMが普通に開発しているだけなのに、構造が美しく保たれる状態を目指す。
それがGuardian Councilの最終目的である。
