'use strict';

const assert = require('assert');
const { buildReceipt, calculateTotal, calculate, OrderError } = require('./index');
const { displayWidth } = require('./lib/render');

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log('  ok  ' + name);
}

// ---- §1 / §7 2 つの経路が一致する ----------------------------------------
test('レシートの合計行と calculateTotal が一致する', () => {
  const orders = [
    [{ kind: 'PRODUCT', name: 'A', unitPrice: 1200, quantity: 2 },
     { kind: 'FOOD', name: 'B', unitPrice: 980, quantity: 1 },
     { kind: 'SHIPPING', name: 'S', unitPrice: 500, quantity: 1 },
     { kind: 'DISCOUNT', name: 'C', unitPrice: -300, quantity: 1 }],
    [{ kind: 'PRODUCT', name: 'A', unitPrice: 5000, quantity: 1 },
     { kind: 'SHIPPING', name: 'S', unitPrice: 800, quantity: 1 }],
    [{ kind: 'FOOD', name: 'B', unitPrice: 4999, quantity: 1 },
     { kind: 'SHIPPING', name: 'S', unitPrice: 800, quantity: 1 }],
    [],
  ];
  for (const order of orders) {
    const receipt = buildReceipt(order);
    const shown = Number(receipt.match(/合計\s+¥(-?\d+)/)[1]);
    assert.strictEqual(shown, calculateTotal(order));
  }
});

// ---- §5 合計 = 小計 − 割引 + 消費税 --------------------------------------
test('合計 = 小計 − 割引 + 消費税 が常に成り立つ', () => {
  const r = calculate([
    { kind: 'PRODUCT', name: 'A', unitPrice: 1200, quantity: 2 },
    { kind: 'FOOD', name: 'B', unitPrice: 980, quantity: 1 },
    { kind: 'DISCOUNT', name: 'C', unitPrice: -300, quantity: 1 },
  ]);
  assert.strictEqual(r.total, r.subtotal - r.discount + r.tax);
  assert.strictEqual(r.subtotal, 3380); // 値引き前(判断 1)
  assert.strictEqual(r.discount, 300);
  assert.strictEqual(r.tax, 240 + 78 - 30);
});

// ---- §3.2 丸めは絶対値の切り捨て(全種別一律) ----------------------------
test('丸めは 0 に近づく向き(食料品も割引も)', () => {
  const r = calculate([
    { kind: 'FOOD', name: 'B', unitPrice: 980, quantity: 1 },   // 78.4 -> 78
    { kind: 'DISCOUNT', name: 'C', unitPrice: -105, quantity: 1 }, // -10.5 -> -10
  ]);
  const tax = Object.fromEntries(r.lines.map((l) => [l.kind.code, l.tax]));
  assert.strictEqual(tax.FOOD, 78);
  assert.strictEqual(tax.DISCOUNT, -10);
});

// ---- §4 送料無料 ---------------------------------------------------------
test('商品+食料品が 5000 円ちょうどで送料無料(境界を含む)', () => {
  const order = [
    { kind: 'PRODUCT', name: 'A', unitPrice: 2500, quantity: 1 },
    { kind: 'FOOD', name: 'B', unitPrice: 2500, quantity: 1 },
    { kind: 'SHIPPING', name: 'S', unitPrice: 800, quantity: 1 },
  ];
  const r = calculate(order);
  assert.strictEqual(r.shippingFree, true);
  assert.ok(!buildReceipt(order).includes('送料'));       // 行が出ない
  assert.strictEqual(r.subtotal, 5000);                   // 小計に乗らない
  assert.strictEqual(r.tax, 250 + 200);                   // 送料の税も無い
});

test('4999 円では送料無料にならない', () => {
  const r = calculate([
    { kind: 'PRODUCT', name: 'A', unitPrice: 4999, quantity: 1 },
    { kind: 'SHIPPING', name: 'S', unitPrice: 800, quantity: 1 },
  ]);
  assert.strictEqual(r.shippingFree, false);
  assert.strictEqual(r.subtotal, 5799);
});

