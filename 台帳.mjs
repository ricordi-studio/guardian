/* 所有台帳 ── 【誰が・どの根から・何を置いたか】を記録する(2026-09-03)。
 *
 * ★なぜ在るか: 2026-09-02、依頼主が「Guardian を外すとき、残滓が残らない形にできるか」と問うた。
 *   会議で3席が測って、次の事が分かった:
 *
 *   ★★同じ `.guardian` という1語が、根の違いで別の持ち主を指す ──
 *      path.join(ROOT, '.guardian') は【現場の走行状態】/ path.join(HERE, '.guardian') は【塊の受領証】。
 *      実測: 正本の selfcheck.mjs は、1ファイルの中で両方に使っている(792 と 2137)。
 *   ★★★だから所有は【名前】では決まらない。**どの根から書いたか**で決まる。
 *
 *   ★配布先の実測: 現場の `.guardian/` は 18件中 14件が【その現場が書いた道具】だった。
 *     フォルダごと消す外し方は、その14本を消す。
 *
 * ★台帳が守る決まり(会議で3席が寄った線):
 *   ・★台帳に【載っていない物は残す】(allowlist)。載っていない = 消してよい、にはしない。
 *     理由: 人が手で書いた物は書き手を通らないので、原理的に載らない。仕組みの外側であって、漏れではない。
 *     既定を「消してよい」に倒すと、いちばん惜しい物から先に消える。
 *   ・★★根は【意味】で持つ(TARGET / BUNDLE)。変数名(ROOT / ROOT_DIR / HERE / __dirname)では持たない。
 *   ・★★★読む接点と書く接点を混ぜない。読んだだけの物は、所有ではない。
 *
 * ★台帳の置き場は【TARGET 側の `.guardian/`】(2026-09-03 に移した)。
 *   ★★最初は BUNDLE 側に置いた ── 「消す判断の材料を、消される場所に置かない」ため。
 *   ★★★前提が入れ替わった: `.guardian/` は現場の物が混ざるので【消してはいけない場所】になり、
 *     `guardian/` は【フォルダごと消す場所】のまま。依頼主の元案は「guardian を削除して外す」。
 *   ★同じ原則が、逆の置き場を指すようになった ── 台帳は、書き留めた物より長生きすること。 */

import fs from 'node:fs';
import { createRequire as __cr } from 'node:module';
import path from 'node:path';

export const 台帳の版 = 1;

/* 中身の指紋 ── selfcheck の 指紋() / neighbors の 印を取る() と同じ FNV-1a だが、
 * ★測る対象が違うので名前を分けてある(findRoot / findInstallRoot と同じ理由)。 */
/* ★指紋は【書き手.cjs に1本だけ】置く(2026-09-03)。ここで再実装しない ──
 *   ★★2つ持つと、式がずれても誰も気づけない(ずれた指紋は「変わっている」と読まれ、
 *   外す側が静かに CONFLICT を出すだけ)。 */
export const 指紋 = __cr(import.meta.url)('./書き手.cjs').指紋;

export function 台帳を作る({ 塊の版, TARGET, BUNDLE }) {
  const 項 = [];
  const 相対 = (種, 道) => {
    const 基 = 種 === 'BUNDLE' ? BUNDLE : TARGET;
    return path.relative(基, 道).split(path.sep).join('/');
  };

  return {
    /* ★置いた/触った物を1件 記録する。
     *   rootKind … TARGET(入れられる現場) / BUNDLE(塊そのもの)
     *   作った   … この導入が作ったか(false = 元から在った。allowlist の起点になる) */
    /* ★元 ── 【入れる前のファイル全文】(2026-09-03)。
     *   ★★元から在ったファイルに塊が書き足したとき、外すあとで【バイトで戻す】ために持つ。
     *   実測: 直す前は、区間を外した CLAUDE.md に空行が1つ増え、
     *   ★★★settings.json は塊が入れた整形(2字下げ)のまま戻らなかった ──
     *   見た目は同じでも git は差分を出す。**それは残滓である。** */
    記す({ rootKind = 'TARGET', 道, rel, 種類, 作った, 中身, 元, writer }) {
      項.push({
        rootKind,
        rel: rel != null ? rel : 相対(rootKind, 道),
        種類,                    /* ファイル / フォルダ / 区間 / JSON要素 */
        作った: !!作った,
        hash: 中身 == null ? null : 指紋(中身),
        元: 元 == null ? null : String(元),
        writer,
        時刻: new Date().toISOString(),
      });
    },
    /* ★読んだだけの接点(所有ではない)。外すときの材料にはしない。 */
    読んだ({ rootKind = 'TARGET', rel, reader }) {
      項.push({ rootKind, rel, 種類: '読む接点', 作った: false, hash: null, reader, 時刻: new Date().toISOString() });
    },
    件数: () => 項.length,
    /* ★保存先は【呼ぶ側】が決める。★★いまの呼び手(install.mjs)は TARGET の .guardian/ を渡す。
     *   ★★★ここに置き場を書かない ── 頭の注(22行目)と二重になり、片方だけ古くなる。
     *   実測(2026-09-03): 置き場を移したとき、頭は直ったが この行が【いまの規則】として逆を言っていた。 */
    /* ★保存は【積む】── 上書きしない(2026-09-03、二度目の導入で自分で踏んだ)。
     *   ★★一度目の台帳が、外すときの【基準】である。二度目の導入がそれを消すと、
     *   ★★★「作った かつ 育っていない」を確かめる材料が無くなり、判定は UNKNOWN に落ちる。
     *   実測: 直す前は 10件 の台帳が、二度目の導入で 3件 に置き換わった。 */
    保存(先) {
      let 前 = null;
      try { 前 = JSON.parse(fs.readFileSync(先, 'utf8')); } catch (_) {}
      /* ★読めない台帳は【上書きしない】── 壊れた紙でも、消すより残す方が安全(allowlist と同じ向き) */
      if (前 && !Array.isArray(前.走行)) {
        throw new Error('台帳が読めない形です。上書きしません: ' + 先);
      }
      const 走行 = (前 && 前.走行) || [];
      走行.push({ 時刻: new Date().toISOString(), 塊の版, 項 });
      /* ★根そのものは書かない ── 現場の絶対路は、配る物に混ぜない(この塊の掟) */
      const 中 = { 台帳の版, 走行 };
      fs.mkdirSync(path.dirname(先), { recursive: true });
      fs.writeFileSync(先, JSON.stringify(中, null, 1) + String.fromCharCode(10));
      return 先;
    },
  };
}
