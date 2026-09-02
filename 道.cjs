/* git から【道の一覧】を受け取る、ただ1つの口(2026-09-03、会議で @codex と @kozo が形を出した)。
 *
 * ★なぜ在るか ── 道は【行】では割れない。
 *
 *   ★★実測(この塊の履歴で2回 続けて踏んだ):
 *     ① git は非ASCIIの道を **クォートして** 返す(17.2 で -c core.quotePath=false を入れた)
 *     ② ★★★クォートを切っても、`.trim().split(改行)` は**空白を持つ道を壊す**
 *
 *   ```
 *   在るファイル : " leading.mjs" / "middle space.mjs" / "trailing .mjs" / "日本語.mjs"
 *   trim().split : ["leading.mjs", ...]   ← ★先頭の空白が消え、★★実在しない道になる
 *   -z + NUL 割り: [" leading.mjs", ...]  ← ★★★正しい
 *   ```
 *
 * ★★壊れ方が悪い: 消えた道は【無かったこと】になる。エラーは出ない。
 *   ★★★「見なかった」とも言わない ── 届いていないので、居たことすら知らない。
 *   だからこの口は【保存則】を返す: 見つけた数 = 読めた数 + 読めなかった数。
 *
 * ★U+FFFD へ黙って化けさせない(@codex の指摘)。POSIX の道は任意のバイト列になり得るので、
 *   ★★Buffer で受けて NUL バイトで割り、★★★1件ずつ **fatal な UTF-8 復号**を試す。
 *   復号できない物は捨てず、`読めなかった` に16進で入れる ── 数が合わなくなるのを防ぐため。
 *
 * ★★この口の外で path の一覧を git から取ることは、selfcheck の門(B15)が赤にする。 */

const { spawnSync } = require('child_process');

/* ★-z を付けてよい下位命令だけを並べる ── ★★命令ごとに -z の位置と記録の形が違うので、
 *   ★★★汎用の「引数の最後に -z」を呼ぶ側に見せない(@codex の線)。
 *   ここに無い命令を渡したら、黙って通さずに落とす。 */
const 使ってよい命令 = new Set(['ls-files', 'diff', 'diff-tree', 'diff-index', 'show']);

/** git を Buffer で叩く(復号しない)。 */
function 生で叩く(cwd, args) {
  return spawnSync('git', ['-c', 'core.quotePath=false', ...args],
    { cwd, encoding: 'buffer', windowsHide: true, maxBuffer: 128 * 1024 * 1024, timeout: 60000 });
}

/**
 * 道の一覧を取る。
 *
 * @returns {{道: string[], 読めなかった: string[], 発見: number, 落ちた: string|null}}
 *   ★発見 = 道.length + 読めなかった.length が**必ず成り立つ**(保存則)。
 *   ★★落ちた が null でないときは、道 も 読めなかった も空である ── 0件と区別すること。
 */
function 道を取る(cwd, ...args) {
  const 命令 = args[0];
  if (!使ってよい命令.has(命令)) {
    return { 道: [], 読めなかった: [], 発見: 0,
      落ちた: '道の一覧を取ってよい命令ではありません: ' + String(命令)
        + '(使ってよい: ' + [...使ってよい命令].join(' / ') + ')' };
  }
  /* ★-z は下位命令の直後に置く ── 末尾に足すと、道の指定(`--`)より後ろへ回ることが在る */
  const r = 生で叩く(cwd, [命令, '-z', ...args.slice(1)]);
  if (r.error) return { 道: [], 読めなかった: [], 発見: 0, 落ちた: String(r.error.message).slice(0, 200) };
  if (r.status !== 0) {
    const e = Buffer.isBuffer(r.stderr) ? r.stderr.toString('utf8') : String(r.stderr || '');
    return { 道: [], 読めなかった: [], 発見: 0,
      落ちた: '出口 ' + r.status + ': ' + (e.split('\n')[0] || '(何も言いません)') };
  }

  const 出 = Buffer.isBuffer(r.stdout) ? r.stdout : Buffer.from(String(r.stdout || ''), 'utf8');
  /* ★NUL バイトで割る ── 道に現れないと決まっている唯一の1バイト */
  const 片 = [];
  let 始 = 0;
  for (let i = 0; i < 出.length; i++) {
    if (出[i] !== 0) continue;
    if (i > 始) 片.push(出.subarray(始, i));
    始 = i + 1;
  }
  if (始 < 出.length) 片.push(出.subarray(始));

  const 道 = [], 読めなかった = [];
  const 復号 = new TextDecoder('utf-8', { fatal: true });
  for (const b of 片) {
    let s = null;
    try { s = 復号.decode(b); } catch (_) { s = null; }
    /* ★★整形もしない ── trim も Unicode 正規化もしない。道は【来たまま】が正しい */
    if (s == null) 読めなかった.push(b.toString('hex'));
    else 道.push(s);
  }
  return { 道, 読めなかった, 発見: 片.length, 落ちた: null };
}

module.exports = { 道を取る, 使ってよい命令 };
