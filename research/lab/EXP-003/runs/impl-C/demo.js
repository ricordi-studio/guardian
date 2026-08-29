'use strict';

/**
 * 代役の送信手段を使って、仕様の要件を実際に流して確かめる。
 *
 *   node demo.js
 *
 * 成功・一時的失敗・恒久的失敗・例外・解釈できない結果が混ざった並びを流し、
 * 上限での中断と再開、二重送信の不在、理由の正しさ、手動再試行を検査する。
 */

const assert = require('assert');
const queue = require('./index');

/* ------------------------------------------------------------------ *
 * 代役の送信手段
 * ------------------------------------------------------------------ */

/**
 * 台本に従って結果を返す代役。
 * 台本は 識別値 → 結果の並び(呼ばれた回数ぶん順に消費、尽きたら最後を繰り返す)。
 *
 * 'ok'        → 成功
 * 'temp'      → 一時的な失敗
 * 'perm'      → 恒久的な失敗
 * 'throw'     → 例外を投げる
 * 'garbage'   → 解釈できない値(undefined)を返す
 */
function makeSender(script) {
  const calls = [];
  const send = async (item) => {
    calls.push(item.id);
    const steps = script[item.id] || ['ok'];
    const n = calls.filter((id) => id === item.id).length;
    const step = steps[Math.min(n - 1, steps.length - 1)];

    if (step === 'ok') return queue.outcomes.success();
    if (step === 'temp') return queue.outcomes.temporary('回線が混雑している');
    if (step === 'perm') return queue.outcomes.permanent('本文が空で受理できない');
    if (step === 'throw') throw new Error('接続先が突然切れた');
    if (step === 'garbage') return undefined;
    throw new Error(`台本の指示が不明: ${step}`);
  };
  return { send, calls, countFor: (id) => calls.filter((x) => x === id).length };
}

/** 待機の実体を差し替えて、待った回数と長さを記録する(試験を速く回すため) */
function makeClock() {
  const waits = [];
  return { waits, sleep: async (ms) => { waits.push(ms); } };
}

const items = (...ids) => ids.map((id) => ({ id, body: `${id} の中身` }));

/* ------------------------------------------------------------------ *
 * 検査
 * ------------------------------------------------------------------ */

const checks = [];
const check = (name, fn) => checks.push({ name, fn });

check('混在した並びを流し、上限で中断して次回に続きから再開する', async () => {
  const list = items('a', 'b', 'c', 'd', 'e', 'f');
  const sender = makeSender({
    a: ['ok'],
    b: ['temp', 'temp', 'ok'], // 2 回失敗して 3 回目で成功
    c: ['perm'], // 恒久的 → 即諦め
    d: ['throw', 'throw', 'throw'], // 例外 → 一時的扱い → 上限で諦め
    e: ['ok'],
    f: ['garbage', 'ok'], // 解釈不能 → 成功と見なさない → 再送で成功
  });
  const clock = makeClock();
  const opts = { batchSize: 3, maxAttempts: 3, waitMs: 100, sleep: clock.sleep };

  // --- 1 回目
  let progress = queue.createProgress();
  const first = await queue.runOnce(list, sender.send, progress, opts);

  assert.strictEqual(first.attempted, 3, '上限は「決着がついた件数」を数える (a, b, c)');
  assert.strictEqual(first.sent, 2, '成功は a と b');
  assert.strictEqual(first.gaveUpCount, 1, '諦めたのは c');
  assert.strictEqual(first.remaining, 3, '残りは d, e, f。諦めた c は残りに数えない');
  assert.strictEqual(first.allSettled, false);
  assert.strictEqual(first.hasFailures, true);
  assert.strictEqual(sender.countFor('c'), 1, '恒久的な失敗は再試行しない');
  assert.strictEqual(sender.countFor('b'), 3, '一時的な失敗は上限まで再送する');
  assert.deepStrictEqual(clock.waits, [100, 100], '再送のあいだに待機を置く。恒久的失敗では待たない');

  // --- 2 回目(進捗を渡して続きから)
  progress = first.progress;
  const second = await queue.runOnce(list, sender.send, progress, opts);

  assert.strictEqual(second.attempted, 3, '残りの d, e, f を処理');
  assert.strictEqual(second.sent, 2, 'e と f が成功');
  assert.strictEqual(second.gaveUpCount, 1, 'd は例外続きで諦め');
  assert.strictEqual(second.remaining, 0);
  assert.strictEqual(second.allSettled, true, '§7: 全項目に決着がついた');
  assert.strictEqual(second.hasFailures, true, '§7: ただし失敗ゼロではない');

  // 二重送信が無いこと(§5 の不変条件)
  assert.strictEqual(sender.countFor('a'), 1);
  assert.strictEqual(sender.countFor('e'), 1);
  assert.strictEqual(sender.countFor('c'), 1, '失敗した c は 2 回目の実行で拾い直されない');

  // 飛ばした項目が無いこと
  const touched = new Set(sender.calls);
  for (const it of list) assert.ok(touched.has(it.id), `${it.id} が処理されていない`);

  // 進捗の中身
  assert.deepStrictEqual(second.progress.succeeded.sort(), ['a', 'b', 'e', 'f']);
  assert.strictEqual(second.progress.cursor, 6);
  assert.strictEqual(second.progress.failed.length, 2);

  return second.progress;
});

