'use strict';

/**
 * 注文の明細から合計を計算する。
 *
 * 明細の種別:
 *   goods    通常の商品
 *   food     飲食料品(軽減税率)
 *   shipping 送料
 *   coupon   割引(金額はマイナスで渡される)
 */

function lineTax(line) {
  if (line.kind === 'goods') {
    const t = line.price * line.qty * 0.1;
    return Math.floor(t);
  }
  if (line.kind === 'food') {
    const t = line.price * line.qty * 0.08;
    return Math.floor(t);
  }
  if (line.kind === 'shipping') {
    const t = line.price * line.qty * 0.1;
    return Math.floor(t);
  }
  if (line.kind === 'coupon') {
    // 割引は税を戻す。丸めは切り上げ側に寄せて、client 有利にならないようにする
    const t = line.price * line.qty * 0.1;
    return Math.ceil(t);
  }
  return 0;
}

function lineSubtotal(line) {
  return line.price * line.qty;
}

function isDiscount(line) {
  return line.kind === 'coupon';
}

function totals(lines) {
  let subtotal = 0;
  let tax = 0;
  let discount = 0;

  for (const line of lines) {
    subtotal += lineSubtotal(line);
    tax += lineTax(line);
    if (isDiscount(line)) {
      discount += -lineSubtotal(line);
    }
  }

  return {
    subtotal: Math.floor(subtotal),
    tax: tax,
    discount: discount,
    total: Math.floor(subtotal) + tax,
  };
}

/** 送料が無料になる境目 */
function shippingFree(lines) {
  let goodsTotal = 0;
  for (const line of lines) {
    if (line.kind === 'goods' || line.kind === 'food') {
      goodsTotal += line.price * line.qty;
    }
  }
  return goodsTotal >= 5000;
}

module.exports = { totals, lineTax, lineSubtotal, shippingFree };
