#!/usr/bin/env node
/* 鼓動に【止まる条件】を持たせる(2026-09-01)。
 *
 * ★なぜ在るか: 会議で鼓動(beat.mjs)を回したが、★★止まる条件が無かった。
 *   会議が終わっても、私の殻が死んでも、★★★他人のフォルダに打ち続ける。
 *   これは今夜この会議で議論していた形そのものである ──
 *   「★親が死んだら、子は残る」。★★私自身がそれをやっていた。
 *
 * ★beat.mjs は相手の持ち物なので書き換えない。★★外から見張る。
 *
 * 何をするか:
 *   .guardian/輪.mjs が置く印を見張り、★印が消えたら子を殺して自分も終わる。
 *   ★★印は 出口2(解散)/出口4(独り) で自動的に消える。
 *
 * 使い方: node .guardian/鼓動.mjs [--every 180] */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ここ = path.dirname(fileURLToPath(import.meta.url));
const 根 = path.resolve(ここ, '..');
const 印 = path.join(os.tmpdir(),
  'kit-loop-' + crypto.createHash('md5').update(根).digest('hex').slice(0, 12) + '.json');

if (!fs.existsSync(印)) {
  console.error('輪に入っていません(先に 輪.mjs --入る してください)');
  process.exit(1);
}
const 輪 = JSON.parse(fs.readFileSync(印, 'utf8'));
const i = process.argv.indexOf('--every');
const 毎 = i >= 0 ? process.argv[i + 1] : '180';

const 子 = spawn(process.execPath,
  [path.join(輪.場, 'beat.mjs'), 輪.名, '--every', 毎],
  { stdio: 'inherit' });

console.log(`鼓動を始めました(pid ${子.pid} / ${毎}秒ごと)`);
console.log('★印が消えたら(出口2/出口4)、自動で止まります');

/* ★見張り: 印が消えたら子を殺す ── 15秒ごと(鼓動より細かく見る) */
const 見張り = setInterval(() => {
  if (fs.existsSync(印)) return;
  console.log('\n★印が消えました ── 鼓動を止めます');
  try { 子.kill(); } catch (_) {}
  clearInterval(見張り);
  /* ★殺したことを確かめる(「殺した」と「死んだ」は別 ── 今夜そう学んだ) */
  setTimeout(() => {
    try { process.kill(子.pid, 0); console.error('★★まだ生きています(pid ' + 子.pid + ')── 手で止めてください'); }
    catch (_) { console.log('★止まりました'); }
    process.exit(0);
  }, 1000);
}, 15000);

/* ★私が死んだら子も殺す(親の死で孤児を作らない) */
for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => { try { 子.kill(); } catch (_) {} process.exit(0); });
子.on('exit', (c) => { clearInterval(見張り); console.log(`鼓動が終わりました(出口 ${c})`); process.exit(0); });
