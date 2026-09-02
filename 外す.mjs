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

const 実行 = process.argv.includes('--外す');
const 走査だけ = process.argv.includes('--走査');

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
 *   道に guardian が入っているのは【候補の出し方】であって、所有の証明ではない。
 *   実測の裏付け(@kozo が 161版を数えた): settings.json に居る no-reflex の登録は、
 *   ★どの版の install も【一度も登録していない】── 道は塊の物に見えるのに、人が足した物だった。
 *
 * ★根拠の強さを、そのまま名前にして出す:
 *   束        … pull.mjs と KIT_VERSION を持つフォルダ = 塊の束
 *   ★★指紋一致 … 配る雛形と1バイトも違わない = 塊が置いて、誰も触っていない
 *   印        … CLAUDE.md の guardian:begin/end = その区間は塊の物
 *   ★★★命令   … フックの command が束を名指ししている = 塊に向けて登録されている
 *                (★誰が登録したかは分からない ── 人が手で足した例が実在する)
 *   名前だけ  … ★★上のどれでもない = 候補にしかならない */
if (走査だけ) {
  const 出 = { 束: [], 指紋一致: [], 印: [], 命令: [], 名前だけ: [] };
  const 見ない = new Set([".git", "node_modules"]);

  /* ★雛形は、現場の束から取る ── ★★無ければ、いま走っているこの塊から取る */
  const 雛形 = new Map();   /* 指紋 → 雛形の名 */
  {
    const 置き場 = [path.join(ROOT, "guardian", "templates"), path.join(HERE, "templates")];
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

  const 歩く = (相対) => {
    let es = [];
    try { es = fs.readdirSync(path.join(ROOT, 相対 || "."), { withFileTypes: true }); } catch (_) { return; }
    for (const e of es) {
      const rel = 相対 ? 相対 + "/" + e.name : e.name;
      if (e.isDirectory()) {
        if (見ない.has(e.name)) continue;
        /* ★束かどうかは【中身】で見る ── 名前では見ない */
        const 束か = fs.existsSync(path.join(ROOT, rel, "pull.mjs"))
          && fs.existsSync(path.join(ROOT, rel, "KIT_VERSION"));
        if (束か) {
          let 版 = "(読めません)";
          try { 版 = String(fs.readFileSync(path.join(ROOT, rel, "KIT_VERSION"), "utf8")).trim(); } catch (_) {}
          let 数 = 0;
          try { 数 = fs.readdirSync(path.join(ROOT, rel)).length; } catch (_) {}
          出.束.push(rel + "/(版 " + 版 + " ・ 中身 " + 数 + "件)");
          continue;   /* ★束の中は歩かない(丸ごと1件として出す) */
        }
        歩く(rel);
        continue;
      }
      const t = 読む(path.join(ROOT, rel));
      if (t == null) continue;
      /* ★★指紋一致 ── 配る雛形と1バイトも違わない */
      const 名 = 雛形.get(指紋(t));
      if (名) { 出.指紋一致.push(rel + "(雛形 " + 名 + " と一致)"); continue; }
      /* ★印 ── 区間のマーカー */
      if (t.includes("<!-- guardian:begin")) {
        出.印.push(rel + "(guardian:begin/end の区間が在ります)"); continue;
      }
      /* ★★命令 ── フックの command / workflow の run / script が束を名指ししている */
      const 命令 = 実行される綴り(rel, t);
      if (命令 != null) {
        const 当たり = (命令.match(/[A-Za-z0-9_.\/-]*guardian[A-Za-z0-9_.\/-]*/g) || []);
        if (当たり.length) { 出.命令.push(rel + " → " + [...new Set(当たり)].slice(0, 3).join(", ")); continue; }
      }
      /* ★★★名前だけ ── 候補にしかならない */
      if (/guardian/i.test(rel)) 出.名前だけ.push(rel);
    }
  };
  歩く("");

  const 台帳あり = fs.existsSync(台帳の道);
  console.log("【走査だけ ── ★何も消していません】" + String.fromCharCode(10));
  console.log("台帳: " + (台帳あり ? "★在ります(--外す で、台帳が知る物だけを外せます)"
    : "★★在りません ── ★★★昔の導入か、台帳を消したかのどちらかです") + String.fromCharCode(10));

  const 見せる = (名, 一覧, 意味) => {
    console.log("■ " + 名 + " " + 一覧.length + "件 ── " + 意味);
    if (!一覧.length) console.log("   (なし)");
    for (const x of 一覧.slice(0, 40)) console.log("   ・" + x);
    if (一覧.length > 40) console.log("   … ほか " + (一覧.length - 40) + "件");
    console.log("");
  };
  見せる("束", 出.束, "★pull.mjs と KIT_VERSION を持つフォルダ。**名前では見ていません**");
  見せる("指紋一致", 出.指紋一致, "★★配る雛形と1バイトも違わない ── 塊が置いて、誰も触っていない");
  見せる("印", 出.印, "★guardian:begin/end の区間が在る ── ★★その区間は塊の物(外側は人の物)");
  見せる("命令", 出.命令, "★★★フック/workflow/script が束を名指ししている ── ★誰が登録したかは**分かりません**");
  見せる("名前だけ", 出.名前だけ, "★★上のどれでもない ── ★★★候補にしかなりません(綴りで所有は決めない)");

  console.log("★この走査は【消す物を決めません】。決めるのに足りないもの:");
  console.log("  ・命令 … その登録を塊が入れたのか、人が足したのかは、台帳が無いと分かりません");
  console.log("    ★★実例: no-reflex の登録は【どの版の install も一度も入れていません】(会議で161版を数えた)");
  console.log("  ・名前だけ … ★★★綴りは候補の出し方であって、所有の証明ではありません");
  console.log("  ・指紋一致 … 一致すれば塊の物ですが、★人が1文字でも直すと外れます(外れた物はここに出ません)");
  console.log(String.fromCharCode(10) + "★次の一手は【人が決めること】です ── この一覧を見て、外す物を選んでください。");
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
      const 出 = t.match(/guardian\/[A-Za-z0-9_./-]+/g);
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
      衝突.push(c.rel + ' ── 外せませんでした: ' + String(e && e.message).slice(0, 60));
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
/* ★retained を3つに分ける(2026-09-03、@codex の指摘)。
 *   ★★「残っている」だけでは、どれが【期待どおり】でどれが【盲点】か読み手に分からない。
 *   ★★★塊が書く名は、塊自身のコードから拾う ── 一覧を手で持たない(手で持つと古くなる)。 */
const 塊が書く名 = (() => {
  const 名 = new Set();
  const 見る = ['check.mjs', 'verdict.mjs', 'neighbors.mjs', 'pull.mjs', 'index.mjs',
    'hooks/clock.js', 'selfcheck.mjs', 'install.mjs'];
  for (const f of 見る) {
    let s = '';
    try { s = fs.readFileSync(path.join(ROOT, 'guardian', f), 'utf8'); } catch (_) { continue; }
    for (const m of s.matchAll(/['"`]\.guardian['"`]\s*,\s*['"`]([^'"`]+)['"`]/g)) 名.add(m[1]);
    for (const m of s.matchAll(/['"`]\.guardian\/([^'"`]+)['"`]/g)) 名.add(m[1]);
  }
  return 名;
})();

const 束 = retained.filter((r) => r.startsWith('guardian/'));
const 盲点 = retained.filter((r) => {
  if (!r.startsWith('.guardian/')) return false;
  return 塊が書く名.has(r.slice('.guardian/'.length));
});
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
const 現場の物 = retained.filter((r) => !束.includes(r) && !盲点.includes(r));

console.log('\n★retained(★★走査で在った物 − 消した物) ' + retained.length + '件 ── 3つに分けます:');
console.log('\n  ① 塊の束(★フォルダごと消す場所) ' + 束.length + '件:');
for (const r of 束) console.log('     ・' + r);
/* ★札は測った通りに書く ── ここで拾えているのは【塊のコードが名指ししている】までで、
 *   ★★【塊が書いている】ではない。実測(2026-09-03、会議): `踏んだこと` は
 *   hooks/clock.js が読むだけで、書き手はこの塊のどこにも無い(=人が書く物)。
 *   ★★★「書く名」と書くと、次の人が「塊の物だから消してよい」と読む。それは事故になる。 */
console.log('\n  ② ★★塊のコードが名指ししている物(★★★書くとは限りません) ' + 盲点.length + '件:');
for (const r of 盲点) console.log('     ・' + r
  + '  ← 台帳に載っていません。★消してよいかは、書き手が在るかを見てから決めてください');
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
/* ★保持一覧の読み取りで言うことが在るなら、それは【不明】である(2026-09-03、@codex の線)。
 *   ★★人が「残したい」と書いた物を、こちらが受け付けなかった ──
 *   ★★★その物が守られているかどうか、こちらには分からない。
 *   実測(直す前): 広すぎる指定・予約された道・理由の無い項の3通りとも、
 *   言うだけ言って【判定は PASS】だった ── 16.5 で直したのと同じ形を、また作っていた。 */
const 判定 = (衝突.length || 依存衝突.length) ? 'CONFLICT'
  : ((盲点.length || 保持の訴え.length) ? 'UNKNOWN' : 'PASS');
console.log('\n判定: ★' + 判定);
if (判定 === 'CONFLICT') {
  console.log('  ★★塊の物のうち、人が触った物が在ります ── 消していません。人が見てください。');
} else if (判定 === 'UNKNOWN') {
  console.log('  ★★【台帳が知る】塊の持ち物は、★残り 0 件です(' + 消す.length + '件 外しました)。');
  console.log('  ★★★ですが、誰の物か決まっていない物が ' + 盲点.length + '件 在ります(上の②)。');
  if (保持の訴え.length) console.log('  ★保持一覧で受け付けなかった指定が ' + 保持の訴え.length + '件 在ります ── ★★人が「残したい」と書いた物が守られているか、こちらには分かりません。');
  console.log('  ★だから「残滓ゼロ」とは言いません ── ★★不明は合格ではありません。');
  console.log('  ★★★②の各件に書き手が在るかを見て、塊の物なら消し、人の物なら③へ移してください。');
} else {
  console.log('  ★★【台帳が知る】塊の持ち物は、★残り 0 件です(' + 消す.length + '件 外しました)。誰の物か決まっていない物も在りません。');
  console.log('  ★★★残っているのは③(現場の物)だけです。');
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
