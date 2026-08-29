'use strict';

/**
 * 仕様書 §8 の不変条件を、そのまま 1 件 1 検査にしたもの。
 * 実行: node test.js
 */

const assert = require('assert');
const { renderReceipt, calculateTotal, evaluateOrder } = require('./index');

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

const item = (kind, name, unitPrice, quantity) => ({ kind, name, unitPrice, quantity });

/** レシートの合計行から数値を読み戻す(2 経路の一致を、表示側からも確かめるため)。 */
function totalFromReceipt(text) {
  const row = text.split('\n').find((line) => line.startsWith('合計'));
  const m = row.match(/(-?)¥(\d+)/);
  return Number(m[1] + m[2]);
}

// --- §5 / §8: 合計 = 小計 − 割引 + 消費税 -------------------------------
check('検算式が成り立つ', () => {
  const r = evaluateOrder([
    item('product', 'ノート', 480, 3),
    item('food', 'コーヒー豆', 1200, 2),
    item('shipping', '宅配便', 600, 1),
    item('discount', 'クーポン', -500, 1),
  ]);
  assert.strictEqual(r.subtotal, 4440);
  assert.strictEqual(r.discount, 500);
  assert.strictEqual(r.tax, 144 + 192 + 60 - 50);
  assert.strictEqual(r.total, r.subtotal - r.discount + r.tax);
  assert.strictEqual(r.total, 4286);
});

// --- §1 / §7: 2 経路が一致する -----------------------------------------
check('レシートと合計のみが一致する', () => {
  const orders = [
    [],
    [item('product', 'A', 100, 1)],
    [item('product', 'A', 4999, 1), item('shipping', '送料', 500, 1)],
    [item('product', 'A', 5000, 1), item('shipping', '送料', 500, 1)],
    [item('food', 'B', 105, 1), item('discount', 'C', -105, 1)],
    [item('product', 'A', 3000, 2), item('shipping', 'S', 700, 1), item('discount', 'D', -1200, 1)],
  ];
  for (const o of orders) {
    assert.strictEqual(totalFromReceipt(renderReceipt(o)), calculateTotal(o));
  }
});

check('合計のみは数値を返す', () => {
  assert.strictEqual(typeof calculateTotal([item('product', 'A', 100, 1)]), 'number');
});

// --- §3.2: 丸めは絶対値の切り捨て、全種別一律 ----------------------------
check('丸めは 0 に近づく向きで全種別一律', () => {
  // 食料品 105 円 → 8.4 → 8
  assert.strictEqual(evaluateOrder([item('food', 'B', 105, 1)]).tax, 8);
  // 割引 -105 円 → -10.5 → -10(絶対値の切り捨て)
  assert.strictEqual(evaluateOrder([item('discount', 'D', -105, 1)]).tax, -10);
  // 商品 105 円 → 10.5 → 10
  assert.strictEqual(evaluateOrder([item('product', 'A', 105, 1)]).tax, 10);
});

check('税は明細ごとに丸める(合算してから丸めない)', () => {
  // 105 円 × 3 明細: 明細ごと 8 円 → 24。合算(315 → 25.2 → 25)とは違う。
  const r = evaluateOrder([
    item('food', 'B1', 105, 1),
    item('food', 'B2', 105, 1),
    item('food', 'B3', 105, 1),
  ]);
  assert.strictEqual(r.tax, 24);
});

// --- §4: 送料無料 -------------------------------------------------------
check('送料無料は 5000 円ちょうどを含む', () => {
  const under = [item('product', 'A', 4999, 1), item('shipping', 'S', 500, 1)];
  const exact = [item('product', 'A', 5000, 1), item('shipping', 'S', 500, 1)];
  assert.strictEqual(evaluateOrder(under).shippingIsFree, false);
  assert.strictEqual(evaluateOrder(exact).shippingIsFree, true);
  // 無料なら小計にも税にも寄与しない
  const r = evaluateOrder(exact);
  assert.strictEqual(r.subtotal, 5000);
  assert.strictEqual(r.tax, 500);
  assert.strictEqual(r.total, 5500);
  assert.ok(!renderReceipt(exact).includes('送料'));
});

check('送料無料の判定に送料自身も割引も含めない', () => {
  // 商品 4800 + 送料 500 = 5300 だが、基準は商品のみ 4800 → 無料にならない
  const a = [item('product', 'A', 4800, 1), item('shipping', 'S', 500, 1)];
  assert.strictEqual(evaluateOrder(a).shippingIsFree, false);
  // 商品 5000 + 割引 -3000 でも、基準は 5000 のまま → 無料
  const b = [
    item('product', 'A', 5000, 1),
    item('discount', 'D', -3000, 1),
    item('shipping', 'S', 500, 1),
  ];
  assert.strictEqual(evaluateOrder(b).shippingIsFree, true);
});

