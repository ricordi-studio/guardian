'use strict';

const { resolveConfig } = require('./config');
const { SUCCESS, PERMANENT, classify, fromThrown } = require('./outcome');
const { createProgress, ProgressBook } = require('./progress');

/**
 * 送信キュー本体。
 * - runBatch(items, send, options)     … 1 回の実行(§3〜§6)
 * - retryFailed(items, send, options)  … 諦めた項目だけの手動再試行(§8)
 * - isComplete(items, progress)        … 完了の判定(§7)
 */

/** 並びが本道具の前提を満たすか(全項目が識別値を持つか)を、送信を始める前に検査する。 */
function indexItems(items, idOf) {
  if (!Array.isArray(items)) {
    throw new TypeError('items は配列で渡してください');
  }
  const byId = new Map();
  const ids = new Array(items.length);
  for (let i = 0; i < items.length; i += 1) {
    let id;
    try {
      id = idOf(items[i]);
    } catch (err) {
      throw new TypeError(`items[${i}] の識別値を取り出せませんでした: ${err && err.message}`);
    }
    if (id === undefined || id === null || id === '') {
      throw new TypeError(`items[${i}] に識別値がありません。全項目が一意な識別値を持つ必要があります`);
    }
    ids[i] = id;
    const key = `${typeof id}:${String(id)}`;
    if (!byId.has(key)) byId.set(key, i);
  }
  return { ids, byId };
}

/**
 * 1 件の項目に決着をつける。
 * 例外は外へ漏らさず、必ず「成功」か「諦めた(理由つき)」のどちらかを返す(§4.3 / §9)。
 *
 * @returns {{sent: true, attempts: number} | {sent: false, reason: string, attempts: number, permanent: boolean}}
 */
async function settleItem(item, send, cfg) {
  let lastReason = null;

  for (let attempt = 1; attempt <= cfg.maxAttempts; attempt += 1) {
    let outcome;
    try {
      outcome = classify(await send(item));
    } catch (err) {
      // §4.3 送信手段が例外を投げても実行全体は止めない。一時的な失敗として扱う。
      outcome = fromThrown(err);
    }

    if (outcome.kind === SUCCESS) {
      return { sent: true, attempts: attempt };
    }
    if (outcome.kind === PERMANENT) {
      // §4.2 一切再試行しない。待機もしない。
      // §4.5 理由は送信手段が返したものをそのまま使う(回数の話にすり替えない)。
      return { sent: false, reason: outcome.reason, attempts: attempt, permanent: true };
    }

    lastReason = outcome.reason;
    if (attempt < cfg.maxAttempts) {
      await cfg.wait(cfg.retryDelayMs); // §4.1 連続で叩かない
    }
  }

  return {
    sent: false,
    reason:
      cfg.maxAttempts === 1
        ? `一時的な失敗のため諦めた (理由: ${lastReason})`
        : `一時的な失敗が続き ${cfg.maxAttempts} 回試しても送れなかった (最後の理由: ${lastReason})`,
    attempts: cfg.maxAttempts,
    permanent: false,
  };
}

/**
 * 1 回の実行(§3)。
 * 未処理の項目を先頭から順に、上限 batchSize 件まで処理して報告を返す。
 *
 * @param {Array} items    送るべき項目の順序付きの並び
 * @param {(item:any)=>Promise} send 送信手段(1 件ずつ・逐次で呼ばれる)
 * @param {object} options {progress, batchSize, maxAttempts, retryDelayMs, idOf, wait}
 */
