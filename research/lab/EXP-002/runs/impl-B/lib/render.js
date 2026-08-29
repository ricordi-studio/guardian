'use strict';

const { AMOUNT_COLUMN, SEPARATOR } = require('./compute');

/**
 * 表示のしかた。計算はここでは一切しない(数は settle() が出したものだけ使う)。
 */

/**
 * §6.1 / §6.2 金額表記 ── `¥` 前置・桁区切り無し・円単位の整数。
 * 負は `-¥300` の形にして、負であることを行頭側で読み取れるようにする(明細行も合計欄も同じ形)。
 */
function money(amount) {
  if (!Number.isInteger(amount)) {
    // §8.5 小数が画面に出ることはない ── 出そうになったら止める。
    throw new Error(`表示できない金額(整数ではない): ${amount}`);
  }
  return amount < 0 ? `-¥${Math.abs(amount)}` : `¥${amount}`;
}

/** §6.1 税率注記。割引にも「実際に適用された税率」を出す(判断 5)。 */
function taxNote(kind) {
  return `(税${kind.taxPercent}%)`;
}

/** 全角を 2 桁として数えた表示幅。合計欄の桁揃えに使う。 */
function displayWidth(text) {
  let width = 0;
  for (const ch of text) {
    width += isWide(ch.codePointAt(0)) ? 2 : 1;
  }
  return width;
}

function isWide(cp) {
  return (
    (cp >= 0x1100 && cp <= 0x115f) || // ハングル字母
    (cp >= 0x2e80 && cp <= 0x303e) || // CJK 部首・記号
    (cp >= 0x3041 && cp <= 0x33ff) || // かな・カタカナ・互換
    (cp >= 0x3400 && cp <= 0x4dbf) ||
    (cp >= 0x4e00 && cp <= 0x9fff) || // CJK 統合漢字
    (cp >= 0xa000 && cp <= 0xa4cf) ||
    (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe30 && cp <= 0xfe6f) ||
    (cp >= 0xff00 && cp <= 0xff60) || // 全角英数・記号
    (cp >= 0xffe0 && cp <= 0xffe6) ||
    (cp >= 0x20000 && cp <= 0x3fffd)
  );
}

/**
 * §6.2 合計欄の 1 行。
 * ラベル側を空白で詰めて、`¥` の開始桁を全行で AMOUNT_COLUMN に揃える。
 * 負号は `¥` の 1 つ手前に置くので、その分だけ空白を減らす。
 */
function totalRow(label, amount) {
  const text = money(amount);
  const signWidth = text.startsWith('-') ? 1 : 0;
  const padding = Math.max(1, AMOUNT_COLUMN - displayWidth(label) - signWidth);
  return label + ' '.repeat(padding) + text;
}

/** §6.1 明細行。行末に余分な空白を残さない。 */
function lineRow(line) {
  return (
    `${line.kind.label} ${line.name} x${line.quantity}` +
    `  ${money(line.amount)} ${taxNote(line.kind)}`
  );
}

/**
 * §6 レシート本文を組み立てる。末尾に余分な改行は付けない。
 */
function renderReceipt(result) {
  const rows = result.lines.map(lineRow);
  rows.push(SEPARATOR);
  rows.push(totalRow('小計', result.subtotal));
  // §6.2 割引行は割引が存在するときだけ。値引きと分かる負の表現で出す。
  if (result.discount !== 0) rows.push(totalRow('割引', -result.discount));
  rows.push(totalRow('消費税', result.tax));
  rows.push(totalRow('合計', result.total));
  return rows.join('\n');
}

module.exports = { renderReceipt, money, displayWidth, totalRow, lineRow };
