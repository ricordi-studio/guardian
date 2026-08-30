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

/* ★シェルを通さない(2026-08-30、違和感の掘り出しで見つかった)。
 *   直す前は `shell: true` + 引数の配列だった。この形は Node が **DEP0190 で非推奨**にしている
 *   ── 引数は逃がされず、ただ連結されるだけなので、**呼ぶ側が自分で括る**必要がある。
 *   実際そうしていて(JSON.stringify で括る)、Windows では二重の逆斜線がたまたま通っていた。
 * ★引数の配列をそのまま渡せば、括る作法ごと要らなくなる ── 括り忘れる場所を消す。
 *   neighbors.mjs で同じ形の実害(空白入りの経路で git が落ち、嘘の理由が出た)を踏んでいる。 */
const 走る = (cmd, args, opts = {}) =>
  spawnSync(cmd, args, { encoding: 'utf8', windowsHide: true, ...opts });

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

/* ★弾くのは【名前】ではなく【場所】である(2026-08-30、配布先を 9.13 → 9.22 に上げて見つけた)。
 *
 *   直す前は `現場のもの.has(e.name)` を**どの深さでも**当てていた。
 *   `guardian.config.json` は現場のもの(その現場の宣言)なので、
 *   **`templates/guardian.config.json` まで同じ名前で弾かれていた。**
 *   ところが指紋の対象(ENGINE_FILES)は【配るもの】から導くので、templates/ の中は入っている ──
 *   **配らないのに、配ったことにして指紋を照合していた。**
 *
 *   実測(9.13 の現場を建てて本物の正本から取り直した): 取り直した直後に
 *     ✗ この塊は配られたときの中身と違います(templates/guardian.config.json)
 *   が出る。その現場は**1文字も直していない**のに。
 *   さらに 9.21 で入れた守りが噛み合って、**出口が無くなった**:
 *     ・pull  … 「この現場で塊を直しています」で拒否
 *     ・stamp … 「ここは配布先です」で拒否
 *   ★自分が「出口の無い部屋を作るな」と書いた版(9.22)で、その部屋を作っていた。
 *
 * ★直下は【配ると決めたもの】だけを歩く。だから深い所で名前を見て弾く必要はない。
 *   どこに在っても要らないもの(版管理と依存の置き場)だけを、深さに関係なく落とす。 */
const どこでも要らない = new Set(['.git', 'node_modules', '.guardian', '.guardian-pull-tmp']);
const 一覧 = (dir, 元 = dir, 深さ = 0) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  if (どこでも要らない.has(e.name)) return [];
  if (深さ === 0 && (現場のもの.has(e.name) || !配るもの.has(e.name))) return [];
  const full = path.join(dir, e.name);
  return e.isDirectory() ? 一覧(full, 元, 深さ + 1)
                         : [path.relative(元, full).split(path.sep).join('/')];
});

/* ★【何を配るか】を、門自身に言わせる口(2026-08-30、配布先を 9.13 → 9.22 に上げて見つかった)。
 *   selfcheck はこれを回して、指紋の対象(ENGINE_FILES)と突き合わせる ── 44条の双子。
 * ★検査の側で歩き方を書き写すと、写した方は正しいままなので**門の退行を測れない**
 *   (実際そう書いて、直す前の形に戻しても緑のままだった)。だから門に言わせる。
 * ★クローンより手前に置く ── 一覧を見るだけならネットは要らない。 */
if (process.argv.includes('--distributed')) {
  for (const f of 一覧(HERE)) process.stdout.write(f + String.fromCharCode(10));
  process.exit(0);
}

/* ── ① この現場で塊を直していないか ──
 *
 * ★「こちらで直した」と「正本が進んだ(こちらは古いだけ)」を区別する(2026-08-30、配布先からの報告②)。
 *
 *   直す前は、指紋が食い違えば**どちらも同じ扱い**で止めていた。配布先の報告:
 *     1. pull.mjs だけ手で新しくした
 *     2. → 守りが「この現場で塊を直しています」と言って取り直しを止めた
 *     3. → 指紋も手で入れた → 今度は別の3ファイルが「違う」と言われる
 *     4. → git で丸ごと戻してから取り直して解決
 *   **堂々巡り**である。守りとしては正しく働いているのに、**出口が無い**。
 *
 * ★区別する材料は、この道具の手元にある ── **正本を一時領域に取っているのだから、
 *   食い違ったファイルの中身を正本と突き合わせればよい**(報告者の指摘どおり)。
 *     手元 == 正本 … この現場の直りではない(誰かが先に手で写しただけ)→ 止めない
 *     手元 != 正本 … 本当にこの現場の直り → 止める
 * ★どのファイルが食い違ったかは `selfcheck --changed` から受け取る。
 *   直す前は赤い文の**文言**を includes で見ていたが、文言は変わる(実際 9.21 で変えた)。
 * ★だから判定は【クローンの後】に移した。ネットが要る代わりに、区別できる。 */
const 食い違い = (() => {
  const r = 走る(process.execPath, [path.join(HERE, 'selfcheck.mjs'), '--changed']);
  if (r.status !== 0) return null;                     // 測れなかった(下で正直に言う)
  return String(r.stdout || '').split('\n').map((s) => s.trim()).filter(Boolean);
})();

