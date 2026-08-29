'use strict';

/**
 * 実行をまたいで持ち回る進捗情報(§5)。
 *
 * 外向きの形は「そのまま JSON にできる素のオブジェクト」に固定する。
 * 呼び出し側はこれをファイルなり DB なりに保存し、次回そのまま渡す。
 *
 *   {
 *     version: 1,
 *     cursor: 3,                                  // どこまで決着がついたか(並びの位置)
 *     succeeded: ['a', 'b', 'c'],                 // 成功した識別値の集合
 *     failed: [{ id, reason, kind, attempts }]    // 諦めた識別値と理由の集合
 *   }
 *
 * 集合としての性質(同じ識別値が重複して積み上がらない)は Ledger 側で担保する。
 */

const PROGRESS_VERSION = 1;

/** §5「初期状態は 1 件も処理していないを表す」 */
function createProgress() {
  return { version: PROGRESS_VERSION, cursor: 0, succeeded: [], failed: [] };
}

/**
 * 進捗情報の読み書きを一手に引き受ける台帳。
 * 中では Set / Map を使って重複を防ぎ、外へ出すときに素のオブジェクトへ戻す。
 */
class Ledger {
  constructor(progress) {
    const source = progress == null ? createProgress() : progress;
    if (typeof source !== 'object') {
      throw new TypeError('progress は createProgress() が返した形のオブジェクトでなければならない');
    }

    this.cursor = Number.isInteger(source.cursor) && source.cursor >= 0 ? source.cursor : 0;

    this.succeeded = new Set();
    for (const id of toArray(source.succeeded)) {
      if (id !== undefined && id !== null) this.succeeded.add(id);
    }

    // 挿入順を保つ Map。同じ識別値は 1 件に畳まれる(§5「重複して積み上がらない」)。
    this.failed = new Map();
    for (const entry of toArray(source.failed)) {
      const normalized = normalizeFailure(entry);
      if (normalized) this.failed.set(normalized.id, normalized);
    }
  }

  /** その識別値は既に決着がついているか(成功・諦めのどちらか) */
  isSettled(id) {
    return this.succeeded.has(id) || this.failed.has(id);
  }

  markSucceeded(id) {
    // 諦めた記録が残っていれば取り除いてから成功へ移す(§8)
    this.failed.delete(id);
    this.succeeded.add(id);
  }

  markFailed(id, reason, kind, attempts) {
    // 同じ識別値の記録は上書きする。積み上げない。
    this.succeeded.delete(id);
    this.failed.set(id, { id, reason: String(reason), kind, attempts });
  }

  failures() {
    return Array.from(this.failed.values()).map((f) => Object.assign({}, f));
  }

  /** 保存できる素のオブジェクトへ戻す */
  toProgress() {
    return {
      version: PROGRESS_VERSION,
      cursor: this.cursor,
      succeeded: Array.from(this.succeeded),
      failed: this.failures(),
    };
  }
}

function normalizeFailure(entry) {
  if (entry == null) return null;
  if (typeof entry !== 'object') {
    return { id: entry, reason: '(理由の記録なし)', kind: 'unknown', attempts: 0 };
  }
  if (entry.id === undefined || entry.id === null) return null;
  return {
    id: entry.id,
    reason: entry.reason == null ? '(理由の記録なし)' : String(entry.reason),
    kind: entry.kind || 'unknown',
    attempts: Number.isInteger(entry.attempts) ? entry.attempts : 0,
  };
}

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  if (typeof value[Symbol.iterator] === 'function') return Array.from(value);
  return [];
}

module.exports = { PROGRESS_VERSION, createProgress, Ledger };
