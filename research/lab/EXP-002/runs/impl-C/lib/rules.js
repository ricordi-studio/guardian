'use strict';

/**
 * 規則の単一の置き場所。
 *
 * 仕様書 §8-4「送料無料の判定・税率・丸め・閾値は、この文書に書かれた 1 箇所の規則だけであり、
 * 呼び出し経路ごとに別の規則が存在しない」を守るため、
 * 税率・表示名・丸め・閾値の定義はこのファイルにしか存在しない。
 * 他のファイルはここを参照するだけで、数値をハードコードしない。
 */

/** 明細の種別コード(内部表現)。 */
const KIND = Object.freeze({
  PRODUCT: 'product',
  FOOD: 'food',
  SHIPPING: 'shipping',
  DISCOUNT: 'discount',
});

/**
 * 種別ごとの規則。
 * - label      : レシートに出す日本語の表示名(§6.1 / 4 種すべてに定義がある)
 * - taxNumer   : 税率の分子(percent)
 * - note       : 税率注記。null なら注記を出さない
 * - taxable    : 小計(§5)に算入する課税対象の明細か
 * - freeShipBase: 送料無料の判定額(§4)に算入するか
 */
const RULES = Object.freeze({
  [KIND.PRODUCT]: Object.freeze({
    label: '商品',
    taxNumer: 10,
    note: '(税10%)',
    taxable: true,
    freeShipBase: true,
  }),
  [KIND.FOOD]: Object.freeze({
    label: '食料品',
    taxNumer: 8,
    note: '(税8%)',
    taxable: true,
    freeShipBase: true,
  }),
  [KIND.SHIPPING]: Object.freeze({
    label: '送料',
    taxNumer: 10,
    note: '(税10%)',
    taxable: true,
    freeShipBase: false,
  }),
  [KIND.DISCOUNT]: Object.freeze({
    // §3.1 の表に従い、割引の税率は対象に関わらず一律 10%(判断は DECISIONS.md #3)。
    label: '割引',
    taxNumer: 10,
    // 税を戻している以上、注記を出す(判断は DECISIONS.md #5)。
    note: '(税10%)',
    taxable: false,
    freeShipBase: false,
  }),
});

/** 税率の分母(percent 表記)。 */
const TAX_DENOM = 100;

/** 送料無料の閾値(円・税抜)。ちょうどこの額でも無料(§4)。 */
const FREE_SHIPPING_THRESHOLD = 5000;

/** 定義済みの種別コードか。 */
function isKnownKind(kind) {
  return Object.prototype.hasOwnProperty.call(RULES, kind);
}

/** 種別の規則を取り出す。未定義の種別は呼び出す前に弾かれている前提。 */
function ruleOf(kind) {
  if (!isKnownKind(kind)) {
    throw new Error(`未定義の種別です: ${String(kind)}`);
  }
  return RULES[kind];
}

/**
 * 明細の税額(§3.2)。
 * 丸めは「絶対値の切り捨て = 0 に近づける向き」で全種別一律(判断は DECISIONS.md #2)。
 * 整数演算(先に掛けてから割る)で行い、浮動小数の誤差を金額に持ち込まない。
 */
function taxOf(amountYen, kind) {
  const { taxNumer } = ruleOf(kind);
  return Math.trunc((amountYen * taxNumer) / TAX_DENOM);
}

module.exports = {
  KIND,
  RULES,
  TAX_DENOM,
  FREE_SHIPPING_THRESHOLD,
  isKnownKind,
  ruleOf,
  taxOf,
};
