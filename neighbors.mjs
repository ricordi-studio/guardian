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

const argv = process.argv.slice(2);
const rootArg = argv.indexOf('--root');
const ROOT = path.resolve(rootArg >= 0 ? argv[rootArg + 1] : process.cwd());
const GATE = argv.includes('--gate');
const baseArg = argv.indexOf('--base');
const BASE_OVERRIDE = baseArg >= 0 ? argv[baseArg + 1] : '';
const escArg = argv.indexOf('--escaped');
const ESCAPED = escArg >= 0 ? [argv[escArg + 1], argv[escArg + 2]] : null;
const SWEEP = argv.includes('--sweep');

const read = (p) => { try { return fs.readFileSync(path.join(ROOT, p), 'utf8'); } catch (_) { return ''; } };
/* ★失敗を空文字と区別する(2026-08-30、違和感の掘り出しで見つかった)。
 *   直す前は `r.status === 0 ? (r.stdout||'') : (r.stdout||'')` と**両辺が同じ**で、
 *   git の失敗が「出力が空」と見分けられなかった。
 *   実測: CI が既定でやる浅いクローン(--depth 1)では `HEAD~1..HEAD` が
 *   fatal: unknown revision で落ちる → 差分が空 → 触れた記号ゼロ → 近傍ゼロ →
 *   **門が出口0で「通過」**。いちばん効いてほしい CI で、門が最初から死んでいた。
 * ★測れなかったことは黙らない ── 呼ぶ側が【不明】に落とせるよう、失敗を返り値で伝える。 */
