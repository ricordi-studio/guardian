'use strict';

/**
 * 送信キュー ── 公開口。
 *
 *   const queue = require('./impl-C');
 *
 *   let progress = queue.createProgress();
 *   const report = await queue.runOnce(items, send, progress, { batchSize: 10 });
 *   progress = report.progress;            // 保存して次回に渡す
 *   if (!report.allSettled) { ... }        // 上限で中断した ── 次回続きから
 *   if (report.hasFailures) { ... }        // 諦めた項目がある ── 手動再試行の出番
 *
 *   const retryReport = await queue.retryFailed(items, send, progress);
 *
 * 送信手段は「1 件を受け取り、非同期に結果を返す関数」。
 * 結果は queue.outcomes.success() / .temporary(理由) / .permanent(理由) で組み立てる。
 */

const { DEFAULTS } = require('./config');
const { createProgress, PROGRESS_VERSION } = require('./progress');
const { outcomes, classify } = require('./outcome');
const queue = require('./queue');

module.exports = {
  // 調整値(§9: 外から見えて変更できる)
  DEFAULTS,

  // 進捗情報(§5)
  createProgress,
  PROGRESS_VERSION,

  // 送信結果の組み立て(§2.2)
  outcomes,
  classifyOutcome: classify,

  // 実行(§3, §6)
  runOnce: queue.runOnce,

  // 手動再試行(§8)
  retryFailed: queue.retryFailed,

  // 状態の問い合わせ(§6, §7)
  remainingCount: queue.remainingCount,
  isComplete: queue.isComplete,
  summarize: queue.summarize,

  // 諦めた理由の分類
  GAVE_UP_PERMANENT: queue.GAVE_UP_PERMANENT,
  GAVE_UP_EXHAUSTED: queue.GAVE_UP_EXHAUSTED,
  GAVE_UP_MISSING: queue.GAVE_UP_MISSING,
};
