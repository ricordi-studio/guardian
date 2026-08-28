# EXP-001 Round 1 — ChatGPT Cross Review

**Status**: COMPLETED
**Review policy**: Round 0 の3回答(Claude / ChatGPT / Gemini)を比較する。目的は合意形成ではない。Strong points / Weak points / Missing assumptions / Possible false positives・false negatives / Unnecessary complexity / Evidence required を分けて記録する。また、元の `question.md` / `context.md` に無い事実を使っている箇所は、その内容が正しくても Round 0 の実験条件違反として扱う。

## 1. Claude案への批判

### Strong points
1.1 「検査が無かった」のではなく「宣言されていない領域は検査できない」と捉えた点。値の整合性ではなく、distribute/site-onlyという所属契約が存在しなかったこと自体を事故の中心に置いた。
1.2 allow-list + 網羅性検査をセットにした点。特に「未分類を赤にする」ことで「新しいものはデフォルトで配られる」を「新しいものはデフォルトで止まる」へ反転できる。
1.3 `pull.mjs`(実行する器)と境界を検査する器を分ける方向は、同じコードが自分自身を正しいと判定する構造より強い。
1.4 repo直下単位の分類でも「同じフォルダ内にdistributeとsite-onlyが混ざる」可能性をRiskとして未解決のまま残した点はよいUnknownの残し方。

### Weak points
1.5 **Round 0の入力条件を超えた情報を使っている。** `check.mjs`が「宣言と実装のずれを見る仕組み」であること、selfcheckの既存検査が9種類であること、RULES.md 44条、READMEの特定条項、WHY.md 189件など、`context.md`には無い情報が含まれている。内容の正誤とは別に、**Claudeが追加のrepo contextを参照した可能性を分離して扱う必要がある** ── これはCouncilの実験設計上重要な発見。
1.6 「distribute / site-onlyの2分類で完全」と仮定しているが、将来 generated / development-only / release-metadata / temporary のような第3分類以降が必要になる可能性を証明も否定もできていない。「2分類が正しい」ではなく「全項目が明示された有限の分類のどれかに属し、Unknownを許可しない」までを一般原則にすべき。
1.7 網羅性検査は「未分類」を見つけられるが、「`guardian.config.json` = distribute」のような**誤分類**は形式的に網羅性検査を通ってしまう。manifest exists + coverage complete は必要条件にはなり得るが、意味的に正しい分類であることの証明ではない。

### Missing assumptions
- `guardian.config.json` が配布境界宣言の正本として適切か
- 「配布対象」という情報をどこに置くのが最も自然か
- 分類単位がrepo直下・directory・fileのどれであるべきか
- `pull.mjs` と検査が同じ宣言を読むことで、共通原因故障が起きないか

### Possible false positives
網羅性検査を厳密にすると、開発者が一時的なファイルを置いただけでも赤になる可能性がある。

### Possible false negatives
すべての項目が分類済みでも、誤った分類は通る可能性がある。

### Evidence required
1. repo直下の現行項目がどの分類になるか
2. 2分類で本当に足りるか
3. 新規未分類ファイルを追加すると確実に赤にできるか
4. site-onlyを誤ってdistributeに分類したとき、別の仕組みで止められるか

## 2. Gemini案への批判

### Strong points
2.1 問題を「境界線が検査スコープに無かった」と簡潔に捉えた点。説明が短く、今回の問いに対してかなり直接的。
2.2 manifest化を「情報・作法・器」の分離として捉えた点 ──`pull.mjs`内の固定文字列から配布定義を外へ出し、器=`pull.mjs`/情報=配布対象定義へ分離しようとしている。Guardianの中心思想との整合性が高い。
2.3 実際の配布処理をfixtureで試す案。selfcheck側で実際の配布処理(またはそのロジック)を動かし、site-onlyが配布物へ混入していないことを確認する案は、今回の具体事故への回帰検査として有効。

