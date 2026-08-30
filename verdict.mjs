#!/usr/bin/env node
/**
 * 合否 ── 「できました」と言ってよいかを、AIの外で決める
 *
 *   node guardian/verdict.mjs           # 全部の証拠を集める
 *   node guardian/verdict.mjs --fast    # 速いものだけ(完了を名乗る手前で回す用)
 *   node guardian/verdict.mjs --json    # 機械が読む形(フックが使う)
 *
 * なぜこれが要るのか:
 *   検査も計器も既にある。足りていないのは【誰が合否を言うか】だった。
 *   いまは私(AI)が「できました」と言えて、嘘かどうかは人が実機で試すまで分からない。
 *   実際に、検査31本が全部緑のまま実機で404が出た(2026-08-21)。
 *
 * この道具がやること:
 *   宣言(guardian.config.json の evidence)に並んだ証拠を順に集め、**4語**に落とす。
 *
 *     通過 … 証拠があって、通った
 *     差戻 … 違反を機械で示せた(ここでだけ止める)
 *     注意 … 落ちたが、止めるほどではないと宣言されている
 *     不明 … **測れなかった**(前提が無い・道具が無い)
 *
 *   ★【不明を緑に数えない】のが、この道具の全部である。
 *     「エラーが無い」と「中身がある」は別(RULES.md 2)。測っていないものは、通っていない。
 *     不明の件数が増えること自体を「宣言の穴」として毎回出す。
 *
 * この道具は【判定を1つも持たない】。
 *   何を証拠とするかは宣言、合否の理屈は各証拠の出口コード。
 *   ここに現場固有のことを書いた瞬間、塊として配れなくなる(RULES.md 39条 / METHOD.md)。
 *
 * 出口コード: 差戻あり=1 / 不明あり=2 / それ以外=0
 *   ★子の出口2も【不明】として受ける(neighbors.mjs が宣言している約束)。
 *   ★不明を 0 にしない。CIも人も「0なら大丈夫」と読むので、そこで嘘をつくと全部が崩れる。
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const argv = process.argv.slice(2);
const rootArg = argv.indexOf('--root');
const ROOT = path.resolve(rootArg >= 0 ? argv[rootArg + 1] : process.cwd());
const FAST = argv.includes('--fast');
const JSON_OUT = argv.includes('--json');

const read = (p) => { try { return fs.readFileSync(path.join(ROOT, p), 'utf8'); } catch (_) { return ''; } };

/* ---------- 宣言を読む(check.mjs と同じ2箇所) ---------- */
let cfg = null;
for (const p of ['guardian.config.json', 'guardian/guardian.config.json']) {
  const t = read(p);
  if (!t) continue;
  try { cfg = JSON.parse(t); break; } catch (_) { /* 壊れていたら下で不明にする */ }
}

const results = [];
const skipped = [];      // --fast で回さなかったもの(名前を必ず出す)
const push = (verdict, name, note, out) => results.push({ verdict, name, note, out: out || '' });

if (!cfg) {
  push('不明', '宣言', 'guardian.config.json が読めません(JSONが壊れているか、置かれていない)');
} else if (!(cfg.evidence || []).length) {
  /* ★証拠が1つも宣言されていないとき【通過】と言わない。
   * 何も測っていない状態を「合格」と呼ぶのが、この道具が防ぎたいことそのもの。 */
  push('不明', '証拠', 'guardian.config.json に evidence がありません(何を証拠とするか決まっていない)');
} else {
  for (const e of cfg.evidence) {
    const name = e.name || e.run || '(名前なし)';
    /* ★--fast で飛ばしたものは【名前を出す】。黙って外すと、
     * 「速い方だけ回して全部通った」が「全部通った」に化ける ── それが一番よくある嘘の作られ方。 */
    if (FAST && !e.fast) { skipped.push(name); continue; }
    if (!e.run) { push('不明', name, '宣言に run がありません'); continue; }
    const cwd = path.join(ROOT, e.cwd || '.');
    if (!fs.existsSync(cwd)) { push('不明', name, `${e.cwd} が在りません`); continue; }

    /* ★道具が入っているかは【出口コードで】確かめる。文言で当てない。
     * 実測(2026-08-22): 道具が無いときシェルが返すのは、その機械の言語の文だった
     * ── 英語の言い回しで探す実装は、日本語Windowsで丸ごと外れる。
     * 当てにならない判定を「不明」の根拠にすると、不明が静かに差戻へ化ける。 */
    if (e.needsCmd) {
      const look = process.platform === 'win32' ? `where ${e.needsCmd}` : `command -v ${e.needsCmd}`;
      const w = spawnSync(look, { cwd, shell: true, encoding: 'utf8', windowsHide: true });
      if (w.status !== 0) { push('不明', name, `道具がありません(${e.needsCmd})`); continue; }
    }

    const t0 = Date.now();
    const r = spawnSync(e.run, {
      cwd, shell: true, encoding: 'utf8',
      timeout: Number(e.timeoutSec || 600) * 1000,
      windowsHide: true,
    });
    const sec = ((Date.now() - t0) / 1000).toFixed(1);
    const out = ((r.stdout || '') + (r.stderr || '')).trim();

    /* ★測れなかったのか、落ちたのか ── これを取り違えると「不明」が「合格」に化ける。
     * 前提が無い(相手が起きていない・道具が入っていない)は【不明】であって、合格でも不合格でもない。 */
    /* 「動かせなかった」の判定に使うのは【機械が返す符号】だけ(文言は使わない・上記の理由)。
     *   ENOENT … 実行そのものができなかった
     *   127    … POSIX の「そんなコマンドは無い」
     *   ERR_MODULE_NOT_FOUND … Node 自身が出す符号(言語に依らない) */
    const cantRun = (r.error && r.error.code === 'ENOENT') || r.status === 127
      || /ERR_MODULE_NOT_FOUND/.test(out);
    const timedOut = r.error && /ETIMEDOUT|timed out/i.test(String(r.error.code || r.error.message));
    const unknownRe = e.unknownIf ? new RegExp(e.unknownIf, 'i') : null;

    if (cantRun) push('不明', name, `動かせません(${e.run})`, out);
    else if (timedOut) push('不明', name, `${e.timeoutSec || 600}秒で返りませんでした`, out);
    else if (r.status === 0) push('通過', name, `${sec}秒`, out);
    /* ★出口2は【不明】(2026-08-30、新規プロジェクトの実走で見つかった)。
     *   neighbors.mjs の頭には『出口: 0=通過 / 1=差戻 / 2=不明。合否(verdict)は 2 を
     *   「不明」として扱い、緑に数えない』と**書いてある**。だが verdict は実装していなかった。
     *   実測: git の履歴がまだ無い新規プロジェクトで、門が正しく出口2(不明)を返したのに
     *   合否は**差戻**と言った ── 『測れていない』が『違反を機械で示せた』に化けていた。
     * ★宣言と実装の食い違いは、この塊がいちばん嫌う形である。実装をコメントに合わせる。 */
    else if (r.status === 2) push('不明', name, `${sec}秒 / 出口 2(測れなかった)`, out);
    else if (unknownRe && unknownRe.test(out)) push('不明', name, e.needs ? `前提が揃っていません(${e.needs})` : '前提が揃っていません', out);
    else if (e.warnOnly) push('注意', name, `${sec}秒 / 出口 ${r.status}`, out);
    else push('差戻', name, `${sec}秒 / 出口 ${r.status}`, out);
  }
}

