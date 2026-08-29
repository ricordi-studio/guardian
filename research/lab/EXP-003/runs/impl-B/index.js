'use strict';

/**
 * 送信キュー — 公開の入り口。
 *
 *   const q = require('./impl-B');
 *   let progress = q.createProgress();
 *   const r = await q.run(items, send, progress, { maxPerRun: 10 });
 *   progress = r.progress;          // 呼び出し側が保存し、次回に渡す
 *   if (!q.isComplete(items, progress)) { ... 次回の実行へ ... }
 *   await q.retryFailed(items, send, progress);   // 諦めた項目だけ手で再試行
 */

const { run, retryFailed, isComplete, isCleanlyComplete, summarize } = require('./queue');
const { createProgress } = require('./progress');
const { DEFAULTS } = require('./defaults');
const { SUCCESS, TEMPORARY, PERMANENT } = require('./outcome');

/** 送信手段が返す結果を組み立てるための、任意で使える補助 */
const results = {
  success: () => ({ ok: true }),
  temporary: (reason) => ({ ok: false, retryable: true, reason }),
  permanent: (reason) => ({ ok: false, retryable: false, reason }),
};

module.exports = {
  run,
  retryFailed,
  isComplete,
  isCleanlyComplete,
  summarize,
  createProgress,
  DEFAULTS,
  results,
  OUTCOME: { SUCCESS, TEMPORARY, PERMANENT },
};
