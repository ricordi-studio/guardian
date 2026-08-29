'use strict';

/**
 * 表示のための小道具。金額の文字列化と、全角を含むラベルの桁揃え。
 */

/** 全角として扱う文字か(桁揃えのため 1 文字 = 2 桁と数える範囲)。 */
function isWide(codePoint) {
  return (
    (codePoint >= 0x1100 && codePoint <= 0x115f) || // ハングル字母
    (codePoint >= 0x2e80 && codePoint <= 0x303e) || // CJK 部首・記号
    (codePoint >= 0x3041 && codePoint <= 0x33ff) || // かな・ハングル・CJK 互換
    (codePoint >= 0x3400 && codePoint <= 0x4dbf) ||
    (codePoint >= 0x4e00 && codePoint <= 0x9fff) || // CJK 統合漢字
    (codePoint >= 0xa000 && codePoint <= 0xa4cf) ||
    (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
    (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
    (codePoint >= 0xfe30 && codePoint <= 0xfe6f) ||
    (codePoint >= 0xff00 && codePoint <= 0xff60) || // 全角英数・記号
    (codePoint >= 0xffe0 && codePoint <= 0xffe6)
  );
}

/** 表示幅(半角 1 / 全角 2)。 */
function displayWidth(text) {
  let width = 0;
  for (const char of String(text)) {
    width += isWide(char.codePointAt(0)) ? 2 : 1;
  }
  return width;
}

/**
 * 金額の文字列(§6.1: `¥` 前置・桁区切り無し・円単位の整数)。
 * 負の額は `-¥500` と書き、負であることが読み取れるようにする(判断は DECISIONS.md #8)。
 */
function yen(amount) {
  if (!Number.isInteger(amount)) {
    // §8-5: 小数が画面に出ることはない。出そうになったら気づけるように落とす。
    throw new RangeError(`金額が整数ではありません: ${amount}`);
  }
  return amount < 0 ? `-¥${Math.abs(amount)}` : `¥${amount}`;
}

/**
 * 合計欄の 1 行を組み立てる。
 * ラベルの右を空白で埋め、`¥` が常に同じ桁位置(amountColumn)から始まるようにする(§6.2)。
 * 負の額では `-` がその 1 つ手前の桁に入る。
 */
function totalsRow(label, amount, amountColumn) {
  const text = yen(amount);
  const signWidth = text.startsWith('-') ? 1 : 0;
  const padding = amountColumn - signWidth - displayWidth(label);
  return label + ' '.repeat(Math.max(1, padding)) + text;
}

module.exports = { displayWidth, yen, totalsRow };
