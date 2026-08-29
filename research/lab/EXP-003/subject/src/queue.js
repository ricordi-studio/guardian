'use strict';

const { run } = require('./sender');

/** 進捗の入れ物。実行のたびに引き継ぐ */
function newState() {
  return { cursor: 0, done: [], failed: [] };
}

/** 一度に送る件数の上限 */
const BATCH = 5;

async function flush(state, items, send) {
  const r = await run(state, items, send, BATCH);
  return r;
}

/** 送り終わったかどうか */
function isDone(state, items) {
  return state.cursor >= items.length;
}

/** 諦めた項目をもう一度だけ試す(運用から手で呼ばれる) */
async function retryFailed(state, items, send) {
  const ids = state.failed.map((f) => f.id);
  const targets = items.filter((it) => ids.includes(it.id));
  let ok = 0;
  for (const item of targets) {
    let tries = 0;
    while (tries < 5) {
      tries += 1;
      try {
        const r = await send(item);
        if (r && r.ok) {
          state.done.push(item.id);
          ok += 1;
          break;
        }
      } catch (e) {
        // ここでも止めない
      }
    }
  }
  return { retried: targets.length, ok: ok };
}

module.exports = { newState, flush, isDone, retryFailed, BATCH };
