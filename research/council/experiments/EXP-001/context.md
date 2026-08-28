# EXP-001: 文脈(3者に同じものを渡す)

## Guardianとは

Guardianは、「人がAIに指示して開発する」ときに機械で壊れを見張るツール群(Node標準機能のみ、外部依存ゼロ)。
中心にあるのは「同じ意味の値が2箇所にあってずれたら検査で落とす」という考え方。
検査自身が正しく動いているかを確かめる `selfcheck.mjs`(見本をわざと壊して赤くなるか確認する)も同梱している。

Guardianは1つの「正本」(GitHub: `ricordi-studio/guardian`)から、各プロジェクトへ
`npx degit ricordi-studio/guardian guardian` でコピーされて使われる。導入後、正本の更新を
取り込み直すための道具が `pull.mjs` である。

## `pull.mjs` の役割(修正前)

```
使い方:
  node guardian/pull.mjs           … 正本の最新を取り直す
  node guardian/pull.mjs --check   … 取らずに、正本と何が違うかだけ見る

処理の流れ:
  1. この現場(配布先)で selfcheck.mjs を回し、「配られたときの中身と違う」と出たら止める
     (配布先で塊自体を直していた場合、上書きすると直りが消えるため)
  2. 正本を一時領域に git clone する
  3. 一時領域の【全ファイル】を列挙し、配布先の対応ファイルと比較する
  4. 変わった/増えたファイルを一覧表示し、配布先へ上書きコピーする
```

**修正前は、手順3で「正本の全ファイル」をそのまま列挙していた。**
除外リストが存在しなかった。

## 起きたこと(2026-08-29、実際のインシデント)

Guardianはもともと、別プロジェクト(依頼主が言うところの「現場Aのセッション」)の中で
開発されていた。「正本はGitHub」と言いながら、実質の開発拠点は別にあり、**正本が事実上2つ**
存在していた。

これを解消するため、GitHub上の `ricordi-studio/guardian` を唯一の正本とし、
Guardian専用の開発用リポジトリ(このリポジトリ)を新たに作った。

ところが、**この専用リポジトリには、Guardian自身がこの現場で使うためだけのファイルも同居していた**:

```
guardian.config.json … Guardian自身の現場の宣言(check.mjs が読む設定)
docs/CODEMAP.md      … Guardian自身の地図(機能→接点の索引)
.guardian/            … Guardian自身の作業記録(近傍照合の回答・監査時刻など)
```

これらは「配布物」(他プロジェクトへ配る中身)ではなく、「Guardianというプロジェクトを
Guardian自身で監査するための、この現場固有のファイル」である。

分離した直後、動作確認のために別プロジェクト側から `pull.mjs` を実行したところ、
**正本の全ファイルがそのまま取り込まれ**、上記の「現場固有のファイル」が配布先の
`guardian.config.json`(検査43件の宣言)などを上書きしかけた。

気づけたのは、たまたま `git status` で「増えたファイル」を目視確認したからであり、
Guardian自身の機械検査(`check.mjs` / `selfcheck.mjs`)はこの種の混入を**検出しなかった**。

## この事故に対して行われた修正

`pull.mjs` に固定リスト(`現場のもの`)を追加し、そこに含まれるパス
(`guardian.config.json`, `docs`, `.guardian`, `.git`, `.github`, `node_modules`)を
コピー対象から除外するようにした。

```js
const 現場のもの = new Set(['guardian.config.json', 'docs', '.guardian', '.git', '.github', 'node_modules']);

const 一覧 = (dir, 元 = dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  if (現場のもの.has(e.name)) return [];              // 配らない
  const full = path.join(dir, e.name);
  return e.isDirectory() ? 一覧(full, 元)
                         : [path.relative(元, full).split(path.sep).join('/')];
});
```

## まだ残っている、より広い問題(★この実験の対象外だが、事実として記録する)

`pull.mjs` の除外リストは、**既に導入済みの配布先が `pull.mjs` を実行したとき**にしか効かない。
**新規プロジェクトが初めて `npx degit ricordi-studio/guardian guardian` を実行したとき**は、
`degit` はこの除外リストを一切知らない生のコピーであり、正本リポジトリの中身が
(`docs/`, `guardian.config.json`, `.guardian/`, 今回追加された `research/` を含めて)
そのまま新規プロジェクトの `guardian/` フォルダにコピーされる。
これが実際に問題を起こすかどうか、対策が要るかどうかは、**今回の実験の対象外**とする
(この文脈に含めたのは、事実関係を歪めずに渡すため)。

## Guardianが既に持っている、関連する設計原則

- **情報・作法・器を分ける**: 器(コード)は固有の文字列を持たない。固有名が許される場所は
  「運営専用の見本ファイル」1箇所に限定し、検査で固定する(METHOD.md)
- **R9(SPEC.md)**: エンジンはどの現場へ持って行っても同じ中身であるべき(`selfcheck` が見張る)
- **R10(SPEC.md)**: 配った先の直りが、元へ還る道がある(`--report` / 人の承認を挟む)
- **「構造を正したら、それまで要らなかった区別が要るようになる」**(この事故からの教訓、WHY.md)
  ── 同じ場所で開発していたときは「自分の現場のもの」と「配るもの」の区別が不要だった。
  正本を分離した瞬間に、それまで隠れていた前提(区別が要る)が姿を現した。
