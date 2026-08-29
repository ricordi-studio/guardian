'use strict';

/**
 * 代役の送信手段を作り、成功・一時的失敗・恒久的失敗・例外が混ざる例を流して
 * 仕様書の要件どおりに動くことを確かめる実演。
 *
 *   node demo.js
 */

const assert = require('assert');
const q = require('./index');

// ---------------------------------------------------------------- 代役の道具

/** 代役の送信手段。項目ごとの台本に従って、成功・失敗・例外を返す。 */
function makeFakeSender(script) {
  const calls = [];       // どの項目を何回叩いたか(二重送信の検出に使う)
  const counts = new Map();

  async function send(item) {
    calls.push(item.id);
    const n = (counts.get(item.id) || 0) + 1;
    counts.set(item.id, n);

    const plan = script[item.id];
    if (!plan) return q.results.success();

    const step = plan[Math.min(n - 1, plan.length - 1)];
    if (step === 'ok') return q.results.success();
    if (step === 'temp') return q.results.temporary(`${item.id}: 混雑している`);
    if (step === 'perm') return q.results.permanent(`${item.id}: 中身が不正`);
    if (step === 'throw') throw new Error(`${item.id}: 接続が切れた`);
    if (step === 'garbage') return undefined;          // 解釈できない結果
    if (step === 'halfbaked') return { ok: false, reason: `${item.id}: 詳細不明` }; // retryable 無し
    throw new Error(`台本が不正: ${step}`);
  }

  return {
    send,
    calls,
    countFor: (id) => counts.get(id) || 0,
    reset: () => { calls.length = 0; counts.clear(); },
  };
}

/** 待機を実時間で待たず、呼ばれた事実だけ記録する差し替え */
function makeFakeSleep() {
  const waits = [];
  return { waits, sleep: async (ms) => { waits.push(ms); } };
}

const items = [
  { id: 'a1', body: 'ふつうに通る' },
  { id: 'a2', body: '2 回こけてから通る' },
  { id: 'a3', body: '中身が不正' },
  { id: 'a4', body: '毎回例外' },
  { id: 'a5', body: '毎回一時的失敗' },
  { id: 'a6', body: 'ふつうに通る' },
  { id: 'a7', body: '解釈できない結果のあと通る' },
  { id: 'a8', body: 'ふつうに通る' },
];

const script = {
  a1: ['ok'],
  a2: ['temp', 'temp', 'ok'],
  a3: ['perm'],
  a4: ['throw'],
  a5: ['temp'],
  a6: ['ok'],
  a7: ['garbage', 'ok'],
  a8: ['halfbaked', 'ok'],
};

const line = (s) => console.log(s);
const show = (label, r) => line(
  `  ${label}: 試み=${r.attempted} 成功=${r.succeeded} 諦め=${r.failed} 残り=${r.remaining} 全件決着=${r.allSettled}`
);

