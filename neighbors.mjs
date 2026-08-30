#!/usr/bin/env node
/**
 * 近傍照合の門(ADR-081)── 修正対象の【2つ外側】に答えるまで、完了を名乗れない
 *
 *   node guardian/neighbors.mjs --list   # 変更した記号と、その2近傍を列挙(回答の下書きも書く)
 *   node guardian/neighbors.mjs --gate   # 全近傍に回答が無ければ出口1(合否が差戻になる)
 *   node guardian/neighbors.mjs --gate --base HEAD~3..HEAD   # 範囲を指定して測る(検査用)
 *   node guardian/neighbors.mjs --sweep   # 差分ではなく【全体】を同じ物差しで一斉走査
 *       定期監査の観点3・4(死にコード・重複・メタ化)の下ごしらえ。
 *       呼ばれていない記号 / 複数ファイルに同名の関数(写経の疑い) / 参照の集中点 を列挙する。
 *       ★門(--gate)は変更の局所を見張り、走査(--sweep)は全体を棚卸しする ── 半径の門を
 *         いくら広げても重複には届かない(距離の現象ではない)ので、軸を分けた(2026-08-26 依頼主の問い)。
 *   node guardian/neighbors.mjs --escaped <元> <直し>   # 逃した事故の【環】を測って台帳に積む
 *       元 = バグを入れた変更(コミットか a..b の範囲) / 直し = それを直した変更。
 *       犯人が何環目に居たかを測り、.guardian/neighbors.escaped.json に記録する。
 *       環の数(rings)は信仰ではなく【この台帳】が決める ── 環2を超えた逃しが
 *       繰り返し出たら上げ、一度も出なければ2が実証されたことになる(2026-08-26 依頼主)。
 *
 * なぜこれが要るのか:
 *   「構造は常に見る」「症状の原因を構造に位置づけてから直す」は規律(言葉)としては
 *   最初からあった。それでも書き手(AI)は目の前の1点だけを直す ── 症状パッチは
 *   バグではなく、訓練された習性だからである(2026-08-26 の対話で言語化)。
 *   言葉で直らないものは機械で挟む。これはこの塊の一貫した答えである
 *   (門 no-reflex / ラチェット check と同じ系譜)。
 *
 * 何を強制するか:
 *   「考えたか」は検証できない。検証できるのは【考えた痕跡】である。
 *   そこで機械が修正対象の近傍(呼び出し元とその呼び出し元・ノートの欄の読み手)を
 *   自分で計算し、書き手にその全項へ【触れた / 影響なし / 報告】+理由を答えさせる。
 *   答えの無い近傍が1つでもあれば、完了を名乗れない。
 *
 * 不動点(無限の入れ子はここで止まる):
 *   「触れた」と答えた近傍は差分に入るので、その近傍がまた列挙される。
 *   修正が伝播しなくなった点で列挙が増えなくなる ── どこで止まるかは
 *   構造の健全さの測定でもある(綺麗な境界で止まり、腐っていれば書き始めまで伸びる)。
 *
 * 答えの意味:
 *   触れた   … この修正で一緒に直した(差分に入っていなければ嘘として差戻)
 *   影響なし … 見た上で、変更が波及しない理由を書く
 *   報告     … 直すべきだが今回の範囲外。理由ごと人間への報告に載る
 *              (開発側は勝手に直さない ── 判断は依頼主が持つ)
 *
 * この道具は現場固有のことを1つも持たない(RULES.md 39条)。
 *   どの範囲を見るか・何段見るかは guardian.config.json の neighbors が宣言する。
 *   宣言が無い現場では静かに素通りする(押し付けない)。
 *
 * 限界(正直に):
 *   ・回答の中身の真偽までは検証しない。強制するのは【黙って飛ばせない】ことまで
 *     (嘘は書けるが、監査できる形で書くしかなくなる ── 地図の「触れない理由」と同じ水準)
 *   ・近傍が自分のコードの外(相手APIの状態機械)にあるものは見えない。
 *     そこは実測と計器の層が受け持つ(2026-08-26 の「話し終わりの合図」事故)。
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/* ★【この道具が知っている口】── 宣言ではなく、ここが実装そのものである
 *   (2026-08-31、第2の議題。配布先(現場A)の実測が発端)。
 *
 * ★実際に起きたこと: 案内されている口を「ソースにその文字列が在るか」で照合したら、
 *   3通りの数え方で3通りの答えが出た。とくに `neighbors --list` は**文字列としては在るが、
 *   argv を見ていない**(既定動作だった)── **書いてある ≠ 口として在る**。
 *   これは 9.46 で `PROTOCOL.json` に置き換えたばかりの「綴りで能力を測る」罠と同じ形である。
 * ★だから【この配列が唯一の正】にする: ここが未知の口を拒み、ここが `--口一覧` を答える。
 *   selfcheck の B11 が、SPEC.md の表と**この出力**を突き合わせる(44条の双子)。
 * ★穴として書く: これが証明するのは「その口を受け付ける」までで、
 *   **その口が仕事をする**ことではない。そこは各口の検査の仕事。 */
const 知っている口 = ['--口一覧', '--list', '--gate', '--sweep', '--定義一覧', '--跨ぐ記号', '--root', '--base', '--escaped'];
const 値を取る口 = { '--root': 1, '--base': 1, '--escaped': 2 };
const 残りを全部取る口 = [];
/* ★順番: **未知の口の走査が先、`--口一覧` は後**(2026-08-31、配布先の実測)。
 *   検査は `--口一覧 --zzz` の形で叩く ── 門が生きていれば **出口1**、
 *   門が壊れていれば `--zzz` が無視されて **口一覧が出て出口0**。
 *   ★逆順だと、門が壊れていても口一覧が先に出て**緑に見える**。
 *   ★そして「壊れている側で、その道具が本当に走り出す」ことも避けられる ──
 *     素の `--zzz` で叩くと、門が壊れた `verdict` は**本物の合否を回し始める**(検査が検査を呼ぶ)。 */
{
  const 渡された = process.argv.slice(2);
  const 知らない = [];
  const 足りない = [];
  for (let i = 0; i < 渡された.length; i++) {
    const v = 渡された[i];
    if (!v.startsWith('--')) continue;          /* 口の値は飛ばす */
    if (残りを全部取る口.includes(v)) break;     /* ここから先は全部その口の値 */
    if (!知っている口.includes(v)) { 知らない.push(v); continue; }
  /* ★【値が足りない】も言う(2026-08-31、配布先が境界を叩いて見つけた)。
   *   直す前は、2つ取る口に1つしか来なくても**黙って通していた** ──
   *   その先で `undefined` を値として使い、**遠くで分かりにくく壊れる**。
   *   ★害が無いから放っておく、ではなく **「言ってもいない」のが問題**である(46条の形)。
   *   ★数えるのは【後ろに残っている数】だけ ── 値の中身は見ない(パスにも SHA にも見えるので)。 */
    const 要る = 値を取る口[v] || 0;
    if (要る && i + 要る >= 渡された.length + 0) {
      /* 後ろに 要る 個そろっていない */
      足りない.push(v + "(値が " + 要る + " 個要りますが " + (渡された.length - i - 1) + " 個です)");
    }
    i += 要る;
  }
  if (足りない.length) {
    console.error('✗ 口に渡す値が足りません: ' + 足りない.join(', '));
    console.error('  ★黙って進むと、その先で値なしのまま使われ、**遠くで分かりにくく壊れます**');
    process.exit(1);
  }
  if (知らない.length) {
    console.error('✗ この道具は、その口を知りません: ' + 知らない.join(', '));
    console.error('  知っている口: ' + 知っている口.join(' / '));
    console.error('  ★黙って無視すると、打ったつもりと違う動きをしたまま報告することになります');
    process.exit(1);
  }
}
if (process.argv.includes('--口一覧')) {
  /* ★口の名前と【いくつ値を取るか】を出す(2026-08-31、配布先の実測から)。
   *   名前は先頭のままなので、名前だけ読む側は壊れない。
   *   個数が在ると、検査の側が**叩き方を自分で組み立てられる** ──
   *   0なら「次の未知の口は飲まないはず」、1なら「飲むはず」、* なら「全部飲むはず」。
   *   ★これが無いと、検査は口の個数を**写経する**ことになる(39条)。 */
  process.stdout.write(知っている口.map((口) => 口 + " "
    + (残りを全部取る口.includes(口) ? "*" : String(値を取る口[口] || 0)))
    .join(String.fromCharCode(10)) + String.fromCharCode(10));
  process.exit(0);
}

const argv = process.argv.slice(2);
const rootArg = argv.indexOf('--root');
const ROOT = path.resolve(rootArg >= 0 ? argv[rootArg + 1] : process.cwd());
const GATE = argv.includes('--gate');
const baseArg = argv.indexOf('--base');
const BASE_OVERRIDE = baseArg >= 0 ? argv[baseArg + 1] : '';
const escArg = argv.indexOf('--escaped');
const ESCAPED = escArg >= 0 ? [argv[escArg + 1], argv[escArg + 2]] : null;
const SWEEP = argv.includes('--sweep');
const 定義一覧 = argv.includes('--定義一覧');
const 跨ぐ記号 = argv.includes('--跨ぐ記号');

