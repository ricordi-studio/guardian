'use strict';

const { lookupKind, knownKindNames } = require('./catalog');

/**
 * 入力の読み取りと検証。
 *
 * ここは「呼び出し側のデータを一切書き換えずに、自分用の読み取り済み配列を作る」場所。
 * 仕様 §2「入力として渡された注文データを、処理の過程で書き換えてはならない」
 * 仕様 §8.2「入力の注文データは変更されない」
 *
 * 検証に落ちた入力は例外にする(黙って通さない ── 判断 6 / 判断 9)。
 */

class OrderError extends Error {
  constructor(message) {
    super(message);
    this.name = 'OrderError';
  }
}

/** 注文から明細の並びを取り出す。配列そのもの / {lines} / {items} を受ける。 */
function extractLines(order) {
  if (Array.isArray(order)) return order;
  if (order && typeof order === 'object') {
    if (Array.isArray(order.lines)) return order.lines;
    if (Array.isArray(order.items)) return order.items;
  }
  throw new OrderError(
    '注文は明細の配列、または {lines:[...]} / {items:[...]} の形で渡すこと'
  );
}

function isSafeInteger(value) {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

/**
 * 明細 1 件を検証し、計算に使う値だけを持つ「読み取り済みの明細」を新しく作る。
 * 元の明細オブジェクトは参照するだけで、書き換えない。
 */
function readLine(rawLine, index) {
  const where = `明細[${index}]`;
  if (!rawLine || typeof rawLine !== 'object') {
    throw new OrderError(`${where}: 明細はオブジェクトであること`);
  }

  const kind = lookupKind(rawLine.kind);
  if (!kind) {
    throw new OrderError(
      `${where}: 未定義の種別 ${JSON.stringify(rawLine.kind)} ` +
        `(受け付けるのは ${knownKindNames().join(' / ')})`
    );
  }

  const name = rawLine.name;
  if (typeof name !== 'string' || name.length === 0) {
    throw new OrderError(`${where}: 名称は空でない文字列であること`);
  }

  const unitPrice = rawLine.unitPrice;
  if (!isSafeInteger(unitPrice)) {
    // §8.5「表示される金額はすべて円単位の整数」── 小数の単価は入口で止める。
    throw new OrderError(`${where}: 単価は円単位の整数であること (${unitPrice})`);
  }

  const quantity = rawLine.quantity;
  if (!isSafeInteger(quantity) || quantity < 0) {
    throw new OrderError(`${where}: 数量は 0 以上の整数であること (${quantity})`);
  }

  // 符号の約束(§2 の表)。割引だけが負、他は正の側。
  if (kind.isDiscount) {
    if (unitPrice > 0) {
      throw new OrderError(`${where}: 割引の単価は 0 以下であること (${unitPrice})`);
    }
  } else if (unitPrice < 0) {
    throw new OrderError(
      `${where}: ${kind.label}の単価は 0 以上であること。値引きは種別 DISCOUNT で表すこと (${unitPrice})`
    );
  }

  const amount = unitPrice * quantity; // §2「金額 = 単価 × 数量」
  if (!Number.isSafeInteger(amount)) {
    throw new OrderError(`${where}: 金額が大きすぎる (${unitPrice} x ${quantity})`);
  }

  return Object.freeze({ kind, name, unitPrice, quantity, amount });
}

/** 注文全体を読み取る。戻り値は凍結済みの明細配列(入力とは別のオブジェクト)。 */
function readOrder(order) {
  const rawLines = extractLines(order);
  return Object.freeze(rawLines.map(readLine));
}

module.exports = { readOrder, OrderError };