### Weak points
2.4 「不可避的に発生する」は強すぎる。資料から言えるのは「条件が揃うと発生し得る一般化可能なパターン」まで。適切な物理分離や既存manifestが最初からあれば発生しない可能性があるため、「不可避」は過剰一般化。
2.5 「配布するべきファイル」または「除外するファイル」の定義、という二択を同格に扱っている。しかし今回の事故から見れば、deny-listよりallow-list + unknown failの方が明らかに強い。除外リストを情報へ移しただけでは「新しいsite-onlyファイルを宣言し忘れた→デフォルトで配布」という事故構造が残る。この2案を同格には扱うべきではない。
2.6 selfcheckの回帰試験だけでは一般化不足。`guardian.config.json`や`.guardian/`が混ざらないことをfixtureで確認しても、それは既知の事故には強いが、未知の新しいsite-onlyファイルの追加を自動検出できるとは限らない。「既知パスを覚えるテスト」だけでなく「未知の所属を許可しない契約」との組み合わせが必要。

### Missing assumptions
- manifestはallow-listなのかdeny-listなのか
- 未分類項目をどう扱うのか
- manifestの網羅性を誰が検査するのか
- selfcheckで本番`pull.mjs`を直接呼ぶのか、純粋な配布ロジックを分離するのか

### Possible false positives
manifestを必須化した場合、非配布の一時ファイルまで分類対象にすると開発作業を過度に止める可能性がある。

### Possible false negatives
既知site-onlyパスだけをfixtureで検査する方式では、新しい未分類パスを取り逃がす。

### Evidence required
新しい未知ファイルを1つ追加するという事故fixtureで赤になることを確認する必要がある。

## 3. ChatGPT Round 0 自己批判

### Strong points
3.1 「Physical Containment ≠ Semantic Membership」まで抽象化した点。「同じrepoに存在する ≠ 同じ配布集合に属する」と捉えたのは`pull.mjs`以外にも一般化しやすい。
3.2 Claude案と同様、「未分類を許可しない」まで踏み込んだ点は強い。
3.3 単一対策に依存せず、source classification / destination protection / regression test / physical separationを候補として分けた。

### Weak points
3.4 **Round 0としては対策を広げすぎた。** 今回問われたのは「なぜ検出できなかったか/一般化できるか/どう機械で防ぐか」であるのに対し、destination側の上書き許可・物理分離・複数分類・双方向防御まで広げた。これらは有力な候補ではあるが、**まだ必要性が事故から確認されていない器を先に増やす危険**がある。Guardianの「踏んだ石から作る」という考え方から見ると、Round 0では過剰。
3.5 独自用語(`Implicit Scope Boundary Failure` / `Physical Containment ≠ Semantic Membership`)を作りすぎた。説明には便利だが、新しい用語を増やすことで本質が隠れる可能性もある。Guardian内部に正式語として持ち込む必要性はまだない。
3.6 「全パス分類」が必要と決めるには早い。実際のGuardian repoで運用負荷を確認していない。より小さな契約で十分な可能性もある。

### Missing assumptions
- destination protectionが本当に必要か
- 物理分離した方がmanifestより単純か
- repo全体を分類する必要があるか、それとも配布入口だけの宣言で十分か

### Possible false positives
全パス分類は一時ファイルや開発補助物まで契約対象にしてしまう可能性がある。

### Possible false negatives
manifest上の誤分類は、ChatGPT案でも完全には解決していない。

### Evidence required
より複雑な防御層を作る前に、まず最小の「allow-list + unclassified = fail」だけで今回の再現fixtureが防げるか試すべき。

## 4. 3回答の共通部分

- **Consensus A**: 今回欠けていたのは、ファイル内容の整合性検査ではなく「何が配布物か」という境界契約
- **Consensus B**: 修正前の「repoにある全ファイル=配布対象」という暗黙前提が事故を可能にした
- **Consensus C**: `pull.mjs`内の固定除外だけでは、一般化された防止策として弱い
- **Consensus D**: 配布対象は何らかの形で明示的に宣言し、その宣言を機械検査する方向が有力
- **Consensus E**: 既知事故について、回帰試験を追加する価値がある

## 5. 3回答の重要な不一致

