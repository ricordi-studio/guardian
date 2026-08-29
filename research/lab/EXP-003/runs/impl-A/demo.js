'use strict';

/**
 * 動作確認。代役の送信手段を作り、成功・一時的失敗・恒久的失敗・例外・
 * 解釈できない応答が混ざった並びを流して、仕様の要件を実際に確かめる。
 *
 *   node demo.js
 */

const q = require('./index');

// ---------------------------------------------------------------- 検査の道具

let failures = 0;
function check(label, condition, detail) {
  if (condition) {
    console.log(`  [OK]  ${label}`);
  } else {
    failures += 1;
    console.log(`  [NG]  ${label}${detail === undefined ? '' : ` — ${detail}`}`);
  }
}
function eq(label, actual, expected) {
  check(label, Object.is(actual, expected), `期待 ${JSON.stringify(expected)} / 実際 ${JSON.stringify(actual)}`);
}

// ------------------------------------------------------------ 代役の送信手段

/**
 * 挙動表から代役の送信手段を作る。
 * 何度呼ばれたか・同時に呼ばれていないかも記録する。
 */
function makeFakeSender(behaviors) {
  const calls = new Map(); // id -> 呼ばれた回数
  const order = [];        // 呼ばれた順の id
  let inFlight = 0;
  let maxInFlight = 0;

  const send = async (item) => {
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    const n = (calls.get(item.id) || 0) + 1;
    calls.set(item.id, n);
    order.push(item.id);
    try {
      await new Promise((r) => setImmediate(r)); // 非同期であることを模す
      const behave = behaviors[item.id];
      if (!behave) throw new Error(`挙動が定義されていない項目: ${item.id}`);
      return behave(n, item);
    } finally {
      inFlight -= 1;
    }
  };

  return { send, calls, order, stats: () => ({ maxInFlight }) };
}

// ---------------------------------------------------------------- 並びと挙動

const items = [
  { id: 'ok-1', body: 'あ' },
  { id: 'flaky-2', body: 'い' },
  { id: 'bad-3', body: 'う' },
  { id: 'boom-4', body: 'え' },
  { id: 'ok-5', body: 'お' },
  { id: 'weird-6', body: 'か' },
  { id: 'dead-7', body: 'き' },
  { id: 'ok-8', body: 'く' },
  { id: 'ok-9', body: 'け' },
  { id: 'late-10', body: 'こ' },
  { id: 'bad-11', body: 'さ' },
  { id: 'ok-12', body: 'し' },
];

// 手動再試行のときだけ通るようにする外部事情のつまみ
let outageOver = false;

const behaviors = {
  'ok-1': () => q.results.success(),
  'flaky-2': (n) => (n < 3 ? q.results.temporary('混雑している') : q.results.success()),
  'bad-3': () => q.results.permanent('宛先の書式が不正'),
  'boom-4': () => {
    throw new Error('接続が切れた');
  },
  'ok-5': () => q.results.success(),
  'weird-6': () => undefined, // 解釈できない応答
  'dead-7': () => q.results.temporary('上流が応答しない'),
  'ok-8': () => q.results.success(),
  'ok-9': () => q.results.success(),
  'late-10': () => (outageOver ? q.results.success() : q.results.temporary('一時的に停止中')),
  'bad-11': () => q.results.permanent('本文が空'),
  'ok-12': () => q.results.success(),
};

// ---------------------------------------------------------------------- 本編

