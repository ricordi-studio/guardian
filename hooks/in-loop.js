/* Stop フック: 【輪の中に居るのに、wait を呼ばずにターンを終える】のを止める。
 *
 * なぜ要るか:
 *   2026-09-01、会議に参加中、依頼主から守るべき事を1つだけ渡された ──
 *   「wait を、そのターンの最後の行為にしてください」。
 *   ★それを2回 破った。1回目は時刻の直しに入って15分、2回目も同じ形。
 *   ★★依頼主に「どこに？ あなたの最後の発言は15分前に見えますが？」と拾われるまで気づかなかった。
 *
 *   ★★★このとき hooks/stop.js は生きていた。だが止まらなかった ──
 *   あれが見ているのは【完了を名乗る手前の合否】で、【輪に居るか】ではない。
 *   「Stop フックが在る」と「正しい Stop フックが在る」は別である。
 *
 * 何をするか:
 *   .guardian/輪.json が在る間だけ働く(会議に入っていないときは、何もしない)。
 *     終了から 60秒 を超えてターンを終えようとした → ★止める
 *     60秒 以内(= 直前に wait を呼んで戻ってきた)   → 通す
 *
 * 止めない設計(塊の約束1):
 *   ・.guardian/輪.json が無ければ即 通す ── 会議していない日に邪魔をしない
 *   ・stop_hook_active が立っていたら二度は止めない
 *   ・★何かに失敗したら黙って通す(フックが落ちて仕事が止まる方が悪い)
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { 印の場所, 帳の場所 } = require(path.join(__dirname, '..', '.guardian', '印の場所.cjs'));

/* ★この門が【本当に呼ばれているか】を残す(見本 probe。2026-09-01)。
 *   ★★台本を叩いて block が出ることは測れるが、
 *   【道具がその block を守って止まるか】は、台本の側からは測れない。
 *   ★★★だから「呼ばれた/何を返した」を1行 残し、次のターンで読む。
 *   (2026-09-01、会議で @claude に「在る ではなく 止まった を測れ」と言われた) */
const 残す = (何) => {
  try {
    const 帳 = 帳の場所();
    fs.appendFileSync(帳, new Date().toISOString() + '  ' + 何 + String.fromCharCode(10));
  } catch (_) {}
};


const pass = (印 = '通した') => { 残す(印); process.exit(0); };

let input = '';
process.stdin.on('data', (c) => { input += c; });
process.stdin.on('end', () => {
  /* ★判定より先に【呼ばれた】を1行 置く(2026-09-01)。
   *   ★★止めた側は帳に出たのに、通った側が1行も出なかった ──
   *   「通っている」のか「呼ばれていない」のかを、外から区別できなかった。
   *   ★★★入口に1行 置けば、その2つが分かれる。 */
  try { 残す('入口'); } catch (_) {}
  try {
    /* ★印は塊の【外】── 中に置くと現場の絶対路が配り物に混ざる(2026-09-01) */
    const 根 = path.resolve(__dirname, '..');
    const 印 = 印の場所(根);
    if (!fs.existsSync(印)) return pass('通した(輪に入っていない) 見た印=' + 印 + ' 根=' + 根 + ' cwd=' + process.cwd());

    let payload = {};
    try { payload = JSON.parse(input || '{}'); } catch (_) {}
    if (payload.stop_hook_active) return pass('通した(二度は止めない)');

    const 輪 = JSON.parse(fs.readFileSync(印, 'utf8'));
    if (!輪 || !輪.終了) return pass('通した(まだ一度も待っていない)');

    const 経過 = Math.round((Date.now() - Number(輪.終了)) / 1000);
    if (!Number.isFinite(経過)) return pass('通した(経過が測れない)');
    if (経過 <= 60) return pass('通した(' + 経過 + '秒前に wait から戻った)');

    const reason =
      '★輪の中に居るのに、wait を呼ばずにターンを終えようとしています。\n' +
      `  最後に wait から戻ってから ★${経過}秒(${Math.round(経過 / 60)}分) 経っています。\n` +
      `  場: ${輪.場 || '(不明)'} / 名: ${輪.名 || '(不明)'}\n` +
      '\n' +
      '★★依頼主から渡された、守るべき事は1つだけです ──\n' +
      '  「wait を、そのターンの最後の行為にしてください」。\n' +
      '  ★★★輪を切るのは報告ではなく、wait を呼ばずにターンを終えることです。\n' +
      '\n' +
      '★いま言うことが無いなら、何も書かずに wait へ戻ってください(それが正しい振る舞いです):\n' +
      `  node .guardian/輪.mjs\n` +
      '\n' +
      '★★会議が終わったなら(出口2 または 出口4)、印を消してください:\n' +
      '  node .guardian/輪.mjs --抜ける';

    残す('★止めた(' + 経過 + '秒 経っている)');
    process.stdout.write(JSON.stringify({ decision: 'block', reason }));
    process.exit(0);
  } catch (_) {
    pass('通した(門の中で失敗した)');                 /* 黙って通す */
  }
});
