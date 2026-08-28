/* この塊がどこに置かれても、プロジェクトの根を自分で見つける。
 * ★これが「1フォルダをコピペすれば動く」の要。置き場所を決め打ちにすると、
 *   コピー先で階層が違うだけで黙って動かなくなる(そして誰も気づかない)。 */
const fs = require('fs');
const path = require('path');

function findRoot(start) {
  let d = start;
  for (let i = 0; i < 8; i++) {
    const has = (p) => { try { return fs.existsSync(path.join(d, p)); } catch (_) { return false; } };
    if (has('guardian.config.json') || has(path.join('docs', 'CODEMAP.md')) || has('.git')) return d;
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
