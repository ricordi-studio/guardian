'use strict';

const { resolveConfig, waitFor } = require('./config');
const { createProgress, Ledger } = require('./progress');
const outcome = require('./outcome');

/** 諦めた理由の分類 */
const GAVE_UP_PERMANENT = 'permanent'; // 恒久的な失敗なので即座に諦めた
const GAVE_UP_EXHAUSTED = 'exhausted'; // 一時的な失敗が上限回数まで続いた
const GAVE_UP_MISSING = 'missing'; // 手動再試行時、並びの中に該当項目が見つからなかった

/* ------------------------------------------------------------------ *
 * 1 件の送信(§4)
 * ------------------------------------------------------------------ */

/**
 * 送信手段を 1 回だけ呼ぶ。例外は握って一時的な失敗に翻訳する(§4.3)。
 * ここから外へ例外は出ない。
 */
async function callSender(send, item) {
  try {
    return outcome.classify(await send(item));
  } catch (err) {
    return outcome.fromThrown(err);
  }
}

/**
 * 1 件の項目に決着をつける。成功するか、諦めるまで。
 * 返り値: { ok, kind, reason, attempts }
 *
 * - 恒久的な失敗 → 即座に諦める。待機もしない(§4.2)
 * - 一時的な失敗 → maxAttempts まで、あいだに待機を挟んで再送(§4.1)
 * - 例外 → 一時的な失敗として同じ扱い(§4.3)
 */
async function settleItem(send, item, cfg, maxAttempts) {
  let attempts = 0;
  for (;;) {
    attempts += 1;
    const result = await callSender(send, item);

    if (result.kind === outcome.SUCCESS) {
      return { ok: true, kind: 'success', reason: null, attempts };
    }

    if (result.kind === outcome.PERMANENT) {
      // §4.5: 理由は「実際に起きたこと」。試行回数の話にすり替えない。
      return { ok: false, kind: GAVE_UP_PERMANENT, reason: result.reason, attempts };
    }

    if (attempts >= maxAttempts) {
      return {
        ok: false,
        kind: GAVE_UP_EXHAUSTED,
        reason: `一時的な失敗が ${attempts} 回続いたため諦めた(最後の理由: ${result.reason})`,
        attempts,
      };
    }

    await cfg.sleep(waitFor(attempts, cfg));
  }
}

/* ------------------------------------------------------------------ *
 * 1 回の実行(§3, §5, §6)
 * ------------------------------------------------------------------ */

/**
 * 並びの先頭(進捗の再開位置)から、上限件数まで 1 件ずつ逐次に送る。
 *
 * @param {Array} items    送信対象の順序付きの並び
 * @param {Function} send  1 件を受け取り結果を非同期に返す送信手段
 * @param {Object} progress createProgress() が返した進捗情報(省略時は初期状態)
 * @param {Object} options  調整値の上書き(config.js の DEFAULTS を参照)
 * @returns {Promise<Object>} 実行報告
 */
async function runOnce(items, send, progress, options) {
  const cfg = resolveConfig(options);
  const list = requireItems(items);
  requireSender(send);
  const ids = indexIdentifiers(list, cfg);
  const ledger = new Ledger(progress == null ? createProgress() : progress);

  let attempted = 0;
  let sent = 0;
  const gaveUp = [];

  while (ledger.cursor < list.length && attempted < cfg.batchSize) {
    const position = ledger.cursor;
    const id = ids[position];

    // 既に決着がついている識別値は二重に送らない(§5 の不変条件)。
    // 上限の数にも数えない ── 送信を試みていないため。
    if (ledger.isSettled(id)) {
      ledger.cursor = position + 1;
      continue;
    }

    const settlement = await settleItem(send, list[position], cfg, cfg.maxAttempts);
    attempted += 1;

    if (settlement.ok) {
      ledger.markSucceeded(id);
      sent += 1;
    } else {
      // §4.4: 諦めた項目は記録に残し、実行は次の項目へ進む。
      ledger.markFailed(id, settlement.reason, settlement.kind, settlement.attempts);
      gaveUp.push({ id, reason: settlement.reason, kind: settlement.kind, attempts: settlement.attempts });
    }

    // 成功でも失敗でも決着がついたので再開位置を進める。
    // §5:「失敗した項目があるからといって、その後ろの再開位置が巻き戻ってはならない」
    ledger.cursor = position + 1;
  }

  const nextProgress = ledger.toProgress();
  const remaining = countRemaining(list, ids, ledger);

  return {
    attempted, // 今回決着をつけた件数(上限が数えるもの)
    sent, // §6: 実際に送り届けられた件数
    gaveUpCount: gaveUp.length, // §6: 今回諦めた件数
    gaveUp, // 識別値と理由(今回ぶん)
    failed: ledger.failures(), // 諦めた項目の累計(識別値と理由)
    failedCount: ledger.failed.size,
    remaining, // §6: まだ一度も処理を試みていない件数
    allSettled: remaining === 0, // §7: 全件に決着がついたか
    hasFailures: ledger.failed.size > 0, // §7:「全件処理済み」と「失敗ゼロ」は別
    progress: nextProgress, // 呼び出し側が保存し、次回渡すもの
  };
}

/* ------------------------------------------------------------------ *
 * 諦めた項目の手動再試行(§8)
 * ------------------------------------------------------------------ */

/**
 * 進捗情報に記録された「諦めた項目」だけを、もう一度試す。
 * 通常の実行と同じ失敗規則(§4)に従う。再開位置(cursor)には一切触れない。
 */