/* ---------- まとめ ---------- */
const n = (v) => results.filter((x) => x.verdict === v).length;
const overall = n('差戻') ? '差し戻し' : n('不明') ? '不明あり' : '通過';
const code = n('差戻') ? 1 : n('不明') ? 2 : 0;

if (JSON_OUT) {
  console.log(JSON.stringify({
    overall, code, fast: FAST,
    counts: { 通過: n('通過'), 注意: n('注意'), 不明: n('不明'), 差戻: n('差戻') }, skipped,
    results: results.map((r) => ({ ...r, out: r.out.split('\n').slice(-20).join('\n') })),
  }, null, 2));
  process.exit(code);
}

for (const r of results) {
  const mark = { 通過: '  ✓ 通過', 注意: '  △ 注意', 不明: '  ? 不明', 差戻: '  ✗ 差戻' }[r.verdict];
  console.log(`${mark}  ${r.name}${r.note ? ' ── ' + r.note : ''}`);
  if (r.verdict === '差戻' || r.verdict === '注意') {
    /* 赤い行を優先(広い網は、見本の名前まで拾って読めなくする) */
    const all = r.out.split('\n');
    let lines = all.filter((x) => /[✗✘]/.test(x));
    if (!lines.length) lines = all.filter((x) => /Error|error|失敗/.test(x));
    for (const l of lines.slice(0, 6)) {
      console.log('        ' + l.trim().slice(0, 160));
    }
  }
}
console.log('');
console.log(`合否: ${overall}(通過 ${n('通過')} / 注意 ${n('注意')} / **不明 ${n('不明')}** / 差戻 ${n('差戻')})${FAST ? ' ※速いものだけ' : ''}`);
if (n('不明')) console.log('  ※【不明】は合格ではありません。測れなかったものが在るという意味です。');
/* ★【どれだけ測れたか】を割合で出す(2026-08-29 外部評価の指摘)。
 *
 *   「証拠10個で不明1個」と「証拠10個で不明8個」は、どちらも【不明あり】で同じ言葉になっていた。
 *   だが意味は全く違う ── 後者は**契約(宣言)が実装に追いついていない**という信号である。
 * ★不明は「測れなかった」であって「失敗」ではない。だから止めない。
 *   だが**測れた割合が下がり続けているなら、それは別の問題**で、数字にしないと見えない。
 * ★推移も出す: 前回の割合を .guardian/coverage に置き、下がったら言う。
 *   上がったときは黙る ── 良くなったことを毎回褒める計器は、悪くなったとき読み飛ばされる。 */
{
  const 測れた = n('通過') + n('注意') + n('差戻');
  const 全部 = 測れた + n('不明');
  if (全部) {
    const 率 = Math.round((測れた / 全部) * 100);
    const 台帳 = path.join(ROOT, '.guardian', 'coverage');
    let 前 = null;
    try { 前 = Number(String(fs.readFileSync(台帳, 'utf8')).trim()); } catch (_) {}
    let 一言 = '';
    if (Number.isFinite(前) && 率 < 前)
      一言 = '  ← 前回 ' + 前 + '% から下がりました。**宣言(evidence)が実装に追いついていない合図**です';
    console.log('  測れた割合: ' + 率 + '%(' + 測れた + '/' + 全部 + ')' + 一言);
    try { fs.mkdirSync(path.dirname(台帳), { recursive: true }); fs.writeFileSync(台帳, String(率) + '\n'); } catch (_) {}
  }
}
if (skipped.length) console.log('  ※この回で測っていないもの: ' + skipped.join(' / ') + '(--fast のため)');
process.exit(code);