test('割引は送料無料の判定に影響しない(判断 4)', () => {
  const r = calculate([
    { kind: 'PRODUCT', name: 'A', unitPrice: 5000, quantity: 1 },
    { kind: 'DISCOUNT', name: 'C', unitPrice: -2000, quantity: 1 },
    { kind: 'SHIPPING', name: 'S', unitPrice: 800, quantity: 1 },
  ]);
  assert.strictEqual(r.shippingFree, true);
});

test('送料自身は判定基準に入らない(判断 4)', () => {
  const r = calculate([
    { kind: 'PRODUCT', name: 'A', unitPrice: 4500, quantity: 1 },
    { kind: 'SHIPPING', name: 'S', unitPrice: 900, quantity: 1 }, // 足せば 5400 だが無料にしない
  ]);
  assert.strictEqual(r.shippingFree, false);
});

// ---- §8.2 入力を書き換えない --------------------------------------------
test('入力の注文データは変更されない', () => {
  const order = {
    lines: [
      { kind: 'PRODUCT', name: 'A', unitPrice: 5000, quantity: 1 },
      { kind: 'SHIPPING', name: 'S', unitPrice: 800, quantity: 1 },
    ],
  };
  const before = JSON.stringify(order);
  buildReceipt(order);
  calculateTotal(order);
  assert.strictEqual(JSON.stringify(order), before);
  assert.strictEqual(order.lines.length, 2); // 送料の明細も残っている
});

// ---- §8.1 同じ注文からは同じ結果 ----------------------------------------
test('同じ注文から常に同じ結果', () => {
  const order = [{ kind: 'FOOD', name: 'B', unitPrice: 333, quantity: 3 }];
  assert.strictEqual(buildReceipt(order), buildReceipt(order));
  assert.strictEqual(calculateTotal(order), calculateTotal(order));
});

// ---- §8.3 明細 0 件 ------------------------------------------------------
test('明細 0 件でも異常終了せず、すべて 0 のレシートを返す', () => {
  const receipt = buildReceipt([]);
  assert.strictEqual(
    receipt,
    ['-'.repeat(32), '小計       ¥0', '消費税     ¥0', '合計       ¥0'].join('\n')
  );
  assert.strictEqual(calculateTotal([]), 0);
});

// ---- §6 レシートの形 -----------------------------------------------------
test('区切り行は - が 32 個', () => {
  const line = buildReceipt([]).split('\n')[0];
  assert.strictEqual(line, '-'.repeat(32));
  assert.strictEqual(line.length, 32);
});

test('行末に余分な空白が無く、末尾に余分な改行も無い', () => {
  const receipt = buildReceipt([
    { kind: 'PRODUCT', name: 'A', unitPrice: 100, quantity: 1 },
    { kind: 'DISCOUNT', name: 'C', unitPrice: -50, quantity: 1 },
  ]);
  assert.ok(!receipt.endsWith('\n'));
  for (const row of receipt.split('\n')) assert.strictEqual(row, row.replace(/\s+$/, ''));
});

test('合計欄は ¥ の桁位置が揃う', () => {
  const receipt = buildReceipt([
    { kind: 'PRODUCT', name: 'A', unitPrice: 100, quantity: 1 },
    { kind: 'DISCOUNT', name: 'C', unitPrice: -50, quantity: 1 },
  ]);
  const totalRows = receipt.split('\n').slice(-4);
  // ¥ の開始桁(全角ラベルは 2 桁として数える)が 4 行とも同じであること
  const columns = totalRows.map((row) => displayWidth(row.slice(0, row.indexOf('¥'))));
  assert.deepStrictEqual(columns, [11, 11, 11, 11]);
});

test('割引が 0 件のときは割引行を出さない', () => {
  const receipt = buildReceipt([{ kind: 'PRODUCT', name: 'A', unitPrice: 100, quantity: 1 }]);
  assert.ok(!receipt.includes('割引'));
  assert.strictEqual(calculate([]).discount, 0);
});

test('明細は入力の順序を保つ', () => {
  const receipt = buildReceipt([
    { kind: 'FOOD', name: '一', unitPrice: 100, quantity: 1 },
    { kind: 'PRODUCT', name: '二', unitPrice: 100, quantity: 1 },
    { kind: 'FOOD', name: '三', unitPrice: 100, quantity: 1 },
  ]);
  const names = receipt.split('\n').slice(0, 3).map((r) => r.split(' ')[1]);
  assert.deepStrictEqual(names, ['一', '二', '三']);
});

