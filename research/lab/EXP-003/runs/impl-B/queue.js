'use strict';

const { resolveConfig } = require('./defaults');
const { SUCCESS } = require('./outcome');
const { settleItem } = require('./attempt');
const progressStore = require('./progress');

/**
 * 送信キュー本体(§1〜§8)。
 *
 * 呼び出し側との約束:
 *   - items    : 送るべき項目の順序付きの並び。実行のあいだ変わらないこと(§5 末尾)
 *   - send     : 1 件を受け取り、非同期に結果を返す送信手段(§2.2)
 *   - progress : 前回の実行が返した進捗情報。初回は createProgress() か省略
 *
 * 進捗情報は書き換えず、複製した新しい進捗を戻り値に含める。
 */

/**
 * 1 回の実行。並びの先頭(前回の続き)から、上限件数まで 1 件ずつ逐次に送る。
 *
 * @returns {{
 *   attempted: number,        // 今回決着をつけた件数
 *   succeeded: number,        // 今回実際に送り届けられた件数
 *   failed: number,           // 今回諦めた件数
 *   failures: {id, reason}[], // 今回諦めた項目の識別値と理由
 *   remaining: number,        // まだ一度も処理を試みていない項目の数(§6)
 *   allSettled: boolean,      // 並びの全項目に決着がついたか(§7)
 *   failedTotal: number,      // 進捗に溜まっている「諦めた項目」の総数
 *   clean: boolean,           // 全件処理済み かつ 失敗ゼロ か(§7)
 *   progress: object,         // 次回の実行に渡す進捗情報
 * }}
 */
async function run(items, send, progress, options) {
  const config = resolveConfig(options, false);
  const list = validateItems(items, config.getId);
  validateSender(send);

  const state = progressStore.adoptProgress(progress);
  if (state.cursor > list.length) state.cursor = list.length;

  const failures = [];
  let attempted = 0;
  let succeeded = 0;

  while (attempted < config.maxPerRun && state.cursor < list.length) {
    const entry = list[state.cursor];
    const outcome = await settleItem(entry.item, send, config);

    if (outcome.kind === SUCCESS) {
      progressStore.markSucceeded(state, entry.id);
      succeeded += 1;
    } else {
      progressStore.markFailed(state, entry.id, outcome.reason);
      failures.push({ id: entry.id, reason: outcome.reason });
    }

    // 決着がついた項目は、成功・失敗にかかわらず通過済みとする。
    // 失敗しても再開位置は巻き戻らない(§5 不変条件)。
    state.cursor += 1;
    attempted += 1; // 上限は「処理を試みた項目数」に掛かる(要確認 A)
  }

  const remaining = list.length - state.cursor;

  return {
    attempted,
    succeeded,
    failed: failures.length,
    failures,
    remaining,
    allSettled: remaining === 0,
    failedTotal: state.failed.length,
    clean: remaining === 0 && state.failed.length === 0,
    progress: state,
  };
}

/**
 * 諦めた項目だけをもう一度試す、運用者向けの手段(§8)。
 * 対象は進捗に記録された「諦めた項目」だけで、それ以外の項目には触れない。
 * 再開位置(cursor)も動かさない。
 *
 * @returns {{
 *   attempted: number,        // 試した件数
 *   succeeded: number,        // 成功した件数
 *   stillFailed: number,      // 依然として失敗している件数
 *   failures: {id, reason}[], // 依然として失敗している項目と、更新された理由
 *   progress: object,
 * }}
 */
async function retryFailed(items, send, progress, options) {
  const config = resolveConfig(options, true);
  const list = validateItems(items, config.getId);
  validateSender(send);

  const state = progressStore.adoptProgress(progress);

  const byId = new Map();
  for (const entry of list) byId.set(progressStore.keyOf(entry.id), entry.item);

  // 途中で state.failed を書き換えるため、対象は先に固定する。
  const targets = state.failed.map((record) => record.id);

  const failures = [];
  let succeeded = 0;

  for (const id of targets) {
    const key = progressStore.keyOf(id);
    if (!byId.has(key)) {
      const reason = '並びの中に該当する項目が見つからないため再試行できなかった';
      progressStore.markFailed(state, id, reason);
      failures.push({ id, reason });
      continue;
    }

    const outcome = await settleItem(byId.get(key), send, config);

    if (outcome.kind === SUCCESS) {
      // 成功したら諦めた集合から取り除き、成功の記録へ移す(§8)。
      progressStore.markSucceeded(state, id);
      succeeded += 1;
    } else {
      progressStore.markFailed(state, id, outcome.reason);
      failures.push({ id, reason: outcome.reason });
    }
  }

  return {
    attempted: targets.length,
    succeeded,
    stillFailed: failures.length,
    failures,
    progress: state,
  };
}

/** 並びのすべての項目に決着がついたか(§7)。失敗ゼロかどうかとは別の概念。 */
function isComplete(items, progress) {
  const state = progressStore.adoptProgress(progress);
  return state.cursor >= toLength(items);
}

/** 「全件処理済み かつ 失敗ゼロ」か(§7 で区別を求められている側) */
function isCleanlyComplete(items, progress) {
  const state = progressStore.adoptProgress(progress);
  return state.cursor >= toLength(items) && state.failed.length === 0;
}

/** 実行しなくても現在地を見られる要約 */
function summarize(items, progress) {
  const state = progressStore.adoptProgress(progress);
  const total = toLength(items);
  const cursor = Math.min(state.cursor, total);
  return {
    total,
    settled: cursor,
    remaining: total - cursor,
    succeeded: state.succeeded.length,
    failed: state.failed.length,
    allSettled: cursor >= total,
    clean: cursor >= total && state.failed.length === 0,
  };
}

function toLength(items) {
  return Array.isArray(items) ? items.length : 0;
}

/**
 * 並びを検証し、[{ item, id }] に整える。
 * 識別値が取れない・重複しているのは呼び出し側の誤りであり、
 * 送信を 1 件も始める前に例外で知らせる(送信中の異常とは別物として扱う)。
 */
function validateItems(items, getId) {
  if (!Array.isArray(items)) {
    throw new TypeError('items は配列でなければならない');
  }
  const list = [];
  const seen = new Set();
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    const id = getId(item);
    if (id === undefined || id === null || id === '') {
      throw new TypeError(`items[${i}] から識別値を取り出せない`);
    }
    const key = progressStore.keyOf(id);
    if (seen.has(key)) {
      throw new TypeError(`識別値が重複している: ${key}`);
    }
    seen.add(key);
    list.push({ item, id });
  }
  return list;
}

function validateSender(send) {
  if (typeof send !== 'function') {
    throw new TypeError('send(送信手段) は関数でなければならない');
  }
}

module.exports = { run, retryFailed, isComplete, isCleanlyComplete, summarize };
