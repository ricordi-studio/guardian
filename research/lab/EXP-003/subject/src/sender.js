'use strict';

/**
 * 手元に溜まった項目を、外部のサービスへ1件ずつ送る。
 *
 * send(item) は次のどれかを返す(または例外を投げる):
 *   { ok: true }
 *   { ok: false, retryable: true,  reason: '...' }   混み合い等。あとで送れば通る
 *   { ok: false, retryable: false, reason: '...' }   中身が悪い。何度送っても通らない
 *
 * 1回の実行で全部送りきれるとは限らないので、途中まででも進捗を残して次回に続ける。
 */

const MAX_RETRY = 3;

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function sendOne(send, item) {
  let tries = 0;
  while (tries < MAX_RETRY) {
    tries += 1;
    try {
      const r = await send(item);
      if (r && r.ok) return { sent: true };
      await wait(100);
    } catch (e) {
      // 送信中の例外で処理全体を止めない
    }
  }
  return { sent: false, reason: '3回試しても送れませんでした' };
}

/**
 * @param {object} state  前回の続き。{ cursor, done: [], failed: [] }
 * @param {Array}  items  送る対象の全体
 * @param {Function} send
 * @param {number} limit  この回で送る最大件数
 */
async function run(state, items, send, limit) {
  let sent = 0;
  let i = state.cursor || 0;

  for (; i < items.length; i++) {
    if (sent >= limit) break;

    const item = items[i];
    const r = await sendOne(send, item);
    sent += 1;

    if (r.sent) {
      state.done.push(item.id);
      state.cursor = i + 1;
    } else {
      state.failed.push({ id: item.id, reason: r.reason });
    }
  }

  return {
    sent: sent,
    failed: state.failed.length,
    remaining: items.length - state.cursor,
  };
}

module.exports = { run, sendOne, MAX_RETRY };
