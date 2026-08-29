'use strict';

/**
 * 動作確認。注文を 1 件流してレシートと合計を出し、
 * ついでに仕様書 §8 の不変条件を素朴に検算する。
 *
 *   node demo.js
 */

const assert = require('assert');
const { KIND, buildReceipt, calculateTotal, summarize } = require('./index');

const order = {
  lines: [
    { kind: KIND.PRODUCT, name: 'ノート', unitPrice: 500, quantity: 2 },
    { kind: KIND.FOOD, name: 'コーヒー豆', unitPrice: 1200, quantity: 1 },
    { kind: KIND.SHIPPING, name: '配送料', unitPrice: 800, quantity: 1 },
    { kind: KIND.DISCOUNT, name: 'クーポン', unitPrice: -300, quantity: 1 },
  ],
};

const before = JSON.stringify(order);

console.log('--- レシート ---');
console.log(buildReceipt(order));
console.log('');
console.log('--- 合計金額のみ ---');
console.log(calculateTotal(order), typeof calculateTotal(order));

// §8-2: 入力は変更されない
assert.strictEqual(JSON.stringify(order), before, '入力の注文データが書き換えられた');

// §1 / §7: 2 つの経路の合計が一致する
const sum = summarize(order);
assert.ok(
  buildReceipt(order).includes(`¥${sum.total}`),
  'レシートの合計と合計金額のみが食い違う'
);

// §5: 合計 = 小計 − 割引 + 消費税
assert.strictEqual(sum.total, sum.subtotal - sum.discount + sum.tax, '検算が合わない');

// §8-1: 同じ注文からは同じ結果
assert.strictEqual(buildReceipt(order), buildReceipt(order), '結果が安定しない');

// §4: 商品+食料品が 5,000 円ちょうどで送料無料(境界を含む)
const boundary = {
  lines: [
    { kind: KIND.PRODUCT, name: '椅子', unitPrice: 5000, quantity: 1 },
    { kind: KIND.SHIPPING, name: '配送料', unitPrice: 800, quantity: 1 },
  ],
};
const boundarySum = summarize(boundary);
assert.strictEqual(boundarySum.shippingWaived, true, '5,000 円ちょうどで送料が無料にならない');
assert.strictEqual(boundarySum.subtotal, 5000, '無料の送料が小計に混ざっている');
assert.strictEqual(boundarySum.tax, 500, '無料の送料に税が課されている');
assert.ok(!buildReceipt(boundary).includes('送料'), 'レシートに送料の行が残っている');

// §8-3: 明細 0 件でも異常終了しない
const empty = { lines: [] };
assert.deepStrictEqual(summarize(empty), {
  subtotal: 0, discount: 0, tax: 0, total: 0, shippingWaived: false,
});
console.log('');
console.log('--- 明細 0 件のレシート ---');
console.log(buildReceipt(empty));

// §9-6 / §9-9: 未定義の種別・壊れた入力は黙って通さない
assert.throws(() => calculateTotal({ lines: [{ kind: 'gift', name: '?', unitPrice: 1, quantity: 1 }] }));
assert.throws(() => calculateTotal({ lines: [{ kind: KIND.PRODUCT, name: '?', unitPrice: 1.5, quantity: 1 }] }));
assert.throws(() => calculateTotal({ lines: [{ kind: KIND.PRODUCT, name: '?', unitPrice: -1, quantity: 1 }] }));

console.log('');
console.log('OK: すべての検算を通過');
