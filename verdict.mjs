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
import { createRequire as __cr } from 'node:module';
const 書き手 = __cr(import.meta.url)('./書き手.cjs');
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/* ★【この道具が知っている口】── 宣言ではなく、ここが実装そのものである
 *   (2026-08-31、第2の議題。配布先(現場A)の実測が発端)。
 *
 * ★実際に起きたこと: 案内されている口を「ソースにその文字列が在るか」で照合したら、
 *   3通りの数え方で3通りの答えが出た。とくに `neighbors --list` は**文字列としては在るが、
 *   argv を見ていない**(既定動作だった)── **書いてある ≠ 口として在る**。
 *   これは 9.46 で `PROTOCOL.json` に置き換えたばかりの「綴りで能力を測る」罠と同じ形である。
 * ★だから【この配列が唯一の正】にする: ここが未知の口を拒み、ここが `--口一覧` を答える。
 *   selfcheck の B11 が、SPEC.md の表と**この出力**を突き合わせる(44条の双子)。
 * ★穴として書く: これが証明するのは「その口を受け付ける」までで、
 *   **その口が仕事をする**ことではない。そこは各口の検査の仕事。 */
const 知っている口 = ['--口一覧', '--fast', '--json', '--root'];
const 値を取る口 = { '--root': 1 };
const 残りを全部取る口 = [];
/* ★順番: **未知の口の走査が先、`--口一覧` は後**(2026-08-31、配布先の実測)。
 *   検査は `--口一覧 --zzz` の形で叩く ── 門が生きていれば **出口1**、
 *   門が壊れていれば `--zzz` が無視されて **口一覧が出て出口0**。
 *   ★逆順だと、門が壊れていても口一覧が先に出て**緑に見える**。
 *   ★そして「壊れている側で、その道具が本当に走り出す」ことも避けられる ──
 *     素の `--zzz` で叩くと、門が壊れた `verdict` は**本物の合否を回し始める**(検査が検査を呼ぶ)。 */
{
  const 渡された = process.argv.slice(2);
  const 知らない = [];
  const 足りない = [];
  for (let i = 0; i < 渡された.length; i++) {
    const v = 渡された[i];
    if (!v.startsWith('--')) continue;          /* 口の値は飛ばす */
    if (残りを全部取る口.includes(v)) break;     /* ここから先は全部その口の値 */
    if (!知っている口.includes(v)) { 知らない.push(v); continue; }
  /* ★【値が足りない】も言う(2026-08-31、配布先が境界を叩いて見つけた)。
   *   直す前は、2つ取る口に1つしか来なくても**黙って通していた** ──
   *   その先で `undefined` を値として使い、**遠くで分かりにくく壊れる**。
   *   ★害が無いから放っておく、ではなく **「言ってもいない」のが問題**である(46条の形)。
   *   ★数えるのは【後ろに残っている数】だけ ── 値の中身は見ない(パスにも SHA にも見えるので)。 */
    const 要る = 値を取る口[v] || 0;
    if (要る && i + 要る >= 渡された.length + 0) {
      /* 後ろに 要る 個そろっていない */
      足りない.push(v + "(値が " + 要る + " 個要りますが " + (渡された.length - i - 1) + " 個です)");
    }
    i += 要る;
  }
  if (足りない.length) {
    console.error('✗ 口に渡す値が足りません: ' + 足りない.join(', '));
    console.error('  ★黙って進むと、その先で値なしのまま使われ、**遠くで分かりにくく壊れます**');
    process.exit(1);
  }
  if (知らない.length) {
    console.error('✗ この道具は、その口を知りません: ' + 知らない.join(', '));
    console.error('  知っている口: ' + 知っている口.join(' / '));
    console.error('  ★黙って無視すると、打ったつもりと違う動きをしたまま報告することになります');
    process.exit(1);
  }
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
      const w = spawnSync(look, { cwd, shell: true, encoding: 'utf8', windowsHide: true, timeout: 60000 });
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
    /* ★Windows では この3つが【一度も当たらない】(26.0、2026-09-03、@codex が指し、叩いて確かめた)。
     *
     *   ★★実測: spawnSync("在りません", {shell:true}) → status 1 / error.code は undefined。
     *   ENOENT も 127 も出ない ── ★★★だから「動かせません」が【差戻】に化けていた。
     *   **測れなかったが、違反を機械で示せた、に化ける** ── この道具が一番 嫌う形である。
     *
     *   ★直しも【文言を使わない】(元の注釈の線を守る)── 落ちたときだけ、
     *   命令の頭の語が【そもそも在るか】を機械に聞く。在れば「落ちた」、無ければ「動かせなかった」。
     *
     *   ★★聞ける形は【許す形を並べない】── ASCII だけの網は この塊では必ず嘘をつく。
     *   ★★★実測: 命令名が日本語だと ASCII の網に当たらず、聞きに行かなかった(今夜3度目)。
     *   だから【聞けない形】(引用符・パイプ・道の区切りなど)だけを並べる。 */
    const 頭の語 = String(e.run || "").trim().split(/\s+/)[0] || "";
    const 聞ける = 頭の語.length > 0 && !new RegExp("[\\x22\\x27\\x7c\\x26\\x3c\\x3e\\x28\\x29\\x24\\x60\\x3b\\x5c\\x2f]").test(頭の語);
    const 命令が無い = (r.status !== 0 && 聞ける) ? (() => {
      const 窓 = process.platform === "win32";
      const w = spawnSync(窓 ? "where" : "command", 窓 ? [頭の語] : ["-v", 頭の語],
        { encoding: "utf8", shell: !窓, windowsHide: true, timeout: 15000 });
      return !(!w.error && w.status === 0);
    })() : false;
    const cantRun = (r.error && r.error.code === 'ENOENT') || r.status === 127
      || /ERR_MODULE_NOT_FOUND/.test(out) || 命令が無い;
    const timedOut = r.error && /ETIMEDOUT|timed out/i.test(String(r.error.code || r.error.message));
    const unknownRe = e.unknownIf ? new RegExp(e.unknownIf, 'i') : null;

    if (cantRun) push('不明', name, `動かせません(${e.run})`, out);
    else if (timedOut) push('不明', name, `${e.timeoutSec || 600}秒で返りませんでした`, out);
    /* ★宣言した「不明の形」は、出口0より【先に】見る(2026-08-31、配布先の実走)。
     *   直す前はこの判定が status===0 の**後ろ**に在ったので、出口0のときは一度も見られなかった。
     *   ところが selfcheck には「合否で拾いたい現場は evidence に unknownIf を足すと
     *   【不明】になる」と**案内が書いてあった** ── 案内された逃げ道が、実装に存在しなかった。
     * ★これは黙る事故より質が悪い ── **逃げ道を信じて設定した人が、設定した気になったまま緑を受け取る。**
     * ★出口の値では絞らない ── 前提が無くて落ちる道具は多い(出口1で「◯◯が要ります」と出す)。
     *   絞ると、宣言した現場の逃げ道がまた消える。実測: 出口0と2だけに絞ったら、
     *   合否の見本(CASES)が1件赤くなった ── **どの出力を不明と読むかは、その現場の宣言が決める。** */
    else if (unknownRe && unknownRe.test(out))
      push('不明', name, `${sec}秒 / 宣言した不明の形に当たりました(unknownIf)` + (e.needs ? ` ── 前提: ${e.needs}` : ``), out);
    else if (r.status === 0) push('通過', name, `${sec}秒`, out);
    /* ★出口2は【不明】(2026-08-30、新規プロジェクトの実走で見つかった)。
     *   neighbors.mjs の頭には『出口: 0=通過 / 1=差戻 / 2=不明。合否(verdict)は 2 を
     *   「不明」として扱い、緑に数えない』と**書いてある**。だが verdict は実装していなかった。
     *   実測: git の履歴がまだ無い新規プロジェクトで、門が正しく出口2(不明)を返したのに
     *   合否は**差戻**と言った ── 『測れていない』が『違反を機械で示せた』に化けていた。
     * ★宣言と実装の食い違いは、この塊がいちばん嫌う形である。実装をコメントに合わせる。 */
    else if (r.status === 2) push('不明', name, `${sec}秒 / 出口 2(測れなかった)`, out);
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
    /* ★機械にも【見ていない所】を欄で言う(27.17、@codex 18:38)。
     *   ★★自然文を混ぜる必要はない ── ★★★責務の範囲を、欄として持つ。
     *   `撤去: 0件` は「撤去を安全に確かめた」ではなく【走らせていない】である。 */
    見ていない所: { 撤去: '走らせていない(この合否は 外す.mjs を1度も呼びません)',
      意味: '「不明が無い」は「撤去が安全」という意味では ありません' },
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
/* ★合否の行に【出口】を入れる(27.23、2026-09-03、@codex 19:51 が「原子的に」と言った所)。
 *
 *   ★★事故(私の測り方): 私は 出口を1回目の走行で、文を2回目の走行で 取り、
 *   ★★★食い違いを見て「不変条件が破れた」と 会議に出した。
 *   実際は【2つの走行を 比べていた】── 1つの走行の中では、文も出口も 同じ n() から出る。
 *
 *   ★直すべきは 道具ではなく【測り方】だったが、
 *   ★★**二度 走らせないと 揃わない出力**が、その測り方を 誘っていた。
 *   ★★★だから 1回で 両方 見えるようにする。
 *
 *   ★(1度だけ見た 出口1 / 差戻0 は、5回の再試行で 再現しない。
 *    ★★原因は分かっていない ── ★★★直したとは 言わない。引き継ぎに 未解決として 置いた) */
console.log(`合否: ${overall}(通過 ${n('通過')} / 注意 ${n('注意')} / **不明 ${n('不明')}** / 差戻 ${n('差戻')})── 出口 ${code}${FAST ? ' ※速いものだけ' : ''}`);
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
    /* ★共通の書き手を通す(2026-09-03) ── 走行中に増える物を、書いた事実で台帳に載せる */
    try { 書き手.書く(ROOT, ".guardian/coverage", String(率) + String.fromCharCode(10), "verdict.mjs"); } catch (_) {}
  }
}
if (skipped.length) console.log('  ※この回で測っていないもの: ' + skipped.join(' / ') + '(--fast のため)');
/* ★但し書きは【合否を読んだ後】に置く(27.15)── ★★手前に置くと、合否より先に読まれる。
 *   ★★★人は数字を探して読むので、数字の後ろに置く方が届く。 */
/* ★この口が【見ていない所】を、口自身が言う(27.15、2026-09-03、@kozo が構造を測り @codex が同意)。
 *
 *   ★★実測(guardian.config.json の evidence): 走らせるのは4件 ── selfcheck / index / check / neighbors。
 *   ★★★`外す.mjs` は【1度も 走らせない】。だから撤去の結果は、この口の入力に そもそも入らない。
 *
 *   ★@codex は最初「跡の欄を verdict へ継げ」と求めたが、@kozo が測って
 *   ★★【継ぐ元が 存在しない】と分かった ── 欄が足りないのではなく、走らせていない。
 *
 *   ★★★これを言わないと「不明が無い = 撤去が安全」と読まれる。
 *   ★この塊は「測っていない所を【無い】と言わない」を掟にしているので、口の側で言う。 */
console.log(String.fromCharCode(10) + '★この合否は【入れた後の現場】を見ます ── '
  + '★★撤去(外す.mjs)の結果は、いま どの合否の口にも 出ません。'
  + String.fromCharCode(10) + '  ★★★撤去側には 合否の口が 1つも 在りません ── '
  + '「不明が無い」は「撤去が安全」という意味では ありません。');
process.exit(code);
