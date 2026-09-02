#!/usr/bin/env node
/* 外す ── 【入れたときの台帳】と【いま在る物】の差から、塊の持ち物だけを外す(2026-09-03)。
 *
 * ★なぜ在るか: 依頼主の問い「Guardian を外すとき、残滓が残らない形にできるか」(2026-09-02)。
 *   会議で 3席が測って寄った線を、そのまま実装している。
 *
 * ★★守る決まり(どれも実測から導かれた):
 *   ・★台帳に【載っていない物は消さない】(allowlist)。人が手で書いた物は書き手を通らないので、
 *     既定を「消してよい」に倒すと、いちばん惜しい物から先に消える。
 *   ・★★台帳は【全走行の合併】で読む。実測: 合併7件 / 最後の走行だけ3件 ──
 *     宣言・フック4件・settings のファイル・workflow は2回目の走行に出ない(既に在るので枝を通らない)。
 *   ・★★★消してよいのは「作った かつ 入れたときから変わっていない」物だけ。変わっていれば CONFLICT。
 *   ・★retained は【台帳から】ではなく【走査 − 消した物】で作る ──
 *     台帳から作ると、台帳の盲点が報告の中でも盲点のまま残る。
 *   ・★★台帳自身は最後に消す。PASS のときだけ。CONFLICT なら残して、もう一度 回せるように。
 *
 * ★出口: 0=PASS / 1=CONFLICT / 2=UNKNOWN(★★不明は合格ではない)
 *
 * 使い方:
 *   node guardian/外す.mjs        … ★確かめるだけ(何も消さない)
 *   node guardian/外す.mjs --外す  … ★★実際に外す
 */

import fs from 'node:fs';
import { createRequire as __cr } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/* ★【この道具が知っている口】── ★★塊の7つの入口が既に持っている作法を、ここにも置く
 *   (2026-09-03、会議で @kozo が「外す.mjs だけ持っていない」と数えた)。
 *
 * ★★★実測(直す前): `node 外す.mjs --外す --dry` が **消した**(出口0)。
 *   `--dry` は この塊の他の道具では「見るだけ」の口である ──
 *   ★人は「見るだけのつもり」で打ち、★★道具は黙って無視して消し、★★★出口0で「通った」と言った。
 *
 * ★これは【唯一の破壊できる口】である。7つのうち、門を持っていないのはここだけだった。
 *
 * ★★門は【根を決める前】に置く ── ★★★`--root` が根を変えるので、根の後では遅い。
 *
 * ★出口は 3 にする(他の7口は 1)。理由: この道具は出口に【2つの軸】が載っている ──
 *   ★★軸A 判定(0=PASS / 1=CONFLICT / 2=UNKNOWN)/ 軸B 判定器が成立したか。
 *   ★★★1 も 2 も判定で埋まっているので、引数の誤りは 3 を使うしかない。
 *   他の7口を 3 に揃えないのは、既に測定契約として 1 が使われているためである。 */
/* ★【口の宣言】── ★★名前と個数だけでなく【どの mode に属すか】まで持つ
 *   (2026-09-03、会議で @codex と @kozo が寄せた形)。
 *
 *   ★★★22.1 では平らな一覧だったので、`--外す --dry` は「未知の口」として拒めた ──
 *   ★だがそれは【偶然そうなった】だけで、mode の判断ではなかった(@kozo の指摘)。
 *
 * ★この塊は自分の他の道具で `--dry` / `--check` を「下見」の意味で使っている。
 *   ★★人はそれを打つ。★★★だから【知らない口】ではなく【下見の別名】として受ける。
 *
 * ★矛盾は【拒否】で答える(3つの扉が3種類の答えを出していた ── @kozo が数えた:
 *   外す=破壊側が勝つ / pull=安全側が勝つ / install=書いた順が勝つ)。
 *   ★★ここは拒否にする ── ★★★打った人の意図を、道具が黙って選び直さない。 */
const 口の宣言 = {
  '--口一覧': { 個数: 0, mode: null },
  '--dry':   { 個数: 0, mode: '下見', 別名: true },
  '--check': { 個数: 0, mode: '下見', 別名: true },
  '--外す':  { 個数: 0, mode: '外す' },
  '--走査':  { 個数: 0, mode: '走査' },
  '--root':  { 個数: 1, mode: null, 使えるmode: ['走査'] },
  '--json':  { 個数: 0, mode: null, 使えるmode: ['下見', '走査'] },
};
const 知っている口 = Object.keys(口の宣言);
const 値を取る口 = Object.fromEntries(Object.entries(口の宣言).map(([k, v]) => [k, v.個数]));
let 選ばれたmode = null;
{
  const 渡された = process.argv.slice(2);
  const 知らない = [], 足りない = [], 重なり = [], modeの衝突 = [], 場違い = [];
  const 見た = new Set();
  const modeを出した口 = [];
  for (let i = 0; i < 渡された.length; i++) {
    const v = 渡された[i];
    if (!v.startsWith('--')) continue;
    const 宣 = 口の宣言[v];
    if (!宣) { 知らない.push(v); continue; }
    if (見た.has(v)) 重なり.push(v); else 見た.add(v);
    if (宣.mode) modeを出した口.push(v);
    if (宣.個数 && i + 宣.個数 >= 渡された.length + 0)
      足りない.push(v + '(値が ' + 宣.個数 + ' 個要りますが ' + (渡された.length - i - 1) + ' 個です)');
    i += 宣.個数;
  }
  /* ★mode は1つだけ ── ★★2つ来たら【どちらが勝つか】を道具が決めない */
  const modes = [...new Set(modeを出した口.map((v) => 口の宣言[v].mode))];
  if (modes.length > 1)
    modeの衝突.push(modeを出した口.join(' と ') + ' は別のことを言っています(' + modes.join(' / ') + ')');
  else if (modeを出した口.length > 1)
    modeの衝突.push(modeを出した口.join(' と ') + ' は同じ mode を2度 指しています(どちらが効いたか分かりません)');
  選ばれたmode = modes[0] || '下見';
  /* ★★その mode で使えない口を拒む(★★★「無害だから通す」にしない ── 打った人の意図が捨てられる) */
  for (const v of 見た) {
    const 使える = 口の宣言[v]["使えるmode"];
    if (使える && !使える.includes(選ばれたmode))
      場違い.push(v + ' は ' + 使える.join(' / ') + ' でだけ使えます(いまは ' + 選ばれたmode + ')');
  }
  const 訴え = [];
  if (知らない.length) 訴え.push('この道具は、その口を知りません: ' + 知らない.join(', '));
  if (足りない.length) 訴え.push('口に渡す値が足りません: ' + 足りない.join(', '));
  if (重なり.length) 訴え.push('同じ口が2回 来ています: ' + 重なり.join(', '));
  if (modeの衝突.length) 訴え.push(modeの衝突.join(' / '));
  if (場違い.length) 訴え.push(場違い.join(' / '));
  if (訴え.length) {
    for (const t of 訴え) console.error('✗ ' + t);
    console.error('  知っている口: ' + 知っている口.join(' / '));
    console.error('  ★下見(既定)= 引数なし / --dry / --check ・ 消す = --外す ・ 走査 = --走査');
    console.error('  ★★黙って片方を選ぶと、打った人の意図が捨てられます ── だから拒みます');
    console.error('  ★★★出口3(引数の誤り)── 0/1/2 は判定で埋まっています');
    process.exit(3);
  }
}
if (process.argv.includes('--口一覧')) {
  /* ★口の名前・値の個数・mode を出す(★★別名も、何の別名かを言う) */
  for (const [k, v] of Object.entries(口の宣言)) {
    /* ★【一緒に要る口】を、道具の側が答える(2026-09-03)。
     *   ★★検査(B11)は mode を知らない ── 知らせるのではなく【答えさせる】(39条)。
     *   ★★★これが無いと、B11 は --root を単独で叩いて「宣言と振る舞いが違う」と言う。 */
    const 要る口 = { '走査': '--走査', '下見': null };
    const 供 = v['使えるmode'] && !v['使えるmode'].includes('下見') ? 要る口[v['使えるmode'][0]] : null;
    const 印 = (v.別名 ? ' 下見の別名' : (v.mode ? ' mode:' + v.mode : (v['使えるmode'] ? ' ' + v['使えるmode'].join('|') + ' で使える' : '')))
      + (供 ? ' 要る:' + 供 : '');
    process.stdout.write(k + " " + v.個数 + 印 + String.fromCharCode(10));
  }
  process.exit(0);
}

/* ★【塊が書き込む場所】── ★★ここが正本(2026-09-03、会議で @kozo が「一覧が2つ在る」と数えた)。
 *
 *   ★★★直す前は 走査の道(既知の場所)と 通常の道(塊が書き込む場所)に2つ在り、
 *   片方だけ .claude/commands/ を持っていた。★今日は前置きで飲まれるので振る舞いは同じ ──
 *   ★★だからこそ、誰も気づかずに ずれ続けられる。
 *   ★★★「前置きで飲まれない場所」が1つ足された日に、片方だけに入る。
 *
 * ★場所は所有の証明ではない(輪の線)。★★「分からない」と言うには足りる、という使い方だけをする。 */
const 塊が書き込む場所 = ['.guardian/', '.claude/', '.github/workflows/'];

/* ★【昔の名前】も見る(2026-09-03、会議で @kozo が化石を置いて測った)。
 *
 *   ★★実測(直す前): tools/guardian/check.mjs / codemap.config.json / tools/codemap/x.md を置くと
 *   ★★★3件とも **retained にすら入らず**、報告に1行も出なかった。
 *   それでも尾は「残っているのは③(現場の物)だけです」と言っていた ──
 *   ★**現場には あと3件 残っている。勘定が、見た宇宙の外を数えていた。**
 *
 *   ★★install.mjs は昔の名前を【5つ】知っている(改名の事故から)。走査は 0 だった。
 *   ★★★写経しない ── install の宣言を読む(pull の 配るもの を読むのと同じ作法)。 */
