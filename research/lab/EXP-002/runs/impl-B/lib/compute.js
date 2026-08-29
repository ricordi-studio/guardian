'use strict';

const { readOrder } = require('./validate');

/**
 * 計算の中身。**唯一の計算経路**。
 *
 * レシートも「合計だけ」も、必ずこの settle() を通る(§1 / §7 / §8.4)。
 * 経路ごとに閾値や税率を書くことはしない。
 */

/** §4 送料無料の閾値(税抜・円)。この定数はここ 1 箇所だけ。 */
const FREE_SHIPPING_THRESHOLD = 5000;

/** §6.2 合計欄で「¥」を書き始める表示桁(半角換算)。 */
const AMOUNT_COLUMN = 11;

/** §6 区切り行 = '-' を 32 個。 */
const SEPARATOR = '-'.repeat(32);

/**
 * §3.2 丸め ── 絶対値の切り捨て(0 に近づける向き)。全種別に一律。
 * Math.trunc がまさにこの向き。負の税額(割引の税戻し)も絶対値を切り捨てる。
 */
function roundTax(exactTax) {
  return Math.trunc(exactTax);
}

/**
 * §3 明細 1 件の税額。丸めはここでしか起きない(丸めの位置を分散させない)。
 * 整数のまま掛けてから割ることで、浮動小数の誤差が丸めに届かないようにする。
 */
function taxOf(line) {
  return roundTax((line.amount * line.kind.taxPercent) / 100);
}

/**
 * §4 送料無料の判定。判定規則はこの関数 1 つだけ。
 * 判定に使うのは「商品と食料品の金額(税抜)」の合計。
 * 送料自身も割引も判定に含めない(catalog の countsInFreeShipping が唯一の根拠)。
 */
function isShippingFree(lines) {
  let base = 0;
  for (const line of lines) {
    if (line.kind.countsInFreeShipping) base += line.amount;
  }
  return base >= FREE_SHIPPING_THRESHOLD;
}

/**
 * 注文を精算する。
 *
 * 戻り値:
 *   lines    : レシートに出す明細(送料無料なら送料は取り除き済み) + 各行の税額
 *   subtotal : §5 小計(値引き前・課税対象明細の税抜合計)
 *   discount : §5 割引(絶対値・正の数)
 *   tax      : §5 消費税(丸め済み税額の総和)
 *   total    : §5 合計 = 小計 − 割引 + 消費税
 *   shippingFree : 送料が無料になったか
 */
function settle(order) {
  const allLines = readOrder(order); // 入力は読むだけ。書き換えない。
  const shippingFree = isShippingFree(allLines);

  // §4 無料になった送料は「注文から取り除かれたもの」として以降一切扱わない。
  // 除外はここ 1 回だけ行い、表示にも集計にも同じ配列を使う。
  const lines = [];
  for (const line of allLines) {
    if (shippingFree && line.kind.isShipping) continue;
    lines.push(Object.freeze({ ...line, tax: taxOf(line) }));
  }

  let subtotal = 0;
  let discount = 0;
  let tax = 0;
  for (const line of lines) {
    if (line.kind.countsInSubtotal) subtotal += line.amount;
    if (line.kind.isDiscount) discount += Math.abs(line.amount);
    tax += line.tax;
  }

  const total = subtotal - discount + tax; // §5 の関係式そのもの

  return Object.freeze({
    lines: Object.freeze(lines),
    subtotal,
    discount,
    tax,
    total,
    shippingFree,
  });
}

module.exports = {
  settle,
  roundTax,
  isShippingFree,
  FREE_SHIPPING_THRESHOLD,
  AMOUNT_COLUMN,
  SEPARATOR,
};
