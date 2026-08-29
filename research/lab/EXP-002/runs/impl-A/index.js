'use strict';

const kinds = require('./src/kinds');
const { evaluateOrder } = require('./src/calculate');
const { renderReceipt } = require('./src/receipt');

/**
 * 注文計算・レシート出力。
 *
 * 公開する経路は 2 つだが、内側では evaluateOrder ひとつしか通らない。
 *   - renderReceipt(order) → 人が読むテキスト
 *   - calculateTotal(order) → 請求額(数値)
 */

/** §7: 合計金額のみ。返すのは数値であって文字列ではない。 */
function calculateTotal(order) {
  return evaluateOrder(order).total;
}

module.exports = {
  renderReceipt,
  calculateTotal,
  // 明細つきの内訳が要るとき用(小計・割引・消費税・合計)
  evaluateOrder,
  // 種別コード
  PRODUCT: kinds.PRODUCT,
  FOOD: kinds.FOOD,
  SHIPPING: kinds.SHIPPING,
  DISCOUNT: kinds.DISCOUNT,
};
