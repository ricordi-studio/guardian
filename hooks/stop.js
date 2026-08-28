/* Stop フック: 「できました」と言い終える【手前】で、合否を機械に言わせる。
 *
 * なぜ要るか:
 *   検査も計器も既に在るのに、**回さずに完了を名乗れる**のが穴だった。
 *   2026-08-21、検査31本が全部緑のまま実機で404が出た。緑だったのは「回した範囲」だけで、
 *   回していない範囲は緑でも赤でもなく【不明】── それを人が実機で踏むまで誰も知らなかった。
 *
 *   ★完了の判定を、AIの外へ移す。 これがこのフックの全部である。
 *
 * 何をするか:
 *   実装が変わっていれば `verdict.mjs --fast --json` を回し、
 *     差戻(出口1) … **止める**。理由を返し、直してからもう一度出させる
 *     不明(出口2) … 止めない。ただし**何が測れていないか**を必ず本人に返す
 *     通過(出口0) … 黙って通す
 *
 * 止めない設計の理由:
 *   ・**実装が変わっていなければ回さない**(会話だけのターンで数秒待たせない。
 *     催促と同じで、出し過ぎると読み飛ばされる ── clock.js と同じ考え方)
 *   ・`stop_hook_active` が立っていたら**二度は止めない**(止め続けると仕事が進まない)
 *   ・**何かに失敗したら黙って通す**(フックが落ちると開発そのものが止まる。塊の約束1)
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { findRoot, loadConfig } = require('./lib-root');

const pass = () => process.exit(0);

let input = '';
process.stdin.on('data', (c) => { input += c; });
process.stdin.on('end', () => {
  try { main(); } catch (_) { pass(); }
});

function main() {
  let ev = {};
  try { ev = JSON.parse(input || '{}'); } catch (_) { return pass(); }

  /* すでに一度止めた後なら、もう止めない(堂々巡りを作らない) */
  if (ev.stop_hook_active) return pass();

  const ROOT = findRoot(__dirname);
  const CFG = loadConfig(ROOT);
  if (!(CFG.evidence || []).length) return pass();      // 証拠が宣言されていない現場では何もしない

  /* ---- 実装が変わっていなければ回さない ---- */
  const MARK = path.join(ROOT, '.claude', 'verdict_at');
  const WATCH = CFG.watch || ['src', 'app', 'lib', 'server', 'web'];
  const SKIP = new Set(['node_modules', '.wrangler', 'dist', 'build', '.git', 'img', 'avatar', 'vendor']);
  const newest = (dir, depth = 0) => {
    let n = 0;
    if (depth > 4) return n;
    let es;
    try { es = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return n; }
    for (const e of es) {
      if (e.name.startsWith('.')) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { if (!SKIP.has(e.name)) n = Math.max(n, newest(full, depth + 1)); }
      else { try { n = Math.max(n, fs.statSync(full).mtimeMs); } catch (_) {} }
    }
    return n;
  };
  let last = 0;
  try { last = Number(fs.readFileSync(MARK, 'utf8').trim()) || 0; } catch (_) {}
  const changed = WATCH.some((w) => newest(path.join(ROOT, w)) > last);
  if (!changed) return pass();

  /* ---- 合否を集める ---- */
  const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'verdict.mjs'), '--fast', '--json'],
    { cwd: ROOT, encoding: 'utf8', timeout: 15 * 60 * 1000, windowsHide: true });
  let v = null;
  try { v = JSON.parse(r.stdout || '{}'); } catch (_) { return pass(); }
  if (!v || !v.results) return pass();

  try { fs.mkdirSync(path.dirname(MARK), { recursive: true }); fs.writeFileSync(MARK, String(Date.now())); } catch (_) {}

  const of = (k) => v.results.filter((x) => x.verdict === k);
  const brief = (x) => {
    /* ★赤い行を優先する。広い網で拾うと、見本の【名前】(「…落ちる」「…外れ」)まで
     * 抜粋に混ざって、何が落ちたのか読めなくなる(実測 2026-08-22)。読めない報告は読まれない。 */
    const all = String(x.out || '').split('\n');
    let lines = all.filter((l) => /[✗✘]/.test(l));
    if (!lines.length) lines = all.filter((l) => /Error|error|失敗/.test(l));
    lines = lines.slice(0, 6);
    return `  【${x.verdict}】${x.name}${x.note ? ' ── ' + x.note : ''}`
      + (lines.length ? '\n' + lines.map((l) => '      ' + l.trim().slice(0, 200)).join('\n') : '');
  };

  const blocked = of('差戻');
  if (blocked.length) {
    /* ★止める。ここでだけ止める ── 「違反を機械で示せた」ときだけ。 */
    const reason = '完了を名乗る手前の合否が【差し戻し】です。直してからもう一度出してください。\n'
      + blocked.map(brief).join('\n')
      + (of('不明').length ? '\n  ※あわせて【不明】が ' + of('不明').length + ' 件あります(測れていない=通っていない)。' : '')
      + '\n手元で見るには: node guardian/verdict.mjs';
    process.stdout.write(JSON.stringify({ decision: 'block', reason }));
    return process.exit(0);
  }

  const unknown = of('不明');
  const warn = of('注意');
  if (unknown.length || warn.length) {
    /* 止めないが、**黙らない**。測れていないものを緑に混ぜないのがこの塊の芯。 */
    const reason = '合否は止めるほどではありませんが、**測れていないもの**があります。'
      + '完了を報告するときは、これを「不明」として正直に書いてください(緑に混ぜない)。\n'
      + [...unknown, ...warn].map(brief).join('\n');
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: { hookEventName: 'Stop', additionalContext: reason },
    }));
    return process.exit(0);
  }

  return pass();
}
