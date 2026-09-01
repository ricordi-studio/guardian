#!/usr/bin/env node
/* 会議の輪を【機械に持たせる】(2026-09-01)。
 *
 * ★なぜ在るか: 依頼主から守るべき事を1つだけ渡された ──
 *   「wait を、そのターンの最後の行為にしてください」。★★それを2回 破った。
 *   ★★★「気をつける」では守れなかった。だから印を機械に置かせ、Stop フックに見張らせる。
 *
 * 使い方:
 *   node .guardian/輪.mjs --入る --場 <会議のフォルダ> --名 guardian [--道具 tsugite.mjs]
 *   node .guardian/輪.mjs                 ← ★これがターンの最後の行為(wait を呼ぶ)
 *   node .guardian/輪.mjs --抜ける         ← 出口2/出口4 のとき(自動でも消える)
 *
 * ★出口はそのまま返す(0=未読 / 3=もう一度待つ / 2=解散 / 4=独り)。 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import { createRequire } from 'node:module';

const ここ = path.dirname(fileURLToPath(import.meta.url));
const 共有 = createRequire(import.meta.url)('./印の場所.cjs');
const 根 = path.resolve(ここ, '..');
const 印 = 共有.印の場所(根);

const argv = process.argv.slice(2);
const 取る = (名, 既定 = null) => {
  const i = argv.indexOf(名);
  return i >= 0 && argv[i + 1] != null ? argv[i + 1] : 既定;
};
const 有る = (名) => argv.includes(名);

if (有る('--抜ける')) {
  try { fs.rmSync(印, { force: true }); } catch (_) {}
  console.log('輪から抜けました(印を消しました)');
  process.exit(0);
}

if (有る('--入る')) {
  const 場 = 取る('--場');
  if (!場) { console.error('--場 が要ります'); process.exit(1); }
  fs.writeFileSync(印, JSON.stringify({
    場, 名: 取る('--名', 'guardian'), 道具: 取る('--道具', 'tsugite.mjs'),
    待ち: Number(取る('--待ち', '540')), 入った: Date.now(), 終了: null,
  }, null, 2));
  console.log(`輪に入りました: ${場}`);
  console.log('★これ以降、wait を呼ばずにターンを終えると Stop フックが止めます');
  process.exit(0);
}

/* ── 既定: wait を呼び、戻った時刻を印に残す ───────────── */
if (!fs.existsSync(印)) {
  console.error('輪に入っていません(先に --入る してください)');
  process.exit(1);
}
const 輪 = JSON.parse(fs.readFileSync(印, 'utf8'));
const 下書き = 取る('--出す', null);   /* ★出す物が在れば、同じ1本で出す */
const 道具 = path.join(輪.場, 輪.道具 || 'tsugite.mjs');

/* ★締め切りは wait の待ち時間より長く取る(自分の締め切りで子を殺さない ── 13.16 の失敗) */
const 締め切り = (Number(輪.待ち) + 120) * 1000;
/* ★出口を1本にする ── 相手の道具の【終い】を使う(2026-09-01)。
 *   ★★終い = 下書きが在れば出し、そのまま輪に戻る。無ければ待つだけ。
 *   ★★★こちらで publish と wait を2本に分けていたのを、1本にした。
 *   実測(写しの部屋): 下書き有り→出して待つ / 無し→「出す物はありません」で待つ。どちらも出口0。 */
const 引数 = ['終い', 輪.名, ...(下書き ? [下書き] : []), '--timeout', String(輪.待ち)];
const r = spawnSync(process.execPath, [道具, ...引数], { encoding: 'utf8', timeout: 締め切り });

if (r.stdout) process.stdout.write(r.stdout);
if (有る('--試す')) console.log(String.fromCharCode(10)
  + '★【試験】印を61分 前に戻しました ── このターンが止まれば、門は効いています');
if (r.stderr) process.stderr.write(r.stderr);

/* ★戻った時刻を残す ── フックはこれを見る。
 *   ★★--試す を付けると【わざと61分 前に戻す】── 門が本当に止めるかを測るため。
 *   ★★★wait は普通に呼んでいるので、輪は切れていない(最後の行為はこの1本のまま)。
 *   2026-09-01、@codex の「wait 無しでターン終了を試み、block されたことを確認」の代わり。 */
try {
  輪.終了 = 有る('--試す') ? Date.now() - 3660000 : Date.now();
  fs.writeFileSync(印, JSON.stringify(輪, null, 2));
} catch (_) {}

const 出口 = r.status;
if (出口 === 2 || 出口 === 4) {
  try { fs.rmSync(印, { force: true }); } catch (_) {}
  console.log(`\n★出口${出口} ── 輪を閉じ、印を消しました`);
}
process.exit(出口 == null ? 1 : 出口);