const 昔の名前 = (() => {
  try {
    const src = fs.readFileSync(path.join(HERE, 'install.mjs'), 'utf8');
    const h = src.indexOf('const 古い = [');
    if (h < 0) return [];
    const 尾 = src.indexOf('].filter(', h);
    if (尾 < 0) return [];
    return [...src.slice(h, 尾).matchAll(new RegExp("p: '([^']+)'", 'g'))].map((m) => m[1]);
  } catch (_) { return []; }
})();


/* ★根は【塊の1つ上】から探す(install と同じ作法)。塊は現場の中に在る前提。 */
const ROOT = (() => {
  let d = path.resolve(HERE, '..');
  for (;;) {
    for (const 目印 of ['.git', 'package.json', 'CLAUDE.md']) {
      if (fs.existsSync(path.join(d, 目印))) return d;
    }
    const up = path.dirname(d);
    if (up === d) return path.resolve(HERE, '..');
    d = up;
  }
})();

/* ★mode から取る(2026-09-03)── ★★includes を各所で見ると、mode の判断と食い違う */
const 実行 = (選ばれたmode === '外す');
const 走査だけ = (選ばれたmode === '走査');
/* ★--json は【下見】と【走査】の両方で使える(2026-09-03、@codex が mode 表を訂正した) */
const JSONで出す = process.argv.includes('--json');
/* ★下見の JSON は【人の文より後】でしか作れない ── ★★分類が終わるまで判定が出ないから。
 *   ★★★だが人の文は分類より前に出る。だから【溜めて、出さない】。
 *   ★捨てない: JSON の 人の文 欄に入れて渡す(片方だけ黙らない)。
 *   ★★2つの分類器を並べないための形である ── 計算は1つ、出し方が2つ。 */
const 人の文 = [];
const 静かにする = (JSONで出す && 選ばれたmode === '下見');
const 本当のlog = console.log;
if (静かにする) console.log = (...a) => { 人の文.push(a.map(String).join(' ')); };

/* ★指紋は【書き手.cjs に1本だけ】(2026-09-03)。ここで再実装しない ──
 *   ★★直す前は 台帳.mjs / 書き手.cjs / ここ の3つに同じ式が在った。
 *   1つずれるだけで、外す側は「人が触った」と読んで止まる ── ★★★誰のせいでもない CONFLICT が出る。 */
const 書き手 = __cr(import.meta.url)('./書き手.cjs');
const 指紋 = 書き手.指紋;
/* ★道は 書き手.cjs が正本(2026-09-03、会議で @kozo が「写しが5箇所」と数えた) */
const 台帳の道 = 書き手.台帳の道(ROOT);
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');
const 読む = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch (_) { return null; } };

/* ★実行する物 ── ★★ここに載る形だけが「束が消えたら壊れる」相手になる */
/* ★依存として数えるのは【実行される位置に在る綴り】だけ(2026-09-03、実測で2回 直した)。
 *
 *   ★★1回目の直し: 文書(.md)を外した ── 地図が guardian/METHOD.md を名指しするのは説明である。
 *   ★★★2回目(ここ): それでも足りなかった ── guardian.config.json の【説明の欄】が
 *   guardian/check.mjs を名指ししていて、依存と読まれた。
 *   実測: 案内どおりに宣言を埋めた現場で「依存切れ 5件」→ 何も消せない。
 *
 *   ★だから【形】ではなく【位置】で取る:
 *     .claude/settings.json … hooks[…].hooks[].command だけ
 *     package.json          … scripts の値だけ
 *     .yml / .yaml          … run: の行だけ
 *     コード                … 本文ぜんぶ(require / spawn の道が散らばるので)
 *     ★★それ以外の .json / 文書 … 見ない(説明が入るため)
 *
 *   ★★★見なかった分は【言う】── 下の「依存の網」の行に、形ごとの数が出る。 */
const 実行される綴り = (rel, t) => {
  if (/\.(([cm]?js)|ts|sh|ps1|cmd|bat)$/i.test(rel)) return t;
  if (/\.ya?ml$/i.test(rel)) {
    return t.split(String.fromCharCode(10)).filter((l) => /(^|\s)-?\s*run\s*:/.test(l)).join(String.fromCharCode(10));
  }
  if (rel === '.claude/settings.json') {
    let j = null; try { j = JSON.parse(t); } catch (_) { return null; }
    const 出 = [];
    for (const ev of Object.keys((j && j.hooks) || {}))
      for (const g of (j.hooks[ev] || []))
        for (const h of ((g && g.hooks) || []))
          if (h && typeof h.command === 'string') 出.push(h.command);
    return 出.join(String.fromCharCode(10));
  }
  if (rel === 'package.json' || rel.endsWith('/package.json')) {
    let j = null; try { j = JSON.parse(t); } catch (_) { return null; }
    return Object.values((j && j.scripts) || {}).filter((v) => typeof v === "string").join(String.fromCharCode(10));
  }
  return null;   /* ★それ以外は【実行されない】── 説明が入る所なので見ない */
};

/* ---------- ⓪ 走査だけ ── ★台帳が無い現場に当てる(2026-09-03、依頼主の依頼) ----------
 *
 * ★なぜ要るか: 台帳を作らない版で入れた現場は、外す側が【何も材料を持たない】。
 *   ★★実測: 台帳を消すと「所有台帳が読めません … 何も消していません」で止まる。
 *   ★★★それは正しいが、そこで終わると【昔の導入は永久に外せない】。
 *
 * ★この口は【消さない】。候補を出し、★★何を根拠にそう言うかを一緒に出す。
 *
 * ★★★輪で決めた線を守る: **綴りで所有を決めない。**
 *   実測の裏付け(@kozo が161版を数えた): settings.json に居る no-reflex の登録は、
 *   ★どの版の install も【一度も登録していない】── 道は塊の物に見えるのに、人が足した物だった。
 *
 * ★【証拠は足す。排他にしない】(2026-09-03、会議で @codex が形を出した)。
 *   ★★直す前は if/else if の連鎖で、当たった1つで continue していた ──
 *   ★★★1つのファイルが複数の証拠を持つとき、最初の1つ以外が【隠れる】。
 *   実測: 現場が育てた docs/CODEMAP.md は、雛形と一致せず、名前にも guardian が無いので
 *   ★走査から【丸ごと消えていた】(塊が置いた物なのに)。
 *
 * ★★終端は必ず1つ(@codex)── 候補 / 証拠なし / 見ていない / 読めない。
 *   ★★★分類の枝を抜けた物が0であることを、毎回 数えて出す。 */