- **Dissent A ── deny-listでもよいか**: Geminiはallow-listまたはexclude-listを情報化、Claude/ChatGPTはallow-list優先+未分類を失敗させるべき、と主張。現時点ではClaude/ChatGPT側の方が今回の事故原因に対して強い(deny-listでは「新しいsite-only+除外宣言忘れ」を防げない)。
- **Dissent B ── どこまで分類するか**: Claudeはrepo直下を2分類、ChatGPTはより一般的な分類全域を提案、Geminiは粒度がほぼ未定義。この点はまだ証拠不足。Unknownのまま残すべき。
- **Dissent C ── selfcheckの役割**: Claude/Geminiはselfcheckへ新しい事故fixtureを追加する方向、ChatGPTは回帰fixtureは必要だが分類契約そのものと組み合わせるべき、とする。この3つは実際には競合せず、「契約検査+事故fixture」の二層にできる可能性がある。ただし実装前に既存selfcheckの責務を確認する必要がある。

## 6. Round 1で新たに見えた重要点

### 6.1 「宣言がある」だけでは足りない
今回3者ともmanifest/宣言へ寄ったが、相互批判すると「manifestが存在する」だけでは事故は止まらない。必要なのは少なくとも: 1. 対象資格がpositiveに宣言される 2. 未分類が失敗する 3. 実際の配布処理がその宣言以外をコピーできない 4. 既知事故fixtureで境界が破れないことを確認する、という複数条件。さらに「誤分類」自体をどう扱うかは残る。

### 6.2 今回の最深部は「新しい区別の発生を機械が知らない」こと
事故の表面: `pull.mjs`が全ファイルをコピーした。一段深い原因: 配布物/site-onlyの区別が宣言されていなかった。さらに深い問題: **構造変更によって新しい意味的区別が必要になったこと自体を、既存Guardianは知らなかった。** allow-listは今回の区別が既知になった後には強い。しかし、次の構造変更で、まだ名前すら無い新しい区別が必要になったとき、それをどう発見するかは未解決。これは今回の修正とは別の、より大きなGuardian研究テーマになり得る。

## 7. Round 1時点の暫定Finding

**Observation**: Guardian専用repo化によって「配布物/現場固有物」という新しい意味境界が生まれた。しかし既存Guardianには、その境界を表現する宣言も検査も存在しなかった。そのため`pull.mjs`は物理的包含(repoに存在する)を意味的所属(配布対象である)として扱った。

**Strongest current hypothesis**: 構造変更によって新しい意味境界が生じたとき、その境界が機械契約として追加されなければ、既存の自動処理は以前の暗黙前提のまま境界を越える。

**Smallest promising mechanism**: まず検証すべき最小案は「positive distribution declaration + unclassified = fail + pull uses declaration only + incident regression test」である。ただし、宣言の置き場所/分類粒度/2分類で足りるか/誤分類をどう扱うかはまだUnknown。

## 8. Round 2(Falsification)で壊すべきもの

Round 2では、この暫定案を守るのではなく壊す。最低限、次を反証対象にしたい。

- **Case A**: 新しいsite-onlyファイルを追加したが分類し忘れる → 本当に赤になるか
- **Case B**: site-onlyファイルを誤ってdistributeへ分類する → 検査を通ってしまうか
- **Case C**: 1ディレクトリ内部にdistributed/site-onlyが混在する → 現在想定する分類粒度が破綻するか
- **Case D**: manifest自身が壊れる/古くなる → `pull.mjs`と検査が同じ誤りを共有しないか
- **Case E**: 今回の事故だけを覚えた固定パスfixtureでは成功するが、未知名のsite-onlyファイルでは失敗する → 対策が一般化されているか

## 9. Round 1 conclusion

現時点で最も採用価値が高いのは「除外項目を増やす」ではなく「配布資格を正に宣言し、未分類を失敗させる」という方向。ただしRound 1で同時に「宣言と網羅性検査だけでは、誤分類そのものは機械的に証明できない」という限界も明確になった。したがって、ここでRuleへ昇格させるのは早い。次はRound 2でこの案を意図的に破壊し、どの失敗まで決定論的に閉じられるかを見るべき。