const read = (p) => { try { return fs.readFileSync(path.join(ROOT, p), 'utf8'); } catch (_) { return ''; } };
/* ★失敗を空文字と区別する(2026-08-30、違和感の掘り出しで見つかった)。
 *   直す前は `r.status === 0 ? (r.stdout||'') : (r.stdout||'')` と**両辺が同じ**で、
 *   git の失敗が「出力が空」と見分けられなかった。
 *   実測: CI が既定でやる浅いクローン(--depth 1)では `HEAD~1..HEAD` が
 *   fatal: unknown revision で落ちる → 差分が空 → 触れた記号ゼロ → 近傍ゼロ →
 *   **門が出口0で「通過」**。いちばん効いてほしい CI で、門が最初から死んでいた。
 * ★測れなかったことは黙らない ── 呼ぶ側が【不明】に落とせるよう、失敗を返り値で伝える。 */
/* ★シェルを通さない(2026-08-30、違和感の掘り出しで見つかった)。
 *   直す前は1本の文字列を `shell: true` で渡していたので、**経路を自分で括る必要**があり、
 *   `git show <版>:<経路>` は括られていなかった。
 *   実測: `src/my file.js`(空白入り)を含むリポジトリで `--escaped` を回すと git が落ち、
 *   その失敗が握り潰されて **「測れません: 元の変更に器のコードが無い」** と出た ── **嘘の説明**。
 *   空白を消しただけの対照では「環0」と正しく出る。
 * ★引数の配列で渡せば、括る作法そのものが要らなくなる(括り忘れが起きる場所を消す)。
 *   9.16 まで居た sh / shRaw(名前を囲まない ── もう実装に無いので)は、同じ仕事をシェル経由でやっていた。 */
const gitRaw = (...args) => {
  const r = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8', windowsHide: true, maxBuffer: 128 * 1024 * 1024 });
  return { ok: r.status === 0, out: r.stdout || '', err: String(r.stderr || '').trim(), code: r.status };
};
const 測れなかった = [];
const git = (...args) => {
  const r = gitRaw(...args);
  if (!r.ok) 測れなかった.push('git ' + args.slice(0, 2).join(' ') + ' … ' + (r.err.split('\n')[0] || ('出口' + r.code)));
  return r.out;
};

/* ★【測れなかった】を通過にしない(2026-08-30)。
 *   出口: 0=通過 / 1=差戻 / 2=不明。合否(verdict)は 2 を「不明」として扱い、緑に数えない。
 *   直す前は、次のどれも出口0(通過)だった ── どれも「測っていない」であって「問題なし」ではない:
 *     ・git が失敗した(浅いクローン・git 無し・非 git)
 *     ・宣言に neighbors が無い
 *     ・コーパスが0ファイル(code / ext の指定を外した)
 *   実測: `code:["app"]`(場所を間違えた)でも `ext:["ts"]`(拡張子を間違えた)でも【通過】した。
 *   **宣言を間違えた現場では、門が最初から最後まで緑**になる。 */
function 不明で終わる(理由) {
  console.log('近傍照合: **測れませんでした(不明)** ── ' + 理由);
  console.log('  ★これは「問題なし」ではありません。測れていないので、通過に数えないでください。');
  process.exit(2);
}

/* ---------- 宣言を読む(verdict / check と同じ2箇所) ---------- */
let cfg = null;
for (const p of ['guardian.config.json', 'guardian/guardian.config.json']) {
  const t = read(p);
  if (!t) continue;
  try { cfg = JSON.parse(t); break; } catch (_) {}
}
const N = cfg && cfg.neighbors;
if (!N || N.enabled === false) {
  不明で終わる('宣言に neighbors がありません(guardian.config.json に書くと測れるようになります)');
}
const RINGS = Number(N.rings) || 2;
const CODE_DIRS = N.code || [];
const NOTE_DIRS = N.notes || [];
const EXT = new RegExp('\\.(' + (N.ext || ['ts', 'mjs', 'js', 'html', 'gs']).join('|') + ')$');
const ANSWER_PATH = N.answer || '.guardian/neighbors.answer.json';
const NEED_PATH = N.need || '.guardian/neighbors.need.json';
const MAX_CALLERS = Number(N.max_callers) || 40;
const SKIP_TOUCHED = (N.skip_touched || []).map((s) => new RegExp(s));
const IGNORE = new Set(N.ignore_symbols || []);
/* ★コーパスから外す場所(2026-08-30 監査で見つかった)。
 *   実験用の見本・写経の再現・生成物のように、**重複していることが正しい**場所がある。
 *   実測: 実験室(同じ仕様から3体に独立に実装させた)を足した日、写経の疑いが 12件 → 46件になった。
 *   増えた34件は**全部が意図した重複**で、これは誤検出である ── 誤検出1件が検査全体の信用を殺す
 *   (README の約束6)。**どこを外すかは現場ごとに違うので、宣言が持つ。** */
