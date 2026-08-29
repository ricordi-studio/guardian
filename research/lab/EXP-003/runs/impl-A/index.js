'use strict';

/**
 * 送信キュー — 公開する入り口。
 *
 *   const q = require('./impl-A');
 *   let progress = q.createProgress();
 *   const report = await q.runBatch(items, send, { progress, batchSize: 5 });
 *   // report.progress を保存し、次回の実行にそのまま渡す
 *
 * 送信手段 (send) の約束:
 *   send(item) は Promise を返し、次のいずれかに解決する。
 *     { status: 'success' }
 *     { status: 'temporary', reason: '人が読める理由' }
 *     { status: 'permanent', reason: '人が読める理由' }
 *   例外を投げてもよい(一時的な失敗として扱われる)。
 *   上記以外の形に解決した場合も、成功とは見なさず一時的な失敗として扱う。
 */

const { DEFAULTS } = require('./lib/config');
const { createProgress, PROGRESS_VERSION } = require('./lib/progress');
const { runBatch, retryFailed, isComplete, isCompleteAndClean } = require('./lib/sendQueue');
const { SUCCESS, TEMPORARY, PERMANENT } = require('./lib/outcome');

/** 送信手段が結果を組み立てるための小道具(任意) */
const results = {
  success: () => ({ status: SUCCESS }),
  temporary: (reason) => ({ status: TEMPORARY, reason }),
  permanent: (reason) => ({ status: PERMANENT, reason }),
};

module.exports = {
  DEFAULTS,
  PROGRESS_VERSION,
  STATUS: { SUCCESS, TEMPORARY, PERMANENT },
  results,
  createProgress,
  runBatch,
  retryFailed,
  isComplete,
  isCompleteAndClean,
};