// --- §8.2: 入力を書き換えない -------------------------------------------
check('入力の注文データを書き換えない', () => {
  const order = {
    items: [
      item('product', 'A', 3000, 2),
      item('shipping', 'S', 700, 1),
      item('discount', 'D', -1200, 1),
    ],
  };
  const before = JSON.stringify(order);
  renderReceipt(order);
  calculateTotal(order);
  evaluateOrder(order);
  assert.strictEqual(JSON.stringify(order), before);
  assert.strictEqual(order.items.length, 3);
});

// --- §8.1: 同じ注文からは同じ結果 ---------------------------------------
check('同じ注文からは同じ結果', () => {
  const o = [item('product', 'A', 1234, 3), item('discount', 'D', -99, 1)];
  assert.strictEqual(renderReceipt(o), renderReceipt(o));
  assert.strictEqual(calculateTotal(o), calculateTotal(o));
});

// --- §8.3: 明細 0 件 ----------------------------------------------------
check('明細 0 件でも 0 のレシートを返す', () => {
  const text = renderReceipt([]);
  assert.strictEqual(calculateTotal([]), 0);
  assert.ok(text.includes('¥0'));
  assert.ok(!text.includes('割引'));
  assert.strictEqual(text.split('\n')[0], '-'.repeat(32));
});

// --- §6: レシートの形 ---------------------------------------------------
check('レシートの構造(明細順・区切り 32 個・末尾改行なし)', () => {
  const text = renderReceipt([
    item('product', 'ノート', 480, 3),
    item('food', 'コーヒー豆', 1200, 2),
    item('discount', 'クーポン', -500, 1),
  ]);
  const lines = text.split('\n');
  assert.strictEqual(lines[0], '商品 ノート x3  ¥1440 (税10%)');
  assert.strictEqual(lines[1], '食料品 コーヒー豆 x2  ¥2400 (税8%)');
  assert.strictEqual(lines[2], '割引 クーポン x1  -¥500 (税10%)');
  assert.strictEqual(lines[3], '-'.repeat(32));
  assert.strictEqual(lines[3].length, 32);
  assert.ok(!text.endsWith('\n'));
});

check('行末に余分な空白がない', () => {
  const text = renderReceipt([
    item('product', 'A', 100, 1),
    item('food', 'B', 200, 1),
    item('shipping', 'S', 300, 1),
    item('discount', 'D', -50, 1),
  ]);
  for (const line of text.split('\n')) {
    assert.strictEqual(line, line.replace(/\s+$/, ''), `行末に空白: ${JSON.stringify(line)}`);
  }
});

check('合計欄の金額の開始桁が揃う', () => {
  const width = (s) => require('./src/money').displayWidth(s);
  const text = renderReceipt([item('product', 'A', 1000, 1), item('discount', 'D', -100, 1)]);
  const all = text.split('\n');
  const cols = all
    .slice(all.indexOf('-'.repeat(32)) + 1) // 区切り行より下=合計欄だけを見る
    .map((l) => width(l.slice(0, l.indexOf('¥'))));
  assert.strictEqual(cols.length, 4);
  assert.ok(cols.every((c) => c === cols[0]), `桁が揃っていない: ${cols}`);
});

check('割引が 0 なら割引行を出さない', () => {
  const text = renderReceipt([item('product', 'A', 1000, 1)]);
  assert.ok(!text.split('\n').some((l) => l.startsWith('割引')));
});

check('内部の種別コードが画面に出ない', () => {
  const text = renderReceipt([
    item('product', 'A', 100, 1),
    item('food', 'B', 100, 1),
    item('shipping', 'S', 100, 1),
    item('discount', 'D', -100, 1),
  ]);
  for (const code of ['product', 'food', 'shipping', 'discount']) {
    assert.ok(!text.includes(code), `種別コードが露出: ${code}`);
  }
});

check('画面に小数が出ない', () => {
  const text = renderReceipt([item('food', 'B', 105, 1), item('discount', 'D', -105, 1)]);
  assert.ok(!/\d\.\d/.test(text), text);
});

// --- §9-6 / §9-9: 検証 ---------------------------------------------------
check('未定義の種別は拒否する', () => {
  assert.throws(() => calculateTotal([item('gift', 'X', 100, 1)]), /未定義の種別/);
});

check('不正な単価・数量は拒否する', () => {
  assert.throws(() => calculateTotal([item('product', 'A', 100.5, 1)]), /整数ではありません/);
  assert.throws(() => calculateTotal([item('product', 'A', 100, 1.5)]), /整数ではありません/);
  assert.throws(() => calculateTotal([item('product', 'A', 100, -1)]), /数量が負/);
  assert.throws(() => calculateTotal([item('product', 'A', -100, 1)]), /単価が負/);
  assert.throws(() => calculateTotal([item('discount', 'D', 100, 1)]), /0 以下/);
});

check('0 円・0 個は受け入れる', () => {
  const r = evaluateOrder([item('product', 'おまけ', 0, 1), item('product', 'A', 100, 0)]);
  assert.strictEqual(r.subtotal, 0);
  assert.strictEqual(r.total, 0);
});

console.log(`\n${passed} 件すべて通過`);