test('4 種すべてに日本語の表示名があり、内部コードは出ない', () => {
  const receipt = buildReceipt([
    { kind: 'PRODUCT', name: 'A', unitPrice: 100, quantity: 1 },
    { kind: 'FOOD', name: 'B', unitPrice: 100, quantity: 1 },
    { kind: 'SHIPPING', name: 'S', unitPrice: 100, quantity: 1 },
    { kind: 'DISCOUNT', name: 'C', unitPrice: -100, quantity: 1 },
  ]);
  for (const label of ['商品 ', '食料品 ', '送料 ', '割引 ']) assert.ok(receipt.includes(label));
  for (const code of ['PRODUCT', 'FOOD', 'SHIPPING', 'DISCOUNT']) assert.ok(!receipt.includes(code));
});

test('割引の明細も税率注記を出す(判断 5)', () => {
  const receipt = buildReceipt([{ kind: 'DISCOUNT', name: 'C', unitPrice: -300, quantity: 1 }]);
  assert.ok(receipt.split('\n')[0].endsWith('-¥300 (税10%)'));
});

test('金額に桁区切りを入れない(判断 8)', () => {
  const receipt = buildReceipt([{ kind: 'PRODUCT', name: 'A', unitPrice: 12000, quantity: 1 }]);
  assert.ok(receipt.includes('¥12000'));
  assert.ok(!receipt.includes(','));
});

test('画面に小数が出ない(§8.5)', () => {
  const receipt = buildReceipt([{ kind: 'FOOD', name: 'B', unitPrice: 333, quantity: 1 }]);
  assert.ok(!/\d\.\d/.test(receipt));
});

// ---- §9 判断 6 / 9 入力検証 ---------------------------------------------
test('未定義の種別は例外(黙って通さない ── 判断 6)', () => {
  assert.throws(() => calculateTotal([{ kind: 'GIFT', name: 'X', unitPrice: 1, quantity: 1 }]), OrderError);
});

test('小数・負の数量・符号違反は例外(判断 9)', () => {
  assert.throws(() => calculateTotal([{ kind: 'PRODUCT', name: 'A', unitPrice: 10.5, quantity: 1 }]), OrderError);
  assert.throws(() => calculateTotal([{ kind: 'PRODUCT', name: 'A', unitPrice: 100, quantity: 1.5 }]), OrderError);
  assert.throws(() => calculateTotal([{ kind: 'PRODUCT', name: 'A', unitPrice: 100, quantity: -1 }]), OrderError);
  assert.throws(() => calculateTotal([{ kind: 'PRODUCT', name: 'A', unitPrice: -100, quantity: 1 }]), OrderError);
  assert.throws(() => calculateTotal([{ kind: 'DISCOUNT', name: 'C', unitPrice: 100, quantity: 1 }]), OrderError);
  // 0 は通す
  assert.strictEqual(calculateTotal([{ kind: 'PRODUCT', name: 'A', unitPrice: 0, quantity: 0 }]), 0);
});

// ---- §3.2 明細ごとの丸め(合算後 1 回ではない ── 判断 7)-----------------
test('税は明細ごとに丸める', () => {
  const r = calculate([
    { kind: 'FOOD', name: 'B', unitPrice: 105, quantity: 1 }, // 8.4 -> 8
    { kind: 'FOOD', name: 'B', unitPrice: 105, quantity: 1 }, // 8.4 -> 8
  ]);
  assert.strictEqual(r.tax, 16);      // 明細ごと(8 + 8)
  const r2 = calculate([
    { kind: 'FOOD', name: 'B', unitPrice: 99, quantity: 1 },  // 7.92 -> 7
    { kind: 'FOOD', name: 'B', unitPrice: 99, quantity: 1 },  // 7.92 -> 7
  ]);
  assert.strictEqual(r2.tax, 14);     // 合算 1 回なら trunc(15.84)=15 になるはず
});

console.log(`\n${passed} 件すべて通過`);
