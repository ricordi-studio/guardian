/* ★輪の印(会議に居るか)の置き場を【1箇所】で決める(2026-09-01)。
 *
 * ★★なぜ在るか: 同じ計算を3箇所に写していた(輪.mjs / 鼓動.mjs / hooks/in-loop.js)。
 *   ★★★名前を揃える直しを入れたとき、2箇所しか直さず、鼓動が印を見失って落ちた。
 *   「同じ計算が3箇所に在る」ことが原因なので、写しを直すのではなく【1本にする】。
 *
 * ★印を塊の【外】に置く理由: 中に置くと現場の絶対路が配り物に混ざる(自分の検査が拾った)。
 * ★★名を揃える理由: 同じフォルダに2つの名前が在る(Windows の 8.3 短縮名)。
 *   C:\Users\<短い名>\… と C:\Users\<8.3の名>\… は同じ場所だが md5 が変わり、
 *   ★★★門が【一度も作られていない印】を探して素通りしていた(2026-09-01 実測)。 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const 名を揃える = (道) => {
  try { return fs.realpathSync.native(道).toLowerCase(); }
  catch (_) { return String(道).toLowerCase(); }
};

/* 根(塊のリポジトリの根)を渡すと、その現場の印の道を返す */
const 印の場所 = (根) =>
  path.join(os.tmpdir(),
    'kit-loop-' + crypto.createHash('md5').update(名を揃える(根)).digest('hex').slice(0, 12) + '.json');

const 帳の場所 = () => path.join(os.tmpdir(), 'kit-loop-log.txt');

module.exports = { 名を揃える, 印の場所, 帳の場所 };
