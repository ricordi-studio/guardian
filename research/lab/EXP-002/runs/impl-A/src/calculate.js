'use strict';

const { KINDS, SHIPPING, SHIPPING_FREE_THRESHOLD } = require('./kinds');
const { taxFor } = require('./money');
const { normalizeOrder } = require('./order');

/**
 * 注文の評価。【レシートも合計のみも、必ずこの関数を通る】。
 *
 * 経路が 2 つあることが仕様書 §1 / §7 / §8.4 の心配ごとなので、
 * 分岐は「評価結果をどう表示するか」だけに留め、
 * 送料無料判定・税率・丸め・閾値はここ 1 箇所でしか行わない。
 *
 * 戻り値:
 *   {
 *     lines:    [{ kind, name, unitPrice, quantity, amount, tax }]  ← 実際に課金される明細だけ
 *     subtotal, discount, tax, total,
 *     shippingIsFree, shippingFreeBasis
 *   }
 */
function evaluateOrder(order) {
  const items = normalizeOrder(order);

  // §4: 送料無料の判定。商品・食料品の税抜金額だけを見る。
  //     送料自身も割引も基準額に入れない(★要確認 4)。
  const shippingFreeBasis = items.reduce(
    (sum, item) => (KINDS[item.kind].countsTowardShippingFreeThreshold ? sum + item.amount : sum),
    0
  );
  const shippingIsFree = shippingFreeBasis >= SHIPPING_FREE_THRESHOLD;

  // 無料になった送料は「注文から取り除かれた」ものとして扱う。
  // 元の配列は書き換えず、絞り込んだ新しい配列を作る(§8.2)。
  const chargedItems = items.filter((item) => !(item.kind === SHIPPING && shippingIsFree));

  // §3.2: 税は明細ごとに計算し、明細ごとに円へ丸める(★要確認 7)。
  const lines = chargedItems.map((item) =>
    Object.freeze({
      ...item,
      tax: taxFor(item.amount, KINDS[item.kind].taxPercent),
    })
  );

  let subtotal = 0; // §5 小計: 値引きを差し引く【前】(★要確認 1)
  let discount = 0; // §5 割引: 割引明細の金額の絶対値の合計(正の数)
  let tax = 0; // §3.3 明細ごとの丸め済み税額の総和

  for (const line of lines) {
    if (KINDS[line.kind].countsTowardSubtotal) {
      subtotal += line.amount;
    } else {
      discount += Math.abs(line.amount);
    }
    tax += line.tax;
  }

  // §5 の関係式そのもの。合計を別経路で組み立てない。
  const total = subtotal - discount + tax;

  return Object.freeze({
    lines: Object.freeze(lines),
    subtotal,
    discount,
    tax,
    total,
    shippingIsFree,
    shippingFreeBasis,
  });
}

module.exports = { evaluateOrder };