async function main() {
  const fake = makeFakeSender(script);
  const clock = makeFakeSleep();
  const options = { maxPerRun: 3, maxAttempts: 3, retryDelayMs: 100, sleep: clock.sleep };

  line('== 1 回目の実行(上限 3 件) ==');
  let progress = q.createProgress();
  const r1 = await q.run(items, fake.send, progress, options);
  progress = r1.progress;
  show('run1', r1);
  for (const f of r1.failures) line(`    諦め ${f.id}: ${f.reason}`);

  assert.strictEqual(r1.attempted, 3, '上限 3 件で止まること');
  assert.strictEqual(r1.succeeded, 2, 'a1 と a2 が成功');
  assert.strictEqual(r1.failed, 1, 'a3 は恒久的失敗で諦める');
  assert.strictEqual(r1.remaining, 5, '未処理は a4〜a8 の 5 件');
  assert.strictEqual(r1.allSettled, false);

  // §4.2 恒久的失敗は一切再試行しない
  assert.strictEqual(fake.countFor('a3'), 1, 'a3 は 1 回しか叩かれない');
  // §4.5 理由は実際に起きたことを表す(「3 回試した」と書かない)
  const a3 = r1.failures.find((f) => f.id === 'a3');
  assert.ok(/恒久的な失敗/.test(a3.reason), '恒久的失敗と分かる理由');
  assert.ok(!/回続いた/.test(a3.reason), '恒久的失敗に再送回数を書かない');
  // §4.1 一時的失敗のあいだには待機がある / 恒久的失敗のあとには待機しない
  assert.strictEqual(fake.countFor('a2'), 3, 'a2 は 3 回叩かれる');
  assert.deepStrictEqual(clock.waits, [100, 100], '再送のあいだだけ 2 回待機した');

  line('');
  line('== 2 回目の実行(続きから、上限なりゆき) ==');
  clock.waits.length = 0;
  const r2 = await q.run(items, fake.send, progress, { ...options, maxPerRun: 100 });
  progress = r2.progress;
  show('run2', r2);
  for (const f of r2.failures) line(`    諦め ${f.id}: ${f.reason}`);

  assert.strictEqual(r2.attempted, 5, '残り 5 件を処理');
  assert.strictEqual(r2.succeeded, 3, 'a6 a7 a8 が成功');
  assert.strictEqual(r2.failed, 2, 'a4(例外) a5(一時的) が上限まで試して諦め');
  assert.strictEqual(r2.remaining, 0);
  assert.strictEqual(r2.allSettled, true, '§7 全件に決着はついた');
  assert.strictEqual(r2.clean, false, '§7 だが失敗ゼロではない');

  // §4.3 例外で実行全体が止まらない。内容が理由に残る
  const a4 = r2.failures.find((f) => f.id === 'a4');
  assert.ok(/接続が切れた/.test(a4.reason), '例外の内容が理由に含まれる');
  assert.strictEqual(fake.countFor('a4'), 3, '例外も一時的失敗として 3 回試す');
  // §2.2 解釈できない結果は成功と見なさない
  assert.strictEqual(fake.countFor('a7'), 2, 'a7 は解釈不能→再送→成功');
  assert.strictEqual(fake.countFor('a8'), 2, 'a8 は retryable 未指定→再送→成功');

  // §5 二重送信なし / 巻き戻りなし / 飛ばしなし
  const everyCall = fake.calls;
  assert.deepStrictEqual(
    [...new Set(everyCall)].sort(),
    ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8'],
    '全項目がちょうど 1 度は処理対象になった'
  );
  assert.strictEqual(progress.cursor, 8, '再開位置が巻き戻っていない');
  assert.deepStrictEqual(progress.succeeded, ['a1', 'a2', 'a6', 'a7', 'a8']);
  assert.deepStrictEqual(progress.failed.map((f) => f.id), ['a3', 'a4', 'a5']);
  assert.strictEqual(q.isComplete(items, progress), true);
  assert.strictEqual(q.isCleanlyComplete(items, progress), false);

  line('');
  line('== 3 回目の実行(全件決着済みなので何もしない) ==');
  fake.reset();
  const r3 = await q.run(items, fake.send, progress, options);
  progress = r3.progress;
  show('run3', r3);
  assert.strictEqual(r3.attempted, 0, '§5 失敗した項目を自動で再送しない');
  assert.strictEqual(fake.calls.length, 0, '送信手段を 1 度も叩かない');
  assert.strictEqual(r3.failedTotal, 3, '諦めた 3 件は進捗に残っている');

  line('');
  line('== 手動再試行(諦めた 3 件だけ) ==');
  // 外部サービスが復旧し、a4 と a5 は通るようになった。a3 は中身が不正のまま。
  const recovered = makeFakeSender({ a3: ['perm'], a4: ['temp', 'ok'], a5: ['ok'] });
  clock.waits.length = 0;
  const r4 = await q.retryFailed(items, recovered.send, progress, options);
  progress = r4.progress;
  line(`  retry: 試した=${r4.attempted} 成功=${r4.succeeded} まだ失敗=${r4.stillFailed}`);
  for (const f of r4.failures) line(`    残る失敗 ${f.id}: ${f.reason}`);

  assert.strictEqual(r4.attempted, 3, '§8 対象は諦めた 3 件だけ');
  assert.deepStrictEqual(
    [...new Set(recovered.calls)].sort(),
    ['a3', 'a4', 'a5'],
    '§8 それ以外の項目には触れない'
  );
  assert.strictEqual(r4.succeeded, 2);
  assert.strictEqual(r4.stillFailed, 1);
  assert.strictEqual(recovered.countFor('a3'), 1, '§8 恒久的失敗は再試行時も 1 回だけ');
  assert.strictEqual(recovered.countFor('a4'), 2, '一時的失敗は待機を挟んで再送');
  assert.deepStrictEqual(clock.waits, [100], '再試行でも待機が入る');

  // §8 進捗が実際の状態と一致している
  assert.deepStrictEqual(progress.failed.map((f) => f.id), ['a3']);
  assert.deepStrictEqual(progress.succeeded.sort(), ['a1', 'a2', 'a4', 'a5', 'a6', 'a7', 'a8']);
  assert.strictEqual(progress.cursor, 8, '手動再試行は再開位置を動かさない');

  line('');
  line('== 進捗の要約 ==');
  line(`  ${JSON.stringify(q.summarize(items, progress))}`);

  // 進捗は JSON で往復できること(呼び出し側が保存する前提)
  const revived = JSON.parse(JSON.stringify(progress));
  assert.deepStrictEqual(q.summarize(items, revived), q.summarize(items, progress));

  // 例外を外へ漏らさないこと(§9)
  const alwaysThrows = async () => { throw new TypeError('壊れた送信手段'); };
  const r5 = await q.run([{ id: 'z1' }], alwaysThrows, q.createProgress(), options);
  assert.strictEqual(r5.failed, 1);
  assert.ok(/壊れた送信手段/.test(r5.failures[0].reason), '例外は対象項目の失敗として現れる');

  line('');
  line('すべての確認を通過した。');
}

main().catch((err) => {
  console.error('確認に失敗:', err);
  process.exitCode = 1;
});