const shRaw = (cmd) => {
  const r = spawnSync(cmd, { cwd: ROOT, shell: true, encoding: 'utf8', windowsHide: true, maxBuffer: 128 * 1024 * 1024 });
  return { ok: r.status === 0, out: r.stdout || '', err: String(r.stderr || '').trim(), code: r.status };
};
const 測れなかった = [];
const sh = (cmd) => {
  const r = shRaw(cmd);
  if (!r.ok) 測れなかった.push(cmd.split(' ').slice(0, 3).join(' ') + ' … ' + (r.err.split('\n')[0] || ('出口' + r.code)));
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

/* ---------- 差分を読む(汚れた作業木があればそれ、無ければ直前のコミット) ---------- */
const dirty = sh('git status --porcelain').trim();
const range = BASE_OVERRIDE || (dirty ? 'HEAD' : 'HEAD~1..HEAD');
const diff = sh(`git diff -U0 ${range}`);
/* ★git が答えなかったら【不明】。空の差分と区別する(2026-08-30)。
 *   CI は既定で浅く取る(--depth 1)ので `HEAD~1..HEAD` が落ちる。
 *   直す前はそれが「差分ゼロ=近傍ゼロ=通過」に化けていた。 */
if (測れなかった.length) {
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
const 素にする = (s) => String(s)
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/g, '$1')      // URL の // は消さない
  .replace(/(^|\s)#.*$/g, '$1')
  .replace(/\s+/g, ' ').trim();

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
    if (消.length && 足.length && 消.map(素にする).join('\n') === 足.map(素にする).join('\n')) {
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
    if (f) { 締める(); file = f[1]; continue; }
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

const inDirs = (f, dirs) => dirs.some((d) => f === d || f.startsWith(d.replace(/\/?$/, '/')));
const isCode = (f) => inDirs(f, CODE_DIRS) && EXT.test(f);
const isNote = (f) => inDirs(f, NOTE_DIRS) && /\.json$/.test(f);

/* ---------- コードの全体(コーパス)を1回だけ読む ---------- */
const IDENT = '[$A-Za-z0-9_\\u3040-\\u30FF\\u4E00-\\u9FFF]';
const DEF_FN = new RegExp('^(?:export\\s+)?(?:async\\s+)?function\\s+(' + IDENT + '+)');
const DEF_CONST = new RegExp('^(?:export\\s+)?(?:const|let)\\s+(' + IDENT + '+)\\s*[=:]');
const WORDCHAR = new RegExp(IDENT);

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
    const mf = L.match(DEF_FN);
    const m = mf || L.match(DEF_CONST);
    if (m && m[1].length >= 2) defs.push({ name: m[1], line: i + 1, exp: /^export\s/.test(L), fn: !!mf });
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
      const refs = countRefs(d.name, f, d.exp) - 1;           // 定義行の1回ぶんを引く
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
  const 写経疑い = [...同名.entries()]
    .filter(([name, files]) => files.size >= 2 && name.length >= 4
      && [...files].some((f) => corpus.get(f).defs.some((d) => d.name === name && d.fn)))
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
if (!BASE_OVERRIDE && dirty !== '') {
  const untracked = sh('git ls-files --others --exclude-standard').trim().split('\n').filter(Boolean);
  for (const f of untracked) {
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
  if (!isCode(f)) continue;
  if (SKIP_TOUCHED.some((re) => re.test(f))) continue;
  if (!corpus.has(f)) {
    const text = read(f);
    if (!text) continue;      // 消されたファイル ── 呼び手側が差分に現れるのでそちらで拾う
    corpus.set(f, { text, lines: text.split(/\r?\n/), defs: [], starts: [0] });
  }
  for (const ln of lines) {
    const name = enclosing(f, ln);
    if (!name || IGNORE.has(name) || 局所の癖(f, name)) continue;
    if (!touched.has(name)) touched.set(name, new Set());
    touched.get(name).add(f);
  }
}

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
    const map = parseDiff(sh('git diff -U0 ' + range));
    const names = new Map();
    for (const [f, lines] of map) {
      if (!isCode(f) || SKIP_TOUCHED.some((re) => re.test(f))) continue;
      const text = sh('git show ' + right + ':' + f);
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
  const 元 = touchedOf(rangeOf(元引数));
  const 犯人 = touchedOf(rangeOf(直し引数));
  if (!元.size || !犯人.size) {
    console.log('測れません: ' + (!元.size ? '元の変更に器のコードが無い' : '直しの変更に器のコードが無い')
      + '(ノートだけの変更や、コードの外の直しはこの軸の外です)');
    process.exit(0);
  }
  /* 元から外へ、上限なしで環を広げる(測定なので「広域」で潰さない) */
  const ringOf = new Map();
  for (const n of 元.keys()) ringOf.set(n, 0);
  let 前線 = [...元.keys()].map((name) => ({ name, files: 元.get(name) }));
  for (let ring = 1; ring <= 12 && 前線.length; ring++) {   // 12 = 発散止めの上限。実測でここに達したことは無い
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
  }
  const 結果 = {};
  let 最大 = 0, 届かない = 0;
  for (const n of 犯人.keys()) {
    const r = ringOf.has(n) ? ringOf.get(n) : null;
    結果[n] = r;
    if (r === null) 届かない++;
    else if (r > 最大) 最大 = r;
    console.log('  犯人 ' + n + ' → ' + (r === null ? '∞(呼び出しの近傍では届かない ── 環を増やしても捕まらない)'
      : r === 0 ? '環0(元の変更そのもの ── 門は列挙していた)' : '環' + r));
  }
  /* 台帳に積む。1件では判断しない ── 傾向が rings を動かす */
  const 台帳P = N.escaped || '.guardian/neighbors.escaped.json';
  let 台帳 = { 記録: [] };
  try { 台帳 = JSON.parse(read(台帳P)); } catch (_) {}
  if (!Array.isArray(台帳.記録)) 台帳 = { 記録: [] };
  台帳.記録.push({ at: new Date().toISOString(), 元: rangeOf(元引数), 直し: rangeOf(直し引数), 結果, 最大環: 最大, 届かない });
  fs.mkdirSync(path.dirname(path.join(ROOT, 台帳P)), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 台帳P), JSON.stringify(台帳, null, 1));
  const 超え = 台帳.記録.filter((r) => r.最大環 > RINGS).length;
  const 外 = 台帳.記録.filter((r) => r.届かない > 0).length;
  console.log('台帳: 全' + 台帳.記録.length + '件 / いまの rings=' + RINGS + ' を超えた逃し ' + 超え + '件 / この軸の外 ' + 外 + '件');
  if (超え >= 2) console.log('★rings=' + RINGS + ' を超えた逃しが繰り返し出ています ── 上げる判断材料です(guardian.config.json の neighbors.rings)');
  if (外 > 超え) console.log('※逃しの多数はこの軸の外 ── 環を増やすより、実測と計器の層(見本の読み合わせ・黙りの見張り)を疑うこと');
  process.exit(0);
}

/* ---------- ③ 近傍を環ごとに広げる ---------- */
const need = new Map();      // key(file::name) -> { 記号, 場所, 環, きっかけ }
const known = new Set([...touched.keys()]);
let frontier = [...touched.keys()].map((name) => ({ name, files: touched.get(name) }));
for (let ring = 1; ring <= RINGS; ring++) {
  const next = [];
  for (const { name, files } of frontier) {
    if (IGNORE.has(name)) continue;
    const r = callersOf(name, files, isExported(name, files));
    if (r.wide) {
      const key = '*::' + name;
      if (!need.has(key)) need.set(key, {
        記号: name + '(呼び出しが' + MAX_CALLERS + '箇所超)', 場所: '(広域)', 環: ring,
        きっかけ: '「' + name + '」は呼び手が多すぎて列挙できません。まとめて1つ答えてください' });
      continue;
    }
    for (const key of r.set) {
      const [f, caller] = key.split('::');
      if (known.has(caller) || IGNORE.has(caller)) continue;
      if (!need.has(key)) {
        need.set(key, { 記号: caller, 場所: f, 環: ring, きっかけ: '「' + name + '」を呼んでいる' });
        next.push({ name: caller, files: new Set([f]) });
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
const 一般語 = new Set(['key', 'name', 'range', 'type', 'path', 'value', 'text', 'data', 'list', 'model', 'url', 'body']);
for (const [f, lines] of changed) {
  if (!isNote(f)) continue;
  const keys = new Set();
  /* このファイルの差分だけを切り出す */
  const 塊 = diff.split(/^diff --git /m).find((b) => b.includes('+++ b/' + f)) || '';
  for (const line of 塊.split('\n')) {
    if (!/^[+-]/.test(line) || /^[+-]{3}/.test(line)) continue;
    const m = line.match(/"([A-Za-z0-9_.]{3,})"\s*:/);
    if (m && !m[1].startsWith('_') && !一般語.has(m[1])) keys.add(m[1]);
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
          記号: enc, 場所: cf, 環: 1, きっかけ: 'ノート ' + f + ' の「' + k + '」を読んでいる' });
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
  if (!一覧.length) { console.log('近傍: なし ── 答えるべき相手が居ません'); process.exit(0); }
  console.log('答えるべき近傍(' + 一覧.length + '件):');
  for (const x of 一覧) console.log('  [環' + x.環 + '] ' + x.記号 + '  @' + x.場所 + '  ← ' + x.きっかけ);
  /* 回答の下書き。既にある回答は残す(書き直しの手間と、消える事故を防ぐ) */
  let prev = {};
  try { prev = JSON.parse(read(ANSWER_PATH)).answers || {}; } catch (_) {}
  const draft = {};
  for (const x of 一覧) draft[x.key] = prev[x.key] || { 判定: '', 理由: '' };
  fs.mkdirSync(path.dirname(path.join(ROOT, ANSWER_PATH)), { recursive: true });
  fs.writeFileSync(path.join(ROOT, NEED_PATH), JSON.stringify({ range, need: 一覧 }, null, 1));
  fs.writeFileSync(path.join(ROOT, ANSWER_PATH), JSON.stringify({ range, answers: draft }, null, 1));
  console.log('回答の下書きを書きました: ' + ANSWER_PATH + '(判定と理由を埋めてから --gate)');
  process.exit(0);
}

/* --gate */
if (!一覧.length) { console.log('近傍照合: 近傍なし(答えるべき相手が居ません)── 通過'); process.exit(0); }
let answers = {};
try { answers = JSON.parse(read(ANSWER_PATH)).answers || {}; } catch (_) {}
const 落ち = [];
const 報告 = [];
for (const x of 一覧) {
  const a = answers[x.key] || answers[x.記号];
  if (!a || !a.判定) { 落ち.push('未回答: [環' + x.環 + '] ' + x.記号 + ' @' + x.場所 + ' ← ' + x.きっかけ); continue; }
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
  for (const m of 落ち) console.log('  ✗ ' + m);
  console.log('直し方: node guardian/neighbors.mjs --list で下書きを作り、' + ANSWER_PATH + ' の判定と理由を埋める');
  process.exit(1);
}
console.log('近傍照合: 通過(' + 一覧.length + '件すべてに回答あり' + (報告.length ? ' / うち報告 ' + 報告.length + '件' : '') + ')');
process.exit(0);