if (走査だけ) {
  /* ★どこを走査するか ── --root で外の現場も見られる(★★消さない口なので安全) */
  const 根引数 = process.argv.indexOf('--root');
  const 走査の根 = 根引数 >= 0 && process.argv[根引数 + 1]
    ? path.resolve(process.argv[根引数 + 1]) : ROOT;
  /* ★JSONで出す は上(門のすぐ後)で1本だけ決めている ── ここでは決め直さない */

  /* ★塊が置く【道】(exact)── ★★一致しなくても、そこに在れば証拠になる */
  const 既知の道 = new Set(['docs/CODEMAP.md', 'guardian.config.json', 'CLAUDE.md',
    '.claude/settings.json', '.claude/commands/guardian-audit.md',
    '.github/workflows/guardian-nightly.yml']);
  /* ★★塊が作る【場所】── ★★★場所だけでは所有の証明にならない(輪の線) */
  /* ★★塊が作る【場所】── 正本は上の 塊が書き込む場所(写しを持たない) */
  const 既知の場所 = 塊が書き込む場所;

  const 候補 = [];          /* { rel, 証拠: [{型, 詳細}] } */
  const 証拠なし = [];
  const 見ていない = [];    /* { rel, 理由 } */
  const 読めない = [];      /* { rel, 理由 } */
  const 束 = [];
  let 見た数 = 0;

  /* ★雛形は、現場の束から取る ── ★★無ければ、いま走っているこの塊から取る */
  const 雛形 = new Map();   /* 指紋 → 雛形の名 */
  {
    const 置き場 = [path.join(走査の根, 'guardian', 'templates'), path.join(HERE, 'templates')];
    for (const d of 置き場) {
      let es = [];
      try { es = fs.readdirSync(d); } catch (_) { continue; }
      for (const f of es) {
        const t = 読む(path.join(d, f));
        if (t != null && !雛形.has(指紋(t))) 雛形.set(指紋(t), f);
      }
      if (雛形.size) break;   /* ★現場の束が在れば、そちらを使う(版が合うので) */
    }
  }

  const 見ないフォルダ = new Set(['.git', 'node_modules']);
  const 歩く = (相対) => {
    let es = [];
    try { es = fs.readdirSync(path.join(走査の根, 相対 || '.'), { withFileTypes: true }); }
    catch (e) { 読めない.push({ rel: 相対 + '/', 理由: String(e && e.code || e) }); return; }
    for (const e of es) {
      const rel = 相対 ? 相対 + '/' + e.name : e.name;
      if (e.isDirectory()) {
        if (見ないフォルダ.has(e.name)) { 見ていない.push({ rel: rel + '/', 理由: '宣言で見ない場所' }); continue; }
        /* ★束かどうかは【中身】で見る ── 名前では見ない */
        const 束か = fs.existsSync(path.join(走査の根, rel, 'pull.mjs'))
          && fs.existsSync(path.join(走査の根, rel, 'KIT_VERSION'));
        if (束か) {
          let 版 = '(読めません)';
          try { 版 = String(fs.readFileSync(path.join(走査の根, rel, 'KIT_VERSION'), 'utf8')).trim(); } catch (_) {}
          let 数 = 0;
          try { 数 = fs.readdirSync(path.join(走査の根, rel)).length; } catch (_) {}
          束.push({ rel: rel + '/', 版, 中身: 数 });
          見ていない.push({ rel: rel + '/*', 理由: '束の中(束ごと1件として出しています)' });
          continue;
        }
        歩く(rel);
        continue;
      }
      見た数++;
      const t = 読む(path.join(走査の根, rel));
      if (t == null) { 読めない.push({ rel, 理由: '読めません' }); continue; }

      /* ★★★証拠は【足す】── 当たっても止めない */
      const 証拠 = [];
      const 雛形名 = 雛形.get(指紋(t));
      if (雛形名) 証拠.push({ 型: '雛形と一致', 詳細: '雛形 ' + 雛形名 + ' と1バイトも違いません' });
      if (既知の道.has(rel)) {
        証拠.push(雛形名
          ? { 型: '塊が置く道', 詳細: 'install が置く道です' }
          : { 型: '塊が置く道(中身は違う)', 詳細: 'install が置く道ですが、雛形と中身が違います(現場が育てた可能性)' });
      }
      if (t.includes('<!-- guardian:begin')) 証拠.push({ 型: '印', 詳細: 'guardian:begin/end の区間が在ります' });
      const 命令部 = 実行される綴り(rel, t);
      if (命令部 != null) {
        /* ★【回数も数える】(2026-09-03、@claude が実物で見つけた)。
         *   ★★実物の現場では、同じフックが **2回ずつ** 登録されていた(8登録 / 4本)。
         *   外す側の規則では「同じ要素が N件 → どれを外すか決められません(CONFLICT)」になるので、
         *   ★★★重複は【撤去の可否を分ける情報】である。出さないと、人は「4本 外せばよい」と読む。 */
        /* ★道は【空白と区切り】で止める(2026-09-03、自分の試験で見つけた)。
         *   ★★直す前は [A-Za-z0-9_./-] だったので、★★★日本語名の道が guardian/ で切れていた
         *   (実測: guardian/外す.mjs → "guardian/")。この塊は日本語名を5枚 配っている。 */
        const 生 = 命令部.match(new RegExp("[^\\s\"'`;|&<>()]*guardian[^\\s\"'`;|&<>()]*", "g")) || [];
        const 回数 = new Map();
        for (const x of 生) 回数.set(x, (回数.get(x) || 0) + 1);
        if (回数.size) {
          /* ★切らない ── 切るなら必ず「…他N件」を付ける(04:46 の規則を、ここにも当てる) */
          const 並 = [...回数.entries()].map(([x, n]) => x + (n > 1 ? "(★" + n + "回)" : ""));
          const 出 = 並.length > 8 ? 並.slice(0, 8).join(", ") + " …他" + (並.length - 8) + "件" : 並.join(", ");
          const 重なり = [...回数.values()].filter((n) => n > 1).length;
          証拠.push({ 型: "命令", 詳細: "実行される位置が名指し(" + 回数.size + "種 / 登録 " + 生.length + "件"
            + (重なり ? " ・★同じ物が2回以上 登録されている物 " + 重なり + "種" : "") + "): " + 出 });
        }
      }
      const 場所 = 既知の場所.find((d) => rel.startsWith(d));
      if (場所) 証拠.push({ 型: '場所だけ', 詳細: '塊が作る場所 ' + 場所 + ' の中(★所有の証明にはなりません)' });
      if (/guardian/i.test(rel)) 証拠.push({ 型: '名前だけ', 詳細: '道に guardian が入っている(★所有の証明にはなりません)' });

      if (証拠.length) 候補.push({ rel, 証拠 });
      else 証拠なし.push(rel);
    }
  };
  歩く('');

  /* ★終端の保存則(@codex)── 分類の枝を抜けた物が0であることを数える。
   *
   *   ★★だが【保存則:true】という1つの真偽は、読む人に「何も落ちていない」と読まれる
   *   (2026-09-03、@kozo が実測で指摘)。★★★実際に言えているのは【見た物の中で】である。
   *   実測: 見た 386 = 候補 60 + 証拠なし 326 + 読めない 0 は合うが、
   *   ★見ていない 4件は【見た】に入っていない ── 式の外に在る。
   *
   *   ★★だから宇宙を明示する: 宇宙 = 見た + 見ていない。
   *   ★★★2つの数を別に出し、どちらの話かを名前で分ける。 */
  const 終端 = 候補.length + 証拠なし.length + 読めない.length;
  const 見た側の保存則 = (終端 === 見た数);
  const 宇宙 = 見た数 + 見ていない.length;

  if (JSONで出す) {
    console.log(JSON.stringify({
      版: 'guardian-走査 v1', 根: 走査の根,
      台帳: fs.existsSync(path.join(走査の根, 書き手.台帳の相対)),
      /* ★走査は保持一覧を読まない ── ★★下見だけが読む(2026-09-03、@codex の線)。
       *   ★★★片方だけが黙って保持の情報を捨てる形にしないため、ここで明示する。 */
      retentionCoverage: "not-evaluated",
      束, 候補, 証拠なし, 見ていない, 読めない,
      数: {
        宇宙, 見た: 見た数, 見ていない: 見ていない.length,
        候補: 候補.length, 証拠なし: 証拠なし.length, 読めない: 読めない.length,
        見た側の保存則,
        /* ★宇宙の保存則は置かない ── ★★宇宙 = 見た + 見ていない は【定義】なので、
         *   ★★★どう壊しても true になる。赤くなれない緑は、この塊では検査と呼ばない。 */
        _注: "見た側の保存則 は【見た物の中で黙って消えた物が無い】。★これは【その現場の全部を見た】という意味では ありません ── 見ていない の分は最初から数えていません",
      },
    }, null, 1));
    process.exit(0);
  }

  const 強い順 = ['雛形と一致', '塊が置く道(中身は違う)', '塊が置く道', '印', '命令', '場所だけ', '名前だけ'];
  console.log('【走査だけ ── ★何も消していません】' + String.fromCharCode(10));
  console.log('根: ' + 走査の根);
  console.log('台帳: ' + (fs.existsSync(path.join(走査の根, 書き手.台帳の相対))
    ? '★在ります(--外す で、台帳が知る物だけを外せます)'
    : '★★在りません ── ★★★昔の導入か、台帳を消したかのどちらかです') + String.fromCharCode(10));

  console.log('■ 束 ' + 束.length + '件 ── ★pull.mjs と KIT_VERSION を持つフォルダ。**名前では見ていません**');
  for (const b of 束) console.log('   ・' + b.rel + '(版 ' + b.版 + ' ・ 中身 ' + b.中身 + '件)');
  if (!束.length) console.log('   (なし)');
  console.log('');

  /* ★候補を【強い証拠が在る】と【弱い証拠しかない】に分ける(2026-09-03、@claude の指摘)。
   *   ★★実物の現場で、現場自身のフック(.claude/hooks/sandbox.js)が候補に出た ──
   *   証拠は [命令] と [場所だけ] で、所有は主張していない。振る舞いとしては正しい。
   *   ★★★だが これは【消す物を人が選ぶ画面】である。同じ箱に並べると、人は消す。
   *
   *   ★強い = 塊が置いた事を示す(雛形と一致 / 塊が置く道 / 印)
   *   ★★弱い = 関わりを示すだけ(命令 / 場所だけ / 名前だけ)── ★★★所有の証明ではない。 */
  const 強い証拠 = new Set(['雛形と一致', '塊が置く道', '塊が置く道(中身は違う)', '印']);
  const 並べ = (一覧) => [...一覧].sort((a, b) =>
    強い順.indexOf(a.証拠[0].型) - 強い順.indexOf(b.証拠[0].型) || (a.rel < b.rel ? -1 : 1));
  const 出す = (一覧, 上限) => {
    for (const c of 並べ(一覧).slice(0, 上限)) {
      console.log('   ・' + c.rel);
      for (const e of c.証拠) console.log('        [' + e.型 + '] ' + e.詳細);
    }
    if (一覧.length > 上限) console.log('   …他' + (一覧.length - 上限) + '件');
  };
  const 強い候補 = 候補.filter((c) => c.証拠.some((e) => 強い証拠.has(e.型)));
  const 弱い候補 = 候補.filter((c) => !c.証拠.some((e) => 強い証拠.has(e.型)));

  console.log('■ 候補A ★塊が置いた事を示す証拠が在る ' + 強い候補.length + '件 ── ★★証拠は足しています(1件が複数 持ちます)');
  出す(強い候補, 60);
  if (!強い候補.length) console.log('   (なし)');
  console.log('');
  console.log('■ 候補B ★★関わりを示すだけの証拠しか無い ' + 弱い候補.length + '件 ── ★★★所有の証明では【ありません】');
  出す(弱い候補, 60);
  if (!弱い候補.length) console.log('   (なし)');
  if (弱い候補.length) {
    console.log('   ★ここに現場自身の物が混ざります(実測: 現場のフックが [命令] と [場所だけ] で出た)。');
    console.log('   ★★この箱を、まとめて消さないでください ── ★★★候補の出し方であって、判定ではありません。');
  }
  console.log('');

  console.log('■ 証拠なし ' + 証拠なし.length + '件 ── ★★この網では証拠が付きませんでした');
  console.log('   ★★★これは【塊の物ではない】証明ではありません ── 網の外に在るかもしれません');
  console.log('');
  console.log('■ 見ていない ' + 見ていない.length + '件 / 読めない ' + 読めない.length + '件');
  /* ★畳んでよいが、隠してはいけない ── 切ったら必ず「…他N件」を出す(2026-09-03) */
  for (const s of 見ていない.slice(0, 6)) console.log('   ・' + s.rel + '(' + s.理由 + ')');
  if (見ていない.length > 6) console.log('   …他' + (見ていない.length - 6) + '件(見ていない)');
  for (const s of 読めない.slice(0, 6)) console.log('   ・' + s.rel + '(' + s.理由 + ')');
  if (読めない.length > 6) console.log('   …他' + (読めない.length - 6) + '件(読めない)');
  console.log('');
  console.log('(★走査の宇宙: ' + 宇宙 + ' = 見た ' + 見た数 + ' + 見ていない ' + 見ていない.length + ')');
  console.log('(★★見た側の保存則: 見た ' + 見た数 + ' = 候補 ' + 候補.length + ' + 証拠なし ' + 証拠なし.length
    + ' + 読めない ' + 読めない.length + ' → ' + (見た側の保存則 ? '成り立つ' : '★★★破れています(黙って消えた物が在ります)') + ')');
  console.log('(★★★これは【見た物の中で消えた物が無い】という意味です ── '
    + 'その現場の全部を見た、という意味では ありません。見ていない ' + 見ていない.length + '件は最初から数えていません)');
  console.log('');
  console.log('★この走査は【消す物を決めません】。決めるのに足りないもの:');
  console.log('  ・命令 … その登録を塊が入れたのか、人が足したのかは、台帳が無いと分かりません');
  console.log('    ★★実例: no-reflex の登録は【どの版の install も一度も入れていません】(会議で161版を数えた)');
  console.log('  ・場所だけ / 名前だけ … ★★★所有の証明ではありません(候補の出し方です)');
  console.log('  ・証拠なし … この網では付かなかった、という観測にすぎません');
  console.log(String.fromCharCode(10) + '★次の一手は【人が決めること】です ── この一覧を見て、外す物を選んでください。');
  console.log('★★`--json` で機械が読む形、`--root <道>` で外の現場も走査できます(どちらも消しません)。');
  process.exit(0);
}



