/* ★このフックが【黙って通る / 言って通る】道の宣言(24.7、2026-09-03、会議で @kozo が求めた)。
 *
 *   ★★検査(B18)は hooks/ を全部 叩き、**黙って通ったマス**を見つける。
 *   ★★★黙ってよい理由は【このファイル】に書く ── 離れた表に書くと、
 *   道を足した人と表を直す人が別の場所に居ることになり、黙って漏れる。
 *   (23.x で 外す.mjs の「手で並べた一覧」を消したのと同じ理由) */
/* @黙る道: 全部 ── これはフックではなく共有の部品。読み込んだだけで何も起こさない事は B16 が毎回 測る */
/* この塊がどこに置かれても、プロジェクトの根を自分で見つける。
 * ★これが「1フォルダをコピペすれば動く」の要。置き場所を決め打ちにすると、
 *   コピー先で階層が違うだけで黙って動かなくなる(そして誰も気づかない)。 */
const fs = require('fs');
const path = require('path');

function findRoot(start) {
  let d = start;
  for (let i = 0; i < 8; i++) {
    const has = (p) => { try { return fs.existsSync(path.join(d, p)); } catch (_) { return false; } };
    /* ★【塊のフォルダ自身を根と見なさない】(2026-08-29 実地で見つかった)。
     *   古い pull.mjs は guardian.config.json / docs も【配らないもの】に持っていた時期があるが、
     *   CLAUDE.md と .claude は持っていなかった。取り直すと塊の中に正本の現場ファイルが出来る ──
     *   それを目印にすると **guardian/ を根だ**と言い、フックが【配布先ではない宣言】を読む。
     * ★塊がリポジトリそのものである現場(正本)では、同じ場所に .git が在るので下の判定が勝つ。 */
    const 塊そのもの = has('check.mjs') && has('selfcheck.mjs') && !has('.git');
    if (!塊そのもの && (has('guardian.config.json') || has(path.join('docs', 'CODEMAP.md')) || has('.git'))) return d;
    const up = path.dirname(d);
    if (up === d) break;
    d = up;
  }
  return start;
}

/* ★【無い】と【壊れている】を分ける(24.2、2026-09-03、会議で @kozo が踏み方まで出した)。
 *
 *   ★★直す前は どちらも {} を返した。門は「証拠が宣言されていない現場」と読んで通した。
 *   ★★★実測: guardian.config.json のカンマを1つ落とす → 門は【無言で出口0】。
 *   **設定が壊れているのに、緑になる。**
 *
 *   ★読む口は1つのまま(同じ問いを2箇所で読まない)。返す物に印を1つ足すだけなので、
 *   ★★.evidence 等を読む他のフックの振る舞いは変わらない。 */
/* ★【見る所】の既定値は、ここが正本(24.8、2026-09-03、会議で @kozo が「測っていない」と挙げた)。
 *
 *   ★★直す前は3箇所に在り、しかも【値が違った】:
 *     clock.js / codemap.js … site worker gas src app lib
 *     stop.js               … src app lib server web
 *
 *   ★★★実測(watch を宣言していない現場):
 *     server/a.js … 合否の門は見るのに、★地図は差し込まれない(codemap 0バイト)
 *     gas/a.js    … ★★地図は差し込まれるのに、合否の門が見ない
 *   **同じ塊の2つの半分が、「コードとは何か」で食い違っていた。**
 *
 *   ★寄せる向きは【広い方】── 狭める方向は、見張りを黙って減らすことになる。
 *   ★★watch を宣言している現場は、いままで通り その宣言が勝つ(何も変わらない)。 */
const 既定の見る所 = ['site', 'worker', 'gas', 'src', 'app', 'lib', 'server', 'web'];

function loadConfig(root) {
  for (const p of ['guardian.config.json', path.join('tools', 'guardian', 'guardian.config.json')]) {
    const 先 = path.join(root, p);
    let 生 = null;
    try { 生 = fs.readFileSync(先, 'utf8'); } catch (_) { continue; }   /* 無い → 次を見る */
    try { return JSON.parse(生); } catch (e) {
      return { 壊れている: p, 壊れた訳: String((e && e.message) || e) };  /* ★在るが読めない */
    }
  }
  return {};
}

/* ★設定が壊れていたら【一度だけ言う】(24.4、2026-09-03、会議で @kozo が「測っていない」と挙げた)。
 *
 *   ★★実測: 現場が watch:["packages"] と宣言していても、カンマを1つ落とすと
 *   宣言が黙って既定値([site worker gas src app lib])に差し替わる ──
 *   ★★★codemap は src/a.js に 0バイト → 308バイト。**見る範囲が変わるのに、誰も言わない。**
 *
 *   ★門(stop.js)は これで【止める】。★★合図のフック(clock / codemap)は【続ける】── 
 *   止めると人が作業できなくなるだけで、合図は合図でしかない。
 *   ★★★だが 24.3 の掟と同じ: **続けるなら、続けたと言う。**
 *
 *   文言は1箇所に置く(呼ぶ側が2つ在るので、写経すると片方が古くなる)。 */
function 設定が壊れていたら言う(cfg, 誰) {
  if (!cfg || !cfg.壊れている) return false;
  console.error('★Guardian(' + 誰 + '): ' + cfg.壊れている + ' が読めません。'
    + String.fromCharCode(10) + '★★宣言は使えないので【組み込みの既定値】で続けます ── '
    + '見る範囲が、あなたが宣言した物と違います。'
    + String.fromCharCode(10) + '  訳: ' + cfg.壊れた訳);
  return true;
}

module.exports = { findRoot, loadConfig, 設定が壊れていたら言う, 既定の見る所 };
