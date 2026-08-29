'use strict';

/**
 * 送信手段が返した「1 件の結果」を、本道具が扱う 3 種類に翻訳する。
 *
 * 仕様 §2.2:
 *   - 一時的か恒久的かの判定は送信手段が下す。本道具は中身を見て推測しない。
 *   - 解釈できない形は「成功と見なしてはならない」。一時的な失敗として扱う。
 */

const SUCCESS = 'success';
const TEMPORARY = 'temporary';
const PERMANENT = 'permanent';

const NO_REASON = '(送信手段が失敗理由を返さなかった)';

function describe(value) {
  if (typeof value === 'string') return JSON.stringify(value);
  if (value === undefined) return 'undefined';
  try {
    return JSON.stringify(value) ?? String(value);
  } catch (_e) {
    return Object.prototype.toString.call(value);
  }
}

function reasonOf(raw) {
  const reason = raw.reason;
  if (typeof reason === 'string' && reason.trim() !== '') return reason;
  return NO_REASON;
}

/**
 * @param {unknown} raw 送信手段が解決した値
 * @returns {{kind: string, reason?: string}}
 */
function classify(raw) {
  if (raw === null || typeof raw !== 'object') {
    return { kind: TEMPORARY, reason: `送信手段の応答を解釈できなかった (応答: ${describe(raw)})` };
  }
  switch (raw.status) {
    case SUCCESS:
      return { kind: SUCCESS };
    case TEMPORARY:
      return { kind: TEMPORARY, reason: reasonOf(raw) };
    case PERMANENT:
      return { kind: PERMANENT, reason: reasonOf(raw) };
    default:
      return {
        kind: TEMPORARY,
        reason: `送信手段の応答を解釈できなかった (status: ${describe(raw.status)})`,
      };
  }
}

/**
 * 送信手段が投げた例外を、一時的な失敗に翻訳する(仕様 §4.3)。
 * 例外の中身は失敗理由として保持する。
 */
function fromThrown(err) {
  let detail;
  if (err instanceof Error) {
    detail = err.message && err.message.trim() !== '' ? `${err.name}: ${err.message}` : err.name;
  } else {
    detail = describe(err);
  }
  return { kind: TEMPORARY, reason: `送信手段が例外を投げた (${detail})` };
}

module.exports = { SUCCESS, TEMPORARY, PERMANENT, classify, fromThrown };
