'use strict';

/**
 * 明細の種別と、それに紐づく規則の【唯一の定義】。
 *
 * 仕様書 §8.4「送料無料の判定・税率・丸め・閾値は 1 箇所の規則だけ」を守るため、
 * 税率・表示名・符号の向きはすべてこの表からしか取り出さない。
 * 経路(レシート / 合計のみ)ごとに別の表を持たない。
 */

const PRODUCT = 'product';
const FOOD = 'food';
const SHIPPING = 'shipping';
const DISCOUNT = 'discount';

/**
 * taxPercent は「百分率の整数」。
 * 小数(0.08)を使わないのは、金額 × 率 を整数演算だけで行い、
 * 浮動小数の誤差が丸め結果に混入するのを防ぐため(仕様書 §8.5)。
 */
const KINDS = Object.freeze({
  [PRODUCT]: Object.freeze({
    code: PRODUCT,
    label: '商品',
    taxPercent: 10,
    // 送料無料判定(§4)の基準額に算入されるか
    countsTowardShippingFreeThreshold: true,
    // 小計(§5)に算入されるか
    countsTowardSubtotal: true,
    // 単価の符号: +1 = 0 以上でなければならない / -1 = 0 以下でなければならない
    sign: +1,
  }),
  [FOOD]: Object.freeze({
    code: FOOD,
    label: '食料品',
    taxPercent: 8,
    countsTowardShippingFreeThreshold: true,
    countsTowardSubtotal: true,
    sign: +1,
  }),
  [SHIPPING]: Object.freeze({
    code: SHIPPING,
    label: '送料',
    taxPercent: 10,
    countsTowardShippingFreeThreshold: false,
    countsTowardSubtotal: true,
    sign: +1,
  }),
  [DISCOUNT]: Object.freeze({
    code: DISCOUNT,
    label: '割引',
    taxPercent: 10,
    countsTowardShippingFreeThreshold: false,
    countsTowardSubtotal: false,
    sign: -1,
  }),
});

/** 送料無料になる閾値(税抜・円)。境界を含む(§4)。 */
const SHIPPING_FREE_THRESHOLD = 5000;

function isKnownKind(code) {
  return Object.prototype.hasOwnProperty.call(KINDS, code);
}

/** 未知の種別は黙って通さない(★要確認 6 の判断)。 */
function kindOf(code) {
  if (!isKnownKind(code)) {
    throw new Error(`未定義の種別です: ${JSON.stringify(code)}`);
  }
  return KINDS[code];
}

module.exports = {
  PRODUCT,
  FOOD,
  SHIPPING,
  DISCOUNT,
  KINDS,
  SHIPPING_FREE_THRESHOLD,
  isKnownKind,
  kindOf,
};
