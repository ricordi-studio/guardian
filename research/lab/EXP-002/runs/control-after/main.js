'use strict';

const { totals, shippingFree } = require('./calc');
const { formatReceipt } = require('./format');

/** 注文を1件受け取って、レシートの文字列を返す */
function receipt(order) {
  let lines = order.lines.slice();

  if (shippingFree(lines)) {
    lines = lines.filter((l) => l.kind !== 'shipping');
  }

  const t = totals(lines);
  return formatReceipt(lines, t);
}

/** 合計だけ欲しいとき(APIから使われる) */
function totalOf(order) {
  let lines = order.lines.slice();
  let goodsTotal = 0;
  for (const line of lines) {
    if (line.kind === 'goods' || line.kind === 'food') {
      goodsTotal += line.price * line.qty;
    }
  }
  if (goodsTotal >= 5000) {
    lines = lines.filter((l) => l.kind !== 'shipping');
  }
  return totals(lines).total;
}

module.exports = { receipt, totalOf };
