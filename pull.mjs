#!/usr/bin/env node
/**
 * Guardian を【正本から取り直す】(2026-08-28)。
 *
 * 正本: https://github.com/ricordi-studio/guardian
 *
 * ★なぜ道具にするか: 配布はコピーで済むが、**人が毎回パスを思い出す**形にしていると、
 *   いつか古いコピーを配る/配り忘れる。実際、配った先で直した分が戻らず、
 *   両方の版が同じ番号のまま食い違っていた(WHY 174)。
 *   **どこから取るかは道具が持つ** ── 人は「取り直して」と言うだけでよい。
 *
 * ★上書きしないもの: このリポジトリ固有のものは塊の外に在る(guardian.config.json /
 *   docs/CODEMAP.md / .claude/*)ので、この道具は guardian/ しか触らない。
 *
 * ★取り直す前に、**この現場で塊を直していないか**を必ず見る。
 *   直していたら止める ── 上書きすると、その現場の直りが黙って消えるから(WHY 176)。
 *
 * 使い方(PowerShell):
 *   node guardian/pull.mjs           … 正本の最新を取り直す
 *   node guardian/pull.mjs --check   … 取らずに、正本と何が違うかだけ見る
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const 正本 = 'https://github.com/ricordi-studio/guardian.git';
const 見るだけ = process.argv.includes('--check');

const 走る = (cmd, args, opts = {}) =>
  spawnSync(cmd, args, { encoding: 'utf8', shell: true, ...opts });

/* ── ① この現場で塊を直していないか(直っていたら上書きしない) ── */
{
  const r = 走る('node', [JSON.stringify(path.join(HERE, 'selfcheck.mjs'))]);
  const 出 = String(r.stdout || '') + String(r.stderr || '');
  if (出.includes('配られたときの中身と違います')) {
    console.error('✗ この現場で塊を直しています。取り直すと、その直りが消えます。');
    console.error('  先に `node guardian/selfcheck.mjs --report` で1枚を作り、');
    console.error('  正本へ渡してから取り直してください(README の「改善の還流」)。');
    process.exit(1);
  }
}

/* ── ② 正本を一時領域に取る ── */
/* ★一時フォルダは【塊の中】に作る(2026-08-30、違和感の掘り出しで見つかった)。
 *   直す前は HERE/../.guardian-pull-tmp ── 塊の**外**に作っていた。
 *   配布先ではプロジェクトの根、そして**正本ではデスクトップ直下**になる
 *   (塊がリポジトリそのものなので HERE の1つ上はデスクトップ)。
 *   しかも作る前に rmSync(recursive, force) するので、**同名のフォルダが在れば警告なく消える**。
 *   この道具の冒頭には「guardian/ しか触らない」と書いてあった ── 宣言と実装が食い違っていた。 */
const 仮 = path.join(HERE, '.guardian-pull-tmp');
try { fs.rmSync(仮, { recursive: true, force: true }); } catch (_) {}
const c = 走る('git', ['clone', '--depth', '1', '-q', 正本, JSON.stringify(仮)]);
if (c.status !== 0) {
  console.error('✗ 正本を取れませんでした: ' + String(c.stderr || '').slice(0, 300));
  console.error('  正本は公開なので認証は要りません。ネットに繋がっているか、git が入っているかを確かめてください。');
  process.exit(1);
}
try { fs.rmSync(path.join(仮, '.git'), { recursive: true, force: true }); } catch (_) {}

