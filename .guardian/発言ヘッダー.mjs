#!/usr/bin/env node
/* 会議の発言ヘッダーを【機械に作らせる】(2026-09-01、依頼主の指示)。
 *
 * ★なぜ在るか: 2026-09-01、外の会議 の会議で「書いた:」を手で書き、
 *   ★★14件すべてを推測で埋めた。最初だけ合っていて、最後は ★★★+76分 ずれていた。
 *   沈黙: 5分 / 8分 / 14分 も全部 作り話だった。
 *   ★その場は【生きているかを時刻で測る】仕組みを作っている最中で、
 *   ★★私が偽の時刻を14件 流し込んでいた。
 *
 * ★★★これは「気をつける」で直らない ── .guardian/踏んだこと の3行目に
 *   「数を書く前に叩く」と毎ターン出ていて、それでも14回 踏んだ。
 *   ★だから【人が書く欄】を無くす。ここが唯一の作り手になる。
 *
 * 使い方:
 *   node .guardian/発言ヘッダー.mjs --場 <会議のフォルダ> --名 guardian \
 *        [--返信先 <ファイル名>] [--種類 実測] [--続き 要] [--残量 "99%"]
 *
 * ★時刻は必ず Asia/Tokyo を名指しで出す(機械の時間帯に頼らない)。
 * ★★沈黙は【自分の前の発言】との差を、posts/ を読んで数える ── 推測しない。
 * ★★★数えられないときは「測っていません」と書く。空欄にも、嘘の数にもしない。 */

import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const 取る = (名, 既定 = null) => {
  const i = argv.indexOf(名);
  return i >= 0 && argv[i + 1] != null ? argv[i + 1] : 既定;
};

const 場 = 取る('--場');
const 名 = 取る('--名', 'guardian');
const 返信先 = 取る('--返信先', '無');
const 種類 = 取る('--種類', '実測');
const 続き = 取る('--続き', '要');
const 残量 = 取る('--残量', null);

/* ── 時刻: Asia/Tokyo を名指しで出す ───────────────── */
const 日本時間 = (d) => {
  const p = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d).reduce((o, x) => (o[x.type] = x.value, o), {});
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
};
const いま = new Date();

/* ── 沈黙: 自分の前の発言からの分 ──────────────────
 * ★posts/ のファイル名(道具が付けた本物の時刻)から数える。
 *   ★★自分が書いた「書いた:」は読まない ── そこが今回 汚れた所なので。 */
let 沈黙 = '測っていません(会議のフォルダが渡されていません)';
if (場) {
  const 置き場 = path.join(場, 'posts');
  try {
    const 自分の = fs.readdirSync(置き場)
      .filter((f) => f.endsWith(`-${名}.md`))
      .map((f) => f.match(/^(\d{8})-(\d{6})-/))
      .filter(Boolean)
      .map((m) => {
        const s = m[1], t = m[2];
        return new Date(Number(s.slice(0, 4)), Number(s.slice(4, 6)) - 1, Number(s.slice(6, 8)),
          Number(t.slice(0, 2)), Number(t.slice(2, 4)), Number(t.slice(4, 6)));
      })
      .sort((a, b) => b - a);
    if (!自分の.length) 沈黙 = '無(この場での最初の発言)';
    else {
      const 分 = Math.round((いま - 自分の[0]) / 60000);
      沈黙 = 分 < 1 ? '1分未満' : `${分}分`;
    }
  } catch (_) {
    沈黙 = '測っていません(posts が読めません)';
  }
}

const 行 = ['---', `返信先: ${返信先}`, `種類: ${種類}`, `続き: ${続き}`,
  `書いた: ${日本時間(いま)}`, `沈黙: ${沈黙}`];
if (残量) 行.push(`残量: ${残量}(${日本時間(いま)} 時点・自己申告)`);
行.push('---');
process.stdout.write(行.join('\n') + '\n');