check('諦めた理由は、その項目に実際に起きたことを表す (§4.5)', async () => {
  const list = items('perm1', 'temp1');
  const sender = makeSender({ perm1: ['perm'], temp1: ['temp'] });
  const clock = makeClock();
  const report = await queue.runOnce(list, sender.send, null, {
    batchSize: 10, maxAttempts: 3, waitMs: 1, sleep: clock.sleep,
  });

  const perm = report.failed.find((f) => f.id === 'perm1');
  const temp = report.failed.find((f) => f.id === 'temp1');

  assert.strictEqual(perm.kind, queue.GAVE_UP_PERMANENT);
  assert.strictEqual(perm.attempts, 1, '恒久的失敗は 1 回で諦める');
  assert.ok(perm.reason.includes('本文が空で受理できない'), '送信手段の理由がそのまま根拠になる');
  assert.ok(!/回続いた/.test(perm.reason), '恒久的失敗に「規定回数試した」と嘘の理由を付けない');

  assert.strictEqual(temp.kind, queue.GAVE_UP_EXHAUSTED);
  assert.strictEqual(temp.attempts, 3);
  assert.ok(temp.reason.includes('3 回続いた'));
  assert.ok(temp.reason.includes('回線が混雑している'), '最後の理由が残る');
});

check('例外は一時的な失敗として扱い、実行全体を止めない (§4.3, §9)', async () => {
  const list = items('x', 'boom', 'y');
  const sender = makeSender({ x: ['ok'], boom: ['throw'], y: ['ok'] });
  const report = await queue.runOnce(list, sender.send, null, {
    batchSize: 10, maxAttempts: 2, waitMs: 1, sleep: makeClock().sleep,
  });

  assert.strictEqual(report.sent, 2, '例外の前後の項目は送れている');
  assert.strictEqual(sender.countFor('boom'), 2, '例外も再送の対象');
  const f = report.failed.find((r) => r.id === 'boom');
  assert.ok(f.reason.includes('例外を投げた'), '例外であることが理由に残る');
  assert.ok(f.reason.includes('接続先が突然切れた'), '例外の内容が理由の根拠になる');
});

check('解釈できない結果を成功と見なさない (§2.2)', async () => {
  const list = items('weird');
  const sender = makeSender({ weird: ['garbage'] });
  const report = await queue.runOnce(list, sender.send, null, {
    batchSize: 10, maxAttempts: 2, waitMs: 1, sleep: makeClock().sleep,
  });
  assert.strictEqual(report.sent, 0);
  assert.strictEqual(report.failedCount, 1);
  assert.ok(report.failed[0].reason.includes('解釈できない結果'));
});

