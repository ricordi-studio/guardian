'use strict';

const { renderReceipt, calculateTotal, evaluateOrder } = require('./index');

const order = {
  items: [
    { kind: 'product', name: 'ノート', unitPrice: 480, quantity: 3 },
    { kind: 'food', name: 'コーヒー豆', unitPrice: 1200, quantity: 2 },
    { kind: 'shipping', name: '宅配便', unitPrice: 600, quantity: 1 },
    { kind: 'discount', name: 'クーポン', unitPrice: -500, quantity: 1 },
  ],
};

console.log('=== レシート ===');
console.log(renderReceipt(order));
console.log('');
console.log('=== 合計のみ(数値) ===');
const total = calculateTotal(order);
console.log(total, `(${typeof total})`);

const r = evaluateOrder(order);
console.log('');
console.log(`検算: ${r.subtotal} - ${r.discount} + ${r.tax} = ${r.subtotal - r.discount + r.tax}`);

console.log('');
console.log('=== 送料無料になる注文 ===');
const bigOrder = {
  items: [
    { kind: 'product', name: '椅子', unitPrice: 4000, quantity: 1 },
    { kind: 'food', name: '紅茶', unitPrice: 1000, quantity: 1 },
    { kind: 'shipping', name: '宅配便', unitPrice: 800, quantity: 1 },
  ],
};
console.log(renderReceipt(bigOrder));
console.log('');
console.log('合計のみ:', calculateTotal(bigOrder));
