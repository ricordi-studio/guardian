'use strict';

/**
 * 送信手段が返した「生の結果」を、本道具が扱う 3 種類のどれかに翻訳する。
 *
 * 仕様 §2.2:
 *   - 一時的か恒久的かの判定は【送信手段が下す】。中身を見て推測しない。
 *   - 解釈できない形は【成功と見なしてはならない】。一時的な失敗として扱う。
 */

const SUCCESS = 'success';
const TEMPORARY = 'temporary';
const PERMANENT = 'permanent';

/** 送信手段が返してよい結果を組み立てる補助(呼び出し側の便宜のため公開する)。 */
const outcomes = {
  success: (detail) => ({ status: SUCCESS, detail }),
  temporary: (reason) => ({ status: TEMPORARY, retryable: true, reason: String(reason) }),
  permanent: (reason) => ({ status: PERMANENT, retryable: false, reason: String(reason) }),
};

/**
 * 生の結果 → { kind, reason }
 * kind は 'success' | 'temporary' | 'permanent'。
 */
function classify(raw) {
  // 値が無い、オブジェクトでない → 解釈できない。成功にはしない。
  if (raw === null || raw === undefined || typeof raw !== 'object') {
    return unreadable(raw);
  }

  const status = typeof raw.status === 'string' ? raw.status.toLowerCase() : null;

  if (status === SUCCESS || status === 'ok' || status === 'sent' || status === 'delivered') {
    return { kind: SUCCESS, reason: null };
  }
  if (status === TEMPORARY || status === 'retryable' || status === 'transient') {
    return { kind: TEMPORARY, reason: reasonOf(raw, '送信手段が一時的な失敗を報告した(理由の記載なし)') };
  }
  if (status === PERMANENT || status === 'fatal' || status === 'rejected') {
    return { kind: PERMANENT, reason: reasonOf(raw, '送信手段が恒久的な失敗を報告した(理由の記載なし)') };
  }

  // status が無い場合は ok / retryable の組み合わせで読む。
  if (typeof raw.ok === 'boolean') {
    if (raw.ok === true) return { kind: SUCCESS, reason: null };
    if (typeof raw.retryable === 'boolean') {
      return {
        kind: raw.retryable ? TEMPORARY : PERMANENT,
        reason: reasonOf(raw, '送信手段が失敗を報告した(理由の記載なし)'),
      };
    }
    // 失敗とは分かるが、再試行してよいかを送信手段が告げていない。
    // 推測せず、成功にもしない → 一時的として扱う。
    return {
      kind: TEMPORARY,
      reason: reasonOf(
        raw,
        '送信手段が失敗を報告したが、再試行の可否を示さなかった(一時的として扱った)'
      ),
    };
  }

  return unreadable(raw);
}

/** 例外を一時的な失敗に翻訳する(§4.3)。 */
function fromThrown(err) {
  return { kind: TEMPORARY, reason: `送信手段が例外を投げた: ${describeError(err)}` };
}

function unreadable(raw) {
  return {
    kind: TEMPORARY,
    reason: `送信手段が解釈できない結果を返した: ${brief(raw)}(成功と見なさず一時的な失敗として扱った)`,
  };
}

function reasonOf(raw, fallback) {
  const r = raw.reason != null ? raw.reason : raw.message;
  const s = r == null ? '' : String(r).trim();
  return s.length > 0 ? s : fallback;
}

function describeError(err) {
  if (err instanceof Error) {
    const name = err.name || 'Error';
    const msg = err.message || '(メッセージ無し)';
    return `${name}: ${msg}`;
  }
  return brief(err);
}

function brief(value) {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  try {
    const s = JSON.stringify(value);
    if (s === undefined) return String(value);
    return s.length > 200 ? `${s.slice(0, 200)}…` : s;
  } catch (e) {
    return String(value);
  }
}

module.exports = {
  SUCCESS,
  TEMPORARY,
  PERMANENT,
  outcomes,
  classify,
  fromThrown,
  describeError,
};
