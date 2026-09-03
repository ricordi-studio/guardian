/* ★このフックが【黙って通る / 言って通る】道の宣言(24.7、2026-09-03、会議で @kozo が求めた)。
 *
 *   ★★検査(B18)は hooks/ を全部 叩き、**黙って通ったマス**を見つける。
 *   ★★★黙ってよい理由は【このファイル】に書く ── 離れた表に書くと、
 *   道を足した人と表を直す人が別の場所に居ることになり、黙って漏れる。
 *   (23.x で 外す.mjs の「手で並べた一覧」を消したのと同じ理由) */
/* @通す道: 入力が読めない ── 止めた事すら分からない(stop_hook_active が読めない)ので通す。stderr で必ず言う */
/* @黙る道: 正しい設定 ── 合否が通過なら黙る(鳴りすぎない)。差戻・測れなかったは止める */
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

/* ★【測れなかった】を、合格と同じ動きにしない(2026-09-03、会議で @codex が指摘)。
 *
 *   ★★実測(直す前): verdict.mjs を壊す / JSON でない物を出させる
 *     → ★★★どちらも この門は【黙って通した】(出口0・出力なし)。
 *
 *   ★この門の仕事は「完了を名乗る手前で止める」ことである。
 *   ★★測れないときに通すと、**測れないことが、いちばん通りやすい道**になる。
 *   ★★★この塊の一行目(不明は合格ではない)を、門そのものが破っていた。
 *
 * ★止める側に倒す。堂々巡りは stop_hook_active が既に止めている(上の行) ──
 *   ★★一度 止めたあとの2回目は通るので、人が verdict を直す間に閉じ込められることはない。 */
const 測れなかった = (何, 詳しく) => {
  const reason = '★合否が【測れませんでした】── ' + 何 + String.fromCharCode(10)
    + (詳しく ? '  ' + String(詳しく).split(String.fromCharCode(10)).slice(0, 6).join(String.fromCharCode(10) + '  ') + String.fromCharCode(10) : '')
    + '★★測れないことを【通した】ことにはしません(不明は合格ではありません)。' + String.fromCharCode(10)
    + '手元で見るには: node guardian/verdict.mjs --fast --json' + String.fromCharCode(10)
    + '★★★この門を一度 止めたあとは通ります ── 直す間に閉じ込められることはありません。';
  process.stdout.write(JSON.stringify({ decision: 'block', reason }));
  return process.exit(0);
};

let input = '';
process.stdin.on('data', (c) => { input += c; });
/* ★門の中で例外が出たら【通さない】(24.2、2026-09-03)。
 *   ★★直す前は catch (_) { pass() } で、★★★どんな壊れ方をしても無言の緑になった。
 *   この塊の掟は「見えない失敗を作らない」で、その門が自分で作っていた。
 *
 *   ★輪を切る判定(stop_hook_active)は try の【外】で先にやる ──
 *   ★★中でやると、止めた後の再入も同じ所で例外になり、人を閉じ込める。 */
process.stdin.on('end', () => {
  let ev = {};
  /* ★入力が読めない時だけは通す ── 止めた事すら分からない(stop_hook_active が読めない)ので、
   *   ★★閉じ込めない方を選ぶ。ここは残った穴として HANDOVER に書く。 */
  try { ev = JSON.parse(input || '{}'); } catch (e) {
    /* ★通すなら【通したと言う】(24.3、2026-09-03、@codex の条文の後半・@kozo が測った)。
     *
     *   ★★ここは この塊で【唯一 fail-open を認めた道】である。
     *   認めた以上、通った事がどこにも残らないと、次に誰かが同じ形を見つけた時に
     *   ★★★「fail-open が在る」のか「たまたま黙った」のかを区別できない。
     *
     *   ★実測(直す前): 入力に JSON でない物を流す → stdout 0バイト・stderr 0バイト。
     *   ★★診断が1文字も出なかった。 */
    console.error('★Guardian: hook入力が読めないので、合否を【測れませんでした】。'
      + String.fromCharCode(10) + '★★ここは通します ── 止めた事すら分からない'
      + '(stop_hook_active が読めない)ので、閉じ込めない方を選んでいます。'
      + String.fromCharCode(10) + '★★★これは【通した】であって【合格】ではありません。'
      + String.fromCharCode(10) + '  訳: ' + String((e && e.message) || e)
      + String.fromCharCode(10) + '  手元で見るには: node guardian/verdict.mjs --fast --json');
    return pass();
  }
  if (ev.stop_hook_active) return pass();
  try { main(ev); }
  catch (e) { 測れなかった('門の中で例外が出ました', (e && (e.stack || e.message)) || String(e)); }
});