/* ── ② 正本を一時領域に取る ── */
/* ★一時フォルダは【塊の中】に作る(2026-08-30、違和感の掘り出しで見つかった)。
 *   直す前は HERE/../.guardian-pull-tmp ── 塊の**外**に作っていた。
 *   配布先ではプロジェクトの根、そして**正本ではデスクトップ直下**になる
 *   (塊がリポジトリそのものなので HERE の1つ上はデスクトップ)。
 *   しかも作る前に rmSync(recursive, force) するので、**同名のフォルダが在れば警告なく消える**。
 *   この道具の冒頭には「guardian/ しか触らない」と書いてあった ── 宣言と実装が食い違っていた。 */
const 仮 = path.join(HERE, '.guardian-pull-tmp');
try { fs.rmSync(仮, { recursive: true, force: true }); } catch (_) {}
const c = 走る('git', ['clone', '--depth', '1', '-q', 正本, 仮]);
if (c.status !== 0) {
  console.error('✗ 正本を取れませんでした: ' + String(c.stderr || '').slice(0, 300));
  console.error('  正本は公開なので認証は要りません。ネットに繋がっているか、git が入っているかを確かめてください。');
  process.exit(1);
}
try { fs.rmSync(path.join(仮, '.git'), { recursive: true, force: true }); } catch (_) {}

/* ── ①' 食い違いを、正本と突き合わせて仕分ける(クローンが済んでから) ── */
{
  const 読む素 = (p) => { try { return fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n'); } catch (_) { return null; } };
  if (食い違い === null) {
    /* ★測れなかったことを黙らない。ただし止めもしない ── 測れないのは「直りが在る」証拠ではない。
     *   代わりに、上書きされ得るものを人に見せる(この塊の「無音を安全と読ませない」)。 */
    console.log('※この現場の直りを確かめられませんでした(selfcheck が答えません)。'
      + '直したものが在るなら、先に `node guardian/selfcheck.mjs --report` で1枚を作ってください。');
  } else if (食い違い.length) {
    const この現場の直り = [];
    const 正本と同じ = [];
    const 手元に無い = [];
    for (const f of 食い違い) {
      const 手元 = 読む素(path.join(HERE, f));
      const 上流 = 読む素(path.join(仮, f));
      /* ★手元に無いものは【この現場の直り】ではない(2026-08-30)。
       *   直りは「在って、違う」ものである。**無い**のは配り漏れであって、
       *   上書きしても失うものが無い ── ここを直り側に置くと、
       *   「消せば直る」という唯一の逃げ道まで塞いでしまう。 */
      if (手元 === null) { if (上流 !== null) 手元に無い.push(f); continue; }
      /* 上流に無いもの(この現場が足したもの)は、正本と比べようがない ── 直り側に置く */
      if (上流 !== null && 手元 === 上流) 正本と同じ.push(f);
      else この現場の直り.push(f);
    }
    if (手元に無い.length) {
      console.log('(手元に無いので取り込みます: ' + 手元に無い.join(', ')
        + ' ── 以前の版が配り漏らしたものです)');
    }
    if (正本と同じ.length) {
      console.log('(指紋は古いが、正本と同じ中身でした: ' + 正本と同じ.join(', ')
        + ' ── この現場の直りではないので、そのまま進めます)');
    }
    if (この現場の直り.length) {
      /* ★出口を必ず示す(2026-08-30)。守りが正しく働いても、**出口が無ければ堂々巡り**になる。
       *   ★とくに【前回の取り直しが途中で終わった】ときは、この現場は何も直していないのに
       *     ここへ来る ── 自分自身を更新する道具は、**更新の1回目には古い自分で走る**からである。
       *     実測: 9.13 の現場を 9.23 へ上げると、古い pull が templates/ の1本を配り漏らし、
       *     次の pull がそれを「この現場の直り」と読んで拒否した。
       *   ★だから --force を置く。外向きに不可逆(直りが消える)なので、
       *     **何が消えるかを必ず先に出し**、下見の口(--check)を対で持つ。 */
      if (process.argv.includes('--force')) {
        console.log('★--force: 次のものを上書きします(この現場の直りは消えます): ' + この現場の直り.join(', '));
      } else {
        fs.rmSync(仮, { recursive: true, force: true });
        console.error('✗ この現場で塊を直しています: ' + この現場の直り.join(', '));
        console.error('  取り直すと、その直りが消えます。');
        console.error('  ① 還すなら: `node guardian/selfcheck.mjs --report` で1枚を作り、正本へ渡す');
        console.error('  ② 直した覚えが無いなら: **前回の取り直しが途中で終わっています**');
        console.error('     (古い版の pull が配り漏らした形)。中身を見て構わなければ、');
        console.error('     その1本を消してもう一度取り直すか、`node guardian/pull.mjs --force` で上書きしてください');
        console.error('  ③ 何が起きるかだけ見る: `node guardian/pull.mjs --check`');
        process.exit(1);
      }
    }
  }
}

/* ── ③ 何が変わるかを数える(黙って上書きしない) ── */
const 読む = (p) => { try { return fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n'); } catch (_) { return null; } };

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
