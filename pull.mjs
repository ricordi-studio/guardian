#!/usr/bin/env node
/**
 * Guardian を【正本から取り直す】(2026-08-28)。
 *
 * 正本: https://github.com/ricordi-studio/guardian
 *
 * ★なぜ道具にするか: 配布はコピーで済むが、**人が毎回パスを思い出す**形にしていると、
 *   いつか古いコピーを配る/配り忘れる。実際、配った先で直した分が戻らず、
 *   両方の版が同じ番号のまま食い違っていた(WHY 174)。
 *   **どこから取るかは道具が持つ** ── 人は「取り直して」と言うだけでよい。
 *
 * ★上書きしないもの: このリポジトリ固有のものは塊の外に在る(guardian.config.json /
 *   docs/CODEMAP.md / .claude/*)ので、この道具は guardian/ しか触らない。
 *
 * ★取り直す前に、**この現場で塊を直していないか**を必ず見る。
 *   直していたら止める ── 上書きすると、その現場の直りが黙って消えるから(WHY 176)。
 *
 * 使い方(PowerShell):
 *   node guardian/pull.mjs           … 正本の最新を取り直す
 *   node guardian/pull.mjs --check   … 取らずに、正本と何が違うかだけ見る
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const 正本 = 'https://github.com/ricordi-studio/guardian.git';
const 見るだけ = process.argv.includes('--check');

const 走る = (cmd, args, opts = {}) =>
  spawnSync(cmd, args, { encoding: 'utf8', shell: true, ...opts });

/* ── ① この現場で塊を直していないか(直っていたら上書きしない) ── */
{
  const r = 走る('node', [JSON.stringify(path.join(HERE, 'selfcheck.mjs'))]);
  const 出 = String(r.stdout || '') + String(r.stderr || '');
  if (出.includes('配られたときの中身と違います')) {
    console.error('✗ この現場で塊を直しています。取り直すと、その直りが消えます。');
    console.error('  先に `node guardian/selfcheck.mjs --report` で1枚を作り、');
    console.error('  正本へ渡してから取り直してください(README の「改善の還流」)。');
    process.exit(1);
  }
}

/* ── ② 正本を一時領域に取る ── */
const 仮 = path.join(HERE, '..', '.guardian-pull-tmp');
try { fs.rmSync(仮, { recursive: true, force: true }); } catch (_) {}
const c = 走る('git', ['clone', '--depth', '1', '-q', 正本, JSON.stringify(仮)]);
if (c.status !== 0) {
  console.error('✗ 正本を取れませんでした: ' + String(c.stderr || '').slice(0, 300));
  console.error('  正本は公開なので認証は要りません。ネットに繋がっているか、git が入っているかを確かめてください。');
  process.exit(1);
}
try { fs.rmSync(path.join(仮, '.git'), { recursive: true, force: true }); } catch (_) {}

/* ── ③ 何が変わるかを数える(黙って上書きしない) ── */
const 読む = (p) => { try { return fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n'); } catch (_) { return null; } };
const 一覧 = (dir, 元 = dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? 一覧(path.join(dir, e.name), 元)
                  : [path.relative(元, path.join(dir, e.name)).split(path.sep).join('/')]);
const 新しい = 一覧(仮);
const 変わる = [], 増える = [];
for (const f of 新しい) {
  const a = 読む(path.join(HERE, f)), b = 読む(path.join(仮, f));
  if (a === null) 増える.push(f);
  else if (a !== b) 変わる.push(f);
}
const 旧版 = (読む(path.join(HERE, 'KIT_VERSION')) || '?').trim();
const 新版 = (読む(path.join(仮, 'KIT_VERSION')) || '?').trim();

console.log('正本: ' + 正本);
console.log('版: ' + 旧版 + ' → ' + 新版);
console.log('変わるもの: ' + (変わる.length ? 変わる.join(', ') : 'なし')
  + (増える.length ? ' / 増えるもの: ' + 増える.join(', ') : ''));

if (見るだけ) { fs.rmSync(仮, { recursive: true, force: true }); process.exit(0); }
if (!変わる.length && !増える.length) {
  fs.rmSync(仮, { recursive: true, force: true });
  console.log('✓ すでに正本と同じです(取り直す必要はありません)');
  process.exit(0);
}

/* ── ④ 置き換える ── */
for (const f of 新しい) {
  const 先 = path.join(HERE, f);
  fs.mkdirSync(path.dirname(先), { recursive: true });
  fs.copyFileSync(path.join(仮, f), 先);
}
fs.rmSync(仮, { recursive: true, force: true });
console.log('✓ 取り直しました(' + 新しい.length + 'ファイル)');
console.log('  次にやること: node guardian/install.mjs   ← 冪等。宣言とフックを新しい形に揃えます');
