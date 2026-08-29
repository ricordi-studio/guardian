'use strict';

/**
 * 実行をまたいで持ち回る進捗情報(§5)。
 *
 * 形:
 * {
 *   version:   1,
 *   cursor:    number,                  // 決着がついた位置。次回はここから再開する
 *   succeeded: string[],                // 成功した項目の識別値(重複なし)
 *   failed:    { id, reason }[],        // 諦めた項目の識別値と理由(識別値は重複なし)
 * }
 *
 * JSON でそのまま保存・復元できる形にしてある(呼び出し側が保存する前提のため)。
 */

const VERSION = 1;

/** 初期状態 = 「1 件も処理していない」(§5) */
function createProgress() {
  return { version: VERSION, cursor: 0, succeeded: [], failed: [] };
}

/**
 * 呼び出し側から渡された進捗を検証しつつ複製する。
 * 入力を書き換えないため、実行は常にこの複製の上で行う。
 */
function adoptProgress(input) {
  if (input === undefined || input === null) return createProgress();
  if (typeof input !== 'object') {
    throw new TypeError('progress はオブジェクトでなければならない');
  }

  const cursor = Number.isInteger(input.cursor) && input.cursor >= 0 ? input.cursor : 0;

  const succeeded = [];
  const seenSucceeded = new Set();
  for (const id of toArray(input.succeeded)) {
    const key = keyOf(id);
    if (seenSucceeded.has(key)) continue;
    seenSucceeded.add(key);
    succeeded.push(id);
  }

  const failed = [];
  const seenFailed = new Set();
  for (const record of toArray(input.failed)) {
    if (record === null || typeof record !== 'object') continue;
    const key = keyOf(record.id);
    if (seenFailed.has(key) || seenSucceeded.has(key)) continue;
    seenFailed.add(key);
    failed.push({ id: record.id, reason: String(record.reason == null ? '' : record.reason) });
  }

  return { version: VERSION, cursor, succeeded, failed };
}

/** 成功を記録する。同じ識別値が諦めた集合にあれば取り除く(§8) */
function markSucceeded(progress, id) {
  removeFailed(progress, id);
  const key = keyOf(id);
  if (!progress.succeeded.some((existing) => keyOf(existing) === key)) {
    progress.succeeded.push(id);
  }
}

/** 諦めた項目を記録する。同じ識別値は積み上げず、理由を最新のもので上書きする(§5) */
function markFailed(progress, id, reason) {
  const key = keyOf(id);
  const index = progress.succeeded.findIndex((existing) => keyOf(existing) === key);
  if (index >= 0) progress.succeeded.splice(index, 1);

  const existing = progress.failed.find((record) => keyOf(record.id) === key);
  if (existing) {
    existing.reason = reason;
    return;
  }
  progress.failed.push({ id, reason });
}

function removeFailed(progress, id) {
  const key = keyOf(id);
  const index = progress.failed.findIndex((record) => keyOf(record.id) === key);
  if (index >= 0) progress.failed.splice(index, 1);
}

function failedIds(progress) {
  return progress.failed.map((record) => record.id);
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

/** 識別値の同一性判定。文字列化して比較する(数値 1 と文字列 "1" は同じ項目とみなす) */
function keyOf(id) {
  return typeof id === 'string' ? id : String(id);
}

module.exports = {
  VERSION,
  createProgress,
  adoptProgress,
  markSucceeded,
  markFailed,
  removeFailed,
  failedIds,
  keyOf,
};
