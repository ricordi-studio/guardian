/* UserPromptSubmit フック: 毎ターン現在時刻を注入し、地図の定期監査が遅れていれば促す。
 *
 * なぜ時刻か: LLMは時計を持たない。「応答の冒頭に日時を記す」規則は機械注入でしか守れない。
 *   憶測の時刻を書くのが最悪(時間感覚の欠如を隠蔽する)。
 *
 * なぜ催促が【変更で駆動】か: 「3時間たった」だけでは催促しない。**前回の監査より後に
 *   実装が変わっている**ときだけ促す。開発が止まっている間も催促が出続けると、
 *   人もAIも通知に慣れて、本当に必要なときまで読み飛ばす。
 *   ★催促は「出し過ぎない」ことまで含めて設計する ── これがこの塊の設計思想の中心。
 *
 * この塊はどこに置かれても動く(lib-root がプロジェクトの根を自分で探す)。
 * 失敗しても黙って通す ── フックが落ちると開発そのものが止まるため。
 */
const fs = require('fs');
const path = require('path');
const { findRoot, loadConfig } = require('./lib-root');

const ROOT = findRoot(__dirname);
const CFG = loadConfig(ROOT);

function stamp(d) {
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate())
    + '_' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
}

const now = new Date();
let msg = '現在時刻: ' + stamp(now)
  + ' ── 応答の冒頭に必ずこの形式の日時を記すこと(絶対規則・省略不可)。';

const AUDIT_FILE = path.join(ROOT, '.guardian', 'audit_at');
const LIMIT_MS = (Number(CFG.auditHours) || 3) * 60 * 60 * 1000;
const WATCH = CFG.watch || ['site', 'worker', 'gas', 'src', 'app', 'lib'];
const SKIP_DIR = new Set(['node_modules', '.wrangler', 'dist', 'build', '.git', 'img', 'avatar', 'vendor']);

// 指定フォルダ以下で、最後に変更されたファイルの時刻(ミリ秒)。見つからなければ0
function newestMtime(dir, depth = 0) {
  let newest = 0;
  if (depth > 4) return newest;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return newest; }
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIR.has(e.name)) continue;
      newest = Math.max(newest, newestMtime(full, depth + 1));
    } else {
      try { newest = Math.max(newest, fs.statSync(full).mtimeMs); } catch (_) {}
    }
  }
  return newest;
}

let last = null;
try {
  const v = Number(fs.readFileSync(AUDIT_FILE, 'utf8').trim());
  if (Number.isFinite(v)) last = v;
} catch (_) { /* 記録なし */ }

const overdue = last === null || (now.getTime() - last > LIMIT_MS);
let changed = 0;
if (overdue) for (const w of WATCH) changed = Math.max(changed, newestMtime(path.join(ROOT, w)));
// 前回監査より後に実装が変わっているか(記録が無いときは、一度は促す)
const touched = last === null || changed > last;

if (overdue && touched) {
  msg += '\n地図(CODEMAP)の定期監査が期限超過(前回: ' + (last ? stamp(new Date(last)) : '記録なし')
    + (changed ? ' / その後 ' + stamp(new Date(changed)) + ' に実装が変わっている' : '')
    + ')。作業の区切りで guardian/audit.md の手順を実施し、'
    + '完了時に .guardian/audit_at を更新すること。';
}

/* プロジェクト固有の催促は【別のフック】に置く。ここに足すと、塊を配ったときに
 * 他所では意味の無い催促が出る ── 意味の無い催促は、本当に必要な催促を殺す。 */

console.log(JSON.stringify({
  suppressOutput: true,
  hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: msg },
}));
