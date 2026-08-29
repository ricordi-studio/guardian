'use strict';

/**
 * 送信手段が返した「1 件の送信結果」を、本道具が扱う 3 種のいずれかに翻訳する(§2.2)。
 *
 * 送信手段の契約(呼び出し側が守るべき形):
 *   成功        : { ok: true }
 *   一時的な失敗: { ok: false, retryable: true,  reason: '人が読める理由' }
 *   恒久的な失敗: { ok: false, retryable: false, reason: '人が読める理由' }
 *
 * どれとも解釈できない形は、決して成功と見なさず一時的な失敗として扱う(§2.2 末尾)。
 * 一時的か恒久的かの判定は送信手段が下すものであり、
 * 本道具は reason の中身を読んで推測してはならない。
 */

const SUCCESS = 'success';
const TEMPORARY = 'temporary';
const PERMANENT = 'permanent';

function classify(raw) {
  if (raw === null || typeof raw !== 'object') {
    return uninterpretable(`送信手段が解釈できない結果を返した (${describeValue(raw)})`);
  }

  if (raw.ok === true) {
    return { kind: SUCCESS, reason: null };
  }

  if (raw.ok === false) {
    const reason = readReason(raw);
    if (raw.retryable === false) {
      return { kind: PERMANENT, reason };
    }
    if (raw.retryable === true) {
      return { kind: TEMPORARY, reason };
    }
    // 失敗だが再試行可否が示されていない → 恒久的と決めつけず、一時的として扱う。
    return {
      kind: TEMPORARY,
      reason: `${reason} (送信手段が retryable を示さなかったため一時的な失敗として扱った)`,
    };
  }

  return uninterpretable(`送信手段が解釈できない結果を返した (${describeValue(raw)})`);
}

function readReason(raw) {
  const candidate = raw.reason;
  if (typeof candidate === 'string' && candidate.trim() !== '') return candidate;
  if (candidate instanceof Error) return describeError(candidate);
  if (candidate !== undefined && candidate !== null) return String(candidate);
  return '送信手段が失敗理由を示さなかった';
}

function uninterpretable(reason) {
  return { kind: TEMPORARY, reason };
}

/** 例外は一律で一時的な失敗として扱う(§4.3)。内容は失敗理由として保持する。 */
function fromThrown(err) {
  return { kind: TEMPORARY, reason: `送信手段が例外を投げた: ${describeError(err)}` };
}

function describeError(err) {
  if (err instanceof Error) {
    return err.message && err.message.trim() !== '' ? `${err.name}: ${err.message}` : err.name;
  }
  return describeValue(err);
}

function describeValue(value) {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (typeof value === 'string') return `文字列 "${value}"`;
  if (typeof value === 'object') {
    try {
      return `object ${JSON.stringify(value)}`;
    } catch (_) {
      return 'object (直列化不能)';
    }
  }
  return `${typeof value} ${String(value)}`;
}

module.exports = { SUCCESS, TEMPORARY, PERMANENT, classify, fromThrown, describeError };