check('手動再試行は諦めた項目だけに触れ、成功を成功の記録へ移す (§8)', async () => {
  const list = items('a', 'b', 'c', 'd');
  // 1 回目: b は一時的失敗で諦め、c は恒久的失敗で諦める
  const first = makeSender({ a: ['ok'], b: ['temp', 'temp'], c: ['perm'], d: ['ok'] });
  const run = await queue.runOnce(list, first.send, null, {
    batchSize: 10, maxAttempts: 2, waitMs: 1, sleep: makeClock().sleep,
  });
  assert.strictEqual(run.failedCount, 2);
  assert.strictEqual(run.remaining, 0, '諦めた項目は残りに数えない (§6)');
  assert.strictEqual(run.allSettled, true);

  const cursorBefore = run.progress.cursor;

  // 2 回目: 手を替えて再試行。b は通るが c は依然として恒久的失敗。
  const second = makeSender({ b: ['temp', 'ok'], c: ['perm'] });
  const clock = makeClock();
  const retry = await queue.retryFailed(list, second.send, run.progress, {
    maxAttempts: 3, waitMs: 50, sleep: clock.sleep,
  });

  assert.strictEqual(retry.attempted, 2, '試したのは諦めた 2 件だけ');
  assert.strictEqual(retry.succeeded, 1, '成功したのは b');
  assert.deepStrictEqual(second.calls.sort(), ['b', 'b', 'c'], '成功済みの a, d には触れない');
  assert.strictEqual(retry.progress.cursor, cursorBefore, '再開位置は動かない');
  assert.ok(retry.progress.succeeded.includes('b'), 'b は成功の記録へ移った');
  assert.strictEqual(retry.failed.length, 1, '残るのは c だけ');
  assert.strictEqual(retry.failed[0].id, 'c');
  assert.ok(!retry.progress.succeeded.includes('c'));
  assert.strictEqual(retry.hasFailures, true);
  assert.strictEqual(retry.allSettled, true);
  assert.deepStrictEqual(clock.waits, [50], '再試行でも待機を挟む。恒久的失敗では待たない');

  // 記録が重複して積み上がらないこと (§5)
  const ids = retry.progress.succeeded;
  assert.strictEqual(new Set(ids).size, ids.length);
});

check('恒久的失敗を手動再試行から外す設定が効く (要確認 D)', async () => {
  const list = items('p', 'q');
  const first = makeSender({ p: ['perm'], q: ['temp', 'temp'] });
  const run = await queue.runOnce(list, first.send, null, {
    batchSize: 10, maxAttempts: 2, waitMs: 1, sleep: makeClock().sleep,
  });

  const second = makeSender({ p: ['ok'], q: ['ok'] });
  const retry = await queue.retryFailed(list, second.send, run.progress, {
    waitMs: 1, sleep: makeClock().sleep, retryPermanentFailures: false,
  });

  assert.strictEqual(retry.attempted, 1, 'q だけ試す');
  assert.deepStrictEqual(second.calls, ['q'], 'p は呼ばない');
  assert.strictEqual(retry.skipped.length, 1);
  assert.strictEqual(retry.skipped[0].id, 'p');
  assert.strictEqual(retry.failedCount, 1, 'p は諦めたまま残る');
});

check('待機時間の形を指数的後退に変えられる (要確認 E)', async () => {
  const list = items('slow');
  const sender = makeSender({ slow: ['temp', 'temp', 'temp', 'ok'] });
  const clock = makeClock();
  await queue.runOnce(list, sender.send, null, {
    batchSize: 1, maxAttempts: 4, waitMs: 100, backoffFactor: 2, maxWaitMs: 300, sleep: clock.sleep,
  });
  assert.deepStrictEqual(clock.waits, [100, 200, 300], '上限で頭打ちになる');
});

check('調整値は外から見えて変更できる (§9)', async () => {
  assert.strictEqual(typeof queue.DEFAULTS.batchSize, 'number');
  assert.strictEqual(typeof queue.DEFAULTS.maxAttempts, 'number');
  assert.strictEqual(typeof queue.DEFAULTS.waitMs, 'number');

  const original = queue.DEFAULTS.batchSize;
  queue.DEFAULTS.batchSize = 1;
  try {
    const list = items('a', 'b');
    const sender = makeSender({});
    const report = await queue.runOnce(list, sender.send, null, { sleep: makeClock().sleep });
    assert.strictEqual(report.attempted, 1, '既定値の変更が実行に効く');
  } finally {
    queue.DEFAULTS.batchSize = original;
  }
});