/* ---------- ① 台帳を読む(★無ければ UNKNOWN ── 消してよい物が分からないので) ---------- */
let 台帳 = null;
try { 台帳 = JSON.parse(fs.readFileSync(台帳の道, 'utf8')); } catch (_) {}
if (!台帳 || !Array.isArray(台帳.走行)) {
  console.log('★UNKNOWN ── 所有台帳が読めません: ' + rel(台帳の道));
  console.log('  ★★何を消してよいかの材料が在りません。**何も消していません。**');
  console.log('  ★★★入れた版が古い(台帳を作らない版)か、台帳が消されたかのどちらかです。');
  process.exit(2);
}

/* ---------- ①' 保持一覧(塊の既定 ∪ 現場の追加)── 2026-09-03、会議で @kozo と @codex が寄せた ----------
 *
 * ★何のために在るか: 塊が【名指しするが書かない】物は、書き手が無いので台帳に載らない。
 *   ★★だから「所有未確定」に落ち、判定は永久に UNKNOWN になる。
 *   ★★★だが これらは【機械で導けないから残す】のであって、分からないから残すのではない。
 *   その区別を、この一覧が持つ。
 *
 * ★合併の規則は【要らない】(@kozo)── 両方が「残す」としか言わないので、衝突が起きない。
 *   ★★聞く問いは1つ: 「この道は、どちらかの一覧に載っているか」= 和集合。
 *
 * ★★★現場が既定から【引く】ことは、できない(@kozo)──
 *   引けるようにすると、間違いが【消える】側に落ちる(不可逆)。
 *   足すだけなら、間違えても【残りすぎる】側に落ちる(可逆)。
 *
 * ★壊れた形・予約された道・広すぎる指定は【黙って無視しない】(@codex)── 設定の誤りとして出す。 */
const 保持 = new Map();          /* rel → { 理由, 根拠, 出どころ[] } */
const 保持の訴え = [];
{
  const 予約 = new Set([書き手.台帳の相対]);   /* ★台帳は保持できない ── 外す側が自分で消す物 */
  const 広すぎる = (rel) => !rel || rel === "." || rel === "./" || rel === "/"
    || rel.includes("*") || rel.includes("?") || rel.endsWith("/");
  const 足す = (件, 出どころ) => {
    const rel = 件 && typeof 件.rel === "string" ? 件.rel.trim() : null;
    if (!rel) { 保持の訴え.push(出どころ + ": rel が無い項が在ります"); return; }
    if (広すぎる(rel)) { 保持の訴え.push(出どころ + ": 広すぎる指定は受け付けません(" + rel + ")── ★exact path だけです"); return; }
    if (予約.has(rel)) { 保持の訴え.push(出どころ + ": 予約された道は保持できません(" + rel + ")── ★外す側が自分で消す物です"); return; }
    if (!件.理由) { 保持の訴え.push(出どころ + ": 理由の無い項は受け付けません(" + rel + ")── ★★理由が無い保持は、ただの見逃しと区別がつきません"); return; }
    /* ★引こうとする指定は【黙って通さない】(2026-09-03、@codex の線)。
     *   ★★足すだけなら間違いは「残りすぎる」側(可逆)。★★★引けるようにすると「消える」側(不可逆)。
     *   だから欄そのものを受け付けず、書かれていたら言う。 */
    for (const 欄 of ['削除可', '消してよい', 'delete', 'remove', '除く'])
      if (件[欄] !== undefined) 保持の訴え.push(出どころ + ": 【引く】指定は受け付けません(" + rel
        + " の " + 欄 + ")── ★保持一覧は足すだけです。引けるようにすると、間違いが【消える】側に落ちます");
    const 前 = 保持.get(rel);
    if (!前) 保持.set(rel, { 理由: [件.理由], 根拠: [件.根拠 || "(根拠なし)"], 出どころ: [出どころ] });
    else { 前.理由.push(件.理由); 前.根拠.push(件.根拠 || "(根拠なし)"); 前.出どころ.push(出どころ); }
  };
  /* ★塊の既定 */
  {
    const 先 = path.join(HERE, "保持一覧.json");
    const t = 読む(先);
    if (t == null) 保持の訴え.push("塊の既定(保持一覧.json)が読めません ── ★既定は無いものとして進みます");
    else {
      let j = null;
      try { j = JSON.parse(t); } catch (_) { j = null; }
      if (!j || !Array.isArray(j.既定)) 保持の訴え.push("塊の既定(保持一覧.json)の形が壊れています ── ★黙って0件にはしません");
      else for (const 件 of j.既定) 足す(件, "塊の既定");
    }
  }
  /* ★★現場の追加(guardian.config.json の retain 欄) */
  {
    const t = 読む(path.join(ROOT, "guardian.config.json"));
    if (t != null) {
      let c = null;
      try { c = JSON.parse(t); } catch (_) { c = null; }
      if (c && c.retain !== undefined) {
        if (!Array.isArray(c.retain)) 保持の訴え.push("現場の追加(guardian.config.json の retain)が配列ではありません");
        else for (const 件 of c.retain) 足す(件, "現場の追加");
      }
    }
  }
}

/* ---------- ② 全走行を合併する(★最初に置いた回を基準にする) ---------- */
const 基準 = new Map();
for (const 走 of 台帳.走行) {
  for (const x of (走.項 || [])) {
    const key = x.rootKind + '|' + x.rel + '|' + x.種類 + '|' + (x.hash || '');
    if (!基準.has(key)) 基準.set(key, x);
    else if (x.作った && !基準.get(key).作った) 基準.set(key, x);
  }
}
const 項 = [...基準.values()];
console.log('台帳: 走行 ' + 台帳.走行.length + '回 / 合併して ' + 項.length + '件');
console.log('');

/* ---------- ③ 1件ずつ見る ---------- */
const 消す = [];
const 衝突 = [];
const 触らない = [];
const フォルダ = [];  /* ★塊が作ったフォルダ(2026-09-03) */
/* ★育つ物 ── ★★install が【種】を置き、現場が育てることを案内が求めている物(2026-09-03)。
 *
 *   ★★★実測: 案内どおりに宣言と地図を埋めた現場で外すと、判定は CONFLICT だった。
 *   出た言葉は「入れたときから変わっています(この現場が育てた物なので、消しません)」──
 *   ★**育ったと分かっているのに、CONFLICT と呼んでいた。**
 *
 *   ★★CONFLICT は「何かが おかしい / 進めない」であって、
 *   ★★★「この道具を、案内どおりに使った」ではない。
 *
 *   ★育っていれば【期待保持】── 現場の物になったので、残すのが正しい。
 *   ★★育っていなければ(種のまま)消す ── 現場は何も書いていないので、塊の物である。 */
const 育つ物 = new Set(['guardian.config.json', 'docs/CODEMAP.md']);
const 育った = [];
const 所有未確定 = [];  /* ★今回の導入は作っていないが、いま在る物(2026-09-03) */
const 戻す = [];    /* ★入れる前の中身を持っている物(2026-09-03) */
const 戻した = [];
const 畳んだ = [];   /* ★空になって畳んだフォルダ(2026-09-03) */

