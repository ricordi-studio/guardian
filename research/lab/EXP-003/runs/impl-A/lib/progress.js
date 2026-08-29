'use strict';

/**
 * 実行をまたいで持ち回る進捗情報(仕様 §5)。
 *
 * 形は素の JSON:
 *   {
 *     version: 1,
 *     cursor:  number,                 // 「ここまで決着がついた」= 次に処理する並びの位置
 *     sent:    string[],               // 成功した項目の識別値(重複なし)
 *     failed:  {id, reason}[]          // 諦めた項目の識別値と理由(識別値ごとに 1 件)
 *   }
 *
 * そのまま JSON.stringify して保存でき、読み戻してそのまま次回に渡せる。
 */

const PROGRESS_VERSION = 1;

/** 初期状態 =「1 件も処理していない」 */
function createProgress() {
  return { version: PROGRESS_VERSION, cursor: 0, sent: [], failed: [] };
}

/** 進捗情報として使える形か検査し、足りない場所を埋める(壊れていれば投げる)。 */
function assertProgress(progress) {
  if (progress === null || typeof progress !== 'object') {
    throw new TypeError('progress は createProgress() が返す形のオブジェクトで渡してください');
  }
  if (!Number.isInteger(progress.cursor) || progress.cursor < 0) {
    throw new TypeError(`progress.cursor が壊れています (${String(progress.cursor)})`);
  }
  if (!Array.isArray(progress.sent)) throw new TypeError('progress.sent が配列ではありません');
  if (!Array.isArray(progress.failed)) throw new TypeError('progress.failed が配列ではありません');
  if (progress.version === undefined) progress.version = PROGRESS_VERSION;
  return progress;
}

const keyOf = (id) => `${typeof id}:${String(id)}`;

/**
 * 進捗情報への読み書きをまとめた作業用の覆い。
 * 中の配列は渡された progress そのものを指すので、更新は呼び出し側の手元にも即座に反映される。
 */
class ProgressBook {
  constructor(progress) {
    this.progress = assertProgress(progress);
    this.sentKeys = new Set(progress.sent.map(keyOf));
    this.failedIndex = new Map();
    progress.failed.forEach((entry, i) => this.failedIndex.set(keyOf(entry.id), i));
  }

  get cursor() {
    return this.progress.cursor;
  }

  advanceCursorTo(index) {
    if (index > this.progress.cursor) this.progress.cursor = index;
  }

  /** 一度決着がついた項目か(成功・恒久的失敗・再送上限到達のいずれか) */
  isSettled(id) {
    const k = keyOf(id);
    return this.sentKeys.has(k) || this.failedIndex.has(k);
  }

  hasFailure(id) {
    return this.failedIndex.has(keyOf(id));
  }

  /** 成功として記録する。同じ識別値が二重に積み上がらない。失敗の記録があれば取り除く。 */
  recordSent(id) {
    const k = keyOf(id);
    this.#dropFailure(k);
    if (!this.sentKeys.has(k)) {
      this.sentKeys.add(k);
      this.progress.sent.push(id);
    }
  }

  /** 諦めた項目として記録する。同じ識別値なら理由を上書きし、行は増やさない。 */
  recordFailure(id, reason) {
    const k = keyOf(id);
    const at = this.failedIndex.get(k);
    if (at === undefined) {
      this.failedIndex.set(k, this.progress.failed.length);
      this.progress.failed.push({ id, reason });
    } else {
      this.progress.failed[at].reason = reason;
    }
  }

  /** 諦めた項目の一覧(処理中に配列が動いても平気なように複製を返す) */
  listFailures() {
    return this.progress.failed.map((entry) => ({ id: entry.id, reason: entry.reason }));
  }

  #dropFailure(k) {
    const at = this.failedIndex.get(k);
    if (at === undefined) return;
    this.progress.failed.splice(at, 1);
    this.failedIndex.clear();
    this.progress.failed.forEach((entry, i) => this.failedIndex.set(keyOf(entry.id), i));
  }
}

module.exports = { PROGRESS_VERSION, createProgress, assertProgress, ProgressBook };