check('送信手段は 1 件ずつ逐次に呼ばれる (§9)', async () => {
  const list = items('a', 'b', 'c');
  let inFlight = 0;
  let maxInFlight = 0;
  const send = async (item) => {
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((r) => setImmediate(r));
    inFlight -= 1;
    return queue.outcomes.success(item.id);
  };
  await queue.runOnce(list, send, null, { batchSize: 10 });
  assert.strictEqual(maxInFlight, 1, '同時並行で叩かない');
});

check('状態の問い合わせが仕様どおりに答える (§6, §7)', async () => {
  const list = items('a', 'b', 'c');
  const sender = makeSender({ a: ['ok'], b: ['perm'], c: ['ok'] });

  let progress = queue.createProgress();
  assert.strictEqual(queue.remainingCount(list, progress), 3);
  assert.strictEqual(queue.isComplete(list, progress), false);

  progress = (await queue.runOnce(list, sender.send, progress, {
    batchSize: 2, waitMs: 1, sleep: makeClock().sleep,
  })).progress;
  assert.strictEqual(queue.remainingCount(list, progress), 1, 'c だけ未処理。諦めた b は含めない');

  progress = (await queue.runOnce(list, sender.send, progress, {
    batchSize: 2, waitMs: 1, sleep: makeClock().sleep,
  })).progress;

  const s = queue.summarize(list, progress);
  assert.strictEqual(s.total, 3);
  assert.strictEqual(s.succeededCount, 2);
  assert.strictEqual(s.failedCount, 1);
  assert.strictEqual(s.remaining, 0);
  assert.strictEqual(s.allSettled, true, '全件処理済み');
  assert.strictEqual(s.hasFailures, true);
  assert.strictEqual(s.cleanlyDone, false, '「全件処理済み」と「失敗ゼロ」は別');
});

check('進捗情報はそのまま保存して復元できる', async () => {
  const list = items('a', 'b', 'c', 'd');
  const sender = makeSender({ b: ['perm'] });
  const first = await queue.runOnce(list, sender.send, null, {
    batchSize: 2, waitMs: 1, sleep: makeClock().sleep,
  });

  // JSON を往復させても同じ状態から続けられる
  const revived = JSON.parse(JSON.stringify(first.progress));
  const second = await queue.runOnce(list, sender.send, revived, {
    batchSize: 10, waitMs: 1, sleep: makeClock().sleep,
  });

  assert.strictEqual(second.sent, 2, 'c と d');
  assert.strictEqual(second.remaining, 0);
  assert.strictEqual(sender.countFor('a'), 1, '復元しても二重送信しない');
  assert.strictEqual(sender.countFor('b'), 1);
});

check('既定の待機(本物の時計)でも動く', async () => {
  const list = items('a', 'b');
  const sender = makeSender({ a: ['temp', 'ok'], b: ['ok'] });
  const started = Date.now();
  const report = await queue.runOnce(list, sender.send, null, {
    batchSize: 10, maxAttempts: 2, waitMs: 30, // sleep は差し替えない
  });
  assert.strictEqual(report.sent, 2);
  assert.ok(Date.now() - started >= 25, '再送の前に実際に待っている');
});

/* ------------------------------------------------------------------ *
 * 実行
 * ------------------------------------------------------------------ */

(async () => {
  let failures = 0;
  for (const { name, fn } of checks) {
    try {
      await fn();
      console.log(`  OK   ${name}`);
    } catch (err) {
      failures += 1;
      console.log(`  NG   ${name}`);
      console.log(`       ${err && err.message}`);
    }
  }
  console.log('');
  console.log(failures === 0 ? `全 ${checks.length} 件 通過` : `${failures} / ${checks.length} 件 失敗`);
  process.exitCode = failures === 0 ? 0 : 1;
})();
