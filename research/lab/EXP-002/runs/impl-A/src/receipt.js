'use strict';

const { KINDS } = require('./kinds');
const { displayWidth, formatYen } = require('./money');
const { evaluateOrder } = require('./calculate');

/**
 * レシートの整形。
 * 【計算は一切しない】── evaluateOrder が出した数を文字にするだけ。
 * ここで足し引きを書くと、合計のみの経路とずれる余地が生まれる(仕様書 §1)。
 */

const SEPARATOR = '-'.repeat(32);

const TOTAL_LABELS = ['小計', '割引', '消費税', '合計'];

/**
 * 合計欄で金額の `¥` を置く表示桁(0 起点)。
 * 一番広いラベル(消費税 = 6 幅)の右に 5 幅の余白を取る = 11。
 * 仕様書 §6.2 の例と一致する。
 */
const AMOUNT_COLUMN =
  TOTAL_LABELS.reduce((max, label) => Math.max(max, displayWidth(label)), 0) + 5;

/** その明細に適用された税率の注記(§6.1)。 */
function taxNote(kindCode) {
  return `(税${KINDS[kindCode].taxPercent}%)`;
}

/** `<種別名> <名称> x<数量>  ¥<金額> <税率注記>` */
function formatLine(line) {
  const kind = KINDS[line.kind];
  return `${kind.label} ${line.name} x${line.quantity}  ${formatYen(line.amount)} ${taxNote(line.kind)}`;
}

/**
 * 合計欄の 1 行。ラベルを空白で伸ばし、金額の開始桁を揃える。
 * 負の表記(`-¥`)は符号 1 文字ぶん左へ食い込ませ、`¥` の桁を保つ。
 */
function formatTotalRow(label, text) {
  const signWidth = text.startsWith('-') ? 1 : 0;
  const padding = AMOUNT_COLUMN - displayWidth(label) - signWidth;
  return label + ' '.repeat(Math.max(padding, 1)) + text;
}

/** 注文からレシート(1 本のテキスト)を作る。末尾に改行は付けない(§6)。 */
function renderReceipt(order) {
  const result = evaluateOrder(order);

  const rows = result.lines.map(formatLine);
  rows.push(SEPARATOR);
  rows.push(formatTotalRow('小計', formatYen(result.subtotal)));
  if (result.discount !== 0) {
    // 割引が 0 のときは行を出さない(§6.2)
    rows.push(formatTotalRow('割引', formatYen(-result.discount)));
  }
  rows.push(formatTotalRow('消費税', formatYen(result.tax)));
  rows.push(formatTotalRow('合計', formatYen(result.total)));

  return rows.join('\n');
}

module.exports = { renderReceipt, SEPARATOR, AMOUNT_COLUMN };
