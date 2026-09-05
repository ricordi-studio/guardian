/* ★★★撤去が【束を 移した後】で 落ちた時に 打つ 小さな 走行(27.88、@codex 17:01)。
 *
 *   ★なぜ 要るか(実測 20:15、公開 27.87 の 手前):
 *     ・外す は 束を まず `guardian-撤去中-<印>/` へ 移してから 掃く(★道具自身が 束の 中に 在るため)
 *     ・★★移した 直後に 落ちると、`node guardian/外す.mjs` は【もう 無い】
 *       → Cannot find module ── ★★★同じ 命令を 打ち直せない
 *   ★だから 移す【前】に、外す が この紙を 現場の 直下へ 置く。
 *
 *   ★★この紙は【何も 判じません】── 帳面が 名指した 物だけを 掃き、
 *   ★★★証拠(束の控え / 導入台帳)と 帳面と、最後に 自分を 消します。
 *
 *   ★打ち方: 現場の 根で `node guardian-撤去を終える.mjs`
 *   ★★出口: 0 = 終わった / 1 = 掃ききれない / 2 = 終える物が 無い(何も していない) */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const ROOT = process.cwd();
const 帳面の道 = path.join(ROOT, ".guardian-撤去中.json");

let 帳面 = null;
try { 帳面 = JSON.parse(fs.readFileSync(帳面の道, "utf8")); } catch (_) {}

/* ★★★退避先は【道具が 付ける 形】でなければ 触らない(27.91、@kozo 22:32)。
 *   ★帳面は 現場に 在る 紙 ── ★★人が 書き換え得る。
 *   ★★★実測(公開 8330e08):退避先を "src" に すると 人の src が 消えた。 */
if (帳面 && 帳面.退避先 && !/^guardian-撤去中-[0-9]{14}$/.test(String(帳面.退避先))) {
  console.log("✗ 帳面の 退避先が【道具が 付ける 形】では ありません: " + 帳面.退避先);
  console.log("  ★何も していません ── ★★帳面を 見てください。");
  process.exit(2);
}

/* ★退避先が 書かれていても、まだ 移していない事が 在る(27.91)──
 *   ★★その時は 束が 現場に 在る ── ★★★ここでは 何も せず、道具の 方を 案内する。 */
if (帳面 && 帳面.退避先 && !fs.existsSync(path.resolve(ROOT, String(帳面.退避先)))) {
  console.log("★まだ 束は 移されていません ── ★★ここでする事は 在りません。");
  console.log("  ★★★束の 道具を 打ってください:node <束>/外す.mjs --外す --束も --戻せない事は承知");
  console.log("  ★何も していません。");
  process.exit(2);
}
if (!帳面 || !帳面.退避先) {
  console.log("✗ 終える物が 在りません ── 帳面(.guardian-撤去中.json)が 読めないか、退避先が 書かれていません。");
  console.log("  ★現場の【根】で 打っていますか。★★何も していません。");
  process.exit(2);
}

/* ★消す先は【この現場の 中】だけ(★★外す.mjs と 同じ枷)。 */
const 退避 = path.resolve(ROOT, String(帳面.退避先));
const 根 = path.resolve(ROOT);
if (!(退避.startsWith(根 + path.sep) && 退避 !== 根)) {
  console.log("✗ 退避先が この現場の 中に 在りません: " + 退避);
  console.log("  ★何も していません。");
  process.exit(2);
}

/* ★★★掃くのは【入れた時の 一覧に 在る物】だけ(27.89、@guardian 20:43 の TOCTOU)。
 *   ★実測(彼の 見本):検めた後・消す直前に 中身を すり替えると、気づかずに 消していた。
 *   ★★だから 消す【直前】に lstat し、近道は 追わず、一覧に 無い物は 残して 名乗る。 */
/* ★名と 指紋の 対(27.90、@codex 21:47 の 2)── ★★名が 合っても 中身が 違えば 消さない。
 *   ★★★式は 外す.mjs の 掃く指紋 と 同じ(素の sha256 / 改行だけ 揃える)。 */
const 印 = new Map(Array.isArray(帳面.束の印) ? 帳面.束の印.filter((x) => Array.isArray(x)) : []);
const 掃く指紋 = (中) => createHash("sha256")
  .update(String(中).split(String.fromCharCode(13)).join("")).digest("hex");
