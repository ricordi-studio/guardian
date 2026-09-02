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
/* ★【知らない口は、黙って無視しない】(2026-08-31、配布先(現場A)の実測)。
 *
 * ★実際に起きた経路 ── これは今夜ずっと話していた「1回目は古い自分で走る」の続きである:
 *     依頼「SHA X を測って」
 *       → pull --at X    … 成功。中身が X(版 9.38)になる
 *       → 直して測り直す
 *       → pull --at X    … ★9.38 に --at という口は無い。**黙って無視して main を取る**
 *       → 「X を測った」と報告する            ← 嘘。測ったのは main
 *   受領証は正しく main の SHA を出す。だが人は『--at X と打った』記憶で報告する。
 *   ★つまり**測定契約が2回目で崩れる**。しかも黙って崩れる。
 * ★だから知らない --xxx は**その場で出口1**。打った瞬間に止まる。
 * ★穴: 未来の口を先取りして渡す運用ができなくなる。だが pull の引数は測定契約に使うものなので、
 *   **黙って別の動きをするより、止まる方が安い**(提案者の言葉)。
 * ★この直し自体は、古い版には届かない ── 9.42 以前を取ってから戻る経路は依然として黙る。
 *   届くのは『ここから先』だけである。それでも入れる理由は、口はこれからも増えるからである。 */
{
  const 知っている口 = ['--口一覧', '--check', '--force', '--distributed', '--at'];
  const 値を取る口 = { '--at': 1 };
  const 残りを全部取る口 = [];
  const 渡されたもの = process.argv.slice(2);
  const 知らない = [];
  const 足りない = [];
  for (let i = 0; i < 渡されたもの.length; i++) {
    const v = 渡されたもの[i];
    if (!v.startsWith('--')) continue;             /* 口の値(SHA など)は飛ばす */
    if (!知っている口.includes(v)) { 知らない.push(v); continue; }
    /* ★【値が足りない】も言う(2026-08-31、配布先が境界を叩いて見つけた)。
     *   直す前は、2つ取る口に1つしか来なくても**黙って通していた** ──
     *   その先で `undefined` を値として使い、**遠くで分かりにくく壊れる**。
     *   ★害が無いから放っておく、ではなく **「言ってもいない」のが問題**である(46条の形)。
     *   ★数えるのは【後ろに残っている数】だけ ── 値の中身は見ない(パスにも SHA にも見えるので)。 */
    const 要る = 値を取る口[v] || 0;
    if (要る && i + 要る >= 渡されたもの.length + 0) {
      /* 後ろに 要る 個そろっていない */
      足りない.push(v + "(値が " + 要る + " 個要りますが " + (渡されたもの.length - i - 1) + " 個です)");
    }
    i += 要る;
  }
  if (足りない.length) {
    console.error('✗ 口に渡す値が足りません: ' + 足りない.join(', '));
    console.error('  ★黙って進むと、その先で値なしのまま使われ、**遠くで分かりにくく壊れます**');
    process.exit(1);
  }
  if (知らない.length) {
    let 版 = '?';
    try { 版 = fs.readFileSync(path.join(HERE, 'KIT_VERSION'), 'utf8').trim(); } catch (_) {}
    console.error('✗ この版(' + 版 + ')は、その口を知りません: ' + 知らない.join(', '));
    console.error('  知っている口: ' + 知っている口.join(' / '));
    console.error('  ★黙って無視すると、**打ったつもりと違う動きをしたまま報告することになります**');
    console.error('  (`--at` は 9.41 以降です。古い中身へ戻したあとは、まずその口が在るかを確かめてください)');
    process.exit(1);
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
}
const 見るだけ = process.argv.includes('--check');

/* ★シェルを通さない(2026-08-30、違和感の掘り出しで見つかった)。
 *   直す前は `shell: true` + 引数の配列だった。この形は Node が **DEP0190 で非推奨**にしている
 *   ── 引数は逃がされず、ただ連結されるだけなので、**呼ぶ側が自分で括る**必要がある。
 *   実際そうしていて(JSON.stringify で括る)、Windows では二重の逆斜線がたまたま通っていた。
 * ★引数の配列をそのまま渡せば、括る作法ごと要らなくなる ── 括り忘れる場所を消す。
 *   neighbors.mjs で同じ形の実害(空白入りの経路で git が落ち、嘘の理由が出た)を踏んでいる。 */
const 走る = (cmd, args, opts = {}) =>
  spawnSync(cmd, args, { encoding: 'utf8', windowsHide: true, ...opts, timeout: 60000 });

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
  '道.cjs',              /* ★git から道の一覧を取る唯一の口(2026-09-03)。行では割れない */
  '書き手.cjs',          /* ★共通の書き手(2026-09-03)。走行中に増える物を、書いた事実で台帳に載せる */
  '外す.mjs',            /* ★外す側(2026-09-03)。台帳と実物の差から、塊の持ち物だけ外す */
  '台帳.mjs',            /* ★所有台帳(2026-09-03)。install が【何をどの根から置いたか】を残す */
  /* エンジン */
  'check.mjs', 'selfcheck.mjs', 'neighbors.mjs', 'verdict.mjs', 'install.mjs', 'pull.mjs', 'index.mjs',
  'hooks', 'githooks', 'templates',
  /* ★フックを CommonJS に固定するためだけの1枚(2026-08-30)。配布先が type:module だと5本とも静かに死ぬ */
  'package.json',
  /* 文書 */
  'README.md', 'SPEC.md', 'METHOD.md', 'RULES.md', 'WHY.md', 'WHY_INDEX.md', 'WHY_SEEN',
  'CHANGELOG.md', 'KIT_VERSION', 'ENGINE_FP', 'audit.md', 'install.md', 'hunch.md',
  /* ★機械が読む【約束の宣言】(2026-08-31、配布先(CodeX)の指摘)。
   *   綴りで能力を測ると、コメントや死にコードで偽陽性・書き換えで偽陰性になる。
   *   ★嘘は書けるので、selfcheck B8g が実際の振る舞いと突き合わせる(44条の双子)。 */
  'PROTOCOL.json',
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
  /* セッション間の会話(この現場だけの作業場)。配らない */
  'talk', '.gitignore',
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
/* ★フォルダごと配る宣言の中から、1件だけ外す口(2026-09-03、会議で導かれた)。
 *   ★★規則: 【配るもの】が【現場のもの】を require していたら矛盾である。
 *   実測: hooks/ はフォルダごと配るが、hooks/in-loop.js は .guardian/印の場所.cjs
 *   (= 現場のもの)を require する。★★★配布先では、その依存が無いので働けない。
 *   ★「配る物は配布先で動く」を守るため、この1件だけ外す(器の層の話ではなく、依存の向きの話)。 */
const 配らない道 = new Set(['hooks/in-loop.js']);

const どこでも要らない = new Set(['.git', 'node_modules', '.guardian', '.guardian-pull-tmp']);
const 一覧 = (dir, 元 = dir, 深さ = 0) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  if (どこでも要らない.has(e.name)) return [];
  if (深さ === 0 && (現場のもの.has(e.name) || !配るもの.has(e.name))) return [];
  const full = path.join(dir, e.name);
  if (e.isDirectory()) return 一覧(full, 元, 深さ + 1);
  const 道 = path.relative(元, full).split(path.sep).join('/');
  return 配らない道.has(道) ? [] : [道];
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
/* ★【依頼された中身を取り直す口】 --at <SHA>(2026-08-31、配布先(CodeX)の提案)。
 *
 * ★実際に起きた: 「425d… を測ってください」と依頼したのに、配布先が測ったのは ccdde… だった。
 *   受領証は**違いを検出**したが、pull は常に最新 main を取るので、
 *   配布先には**依頼された物を取り直す手段が無かった**。
 *     「違う物を測った」と分かる ✅ / 「依頼された物を測り直す」 ❌
 * ★これで測定依頼が【契約】になる ── 依頼後に main が進んでも、同じ物を再現できる。
 * ★指定した SHA と実際に取れた SHA が違えば**配らない**(取り違えを黙って進めない)。
 * ★穴(提案者が自分で書いた): 任意の古い SHA を許すと、**既知の危険版も配れる**。
 *   いまは口を開けるだけにして、絞り込みは入れていない ── 使うのは測定依頼の場面で、
 *   依頼された SHA を一時的に取るためだからである。日常の取り直しは今までどおり main。 */
const 依頼SHA = (() => {
  const i = process.argv.indexOf('--at');
  if (i < 0) return null;
  const v = String(process.argv[i + 1] || '').trim();
  if (!/^[0-9a-f]{7,40}$/.test(v)) {
    console.error('✗ --at には SHA を渡してください(7〜40桁の16進)。渡されたもの: ' + JSON.stringify(v));
    process.exit(1);
  }
  return v;
})();
const c = 依頼SHA
  ? 走る('git', ['clone', '-q', 正本, 仮])          /* SHA を指すので浅く取れない */
  : 走る('git', ['clone', '--depth', '1', '-q', 正本, 仮]);
if (c.status !== 0) {
  console.error('✗ 正本を取れませんでした: ' + String(c.stderr || '').slice(0, 300));
  console.error('  正本は公開なので認証は要りません。ネットに繋がっているか、git が入っているかを確かめてください。');
  process.exit(1);
}
if (依頼SHA) {
  const k = 走る('git', ['-C', 仮, 'checkout', '-q', 依頼SHA]);
  if (k.status !== 0) {
    console.error('✗ その中身が正本にありません: ' + 依頼SHA);
    console.error('  ' + String(k.stderr || '').slice(0, 200));
    try { fs.rmSync(仮, { recursive: true, force: true }); } catch (_) {}
    process.exit(1);
  }
  /* ★【戻った先が、同じ依頼をもう一度受けられるか】を配る前に確かめる
   *   (2026-08-31、配布先(CodeX)の案A・現場A の実測)。
   *
   * ★実際に起きた経路: --at で 9.38 へ戻ると、その 9.38 に --at は無い。
   *   2回目の `pull --at X` は**黙って無視されて main を取る** ── 測定契約が2回目で崩れる。
   *   9.43 の「知らない口は出口1」は**ここから先にしか届かない**(過去版は直せない)。
   * ★だから入口で閉める: **--at を持たない中身は、--at では配らない。**
   *   過去版を測るなら、この現場を書き換えずに**外の git で使い捨ての写しを作る**
   *   (配布先はそれで 9.22 → 9.30 の実測をしている ── --at は一度も要らなかった)。
   * ★見るのは版の番号ではなく**実装が在るか**である ── 版は人が上げる表示名なので。 */
  /* ★【綴りではなく、宣言で測る】(2026-08-31、配布先(CodeX)の指摘)。
   *
   * ★直す前はソースの文字列 `process.argv.indexOf('--at')` を探していた。
   *   配布先が4通り食わせて、両方向とも壊れることを実証した:
   *     コメントに残っているだけ        → **通る**(偽陽性)
   *     if (false) の死にコード          → **通る**(偽陽性)
   *     parseArgs へ書き換えた正しい実装 → **拒否**(偽陰性)
   *   ★**綴りに縛られた検査は、正しく直した人を罰する。**これは検査が外される典型の形である。
   * ★だから相手の `PROTOCOL.json` を JSON として読む。無ければ「約束を持たない」。
   * ★相手を**起動しない** ── 9.42 以前は未知の口を黙って無視して**本物の取り直しを始める**ので、
   *   問い合わせのつもりが取り直しになる(配布先の実測)。静的に読むだけにする。
   * ★宣言には嘘が書ける。だから selfcheck の B8g が、この現場の宣言と
   *   **いまの pull.mjs が実際にする振る舞い**を突き合わせる(44条の双子)。 */
  let 約束 = null;
  try { 約束 = JSON.parse(fs.readFileSync(path.join(仮, 'PROTOCOL.json'), 'utf8')); } catch (_) {}
  const 持っている = Array.isArray(約束?.capabilities) ? 約束.capabilities : [];
  if (!(Number(約束?.pullProtocol) >= 1) || !持っている.includes('at-sha')) {
    let 相手の版 = '?';
    try { 相手の版 = fs.readFileSync(path.join(仮, 'KIT_VERSION'), 'utf8').trim(); } catch (_) {}
    console.error('✗ その中身(版 ' + 相手の版 + ')は --at の約束を持っていません: ' + 依頼SHA);
    console.error('  (PROTOCOL.json が' + (約束 ? ' at-sha を宣言していません' : ' 在りません') + ')');
    console.error('  配ると、**次に同じ --at を打っても黙って無視され、main を取ります**');
    console.error('  ── 「その SHA を測った」という記録だけが残り、中身は main になります。');
    console.error('  過去の中身を測るなら、この現場を書き換えずに外の git で使い捨ての写しを作ってください:');
    console.error('    git clone ' + 正本 + ' <使い捨ての場所> && git -C <使い捨ての場所> checkout ' + 依頼SHA);
    try { fs.rmSync(仮, { recursive: true, force: true }); } catch (_) {}
    process.exit(1);
  }
  console.log('★依頼された中身を取ります: ' + 依頼SHA + '(main ではありません)');
}
/* ★【どこから取ったか】の受領証を残す(2026-08-31、配布先(CodeX)の提案)。
 *
 *   いままで配布先が言えるのは「版 9.xx で緑」だけだった。だが版は**人が上げる番号**で、
 *   同じ版のまま中身が変わることも、push されていない差が在ることもある。
 *   実際この会議で「9.29 で緑」と報告された時点で、正本は既に 9.30 だった。
 * ★SHA なら**その中身そのもの**を指せる。配布先の「緑」が、どの中身の緑かが決まる。
 *   ★これは未 push を**検出**する仕組みではない ── 未 push は SHA を発行できないので、
 *     そもそも測定を依頼できない、という形で入口が閉まる(提案者の言葉)。
 * ★.git を消す前に【読む】(消したあとでは分からない)。だが**書くのは取り直しが全部済んでから**
 *   (2026-08-31、CodeX の指摘)── 途中で失敗した回の SHA を残すと、
 *   **混在した状態を「正しく取得した」と名乗る**ことになる。
 * ★読めなければ書かない ── 嘘の受領証は作らない。
 * ★これだけでは「いまの中身がその SHA である」証明にはならない(取ったあとに壊れうる)。
 *   そこは `selfcheck --receipt` が、合否と同じ回で digest ごと返す。 */
const 取得SHA = (() => {
  const r = 走る('git', ['-C', 仮, 'rev-parse', 'HEAD']);
  const v = r.status === 0 ? String(r.stdout || '').trim() : '';
  return /^[0-9a-f]{40}$/.test(v) ? v : null;
})();
if (依頼SHA && 取得SHA && !取得SHA.startsWith(依頼SHA)) {
  /* ★指定と実物が違うのに配ると、受領証だけが正しい顔をする(9.40 で直したのと同じ形) */
  console.error('✗ 依頼された中身と、取れた中身が違います: 依頼 ' + 依頼SHA + ' / 実物 ' + 取得SHA);
  try { fs.rmSync(仮, { recursive: true, force: true }); } catch (_) {}
  process.exit(1);
}

/* ★受領証は【中身が正本と一致したと言い切れる時だけ】残す(2026-08-31、CodeX の指摘 → 配布先が実走で反例)。
 *
 * ★経緯: 最初は「書くのを最後にすれば良い」と考えた。配布先が実走して反例を出した ──
 *   **全部のコピーが成功し、最後の受領証の書込みだけが落ちる**と、catch が握り潰して
 *   pull は正常終了し、**前回の(嘘の)SHA がそのまま残る**。
 *   実測(配布先): `--receipt` が `{ sourceSha: 000…, verdict: "通過" }` を**出口0**で返した。
 *   ★原子的に結合していても、片方が古ければ**結合したままの嘘**になる。
 * ★だから3つ要る:
 *   ① **1文字でも書き換える前に、古い受領証を無効にする**(途中で死んでも嘘は残らない)
 *   ② 全部済んでから、新しい SHA を原子的に置く(一時ファイル → rename)
 *   ③ **受領証が書けなかったら、pull を成功と言わない**(握り潰さない)
 * ★無効の形は「消す」ではなく「`.updating` へ退避」── 何が起きたか読めるようにするため。
 *   selfcheck はこれを見て **未測**(=途中で終わっている)と言う。分からないを緑に混ぜない。
 * ★これでも「いまの中身がその SHA である」証明にはならない(取ったあと人が壊しうる)。
 *   そこは selfcheck --receipt が、合否と現在の指紋を同じ1回で返して閉じる。 */
const 受領証の置き場 = path.join(HERE, ".guardian");
const 受領証の先 = path.join(受領証の置き場, "pulled.json");
let 受領証が書けなかった = false;

/* ① 触る前に、古い受領証を無効にする。**無効にできたかを返す**
 *   (2026-08-31、配布先(CodeX)の指摘 ── 最初は best effort で、両方失敗しても進んでいた)。
 * ★『やった』ではなく『消えた』を見る ── rename も削除も失敗したら、
 *   古い受領証が残ったままコピーへ進み、9.38 の反例がそのまま再成立する。
 * ★配布先の実測: rename 単独の失敗は実際に起きた(削除が救った)。
 *   両方の失敗は再現できなかった ── **再現できないことは、起きないことではない**。 */
function 受領証を無効にする() {
  try { if (!fs.existsSync(受領証の先)) return true; } catch (_) { return false; }
  try {
    fs.renameSync(受領証の先, 受領証の先 + ".updating");
  } catch (_) {
    /* 退避できないなら消す ── 嘘を残すぐらいなら、分からない状態にする */
    try { fs.rmSync(受領証の先, { force: true }); } catch (_) {}
  }
  try { return !fs.existsSync(受領証の先); } catch (_) { return false; }
}
function 無効にできなければ止める() {
  if (受領証を無効にする()) return;
  console.error('✗ 古い受領証を無効にできません: ' + 受領証の先);
  console.error('  ここで進むと、中身は新しいのに**前回の SHA を取得した**という嘘が残ります。');
  console.error('  **1文字も書き換えずに止めます。**そのファイルの権限やロックを外して、もう一度 pull を回してください');
  try { fs.rmSync(仮, { recursive: true, force: true }); } catch (_) {}
  process.exit(1);
}

/* ② 全部済んでから、新しい SHA を原子的に置く。③ 書けなければ黙らない */
function 受領証を書く() {
  /* ★SHA を読めなかった回も『どの中身から来たか名乗れない』── 黙って0で終わらない
   *   (2026-08-31、配布先(CodeX)の指摘)。 */
  if (!取得SHA) {
    受領証が書けなかった = true;
    console.log('★取得元の SHA が読めませんでした ── どの中身から来たかを名乗れません');
    return;
  }
  try {
    fs.mkdirSync(受領証の置き場, { recursive: true });
    fs.writeFileSync(受領証の先 + ".tmp",
      JSON.stringify({ sha: 取得SHA, 正本, at: new Date().toISOString() }, null, 1) + String.fromCharCode(10));
    fs.renameSync(受領証の先 + ".tmp", 受領証の先);
    try { fs.rmSync(受領証の先 + ".updating", { force: true }); } catch (_) {}
  } catch (e) {
    受領証が書けなかった = true;
    console.log("★受領証が書けませんでした: " + String(e && e.message).slice(0, 160));
    console.log("  中身は取り直せていますが、**どの中身から来たかを名乗れません**。");
    console.log("  " + 受領証の先 + " の置き場を確かめて、もう一度 pull を回してください");
    console.log("  (よくある原因: pulled.json.tmp と同じ名前のフォルダが在る)");
  }
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
    const 壊れている = [];
    for (const f of 食い違い) {
      const 手元 = 読む素(path.join(HERE, f));
      const 上流 = 読む素(path.join(仮, f));
      /* ★手元に無いものは【この現場の直り】ではない(2026-08-30)。
       *   直りは「在って、違う」ものである。**無い**のは配り漏れであって、
       *   上書きしても失うものが無い ── ここを直り側に置くと、
       *   「消せば直る」という唯一の逃げ道まで塞いでしまう。 */
      if (手元 === null) { if (上流 !== null) 手元に無い.push(f); continue; }
      /* ★【壊れている】は【直した】ではない(2026-08-31、配布先からの報告)。
       *   構文が通らないものを「この現場の直り」と読むと、取り直しが止まり、
       *   しかも --report が壊れた中身を正本へ還そうとする。 */
      if (/.(mjs|js)$/.test(f) && 走る(process.execPath, ['--check', path.join(HERE, f)]).status !== 0) {
        壊れている.push(f); continue;
      }
      /* 上流に無いもの(この現場が足したもの)は、正本と比べようがない ── 直り側に置く */
      if (上流 !== null && 手元 === 上流) 正本と同じ.push(f);
      else この現場の直り.push(f);
    }
    if (壊れている.length) {
      console.log('(構文が通らないので【壊れている】と見ます: ' + 壊れている.join(', ')
        + ' ── 直りではないので上書きします)');
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
/* ★取った中身そのものを1行出す(2026-08-31、配布先の提案)。
 *   版だけだと『同じ版で中身が違う』ときに配布先が何も言えない。 */
if (取得SHA) console.log('取得元: ' + 取得SHA);
console.log('変わるもの: ' + (変わる.length ? 変わる.join(', ') : 'なし')
  + (増える.length ? ' / 増えるもの: ' + 増える.join(', ') : ''));

if (見るだけ) { fs.rmSync(仮, { recursive: true, force: true }); process.exit(0); }
if (!変わる.length && !増える.length && !全消える.length) {
  fs.rmSync(仮, { recursive: true, force: true });
  /* ★中身は正本と同じだが、受領証は古い SHA のままかもしれない ── 置き直す。
   *   先に無効にするのは、書けなかったときに古い SHA が居座らないようにするため。 */
  無効にできなければ止める();
  受領証を書く();
  console.log('✓ すでに正本と同じです(取り直す必要はありません)');
  process.exit(受領証が書けなかった ? 1 : 0);
}

/* ── ④ 置き換える ── */
/* ★1文字でも書き換える前に、古い受領証を無効にする(2026-08-31、配布先の実走した反例)。
 *   ここで死んでも「前回の SHA を取得した」という嘘は残らない ── 残るのは .updating(=途中)。 */
無効にできなければ止める();
for (const f of 新しい) {
  const 先 = path.join(HERE, f);
  fs.mkdirSync(path.dirname(先), { recursive: true });
  fs.copyFileSync(path.join(仮, f), 先);
}
for (const 名 of 全消える) {
  try { fs.rmSync(path.join(HERE, 名), { recursive: true, force: true }); } catch (_) {}
}
fs.rmSync(仮, { recursive: true, force: true });
受領証を書く();
console.log('✓ 取り直しました(' + 新しい.length + 'ファイル' + (全消える.length ? ' / 撤去 ' + 全消える.length + '件' : '') + ')');
console.log('  次にやること: node guardian/install.mjs   ← 冪等。宣言とフックを新しい形に揃えます');
/* ★受領証が書けなかったら、成功と言わない(2026-08-31、配布先の反例)。
 *   中身は入れ替わっているので取り直し自体は済んでいるが、**どの中身から来たかを名乗れない**。
 *   ここで出口0を返すと、次に読む側が『前回の SHA を取得した』という嘘を受け取る。 */
if (受領証が書けなかった) process.exit(1);
