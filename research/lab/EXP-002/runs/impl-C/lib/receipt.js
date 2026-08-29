'use strict';

/**
 * 計算結果(calculate の戻り値)を 1 本のテキストに書き出す。
 * ここでは金額の計算を一切しない。書式だけを持つ。
 */

const { displayWidth, yen, totalsRow } = require('./format');

/** §6: 区切り行は `-` を 32 個。 */
const SEPARATOR = '-'.repeat(32);

/** 合計欄のラベル。桁揃えの基準にも使う。 */
const LABELS = Object.freeze({
  subtotal: '小計',
  discount: '割引',
  tax: '消費税',
  total: '合計',
});

/** `¥` を置く桁位置。最も長いラベル(消費税=6 桁)の右に空白を 5 つ取る。 */
const AMOUNT_COLUMN =
  Math.max(...Object.values(LABELS).map(displayWidth)) + 5;

/** §6.1 の明細行。行末に余分な空白は残さない。 */
function renderLine(line) {
  const head = `${line.label} ${line.name} x${line.quantity}  ${yen(line.amount)}`;
  const text = line.note ? `${head} ${line.note}` : head;
  return text.replace(/\s+$/, '');
}

/** §6.2 の合計欄。割引が 0 のときは割引行を出さない。 */
function renderTotals(result) {
  const rows = [totalsRow(LABELS.subtotal, result.subtotal, AMOUNT_COLUMN)];
  if (result.discount !== 0) {
    // 値引きであることが分かるように負の表現で出す。
    rows.push(totalsRow(LABELS.discount, -result.discount, AMOUNT_COLUMN));
  }
  rows.push(totalsRow(LABELS.tax, result.tax, AMOUNT_COLUMN));
  rows.push(totalsRow(LABELS.total, result.total, AMOUNT_COLUMN));
  return rows;
}

/** 明細行 → 区切り行 → 合計欄。改行で連結し、末尾に余分な改行は付けない(§6)。 */
function render(result) {
  return [...result.lines.map(renderLine), SEPARATOR, ...renderTotals(result)].join('\n');
}

module.exports = { render, SEPARATOR, LABELS, AMOUNT_COLUMN };
