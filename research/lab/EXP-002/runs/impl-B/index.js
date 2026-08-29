'use strict';

const { settle } = require('./lib/compute');
const { renderReceipt } = require('./lib/render');
const { OrderError } = require('./lib/validate');
const { KINDS } = require('./lib/catalog');

/**
 * 公開する入口は 2 つだけ。どちらも同じ settle() を通る(§1 / §7 / §8.4)。
 *
 *   buildReceipt(order) -> string  人が読む 1 本のテキスト(§6)
 *   calculateTotal(order) -> number 請求する合計金額(円・整数)(§7)
 */

/** §6 レシート。 */
function buildReceipt(order) {
  return renderReceipt(settle(order));
}

/** §7 合計金額のみ。返すのは数値であって文字列ではない。 */
function calculateTotal(order) {
  return settle(order).total;
}

/** 内訳も欲しいとき用(小計・割引・消費税・合計・各明細の税額)。 */
function calculate(order) {
  return settle(order);
}

module.exports = { buildReceipt, calculateTotal, calculate, OrderError, KINDS };