for (const x of 項) {
  if (x.rootKind !== 'TARGET') continue;   /* BUNDLE 側はフォルダごと消える */
  const 先 = path.join(ROOT, x.rel);
  /* ★入れる前の中身を持っているなら、外したあと【バイトで戻す】対象にする(2026-09-03)。
   *   ★★所有の判定とは別の話 ── 元から在ったファイルでも、塊が書き足した所を抜いたあと
   *   整形や空行が残ることが在る。★★★見た目が同じでも git は差分を出す。それは残滓である。 */
  if (x.元 != null && !戻す.some((r) => r.rel === x.rel)) 戻す.push({ rel: x.rel, 道: 先, 元: x.元 });
  if (!x.作った) {
    /* ★「入れる前から在った」は【この導入が置いたのではない】だけで、★★「現場の物」ではない
     *   (2026-09-03、会議で @kozo・@codex・@claude の3席が同じ所を指した)。
     *   ★★★過去の Guardian が置いた物も、そっくり ここに入る。
     *
     *   実測(直す前): 昔の Guardian の docs/CODEMAP.md が在る現場で外すと、
     *   ★「触らない物(入れる前から在った)」と出て、判定は PASS、
     *   ★★「残っているのは③(現場の物)だけです」と言った ── ★★★読み替えている。
     *
     * ★@codex の表に寄せる:
     *   いま無い                     → 触らない(判定に影響なし)
     *   いま在る + 元を持っている     → ★★この導入が書き足した先。バイトで戻すので期待保持
     *   いま在る + 元を持っていない   → ★★★所有未確定(この導入は触っていない)→ UNKNOWN
     *
     * ★札も変える ── 「入れる前から在った」ではなく【今回の導入は作っていない】。
     *   観測した範囲を、札に入れる。 */
    if (!fs.existsSync(先)) { 触らない.push(x.rel + '(' + x.種類 + ' ── もう在りません)'); continue; }
    if (x.元 != null) { 触らない.push(x.rel + '(' + x.種類 + ' ── ★この導入が書き足した先。元へ戻します)'); continue; }
    if (!所有未確定.includes(x.rel)) 所有未確定.push(x.rel);
    触らない.push(x.rel + '(' + x.種類 + ' ── ★★今回の導入は作っていません。★★★所有は未確定です)');
    continue;
  }

  /* ★走行中に増えた物(2026-09-03、共通の書き手が載せた分)。
   *   ★★中身の指紋は持たない ── 走行ごとに変わるので「変わっている」としか言えないため。
   *   ★★★だから【塊が書いた】という一点だけで消す。人はこの道に書かない(書けば書き手が要る)。 */
  /* ★フォルダは【空になってから】畳む ── だからここでは計画に入れず、外した後に見る(2026-09-03) */
  if (x.種類 === 'フォルダ') { if (!フォルダ.includes(x.rel)) フォルダ.push(x.rel); continue; }

  if (x.種類 === '走行中の物') {
    if (!fs.existsSync(先)) { 触らない.push(x.rel + '(もう在りません)'); continue; }
    消す.push({ 種類: 'ファイル', 道: 先, rel: x.rel });
    continue;
  }
  if (x.種類 === 'ファイル') {
    const 中 = 読む(先);
    if (中 == null) { 触らない.push(x.rel + '(もう在りません)'); continue; }
    if (x.hash && 指紋(中) !== x.hash) {
      /* ★育つ物は【CONFLICT ではない】(2026-09-03)── 案内が「埋めてください」と言っている物である */
      if (育つ物.has(x.rel)) 育った.push(x.rel);
      else 衝突.push(x.rel + ' ── 入れたときから変わっています(この現場が育てた物なので、消しません)');
    } else {
      消す.push({ 種類: 'ファイル', 道: 先, rel: x.rel });
    }
  } else if (x.種類 === '区間') {
    const 中 = 読む(先);
    if (中 == null) { 触らない.push(x.rel + '(もう在りません)'); continue; }
    const 始 = 中.indexOf('<!-- guardian:begin');
    const 終印 = '<!-- guardian:end -->';
    const 終 = 中.indexOf(終印);
    if (始 < 0 || 終 < 始) { 衝突.push(x.rel + ' ── 区間の印が対で見つかりません'); continue; }
    const 区間 = 中.slice(始, 終 + 終印.length);
    if (x.hash && 指紋(区間) !== x.hash) {
      衝突.push(x.rel + ' ── 区間の中が変わっています(人が書き足した可能性)');
    } else {
      消す.push({ 種類: '区間', 道: 先, rel: x.rel, 始, 終: 終 + 終印.length });
    }
  } else if (x.種類 === 'JSON要素') {
    const 中 = 読む(先);
    if (中 == null) { 触らない.push(x.rel + '(もう在りません)'); continue; }
    let j = null;
    try { j = JSON.parse(中); } catch (_) { 衝突.push(x.rel + ' ── JSON が読めません'); continue; }
    /* ★台帳は要素の【指紋】しか持たない。いま在る要素を1つずつ指紋にして突き合わせる。
     *   ★★綴りに guardian が入っているかで探さない(2026-09-03、会議で決めた線)。 */
    let 当たり = 0, 場所 = null;
    for (const ev of Object.keys(j.hooks || {})) {
      const list = j.hooks[ev] || [];
      for (let gi = 0; gi < list.length; gi++) {
        const g = list[gi];
        for (let hi = 0; hi < (g.hooks || []).length; hi++) {
          const 印 = 指紋(JSON.stringify({ event: ev, matcher: g.matcher || null, entry: g.hooks[hi] }));
          if (印 === x.hash) { 当たり++; 場所 = { ev, gi, hi }; }
        }
      }
    }
    if (当たり === 1) 消す.push({ 種類: 'JSON要素', 道: 先, rel: x.rel, 印: x.hash });
    else if (当たり === 0) 衝突.push(x.rel + ' ── 入れた要素が見つかりません(編集・並び替え・既に外した)');
    else 衝突.push(x.rel + ' ── 同じ要素が ' + 当たり + '件 在ります(どれを外すか決められません)');
  }
  else {
    /* ★知らない種類は【黙って落とさない】(2026-09-03 の事故)。直す前は、どの枝にも当たらない
     *   種類('走行中の物')が if 連鎖を素通りし、消しもせず・触らないにも入らず、
     *   ★★台帳に載っているのに retained では「載っていません」と出ていた。 */
    衝突.push(x.rel + ' ── 台帳の種類「' + x.種類 + '」を、この外す側は知りません(外す側が古い可能性)');
  }
}

/* ---------- ④ 走査 ── ★台帳からではなく、その場に在る物から作る ---------- */
const 走査 = [];
/* ★塊のフォルダは【数で畳む】が、★★中に【塊の物でない物】が在れば名前で出す(2026-09-03)。
 *   ★★★フォルダ単位の要約で中を隠さないこと ── 隠すと「知らない物が無い」と読めてしまう。
 *   畳む理由: 中を全部 並べると26件が retained を埋め、本当に見てほしい物が埋もれる。 */
{
  const 塊の道 = path.join(ROOT, 'guardian');
  if (fs.existsSync(塊の道)) {
    let 配る = new Set();
    try {
      const s = fs.readFileSync(path.join(塊の道, 'pull.mjs'), 'utf8');
      const h = s.indexOf('const 配るもの = new Set([');
      if (h >= 0) 配る = new Set([...s.slice(h, s.indexOf(']);', h)).matchAll(/'([^']+)'/g)].map((m) => m[1]));
    } catch (_) {}
    let 中身 = [];
    try { 中身 = fs.readdirSync(塊の道); } catch (_) {}
    const 塊の物 = 中身.filter((f) => 配る.has(f));
    const よその物 = 中身.filter((f) => !配る.has(f));
    走査.push('guardian/(フォルダごと ── 塊の物 ' + 塊の物.length + '件)');
    /* ★配る宣言に無い物は、フォルダの中でも【1件ずつ名前で出す】 */
    for (const f of よその物) 走査.push('guardian/' + f + '(★配る宣言に無い ── 誰の物か分かりません)');
  }
}
for (const d of ['.guardian', '.claude', '.claude/commands', '.github/workflows']) {
  let 中身 = [];
  try { 中身 = fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }); } catch (_) { continue; }
  for (const e of 中身) {
    if (e.isDirectory()) continue;      /* 下の階は、その階の行で見る */
    走査.push(d + '/' + e.name);
  }
}
for (const f of ['guardian.config.json', 'docs/CODEMAP.md']) {
  if (fs.existsSync(path.join(ROOT, f))) 走査.push(f);
}
/* ★昔の名前(install が知っている分)も走査に入れる ── ★★フォルダなら中も1件ずつ */
for (const p of 昔の名前) {
  const 先 = path.join(ROOT, p);
  let st = null;
  try { st = fs.statSync(先); } catch (_) { continue; }
  if (!st.isDirectory()) { 走査.push(p); continue; }
  const 歩く = (rel, 深さ) => {
    if (深さ > 4) return;
    let es = [];
    try { es = fs.readdirSync(path.join(ROOT, rel), { withFileTypes: true }); } catch (_) { return; }
    for (const e of es) {
      const q = rel + '/' + e.name;
      if (e.isDirectory()) 歩く(q, 深さ + 1); else 走査.push(q);
    }
  };
  歩く(p, 0);
}

/* ---------- ⑤ 外す ---------- */
/* ---------- ④' ★【残す物 → 消す物】への依存を、消す前に見る(2026-09-03、会議で @codex が出した形) ----------
 *
 * ★実測(直す前): 現場の settings.json に `node guardian/hooks/no-reflex.js` を呼ぶフックが在る現場で
 *   外すと ── ★★判定 PASS。settings.json はバイトで元どおり。だが guardian/ は消える。
 *   → ★★★毎回の Edit/Write が「そんなファイルは無い」で落ちる。**残滓ではなく、壊れている。**
 *
 * ★「残しすぎれば安全」は、★★【残す物が単独で無害な時】だけ成り立つ(会議で @kozo が言い直した)。
 *   依存を持つ物を残すと、依存先が消えた瞬間に壊れる。
 *
 * ★★★消す【前】に見る ── 消してから「壊れました」と言うより、先に止まる方が安い。
 *
 * ★これは既に在る2つの検査の【3方向目】である:
 *   B13 (15.0)  配る物 → 現場の物   … 配布先で落ちる
 *   B13b(16.1)  除外した物 → 依存    … 理由の失効
 *   ここ        ★★残す物 → 消す物  … 依存切れ
 *
 * ★★網は【宣言する】── 全部を見たとは言わない。見た数と、見なかった理由を出す。 */
/* ★依存は【外したあとに残る中身】で測る(2026-09-03、実測で自分が踏んだ)。
 *   ★★直す前は【いまの中身】を見ていたので、★★★塊が自分で入れたフック4本まで
 *   「残る物が消す物に依存している」と数え、依存の無い現場でも 12件 出して止まっていた。
 *   → 消す前に、外したあとの中身を計算しておく。★消しはしない(帳面の上だけ)。 */