async function retryFailed(items, send, progress, options) {
  const cfg = resolveConfig(options);
  const list = requireItems(items);
  requireSender(send);
  const ids = indexIdentifiers(list, cfg);
  const ledger = new Ledger(progress == null ? createProgress() : progress);

  const byId = new Map();
  for (let i = 0; i < list.length; i += 1) byId.set(ids[i], list[i]);

  const targets = ledger.failures(); // 反復中に台帳を書き換えるので控えを取る
  let attempted = 0;
  let succeeded = 0;
  const skipped = [];

  for (const record of targets) {
    // 要確認 D: 恒久的な失敗を対象に含めるかは設定で切り替えられる(既定は含める)。
    if (!cfg.retryPermanentFailures && record.kind === GAVE_UP_PERMANENT) {
      skipped.push({ id: record.id, reason: record.reason, kind: record.kind });
      continue;
    }

    if (!byId.has(record.id)) {
      ledger.markFailed(
        record.id,
        `再試行しようとしたが、渡された並びの中に識別値 ${JSON.stringify(record.id)} の項目が見つからなかった`,
        GAVE_UP_MISSING,
        record.attempts
      );
      skipped.push({ id: record.id, reason: '並びの中に該当項目が無い', kind: GAVE_UP_MISSING });
      continue;
    }

    const settlement = await settleItem(send, byId.get(record.id), cfg, cfg.retryAttempts);
    attempted += 1;

    if (settlement.ok) {
      // §8: 成功したら諦めた集合から取り除き、成功の記録へ移す。
      ledger.markSucceeded(record.id);
      succeeded += 1;
    } else {
      // 依然として失敗 → 更新された理由で残す。
      ledger.markFailed(record.id, settlement.reason, settlement.kind, settlement.attempts);
    }
  }

  const nextProgress = ledger.toProgress();
  const remaining = countRemaining(list, ids, ledger);

  return {
    attempted, // §8: 試した件数
    succeeded, // §8: 成功した件数
    skipped, // 対象から外した項目(理由つき)
    failed: ledger.failures(), // まだ諦めたままの項目
    failedCount: ledger.failed.size,
    remaining,
    allSettled: remaining === 0,
    hasFailures: ledger.failed.size > 0,
    progress: nextProgress,
  };
}

/* ------------------------------------------------------------------ *
 * 状態の問い合わせ(§6, §7)
 * ------------------------------------------------------------------ */

/** 送信を一度も試みていない件数(§6)。諦めた項目は含めない。 */
function remainingCount(items, progress, options) {
  const cfg = resolveConfig(options);
  const list = requireItems(items);
  const ids = indexIdentifiers(list, cfg);
  return countRemaining(list, ids, new Ledger(progress));
}

/** §7: 並びのすべての項目に決着がついたか。諦めた項目の有無は問わない。 */
function isComplete(items, progress, options) {
  return remainingCount(items, progress, options) === 0;
}

/** 進捗情報の要約。「全件処理済み」と「失敗ゼロ」を別々に読めるようにする(§7)。 */
function summarize(items, progress, options) {
  const cfg = resolveConfig(options);
  const list = requireItems(items);
  const ids = indexIdentifiers(list, cfg);
  const ledger = new Ledger(progress);
  const remaining = countRemaining(list, ids, ledger);
  return {
    total: list.length,
    succeededCount: ledger.succeeded.size,
    failedCount: ledger.failed.size,
    failed: ledger.failures(),
    remaining,
    allSettled: remaining === 0,
    hasFailures: ledger.failed.size > 0,
    /** 全件に決着がつき、かつ失敗が無い */
    cleanlyDone: remaining === 0 && ledger.failed.size === 0,
  };
}

/* ------------------------------------------------------------------ *
 * 補助
 * ------------------------------------------------------------------ */

function countRemaining(list, ids, ledger) {
  let n = 0;
  for (let i = ledger.cursor; i < list.length; i += 1) {
    if (!ledger.isSettled(ids[i])) n += 1;
  }
  return n;
}

/**
 * 並びから識別値を取り出し、契約(存在する・一意である)を確かめる。
 *
 * ここでの例外は「送信中に起きた異常」ではなく呼び出し側の契約違反であり、
 * 送信を 1 件も行う前に、決定的に投げる(§9 の「例外を漏らさない」は
 * 処理中の異常の話であって、引数の誤りを黙って飲み込めという意味ではない)。
 */
function indexIdentifiers(list, cfg) {
  const ids = new Array(list.length);
  const seen = new Set();
  for (let i = 0; i < list.length; i += 1) {
    const id = cfg.identify(list[i]);
    if (id === undefined || id === null || id === '') {
      throw new TypeError(`項目 ${i} 番目に識別値が無い(identify が ${String(id)} を返した)`);
    }
    if (seen.has(id)) {
      throw new TypeError(`識別値 ${JSON.stringify(id)} が並びの中で重複している(一意でなければならない)`);
    }
    seen.add(id);
    ids[i] = id;
  }
  return ids;
}

function requireItems(items) {
  if (!Array.isArray(items)) {
    throw new TypeError('items は項目の配列(順序付きの並び)でなければならない');
  }
  return items;
}

function requireSender(send) {
  if (typeof send !== 'function') {
    throw new TypeError('送信手段は関数として注入しなければならない');
  }
}

module.exports = {
  runOnce,
  retryFailed,
  remainingCount,
  isComplete,
  summarize,
  settleItem,
  GAVE_UP_PERMANENT,
  GAVE_UP_EXHAUSTED,
  GAVE_UP_MISSING,
};
