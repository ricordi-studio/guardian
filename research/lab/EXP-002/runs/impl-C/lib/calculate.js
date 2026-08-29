'use strict';

/**
 * 注文 1 件を計算する、ただ 1 本の経路。
 *
 * レシートも「合計金額のみ」も、必ずこの calculate() の戻り値から作る。
 * 経路が 2 本あると規則がずれる(仕様書 §1 / §4 / §7 / §8-4)ので、分岐は作らない。
 */

const {
  KIND,
  FREE_SHIPPING_THRESHOLD,
  isKnownKind,
  ruleOf,
  taxOf,
} = require('./rules');

/** 整数か(有限で小数部が無い)。 */
function isInteger(value) {
  return typeof value === 'number' && Number.isInteger(value);
}

/**
 * 入力検証(§9-9 の判断は DECISIONS.md #9)。
 * 壊れた入力は黙って計算せず、その場で落とす。
 */
function validateLine(line, index) {
  const where = `明細[${index}]`;

  if (line === null || typeof line !== 'object') {
    throw new TypeError(`${where}: 明細はオブジェクトである必要があります`);
  }
  if (!isKnownKind(line.kind)) {
    // §9-6 の判断は DECISIONS.md #6(黙って通さずエラーにする)。
    throw new Error(`${where}: 未定義の種別です: ${String(line.kind)}`);
  }
  if (typeof line.name !== 'string' || line.name.length === 0) {
    throw new TypeError(`${where}: 名称は空でない文字列である必要があります`);
  }
  if (!isInteger(line.unitPrice)) {
    throw new TypeError(`${where}: 単価は円単位の整数である必要があります`);
  }
  if (!isInteger(line.quantity)) {
    throw new TypeError(`${where}: 数量は整数である必要があります`);
  }
  if (line.quantity < 0) {
    throw new RangeError(`${where}: 数量に負の数は使えません`);
  }
  if (line.kind === KIND.DISCOUNT) {
    if (line.unitPrice > 0) {
      throw new RangeError(`${where}: 割引の単価は 0 以下である必要があります`);
    }
  } else if (line.unitPrice < 0) {
    throw new RangeError(`${where}: ${ruleOf(line.kind).label}の単価に負の数は使えません`);
  }
}

/** 注文の形を検証し、明細の配列を取り出す。入力そのものは触らない(§8-2)。 */
function linesOf(order) {
  if (order === null || typeof order !== 'object') {
    throw new TypeError('注文はオブジェクトである必要があります');
  }
  const lines = order.lines;
  if (!Array.isArray(lines)) {
    throw new TypeError('注文の lines は配列である必要があります');
  }
  lines.forEach(validateLine);
  return lines;
}

/**
 * 注文を計算する。
 *
 * 戻り値(すべて円単位の整数、および表示用の明細):
 *   {
 *     lines:    [{ kind, label, name, quantity, amount, tax, note }],  // 送料無料なら送料は含まれない
 *     subtotal, discount, tax, total,
 *     shippingWaived: boolean
 *   }
 *
 * 入力は読むだけで、書き換えない(§8-2)。新しい配列・新しいオブジェクトを組み立てて返す。
 */
function calculate(order) {
  const source = linesOf(order);

  // §4: 送料無料の判定は「商品と食料品の金額の合計(税抜)」だけで行う。
  //     割引も送料自身も判定額に入れない(判断は DECISIONS.md #4)。
  let freeShippingBase = 0;
  for (const line of source) {
    if (ruleOf(line.kind).freeShipBase) {
      freeShippingBase += line.unitPrice * line.quantity;
    }
  }
  const shippingWaived = freeShippingBase >= FREE_SHIPPING_THRESHOLD;

  // 有効な明細(送料無料なら送料を落とす = 注文から取り除かれたものとして扱う)。
  const lines = [];
  let subtotal = 0;   // §5: 値引きを差し引く「前」の課税対象明細の合計(税抜)
  let discount = 0;   // §5: 割引明細の金額の絶対値の合計(正の数)
  let tax = 0;        // §3.3: 明細ごとに丸めた税額の総和

  for (const line of source) {
    if (line.kind === KIND.SHIPPING && shippingWaived) {
      continue; // 表示にも税にも合計にも一切寄与しない(§4)
    }

    const rule = ruleOf(line.kind);
    const amount = line.unitPrice * line.quantity; // §2: 金額 = 単価 × 数量
    const lineTax = taxOf(amount, line.kind);

    if (rule.taxable) {
      subtotal += amount;
    } else {
      discount += Math.abs(amount);
    }
    tax += lineTax;

    lines.push({
      kind: line.kind,
      label: rule.label,
      name: line.name,
      quantity: line.quantity,
      amount,
      tax: lineTax,
      note: rule.note,
    });
  }

  // §5: 合計 = 小計 − 割引 + 消費税(この 1 行以外に合計の求め方は無い)
  const total = subtotal - discount + tax;

  return { lines, subtotal, discount, tax, total, shippingWaived };
}

module.exports = { calculate };