const NL = String.fromCharCode(10);   /* ★改行(この現場の流儀にそろえる) */
const 予定 = new Map();     /* rel → 外したあとの中身(null = ファイルごと消える) */
for (const c of 消す) {
  if (c.種類 === 'ファイル') { 予定.set(c.rel, null); continue; }
  const 元本 = 予定.has(c.rel) ? 予定.get(c.rel) : 読む(c.道);
  if (元本 == null) continue;
  if (c.種類 === '区間') {
    予定.set(c.rel, (元本.slice(0, c.始) + 元本.slice(c.終)).replace(/\n{3,}/g, NL + NL));
  } else if (c.種類 === 'JSON要素') {
    let j = null;
    try { j = JSON.parse(元本); } catch (_) { continue; }
    let 外した = false;
    for (const ev of Object.keys(j.hooks || {})) {
      const list = j.hooks[ev] || [];
      for (let gi = 0; gi < list.length && !外した; gi++) {
        const g = list[gi];
        for (let hi = 0; hi < (g.hooks || []).length; hi++) {
          if (指紋(JSON.stringify({ event: ev, matcher: g.matcher || null, entry: g.hooks[hi] })) !== c.印) continue;
          g.hooks.splice(hi, 1);
          if (!g.hooks.length) list.splice(gi, 1);
          if (!list.length) delete j.hooks[ev];
          外した = true; break;
        }
      }
    }
    予定.set(c.rel, JSON.stringify(j, null, 2) + NL);
  }
}
/* ★バイトで戻す物は、戻したあとの中身が残る ── ★★元の中身にも依存が在り得る(実測: no-reflex) */
for (const x of 項) {
  if (x.元 == null) continue;
  const 今 = 予定.has(x.rel) ? 予定.get(x.rel) : 読む(path.join(ROOT, x.rel));
  if (今 == null) continue;
  const 解く = (t) => { try { return JSON.stringify(JSON.parse(t)); } catch (_) { return null; } };
  const A = 解く(今), B = 解く(x.元);
  const 同じ = (A != null && B != null) ? (A === B) : (今.trimEnd() === x.元.trimEnd());
  if (同じ) 予定.set(x.rel, x.元);
}

const 依存 = [];
const 依存の網 = { 見た: 0, 飛ばした: [], 見ない形: [], 上限: 4000, 大きさの上限: 512 * 1024 };
{
  /* ★消えるとどうなるかを聞く相手 = 塊の束 と、この回で消すファイル */
  const 消える = new Set(['guardian']);
  for (const c of 消す) if (c.種類 === 'ファイル') 消える.add(c.rel);

  const 見ない = new Set(['.git', 'node_modules', 'guardian']);
  const 歩く = (相対) => {
    if (依存の網.見た >= 依存の網.上限) return;
    let 中身 = [];
    try { 中身 = fs.readdirSync(path.join(ROOT, 相対 || '.'), { withFileTypes: true }); } catch (_) { return; }
    for (const e of 中身) {
      const rel = 相対 ? 相対 + '/' + e.name : e.name;
      if (e.isDirectory()) { if (!見ない.has(e.name)) 歩く(rel); continue; }
      if (消える.has(rel)) continue;                     /* ★消える物の中は見ない(消えるので) */
      /* ★台帳そのものは見ない(2026-09-03、実測で自分が引っかかった)。
       *   ★★台帳は【入れる前の写し(元)】を持つので、現場の綴りをそのまま含む。
       *   ★★★それを依存と読むと、【台帳が塊に依存している】という無い話になる。
       *   台帳は最後に自分で消えるので、依存の主体ではない。 */
      if (rel === 書き手.台帳の相対) continue;
      if (依存の網.見た >= 依存の網.上限) { 依存の網.飛ばした.push('上限 ' + 依存の網.上限 + ' 件に達しました'); return; }
      let st = null;
      try { st = fs.statSync(path.join(ROOT, rel)); } catch (_) { continue; }
      if (!予定.has(rel) && st.size > 依存の網.大きさの上限) { 依存の網.飛ばした.push(rel + '(大きすぎます)'); continue; }
      let t = null;
      if (予定.has(rel)) { t = 予定.get(rel); if (t == null) continue; }   /* ★外したあとの中身 */
      else { try { t = fs.readFileSync(path.join(ROOT, rel), 'utf8'); } catch (_) { continue; } }
      if (t.indexOf(String.fromCharCode(0)) >= 0) continue;   /* 文字の入れ物ではない */
      /* ★見るのは【実行される位置に在る綴り】だけ(上の 実行される綴り を見ること) */
      const 実行部 = 実行される綴り(rel, t);
      if (実行部 == null) { 依存の網.見ない形.push(rel); continue; }
      t = 実行部;
      依存の網.見た++;
      /* ★束の中の道を名指ししているか ── ★★綴りで所有は決めないが、【依存】は綴りで見るしかない。
       *   ★★★所有(誰の物か)と依存(消えたら壊れるか)は別の問いである。 */
      /* ★同じ理由で、依存の網も 空白と区切り で止める(2026-09-03) */
      const 出 = t.match(new RegExp("guardian/[^\\s\"'`;|&<>()]+", "g"));
      if (!出) continue;
      for (const 道 of [...new Set(出)]) {
        if (!fs.existsSync(path.join(ROOT, 道))) continue;    /* いま無い物は、消えても変わらない */
        依存.push({ 読み手: rel, 参照先: 道 });
      }
    }
  };
  歩く('');
}
/* ★読み手が【ファイルごと消える】なら、依存切れにはならない(その行も一緒に消える)。
 *   ★★JSON要素 や 区間 だけ外す物は【ファイルが残る】── ★★★そこは依存切れになる。 */
const 依存衝突 = 依存.filter((d) => !消す.some((c) => c.rel === d.読み手 && c.種類 === 'ファイル'));


/* ★依存が切れる物が在るなら、【何も消さない】(2026-09-03)。
 *   ★★束を消した瞬間に壊れるので、消してから言っても遅い。
 *   ★★★これは CONFLICT である ── 人が「その登録を外してよいか」を決める話。 */
if (実行 && 依存衝突.length) {
  console.log('★★消しませんでした ── 残る物が、消す物に依存しています(下の【依存切れ】)');
}
if (実行 && !依存衝突.length) {
  for (const c of 消す) {
    try {
      if (c.種類 === 'ファイル') {
        fs.rmSync(c.道, { force: true });
      } else if (c.種類 === '区間') {
        const 中 = 読む(c.道);
        if (中 != null) fs.writeFileSync(c.道, (中.slice(0, c.始) + 中.slice(c.終)).replace(/\n{3,}/g, '\n\n'));
      } else if (c.種類 === 'JSON要素') {
        /* ★場所(添字)は【計画したときの物】── 1件 外すと後ろの添字がずれる。
         *   ★★実測(2026-09-03): 添字で外したら、4本のうち1本が残ったまま PASS と出た。
         *   ★★★だから外す瞬間に【指紋でもう一度 探して】から外す。添字は持ち越さない。 */
        const j = JSON.parse(読む(c.道));
        let 外した = false;
        for (const ev of Object.keys(j.hooks || {})) {
          const list = j.hooks[ev] || [];
          for (let gi = 0; gi < list.length && !外した; gi++) {
            const g = list[gi];
            for (let hi = 0; hi < (g.hooks || []).length; hi++) {
              const 印 = 指紋(JSON.stringify({ event: ev, matcher: g.matcher || null, entry: g.hooks[hi] }));
              if (印 !== c.印) continue;
              g.hooks.splice(hi, 1);
              if (!g.hooks.length) list.splice(gi, 1);
              if (!list.length) delete j.hooks[ev];
              外した = true;
              break;
            }
          }
        }
        if (!外した) 衝突.push(c.rel + ' ── 外そうとした要素が見つかりませんでした');
        fs.writeFileSync(c.道, JSON.stringify(j, null, 2) + '\n');
      }
    } catch (e) {
      衝突.push(c.rel + ' ── 外せませんでした: ' + (String(e && e.message).length > 60 ? String(e && e.message).slice(0, 60) + '…(以下 略)' : String(e && e.message)));
    }
  }

  /* ★入れる前の中身に【バイトで】戻す(2026-09-03)。
   *
   *   ★実測(直す前、GitHub の枝から取って往復した現場):
   *     git status → ★★M CLAUDE.md(空行が1つ増えた) / M .claude/settings.json(2字下げのまま)
   *     ★★★どちらも cat では同じに見える。**見えない残滓である。**
   *
   *   ★戻すのは【意味が変わっていないとき】だけ ── 人がその後に書き足していたら、
   *   ★★戻すことは人の仕事を消すことになる。だから比べてから決める。 */
  for (const r of 戻す) {
    const 今 = 読む(r.道);
    if (今 == null || 今 === r.元) continue;
    let 同じ = false;
    const 解く = (t) => { try { return JSON.stringify(JSON.parse(t)); } catch (_) { return null; } };
    const A = 解く(今), Bt = 解く(r.元);
    if (A != null && Bt != null) 同じ = (A === Bt);                       /* JSON は【意味】で比べる */
    else 同じ = (今.trimEnd() === r.元.trimEnd());   /* ★文書は末尾の空きを除いて比べる(正規表現を書かない ── 逃がしを1つ落とすと黙って外れる) */
    if (!同じ) { 触らない.push(r.rel + '(★入れたあとに人が書き足しています ── 元へは戻しません)'); continue; }
    try { fs.writeFileSync(r.道, r.元); 戻した.push(r.rel); } catch (_) {}
  }

  /* ★作ったフォルダを畳む(2026-09-03)。★★手で並べた一覧は持たない ──
   *   直す前は ['.claude/commands', ...] と書いていた。それは【書き込みを足した人が
   *   一覧を直し忘れると黙って漏れる】形で、★★★共通の書き手を作った理由と同じ穴である。
   *   ★深い方から畳む(下が空になって初めて上が空になる)。中に何か在れば触らない。 */
  for (const d of フォルダ.sort((a, b) => b.split('/').length - a.split('/').length)) {
    const 道 = path.join(ROOT, d);
    try {
      if (fs.readdirSync(道).length === 0) { fs.rmdirSync(道); 畳んだ.push(d + '/'); }
      else 触らない.push(d + '/(★中に物が在ります ── 現場が使っているので畳みません)');
    } catch (_) {}
  }
}

/* ---------- ⑤' 外した後に【本当に消えたか】を見る ----------
 *
 * ★実測(2026-09-03): 直す前は、計画した10件のうち2種類が残ったまま【PASS】と出した。
 *   ★★フックは添字のずれで1本 残り、区間は「元から在った」と誤って読んで手を付けなかった。
 * ★★★判定を【計画】から出していたのが原因である。計画は「やるつもり」であって、結果ではない。
 *   ここで実物を見て、残っていれば CONFLICT に落とす ── PASS は、確かめてから名乗る。 */