const SKIP_DIRS = (N.skip_dirs || []).map((s) => String(s).replace(/^\.\//, '').replace(/\/+$/, ''));
const inSkipped = (p) => SKIP_DIRS.some((d) => p === d || p.startsWith(d + '/'));
/* ★【全ファイルが同じ大域スコープを共有する現場】を宣言できるようにする
 *   (2026-08-30、配布先からの報告③)。
 *
 *   報告者の実測: `--sweep` の死にコード候補に、実際は呼ばれているものが2件出た。
 *     ・HTML から呼ぶ記号(theme.js)… **HTML の中の <script> から呼ぶ**古典スクリプト(export が無い)
 *     ・GAS の記号(app.gs → main.gs)… **GAS は全ファイルが同じ大域スコープ**
 *   どちらも「export の橋が無いから届かない」という前提が、その言語では成り立たない。
 * ★形が決まっているので機械で拾える ── ただし**どの拡張子がそうかは現場ごとに違う**ので、宣言が持つ。
 *   書かなければ何も変わらない(押し付けない)。 */
const 大域スコープ = new RegExp('\\.(' + (N.global_scope || []).join('|') + ')$');
const 大域か = (f) => (N.global_scope || []).length > 0 && 大域スコープ.test(f);

/* ---------- 差分を読む(汚れた作業木があればそれ、無ければ直前のコミット) ---------- */
const dirty = git('status','--porcelain').trim();
const range = BASE_OVERRIDE || (dirty ? 'HEAD' : 'HEAD~1..HEAD');
const diff = git('diff','-U0',range);
/* ★git が答えなかったら【不明】。空の差分と区別する(2026-08-30)。
 *   CI は既定で浅く取る(--depth 1)ので `HEAD~1..HEAD` が落ちる。
 *   直す前はそれが「差分ゼロ=近傍ゼロ=通過」に化けていた。 */
/* ★差分が要らない口は、ここで止めない(2026-08-31、配布先の現場で出た)。
 *   --定義一覧 と --sweep は【全体】を見る口で、差分を一度も使わない。
 *   ところがこの門が先に立っていたので、**commit が1つしか無い現場では答えられなかった**。
 *   実測: 新しく建てた現場(seed の1コミットだけ)で --定義一覧 が出口2になり、
 *   A5 が「見ていません」になった ── 見られるはずのものが見られていなかった。
 * ★門そのものは残す(差分を使う口では、測れないことを黙って通さない)。 */
const 差分が要らない = 定義一覧 || 跨ぐ記号 || SWEEP;
if (測れなかった.length && !差分が要らない) {
  不明で終わる('git が答えませんでした ── ' + 測れなかった.join(' / ')
    + '\n  (CI の浅いクローンなら fetch-depth を増やすか、--base で範囲を指定してください)');
}

/** 差分から【新しい側の行番号】を拾う。
 *
 * ★【中身が変わっていない行】は数えない(2026-08-28)。
 *   通行印を一括で書き換えたとき(codemap:ok → guardian:ok)、コメントしか変わっていないのに
 *   **31件の近傍に答えを求められた**。ロジックは1文字も動いていないので、答えは全部
 *   「影響なし・コメントだけ」になる ── それは門ではなく【儀式】である。
 *   答えを埋めれば通る門は、次に本物が来たときも同じように埋められて通る。
 * ★だから、消えた行と足された行が**コメントと空白を除いて同じ**なら、その行は数えない。
 *   除いた件数は黙らず表に出す(何を見なかったかが分からない計器は、計器ではない)。
 * ★コメントの形は、行コメント・囲みコメント・HTMLコメントの3種を素にする で落とす。
 */
/* ★`#` をコメントと見なしてよいのは【その言語だけ】(2026-08-30、違和感の掘り出しで見つかった)。
 *
 *   直す前は拡張子に関係なく `(^|\s)#` から行末までを落としていた。
 *   だが `#` がコメントなのは shell / Python / Ruby / YAML などで、
 *   **HTML・CSS では ID セレクタ、JS では私有フィールド**である。
 *   ★既定の `ext`(install.mjs が書く)には **html が入っている**ので、これは特別な設定ではない。
 *
 *   実測①: `.html` の `  #main .row { … }` を `#side` に変える(直下の
 *   `querySelector(" #main")` が壊れる)→ 門は **「コメントと空白だけの変更 1行は数えていません」**。
 *   黙って見逃すのではなく、**嘘を言っていた**。
 *   実測②: JS のクラス私有フィールド `  #count = 0;` も行頭の空白+# で丸ごと落ちる。
 *
 * ★知らない拡張子では**落とさない**(安全な向き)。落とさなければ門が鳴るだけで済むが、
 *   落とすと**見えない失敗**になる ── どちらに転ぶか分からないときは、鳴る側へ倒す。 */
const 井桁がコメントの言語 = /\.(sh|bash|zsh|py|rb|pl|r|yml|yaml|toml|ini|conf|cfg|mk|gitignore|dockerfile|ps1)$/i;
const 素にする = (s, f) => {
  let t = String(s)
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/g, '$1');    // URL の // は消さない
  if (f && 井桁がコメントの言語.test(f)) t = t.replace(/(^|\s)#.*$/g, '$1');
  return t.replace(/\s+/g, ' ').trim();
};

let 数えなかった = 0;
function parseDiff(text) {
  const out = new Map();     // file -> Set(新しい側の行番号)
  let file = null;
  /* 塊(hunk)ごとに、消えた行と足された行を溜めて突き合わせる */
  let 保留 = null;
  const 締める = () => {
    if (!保留) return;
    const { f, s, n, 消, 足 } = 保留;
    保留 = null;
    /* 中身(コメントと空白を除く)が同じなら、その塊は数えない */
    const 素 = (l) => 素にする(l, f);
    if (消.length && 足.length && 消.map(素).join('\n') === 足.map(素).join('\n')) {
      数えなかった += 足.length;
      return;
    }
    const set = out.get(f) || new Set();
    if (n === 0) set.add(Math.max(1, s));            // 純削除も、その位置の持ち主に答えさせる
    for (let k = 0; k < n; k++) set.add(s + k);
    out.set(f, set);
  };
  for (const line of text.split('\n')) {
    const f = line.match(/^\+\+\+ b\/(.*)$/);
    /* ★経路に空白があると、git は見出しの末尾に**タブ**を足す(2026-08-30、掘っている最中に見つかった)。
     *     +++ b/src/my file.js<TAB>
     *   落とさないと拡張子の判定(`.js` で終わるか)が外れ、**そのファイルは門から丸ごと消える**。
     *   実測: `src/my file.js` を直しても「器のコードに変更なし」。--escaped は
     *   「元の変更に器のコードが無い」という**別の理由**を表示していた。
     *   ★「空白入りの経路」は、この塊が既に2度踏んでいる形である(install.mjs の冒頭 / --escaped)。
     *     こちらの現場に空白が無いので、実測しないと一生出ない。 */
    if (f) { 締める(); file = f[1].replace(/\t$/, ''); continue; }
    if (line.startsWith('--- ')) continue;
    const h = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
    if (h && file) {
      締める();
      保留 = { f: file, s: +h[1], n: h[2] === undefined ? 1 : +h[2], 消: [], 足: [] };
      continue;
    }
    if (!保留) continue;
    if (line.startsWith('-')) 保留.消.push(line.slice(1));
    else if (line.startsWith('+')) 保留.足.push(line.slice(1));
  }
  締める();
  return out;
}
const changed = parseDiff(diff);

/* ★"."(現場の根)は、直下のファイルも含む(2026-08-30、掘っている最中に見つかった)。
 *   直す前は f.startsWith("./") を見ていたので、code:["."] と宣言した現場では
 *   **直下のファイルが1つも「器のコード」と見なされなかった**。
 *   この塊自身がその宣言なので、--escaped が常に「元の変更に器のコードが無い」と言い、
 *   **環の測定が一度も動いていなかった。** */
const inDirs = (f, dirs) => dirs.some((d) => d === '.' || d === './' || f === d || f.startsWith(d.replace(/\/?$/, '/')));
const isCode = (f) => inDirs(f, CODE_DIRS) && EXT.test(f);
const isNote = (f) => inDirs(f, NOTE_DIRS) && /\.json$/.test(f);

/* ---------- コードの全体(コーパス)を1回だけ読む ---------- */
const IDENT = '[$A-Za-z0-9_\\u3040-\\u30FF\\u4E00-\\u9FFF]';
/* ★`class` を定義として数える(2026-08-30、9.18 の作業中に気づいた)。
 *
 *   直す前が拾ったのは `function` と `const` / `let` だけだった。**`class Foo {}` は定義にならない。**
 *   クラスの中身は字下げされているので(コードのファイルは行頭定義だけを上位の記号と数える)
 *   メソッドも拾えず、**そのファイルは丸ごと持ち主なしになる。**
 *
 *   実測: `class Cart { total(){ … * (1 + tax) } }` から税の掛け算を落とす(本物の破壊)→
 *   **「触れた記号: (器のコードに変更なし)」・近傍なし**。しかも何も言わない。
 *   ★JS/TS の現場の多くはクラスで書かれている。**そこでは門が丸ごと盲目**だった。
 *   この現場は関数と const だけなので、一生出ない条件である(物差しの項と同じ形)。
 *
 * ★ついでに取りこぼしていた形: `export default`(既定書き出し)/ `var` / 生成器 `function*`。
 *   function と名前の間には**空白か * が要る**ようにしてある(名前が地続きの綴りを拾わないため。
 *   ここは実装の記号ではなく綴りの説明なので囲まない)。 */
const DEF_FN = new RegExp('^(?:export\\s+)?(?:default\\s+)?(?:async\\s+)?function(?:\\s+|\\s*\\*\\s*)('
  + IDENT + '+)');
const DEF_CLASS = new RegExp('^(?:export\\s+)?(?:default\\s+)?class\\s+(' + IDENT + '+)');
const DEF_CONST = new RegExp('^(?:export\\s+)?(?:const|let|var)\\s+(' + IDENT + '+)\\s*[=:]');
/* ★TypeScript の【型】も定義として数える(2026-08-31、第2の議題)。
 *
 * ★実測(見本): `interface 名札の形` の中身を書き換えると、門は
 *   **「器のコードに変更なし」**と言い、近傍を1件も出さなかった ── class のときと同じ形である。
 *   ただし黙ってはいない(9.19 で入れた「持ち主の記号が引けなかった」が出る)。
 *   **黙らないが、届かない。**
 * ★TS の現場では、型は**接点そのもの**である ── 型を1つ変えると、
 *   それを受ける全部の関数が影響を受ける。むしろ関数より波及が広い。
 * ★`type` は右辺が別行に続くことがあるので `=` を要求しない(`type X =` も `type X<T> =` も拾う)。
 * ★fn: true にはしない ── --sweep の「写経の疑い」は処理の重複を探すものなので、
 *   同名の型が2箇所に在ることは、同名のクラスとは意味が違う(7条: 鳴りすぎさせない)。 */
const DEF_TYPE = new RegExp('^(?:export\\s+)?(?:declare\\s+)?(?:abstract\\s+)?(?:interface|type|enum)\\s+(' + IDENT + '+)');
const WORDCHAR = new RegExp(IDENT);
/* ★長さの閾値は【ASCIIの物差し】である(2026-08-30、違和感の掘り出しで見つかった)。
 *
 *   `x` `i` `_` のような1文字は雑音だから落とす ── これはラテン文字の話で、
 *   **日本語では1文字が1語**である(仮・始・終・前・率・語・出・先・外…)。
 *   実測: `pull.mjs` の `const 仮`(= `rmSync(recursive, force)` が消す先)の行を書き換えたら、
 *   触れた記号は **`走る`** ── 3つ前の無関係な関数だった。定義として数えられないので、
 *   その行は**手前の定義の持ち物**として集計される。**門が別の記号について尋ねる。**
 * ★この塊自身が日本語で書かれているので、これは毎日効いている。 */
const 日本語を含む = (n) => /[぀-ヿ々一-鿿]/.test(n);
const 語として十分 = (n) => n.length >= 2 || 日本語を含む(n);

function walk(dir, out) {
  let ents = [];
  try { ents = fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }); } catch (_) { return out; }
  for (const e of ents) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = dir + '/' + e.name;
    if (inSkipped(p.replace(/^\.\//, ''))) continue;                 // 宣言で外した場所
    if (e.isDirectory()) walk(p, out);
    else if (EXT.test(e.name)) out.push(p);
  }
  return out;
}
/* ★経路の表記を揃えてから重複を落とす(2026-08-30 監査で見つかった)。
 *   宣言が [".", "hooks"] のように**重なる場所**を挙げていると、同じファイルが
 *   "./hooks/clock.js" と "hooks/clock.js" の2通りで入り、**同じ1ファイルを写経だと報告する**。
 *   実測: 写経の疑い12件のうち**10件がこれ**だった ── 表記ゆれは重複ではない。 */
const corpusFiles = [...new Set(CODE_DIRS.flatMap((d) => {
  const abs = path.join(ROOT, d);
  try { return fs.statSync(abs).isDirectory() ? walk(d, []) : (EXT.test(d) ? [d] : []); } catch (_) { return []; }
}).map((f) => f.replace(/^\.\//, '')))];

/* ★コーパスが0ファイルなら【不明】(2026-08-30)。宣言の code / ext を間違えると起きる。
 *   実測: code:["app"](場所違い)でも ext:["ts"](拡張子違い)でも、直す前は【通過】した ──
 *   **宣言を間違えた現場では、門が最初から最後まで緑**になっていた。 */
if (!corpusFiles.length) {
  不明で終わる('コードが1ファイルも見つかりません(宣言 neighbors.code=' + JSON.stringify(CODE_DIRS)
    + ' / ext=' + JSON.stringify(N.ext || []) + ' を確かめてください)');
}
/* 定義の一覧をテキストから作る。逃し測定(--escaped)は【当時のコミットの中身】でも呼ぶので、
 * コーパス作りとは別の関数に切り出してある。 */
function defsOfText(text, html) {
  const lines = text.split(/\r?\n/);
  const defs = [];
  for (let i = 0; i < lines.length; i++) {
    /* HTMLの<script>内は字下げされているので、HTMLだけ頭の空白を許す。
     * コードのファイルは行頭定義だけを「上位の記号」と数える(入れ子の関数はその持ち主に含める)。 */
    const L = html ? lines[i].replace(/^\s+/, '') : lines[i];
    if (!html && /^\s/.test(lines[i])) continue;
    /* ★class は【関数と同じ扱い】にする(fn: true)── --sweep の写経の疑いは
     *   「同じ処理を複数ファイルに写した」を探すもので、同名のクラスが2箇所に在るのは
     *   const の同名(道具の作法)とは違い、本当に疑うべき形だから。 */
    const mf = L.match(DEF_FN) || L.match(DEF_CLASS);
    const m = mf || L.match(DEF_TYPE) || L.match(DEF_CONST);
    if (m && 語として十分(m[1])) defs.push({ name: m[1], line: i + 1, exp: /^export\s/.test(L), fn: !!mf });
  }
  return defs;
}
const enclosingIn = (defs, line) => {
  let best = null;
  for (const d of defs || []) if (d.line <= line && (!best || d.line > best.line)) best = d;
  return best ? best.name : null;
};
const corpus = new Map();    // file -> { text, lines, defs:[{name,line,exp}], starts:[offset per line] }
for (const f of corpusFiles) {
  const text = read(f);
  const defs = defsOfText(text, f.endsWith('.html'));
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1);
  corpus.set(f, { text, lines: text.split(/\r?\n/), defs, starts });
}
const enclosing = (f, line) => {
  const c = corpus.get(f);
  return c ? enclosingIn(c.defs, line) : null;
};
/* ★同じファイルに同名の定義が複数あるものは【使い回しの局所変数】(HTMLは字下げを許すぶん
 * 関数内の const text / done まで定義に見える)。門の触れた記号・環の拡張から外す ──
 * 外さないと text を触っただけでページ中の無関係な関数166件が近傍に膨らむ(2026-08-26 実走)。
 * 全体走査(--sweep)に入れた同じ規則を、門にも通す。 */
const 多重定義 = new Map();
for (const [f, c] of corpus)
  for (const d of c.defs) {
    const k = f + '::' + d.name;
    多重定義.set(k, (多重定義.get(k) || 0) + 1);
  }
const 局所の癖 = (f, name) => (多重定義.get(f + '::' + name) || 0) > 1;
const lineOfIndex = (f, idx) => {
  const s = corpus.get(f).starts;
  let lo = 0, hi = s.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (s[mid] <= idx) lo = mid; else hi = mid - 1; }
  return lo + 1;
};

/* ---------- 全体走査(--sweep)── 差分ではなく【全体】を同じ物差しで棚卸しする ----------
 * 門(--gate)は変更の局所を見張る。しかし重複と死にコードは【距離の現象ではない】──
 * 半径の門をいくら広げても、変更点から辿れない重複には届かない(2026-08-26 依頼主の問いから)。
 * だから軸を分けた: 全体走査は定期監査の観点3・4の下ごしらえで、疑いを列挙するだけ。
 * ★列挙は疑いであって判定ではない ── 発見の扱いは監査の掟(勝手に直さない・判断を仰ぐ)。 */
/* ★【定義の一覧】を機械が読む形で出す(2026-08-31、第2の議題)。
 *
 * ★なぜ口にするか: 定義の拾い方(function / class / 型 / const)は**ここが正本**である。
 *   `check.mjs` が同じ regex を持つと、**片方だけ直る**日が来る(39条)。
 *   だから写さずに**答えさせる** ── 9.50 の `--口一覧` と同じ形。
 * ★出す形は「ファイル<TAB>名前<TAB>種類」。種類は fn(関数・クラス)/ 値(それ以外)。
 *   ★型かどうかは**ここでは分けない** ── 分けるなら defs に印を足すことになり、
 *     門の判定まで変わる。いまの利用者(地図との突き合わせ)は名前が要るだけである。
 * ★ネットに出ず、何も書き換えない ── 読んで出すだけ。 */
/* ★【ファイルを跨ぐ記号】を出す(2026-08-31、第2の議題・配布先の実測から)。
 *
 * ★配布先の実測: 「参照が多い記号」で接点を探したら、**15件中6件が地図に無く、
 *   そのうち5件は雑音**だった(span 190回 / mod 189回 / esc / top / WORKER ──
 *   HTML を組み立てるローカル変数)。**回数は接点の大きさを測っていない。**
 * ★残った1件(型 Env)だけ性質が違った ── **ファイルを跨いでいた**。
 *   接点は「層をまたぐ所」なので、**跨ぐかどうか**なら機械が知っている。
 * ★これは【検査ではなく物差し】である。赤にしない ── 測るための口。
 *   「跨ぐ記号のうち地図に無いもの」が接点の入口になるかは、**まだ誰も測っていない**。
 *   だから判定は作らず、**両方の現場が数えられる形**だけを置く。
 * ★数え方: 定義された名前が、**定義したファイル以外にも語として現れるか**。
 *   語の境界は門と同じ物差しを使う(WORDCHAR)── ここで別の物差しを使うと、
 *   同じ塊の中で2つの「語」ができる(39条)。 */
if (跨ぐ記号) {
  const 出 = [];
  for (const [home, cp] of corpus)
    for (const d of cp.defs) {
      if (IGNORE.has(d.name)) continue;
      let 他所 = 0;
      for (const [f, o] of corpus) {
        if (f === home) continue;
        let i = 0, 見た = false;
        while ((i = o.text.indexOf(d.name, i)) !== -1) {
          const 前 = o.text[i - 1], 後 = o.text[i + d.name.length];
          i += d.name.length;
          if (前 && WORDCHAR.test(前)) continue;
          if (後 && WORDCHAR.test(後)) continue;
          見た = true; break;
        }
        if (見た) 他所++;
      }
      /* ★4列目に【書き出しているか】を出す(2026-08-31、配布先の宿題から)。
       *   跨ぐだけでは雑音が落ちなかった(正本55件 / 配布先280件)。
       *   export は**その現場が意図して外へ出した印**なので、接点に近いはずである。
       *   ★これも物差しであって判定ではない ── 効くかどうかは当ててから言う。 */
      if (他所) 出.push(d.name + String.fromCharCode(9) + (他所 + 1) + String.fromCharCode(9) + home
        + String.fromCharCode(9) + (d.exp ? "export" : "内"));
    }
  出.sort();
  if (出.length) process.stdout.write(出.join(String.fromCharCode(10)) + String.fromCharCode(10));
  process.exit(0);        /* 0件は0行 */
}

if (定義一覧) {
  const 行 = [];
  for (const [f, c] of corpus)
    for (const d of c.defs) 行.push(f + String.fromCharCode(9) + d.name + String.fromCharCode(9) + (d.fn ? "fn" : "値"));
  行.sort();
  process.stdout.write(行.join(String.fromCharCode(10)) + String.fromCharCode(10));
  process.exit(0);
}

if (SWEEP) {
  const entryRes = (N.entry_symbols || []).map((s) => new RegExp(s));
  const 同名 = new Map();            // name -> Set(file)。定義がどこに散っているか
  for (const [f, c] of corpus)
    for (const d of c.defs) {
      if (IGNORE.has(d.name)) continue;
      if (!同名.has(d.name)) 同名.set(d.name, new Set());
      同名.get(d.name).add(f);
    }
  /* 参照の数: 定義と同じファイル + export されていれば全ファイル(門と同じ物差し) */
  const countRefs = (name, home, exported) => {
    let c = 0;
    for (const [f, cp] of corpus) {
      if (!exported && f !== home) continue;
      let idx = 0;
      while ((idx = cp.text.indexOf(name, idx)) !== -1) {
        const at = idx; idx += name.length;
        const b = cp.text[at - 1], a = cp.text[at + name.length];
        if (b && WORDCHAR.test(b)) continue;
        if (a && WORDCHAR.test(a)) continue;
        c++;
      }
    }
    return c;
  };
  /* 同じファイルに同名の定義が複数あるものは、構造の記号ではなく【使い回しの局所変数】
   * (HTMLの関数内 const div 等。HTMLは字下げを許すぶん拾いすぎる)── 走査から外す */
  const 定義数 = new Map();
  for (const [f, c] of corpus)
    for (const d of c.defs) {
      const k = f + '::' + d.name;
      定義数.set(k, (定義数.get(k) || 0) + 1);
    }
  const 死候補 = [];
  const 参照 = [];
  for (const [f, c] of corpus) {
    const 見た = new Set();
    for (const d of c.defs) {
      if (IGNORE.has(d.name) || 見た.has(d.name)) continue;
      見た.add(d.name);
      if (定義数.get(f + '::' + d.name) > 1) continue;
      if (entryRes.some((re) => re.test(d.name))) continue;   // 実行環境が名前で呼ぶ入口(doPost等)は死ではない
      /* ★大域スコープの現場では export が無くても届く(上の 大域か と同じ理由)。
         *   ここを直さないと、死にコード候補の側だけ古い前提のまま残る。 */
        const refs = countRefs(d.name, f, d.exp || 大域か(f)) - 1;           // 定義行の1回ぶんを引く
      参照.push({ name: d.name, file: f, refs });
      /* 同名が複数ファイルにあると参照の帰属が曖昧になるので、死の疑いは単独定義だけに言う */
      if (refs <= 0 && 同名.get(d.name).size === 1) 死候補.push({ name: d.name, file: f });
    }
  }
  console.log('■ 呼ばれていない記号(死にコード候補 ' + 死候補.length + '件)── 監査の観点3の材料。勝手に消さない');
  for (const x of 死候補.slice(0, 60)) console.log('  ' + x.name + '  @' + x.file);
  if (死候補.length > 60) console.log('  …ほか ' + (死候補.length - 60) + '件');
  /* 写経の疑い: 同名の【関数】が複数ファイルに定義されている(このプロジェクトが実際に
   * 患った病気 ── 同じ処理を14箇所に写して、書き忘れた所だけ壊れた。WHY 141)。
   * const の同名(argv / sh 等の道具の作法)はノイズなので、関数だけ・名前4文字以上に絞る */
  /* ★ここも ASCII の物差し(上の 語として十分 と同じ理由)。
   *   4文字は「sh / argv のような道具の作法を落とす」ための値だが、日本語では4文字は長い語で、
   *   `走る` `読む` `歩く` のような写経は**全部この網を抜ける**。日本語は2文字から見る。 */
  const 名前が十分長い = (n) => n.length >= 4 || (日本語を含む(n) && n.length >= 2);
  /* ★写経は【関数が2箇所以上】であって、関数1つと変数1つではない(2026-08-30、配布先からの報告③)。
   *   直す前は「どれか1つが関数なら」だったので、
   *   `function 名札()` と `let 名札 = null`(DOM 要素の入れ物)が**写経の疑い**に並んだ。
   *   報告者の言葉:「**変数と関数を同じ列で数えている**」── そのとおりだった。
   *   ★誤検出1件が検査全体の信用を殺す(配る約束の5)。数えるのは、写された側の形が揃うときだけ。 */
  const 関数として定義した数 = (name, files) =>
    [...files].filter((f) => corpus.get(f).defs.some((d) => d.name === name && d.fn)).length;
  const 写経疑い = [...同名.entries()]
    .filter(([name, files]) => files.size >= 2 && 名前が十分長い(name)
      && 関数として定義した数(name, files) >= 2)
    .sort((a, b) => b[1].size - a[1].size);
  console.log('■ 同名の関数が複数ファイルに(写経の疑い ' + 写経疑い.length + '件)── 観点3(重複)の材料');
  for (const [name, files] of 写経疑い.slice(0, 30))
    console.log('  ' + name + '  ×' + files.size + '  ' + [...files].join(' / '));
  /* 参照の集中点: 変更の爆風が最も広い場所 = 正本・棚として最も守るべき場所(観点4の材料) */
  const 集中 = 参照.sort((a, b) => b.refs - a.refs).slice(0, 15);
  console.log('■ 参照の多い記号(構造の集中点 ── 観点4=メタ化・正本化の材料)');
  for (const x of 集中) console.log('  ' + String(x.refs).padStart(4) + '回  ' + x.name + '  @' + x.file);
  process.exit(0);
}

/* ---------- ① 触れた記号(差分の持ち主) ---------- */
const touched = new Map();   // name -> Set(file)

/* ★新規ファイル(未追跡)は git diff に出ない ── 最初の実走で自分自身(この道具)が
 * すり抜けたのを見つけた(2026-08-26)。新しく作った器のコードこそ近傍(呼び手の配線)を
 * 見るべきなので、未追跡のコードは【全部の記号を触れた扱い】にする。 */
/* ★宣言 skip_dirs で外した場所を【黙って見逃さない】(2026-08-30、違和感の掘り出しで見つかった)。
 *
 *   skip_dirs は「重複していることが正しい場所」を --sweep のコーパスから外すために足した。
 *   ところがコーパスは門も使うので、**外した場所は門でも定義が引けず**、
 *   そこを編集しても「器のコードに変更なし」で終わっていた ── **しかも何も言わない**。
 *   実測: `research/` にコードを足して --list → 「器のコードに変更なし」。
 *   コメントだけの変更は「N行は数えていません」と出すのに、こちらは無言だった。
 *   ★地図(docs/CODEMAP.md)には「門には効かない」と**逆のことが書いてあった**(こちらも直した)。
 * ★見ないこと自体は宣言どおりで正しい。**見なかったと言わないこと**が間違い
 *   ── 何を見なかったか分からない計器は、計器ではない(この道具の既存の掟)。 */
const 宣言で外した = [];
const 持ち主なし = new Map();   // file -> 持ち主の記号が引けなかった行数
const 持ち主なしを言う = () => {
  if (!持ち主なし.size) return;
  const 計 = [...持ち主なし.values()].reduce((a, b) => a + b, 0);
  console.log('  (持ち主の記号が引けなかった変更 ' + 計 + '行は**問えていません**: '
    + [...持ち主なし.keys()].slice(0, 6).join(', ')
    + (持ち主なし.size > 6 ? ' ほか' + (持ち主なし.size - 6) + 'ファイル' : '')
    + ')── 最初の定義より前(import・冒頭の定数)か、定義として拾えない書き方です');
};
const 外した件を言う = () => {
  if (!宣言で外した.length) return;
  const 一意 = [...new Set(宣言で外した)];
  console.log('  (宣言 skip_dirs で外した場所の変更 ' + 一意.length + '件は**見ていません**: '
    + 一意.slice(0, 8).join(', ') + (一意.length > 8 ? ' ほか' + (一意.length - 8) + '件' : '') + ')');
};

if (!BASE_OVERRIDE && dirty !== '') {
  const untracked = git('ls-files','--others','--exclude-standard').trim().split('\n').filter(Boolean);
  for (const f of untracked) {
    if (isCode(f) && inSkipped(f)) { 宣言で外した.push(f); continue; }
    if (!isCode(f) || SKIP_TOUCHED.some((re) => re.test(f))) continue;
    const c = corpus.get(f);
    if (!c) continue;
    for (const d of c.defs) {
      if (IGNORE.has(d.name) || 局所の癖(f, d.name)) continue;
      if (!touched.has(d.name)) touched.set(d.name, new Set());
      touched.get(d.name).add(f);
    }
  }
}
for (const [f, lines] of changed) {
  if (isCode(f) && inSkipped(f)) { 宣言で外した.push(f); continue; }
  if (!isCode(f)) continue;
  if (SKIP_TOUCHED.some((re) => re.test(f))) continue;
  if (!corpus.has(f)) {
    const text = read(f);
    if (!text) continue;      // 消されたファイル ── 呼び手側が差分に現れるのでそちらで拾う
    corpus.set(f, { text, lines: text.split(/\r?\n/), defs: [], starts: [0] });
  }
  for (const ln of lines) {
    const name = enclosing(f, ln);
    /* ★持ち主の記号が引けなかった行を【黙って捨てない】(2026-08-30)。
     *   いちばん多いのは「最初の定義より前」── import・冒頭の定数・HTML の <style> など。
     *   そこは近傍の軸(呼び出し関係)に乗らないので**問えない**が、
     *   問えないことと見ていないことは別で、**言わなければ後者に見える**。
     *   ★class を定義に足すまでは、クラスで書かれたファイルが丸ごとここへ落ちていた。 */
    if (!name) {
      /* ★中身のある行だけ数える。文頭の解説(この塊の冒頭は50行を超える)まで数えると、
       *   コメントを直すたびに鳴って読み飛ばされる(7条)。
       * ★見た目で落とすのは【この報せだけ】── 門の判定(素にする)には使わない。
       *   囲みコメントの途中の行は行だけ見ても判別できず、
       *   `const x = a` / `  * b;` のような**続きの式**と区別がつかない。
       *   報せなら数え落としても害は小さいが、門で落とすと見えない失敗になる。 */
      const 行 = (corpus.get(f).lines || [])[ln - 1];
      if (行 && !/^\s*(\*|\/\/|\/\*|<!--)/.test(行) && 素にする(行, f)) {
        持ち主なし.set(f, (持ち主なし.get(f) || 0) + 1);
      }
      continue;
    }
    if (IGNORE.has(name) || 局所の癖(f, name)) continue;
    if (!touched.has(name)) touched.set(name, new Set());
    touched.get(name).add(f);
  }
}

/* ---------- ②' 変更の印(回答が【どの変更に対するもの】かを持たせる) ----------
 *
 * ★2026-08-30、違和感の掘り出しで見つかった。直す前は、回答に【いつのものか】が
 *   一切書かれておらず、--gate は近傍の顔ぶれ(file::記号)だけで照合していた。
 *   回答ファイルは range を**記録しているのに、照合には使っていなかった**。
 *
 * ★実測(これが直す理由):
 *   変更A(write() に無害な定数を1行足す)に「影響なし」と答えて通過 →
 *   Aを捨てて変更B(write() から**冪等の守り(既にあれば触らない)を削除**=本物の退行)を入れ、
 *   --list を回さずいきなり --gate → **「通過(2件すべてに回答あり)」**。
 *   回答の理由は、もう存在しない変更Aの話をしていた。
 *   ★回答は【コミットに含める】設計なので、次のセッションもその古い回答を引き継ぐ。
 *
 * ★range では捕まらない: 作業木が汚れていれば range は常に "HEAD" で、
 *   まったく別の変更でも同じ文字列になる。だから**中身の印**で見る。
 * ★印は【その近傍を呼び出した元の記号(根)の本体】から取る。
 *   ・根が変われば、その根から生えた近傍の回答は全部やり直し(考えた前提が変わったから)
 *   ・無関係な所を直しても、この根の回答は生き残る(鳴り過ぎる門は読み飛ばされる・7条)
 * ★指紋の作り方は selfcheck.mjs の 指紋() と同じ FNV-1a だが、**測る対象が違う**
 *   (あちら=配られた塊のファイル全体 / こちら=いま直した記号の本体)。
 *   findRoot → findInstallRoot と同じ理由で、ひとつにせず名前を分けてある。 */
const 印を取る = (s) => {
  let h = 2166136261;
  for (let k = 0; k < s.length; k++) { h ^= s.charCodeAt(k); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36) + '-' + s.length;
};
/* 記号の本体 = 定義行から、次の定義行の手前まで(いまの作業木の中身) */
const 本体 = (f, name) => {
  const c = corpus.get(f);
  if (!c) return '';
  const i = c.defs.findIndex((d) => d.name === name);
  if (i < 0) return '';
  const from = c.defs[i].line;
  const to = i + 1 < c.defs.length ? c.defs[i + 1].line - 1 : c.lines.length;
  return c.lines.slice(from - 1, to).join('\n');
};
const 印の控え = new Map();
const 根の印 = (根) => {
  if (印の控え.has(根)) return 印の控え.get(根);
  let v;
  if (根.startsWith('note:')) v = 印を取る(read(根.slice(5)));
  else {
    const files = touched.get(根);
    v = files ? 印を取る([...files].sort().map((f) => 本体(f, 根)).join('\n----\n')) : '';
  }
  印の控え.set(根, v);
  return v;
};

/* ---------- ② 呼び出し元を数える(名前の一致・単語境界つき) ----------
 * ★探す範囲は【定義と同じファイル】+【export されていれば全ファイル】。
 *   最初の版は名前だけで全ファイルを探し、各スクリプトが自分用に持つ同名
 *   (sh / argv / range …)を全部「呼び手」と誤認して213件を列挙した(2026-08-26 実走)。
 *   ページや道具は独立した世界 ── 名前が同じでも、export の橋が無ければ届かない。 */
function callersOf(name, homeFiles, exported, cap = MAX_CALLERS) {
  const out = new Set();     // "file::caller"
  let count = 0;
  for (const [f, c] of corpus) {
    if (!exported && !homeFiles.has(f)) continue;
    /* ★影(shadow): その名前を【自分でも定義している】他ファイルの参照は、そのローカル定義に
     * 束縛される ── export された同名の呼び手ではない(JSの意味論)。数えると、正本を1枚
     * 作った瞬間に同名の自前実装を持つ全ファイルが誤って近傍に膨らむ(2026-08-26 実走: encText で88件) */
    if (!homeFiles.has(f) && c.defs.some((d) => d.name === name)) continue;
    let idx = 0;
    while ((idx = c.text.indexOf(name, idx)) !== -1) {
      const before = c.text[idx - 1];
      const at = idx;
      idx += name.length;
      const after = c.text[at + name.length];
      if (before && WORDCHAR.test(before)) continue;
      if (after && WORDCHAR.test(after)) continue;
      const enc = enclosing(f, lineOfIndex(f, at));
      if (!enc || enc === name || 局所の癖(f, enc)) continue;
      out.add(f + '::' + enc);
      count++;
      if (count > cap * 4) return { wide: true, set: out };   // 逃し測定は cap=Infinity で潰さず測る
    }
  }
  return { wide: out.size > cap, set: out };
}
const isExported = (name, files) => {
  for (const f of files) {
    /* 大域スコープの現場では、export が無くても他のファイルから届く */
    if (大域か(f)) return true;
    const c = corpus.get(f);
    if (c && c.defs.some((d) => d.name === name && d.exp)) return true;
  }
  return false;
};

/* ---------- 逃し測定(--escaped)── 環の数は信仰ではなく、この台帳が決める ----------
 * 事故が門を逃したとき、「元の変更」と「直しの変更」の2点から
 * 【犯人が何環目に居たか】を測る。環2の回答が正直だったのに逃したなら、
 * 犯人の環がそのまま「rings をいくつにすべきだったか」の実測になる。
 * ★∞(呼び出しの近傍で届かない)も大事な結果 ── その事故は環をいくら増やしても
 *   この軸では捕まらない(相手のプロトコル・重複など)。別の計器の仕事だと分かる。
 * ★当時の行番号は当時のファイルで解く(git show)。呼び出しの地図は今の木で引く
 *   ── 測るのはたいてい直した直後なので、近似として許す(ここに書いて隠さない)。 */
if (ESCAPED) {
  const [元引数, 直し引数] = ESCAPED;
  if (!元引数 || !直し引数) { console.log('使い方: --escaped <元のコミットか範囲> <直しのコミットか範囲>'); process.exit(1); }
  const rangeOf = (c) => (c.includes('..') ? c : c + '~1..' + c);
  const rightOf = (r) => r.split('..').pop();
  const touchedOf = (range) => {
    const right = rightOf(range);
    const map = parseDiff(git('diff','-U0',range));
    const names = new Map();
    for (const [f, lines] of map) {
      if (!isCode(f) || SKIP_TOUCHED.some((re) => re.test(f))) continue;
      const text = git('show', right + ':' + f);
      if (!text) continue;
      const defs = defsOfText(text, f.endsWith('.html'));
      for (const ln of lines) {
        const n = enclosingIn(defs, ln);
        if (!n || IGNORE.has(n)) continue;
        if (!names.has(n)) names.set(n, new Set());
        names.get(n).add(f);
      }
    }
    return names;
  };
  /* ★測れなかったことを、ここでも見る(2026-08-30、違和感の掘り出しで見つかった)。
   *   `測れなかった` は 143行目で一度見るきりで、--escaped からは**二度と見られなかった**。
   *   そのため git が落ちても「器のコードが無い」という**別の理由**が表示される ──
   *   道具が、自分が測れなかったことを、測った結果として語っていた。 */
  const 前の失敗 = 測れなかった.length;
  const 元 = touchedOf(rangeOf(元引数));
  const 犯人 = touchedOf(rangeOf(直し引数));
  if (測れなかった.length > 前の失敗) {
    不明で終わる('git が答えませんでした ── ' + 測れなかった.slice(前の失敗).join(' / ')
      + '\n  (その版にそのファイルが無い / 浅いクローン、などが典型です)');
  }
  if (!元.size || !犯人.size) {
    console.log('測れません: ' + (!元.size ? '元の変更に器のコードが無い' : '直しの変更に器のコードが無い')
      + '(ノートだけの変更や、コードの外の直しはこの軸の外です)');
    process.exit(0);
  }
  /* 元から外へ、上限なしで環を広げる(測定なので「広域」で潰さない) */
  const ringOf = new Map();
  for (const n of 元.keys()) ringOf.set(n, 0);
  let 前線 = [...元.keys()].map((name) => ({ name, files: 元.get(name) }));
  /* ★打ち切りを黙らない(2026-08-30、違和感の掘り出しで見つかった)。
   *
   *   直す前は `ring <= 12` で**無言**に止めていた。上限を超えた犯人は ringOf に載らないので
   *   `∞(呼び出しの近傍では届かない ── **環を増やしても捕まらない**)` に化け、
   *   台帳では「この軸の外」に数えられ、最後に
   *   「※逃しの多数はこの軸の外 ── **環を増やすより**、実測と計器の層を疑うこと」と出る。
   *   **本当は環を増やせば捕まるのに、増やすなと助言する。**
   *   実測(対照つき): 同じ事故を上限12→「環3・rings を上げる材料1件」/
   *   上限1→「∞・この軸の外1件」+ 逆の助言。**何の合図も無く入れ替わる。**
   * ★コメントには「実測でここに達したことは無い」と書いてあったが、
   *   **達しても何も言わない**のだから、その一文は確かめようがなかった。 */
  const 発散止め = 12;   // 環の展開が発散しないための上限。★超えたら【打ち切り】として必ず言う
  let 打ち切った = false;
  for (let ring = 1; ring <= 発散止め && 前線.length; ring++) {
    const next = [];
    for (const { name, files } of 前線) {
      if (IGNORE.has(name)) continue;
      const r = callersOf(name, files, isExported(name, files), Infinity);
      for (const key of r.set) {
        const [f, caller] = key.split('::');
        if (ringOf.has(caller) || IGNORE.has(caller)) continue;
        ringOf.set(caller, ring);
        next.push({ name: caller, files: new Set([f]) });
      }
    }
    前線 = next;
    if (ring === 発散止め && 前線.length) 打ち切った = true;
  }
  if (打ち切った) {
    console.log('★環の展開を ' + 発散止め + ' 環で**打ち切りました**(まだ広がっていました)。'
      + 'この回の「∞」は【届かない】ではなく【測れていない】です ── 下の助言は当てになりません。');
  }
  const 結果 = {};
  let 最大 = 0, 届かない = 0;
  for (const n of 犯人.keys()) {
    const r = ringOf.has(n) ? ringOf.get(n) : null;
    結果[n] = r;
    if (r === null) 届かない++;
    else if (r > 最大) 最大 = r;
    console.log('  犯人 ' + n + ' → ' + (r === null ? (打ち切った
      ? '打ち切り(' + 発散止め + '環まで見て届かなかった ── **測れていない**。届かないとは限らない)'
      : '∞(呼び出しの近傍では届かない ── 環を増やしても捕まらない)')
      : r === 0 ? '環0(元の変更そのもの ── 門は列挙していた)' : '環' + r));
  }
  /* 台帳に積む。1件では判断しない ── 傾向が rings を動かす */
  const 台帳P = N.escaped || '.guardian/neighbors.escaped.json';
  let 台帳 = { 記録: [] };
  try { 台帳 = JSON.parse(read(台帳P)); } catch (_) {}
  if (!Array.isArray(台帳.記録)) 台帳 = { 記録: [] };
  /* ★同じ事故を二度数えない(2026-08-30、違和感の掘り出しで見つかった)。
   *   直す前は push するだけで重複判定が無く、**同じ引数で3回回したら3件積まれた**。
   *   実測: 2回目で「★rings を超えた逃しが繰り返し出ています ── 上げる判断材料です」が出た。
   *   「環の数は信仰ではなく台帳が決める」という設計が、**再実行1回で歪む**。
   *   元と直しの範囲は記録しているのに、照合に使っていなかった。 */
  const 印 = rangeOf(元引数) + " → " + rangeOf(直し引数);
  const 既に = 台帳.記録.findIndex((r) => (r.元 + " → " + r.直し) === 印);
  const 新記録 = { at: new Date().toISOString(), 元: rangeOf(元引数), 直し: rangeOf(直し引数), 結果, 最大環: 最大, 届かない, 打ち切り: 打ち切った };
  if (既に >= 0) { 台帳.記録[既に] = 新記録; console.log("(同じ範囲の記録を上書きしました ── 二度数えません)"); }
  else 台帳.記録.push(新記録);
  fs.mkdirSync(path.dirname(path.join(ROOT, 台帳P)), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 台帳P), JSON.stringify(台帳, null, 1));
  const 超え = 台帳.記録.filter((r) => r.最大環 > RINGS).length;
  const 外 = 台帳.記録.filter((r) => r.届かない > 0).length;
  console.log('台帳: 全' + 台帳.記録.length + '件 / いまの rings=' + RINGS + ' を超えた逃し ' + 超え + '件 / この軸の外 ' + 外 + '件');
  if (超え >= 2) console.log('★rings=' + RINGS + ' を超えた逃しが繰り返し出ています ── 上げる判断材料です(guardian.config.json の neighbors.rings)');
  /* ★打ち切った回は、この助言を出さない ── 「この軸の外」かどうかを測れていないのだから */
  if (外 > 超え && !打ち切った) console.log('※逃しの多数はこの軸の外 ── 環を増やすより、実測と計器の層(見本の読み合わせ・黙りの見張り)を疑うこと');
  if (打ち切った) console.log('※この回は打ち切っているので、rings の判断材料にはしないでください(発散止めを上げて測り直す)');
  process.exit(0);
}

/* ---------- ③ 近傍を環ごとに広げる ---------- */
const need = new Map();      // key(file::name) -> { 記号, 場所, 環, きっかけ, 根 }
const known = new Set([...touched.keys()]);
/* 根 = この近傍を呼び出した【元の触れた記号】。回答の鮮度(印)はここから取る */
let frontier = [...touched.keys()].map((name) => ({ name, files: touched.get(name), 根: name }));
for (let ring = 1; ring <= RINGS; ring++) {
  const next = [];
  for (const { name, files, 根 } of frontier) {
    if (IGNORE.has(name)) continue;
    const r = callersOf(name, files, isExported(name, files));
    if (r.wide) {
      const key = '*::' + name;
      if (!need.has(key)) need.set(key, {
        記号: name + '(呼び出しが' + MAX_CALLERS + '箇所超)', 場所: '(広域)', 環: ring, 根,
        きっかけ: '「' + name + '」は呼び手が多すぎて列挙できません。まとめて1つ答えてください' });
      continue;
    }
    for (const key of r.set) {
      const [f, caller] = key.split('::');
      if (known.has(caller) || IGNORE.has(caller)) continue;
      if (!need.has(key)) {
        need.set(key, { 記号: caller, 場所: f, 環: ring, 根, きっかけ: '「' + name + '」を呼んでいる' });
        next.push({ name: caller, files: new Set([f]), 根 });
      }
    }
  }
  frontier = next;
  for (const { name } of next) known.add(name);
}

/* ---------- ④ ノート(宣言)の変更 → その欄を読むコードも近傍 ---------- */
/* ★キーは【そのファイルの差分から】拾う。最初の版は diff 全体を見ており、
 * 別ファイルで変わった一般語(key / range / name)まで拾って、それを含む全コードを
 * 近傍に膨らませていた(2026-08-27 実走: gas の無関係な関数が5件出た)。
 * ★短い一般語は、宣言の欄名としてもコード中の別物としても出るので数えない。 */
/* ★一般語の一覧を【宣言で差し替えられる】ようにする(2026-08-30、違和感の掘り出しで見つかった)。
 *   skip_dirs / ignore_symbols / entry_symbols / skip_touched は全部宣言が持つのに、
 *   ここだけがエンジンにべた書きだった ── **エンジンは現場固有のことを1つも持たない**(39条)と食い違う。
 *   実測: 欄名が本当に `type` の現場では、その読み手が**永久に近傍に出ない**(黙って落ちる)。 */
const 一般語 = new Set(Array.isArray(N.common_keys) ? N.common_keys
  : ['key', 'name', 'range', 'type', 'path', 'value', 'text', 'data', 'list', 'model', 'url', 'body']);
/* ★欄名の拾い方(2026-08-30、違和感の掘り出しで見つかった)。
 *   直す前は `line.match(...)` で **1行につき1件しか拾えず**、`[A-Za-z0-9_.]{3,}` なので
 *   日本語の欄名も2文字の欄名も届かなかった。
 *   実測: 見本の欄3つ(type / limitBytes / 上限。**この現場の記号ではないので囲まない**)を全部変えて → 1行JSONなら **0/3**、
 *   整形済みでも **1/3**(`type` は一般語、`上限` は正規表現に届かない)。
 *   → 全件拾う(matchAll)/ 日本語を許す / 短い一般語は ASCII のときだけ落とす。 */
const 欄名 = /"([A-Za-z0-9_.぀-ヿ一-鿿]+)"\s*:/g;
for (const [f, lines] of changed) {
  if (!isNote(f)) continue;
  const keys = new Set();
  /* このファイルの差分だけを切り出す */
  const 塊 = diff.split(/^diff --git /m).find((b) => b.includes('+++ b/' + f)) || '';
  for (const line of 塊.split('\n')) {
    if (!/^[+-]/.test(line) || /^[+-]{3}/.test(line)) continue;
    for (const m of line.matchAll(欄名)) {
      const k = m[1];
      if (k.startsWith('_') || 一般語.has(k)) continue;
      if (!日本語を含む(k) && k.length < 3) continue;   // 短い英字は、欄名としてもコード中の別物としても出る
      keys.add(k);
    }
  }
  for (const k of keys) {
    for (const [cf, c] of corpus) {
      if (!c.text.includes(k)) continue;
      let idx = 0;
      while ((idx = c.text.indexOf(k, idx)) !== -1) {
        const at = idx; idx += k.length;
        const before = c.text[at - 1], after = c.text[at + k.length];
        if (before && WORDCHAR.test(before)) continue;
        if (after && WORDCHAR.test(after)) continue;
        const enc = enclosing(cf, lineOfIndex(cf, at));
        if (!enc || known.has(enc) || IGNORE.has(enc)) continue;
        const key = cf + '::' + enc;
        if (!need.has(key)) need.set(key, {
          記号: enc, 場所: cf, 環: 1, 根: 'note:' + f,
          きっかけ: 'ノート ' + f + ' の「' + k + '」を読んでいる' });
      }
    }
  }
}

/* ---------- ⑤ 出力 / 門 ---------- */
const 一覧 = [...need.entries()].map(([key, v]) => ({ key, ...v }))
  .sort((a, b) => a.環 - b.環 || a.key.localeCompare(b.key));

if (!GATE) {
  console.log('比べた範囲: ' + range + (dirty ? '(作業木の未コミット分)' : ''));
  console.log('触れた記号: ' + ([...touched.keys()].join(', ') || '(器のコードに変更なし)'));
  if (数えなかった) console.log('  (コメントと空白だけの変更 ' + 数えなかった + '行は数えていません)');
  外した件を言う(); 持ち主なしを言う();
  if (!一覧.length) { console.log('近傍: なし ── 答えるべき相手が居ません'); process.exit(0); }
  console.log('答えるべき近傍(' + 一覧.length + '件):');
  for (const x of 一覧) console.log('  [環' + x.環 + '] ' + x.記号 + '  @' + x.場所 + '  ← ' + x.きっかけ);
  /* 回答の下書き。既にある回答は残す(書き直しの手間と、消える事故を防ぐ) */
  /* ★人が手で埋めるファイルを、黙って上書きしない(2026-08-30、違和感の掘り出しで見つかった)。
   *   直す前は JSON.parse の失敗を【空の catch】で握り潰し、そのまま下書きで上書きしていた。
   *   実測: 回答2件を埋めたあと**末尾に "," を1文字足す**(手編集でいちばん起きる事故)だけで、
   *   両方とも {"判定":"","理由":""} に戻った ── 警告も控えも無い。
   *   ここは**人が時間をかけて理由を書く所**であって、機械が黙って消してよい所ではない。
   * ★読めなかったら止める。消えたものは戻せないが、止まったものは進められる。 */
  const 生 = read(ANSWER_PATH);
  let prev = {};
  if (生.trim()) {
    try { prev = JSON.parse(生).answers || {}; }
    catch (e) {
      console.log('✗ 回答が読めません(JSONとして壊れています): ' + ANSWER_PATH);
      console.log('    ' + String(e.message).slice(0, 160));
      console.log('  ★上書きせずに止めます ── ここに書いた理由が消えるからです。');
      console.log('  直してからもう一度 --list するか、要らないなら、そのファイルを消してください。');
      process.exit(1);
    }
  }
  const draft = {};
  /* ★古くなった回答は【判定だけを空に戻し、理由は残す】(2026-08-30、この直しを自分に当てて分かった)。
   *
   *   印を足した最初の版は、古い回答をそのまま持ち越していた。すると --gate は正しく差戻すが、
   *   **書き手が再確認する道が「印を手で書き換える」しか無い** ── それは門を手で開ける操作で、
   *   この道具がいちばん避けたい形である(実際、自分の変更でそこに突き当たった)。
   * ★判定を空に戻せば、埋め直すこと自体が【読み直した】という痕跡になる。
   *   理由は消さない ── 前に何を考えたかは、読み直すときの出発点として要る。 */
  for (const x of 一覧) {
    const いま = 根の印(x.根);
    const 前 = prev[x.key];
    if (!前) draft[x.key] = { 判定: '', 理由: '', 印: いま };
    else if (前.印 === いま) draft[x.key] = 前;
    else draft[x.key] = { 判定: '', 理由: 前.理由 || '', 印: いま };
  }
  /* ★近傍から外れた回答は【名前を出してから】落とす(黙って消さない)。
   *   差分が縮むと近傍も縮むので、前に書いた理由が音も無く消える経路がここに在った。 */
  const 外れた = Object.keys(prev).filter((k) => !(k in draft) && (prev[k].判定 || prev[k].理由));
  if (外れた.length) {
    console.log('この回の近傍から外れた回答 ' + 外れた.length + '件(下書きからは落とします): ' + 外れた.join(', '));
    console.log('  ※まだ必要なら、この --list を回す前の版を git から戻してください');
  }
  /* ★どれを空に戻したかを言う(黙って戻すと、埋めたはずの判定が消えたように見える) */
  const 戻した = 一覧.filter((x) => prev[x.key] && prev[x.key].判定 && !draft[x.key].判定);
  if (戻した.length) {
    console.log('★別の変更に対する回答だったので、判定を ' + 戻した.length + '件 空に戻しました'
      + '(**理由は残してあります** ── 読み直して、判定を入れ直してください):');
    for (const x of 戻した) console.log('  ・' + x.記号 + ' @' + x.場所 + '(根「' + x.根 + '」が、答えたときと違う中身になっています)');
  }
  fs.mkdirSync(path.dirname(path.join(ROOT, ANSWER_PATH)), { recursive: true });
  fs.writeFileSync(path.join(ROOT, NEED_PATH), JSON.stringify({ range, need: 一覧 }, null, 1));
  fs.writeFileSync(path.join(ROOT, ANSWER_PATH), JSON.stringify({ range, answers: draft }, null, 1));
  console.log('回答の下書きを書きました: ' + ANSWER_PATH + '(判定と理由を埋めてから --gate)');
  process.exit(0);
}

/* --gate */
if (!一覧.length) {
  console.log('近傍照合: 近傍なし(答えるべき相手が居ません)── 通過');
  外した件を言う(); 持ち主なしを言う();     /* ★「近傍なし」で終わる回こそ、見なかった場所を言う(無音を安全と読ませない) */
  process.exit(0);
}
let answers = {};
try { answers = JSON.parse(read(ANSWER_PATH)).answers || {}; } catch (_) {}
const 落ち = [];
const 報告 = [];
for (const x of 一覧) {
  const a = answers[x.key] || answers[x.記号];
  if (!a || !a.判定) { 落ち.push('未回答: [環' + x.環 + '] ' + x.記号 + ' @' + x.場所 + ' ← ' + x.きっかけ); continue; }
  /* ★その回答が【この変更に対するもの】か(2026-08-30)。
   *   顔ぶれ(file::記号)だけで照合していたので、根の中身が別物に入れ替わっても素通しだった。
   *   実測: 無害な変更に「影響なし」と答えて通したあと、同じ関数から冪等の守りを削除しても
   *   --gate は「通過(2件すべてに回答あり)」と言った。 */
  const いまの印 = 根の印(x.根);
  if (!a.印) {
    落ち.push('回答に印がありません(古い形式): ' + x.記号 + ' ── `--list` で作り直してください');
    continue;
  }
  if (a.印 !== いまの印) {
    落ち.push('別の変更に対する回答です: ' + x.記号 + ' @' + x.場所
      + '(根「' + x.根 + '」が、答えたときと違う中身になっています)');
    continue;
  }
  if (a.判定 === '触れた') {
    if (!touched.has(x.記号) && !x.key.startsWith('*::'))
      落ち.push('「触れた」と答えたのに差分に無い: ' + x.記号 + '(直したなら差分に入るはず)');
    continue;
  }
  if (a.判定 === '影響なし' || a.判定 === '報告') {
    if (!a.理由 || String(a.理由).length < 6) { 落ち.push('理由が短すぎる: ' + x.記号 + '(見た上での理由を書く)'); continue; }
    if (a.判定 === '報告') 報告.push(x.記号 + ' @' + x.場所 + ' ── ' + a.理由);
    continue;
  }
  落ち.push('判定が語彙に無い: ' + x.記号 + ' = ' + a.判定 + '(触れた / 影響なし / 報告)');
}
if (報告.length) {
  console.log('人間へ報告する近傍(範囲外と判断したもの ── STATUSに載せること):');
  for (const r of 報告) console.log('  ・' + r);
}
if (落ち.length) {
  console.log('近傍照合: 差戻 ── 修正の外側に、答えていない近傍があります');
  外した件を言う(); 持ち主なしを言う();
  for (const m of 落ち) console.log('  ✗ ' + m);
  console.log('直し方: node guardian/neighbors.mjs --list で下書きを作り、' + ANSWER_PATH + ' の判定と理由を埋める');
  process.exit(1);
}
外した件を言う(); 持ち主なしを言う();
/* ★【同じ理由が並んでいないか】を数える(2026-08-31、配布先の申告から)。
 *
 * ★門が見ているのは「答えが在るか」だけで、**答えが問いに対応しているか**は見ていない。
 *   配布先の申告: 38件のうち **34件(89%)が同じ理由の一括**で、
 *   その理由は事実だが**近傍の問い(呼び手に触れ残しは無いか)には答えていない**。
 *   ★こちらも数えたら **44回のうち22回(半分)** が一括だった。**2人ともやっている。**
 * ★★「対応しているか」を機械が見るのは無理である。だが**同じ文が並んでいること**は数えられる。
 *   ★落とさない ── 一括が正しい回も在る(本当に全部同じ理由のとき)。
 *   **数だけ出す**(9.72 の3段の1段目)。消せない数として残り、次に見た人が判断する。 */
{
  /* ★同じ理由が並んでいないか(判定にはしない ── 同じ関数の呼び元3つは、同じ理由で正しく
   *   「影響なし」になる。赤にすると 7条=鳴りすぎる計器になる)。
   * ★★2つの数を【別の名前で】出す ── 9.88 は最頻値だけを「同じ理由が N件」と呼んでいて、
   *   読んだ側が「一括で書かれた回答の総数」だと読み、24% と 89% で食い違った(WHY 参照)。
   *   同じ名前の数が違う定義で2つ在ると、突き合わせた人だけが気づく。 */
  const 理由たち = 一覧.map((x) => (answers[x.key] && answers[x.key].理由) || "").filter(Boolean);
  if (理由たち.length > 2) {
    const 数 = new Map();
    for (const r of 理由たち) 数.set(r, (数.get(r) || 0) + 1);
    let 最多 = 0, 重なり = 0;
    for (const n of 数.values()) { if (n > 最多) 最多 = n; if (n > 1) 重なり += n; }
    if (最多 > 1) {
      const 全 = 理由たち.length;
      const 割 = (x) => Math.round((x / 全) * 100);
      console.log("  ・理由の種類: " + 数.size + " 通り / 回答 " + 全 + " 件");
      console.log("  ・【いちばん多い理由】が " + 最多 + "/" + 全 + " 件(" + 割(最多) + "%) ── 1つの理由を、どれだけ使い回したか");
      console.log("  ・【2件以上ある理由の合計】が " + 重なり + "/" + 全 + " 件(" + 割(重なり) + "%) ── 一括で書いた回答が、どれだけ広いか");
      /* ★「同じとは何か」「母数は何か」を、数のすぐ隣に書く ── 9.89 で名前を分けたが、それでも
       *   合わなかった。報告者は理由を【前半60字】で比べており、道具は【全文】で比べていた。
       *   最多(9件)だけが偶然一致し、総和が 26 と 34 に割れた(WHY 参照)。 */
      console.log("  (どちらも【理由の全文が一致するもの】を同じと見なしています / 母数はこの回の回答 " + 全 + " 件)");
      console.log("  (門は【答えが在るか】しか見ていません。**問いに答えているか**は、書いた本人にしか分かりません)");
    }
  }
}
console.log('近傍照合: 通過(' + 一覧.length + '件すべてに回答あり' + (報告.length ? ' / うち報告 ' + 報告.length + '件' : '') + ')');
process.exit(0);