function main(ev) {

  const ROOT = findRoot(__dirname);
  const CFG = loadConfig(ROOT);
  /* ★設定が【在るのに読めない】時は通さない(24.2)── 「無い」とは別の話。
   *   ★★実測(@kozo の踏み方): guardian.config.json のカンマを1つ落とす → 直す前は無言で出口0。 */
  if (CFG.壊れている)
    return 測れなかった('設定が読めません: ' + CFG.壊れている, CFG.壊れた訳);
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
  /* ★宣言 watch の【外】で仕事をすると、この門は一度も回らなかった
   *   (2026-09-03、★★外の監査役が実測)。
   *
   *   ★★★実測(直す前): 導入直後の watch は ["src"]。src に触らず server/api.js を作ると、
   *   合否は 不明1 / 出口2 なのに、★この門は【出力なし・出口0】── 合否そのものを回していない。
   *
   *   ★★install は【現場に実在するフォルダ】からしか watch を作らないので、
   *   ★★★導入後に生まれた層は**永久に watch の外**に居る。
   *   README の書き出しは「接点が4層に散っていても1層だけ直され」だが、
   *   ★**新しい層を丸ごと足す改修**が、ちょうど門の回らない形だった。
   *
   * ★★だから git にも聞く ── 変わった道と、まだ入れていない道を出させ、
   *   ★★★その中に印より新しい物が1つでも在れば回す(watch の中か外かを問わない)。
   *   git が答えないときは、これまでどおり watch を歩く(黙って通さない)。 */
  let changed = WATCH.some((w) => newest(path.join(ROOT, w)) > last);
  if (!changed) {
    try {
      const 道 = require('../道.cjs');
      const 候補 = [];
      for (const c of [['ls-files', '--others', '--exclude-standard'], ['diff', '--name-only', 'HEAD']]) {
        const r = 道.道を取る(ROOT, ...c);
        if (!r.落ちた) 候補.push(...r.道);
      }
      for (const rel of [...new Set(候補)]) {
        /* ★【塊が自分で書いた物】では起きない(2026-09-03、会議で @kozo が実測)。
         *
         *   ★★実測(直す前): .claude/ が git から見える現場で、何も変えずに3回 叩くと
         *   ★★★毎回 門が回った ── git が「.claude/verdict_at(印そのもの)が新しい」と言うため。
         *   **門が、自分の押した印で、自分を起こしていた。**
         *
         *   ★★台帳も同じ(書き手が走行中の分を書き足す)。
         *   ★★★門の札は「実装が変わっていなければ回さない」である ──
         *   .guardian/ の中と印は【実装】ではなく、**道具の出力**なので、ここでは数えない。 */
        if (rel === ".git" || rel.startsWith(".git/") || rel.startsWith("node_modules/")) continue;
        if (rel === ".guardian" || rel.startsWith(".guardian/")) continue;
        if (rel === ".claude/verdict_at") continue;
        let st = null;
        try { st = fs.statSync(path.join(ROOT, rel)); } catch (_) { continue; }
        if (st.mtimeMs > last) { changed = true; break; }
      }
    } catch (_) { /* ★道.cjs が無い古い配布先では、watch だけで見る(前の版と同じ) */ }
  }
  if (!changed) return pass();

  /* ---- 合否を集める ---- */
  const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'verdict.mjs'), '--fast', '--json'],
    { cwd: ROOT, encoding: 'utf8', timeout: 15 * 60 * 1000, windowsHide: true });
  /* ★4通りに分ける(2026-09-03)── ★★どれも「合格」ではない */
  if (r.error) return 測れなかった('合否の道具を起動できません', r.error.message);
  if (!String(r.stdout || '').trim())
    return 測れなかった('合否の道具が何も言いませんでした(出口 ' + r.status + ')', r.stderr);
  let v = null;
  try { v = JSON.parse(r.stdout); } catch (e) {
    return 測れなかった('合否の出力が JSON として読めません(出口 ' + r.status + ')',
      String(r.stdout).slice(0, 300));
  }
  if (!v || !Array.isArray(v.results))
    return 測れなかった('合否の出力に results が在りません(出口 ' + r.status + ')', JSON.stringify(v).slice(0, 300));

  /* ★共通の書き手を通す(2026-09-03) ── ここは【現場の .claude/ に塊が書く】唯一の場所。
   *   ★★台帳に載せないと、外すとき「誰の物か決まっていない」に落ちる。 */
  try { require('../書き手.cjs').書く(ROOT, '.claude/verdict_at', String(Date.now()), 'hooks/stop.js'); } catch (_) {}

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
