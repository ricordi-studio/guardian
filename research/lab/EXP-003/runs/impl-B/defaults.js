'use strict';

/**
 * 調整値(仕様書 §9)。
 * コードの中に埋め込まず、値として外から見え、変更できる形で公開する。
 * 呼び出し側は run()/retryFailed() の options で個別に上書きできる。
 */
const DEFAULTS = {
  /** 1 回の実行で決着をつける項目数の上限(§3) */
  maxPerRun: 50,
  /** 1 項目あたりの送信試行回数の上限。1 = 再送なし(§4.1) */
  maxAttempts: 3,
  /** 手動再試行での試行回数の上限。null なら maxAttempts と同じ(§8 / 要確認 C) */
  retryMaxAttempts: null,
  /** 再送と再送のあいだの待機時間(ミリ秒)(§4.1) */
  retryDelayMs: 1000,
  /**
   * 待機時間の伸び方(要確認 E)。
   * 1 なら毎回一定。2 なら 1 回目 delay、2 回目 delay*2 … と指数的に伸びる。
   */
  backoffFactor: 1,
  /** 待機時間の上限(ミリ秒)。backoffFactor > 1 のときの暴走止め */
  maxRetryDelayMs: 30000,
};

/** 項目から識別値を取り出す既定の方法(§2.1) */
function defaultGetId(item) {
  return item == null ? undefined : item.id;
}

/** 既定の待機手段。テスト・実演では options.sleep で差し替えられる */
function defaultSleep(ms) {
  if (!(ms > 0)) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 既定値 + 呼び出し側の指定 を 1 つの設定に畳む。
 * @param {object} [options]
 * @param {boolean} [isManualRetry] 手動再試行なら retryMaxAttempts を採用する
 */
function resolveConfig(options, isManualRetry) {
  const o = options || {};
  const base = {
    maxPerRun: pickPositiveInt(o.maxPerRun, DEFAULTS.maxPerRun, 'maxPerRun'),
    maxAttempts: pickPositiveInt(o.maxAttempts, DEFAULTS.maxAttempts, 'maxAttempts'),
    retryDelayMs: pickNonNegativeNumber(o.retryDelayMs, DEFAULTS.retryDelayMs, 'retryDelayMs'),
    backoffFactor: pickNonNegativeNumber(o.backoffFactor, DEFAULTS.backoffFactor, 'backoffFactor'),
    maxRetryDelayMs: pickNonNegativeNumber(o.maxRetryDelayMs, DEFAULTS.maxRetryDelayMs, 'maxRetryDelayMs'),
    getId: typeof o.getId === 'function' ? o.getId : defaultGetId,
    sleep: typeof o.sleep === 'function' ? o.sleep : defaultSleep,
  };

  if (isManualRetry) {
    const configured = o.retryMaxAttempts !== undefined ? o.retryMaxAttempts : DEFAULTS.retryMaxAttempts;
    if (configured !== null && configured !== undefined) {
      base.maxAttempts = pickPositiveInt(configured, base.maxAttempts, 'retryMaxAttempts');
    }
  }
  return base;
}

function pickPositiveInt(value, fallback, name) {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 1) {
    throw new TypeError(`${name} は 1 以上の数値でなければならない: ${String(value)}`);
  }
  return Math.floor(value);
}

function pickNonNegativeNumber(value, fallback, name) {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new TypeError(`${name} は 0 以上の数値でなければならない: ${String(value)}`);
  }
  return value;
}

module.exports = { DEFAULTS, defaultGetId, defaultSleep, resolveConfig };
