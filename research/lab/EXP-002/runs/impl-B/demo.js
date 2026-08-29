'use strict';

const { buildReceipt, calculateTotal } = require('./index');

// 注文を 1 件流して、レシートと合計を出す。
const order = {
  lines: [
    { kind: 'PRODUCT', name: 'マグカップ', unitPrice: 1200, quantity: 2 },
    { kind: 'FOOD', name: 'コーヒー豆', unitPrice: 980, quantity: 1 },
    { kind: 'SHIPPING', name: '宅配便', unitPrice: 500, quantity: 1 },
    { kind: 'DISCOUNT', name: 'クーポン', unitPrice: -300, quantity: 1 },
  ],
};

const frozenBefore = JSON.stringify(order);

console.log(buildReceipt(order));
console.log('');
console.log('calculateTotal() =', calculateTotal(order));
console.log('入力は変更されていない:', JSON.stringify(order) === frozenBefore);