/* ★★★【全部 検めてから 消す】(27.93、@codex 22:44)。
 *   ★1件ずつ 消しながら 進むと、★★未知が 出た時には もう 何件か 消えている。
 *   ★★★= 部分的な 破壊 ── 取引としては 認められない。
 *   ★検めで 1件でも 未知・不一致・境界外が 出たら、★★1件も 消さない。 */
function 掃く(根, 親, 合った) {
  const 未知 = [];
  const 先頭 = !合った;
  合った = 合った || [];
  let es = []; try { es = fs.readdirSync(根, { withFileTypes: true }); } catch (_) { return 未知; }
  for (const e of es) {
    const 道 = path.join(根, e.name);
    const 名 = 親 ? 親 + "/" + e.name : e.name;
    let st = null; try { st = fs.lstatSync(道); } catch (_) { continue; }
    if (st.isSymbolicLink()) { 未知.push(名 + "(近道 ── 先は 追いません)"); continue; }
    if (st.isDirectory()) {
      /* ★★★空の フォルダも【一覧に 無ければ 消さない】(27.92、@codex 22:36)。
       *   ★中身が 無い事は 所有の 証明に ならない ── ★★一覧の どの道の 親でも 無ければ 知らない物。 */
      let 身内 = false;
      for (const k of 印.keys()) if (k.indexOf(名 + "/") === 0) { 身内 = true; break; }
      if (!身内) { 未知.push(名 + "(一覧に 無い フォルダ)"); continue; }
      未知.push(...掃く(道, 名, 合った));
      continue;
    }
    if (!印.has(名)) { 未知.push(名 + "(入れた時の 一覧に 在りません)"); continue; }
    let 中 = null; try { 中 = fs.readFileSync(道, "utf8"); } catch (_) {}
    if (中 == null) { 未知.push(名 + "(読めません)"); continue; }
    if (掃く指紋(中) !== 印.get(名)) { 未知.push(名 + "(中身が 入れた時と 違います)"); continue; }
    合った.push(道);
  }
  if (!先頭) return 未知;
  if (未知.length) return 未知;   /* ★1件でも 知らない物が 在れば、★★1件も 消さない */
  for (const 道 of 合った) {
    try { fs.rmSync(道, { force: true }); } catch (_) { 未知.push(道 + "(消せませんでした)"); }
  }
  /* ★空に なった フォルダを 内側から 畳む */
  const 畳む = (d) => {
    let es = []; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch (_) { return; }
    for (const e of es) if (e.isDirectory()) 畳む(path.join(d, e.name));
    try { if (!fs.readdirSync(d).length) fs.rmdirSync(d); } catch (_) {}
  };
  畳む(根);
  return 未知;
}
const 未知 = 掃く(退避, "");
if (未知.length) {
  console.log("★掃く途中で【知らない物】が 出ました ── ★★消さずに 残しました:");
  for (const u of 未知.slice(0, 8)) console.log("    ・" + u);
  console.log("  ★★★中を 見てください ── ★あなたの物なら 別の場所へ 移し、要らなければ 手で 消してください。");
  console.log("  ★証拠も 帳面も 残しました ── ★★片づけたら もう一度 打つと 続きます。");
  process.exit(1);
}
console.log("★束を 掃きました: " + 帳面.退避先);

/* ★証拠は ここで 消す ── ★★束が 消えた後は、もう 誰の物かを 言う相手が 居ない。
 *   ★★★道は【帳面が 名指した 物】だけ ── ★この紙は 道の 綴りを 持ちません
 *   (持つと、正本(書き手.cjs)と 二重に なる ── 塊の 門が 正しく そう 言いました)。 */
for (const r of (Array.isArray(帳面.証拠) ? 帳面.証拠 : [])) {
  const 的 = path.resolve(ROOT, String(r));
  if (!(的.startsWith(根 + path.sep) && 的 !== 根)) continue;   /* ★現場の 外は 触らない */
  try { fs.rmSync(的, { force: true }); } catch (_) {}
}
try {
  const g = path.dirname(path.resolve(ROOT, String((帳面.証拠 || [])[0] || "x/y")));
  if (fs.readdirSync(g).length === 0) { fs.rmdirSync(g); console.log("★.guardian/ も空になったので畳みました"); }
} catch (_) {}

try { fs.rmSync(帳面の道, { force: true }); } catch (_) {}
console.log("★★終わりました ── ★★★この紙(" + path.basename(process.argv[1]) + ")も 消します。");
try { fs.rmSync(process.argv[1], { force: true }); } catch (_) {}
