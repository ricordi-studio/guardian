'use strict';

const LABELS = {
  goods: '商品',
  food: '食料品',
  shipping: '送料',
  gift: 'ギフト包装',
};

function yen(n) {
  return '¥' + String(n);
}

function taxNote(kind) {
  if (kind === 'food') return '(税8%)';
  if (kind === 'goods') return '(税10%)';
  if (kind === 'shipping') return '(税10%)';
  if (kind === 'gift') return '(税10%)';
  return '';
}

function formatLine(line) {
  const name = LABELS[line.kind] || line.kind;
  const amount = line.price * line.qty;
  return name + ' ' + line.title + ' x' + line.qty + '  ' + yen(Math.floor(amount)) + ' ' + taxNote(line.kind);
}

function formatTotals(t) {
  const rows = [];
  rows.push('小計       ' + yen(t.subtotal));
  if (t.discount > 0) rows.push('割引      -' + yen(t.discount));
  rows.push('消費税     ' + yen(t.tax));
  rows.push('合計       ' + yen(t.total));
  return rows.join('\n');
}

function formatReceipt(lines, t) {
  const out = [];
  for (const line of lines) out.push(formatLine(line));
  out.push('-'.repeat(32));
  out.push(formatTotals(t));
  return out.join('\n');
}

module.exports = { formatReceipt, formatLine, formatTotals, LABELS };