async function main() {
  const fake = makeFakeSender(behaviors);
  const waited = [];
  const options = {
    batchSize: 5,
    maxAttempts: 3,
    retryDelayMs: 5,
    wait: async (ms) => {
      waited.push(ms);
    }, // 待機を記録しつつ短縮
  };

  const progress = q.createProgress();
  console.log('--- 初期状態 ---');
  eq('cursor は 0', progress.cursor, 0);
  eq('成功 0 件', progress.sent.length, 0);
  eq('失敗 0 件', progress.failed.length, 0);
  check('未完了である', !q.isComplete(items, progress));

  // ===== 1 回目 =====
  console.log('\n--- 1 回目の実行 (先頭 5 件) ---');
  const r1 = await q.runBatch(items, fake.send, { ...options, progress });
  console.log(`  sent=${r1.sent} abandoned=${r1.abandoned} remaining=${r1.remaining} complete=${r1.complete}`);
  eq('上限どおり 5 件に決着', r1.processed, 5);
  eq('成功 3 件 (ok-1 / flaky-2 / ok-5)', r1.sent, 3);
  eq('諦め 2 件 (bad-3 / boom-4)', r1.abandoned, 2);
  eq('残り 7 件', r1.remaining, 7);
  check('未完了', !r1.complete);
  eq('flaky-2 は 3 回呼ばれた', fake.calls.get('flaky-2'), 3);
  eq('恒久的失敗 bad-3 は 1 回だけ呼ばれた', fake.calls.get('bad-3'), 1);
  eq('例外を投げる boom-4 は上限まで呼ばれた', fake.calls.get('boom-4'), 3);

  const bad3 = r1.failures.find((f) => f.id === 'bad-3');
  check('bad-3 の理由は送信手段の言葉そのもの', bad3.reason === '宛先の書式が不正', bad3.reason);
  check('bad-3 の理由に回数の話が混ざっていない', !/回/.test(bad3.reason), bad3.reason);
  const boom4 = r1.failures.find((f) => f.id === 'boom-4');
  check('boom-4 の理由に例外の中身が入っている', /接続が切れた/.test(boom4.reason), boom4.reason);
  check('進捗は渡した progress に反映されている', progress.cursor === 5 && progress.failed.length === 2);
  eq('待機は 再送のあいだにだけ入った', waited.length, 2 /* flaky-2 */ + 2 /* boom-4 */);
  check('待機時間は設定値', waited.every((ms) => ms === 5));

  // ===== 2 回目 =====
  console.log('\n--- 2 回目の実行 (続きから 5 件) ---');
  const r2 = await q.runBatch(items, fake.send, { ...options, progress: r1.progress });
  console.log(`  sent=${r2.sent} abandoned=${r2.abandoned} remaining=${r2.remaining} complete=${r2.complete}`);
  check('1 回目に決着した項目は再送されていない', fake.calls.get('ok-1') === 1 && fake.calls.get('bad-3') === 1);
  eq('成功 2 件 (ok-8 / ok-9)', r2.sent, 2);
  eq('諦め 3 件 (weird-6 / dead-7 / late-10)', r2.abandoned, 3);
  eq('残り 2 件', r2.remaining, 2);
  const weird6 = r2.failures.find((f) => f.id === 'weird-6');
  check('解釈できない応答は成功扱いされていない', weird6 !== undefined);
  check('weird-6 の理由が「解釈できなかった」旨', /解釈できなかった/.test(weird6.reason), weird6.reason);
  eq('失敗があっても再開位置は巻き戻らない', progress.cursor, 10);

  // ===== 3 回目 =====
  console.log('\n--- 3 回目の実行 (残り 2 件) ---');
  const r3 = await q.runBatch(items, fake.send, { ...options, progress: r2.progress });
  console.log(`  sent=${r3.sent} abandoned=${r3.abandoned} remaining=${r3.remaining} complete=${r3.complete}`);
  eq('成功 1 件 (ok-12)', r3.sent, 1);
  eq('諦め 1 件 (bad-11)', r3.abandoned, 1);
  eq('残り 0 件', r3.remaining, 0);
  check('全件処理済み', r3.complete);
  check('しかし失敗ゼロではない', !r3.clean);
  check('isComplete も同じ判定', q.isComplete(items, progress));
  check('isCompleteAndClean は偽', !q.isCompleteAndClean(items, progress));

  // ===== 不変条件 =====
  console.log('\n--- 進捗の不変条件 ---');
  const settled = new Set([...progress.sent, ...progress.failed.map((f) => f.id)]);
  eq('全 12 件に決着がついている', settled.size, items.length);
  eq('成功 6 件', progress.sent.length, 6);
  eq('諦め 6 件', progress.failed.length, 6);
  check('成功と失敗が重なっていない', progress.sent.every((id) => !progress.failed.some((f) => f.id === id)));
  check('成功の記録に重複なし', new Set(progress.sent).size === progress.sent.length);
  check('失敗の記録に重複なし', new Set(progress.failed.map((f) => f.id)).size === progress.failed.length);
  check('飛ばされた項目がない', items.every((it) => settled.has(it.id)));
  eq('送信手段は同時に叩かれていない', fake.stats().maxInFlight, 1);
  check(
    '呼び出しは並びの順序どおり',
    (() => {
      const firstSeen = [...new Set(fake.order)];
      const expected = items.map((i) => i.id);
      return firstSeen.every((id, i) => id === expected[i]);
    })()
  );

  console.log('\n--- 4 回目の実行 (もう送るものがない) ---');
  const r4 = await q.runBatch(items, fake.send, { ...options, progress });
  eq('何も送らない', r4.sent, 0);
  eq('何も試みない', r4.processed, 0);
  eq('残り 0 件', r4.remaining, 0);
  check('諦めた項目は自動では拾い直さない (判断 B)', r4.abandoned === 0 && r4.failures.length === 6);

  // ===== 手動再試行 =====
  console.log('\n--- 手動再試行 (障害が明けたあと) ---');
  outageOver = true;
  const callsBefore = new Map(fake.calls);
  const rr = await q.retryFailed(items, fake.send, { ...options, progress });
  console.log(`  attempted=${rr.attempted} sent=${rr.sent} 残る失敗=${rr.failures.length}`);
  eq('諦めた 6 件だけを試した', rr.attempted, 6);
  eq('late-10 が通った', rr.sent, 1);
  check('成功した項目は失敗の集合から消えた', !progress.failed.some((f) => f.id === 'late-10'));
  check('成功の記録へ移った', progress.sent.includes('late-10'));
  eq('成功の記録は 7 件', progress.sent.length, 7);
  eq('残る失敗は 5 件', progress.failed.length, 5);
  check(
    '成功していた項目には触れていない',
    ['ok-1', 'ok-5', 'ok-8', 'ok-9', 'ok-12'].every((id) => fake.calls.get(id) === callsBefore.get(id))
  );
  eq('手動再試行でも恒久的失敗は 1 回だけ (判断 C/D)', fake.calls.get('bad-3') - callsBefore.get('bad-3'), 1);
  eq('手動再試行でも一時的失敗は 3 回まで (判断 C)', fake.calls.get('dead-7') - callsBefore.get('dead-7'), 3);
  eq('再開位置は手動再試行で動かない', progress.cursor, 12);
  const dead7 = progress.failed.find((f) => f.id === 'dead-7');
  check('依然として失敗した項目の理由は更新されている', /上流が応答しない/.test(dead7.reason), dead7.reason);

  // ===== 進捗の保存と読み戻し =====
  console.log('\n--- 進捗の保存・読み戻し ---');
  const revived = JSON.parse(JSON.stringify(progress));
  const r5 = await q.runBatch(items, fake.send, { ...options, progress: revived });
  eq('JSON 経由でも二重送信しない', r5.sent, 0);
  check('完了判定も保たれる', r5.complete && !r5.clean);

  // ===== 例外を外へ漏らさない =====
  console.log('\n--- 例外の隔離 ---');
  const alwaysThrows = async () => {
    throw new Error('全部だめ');
  };
  const p2 = q.createProgress();
  const r6 = await q.runBatch(items.slice(0, 3), alwaysThrows, { ...options, progress: p2 });
  eq('例外だけでも実行は最後まで進む', r6.processed, 3);
  eq('全件が失敗として報告される', r6.abandoned, 3);
  check('例外は外に漏れていない', true);

  // ===== 調整値 =====
  console.log('\n--- 調整値 ---');
  console.log(`  既定値: ${JSON.stringify(q.DEFAULTS)}`);
  check('調整値が外から見える', typeof q.DEFAULTS.batchSize === 'number');
  const p3 = q.createProgress();
  const r7 = await q.runBatch(items, fake.send, { ...options, batchSize: 1, progress: p3 });
  eq('batchSize=1 は 1 件だけ処理する', r7.processed, 1);
  eq('残りは 11 件', r7.remaining, 11);

  console.log(`\n===== ${failures === 0 ? 'すべて通過' : `${failures} 件 NG`} =====`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((err) => {
  console.error('デモが異常終了しました:', err);
  process.exitCode = 1;
});
