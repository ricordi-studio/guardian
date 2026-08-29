'use strict';

/**
 * 調整値。仕様 §9「調整値は値として外から見え、変更できる」に対応する。
 * コードに直接埋め込まず、すべてこの表を経由させる。
 */
const DEFAULTS = Object.freeze({
  /** §3 1 回の実行で決着をつける項目数の上限 */
  batchSize: 10,
  /** §4.1 一時的な失敗に対する「送信手段の呼び出し回数」の上限(初回を含む) */
  maxAttempts: 3,
  /** §4.1 再送と再送のあいだの待機時間(ミリ秒) */
  retryDelayMs: 1000,
});

/** 既定の識別値の取り出し方。呼び出し側が別の形を使うなら options.idOf で差し替える。 */
const defaultIdOf = (item) => (item == null ? undefined : item.id);

/** 既定の待機手段。テストやデモでは options.wait を差し替えて短縮できる。 */
const defaultWait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function positiveInt(value, fallback, name) {
  if (value === undefined || value === null) return fallback;
  if (!Number.isInteger(value) || value < 1) {
    throw new TypeError(`${name} は 1 以上の整数で指定してください (受け取った値: ${String(value)})`);
  }
  return value;
}

function nonNegativeInt(value, fallback, name) {
  if (value === undefined || value === null) return fallback;
  if (!Number.isInteger(value) || value < 0) {
    throw new TypeError(`${name} は 0 以上の整数で指定してください (受け取った値: ${String(value)})`);
  }
  return value;
}

/**
 * 呼び出し側の指定と既定値を混ぜて、1 回の実行で使う設定を固める。
 */
function resolveConfig(options = {}) {
  const idOf = options.idOf === undefined ? defaultIdOf : options.idOf;
  if (typeof idOf !== 'function') {
    throw new TypeError('idOf は関数で指定してください');
  }
  const wait = options.wait === undefined ? defaultWait : options.wait;
  if (typeof wait !== 'function') {
    throw new TypeError('wait は関数で指定してください');
  }
  return Object.freeze({
    batchSize: positiveInt(options.batchSize, DEFAULTS.batchSize, 'batchSize'),
    maxAttempts: positiveInt(options.maxAttempts, DEFAULTS.maxAttempts, 'maxAttempts'),
    retryDelayMs: nonNegativeInt(options.retryDelayMs, DEFAULTS.retryDelayMs, 'retryDelayMs'),
    idOf,
    wait,
  });
}

module.exports = { DEFAULTS, resolveConfig, defaultIdOf, defaultWait };
