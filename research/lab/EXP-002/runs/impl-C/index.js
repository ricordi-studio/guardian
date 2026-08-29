'use strict';

/**
 * 注文計算・レシート出力。
 *
 * 公開するのは 3 つだけ。
 *   buildReceipt(order) -> string  レシート(人が読む 1 本のテキスト)
 *   calculateTotal(order) -> number  合計金額のみ(円単位の整数)
 *   summarize(order) -> { subtotal, discount, tax, total, shippingWaived }
 *
 * 2 つの経路(レシート / 合計のみ)は同じ calculate() の上に乗っている。
 * どちらか一方にだけ効く規則や、一方にしか無い分岐は存在しない(§1 / §7 / §8-4)。
 */

const { KIND } = require('./lib/rules');
const { calculate } = require('./lib/calculate');
const { render } = require('./lib/receipt');

/** レシート(テキスト)を返す。 */
function buildReceipt(order) {
  return render(calculate(order));
}

/** 合計金額のみ(数値)を返す。 */
function calculateTotal(order) {
  return calculate(order).total;
}

/** 4 つの金額と送料無料の成否を返す(検算・API 用)。 */
function summarize(order) {
  const { subtotal, discount, tax, total, shippingWaived } = calculate(order);
  return { subtotal, discount, tax, total, shippingWaived };
}

module.exports = { KIND, buildReceipt, calculateTotal, summarize };
