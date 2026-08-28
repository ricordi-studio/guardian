# EXP-001 Round 2 — ChatGPT Falsification

**Status**: COMPLETED

**Proposal under attack**(Round 0/1で有力とした最小案):
```
positive distribution declaration
+ unclassified = fail
+ pull.mjs uses declaration only
+ incident regression test
```
1. 「配るもの」を正に宣言する 2. 未分類ファイルがあれば赤にする 3. `pull.mjs` はその宣言に含まれたものだけをコピーする 4. 今回の事故をfixture化して再発を検査する。この案を意図的に壊す。

## Case A — 誤分類は通る

宣言で `guardian.config.json` を誤って `distribute` に入れる。網羅性検査(全項目がdistribute/siteOnlyのどちらかに属するか)はPASSし、`pull.mjs`は宣言通りコピーする。結果、配布先固有の`guardian.config.json`を上書きし、今回とほぼ同型の事故が再発する。**この仕組みが保証するのは「分類されている」ことであって「正しく分類されている」ことではない。構文的完全性 ≠ 意味的正しさ。**

最小再現: `distribution.json` に `guardian.config.json` を `distribute` として書くだけで、`unclassified = 0` のまま事故を再現できる。

## Case B — 分類粒度が粗いと内部混在を見落とす

分類単位をディレクトリ単位にすると、`docs/` を丸ごと `distribute` にした場合、`docs/README.md`(配ってよい)と`docs/CODEMAP.md`(現場固有)が混在していても網羅性検査は通り、`CODEMAP.md`が混入する。**directory classificationではsame directory / different semantic ownershipを表現できない。**

## Case C — 強制分類が「誤った緑」を作る

分類を2種類(distribute/site-only)に限定すると、後から `generated-release-metadata` のような第3の意味を持つファイルが出てきたとき、「未分類=赤」の強制がLLMに「よく分からないがdistributeに入れる」という圧力をかけ、検査は緑になるが意味は間違っている。**Unknownを機械的に許さないことが、Unknownを正しく表現する代わりに既知分類へ押し込む圧力になり得る** ── Guardianの「不明を緑にしない」という考え方と逆転する危険。

## Case D — コピー側と検査側が同じ間違いを共有する

`pull.mjs` も境界検査も同じ`distribution.json`を読む設計にすると、manifestが間違っていてもcheckとpullは「manifest通り」に一致し続ける。**Guardianの元の強み(同じ意味の値が2箇所にあってずれたら落とす)とは逆に、1つの間違った正本を全員が忠実に読むという共通原因故障が起きる。** checkerとpullの実装にバグがなくても事故は起こる。

## Case E — fixtureが既知事故だけを覚える

回帰テストが `guardian.config.json` / `docs/CODEMAP.md` / `.guardian/` の3パスだけを固定で確認する設計だと、後日追加される新しい現場固有ファイル `LOCAL_STATE.json` が誤ってdistributeに分類されても、既存fixtureは全てPASSしたまま`LOCAL_STATE.json`だけが漏れる。**回帰テストが「事故の構造」ではなく「事故に登場した固有パス」を覚えているだけだから。**

## Case F — `pull.mjs` を通らない経路には効かない

`npx degit ricordi-studio/guardian guardian` という初回導入経路は`pull.mjs`の除外リストを知らず、repo内容をそのままコピーする。**私の案が`pull.mjs`の入力集合を安全化するだけなら、別の配布経路はその契約をバイパスできる。** ただし、この問題は元のEXP-001では対象外と明記されているため、EXP-001の対策として失格という意味ではない。「Guardianの配布境界を一般的に解決した」と主張するなら失敗例になる、という限定付き。

## Case G — 配るべきものを誤ってsite-onlyにすると静かに欠落する

新しい必須ファイル`runtime-policy.mjs`をLLMが誤って`site-only`に分類すると、網羅性検査はPASSし、pullはコピーしない。結果、配布先で必要なファイルが更新されない ──「余計なものを配る」事故の逆、「必要なものを配らない」事故になる。**positive allow-listは意図しない混入には強いが、意図しない欠落を自動的に解決しない。**

## Deep failure

上のケースをまとめると、Round 0案には根本限界がある。manifestを追加すると「宣言と実装の一致」は機械的に検査できるが、**「その宣言自体が現実の意味を正しく表しているか」までは自動的には保証できない。** implicit boundary → explicit boundaryにはできるが、wrong explicit boundaryまでは解けない。

### Candidate counterexample finding: Explicit Contract Can Be Consistently Wrong

**Observation**: 配布境界をmanifest化し、全項目分類・未分類を赤・pullはmanifestだけ参照・selfcheckで回帰試験、を導入しても、manifest自体の誤分類があれば、checkerとpullが同じ誤りに従って整合したまま事故を起こせる。

**General pattern**: single declared truth → multiple deterministic consumers → perfect consistency → wrong behavior。「ずれを検出する」だけでは、**同じ誤りに揃っている状態**を検出できない。

**What would be needed to close this?**(まだ結論にしない、候補のみ)
1. 独立した第二根拠 ── 配布manifestとは別の情報源から「このファイルは現場固有」を導ければクロスチェックできる。何を第二根拠にすべきかはUnknown
2. 物理構造で意味を表現 ── 配布物と現場固有物を物理的に別領域に置けばmanifestの判断量を減らせる可能性。Guardianに適切な構造かはUnknown
3. 実際の配布成果物を独立検査 ── source repoの分類ではなく、最終的に配られるartifactそのものに対して許される構造を検査する。「許される構造」を何から導くかという問題は残る

## Round 2 conclusion

Round 0案(positive declaration + unclassified=fail + pull uses declaration + regression fixture)は「暗黙の境界を明示契約へ変える」という意味では有効。しかしこれだけでは次を防げない: 1. 明示的な誤分類 2. 粗すぎる分類粒度 3. 新しい意味を既存分類へ押し込むこと 4. checkerとpullの共通原因故障 5. 既知パスだけを覚えた回帰テスト 6. `pull.mjs`を通らない別経路 7. 必須配布物の誤除外。**「未分類を赤にする」だけでは十分ではない。「誤って分類済みの緑」をどう扱うかが次の問題。** Round 2時点ではここが最大のUnknownである。