/* ── ③ 何が変わるかを数える(黙って上書きしない) ── */
const 読む = (p) => { try { return fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n'); } catch (_) { return null; } };
/* ★【配るもの】と【配らないもの】を**両方**宣言する(2026-08-29 依頼主の判断)。
 *
 *   正本のリポジトリには「他所へ配るもの」と「Guardian 自身がこの現場で使うもの」が同居する。
 *   最初は【配らないもの】だけを並べていた(ブラックリスト)。だがそれは
 *   **新しく作ったものが既定で配られる**という向きなので、書き忘れると混入する ──
 *   実際、1日で3回漏れた(research / .claude / CLAUDE.md)。
 *
 *   反転(ホワイトリストだけ)にすると、今度は**書き忘れたものが黙って配られない**。
 *   エラーも出ないので誰も気づけない(AI Council FIND-001 の Case G)。
 *   **どちらも書き忘れで壊れる。壊れ方が逆になるだけである。**
 *
 * ★だから両方持つ: どちらにも載っていないものが1つでもあれば、selfcheck が【赤】にする。
 *   新しいファイルを足した人は、**どちらかに書くまで先へ進めない**。
 *   配布と導入は毎日やる作業ではないので、ここは厳重にしてよい(依頼主の判断)。
 *
 * ★門(この道具)と検査(selfcheck)は**同じ2つの宣言を読む** ── RULES 44条(門には双子を置く)。
 *   門は黙って死ねるので、同じ宣言を読む検査が要る。 */
const 配るもの = new Set([
  /* エンジン */
  'check.mjs', 'selfcheck.mjs', 'neighbors.mjs', 'verdict.mjs', 'install.mjs', 'pull.mjs', 'index.mjs',
  'hooks', 'githooks', 'templates',
  /* 文書 */
  'README.md', 'SPEC.md', 'METHOD.md', 'RULES.md', 'WHY.md', 'WHY_INDEX.md', 'WHY_SEEN',
  'CHANGELOG.md', 'KIT_VERSION', 'ENGINE_FP', 'audit.md', 'install.md', 'hunch.md',
]);
const 現場のもの = new Set([
  'guardian.config.json',   // Guardian 自身の現場の宣言
  'docs',                   // Guardian 自身の地図
  '.guardian',              // Guardian 自身の作業記録
  '.claude', 'CLAUDE.md',   // Guardian 自身のフック登録と開発規範
  'research',               // AI Council(研究の記録。配布物ではない)
  '.guardian-pull-tmp',    // 取り直しの作業場(塊の中に作る。下の 仮 と同じ名前)
  /* ★改行の流儀は【この正本のリポジトリの話】なので配らない(2026-08-30)。
   *   指紋(selfcheck)は改行を正規化して照合するので、配布先には要らない。
   *   むしろ配ると、他人のリポジトリの guardian/ 以下の扱いを黙って変えてしまう。 */
  '.gitattributes',
  '.git', '.github', 'node_modules',
]);

/* ★分類表は【上流の版】で判定する(2026-08-30、違和感の掘り出しで見つかった)。
 *
 *   分類表(配るもの / 現場のもの)は、置き換えられる当の pull.mjs の中に在る。
 *   直す前はその**手元の古い表**で門を回していたので、上流が新しいファイルを足して
 *   **上流側では正しく分類済み**にしても、配布先は「決まっていません」と言って取り直しを拒み、
 *   「正本の pull.mjs に書いてください」(もう書いてある)と案内した ── **手で直すまで更新できない自己ロック**。
 *
 * ★上流の表を読んで判定する。読めなければ手元の表に落とす(そのときは黙らずに言う)。
 *   ★上流を信じてよいのは【分類の網羅】の判定だけである ── 実際に何を配るかは、
 *     この後の一覧でも上流の表を使うので、どちらも同じ1つを見ることになる。 */
const 表を読む = (src, 名) => {
  const h = src.indexOf(名 + ' = new Set([');
  if (h < 0) return null;
  const t = src.indexOf(']);', h);
  if (t < 0) return null;
  return new Set([...src.slice(h, t).matchAll(/'([^']*)'/g)].map((m) => m[1]));
};
{
  const 上流の表 = (() => {
    try {
      const src = fs.readFileSync(path.join(仮, 'pull.mjs'), 'utf8');
      const w = 表を読む(src, '配るもの'), b = 表を読む(src, '現場のもの');
      return (w && b && w.has('check.mjs') && b.has('docs')) ? { 配る: w, 現場: b } : null;
    } catch (_) { return null; }
  })();
  if (!上流の表) console.log('(上流の分類表が読めないので、手元の表で判定します)');
  const W = 上流の表 ? 上流の表.配る : 配るもの;
  const B = 上流の表 ? 上流の表.現場 : 現場のもの;
  const 直下 = fs.readdirSync(仮).map((n) => n);
  const 未分類 = 直下.filter((n) => !W.has(n) && !B.has(n));
  const 両方 = 直下.filter((n) => W.has(n) && B.has(n));
  if (未分類.length || 両方.length) {
    fs.rmSync(仮, { recursive: true, force: true });
    if (未分類.length) {
      console.error('✗ 正本に【配るものとも現場のものとも決まっていない】ものがあります: ' + 未分類.join(', '));
      console.error('  正本の pull.mjs で、配るもの / 現場のもの のどちらかに書いてください。');
      console.error('  ★決めないまま配ると、混入するか、黙って欠落するかのどちらかが起きます。');
    }
    if (両方.length) {
      console.error('✗ 両方に書かれているものがあります(どちらか一方にしてください): ' + 両方.join(', '));
    }
    process.exit(1);
  }
  /* この先の一覧も、上流の表で歩く(手元の古い表で歩くと、新しいものが欠落する) */
  if (上流の表) { for (const x of 上流の表.配る) 配るもの.add(x); for (const x of 上流の表.現場) 現場のもの.add(x); }
}

const 一覧 = (dir, 元 = dir, 深さ = 0) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  if (現場のもの.has(e.name)) return [];                      // どの深さでも配らない
  if (深さ === 0 && !配るもの.has(e.name)) return [];          // 直下は【配ると決めたもの】だけ
  const full = path.join(dir, e.name);
  return e.isDirectory() ? 一覧(full, 元, 深さ + 1)
                         : [path.relative(元, full).split(path.sep).join('/')];
});
const 新しい = 一覧(仮);
const 変わる = [], 増える = [];
for (const f of 新しい) {
  const a = 読む(path.join(HERE, f)), b = 読む(path.join(仮, f));
  if (a === null) 増える.push(f);
  else if (a !== b) 変わる.push(f);
}
const 旧版 = (読む(path.join(HERE, 'KIT_VERSION')) || '?').trim();
const 新版 = (読む(path.join(仮, 'KIT_VERSION')) || '?').trim();

/* ★上流で消えたものを、配布先からも消す(2026-08-30、違和感の掘り出しで見つかった)。
 *   直す前は「上流にあるものを写す」だけで、**上流から消えたファイルを消す経路がどこにも無かった**。
 *   実測: 上流で hooks/no-reflex.js を廃止して配ったら、配布先には残り続け、
 *   しかも上流の ENGINE_FP からその行も消えているので selfcheck は緑を返した ──
 *   **廃止したはずのフックが、誰にも見えないまま生き続ける。**
 * ★勝手に消さない: 何を消すかを先に出し、--check なら消さない(この塊の掟)。
 *   配布先が自分で足したものは消さない ── **上流に「かつて在って、いま無い」ものだけ**が対象で、
 *   それは【配るもの】の中にしか居ない。 */
const 消える = [];
for (const 名 of 配るもの) {
  const 手元 = path.join(HERE, 名);
  const 上流 = path.join(仮, 名);
  if (!fs.existsSync(手元) || fs.existsSync(上流)) continue;
  消える.push(名);
}
const 中の消える = [];
{
  const 走る2 = (rel) => {
    const 手元 = path.join(HERE, rel), 上流 = path.join(仮, rel);
    let ents = []; try { ents = fs.readdirSync(手元, { withFileTypes: true }); } catch (_) { return; }
    for (const e of ents) {
      const r = rel + '/' + e.name;
      if (!fs.existsSync(path.join(仮, r))) { 中の消える.push(r); continue; }
      if (e.isDirectory()) 走る2(r);
    }
  };
  for (const 名 of 配るもの) {
    try { if (fs.statSync(path.join(HERE, 名)).isDirectory() && fs.existsSync(path.join(仮, 名))) 走る2(名); } catch (_) {}
  }
}
const 全消える = [...消える, ...中の消える];
if (全消える.length) console.log('消えるもの: ' + 全消える.join(', ') + '(上流から撤去されました)');

console.log('正本: ' + 正本);
console.log('版: ' + 旧版 + ' → ' + 新版);
console.log('変わるもの: ' + (変わる.length ? 変わる.join(', ') : 'なし')
  + (増える.length ? ' / 増えるもの: ' + 増える.join(', ') : ''));

if (見るだけ) { fs.rmSync(仮, { recursive: true, force: true }); process.exit(0); }
if (!変わる.length && !増える.length && !全消える.length) {
  fs.rmSync(仮, { recursive: true, force: true });
  console.log('✓ すでに正本と同じです(取り直す必要はありません)');
  process.exit(0);
}

/* ── ④ 置き換える ── */
for (const f of 新しい) {
  const 先 = path.join(HERE, f);
  fs.mkdirSync(path.dirname(先), { recursive: true });
  fs.copyFileSync(path.join(仮, f), 先);
}
for (const 名 of 全消える) {
  try { fs.rmSync(path.join(HERE, 名), { recursive: true, force: true }); } catch (_) {}
}
fs.rmSync(仮, { recursive: true, force: true });
console.log('✓ 取り直しました(' + 新しい.length + 'ファイル' + (全消える.length ? ' / 撤去 ' + 全消える.length + '件' : '') + ')');
console.log('  次にやること: node guardian/install.mjs   ← 冪等。宣言とフックを新しい形に揃えます');
