'use strict';

const { SUCCESS, TEMPORARY, PERMANENT, classify, fromThrown } = require('./outcome');

/**
 * 1 件の項目に決着をつける(§4)。
 *
 * - 成功        : その場で終わる
 * - 恒久的な失敗: 一切再試行しない。待機もしない
 * - 一時的な失敗: 上限回数まで、あいだに待機を挟んで再送する
 * - 例外        : 一時的な失敗として扱い、外へ漏らさない
 *
 * 返す理由は「その項目に実際に起きたこと」を表す(§4.5)。
 * 恒久的な失敗に「規定回数試した」とは書かない。
 *
 * @returns {{ kind: string, reason: string|null, attempts: number }}
 */
async function settleItem(item, send, config) {
  let attempts = 0;
  let lastTemporaryReason = null;

  while (attempts < config.maxAttempts) {
    attempts += 1;

    let outcome;
    try {
      outcome = classify(await send(item));
    } catch (err) {
      outcome = fromThrown(err);
    }

    if (outcome.kind === SUCCESS) {
      return { kind: SUCCESS, reason: null, attempts };
    }

    if (outcome.kind === PERMANENT) {
      // 再試行しない。待機もしない。理由は送信手段が返したものをそのまま根拠にする。
      return { kind: PERMANENT, reason: `恒久的な失敗: ${outcome.reason}`, attempts };
    }

    lastTemporaryReason = outcome.reason;

    if (attempts < config.maxAttempts) {
      await config.sleep(delayFor(attempts, config));
    }
  }

  const suffix = config.maxAttempts > 1
    ? ` (一時的な失敗が ${attempts} 回続いたため、この実行では諦めた)`
    : ' (再送なしの設定のため、この実行では諦めた)';

  return { kind: TEMPORARY, reason: `${lastTemporaryReason}${suffix}`, attempts };
}

/**
 * attemptNo 回目の失敗のあとに置く待機時間。
 * backoffFactor が 1 なら毎回一定、1 より大きければ回を追うごとに伸びる(要確認 E)。
 */
function delayFor(attemptNo, config) {
  const raw = config.retryDelayMs * Math.pow(config.backoffFactor, attemptNo - 1);
  return Math.min(raw, config.maxRetryDelayMs);
}

module.exports = { settleItem, delayFor };
