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

module.exports = { findRoot, loadConfig };