if (実行) {
  for (const c of 消す) {
    if (c.種類 === 'ファイル') {
      if (fs.existsSync(c.道)) 衝突.push(c.rel + ' ── 外したはずが、まだ在ります');
    } else if (c.種類 === '区間') {
      const 中 = 読む(c.道);
      if (中 != null && 中.includes('<!-- guardian:begin')) {
        衝突.push(c.rel + ' ── 区間を外したはずが、まだ在ります');
      }
    } else if (c.種類 === 'JSON要素') {
      const 中 = 読む(c.道);
      if (中 == null) continue;
      let j = null;
      try { j = JSON.parse(中); } catch (_) { continue; }
      for (const ev of Object.keys(j.hooks || {})) {
        for (const g of (j.hooks[ev] || [])) {
          for (const e of (g.hooks || [])) {
            const 印 = 指紋(JSON.stringify({ event: ev, matcher: g.matcher || null, entry: e }));
            if (印 === c.印) 衝突.push(c.rel + ' ── 外したはずの要素が、まだ在ります');
          }
        }
      }
    }
  }
}

/* ---------- ⑥ 出す ---------- */
/* ★「消した」と数えてよいのは【ファイルごと消した物】だけ(2026-09-03、実測で見つけた)。
 *   ★★要素や区間を外しただけの物は、ファイル自体は【残っている】。
 *   ★★★直す前は .claude/settings.json が retained から消えていた ──
 *   中の4件を外しただけで、ファイルは現場の物として残っているのに。
 *   残っている物を retained から隠すのは、フォルダ要約で中を隠すのと同じ形である。 */
const 消した道 = new Set(消す.filter((c) => c.種類 === 'ファイル').map((c) => c.rel));
const retained = 走査.filter((p) => !消した道.has(p) && p !== 書き手.台帳の相対);


console.log((実行 && !依存衝突.length ? '【外しました】'
  : 実行 ? '【★止めました ── 依存が切れるので、何も消していません】'
  : '【確かめただけ ── 何も消していません】') + String.fromCharCode(10));
console.log('外す物 ' + 消す.length + '件:');
if (依存衝突.length) {
  console.log(String.fromCharCode(10) + "★依存切れ " + 依存衝突.length + "件(★★残す物が、消す物を名指ししています):");
  for (const d of 依存衝突) console.log('  ・' + d.読み手 + ' → ' + d.参照先);
  console.log('  ★★★束を消すと、この呼び出しは【そんなファイルは無い】で落ちます。');
  console.log('  ★所有は台帳で決まりますが、★★依存は綴りで見るしかありません ── 別の問いです。');
  console.log('  ★★★人が決めてください: その登録を外す / それとも塊を残す。');
}
if (依存の網.飛ばした.length) {
  console.log(String.fromCharCode(10) + "★依存の網から外れた物 " + 依存の網.飛ばした.length + "件(★★見ていません):");
  for (const s of 依存の網.飛ばした.slice(0, 5)) console.log('  ・' + s);
  if (依存の網.飛ばした.length > 5) console.log('  …他' + (依存の網.飛ばした.length - 5) + '件');
}
console.log(String.fromCharCode(10) + "(依存の網: " + 依存の網.見た + "ファイルを読みました。★.git / node_modules / guardian/ は見ていません。★★実行しない形(文書など)" + 依存の網.見ない形.length + "件も見ていません ── 文書が道を名指しするのは説明であって依存ではないため)");
for (const c of 消す) console.log('  ・' + c.rel + '(' + c.種類 + ')');
if (戻した.length) {
  console.log(String.fromCharCode(10) + "★入れる前の中身に戻したファイル " + 戻した.length + "件(バイトで一致):");
  for (const r of 戻した) console.log('  ・' + r);
}
if (畳んだ.length) {
  console.log(String.fromCharCode(10) + "★空になったので畳んだフォルダ " + 畳んだ.length + "件:");
  for (const d of 畳んだ) console.log('  ・' + d);
}
if (触らない.length) {
  console.log('\n触らない物 ' + 触らない.length + '件(入れる前から在った / もう無い):');
  for (const t of 触らない) console.log('  ・' + t);
}
if (衝突.length) {
  console.log('\n★CONFLICT ' + 衝突.length + '件(消しません ── 人が見てください):');
  for (const c of 衝突) console.log('  ・' + c);
}
/* ★ここに在った 塊が書く名(塊のコードから .guardian/ の名前を拾う)は、22.0 で判定から外し、
 *   23.4 の定期監査で【呼ばれていない記号】として出た(2026-09-03)。
 *   ★★消した理由は「使っていないから」ではなく、★★★**コメントが嘘になっていたから**である ──
 *   「報告で印にだけ使う」と書いてあったが、実際はどこからも呼ばれていなかった。
 *   ★死んだコードより、**死んだ説明**の方が高くつく(読んだ人が「在る」と思う)。 */

const 束 = retained.filter((r) => r.startsWith('guardian/'));
/* ★.guardian/ に在る物は【既定で所有未確定】(2026-09-03、会議で @kozo が化石を名指しした)。
 *
 *   ★★直す前は「いまの塊が書く名か」で見ていた ── ★★★だから【昔の塊が書いた名】は
 *   一覧に無く、③現場の物(期待どおり残す)に落ちて、判定は PASS だった。
 *
 *   実測: .guardian/codemap_audit_at(過去の Guardian の化石)を置くと
 *   ★「③ 現場の物」に出て、★★「誰の物か決まっていない物も在りません」と言った。
 *   → ★★★過去の導入の資産を、現場の資産だと宣言していた(17.3 で直したのと同じ形の再発)。
 *
 * ★だから向きを変える: `.guardian/` は【塊が作ったフォルダ】である。
 *   ★★その中に在って、台帳にも保持一覧にも無い物は ── **誰の物か分からない**。
 *   ★★★場所は所有の証明ではないが、「分からない」と言うには足りる。
 *
 * ★出口は【保持一覧】── 現場が「これは自分の物だ」と理由付きで宣言すれば、期待保持へ上がる。
 *   ★★塊が書く名の一覧は、もう判定には使わない(下の報告で「塊が名指ししている」印にだけ使う)。 */
/* ★どのフォルダが【塊が作った物】か ── ★★台帳のフォルダの項(作った:true)から取る。
 *   ★★★.guardian/ は必ず塊の物(台帳そのものの置き場)なので、載っていなくても足す。
 *
 *   ★実測(2026-09-03、会議が実物で見つけた): 過去の Guardian の化石 codemap_audit_at は
 *   ★★.guardian/ ではなく **.claude/ に在った** ── 20.1 の直しは【一階ずれて】いた。
 *   → .guardian/ だけを見ていたので、.claude/ の化石は ③現場の物 に落ちて PASS だった。
 *
 *   ★★★向きは同じ: **塊が作ったフォルダの中に在って、台帳にも保持一覧にも無い物は、
 *   誰の物か分からない。** 場所は所有の証明ではないが、「分からない」と言うには足りる。
 *   ★元から在ったフォルダ(現場の .claude/ など)は載らないので、中身は現場の物のままである。 */
/* ★【フォルダを誰が作ったか】では所有を推定しない(2026-09-03、@codex の指摘で外した)。
 *
 *   ★★21.1 では「塊が作ったフォルダの中 → 所有未確定 / 元から在ったフォルダの中 → 現場の物」
 *   としていた。★★★だが**フォルダが元から在っても、そこへ書いたのが過去の塊かもしれない**。
 *   実物がそれである: 現場が元から持つ .claude/ に、過去の Guardian の codemap_audit_at が居た。
 *
 *   ★フォルダの出自は【誰がその中の1枚を書いたか】を何も言わない ── 推定が不健全だった。
 *
 * ★★だから【塊が書き込む場所】で見る(場所は所有の証明ではないが、「分からない」と言うには足りる)。
 *   ★★★出口は保持一覧 ── 現場が「これは自分の物だ」と理由付きで宣言すれば、期待保持へ上がる。
 *
 *   ★これは うるさくなる方へ倒す判断である: 現場自身の .claude/commands/*.md も、
 *   ★★宣言するまで UNKNOWN になる。★★★だが「分からない物を、現場の物だと言う」よりは良い。 */
/* ★塊が書き込む場所 は、上(門のすぐ後)で1本だけ決めている ── ここでは決め直さない */
/* ★台帳が知っている道は、盲点ではない(2026-09-03、札と実装がずれていた)。
 *   ★★札には「台帳にも保持一覧にも無い物」と書いていたが、★★★実装は場所しか見ていなかった。
 *   実測: 台帳が 作った:false で持つ .claude/settings.json が、盲点に出ていた。 */
const 台帳が知る道 = new Set(項.map((x) => x.rel));
/* ★昔の名前の下も【塊が書き込む場所】として見る(2026-09-03)── ★★かつてはそうだった。
 *   ★★★「現場の物」だと言い切れないので、所有未確定(UNKNOWN)へ落とす。 */
const 見る場所 = [...塊が書き込む場所, ...昔の名前.map((p) => p + '/')];
const 盲点 = retained.filter((r) => (見る場所.some((d) => r.startsWith(d)) || 昔の名前.includes(r))
  && !台帳が知る道.has(r));
/* ★所有未確定も【盲点】に入れる(2026-09-03)── ★★UNKNOWN の材料を1つにまとめる。
 *   ★★★別の箱にすると、判定を組むとき片方を忘れる(16.5 で一度そうなった)。 */
for (const r of 所有未確定) if (retained.includes(r) && !盲点.includes(r)) 盲点.push(r);
/* ★保持一覧に載っている物は【期待保持】へ上げる(2026-09-03、会議で寄せた形)。
 *   ★★「機械で導けないから残す」と、人が理由付きで宣言した物 ── ★★★分からないのではない。 */
const 保持で上げた = [];
for (let i = 盲点.length - 1; i >= 0; i--) {
  if (!保持.has(盲点[i])) continue;
  保持で上げた.push(盲点[i]);
  盲点.splice(i, 1);
}
/* ★保持で上げた物は、②' に出したので ③ には出さない(2026-09-03、実測で二重に出ていた)。
 *   ★★どちらも「残す」だが、★★★出どころが違う ──
 *   ②' は【塊の territory に在って、人が理由付きで残すと宣言した物】、
 *   ③ は【最初から現場の物】。混ぜると、宣言が要る物と要らない物の区別が消える。 */
