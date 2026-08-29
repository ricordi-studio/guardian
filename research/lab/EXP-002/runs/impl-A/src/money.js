'use strict';

/**
 * 金額の演算と表記。円単位の整数しか外に出さない(仕様書 §8.5)。
 */

/**
 * 絶対値の切り捨て(0 に近づける向き)。仕様書 §3.2。
 * 正なら切り捨て、負なら絶対値を切り捨てる。種別によって向きは変わらない。
 */
function truncateTowardZero(value) {
  return value < 0 ? Math.ceil(value) : Math.floor(value);
}

/**
 * 明細の税額(円・整数)。
 * amount と taxPercent はどちらも整数なので amount * taxPercent は整数のまま。
 * 100 で割った時点で初めて小数が現れ、そこを 1 回だけ 0 方向へ丸める。
 */
function taxFor(amount, taxPercent) {
  return truncateTowardZero((amount * taxPercent) / 100);
}

/** 全角(2 幅)として数える文字か。合計欄の桁揃えに使う。 */
function isWideChar(ch) {
  const cp = ch.codePointAt(0);
  return (
    (cp >= 0x1100 && cp <= 0x115f) || // ハングル字母
    (cp >= 0x2e80 && cp <= 0x303e) || // CJK 部首・記号
    (cp >= 0x3041 && cp <= 0x33ff) || // かな・互換
    (cp >= 0x3400 && cp <= 0x4dbf) ||
    (cp >= 0x4e00 && cp <= 0x9fff) || // CJK 統合漢字
    (cp >= 0xa000 && cp <= 0xa4cf) ||
    (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe30 && cp <= 0xfe6f) ||
    (cp >= 0xff00 && cp <= 0xff60) || // 全角英数・記号
    (cp >= 0xffe0 && cp <= 0xffe6)
  );
}

/** 表示幅(半角 = 1, 全角 = 2)。 */
function displayWidth(text) {
  let width = 0;
  for (const ch of String(text)) {
    width += isWideChar(ch) ? 2 : 1;
  }
  return width;
}

/**
 * 金額の表記。`¥` 前置・桁区切り無し・円単位の整数(§6.1, ★要確認 8)。
 * 負の額は `-¥500` の形で、符号を `¥` の左に置く(§6.2 の割引行と同じ形)。
 */
function formatYen(amount) {
  if (!Number.isInteger(amount)) {
    throw new Error(`金額が整数ではありません: ${amount}`);
  }
  return amount < 0 ? `-¥${Math.abs(amount)}` : `¥${amount}`;
}

module.exports = {
  truncateTowardZero,
  taxFor,
  displayWidth,
  formatYen,
};