async function runBatch(items, send, options = {}) {
  if (typeof send !== 'function') throw new TypeError('send は関数で渡してください');
  const cfg = resolveConfig(options);
  const { ids } = indexItems(items, cfg.idOf);
  const book = new ProgressBook(options.progress || createProgress());

  let sentNow = 0;
  const abandonedNow = [];
  let processed = 0;

  while (book.cursor < items.length && processed < cfg.batchSize) {
    const at = book.cursor;
    const id = ids[at];

    // 二重送信の防止(§5)。すでに決着済みの位置は上限を消費せずに読み飛ばす。
    if (book.isSettled(id)) {
      book.advanceCursorTo(at + 1);
      continue;
    }

    const result = await settleItem(items[at], send, cfg);
    if (result.sent) {
      book.recordSent(id);
      sentNow += 1;
    } else {
      book.recordFailure(id, result.reason);
      abandonedNow.push({ id, reason: result.reason, permanent: result.permanent });
    }

    // 成功でも失敗でも「決着がついた」ので前へ進む。
    // §5「失敗した項目があるからといって、その後ろの再開位置が巻き戻ってはならない」
    book.advanceCursorTo(at + 1);
    processed += 1; // §3 / 判断 A 上限は「処理を試みた件数」に掛かる
  }

  const remaining = Math.max(0, items.length - book.cursor);
  const failures = book.listFailures();

  return {
    /** 今回の実行で実際に送り届けられた件数 */
    sent: sentNow,
    /** 今回の実行で諦めた件数 */
    abandoned: abandonedNow.length,
    /** 今回諦めた項目の識別値と理由 */
    abandonedItems: abandonedNow,
    /** まだ一度も処理を試みていない項目の数(§6 / 判断 G) */
    remaining,
    /** 全件に決着がついたか(§7) */
    complete: remaining === 0,
    /** 諦めた項目が 1 件もないか(§7 「全件処理済み」と「失敗ゼロ」は別概念) */
    clean: failures.length === 0,
    /** 過去の実行を含む、諦めたままの項目すべて */
    failures,
    /** 更新後の進捗情報。呼び出し側はこれを保存して次回に渡す */
    progress: book.progress,
    /** 今回、送信手段を呼んで決着をつけた件数 */
    processed,
  };
}

/**
 * 諦めた項目だけをもう一度試す(§8)。
 * 対象は進捗情報の failed に載っている項目のみ。並びの再開位置には一切触れない。
 */
async function retryFailed(items, send, options = {}) {
  if (typeof send !== 'function') throw new TypeError('send は関数で渡してください');
  const cfg = resolveConfig(options);
  const { byId } = indexItems(items, cfg.idOf);
  const book = new ProgressBook(options.progress || createProgress());

  const targets = book.listFailures(); // 複製を回すので、途中で failed が動いても安全
  let attempted = 0;
  let sentNow = 0;
  const stillFailing = [];

  for (const target of targets) {
    const key = `${typeof target.id}:${String(target.id)}`;
    const at = byId.get(key);
    if (at === undefined) {
      // 並びの中に見当たらない。触れずに諦めたまま残す(件数にも数えない)。
      stillFailing.push({ id: target.id, reason: target.reason });
      continue;
    }

    attempted += 1;
    const result = await settleItem(items[at], send, cfg);
    if (result.sent) {
      // §8 成功したら「諦めた項目」から取り除き、成功の記録へ移す。
      book.recordSent(target.id);
      sentNow += 1;
    } else {
      book.recordFailure(target.id, result.reason); // 更新された理由で上書き
      stillFailing.push({ id: target.id, reason: result.reason });
    }
  }

  return {
    /** 実際に送信手段を呼んだ件数 */
    attempted,
    /** そのうち送り届けられた件数 */
    sent: sentNow,
    /** 依然として諦めたままの項目 */
    failures: book.listFailures(),
    stillFailing,
    progress: book.progress,
  };
}

/** 完了の判定(§7)。並びのすべての項目に決着がついたか。 */
function isComplete(items, progress) {
  if (!Array.isArray(items)) throw new TypeError('items は配列で渡してください');
  const book = new ProgressBook(progress || createProgress());
  return book.cursor >= items.length;
}

/** 完了かつ失敗ゼロか(§7 の区別のための補助) */
function isCompleteAndClean(items, progress) {
  return isComplete(items, progress) && (progress ? progress.failed.length === 0 : true);
}

module.exports = { runBatch, retryFailed, isComplete, isCompleteAndClean, settleItem };
