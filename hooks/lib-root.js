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

function loadConfig(root) {
  for (const p of ['guardian.config.json', path.join('tools', 'guardian', 'guardian.config.json')]) {
    try { return JSON.parse(fs.readFileSync(path.join(root, p), 'utf8')); } catch (_) {}
  }
  return {};
}

module.exports = { findRoot, loadConfig };
