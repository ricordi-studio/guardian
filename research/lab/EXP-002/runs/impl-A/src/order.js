'use strict';

const { kindOf, DISCOUNT } = require('./kinds');

/**
 * 入力の受け取りと検証。
 *
 * ここで【入力を必ず複製する】。以降の処理は複製だけを見るので、
 * 呼び出し側の配列・オブジェクトが書き換わることはない(仕様書 §2 末尾, §8.2)。
 */

/** 注文は `{ items: [...] }` でも、明細の配列そのものでも受け取る。 */
function itemsOf(order) {
  if (Array.isArray(order)) return order;
  if (order && Array.isArray(order.items)) return order.items;
  if (order === null || order === undefined) {
    throw new Error('注文がありません');
  }
  throw new Error('注文に明細の並び(items)がありません');
}

function requireInteger(value, what, index) {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new Error(`明細 ${index} の${what}が整数ではありません: ${JSON.stringify(value)}`);
  }
}

/**
 * 明細 1 件を検証し、内部表現へ写す。
 * 内部表現は { kind, name, unitPrice, quantity, amount } の凍結オブジェクト。
 */
function normalizeItem(raw, index) {
  if (raw === null || typeof raw !== 'object') {
    throw new Error(`明細 ${index} がオブジェクトではありません`);
  }

  // 未定義の種別はここで落ちる(★要確認 6)
  const kind = kindOf(raw.kind);

  if (typeof raw.name !== 'string' || raw.name.length === 0) {
    throw new Error(`明細 ${index} の名称が空です`);
  }

  requireInteger(raw.unitPrice, '単価', index);
  requireInteger(raw.quantity, '数量', index);

  if (raw.quantity < 0) {
    throw new Error(`明細 ${index} の数量が負です: ${raw.quantity}`);
  }
  if (kind.sign > 0 && raw.unitPrice < 0) {
    throw new Error(
      `明細 ${index}(${kind.label})の単価が負です: ${raw.unitPrice}。値引きは種別 "${DISCOUNT}" で表現してください`
    );
  }
  if (kind.sign < 0 && raw.unitPrice > 0) {
    throw new Error(`明細 ${index}(${kind.label})の単価は 0 以下でなければなりません: ${raw.unitPrice}`);
  }

  return Object.freeze({
    kind: kind.code,
    name: raw.name,
    unitPrice: raw.unitPrice,
    quantity: raw.quantity,
    // 明細の金額は「単価 × 数量」(§2)
    amount: raw.unitPrice * raw.quantity,
  });
}

/** 注文を検証済みの明細配列(複製・凍結)へ写す。 */
function normalizeOrder(order) {
  const items = itemsOf(order);
  return Object.freeze(items.map(normalizeItem));
}

module.exports = { normalizeOrder };
