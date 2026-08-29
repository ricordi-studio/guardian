'use strict';

/**
 * 調整値の既定値。
 *
 * 仕様 §9「調整値は値として外から見え、変更できること」に従い、
 * ここに一箇所で並べて公開する。呼び出し側は
 *   - このオブジェクトを直接書き換える(プロセス全体の既定を変える)
 *   - 実行時に options で個別に上書きする(その回だけ変える)
 * のどちらでもよい。コードの中に数値を埋め込まない。
 */
const DEFAULTS = {
  /** §3: 1 回の実行で「決着をつける」項目数の上限 */
  batchSize: 20,

  /** §4.1: 一時的な失敗に対する、1 項目あたりの総試行回数(初回を含む) */
  maxAttempts: 3,

  /** §8: 手動再試行での総試行回数。null なら maxAttempts と同じ(要確認 C の判断) */
  retryAttempts: null,

  /** §4.1: 再送と再送のあいだに置く待機時間(ミリ秒) */
  waitMs: 500,

  /**
   * §4.1 / 要確認 E: 待機時間の伸び方。
   * 1 なら毎回同じ間隔(既定)。2 にすれば 500 → 1000 → 2000 の指数的後退になる。
   */
  backoffFactor: 1,

  /** 待機時間の上限(ミリ秒)。backoffFactor を上げたときの暴走止め */
  maxWaitMs: 30000,

  /** §8 / 要確認 D: 手動再試行で「恒久的な失敗」で諦めた項目も対象に含めるか */
  retryPermanentFailures: true,

  /** §2.1: 項目から識別値を取り出す手段。既定は item.id */
  identify: (item) => (item == null ? undefined : item.id),

  /** 待機の実体。試験では即時に解決する関数を差し込める */
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

/** 実行時 options を既定値に重ねて、この回の設定を作る。 */
function resolveConfig(options) {
  const opts = options || {};
  const cfg = Object.assign({}, DEFAULTS, opts);

  cfg.batchSize = positiveInt(cfg.batchSize, 'batchSize');
  cfg.maxAttempts = positiveInt(cfg.maxAttempts, 'maxAttempts');
  cfg.retryAttempts =
    cfg.retryAttempts == null
      ? cfg.maxAttempts
      : positiveInt(cfg.retryAttempts, 'retryAttempts');

  if (typeof cfg.identify !== 'function') {
    throw new TypeError('identify は関数でなければならない');
  }
  if (typeof cfg.sleep !== 'function') {
    throw new TypeError('sleep は関数でなければならない');
  }
  return cfg;
}

/** n 回目の失敗のあとに置く待機時間(ミリ秒)。attempt は 1 始まり。 */
function waitFor(attempt, cfg) {
  const factor = Number(cfg.backoffFactor) || 1;
  const base = Number(cfg.waitMs) || 0;
  const ms = base * Math.pow(factor, Math.max(0, attempt - 1));
  return Math.min(ms, Number(cfg.maxWaitMs) || ms);
}

function positiveInt(value, name) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) {
    throw new TypeError(`${name} は 1 以上の整数でなければならない (受け取った値: ${value})`);
  }
  return n;
}

module.exports = { DEFAULTS, resolveConfig, waitFor };
