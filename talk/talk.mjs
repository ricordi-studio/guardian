#!/usr/bin/env node
/**
 * セッション間の会話(人にコピペさせない)
 *
 *   node talk/talk.mjs 名前 say "本文"   … 言って、相手に手番を渡す
 *   node talk/talk.mjs 名前 wait         … 自分の手番になるまで待って、新着だけ出す
 *   node talk/talk.mjs 名前 log          … 全部読む
 *
 * 名前は guardian か attendants。
 * ★短く言う。証明もレポートも要らない。違ったら「これ何?」と聞けばよい。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LOG = path.join(HERE, 'log.jsonl');
const TURN = path.join(HERE, 'turn');
const 相手 = { guardian: 'attendants', attendants: 'guardian' };

const [me, cmd, ...rest] = process.argv.slice(2);
if (!相手[me]) { console.error('名前は guardian か attendants'); process.exit(1); }

const 読む = () => { try { return fs.readFileSync(LOG, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch (_) { return []; } };
const 手番 = () => { try { return fs.readFileSync(TURN, 'utf8').trim(); } catch (_) { return me; } };
const 出す = (m) => console.log(`[${m.at}] ${m.from}: ${m.text}`);

if (cmd === 'say') {
  const text = rest.join(' ').trim();
  if (!text) { console.error('本文が空'); process.exit(1); }
  fs.mkdirSync(HERE, { recursive: true });
  const at = new Date().toISOString().slice(11, 19);
  fs.appendFileSync(LOG, JSON.stringify({ at, from: me, text }) + '\n');
  fs.writeFileSync(TURN, 相手[me] + '\n');
  console.log(`→ ${相手[me]} に渡した`);
  process.exit(0);
}

if (cmd === 'log') { 読む().forEach(出す); process.exit(0); }

if (cmd === 'wait') {
  /* ★新着は【自分が最後に言ったより後】── 起動後の差分ではない。
   *   起動時点で相手の発言が既に置かれていると、差分は空になり、
   *   **手番が自分なのに待ち続ける**(2026-08-30、両方が待機して止まった)。 */
  const 期限 = Date.now() + 30 * 60 * 1000;
  const 見る = () => {
    if (手番() === me) {
      const 全 = 読む();
      const 新着 = 全.slice(全.map((m) => m.from).lastIndexOf(me) + 1);
      if (新着.length) 新着.forEach(出す);
      else console.log('(新着なし。あなたの手番)');
      process.exit(0);
    }
    if (Date.now() > 期限) { console.log('(30分待った。相手はまだ)'); process.exit(2); }
    setTimeout(見る, 3000);
  };
  見る();
} else {
  console.error('say / wait / log のどれか');
  process.exit(1);
}
