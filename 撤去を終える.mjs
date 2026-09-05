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

const ROOT = process.cwd();
const 帳面の道 = path.join(ROOT, ".guardian-撤去中.json");

let 帳面 = null;
try { 帳面 = JSON.parse(fs.readFileSync(帳面の道, "utf8")); } catch (_) {}

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

try {
  fs.rmSync(退避, { recursive: true, force: true });
} catch (e) {
  console.log("★掃ききれませんでした: " + String(e && e.message).slice(0, 90));
  console.log("  ★★これは【何も 消えていない】という意味では ありません ── 途中まで 消えている事が 在ります。");
  console.log("  ★★★もう一度 打つと 続きます。");
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