const 現場の物 = retained.filter((r) => !束.includes(r) && !盲点.includes(r) && !保持で上げた.includes(r));

/* ★保持一覧の読み取りで言うことが在るなら、それは【不明】である(2026-09-03、@codex の線)。
 *   ★★人が「残したい」と書いた物を、こちらが受け付けなかった ──
 *   ★★★その物が守られているかどうか、こちらには分からない。
 *   実測(直す前): 広すぎる指定・予約された道・理由の無い項の3通りとも、
 *   言うだけ言って【判定は PASS】だった ── 16.5 で直したのと同じ形を、また作っていた。 */
/* ★下見と本番を、要約の行でも見分けられるようにする(2026-09-03、★★外の監査役が実測)。
 *
 *   ★★★実測(直す前): 同じ1回の走行の中で
 *     3行目 「【確かめただけ ── 何も消していません】」
 *     31行目「…(10件 外しました)」   ← ★逆のことを言っている
 *   実物は残っているので、正しいのは3行目。★★そして --外す を回しても31行目は一字も変わらない ──
 *   ★★★**要約の行だけを読むと、下見と本番が区別できない。**
 *
 *   ★これは撤去という【不可逆な仕事】の計器なので、
 *   ★★「もう外した」と誤読した人が guardian/ を手で消すと、
 *   ★★★settings.json に残った登録が、存在しないファイルを呼び続ける。 */
const 外した数 = (n) => n + (実行 && !依存衝突.length ? '件 外しました' : '件 外せます(★まだ外していません)');

const 判定 = (衝突.length || 依存衝突.length) ? 'CONFLICT'
  : ((盲点.length || 保持の訴え.length) ? 'UNKNOWN' : 'PASS');

/* ★下見の JSON(2026-09-03、会議で @codex が求めた形)。
 *   ★★人の文と【同じ計算】から出す ── 2つの分類器を並べない。
 *   ★★★渡すのは分類と証拠だけで、消しはしない(下見なので当たり前だが、形でも守る)。
 *
 *   ★保持一覧を読むのは この道(下見)だけである。走査は読まない ──
 *   ★★だから走査の JSON には retentionCoverage を "not-evaluated" と書く(片方だけ黙らない)。 */
if (静かにする) {
  console.log = 本当のlog;
  console.log(JSON.stringify({
    形: 'guardian-撤去計画 v1',
    根: ROOT,
    版: (() => { try { return fs.readFileSync(path.join(HERE, "KIT_VERSION"), "utf8").trim(); } catch (_) { return null; } })(),
    台帳: { 在る: true, 走行: 台帳.走行.length, 合併した項: 項.length },
    retentionCoverage: "evaluated",
    保持一覧: [...保持.entries()].map(([rel, h]) => ({ rel, 理由: h.理由, 根拠: h.根拠, 出どころ: h.出どころ })),
    保持の訴え,
    計画: { 消す: 消す.map((c) => ({ rel: c.rel, 種類: c.種類 })), 触らない, 衝突, 依存切れ: 依存衝突 },
    残る: {
      束, 盲点, 保持で上げた, 育った, 現場の物,
      _注: "束=塊の束(フォルダごと) / 盲点=塊が書き込む場所に在って台帳にも保持一覧にも無い"
        + " / 保持で上げた=人が理由付きで残すと宣言した / 育った=案内が埋めてと言う物 / 現場の物=最初から現場の物",
    },
    依存の網: { 見た: 依存の網.見た, 飛ばした: 依存の網.飛ばした, 見ない形: 依存の網.見ない形.length },
    判定,
    出口: (判定 === "CONFLICT" ? 1 : (判定 === "UNKNOWN" ? 2 : 0)),
    人の文,   /* ★人向けの報告も捨てずに渡す(片方だけ黙らない) */
  }, null, 1));
  process.exit(判定 === "CONFLICT" ? 1 : (判定 === "UNKNOWN" ? 2 : 0));
}


console.log('\n★retained(★★走査で在った物 − 消した物) ' + retained.length + '件 ── 3つに分けます:');
console.log('\n  ① 塊の束(★フォルダごと消す場所) ' + 束.length + '件:');
for (const r of 束) console.log('     ・' + r);
/* ★札は測った通りに書く ── ここで拾えているのは【塊のコードが名指ししている】までで、
 *   ★★【塊が書いている】ではない。実測(2026-09-03、会議): `踏んだこと` は
 *   hooks/clock.js が読むだけで、書き手はこの塊のどこにも無い(=人が書く物)。
 *   ★★★「書く名」と書くと、次の人が「塊の物だから消してよい」と読む。それは事故になる。 */
console.log('\n  ② ★★塊が書き込む場所に在って、台帳にも保持一覧にも無い物(★★★誰の物か分かりません) ' + 盲点.length + '件:');
for (const r of 盲点) console.log('     ・' + r
  + '  ← ★台帳にも保持一覧にも在りません(★★昔の導入の物かもしれません)');
if (!盲点.length) console.log('     (なし)');
/* ★保持一覧で上げた物を、③の【手前】に別に出す(2026-09-03)──
 *   ★★「現場の物」と混ぜない。★★★こちらは【塊が名指しするが書かない物】で、
 *   人が理由付きで「機械で導けないから残す」と宣言した物である。 */
/* ★育った物を、別の箱で出す(2026-09-03)── ★★CONFLICT でも、誰の物か分からないのでもない */
if (育った.length) {
  console.log(String.fromCharCode(10) + "  ②\" 現場が【育てた】物 " + 育った.length + "件(★入れたときの種から変わっています):");
  for (const r of 育った) console.log("     ・" + r + " ── ★★案内が「埋めてください」と言っている物なので、残します");
}
if (保持で上げた.length) {
  console.log(String.fromCharCode(10) + "  ②' 保持一覧で【残す】と宣言された物 " + 保持で上げた.length + "件:");
  for (const r of 保持で上げた) {
    const h = 保持.get(r);
    console.log("     ・" + r);
    console.log("        理由: " + h.理由.join(" / "));
    console.log("        根拠: " + h.根拠.join(" / ") + "(出どころ: " + h.出どころ.join(" + ") + ")");
  }
}
if (保持の訴え.length) {
  console.log(String.fromCharCode(10) + "  ★保持一覧の読み取りで言うこと " + 保持の訴え.length + "件:");
  for (const t of 保持の訴え) console.log("     ・" + t);
}
console.log('\n  ③ 現場の物(★期待どおり残す) ' + 現場の物.length + '件:');
for (const r of 現場の物) console.log('     ・' + r);
if (!現場の物.length) console.log('     (なし)');

/* ★判定の対応(2026-09-03、会議で寄った線):
 *   ★★変更あり(塊の物を人が触った) → CONFLICT
 *   ★★★未分類(誰の物か決まっていない) → UNKNOWN ── ★不明は合格ではない
 *   期待保持(現場の物)は PASS の邪魔をしない。
 * ★直す前は、未分類が在っても PASS と出していた ── 測っていない物を、緑に数えていた。 */
/* ★依存切れも CONFLICT である(2026-09-03)── ★★残滓は無くても【壊れている】から。
 *   ★★★実測(直す前): 現場のフックが guardian/hooks/no-reflex.js を呼ぶ現場で、判定は PASS だった。 */
console.log('\n判定: ★' + 判定);
if (判定 === 'CONFLICT') {
  console.log('  ★★塊の物のうち、人が触った物が在ります ── 消していません。人が見てください。');
} else if (判定 === 'UNKNOWN') {
  console.log('  ★★【台帳が知る】塊の持ち物は、★残り 0 件です(' + 外した数(消す.length) + ')。');
  console.log('  ★★★ですが、誰の物か決まっていない物が ' + 盲点.length + '件 在ります(上の②)。');
  if (保持の訴え.length) console.log('  ★保持一覧で受け付けなかった指定が ' + 保持の訴え.length + '件 在ります ── ★★人が「残したい」と書いた物が守られているか、こちらには分かりません。');
  console.log('  ★だから「残滓ゼロ」とは言いません ── ★★不明は合格ではありません。');
  console.log('  ★★★②が【この現場の物】なら、guardian.config.json の retain に exact path と理由を足してください。');
  console.log('  ★見覚えが無い / 昔の Guardian の物かもしれない物は、★★足さずに候補のまま残してください。');
  console.log('  ★★★緑にするための一括追加はしないこと ── 足した行は後で消せますが、消しても【削除の許可】にはなりません。');
} else {
  console.log('  ★★【台帳が知る】塊の持ち物は、★残り 0 件です(' + 外した数(消す.length) + ')。誰の物か決まっていない物も在りません。');
  console.log('  ★★★この一覧に残っているのは③(現場の物)だけです。');
  console.log('  ★ただし【見た場所】は次に限ります ── ' + [...見る場所, 'guardian.config.json', 'docs/CODEMAP.md', 'guardian/'].join(' / '));
  console.log('  ★★ここに無い場所は【見ていません】── 「現場に何も残っていない」という意味では ありません。');
}

if (実行 && 判定 === 'PASS') {
  try {
    fs.rmSync(台帳の道, { force: true });
    console.log('\n★台帳も最後に消しました(PASS なので)');
    /* ★台帳を外して初めて .guardian は空になり得る ── だからここで畳む(2026-09-03) */
    const g = path.join(ROOT, '.guardian');
    try { if (fs.readdirSync(g).length === 0) { fs.rmdirSync(g); console.log('★.guardian/ も空になったので畳みました'); } } catch (_) {}
  } catch (_) {}
} else if (実行) {
  console.log('\n★台帳は残しました(' + 判定 + ' なので ── 直してから、もう一度 回せます)');
}
/* ★出口も判定に揃える(0=PASS / 1=CONFLICT / 2=UNKNOWN) */
process.exit(判定 === 'CONFLICT' ? 1 : (判定 === 'UNKNOWN' ? 2 : 0));
