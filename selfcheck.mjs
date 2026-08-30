#!/usr/bin/env node
/**
 * 塊の自己検査 ── 検査エンジンが【当たること】を機械で示す
 *
 *   node guardian/selfcheck.mjs
 *
 * なぜこれが要るのか:
 *   RULES.md の「検査は【当たること】を確かめてから足す」は、これまで**人の手作業**だった。
 *   検査は「何も見ていなくても緑を返す」ことができる ── 正規表現がJSONのエスケープ1つで
 *   何にも当たらなくなっても、出力は「ずれなし」のままである。
 *   **見張られているつもりになるのが、いちばん危ない。**
 *
 * この道具がやること(2つ):
 *   A. 見本の小さなリポジトリを一時領域に作り、**わざと1箇所ずつ壊して** check.mjs を回し、
 *      「壊したら赤くなる / 壊していなければ緑のまま」を1件ずつ確かめる
 *   B. 塊そのものの健康診断(版が嘘をついていないか・使われていない検査の種類が無いか・
 *      エンジンに現場固有が混じっていないか)
 *
 * 出口コード: どれか1つでも外れれば 1(CIがそのまま落ちる)。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** この現場の宣言(guardian.config.json)を読む唯一の口(2026-08-28)。
 *
 * ★以前は2箇所で別々に読んでおり、片方が【2つ上】を見たままだった
 *   (9.0 で tools/guardian/ → guardian/ へ引っ越したときの取りこぼし)。
 *   しかも読めなければ黙って空を返す作りなので、**見張っていないことに気づけない** ──
 *   個人情報の見張りが、混ざっているのに「していません」と言い続けた(実測)。
 * ★根を探して読む: この塊はルート直下にも tools/ の下にも置かれうるので、位置を決め打ちしない。 */
function 宣言を読む() {
  const 候補 = [path.join(HERE, "..", "guardian.config.json"),
                path.join(HERE, "..", "..", "guardian.config.json"),
                path.join(process.cwd(), "guardian.config.json")];
  for (const f of 候補) {
    try { return { 在り処: f, 宣言: JSON.parse(fs.readFileSync(f, "utf8")) }; } catch (_) {}
  }
  return { 在り処: "", 宣言: null };
}
/* ★この現場の根(宣言が在る場所)。報告書の落とし先に使う ── cwd に落とすと
 *   回した場所で行き先が変わり、正本で回すと自己検査を赤くする(2026-08-30)。 */
/* ★拾えなかったことを、緑にしない(2026-08-30、違和感の掘り出しで見つかった)。
 *
 *   この照合は install.mjs / pull.mjs を**文字列の形**で切って中身を取り出す。
 *   形が変われば何も拾えなくなるが、直す前は「0件は全部入っています ✓」と**緑**を返した。
 *   実測: install.mjs の path.join(ROOT, …) を別の書き方に変えても、B7 は緑のままだった。
 *
 *   これは selfcheck.mjs が生まれた事故そのもの ──
 *   **何も見ていない検査が緑を返し続け、番人が居るつもりで居なかった**(WHY)。
 *   check.mjs の検査には probe(見本)が義務づけられているのに、
 *   selfcheck の中に後から書いたこの照合には無かった。
 *
 * ★だから【必ず在るはずのもの】を1つ決めて、それが拾えなければ**照合自身を落とす**。 */
function 拾えたか(名, 実際, 必ず在る) {
  const 欠け = 必ず在る.filter((x) => !実際.has(x));
  if (!欠け.length) return true;
  ng.push(名 + ': 拾い方が当たっていません(' + 欠け.join(', ') + ' が見つからない)'
    + ' ── 相手の書き方が変わった可能性があります。**この照合は何も見ていないので、緑にできません**');
  return false;
}
const ROOT_DIR = (() => {
  const { 在り処 } = 宣言を読む();
  return 在り処 ? path.dirname(在り処) : process.cwd();
})();
const NL2 = String.fromCharCode(10);
/* ★第3の語彙【未測】(2026-08-30、違和感の掘り出しで見つかった)。
 *
 *   この塊の芯は【不明を緑に数えない】(verdict.mjs)。ところが自己検査には
 *   ok / ng の2語しか無く、"測っていない" を ok に混ぜていた。
 *   実測: まっさらな導入先で
 *     ✓ 個人情報の見張りは**していません**(private が空)
 *     ✓ 運用の欠落は見ていません(context が空)
 *   と出たうえで **「59件すべて期待どおり」** ── 全部宣言済みの正本と**同じ数字・同じ文**。
 *   数が「測って通った」と「測っていない」を区別できていなかった。
 *   ★しかもこの自己検査は verdict の**証拠①**である ── 合否の根拠が、そこで嘘をつく。
 * ★未測は【失敗ではない】ので止めない(不明は止めない・verdict と同じ規律)。
 *   だが**緑には混ぜない**。数を分け、最後の1行でも分けて言う。 */
const ok = [];
const 未測 = [];
const ng = [];
/* ★個人情報の見張りの【結果】を、見張った所の外へ出す(2026-08-30、違和感の掘り出しで見つかった)。
 *
 *   直す前、B1c(見張り)の結果はその塊の中の局所変数で、B1e(事故レポートを送る)からは
 *   見えなかった。だから **`--why --send` は、見張っていない現場でも、
 *   見張って【見つかった】現場でも、そのまま公開リポジトリへ投げられた。**
 *   しかも報告書の冒頭には「**宣言が空のため見張っていません**」と自分で書いたうえで送る。
 * ★外向き・不可逆(公開の issue)なので、ここは黙って通してはいけない。 */
const 個人情報の見張り = { 状態: "見張っていない", 見つかった: [], 語数: 0 };
/* ★正本のアドレスは【1箇所】から読む(2026-08-30、違和感の掘り出しで見つかった)。
 *
 *   直す前は `pull.mjs` の 正本(取り直し先)と、ここの `gh issue create --repo …`(報告先)に
 *   **同じ宛先が2つ**書かれていた ── 39条(同じことを2か所で決めない)そのもの。
 *   正本を引っ越したら、取り直しは新しい方へ行き、**報告だけが古い方へ飛び続ける**。
 * ★配布物の一覧(ENGINE_FILES)と同じやり方で、pull.mjs を正本として読む。
 *   読めなければ**送り先が分からない**と正直に言う(推測で外へ出さない)。 */
const 正本の名前 = () => {
  try {
    const src = fs.readFileSync(path.join(HERE, 'pull.mjs'), 'utf8');
    const m = src.match(/正本\s*=\s*'https:\/\/github\.com\/([^'\/]+\/[^'\/]+?)(?:\.git)?'/);
    return m ? m[1] : '';
  } catch (_) { return ''; }
};
let whyLoose = null;      // 守りが下限より増えている(--tighten で上げる)

/* ★指紋を取る対象は【配るもの】から導く(2026-08-30、違和感の掘り出しで見つかった)。
 *
 *   直す前は、ここに12件を手で並べていた。だが `pull.mjs` が実際に配るのは23項目 ──
 *   **index.mjs / githooks / templates / 文書一式(16項目)は、配られるのに指紋が無かった。**
 *   実測: 配布先で index.mjs と templates/ を直しても selfcheck は「配られたときの中身のまま」と緑を返し、
 *   pull.mjs の門(直りが在れば止まる)も鳴らず、**取り直しで上書きされて現場の直りが消えた**。
 *   これは WHY 176(配布先の直りが消える)を防ぐ仕組みが、16項目では効いていなかったということ。
 *
 * ★根は「配布物の集合が2箇所にあり、片方が短い」── 39条(同じことを2か所で決めない)。
 *   だから【配るもの】1つを正本にし、ここはそれを読んで実ファイルへ展開する。
 * ★指紋の対象から外すのは【配布先で中身が育って当然のもの】だけ ── その一覧も1箇所(FP_SKIP)に置く。
 *   ・WHY.md / WHY_INDEX.md / WHY_SEEN … その現場で踏んだ事故が増える(それが本体)
 *   ・CHANGELOG.md / KIT_VERSION / ENGINE_FP … 版と指紋そのもの(自分で自分を測れない)
 * ★`RULES.md` を外していたのを戻した(2026-08-30、違和感の掘り出しで見つかった)。
 *   除外の理由は「配布先で事故が増えて当然」だったが、それは **WHY.md の話**である。
 *   RULES.md は**修繕の作法**で、配布先で勝手に育つものではない ──
 *   外したままだと、配布先が作法を書き換えても `selfcheck` は緑を返し、
 *   `--report` にも載らず、**その現場の改善が正本へ還る道が無い**。
 *   ★理由が1つの仲間にしか当てはまらないのに、同じ袋へ入っていた。 */
const FP_SKIP = new Set(['WHY.md', 'WHY_INDEX.md', 'WHY_SEEN', 'CHANGELOG.md', 'KIT_VERSION', 'ENGINE_FP']);
/* ★pull.mjs の分類表を切り出す【1つの口】(2026-08-30)。
 *   直す前は同じ切り出しが3箇所に写されていた(ENGINE_FILES / 配布境界の照合 / 配布の網羅)。
 *   書き方が変わったときに1箇所だけ直す事故を呼ぶので、ここに集めた(39条)。
 * ★正規表現を組み立てず、素直に切り出す ── 書き方が変われば呼ぶ側が「読めません」で止まる。 */
const 分類表を取る = (名) => {
  let src = ''; try { src = fs.readFileSync(path.join(HERE, 'pull.mjs'), 'utf8'); } catch (_) { return null; }
  const 頭 = src.indexOf(名 + ' = new Set([');
  if (頭 < 0) return null;
  const 尾 = src.indexOf(']);', 頭);
  if (尾 < 0) return null;
  return new Set([...src.slice(頭, 尾).matchAll(/'([^']*)'/g)].map((x) => x[1]));
};
const ENGINE_FILES = (() => {
  const 表 = 分類表を取る('配るもの');
  if (!表) return [];
  const 名 = [...表];
  const 展開 = (n) => {
    if (FP_SKIP.has(n)) return [];
    const abs = path.join(HERE, n);
    try {
      if (!fs.statSync(abs).isDirectory()) return [n];
      return fs.readdirSync(abs).filter((f) => !FP_SKIP.has(n + '/' + f)).map((f) => n + '/' + f);
    } catch (_) { return []; }
  };
  return 名.flatMap(展開).sort();
})();

/* ==========================================================================
 * A. 見本のリポジトリ ── 「全部そろって正しい」状態を1つ作る
 *
 * ここは【どの現場でもない架空の小さなプロジェクト】である。
 * 現場の名前を混ぜないこと ── 混ぜた瞬間、この自己検査は塊の外へ持ち出せなくなる。
 * ========================================================================== */

const SRC_TS = [
  '/* 見本の器。`makeThing` は口 `/api/thing` に繋がる */',
  'export const RATE = 150;',
  'export const PRICE = {',
  '  small: 100,',
  '  large: 300,',
  '};',
  'export const CAPS = {',
  '  brain: 1,',
  '  voice: 1,',
  '  image: 1,',
  '};',
  'export const VENDOR_TABLE = {',
  "  AcmeCorp: { 'alpha': true, 'beta': false },",
  '};',
  'export function makeThing(a, b, kind, v, mode) { return [a, b, kind, v, mode]; }',
  "export function route(p) { if (p === '/api/thing') return makeThing('x', 'y', 'model', 1, 'add'); }",
].join('\n') + '\n';

const APP_HTML = [
  '<div id="ok" class="box">見本</div>',
  '<script>',
  'const RATE = 150;',
  'const PRICE = {',
  '  small: 100,',
  '  large: 300,',
  '};',
  'const CAPS = {',
  '  brain: 1,',
  '  voice: 1,',
  '  image: 1,',
  '};',
  "const VERSION = 'v2026.01.01';",
  "$('ok').textContent = RATE;",
  "document.querySelector('.box');",
  '</script>',
].join('\n') + '\n';

const CODEMAP_MD = [
  '# 見本の地図',
  '',
  '## ものを作る',
  '',
  '- 器: `src/index.ts` の `makeThing` / 値は `RATE`',
  '- 口: `/api/thing`',
  '- 画面: `web/app.html`',
].join('\n') + '\n';

const BASE_CFG = {
  map: 'docs/CODEMAP.md',
  sources: ['src/index.ts', 'web/app.html'],
  selectors: ['web/app.html'],
  okMarker: 'guardian:ok',
  checks: [
    {
      kind: 'same',
      name: '為替レート',
      why: '2箇所にある。ずれると金額が食い違う',
      picks: [
        { label: '器', file: 'src/index.ts', re: 'RATE = (\\d+)' },
        { label: '画面', file: 'web/app.html', re: 'const RATE = (\\d+)' },
      ],
    },
    {
      kind: 'sameMap',
      name: '単価表',
      why: '2枚ある。片方だけ直すと請求が狂う',
      picks: [
        { label: '器', file: 'src/index.ts', block: 'PRICE = \\{([\\s\\S]*?)\\n\\}', pair: '(\\w+): (\\d+)' },
        { label: '画面', file: 'web/app.html', block: 'PRICE = \\{([\\s\\S]*?)\\n\\}', pair: '(\\w+): (\\d+)' },
      ],
    },
    {
      kind: 'sameSet',
      name: '用途の集合',
      why: '2枚ある。片方に足し忘れると、その用途だけ静かに落ちる',
      picks: [
        { label: '器', file: 'src/index.ts', block: 'CAPS = \\{([\\s\\S]*?)\\n\\}', key: '^\\s*(\\w+):' },
        { label: '画面', file: 'web/app.html', block: 'CAPS = \\{([\\s\\S]*?)\\n\\}', key: '^\\s*(\\w+):' },
      ],
    },
    {
      kind: 'shape',
      name: '版の書き方',
      why: '配信の道具がこの形を前提に読んでいる',
      file: 'web/app.html',
      re: "const VERSION = 'v\\d{4}\\.\\d{2}\\.\\d{2}'",
    },
    {
      kind: 'onlyIn',
      name: '固有名は性質表の中だけ',
      why: '表の外に固有名が漏れると、層ごとにリストが割れる',
      pattern: 'AcmeCorp',
      probe: 'AcmeCorp',
      files: ['src/index.ts', 'web/app.html'],
      allowRegion: 'VENDOR_TABLE = \\{[\\s\\S]*?\\n\\};',
      max: 0,
    },
    {
      kind: 'noInline',
      name: '性質の判定を表の外に書かない',
      why: '同じ判定が2箇所に割れて、片方だけ直す事故になる',
      names: ['alpha', 'beta'],
      files: ['src/index.ts'],
      min: 2,
    },
    {
      kind: 'perSection',
      name: '決定には【いま有効か】が書いてある',
      why: '古い決定と現在の決定が同じ見た目で並ぶと、読む側は区別できない',
      file: 'DECISIONS.md',
      section: '^### DEC-\\d+',
      must: '^状態: ',
      say: '状態: 有効 / 改定済み→DEC-00X',
    },
    {
      kind: 'citeLive',
      name: 'もう現行でない決定を、いまの規則として引いていないか',
      why: '決定記録に古い節が残るのは正しい。問題はそれを【いまの規則】として引く文書の方',
      file: 'DECISIONS.md',
      idIn: '^### (DEC-\\d+)',
      deadIf: '^状態: (改定済み|廃止)',
      citedIn: ['RULES-DOC.md'],
      cite: '(DEC-\\d+)',
    },
    {
      kind: 'callArgs',
      name: '積み上げか置き換えかを必ず書く',
      why: '既定は置き換え。確かめた結果に既定を使うと、測るたびに1件へ戻る',
      call: 'makeThing',
      when: "['\"]model['\"]",
      minArgs: 5,
      probe: "makeThing('x', 'y', 'model', 1, 'add')",
      files: ['src/index.ts'],
    },
  ],
};

/* 決定記録と、それを【いまの規則】として引く文書。
 * 古い決定が現在の仕様として読まれる事故は、この2枚の関係でしか起きない。 */
const DECISIONS_MD = [
  '### DEC-001 いちばん最初の決め事',
  '状態: 有効',
  'これは生きている決定。',
  '',
  '### DEC-002 やめた決め事',
  '状態: 改定済み→DEC-003',
  'これはもう現行ではない。',
  '',
  '### DEC-003 いまの決め事',
  '状態: 有効',
  'DEC-002 を置き換えた。',
].join(NL2) + NL2;

const RULES_MD = [
  '# いまの規則',
  '- 生きている決定に従う(DEC-003)。',
].join(NL2) + NL2;

const BASE = () => ({
  'docs/CODEMAP.md': CODEMAP_MD,
  'DECISIONS.md': DECISIONS_MD,
  'RULES-DOC.md': RULES_MD,
  'src/index.ts': SRC_TS,
  'web/app.html': APP_HTML,
  'guardian.config.json': JSON.stringify(BASE_CFG, null, 2),
});

/* ---------- 見本を一時領域に建てて、道具を回す ---------- */
function runTool(tool, files, args = []) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guardian-selfcheck-'));
  try {
    for (const [p, body] of Object.entries(files)) {
      if (body == null) continue;                       // null = そのファイルを置かない
      const full = path.join(dir, p);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, body, 'utf8');
    }
    const r = spawnSync(process.execPath, [path.join(HERE, tool), '--root', dir, ...args], { encoding: 'utf8' });
    return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
const run = (files) => runTool('check.mjs', files);

/* 壊し方の書き方を短くする道具 */
const withFile = (name, fn) => { const f = BASE(); f[name] = fn(f[name]); return f; };
const withCfg = (fn) => {
  const f = BASE();
  const c = JSON.parse(f['guardian.config.json']);
  fn(c, (kind) => c.checks.find((x) => x.kind === kind));
  f['guardian.config.json'] = JSON.stringify(c, null, 2);
  return f;
};

/* ==========================================================================
 * 見本を1箇所ずつ壊す ── expect は「赤」か「緑」、want は出てほしい言葉
 * ========================================================================== */
const CASES = [
  { name: '壊していない見本は緑', expect: '緑', files: BASE() },

  /* --- A. 地図と実装のずれ --- */
  { name: '地図が名指しする記号が実装に無い', expect: '赤', want: '記号が実装に見つかりません',
    files: withFile('docs/CODEMAP.md', (s) => s + '\n- 器: `noSuchThing`\n') },
  { name: '注釈に残った名前を「実在する」と数えない', expect: '赤', want: '記号が実装に見つかりません',
    files: (() => {
      const f = withFile('src/index.ts', (s) => '/* 以前ここに oldThing があった */\n' + s);
      f['docs/CODEMAP.md'] += '\n- 器: `oldThing`\n';
      return f;
    })() },
  { name: '地図が名指しするファイルが在らない', expect: '赤', want: 'ファイルが在りません',
    files: withFile('docs/CODEMAP.md', (s) => s + '\n- 器: `src/gone.ts`\n') },
  { name: '注釈が名指しする記号が実装に無い', expect: '赤', want: '注釈が名指し',
    files: withFile('src/index.ts', (s) => '/* `ghostFn` を使う */\n' + s) },
  { name: '地図そのものが無い', expect: '赤', want: 'が読めません',
    files: (() => { const f = BASE(); f['docs/CODEMAP.md'] = null; return f; })() },

  /* --- B. same --- */
  { name: 'same: 値がずれたら落ちる', expect: '赤', want: '一致していません',
    files: withFile('web/app.html', (s) => s.replace('const RATE = 150', 'const RATE = 151')) },
  { name: 'same: 片方が読めないとき【緑にしない】', expect: '赤', want: '何も見ていません',
    files: withFile('web/app.html', (s) => s.replace('const RATE = 150;', '')) },

  /* --- C. sameMap --- */
  { name: 'sameMap: 表が食い違ったら落ちる', expect: '赤', want: '食い違っています',
    files: withFile('web/app.html', (s) => s.replace('  large: 300,\n};\nconst CAPS', '  large: 301,\n};\nconst CAPS')) },

  /* --- D. sameSet --- */
  { name: 'sameSet: 片方に足し忘れたら落ちる', expect: '赤', want: '揃っていません',
    files: withFile('web/app.html', (s) => s.replace('  image: 1,\n};', '};')) },
  { name: 'sameSet: 1枚しか読めないとき【緑にしない】', expect: '赤', want: '何も見ていません',
    files: withFile('web/app.html', (s) => s.replace('const CAPS = {', 'const CAPABILITIES = {')) },

  /* --- E. shape --- */
  { name: 'shape: 決めた書き方から外れたら落ちる', expect: '赤', want: '決めた書き方から外れて',
    files: withFile('web/app.html', (s) => s.replace("'v2026.01.01'", "'いつか'")) },
  { name: 'shape: 見る先が消えたとき【緑にしない】', expect: '赤', want: '何も見ていません',
    files: withCfg((c, get) => { get('shape').file = 'web/gone.html'; }) },

  /* --- F. onlyIn --- */
  { name: 'onlyIn: 表の外に固有名が漏れたら落ちる', expect: '赤', want: '口が 1 箇所',
    files: withFile('src/index.ts', (s) => s + "const x = 'AcmeCorp';\n") },
  { name: 'onlyIn: 注釈は主張ではないので数えない', expect: '緑',
    files: withFile('src/index.ts', (s) => s + '// AcmeCorp のことは後で\n') },
  { name: 'onlyIn: 行末の逃げ道(guardian:ok)は黙る', expect: '緑',
    files: withFile('src/index.ts', (s) => s + "const x = 'AcmeCorp';  // guardian:ok 見本\n") },
  { name: 'onlyIn: 何にも当たらない式は【検査自身を落とす】', expect: '赤', want: '死んでいます',
    files: withCfg((c, get) => { get('onlyIn').pattern = 'AcmeCorpX'; }) },
  { name: 'onlyIn: 見る先が消えたとき【緑にしない】', expect: '赤', want: '何も見ていません',
    files: withCfg((c, get) => { get('onlyIn').files = ['src/gone.ts']; }) },

  /* --- G. noInline --- */
  { name: 'noInline: 表の外の分岐は落ちる', expect: '赤', want: '表の外に判定が散らばって',
    files: withFile('src/index.ts', (s) => s + "export const f = (x) => (x === 'alpha' || x === 'beta');\n") },
  { name: 'noInline: 並べただけの一覧は落とさない', expect: '緑',
    files: withFile('src/index.ts', (s) => s + "export const LIST = ['alpha', 'beta'];\n") },
  { name: 'noInline: 見張る語が消えたとき【緑にしない】', expect: '赤', want: '何も見ていません',
    files: withCfg((c, get) => { get('noInline').names = ['gamma', 'delta']; }) },

  /* --- H. callArgs --- */
  { name: 'callArgs: 既定に頼った呼び出しは落ちる', expect: '赤', want: '引数を省いています',
    files: withFile('src/index.ts', (s) => s.replace("makeThing('x', 'y', 'model', 1, 'add')", "makeThing('x', 'y', 'model', 1)")) },
  { name: 'callArgs: 対象の呼び出しが消えたとき【緑にしない】', expect: '赤', want: '何も見ていません',
    files: withFile('src/index.ts', (s) => s.replace("makeThing('x', 'y', 'model', 1, 'add')", 'null')) },
  { name: 'callArgs: 見本に当たらない宣言は【検査自身を落とす】', expect: '赤', want: '死んでいます',
    files: withCfg((c, get) => { get('callArgs').probe = 'somethingElse(1, 2)'; }) },

  /* --- H2. perSection / citeLive(いま有効な決定) --- */
  { name: 'perSection: 状態の無い決定があれば落ちる', expect: '赤', want: 'がありません',
    files: withFile('DECISIONS.md', (s) => s.replace('### DEC-003 いまの決め事' + NL2 + '状態: 有効', '### DEC-003 いまの決め事')) },
  { name: 'perSection: 節が1つも無いとき【緑にしない】', expect: '赤', want: '何も見ていません',
    files: withFile('DECISIONS.md', (s) => s.replace(/### DEC-/g, '### 決定-')) },
  { name: 'citeLive: 改定済みの決定を規則が引いたら落ちる', expect: '赤', want: '現行でない決定',
    files: withFile('RULES-DOC.md', (s) => s.replace('DEC-003', 'DEC-002')) },
  { name: 'citeLive: 履歴として引くなら逃げ道で黙る', expect: '緑',
    files: withFile('RULES-DOC.md', (s) => s.replace('DEC-003)。', 'DEC-002)。 <!-- guardian:ok 履歴として引いている -->')) },
  { name: 'citeLive: 決定が1つも無いとき【緑にしない】', expect: '赤', want: '何も見ていません',
    files: withFile('DECISIONS.md', (s) => s.replace(/### DEC-/g, '### 決定-')) },

  /* --- I. 宣言そのものの誤り --- */
  { name: '必須の欄が無い検査は落ちる', expect: '赤', want: '宣言に picks がありません',
    files: withCfg((c, get) => { delete get('same').picks; }) },
  { name: '知らない種類は落ちる', expect: '赤', want: '知らない検査の種類',
    files: withCfg((c, get) => { get('shape').kind = 'nope'; }) },
  { name: '宣言のJSONが壊れていたら落ちる', expect: '赤', want: '壊れています',
    files: (() => { const f = BASE(); f['guardian.config.json'] = '{ "map": '; return f; })() },

  /* --- J. セレクタ --- */
  { name: 'セレクタ: 掴む相手が実在しないと落ちる', expect: '赤', want: '実在しない参照',
    files: withFile('web/app.html', (s) => s.replace('id="ok"', 'id="okay"')) },
  { name: 'セレクタ: 行末の逃げ道は黙る', expect: '緑',
    files: withFile('web/app.html', (s) => s.replace('id="ok"', 'id="okay"')
      .replace("$('ok').textContent = RATE;", "$('ok').textContent = RATE;  // guardian:ok")) },
];

for (const c of CASES) {
  const r = run(c.files);
  const got = r.code === 0 ? '緑' : '赤';
  const why = () => r.out.split('\n').filter((l) => l.includes('✗')).slice(0, 3).join('\n      ');
  if (got !== c.expect) { ng.push(`${c.name}: ${c.expect}になるはずが${got}だった\n      ` + why()); continue; }
  if (c.want && !r.out.includes(c.want)) {
    ng.push(`${c.name}: ${got}にはなったが、理由が「${c.want}」ではない\n      ` + why());
    continue;
  }
  ok.push(`${c.name} … ${got}`);
}

/* ==========================================================================
 * A2. 合否(verdict.mjs)── 4語が全部ちゃんと出るか
 *
 * ★いちばん確かめたいのは【不明を通過に数えないこと】。
 *   ここが緩むと、測っていないものが「合格」として通ってしまい、
 *   この道具を作った意味がまるごと消える。
 * ========================================================================== */
{
  const ev = (list) => {
    const f = BASE();
    const c = JSON.parse(f['guardian.config.json']);
    c.evidence = list;
    f['guardian.config.json'] = JSON.stringify(c, null, 2);
    return f;
  };
  const OK = { name: '通るもの', run: 'node -e "process.exit(0)"', fast: true };
  const NG = { name: '落ちるもの', run: 'node -e "console.log(String.fromCharCode(10007)); process.exit(1)"' };
  const NEEDS = { name: '前提が要るもの', run: 'node -e "console.log(9); process.exit(1)"',
                  unknownIf: '^9$', needs: '相手を起こすこと' };
  const NOTOOL = { name: '道具が無いもの', run: 'zzz-no-such-command-xyz', needsCmd: 'zzz-no-such-command-xyz' };
  const WARN = { name: '止めないもの', run: 'node -e "process.exit(1)"', warnOnly: true };

  const V = [
    { name: '合否: 全部通れば【通過】(出口0)', ev: [OK], code: 0, want: '合否: 通過' },
    { name: '合否: 落ちたら【差戻】(出口1)', ev: [OK, NG], code: 1, want: '差戻' },
    { name: '合否: 測れなければ【不明】── 通過にしない(出口2)', ev: [OK, NEEDS], code: 2, want: '不明' },
    { name: '合否: 道具が無いのは【失敗ではなく不明】', ev: [OK, NOTOOL], code: 2, want: '道具がありません' },
    { name: '合否: 止めないと宣言したものは【注意】(出口0)', ev: [OK, WARN], code: 0, want: '注意' },
    { name: '合否: 差戻と不明が同時なら【差戻】が勝つ', ev: [NG, NEEDS], code: 1, want: '差し戻し' },
    { name: '合否: 証拠が1つも無ければ【不明】── 何も測らずに合格と言わない', ev: [], code: 2, want: 'evidence がありません' },
  ];
  for (const t of V) {
    const r = runTool('verdict.mjs', ev(t.ev));
    if (r.code !== t.code) { ng.push(`${t.name}: 出口が ${t.code} になるはずが ${r.code} だった\n      ` + r.out.trim().split('\n').slice(-3).join('\n      ')); continue; }
    if (t.want && !r.out.includes(t.want)) { ng.push(`${t.name}: 「${t.want}」が出ていません\n      ` + r.out.trim().split('\n').slice(-3).join('\n      ')); continue; }
    ok.push(`${t.name} … 出口${r.code}`);
  }
  /* --fast は速いものだけを回す(完了を名乗る手前で使うため) */
  const r = runTool('verdict.mjs', ev([OK, NG]), ['--fast']);
  if (r.code !== 0) ng.push('合否 --fast: 速いものだけ回すはずが、遅いものまで回っています');
  else ok.push('合否 --fast: 速いものだけを回す … 出口0');
}

/* ==========================================================================
 * B. 塊そのものの健康診断
 * ========================================================================== */
const kit = (p) => { try { return fs.readFileSync(path.join(HERE, p), 'utf8'); } catch (_) { return ''; } };

/* B1. 版が嘘をついていないか ── KIT_VERSION と CHANGELOG の先頭が一致するか */
{
  const ver = kit('KIT_VERSION').trim();
  const head = kit('CHANGELOG.md').match(/^##\s*v?([0-9][0-9.]*)/m);
  if (!ver) ng.push('KIT_VERSION が読めません');
  else if (!head) ng.push('CHANGELOG.md の先頭に版の見出し(## 7.0 の形)がありません');
  else if (head[1] !== ver) ng.push(`版が食い違っています: KIT_VERSION=${ver} / CHANGELOG の先頭=${head[1]}`);
  else ok.push(`版は KIT_VERSION と CHANGELOG の先頭で一致(${ver})`);
}

/* B1b. 【この塊は、配られたときの中身のままか】(2026-08-28)。
 *
 * ★実際に起きた: 配布先で塊のバグを2つ直してもらったのに、**元の塊には戻ってこなかった**。
 *   しかも両方の KIT_VERSION が同じ 7.5 のまま ── **版が嘘をついていた**。
 *   (片方は「フォルダ名に空白があると壊れる」という、こちらでは一生出ないバグだった)
 * ★版の数字は人が上げるので、直した人が上げ忘れれば黙って食い違う。
 *   だから**中身そのものの指紋**で見る(名前ではなく中身で照合)。
 * ★指紋は【ファイルごと】に持つ ── 全体で1つだと「どれかが変わった」しか言えず、
 *   **配布先が何を直したのかを報告できない**(報告できなければ、還る道が無い)。
 * ★対象はエンジン(コード)だけ。WHY.md や RULES.md は配布先で事故が増えて当然なので数えない。
 *
 * 使い方:
 *   selfcheck              … 配られたときの中身のままか
 *   selfcheck --report     … 直した分を【元の塊へ渡す1枚】にまとめる(配布先で回す)
 *   selfcheck --stamp      … 意図した変更として指紋を押し直す(元の塊で回す) */
{
  const 対象 = ENGINE_FILES;
  const 指紋 = (s) => {
    let h = 2166136261;
    for (let k = 0; k < s.length; k++) { h ^= s.charCodeAt(k); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(36) + "-" + s.length;
  };
  const 読む = (f) => {
    try { return fs.readFileSync(path.join(HERE, f), "utf8").replace(/\r\n/g, "\n"); }
    catch (_) { return ""; }   // 改行の流儀は数えない(OSで変わる)
  };
  const いま = {};
  for (const f of 対象) いま[f] = 指紋(読む(f));

  const 台帳 = path.join(HERE, "ENGINE_FP");
  const 記録 = {};
  let 版の記録 = "";
  try {
    for (const 行 of fs.readFileSync(台帳, "utf8").split(/\r?\n/)) {
      const m = 行.match(/^(\S+)\s+(\S+)$/);
      if (m) 記録[m[1]] = m[2];
      else if (/^[0-9]/.test(行.trim())) 版の記録 = 行.trim();
    }
  } catch (_) {}

  const 押す = () => {
    const 中身 = [kit("KIT_VERSION").trim(), ...対象.map((f) => f + " " + いま[f])].join("\n") + "\n";
    fs.writeFileSync(台帳, 中身);
    /* ★事故の見出しも一緒に記録する(2026-08-28)。
     *   塊の本体は WHY.md の事故そのもの。**本体を育てる道**が要る ──
     *   配布先で足した事故を正本へ還すには、「配られたとき何があったか」を知っている必要がある。
     * ★指紋(ENGINE_FP)とは別のファイルにする: あちらは短い指紋、こちらは見出しの一覧で、
     *   照合の対象が違う(エンジン vs 記録)。 */
    try {
      const w = fs.readFileSync(path.join(HERE, "WHY.md"), "utf8");
      const 見出し = (w.match(/^## \[.*$/gm) || []);
      fs.writeFileSync(path.join(HERE, "WHY_SEEN"), 見出し.join("\n") + "\n");
    } catch (_) {}
  };
  /* ★【消えたファイル】は、いまの一覧からも消える(2026-08-30、配布先の実走で見つかった)。
   *
   *   対象(ENGINE_FILES)はディスクを readdir して作るので、**消したファイルは最初から居ない**。
   *   だから指紋の照合にも掛からず、件数が静かに1つ減るだけだった。
   *   実測(配布先): `hooks/stop.js`(完了を名乗る手前で止める層)を消しても
   *     ✓ エンジンは配られたときの中身のまま(25件)
   *   と**緑**を返す。**層が1枚消えているのに、消えたと言えない。**
   * ★記録(ENGINE_FP)は「配られたとき何が在ったか」を知っている ── **両方向で見る**。 */
  const 消えた = Object.keys(記録).filter((f) => !対象.includes(f));
  const 違う = 対象.filter((f) => 記録[f] !== いま[f]);

  /* ★食い違ったファイルの【名前だけ】を機械が読める形で出す(2026-08-30、配布先からの報告②)。
   *
   *   配布先の指摘: 指紋が食い違ったとき、この道具は
   *   「**こちらで直した**」と「**正本が進んだ(こちらは古いだけ)**」を区別できていない。
   *   どちらも「違う」の一言になるので、取り直しが止まり、**堂々巡り**に入る
   *   (手で新しくする → 守りが止める → 指紋を手で入れる → 別のファイルが違うと言われる)。
   * ★区別する材料は `pull.mjs` の側にある(正本を一時領域に取っているので、突き合わせられる)。
   *   だからこちらは【どのファイルが食い違ったか】だけを渡し、判断は向こうでする。
   * ★文字列で判定させない ── 直す前の pull.mjs は赤い文の**文言**を includes で見ていた。
   *   文言は変わる(実際、9.21 で変えた)。機械が読む口を別に用意する。 */
  if (process.argv.includes("--changed")) {
    /* ★消えたものも載せる ── pull はこれを「手元に無い」として取り込み直す */
    for (const f of [...違う, ...消えた]) process.stdout.write(f + "\n");
    process.exit(0);
  }

  /* ★【この塊が、単独のリポジトリとして置かれているか】= 正本で回しているか。
   *   配布先では塊は <プロジェクト>/guardian/ なので HERE/.git は無い。
   *   ★B6a の 正本か(HERE/../.git も見る)とは【別の判定】である ── あちらは
   *     配布先でも真になる(guardian/ の1つ上はプロジェクトの .git)。
   *     直すかどうかは依頼主の判断なので触っていない(docs/HANDOVER.md に記録した)。 */
  const 塊が単独のリポジトリ = fs.existsSync(path.join(HERE, ".git"));

  if (process.argv.includes("--stamp")) {
    /* ★一言で押させない(2026-08-30、違和感の掘り出しで見つかった)。
     *
     *   直す前の --stamp は、確認も控えも一覧も無く ENGINE_FP を押し直した。
     *   pull.mjs は「配られたときの中身と違います」という**文字列**で
     *   「この現場の直りを上書きしない」を守っているので、**一言でその守りが外れる**。
     * ★実測: 配布先で verdict.mjs を直す → selfcheck 赤・pull 拒否 →
     *   **その赤い文が案内するとおり** --stamp → selfcheck 緑 →
     *   `pull --check` が「変わるもの: verdict.mjs」。**その現場の直りは次の取り直しで消える。**
     * ★赤い文は配布先の人も読む。「意図した変更なら --stamp」は、
     *   バグを直した現場にはそのまま当てはまるように読める ── だから道具の側で止める。
     * ★正本では --stamp は普通の作業なので止めない。止めるのは【還す道がまだ在る所】だけ。 */
    if (!塊が単独のリポジトリ && 違う.length) {
      ng.push("★ここは配布先です。--stamp を押すと、この現場で直した分(" + 違う.join(", ") + ")が"
        + "**記録ごと消えます** ── 次の `pull.mjs` が黙って上書きするようになります。"
        + "先に `--report` で1枚を作り、正本へ渡してください。"
        + "(正本で取り込んでから配り直せば、指紋は正しく揃います)");
    } else {
      /* 何を押すのかを必ず出す ── 黙って押す道具は、押した人にも何をしたか残らない */
      console.log(違う.length
        ? "  押し直す前の食い違い(" + 違う.length + "件): " + 違う.join(", ")
        : "  食い違いはありません(押しても中身は変わりません)");
      押す();
      ok.push("エンジンの指紋を押し直しました(" + 対象.length + "件"
        + (違う.length ? " / うち変わっていたのは " + 違う.length + "件" : "") + ")── 配った先へも配り直すこと");
    }
  } else if (!Object.keys(記録).length) {
    ng.push("ENGINE_FP がありません。`node guardian/selfcheck.mjs --stamp` で押してください");
  } else if (消えた.length) {
    ng.push("★配られたはずのエンジンが【無くなっています】: " + 消えた.join(", ")
      + " ── 層が1枚消えても、直す前は件数が静かに減るだけで気づけませんでした。"
      + "意図して外したのなら**正本で外して配り直す**こと(この現場だけで消すと、次の取り直しで黙って戻ります)。"
      + "戻すなら `node guardian/pull.mjs` で取り込み直せます");
  } else if (違う.length) {
    if (process.argv.includes("--report")) {
      /* ★【元の塊へ渡す1枚】を作る(配布先で回す)。
       *   差分ではなく**丸ごとの中身**を出す ── 配布先は元の塊を持っていないので差分が作れない。
       *   受け取った側は AI が読んで judgement する(機械が丸ごと上書きすると、元の改善が消える)。 */
      const 出 = ["# 塊の改善報告(この1枚を、元の塊のAIに渡してください)", "",
        "配られた版: " + (版の記録 || "(不明)") + " / いまの版: " + kit("KIT_VERSION").trim(),
        "変わったファイル: " + 違う.join(", "), "",
        "## 元の塊のAIへ", "",
        "下の中身は、この現場で実際に踏んだ不具合を直したものです。",
        "**丸ごと上書きせず、差分を読んで、そちらの改善と合わせて取り込んでください。**",
        "取り込んだら `--stamp` を押し、版を上げて、配った先へ配り直してください。", ""];
      for (const f of 違う) {
        出.push("---", "", "### " + f, "", "```js", 読む(f), "```", "");
      }
      /* ★落とす先を固定する(2026-08-30、違和感の掘り出しで見つかった)。
       *   直す前は process.cwd() ── 回した場所で落ち先が変わり、同名の既存ファイルを確認なく上書きした。
       *   さらに正本(塊がリポジトリそのもの)で回すと直下に残り、
       *   **その直後の自己検査が「配るものとも現場のものとも決まっていません」で赤くなった** ──
       *   報告書を作る行為が、自分の自己検査を壊していた。
       *   .guardian/ はこの現場の作業記録の置き場(=配らないもの)なので、そこへ落とす。 */
      const 出先 = path.join(ROOT_DIR, ".guardian");
      try { fs.mkdirSync(出先, { recursive: true }); } catch (_) {}
      const 先 = path.join(出先, "guardian-report.md");
      fs.writeFileSync(先, 出.join("\n"));
      ok.push("改善報告を書きました: " + 先 + "(" + 違う.length + "ファイル)── 承認を得てから元の塊へ渡してください");
    } else {
      /* ★案内は【読む人がどこに居るか】で変える(2026-08-30)。
       *   直す前はどこで読んでも「意図した変更なら --stamp」と出ていた。
       *   配布先でバグを直した人は「意図した変更」をしているので、その案内を自分に当てはめる ──
       *   そして押した瞬間に、還す道(pull.mjs の守り)が外れる。 */
      ng.push("★この塊は配られたときの中身と違います(" + 違う.join(", ") + ")。"
        + "**直したなら元の塊へ戻すこと**(戻さないと、次に配ったとき直りが消えます)。"
        + "`--report` で渡す1枚を作れます。"
        + (塊が単独のリポジトリ
            ? "意図した変更なら `--stamp` で押し直してください"
            : "★ここは配布先なので `--stamp` は使えません(押すと、この直りが記録ごと消えるため)"));
    }
  } else {
    ok.push("エンジンは配られたときの中身のまま(" + 対象.length + "件・記録と過不足なし)");
  }
}

/* B1c. 【この塊に、その現場の個人情報が混ざっていないか】(2026-08-28)。
 *
 * ★塊は**事故の記録**が本体なので、実機で起きたことを具体的に書く ──
 *   その具体性が価値であると同時に、**人名が入り込む所**でもある。
 *   一度は手で伏せられるが、次に事故を書いたときにまた入る。だから機械が見張る。
 * ★見張る語は**この現場の宣言**が持つ(guardian.config.json の private)。
 *   塊のコードに名前を書いたら、それ自体が個人情報の持ち込みになる。
 * ★宣言が無ければ**何も言わない**(名前を知らないので見張りようがない)。
 *   ただし「見張っていない」ことは黙らずに出す ── 無音を「安全」と読ませない。 */
{
  const 語 = (() => {
    try {
      const { 宣言 } = 宣言を読む();
      return Array.isArray(宣言?.private) ? 宣言.private.filter(Boolean) : [];
    } catch (_) { return []; }
  })();
  if (!語.length) {
    未測.push("個人情報の見張りは**していません**(guardian.config.json の private が空)"
      + " ── 配るなら、伏せたい語をそこに並べてください");
  } else {
    個人情報の見張り.状態 = "見張った";
    個人情報の見張り.語数 = 語.length;
    const 見つかった = [];
    const 歩く = (dir) => {
      for (const en of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, en.name);
        if (en.isDirectory()) { 歩く(full); continue; }
        if (!/\.(md|mjs|js|json|yml)$/.test(en.name)) continue;
        const s = fs.readFileSync(full, "utf8");
        if (en.name === "guardian.config.json") continue;   // 見張る語を並べる所は、見張らない
        for (const w of 語) if (s.includes(w)) 見つかった.push(en.name + ": " + w);
      }
    };
    歩く(HERE);
    個人情報の見張り.見つかった = 見つかった;
    if (見つかった.length)
      ng.push("★塊にこの現場の個人情報が混ざっています: " + 見つかった.slice(0, 8).join(" / ")
        + "(配る前に伏せること)");
    else ok.push("塊にこの現場の個人情報が混ざっていない(" + 語.length + "語を見張り)");
  }
}

/* B1d. 【要件(SPEC.md)が実装から遅れていないか】(2026-08-28 依頼主の指摘)。
 *
 * ★依頼主「新しい機能が追加されたら、その要件定義書も更新されるべき。
 *   そしてそれのチェックを自分でやるところまで。」── そのとおりだった。
 *   文書に「更新すること」と書くだけでは守られない(46条: 注意書きは検査ではない)。
 *   **更新しないと通れない**形にする。
 * ★見張るのは2つだけ:
 *   ① エンジンが受け付ける口(--xxx)が、SPEC に載っているか
 *   ② エンジンのファイルが、SPEC のどこかで名指しされているか
 * ★「満たさないこと」は機械には測れない ── **できると数えられても、
 *   できないと言い切ったことは数えられない**。そこは監査のたびに人が読み直す(SPEC 7節)。 */
{
  const SPEC = (() => { try { return fs.readFileSync(path.join(HERE, "SPEC.md"), "utf8"); } catch (_) { return ""; } })();
  if (!SPEC) {
    ng.push("SPEC.md がありません(要件を書く文書。何を満たし、何を満たさないかの正本)");
  } else {
    /* ① 口 ── argv を見ている行からだけ取る(git のオプションや区切り線を拾わないため) */
    const 口 = new Set();
    for (const f of fs.readdirSync(HERE).filter((x) => x.endsWith(".mjs"))) {
      for (const 行 of fs.readFileSync(path.join(HERE, f), "utf8").split(/\r?\n/)) {
        if (!/argv/.test(行)) continue;
        for (const m of 行.matchAll(/--[a-z][a-z-]*/g)) 口.add(m[0]);
      }
    }
    const 載っていない口 = [...口].filter((o) => !SPEC.includes(o)).sort();
    if (載っていない口.length)
      ng.push("★SPEC.md に載っていない口があります: " + 載っていない口.join(" ")
        + "(新しい口を足したら SPEC.md の『口の一覧』に書くこと ── 書くまで通れません)");
    else ok.push("SPEC.md が実装の口を全部載せている(" + 口.size + "個)");

    /* ② エンジンのファイル ── SPEC のどこかで名指しされているか */
    const 本体 = [...fs.readdirSync(HERE).filter((x) => x.endsWith(".mjs")),
      ...fs.readdirSync(path.join(HERE, "hooks")).map((x) => "hooks/" + x)];
    const 載っていない = 本体.filter((f) => !SPEC.includes(f)).sort();
    if (載っていない.length)
      ng.push("★SPEC.md が名指ししていないエンジンがあります: " + 載っていない.join(" ")
        + "(何を満たすために在るのかを SPEC.md に書くこと)");
    else ok.push("SPEC.md がエンジンを全部名指ししている(" + 本体.length + "本)");

    /* ③ 境界(満たさないこと)が空になっていないか ── ここだけは中身を測れないので、在ることだけ見る */
    ok.push(/満たさないこと/.test(SPEC)
      ? "SPEC.md に【満たさないこと】の節がある(中身は機械には測れない ── 監査で人が読み直す)"
      : "★SPEC.md に【満たさないこと】が無い");
    if (!/満たさないこと/.test(SPEC)) ng.push("★SPEC.md に【満たさないこと】の節がありません(境界を書かないと、期待されて裏切ります)");
  }
}

/* B1d2. 【文書が増えたのに、入口(README)が案内していない】(2026-08-29 依頼主の指摘)。
 *
 * ★依頼主「コードが格納されているフォルダの中には、Readme なり何なり、
 *   それが何なのか? 何から始めたらいいか? を説明しているものがあるのが普通ですよね?」
 *   ── あった。だが **SPEC.md を作った翌日、README がそれを案内していなかった**。
 *   文書を足すたび入口が遅れる ── SPEC が実装から遅れるのと同じ形(46条)。
 * ★公開したので、README は**初見の人とAIが最初に見るもの**。ここが古いと、
 *   新しい層は「無い」のと同じになる。
 * ★中身の良し悪しは測れない。**名指しされているか**だけを数える。 */
{
  const R = (() => { try { return fs.readFileSync(path.join(HERE, "README.md"), "utf8"); } catch (_) { return ""; } })();
  if (!R) ng.push("README.md がありません(この塊の入口。公開時に最初に見られる)");
  else {
    const 文書 = fs.readdirSync(HERE).filter((f) => f.endsWith(".md") && f !== "README.md");
    const 案内なし = 文書.filter((f) => !R.includes(f)).sort();
    if (案内なし.length)
      ng.push("★README が案内していない文書があります: " + 案内なし.join(" ")
        + "(入口に載らない文書は、無いのと同じです)");
    else ok.push("README が塊の文書を全部案内している(" + 文書.length + "枚)");
  }
}

/* B1e. 【その現場で足した事故を、正本へ還す】(2026-08-28 依頼主の指摘)。
 *
 * ★依頼主「事故レポートが集まるほど性能が上がるので、インストールしたプロジェクトには
 *   レポート提出の協力をお願いしたい」── そのとおりで、**塊の本体は WHY.md の事故**。
 *   それまで還せたのは【塊のコードの直り】だけで、**本体を育てる道が無かった**。
 * ★他の現場の事故は、こちらでは踏めない石である
 *   (フォルダ名の空白で壊れるバグは、配布先で初めて出た)。だから集める価値がある。
 * ★**個人情報の見張りを必ず通す。**事故は具体的であるほど価値があり、
 *   具体的であるほど人名が入る ── 送る前に止めるのが唯一の守り。
 * ★送信は自動にしない。1枚を作り、**送るコマンドを見せる**までが機械の仕事
 *   (--send を明示したときだけ、その場で送る = 人の承認)。 */
if (process.argv.includes("--why")) {
  const 読WHY = (() => { try { return fs.readFileSync(path.join(HERE, "WHY.md"), "utf8"); } catch (_) { return ""; } })();
  const 既知 = (() => {
    try { return new Set(fs.readFileSync(path.join(HERE, "WHY_SEEN"), "utf8").split(/\r?\n/).filter(Boolean)); }
    catch (_) { return null; }
  })();
  if (!読WHY) ng.push("WHY.md が読めません");
  else if (!既知) ng.push("WHY_SEEN がありません(配られたときに何の事故があったかの記録)。`--stamp` で作れます");
  else {
    /* 見出しで節に切り、記録に無いものだけを取る */
    const 節 = 読WHY.split(/^(?=## \[)/m).filter((s) => s.startsWith("## ["));
    const 足された = 節.filter((s) => !既知.has(s.split(/\r?\n/)[0].trim()));
    if (!足された.length) {
      ok.push("この現場で足した事故はありません(還すものなし)");
    } else {
      /* ★個人情報の見張りを通す ── 通らなければ**書かない**(作ってから気をつけろ、では遅い) */
      const 語 = (() => {
        try {
          const { 宣言 } = 宣言を読む();
          return Array.isArray(宣言?.private) ? 宣言.private.filter(Boolean) : [];
        } catch (_) { return []; }
      })();
      const 本文 = 足された.join("");
      const 混入 = 語.filter((w) => 本文.includes(w));
      if (混入.length) {
        ng.push("★足した事故に、この現場の個人情報が混ざっています: " + 混入.join(" / ")
          + "。**送る1枚は作りませんでした** ── WHY.md 側を伏せてから、もう一度 --why してください");
      } else {
        const 出 = ["# 事故レポート(Guardian へ)", "",
          "この現場で新しく記録した事故を、正本へ還します。**塊の本体は事故の記録**なので、",
          "これが集まるほど検査と規律が増えます。", "",
          "- 塊の版: " + kit("KIT_VERSION").trim(),
          "- 足した事故: " + 足された.length + "件",
          "- 個人情報の見張り: " + (語.length ? 語.length + "語を通しました" : "**宣言が空のため見張っていません**(guardian.config.json の private)"),
          "", "---", "", ...足された];
      /* ★落とす先を固定する(2026-08-30、違和感の掘り出しで見つかった)。
       *   直す前は process.cwd() ── 回した場所で落ち先が変わり、同名の既存ファイルを確認なく上書きした。
       *   さらに正本(塊がリポジトリそのもの)で回すと直下に残り、
       *   **その直後の自己検査が「配るものとも現場のものとも決まっていません」で赤くなった** ──
       *   報告書を作る行為が、自分の自己検査を壊していた。
       *   .guardian/ はこの現場の作業記録の置き場(=配らないもの)なので、そこへ落とす。 */
        const 出先 = path.join(ROOT_DIR, ".guardian");
        try { fs.mkdirSync(出先, { recursive: true }); } catch (_) {}
        const 先 = path.join(出先, "guardian-why-report.md");
        fs.writeFileSync(先, 出.join("\n"));
        const 送り先 = 正本の名前();
        const 題 = "事故レポート: " + 足された.length + "件";
        const 送る = "gh issue create --repo " + 送り先
          + " --title " + JSON.stringify(題)
          + " --body-file " + JSON.stringify(先);
        /* ★見張っていない中身を、外へ出さない(2026-08-30、違和感の掘り出しで見つかった)。
         *
         *   直す前の `--send` は、**見張っていない現場でも、見張って見つかった現場でも**、
         *   そのまま公開リポジトリへ issue を立てた。しかも報告書の冒頭には
         *   「宣言が空のため見張っていません」と**自分で書いたうえで**送っていた。
         *   事故の記録は「実機で起きたことを具体的に書く」ものなので、**人名が入り込む所**である
         *   (B1c がそのために在る)。外向き・不可逆(公開の issue)なので、ここは通さない。
         * ★止めるだけで終わらせない ── 1枚は書けているので、**送る道を必ず案内する**。 */
        const 出せない = !送り先
          ? "**送り先が分かりません**(pull.mjs から正本のアドレスが読めません)"
          : 個人情報の見張り.状態 !== "見張った"
            ? "この現場は**個人情報を見張っていません**(guardian.config.json の private が空)"
            : 個人情報の見張り.見つかった.length
              ? "**見張りが引っかかっています**(" + 個人情報の見張り.見つかった.slice(0, 3).join(" / ") + ")"
              : "";
        /* ★【送らずに、送る内容を見る】口を作る(2026-08-30、この道具で実際に事故を起こした)。
         *
         *   起きたこと: 開発中、`--send` の**表示だけ**を確かめるつもりで `--why --send` を回した。
         *   その機械には gh が入っていて認証も通っていたので、**本物の issue が公開リポジトリに立った**
         *   (ricordi-studio/guardian#2。試験用の作り話だったが、公開されたことに変わりはない)。
         * ★根は「**見るには、やるしかなかった**」こと ── `--stamp` とまったく同じ形である。
         *   外向きで不可逆な口には、**必ず下見の口を対で置く**(install.mjs の --dry と同じ)。 */
        const 下見 = process.argv.includes("--dry");
        const 見せる = () => console.log("  送り先: " + 送り先 + " / 題: " + 題
          + " / 中身: " + fs.statSync(先).size + "バイト・事故 " + 足された.length + "件"
          + " / 見張り: " + 個人情報の見張り.語数 + "語を通しました");
        if (process.argv.includes("--send") && 出せない) {
          ng.push("★送りませんでした: " + 出せない + "。**公開リポジトリへ出す前に伏せてください**。"
            + "1枚は " + 先 + " に在ります(private を書いてもう一度 `--why --send`、"
            + "または中身を読んでから手で `" + 送る + "`)");
        } else if (process.argv.includes("--send") && 下見) {
          見せる();
          ok.push("【下見】送りませんでした。この命令が走ります:\n     " + 送る
            + "\n   (本当に送るときは --dry を外してください)");
        } else if (process.argv.includes("--send")) {
          /* 何を・どこへ出すのかを必ず先に出す(黙って外へ出す道具を作らない) */
          見せる();
          const r = spawnSync(送る, { shell: true, encoding: "utf8" });
          if (r.status === 0) ok.push("事故レポートを送りました: " + String(r.stdout || "").trim());
          else ng.push("送れませんでした(gh が要ります / gh auth login で認証): "
            + String(r.stderr || "").slice(0, 200) + " ── 1枚は " + 先 + " に在ります");
        } else {
          ok.push("事故レポートを書きました: " + 先 + "(" + 足された.length + "件)");
          ok.push("中身を読んで**承認**したら、これで送れます:\n     " + 送る
            + (出せない ? "\n   ★ただし " + 出せない + " ── `--send` は止めます" : "")
            + "\n   (`--why --send --dry` で**送らずに**中身と宛先を見られます。"
            + "外すとその場で公開リポジトリへ出ます)");
        }
      }
    }
  }
}

/* B2. RULES.md の条番号が 1..N で通っているか(欠番・重複は、足すときに番号を見ていない印) */
{
  const nums = [...kit('RULES.md').matchAll(/^##\s*(\d+)\.\s/gm)].map((m) => Number(m[1]));
  const bad = nums.filter((n, i) => n !== i + 1);
  if (!nums.length) ng.push('RULES.md から条が1つも読めません');
  else if (bad.length) ng.push(`RULES.md の条番号が通っていません(${nums.length}条・最初のずれ: ${bad[0]})`);
  else ok.push(`RULES.md の条番号は 1〜${nums.length} で通っている`);
}

/* B3. 文書が書いている件数が、実数と合っているか
 *   ★これが今回の発端。KIT_VERSION 6.1 は「RULES 19条 / WHY 29件」の版のまま、
 *     中身は 41条 / 69件 になっていた。**数を書いた文書は、書いた瞬間から腐り始める。**
 *     腐らせない唯一の方法は、機械に数えさせて突き合わせること。 */
{
  /* ★「RULES.md 42条」は【全部で42条ある】とも【42番目の条】とも読める(2026-08-22 に自分で踏んだ)。
   * 曖昧な検査は誤検出を出し、誤検出は検査ごと外される。だから書き方で分ける:
   *   総数 … 「全42条」「全69件」と書く(実数と一致すること)
   *   参照 … 「39条」と書く(**実在する条番号**であること。42条しか無いのに51条を指したら赤) */
  const real = {
    RULES: [...kit('RULES.md').matchAll(/^##\s*\d+\.\s/gm)].length,
    WHY: [...kit('WHY.md').matchAll(/^## \[(?:検査|門|計器|規律)\/(?:事故|予防)\] /gm)].length,
    /* ★「対策4層」と書いたまま5層になっていた(2026-08-22 実測)。
     * 層は増えるものなので、書いた数は必ず腐る ── 数えて突き合わせる。 */
    層: [...kit('METHOD.md').matchAll(/^### 第\d+層/gm)].length,
    /* ★数えられる部品を増やす(2026-08-30、配布先からの報告③)。
     *   どれも【1箇所から機械が数えられる】ものだけ ── 数えられないものは網に入れない。 */
    要件: [...kit('SPEC.md').matchAll(/^\|\s*R\d+\s*\|/gm)].length,
    フック: (() => {
      /* install.mjs が実際に登録する本数(want の行数)。分類表と同じく、素直に切り出す */
      const src = kit('install.mjs');
      const h = src.indexOf('const want = [');
      if (h < 0) return 0;
      return [...src.slice(h, src.indexOf('];', h)).matchAll(/^\s*\['/gm)].length;
    })(),
    証拠: (() => {
      try { const { 宣言 } = 宣言を読む(); return Array.isArray(宣言?.evidence) ? 宣言.evidence.length : 0; }
      catch (_) { return 0; }
    })(),
  };
  const DOCS = ['METHOD.md', 'README.md', 'RULES.md', 'WHY.md', 'audit.md', 'install.md'];
  const OUT = ['CLAUDE.md', 'STATUS.md', 'docs/CODEMAP.md'];                       // 塊の外だが、同じ数を書いている所
  const bad = [];
  const look = (label, text) => {
    if (!text) return;
    text.split('\n').forEach((line, i) => {
      if (/guardian:ok/.test(line)) return;
      /* ★「4件**追加**した」は総数の主張ではない ── 数の【直後】が差分の語なら見ない。
       * 行ごと飛ばすと、同じ行に「足す」と書いてある総数の主張まで見逃す(実際にそうなった)。
       * **誤検出を1件出した検査は丸ごと外される**(配る約束の5)ので、狭く正確に外す。 */
      const delta = (m) => /^\s*(追加|足|増|新設|減|削除)/.test(line.slice(m.index + m[0].length, m.index + m[0].length + 8));
      /* 総数の主張(全N条 / 全N件)は、実数と一致すること */
      for (const m of line.matchAll(/RULES(?:\.md)?[^\n]{0,24}?全(\d+)\s*条/g))
        if (Number(m[1]) !== real.RULES) bad.push(`${label}:L${i + 1} 「RULES 全${m[1]}条」← 実際は ${real.RULES}条`);
      for (const m of line.matchAll(/WHY(?:\.md)?[^\n]{0,24}?全(\d+)\s*件/g))
        if (Number(m[1]) !== real.WHY) bad.push(`${label}:L${i + 1} 「WHY 全${m[1]}件」← 実際は ${real.WHY}件(札の付いた事故)`);
      for (const m of line.matchAll(/対策(\d+)\s*層/g))
        if (Number(m[1]) !== real.層) bad.push(`${label}:L${i + 1} 「対策${m[1]}層」← 実際は ${real.層}層`);
      /* 参照(N条)は、実在する条番号であること ── 消えた条を指す文書は、読む人を迷子にする */
      for (const m of line.matchAll(/RULES(?:\.md)?[^\n]{0,24}?(\d+)\s*条/g)) {
        if (delta(m) || m[0].includes('全')) continue;
        const n = Number(m[1]);
        if (n < 1 || n > real.RULES) bad.push(`${label}:L${i + 1} 「RULES ${n}条」← そんな条はありません(全${real.RULES}条)`);
      }
    });
  };
  /* ★【裸の実数】も捕まえる(2026-08-29 外部の評価で指摘された)。
   *
   *   上の照合は「RULES 全N条」「WHY 全N件」の形しか見ていなかった。
   *   だから「事故181件」「自己検査 50件」のような書き方は**素通り**し、
   *   **README の中で「181件」と「177件」が食い違う**ところまで行った。
   *   RULES 299条に「数を書いた文書は、書いた瞬間から腐る」と自分で書いてあるのに、である。
   * ★網を広げる: 塊の実数(事故・条・自己検査・層)に近い言葉のそばに数字があれば、
   *   実数と突き合わせる。**書きたいなら正しく書け、書きたくないなら数を出すな**。
   * ★逃げ道は行末の guardian:ok(誤検出は検査ごと外されるので、必ず残す)。 */
  const 裸 = (label, text) => {
    if (!text) return;
    text.split('\n').forEach((line, i2) => {
      if (/guardian:ok/.test(line)) return;
      /* ★網は【数えられる部品】に広げる(2026-08-30、配布先からの報告③)。
       *
       *   報告者の現場では、地図と STATUS の数が**6件**腐っていた。
       *   その提案は「全 が付かない数は全部『照合していない』と言う」だったが、
       *   **こちらで試したら 13箇所鳴って、13箇所とも騒音だった**
       *   (「1本も入っていない」「39条」= 規則番号への参照、など)。
       *   索引には「いまの主張」と「あのとき測った記録」が同居するので、**数の有無では割れない**。
       * ★割れるのは【名詞】である ── 腐った6件は全部、この塊の**数えられる部品**を指していた:
       *   証拠 / 要件(R番号) / フックの本数。だから名詞ごとに実数と突き合わせる。
       * ★数えられないものは網に入れない(誤検出1件で検査ごと外される・配る約束の5)。 */
      const 対 = [
        [/事故\s*(\d+)\s*件/g, real.WHY, '事故の件数'],
        [/作法\s*(\d+)\s*条/g, real.RULES, '作法の条数'],
        [/規律\s*(\d+)\s*条/g, real.RULES, '規律の条数'],
        [/自己検査\s*(\d+)\s*件/g, null, '自己検査の件数'],
        [/証拠\s*(\d+)\s*件/g, real.証拠, '合否が回す証拠の件数'],
        [/要件\s*(\d+)\s*件/g, real.要件, '要件(R番号)の件数'],
        [/フック\s*(\d+)\s*本/g, real.フック, 'install が登録するフックの本数'],
        [/(\d+)\s*本(?:を)?登録/g, real.フック, 'install が登録するフックの本数'],
        [/R1\s*[〜~-]\s*R?(\d+)/g, real.要件, '要件(R番号)の最後の番号'],
      ];
      for (const [re, 実, 名] of 対) {
        for (const m of line.matchAll(re)) {
          /* 自己検査の件数は、この検査自身の実行中には確定していない ── 書くこと自体を禁じる */
          if (実 === null) { bad.push(label + ":L" + (i2 + 1) + " 「" + m[0] + "」← " + 名
            + "は書かない(実行のたびに変わる。`selfcheck` の出力を見ること)"); continue; }
          if (Number(m[1]) !== 実) bad.push(label + ":L" + (i2 + 1) + " 「" + m[0] + "」← 実際は " + 実);
        }
      }
    });
  };
  for (const d of DOCS) { 裸(d, kit(d)); look(d, kit(d)); }

  /* ★塊の外の3文書を【本当に読む】(2026-08-30、配布先からの報告③)。
   *
   *   直す前の経路は `HERE/../../<文書>` ── **1つ深く、プロジェクトの外**を指していた。
   *     配布先: <proj>/guardian → HERE/../.. = <proj> の親
   *     正本  : リポジトリそのもの → デスクトップの親
   *   しかも `catch (_) { 無ければ見ない }` で握り潰していたので、
   *   **この3文書は一度も読まれていない**のに、検査は緑を返し続けた。
   *   実測(配布先の報告): 地図と STATUS に**腐った数が6件**在ったのに、1件も鳴らなかった。
   *   ★報告者は「全 が付かない数は照合されない」と読んだ。それも本当だが、
   *     **その手前で、文書そのものを開いていなかった。**
   * ★根は ROOT_DIR を使わず、HERE から段数を数えたこと ── 段数は置き方で変わる。
   * ★読めなかったものは**名前を出す**(無音を「見た」と読ませない)。 */
  /* ★【履歴の印】と【多すぎたら測れないと言う】(2026-08-30、配布先からの報告④)。
   *
   *   9.24 でこの網を外の文書へ掛けた直後、配布先で **58件鳴って、そのうち本物は1件**だった。
   *   残り57件は、3316行の STATUS.md に積まれた**過去のセッションの完了報告**
   *   (「証拠6件」×51 など)── **どれも当時は正しかった記録**で、腐りようがない。
   *   ★私はこの網を作るとき、**自分の地図でしか測らなかった**。この塊の地図には
   *     セッションの履歴が積まれていないので、騒音がゼロに見えた。
   *     「配布の結果は配布先を建てて測る」を、自分で書いた版の次に破っている。
   *   ★しかも私は、報告者の案を「13箇所中13箇所が騒音だった」と却下していた。
   *     作り直した私の網は **57/58 が騒音**で、**却下した案より悪い**。
   *
   * ★直し1: 文書が【どこから下は履歴か】を自分で宣言できるようにする。
   *   報告者が「構造の芽②」で求めていたもの(ADR の `状態:` の札と同じ考え)。
   *   1行で済み、53箇所に逃げ道を撒く形(門が儀式になる)を避けられる。
   * ★直し2: それでも多すぎるときは【測れない】と言って、その文書では落とさない。
   *   1件の本物のために57件の騒音で止めるのは、計器として壊れている(7条)。
   *   ★上限は「腐り」と「数を語る文書」を分けるための網であって、正しさの基準ではない。 */
  /* ★印は【前方一致】で探す(2026-08-30、配布先からの報告)。
   *   完全一致だと `<!-- guardian:history ここから下は履歴 -->` のように
   *   理由を書き足した瞬間に効かなくなる ── 人は必ず理由を書き足す。 */
  const 履歴印 = /<!--\s*guardian:history/;
  const 履歴印の見本 = '<!-- guardian:history -->';
  const 多すぎる上限 = 5;
  const 読めなかった = [];
  const 履歴を落とした = [];
  const 測れない文書 = [];
  for (const d of OUT) {
    let t = null;
    try { t = fs.readFileSync(path.join(ROOT_DIR, d), 'utf8'); } catch (_) {}
    if (t === null) { 読めなかった.push(d); continue; }
    const h = t.search(履歴印);
    if (h >= 0) {
      履歴を落とした.push(d + '(' + (t.slice(h).split('\n').length - 1) + '行)');
      t = t.slice(0, h);
    }
    const 前 = bad.length;
    look(d, t); 裸(d, t);
    const 出た = bad.length - 前;
    if (出た > 多すぎる上限) {
      const 見本 = bad.slice(前, 前 + 3);
      bad.length = 前;                       // この文書の分は落とさない(測れていないので)
      測れない文書.push({ d, 出た, 見本 });
    }
  }
  if (履歴を落とした.length) {
    ok.push('履歴の印から下は数を照合していません(そう宣言されているので): ' + 履歴を落とした.join(' / '));
  }
  for (const x of 測れない文書) {
    未測.push(x.d + ' の数は**照合できませんでした**(' + x.出た + '箇所が実数と違う ── '
      + 'これは腐りではなく、**過去の記録が積まれている文書**の形です)。'
      + '見本: ' + x.見本.join(' / ')
      + ' ── 直すなら、いまの記述と履歴の境目に **' + 履歴印の見本 + '** の1行を置いてください'
      + '(その下は数を見ません。理由を書き足しても効きます)。逃げ道を1行ずつ撒くのは、門を儀式にするので勧めません');
  }
  if (読めなかった.length) {
    未測.push('この現場の文書のうち ' + 読めなかった.join(' / ') + ' は**在りません**(数の照合をしていません)');
  }

  if (bad.length) ng.push('文書が書いている件数が実数と合っていません:\n      ' + bad.join('\n      '));
  else ok.push(`文書の件数は実数と一致(RULES ${real.RULES}条 / WHY ${real.WHY}件`
    + ` / この現場の文書 ${OUT.length - 読めなかった.length}/${OUT.length} 件も見ました)`);
}

/* B3b. 事故が【どの層まで届いたか】── 文章で止まっている件数を数える
 *   ★WHY.md は事故の記録だが、記録しただけでは同じ事故がもう一度書ける。
 *     73件のうち検査になったのは20件で、53件は文章にしか無かった(2026-08-22 の棚卸し)。
 *     文章で止まった数が見えないと、「対策した」と言った回数だけが増えていく。
 *   ★守りの件数は【下げない数】(check.mjs の max と同じラチェット。向きだけ逆)。 */
{
  const why = kit('WHY.md');
  const head = why.indexOf('# 事故の記録');
  if (head < 0) ng.push('WHY.md に「# 事故の記録」の区切りがありません(道具の由来と事故が混ざります)');
  else {
    const body = why.slice(head);
    const all = [...body.matchAll(/^## (.*)$/gm)];
    const tagged = [...body.matchAll(/^## \[(検査|門|計器|規律)\/(事故|予防)\] /gm)];
    const naked = all.filter((m) => !/^\[(検査|門|計器|規律)\/(事故|予防)\] /.test(m[1]));
    if (naked.length) {
      ng.push(`WHY.md に札の無い事故が ${naked.length} 件あります ── どの層まで届いたかを書くこと`
        + `(例: ## [規律/事故] …):\n      ` + naked.slice(0, 5).map((m) => m[1].slice(0, 50)).join('\n      '));
    } else {
      const n = (k) => tagged.filter((m) => m[1] === k).length;
      const held = n('検査') + n('門');
      const floor = Number((why.match(/守られている:\s*(\d+)\s*件/) || [])[1]);
      const line = `事故 ${tagged.length}件 ── 守り ${held}(検査${n('検査')}/門${n('門')})`
        + ` / 計器 ${n('計器')} / **文章だけ ${n('規律')}**`;
      if (!Number.isFinite(floor)) ng.push('WHY.md に「守られている: N件」の下限がありません');
      else if (held < floor) ng.push(`守りが後退しています: ${held}件(下限 ${floor}件)。${line}`);
      else {
        if (held > floor) whyLoose = { floor, held };
        ok.push(line + (held > floor ? ` ← 増えました。--tighten で下限を上げられます` : ''));
      }
    }
  }
}

/* B4. エンジンが持つ検査の種類が、全部この自己検査で試されているか
 *   ★「一度も使われたことのない検査の種類」は、動くか誰も知らない ── 死にコードと同じ。
 *     見本で毎回使わせることで、宣言ゼロの種類でも【動くことが分かっている】状態にする。 */
{
  const impl = new Set([...kit('check.mjs').matchAll(/c\.kind === '(\w+)'/g)].map((m) => m[1]));
  const tried = new Set(BASE_CFG.checks.map((c) => c.kind));
  const dead = [...impl].filter((k) => !tried.has(k));
  if (dead.length) ng.push(`一度も試されていない検査の種類があります: ${dead.join(', ')}`
    + ' ── 見本に足すか、エンジンから消すこと(動くか誰も知らない検査は、無い検査より悪い)');
  else ok.push(`エンジンの検査の種類 ${impl.size} 種は全て見本で試されている`);
}

/* B5. エンジンに現場固有が混じっていないか
 *   ★README は「check.mjs はどのプロジェクトでも同じ中身」と書いている。
 *     実際に一度、ある現場の関数名を数える検査がエンジンに直接書かれていた(2026-08-21 発見)。
 *     固有の宛先(パス)がエンジンに在ったら、その主張はもう嘘である。 */
{
  const ALLOW = new Set(['guardian.config.json', 'guardian/guardian.config.json', 'docs/CODEMAP.md']);
  const bad = [];
  for (const f of ['check.mjs', 'hooks/codemap.js', 'hooks/clock.js', 'hooks/no-fixed-names.js']) {
    kit(f).split('\n').forEach((line, i) => {
      const t = line.trim();
      if (t.startsWith('*') || t.startsWith('//') || t.startsWith('/*')) return;   // 注釈の例え話は主張ではない
      for (const m of line.matchAll(/'([\w.-]*\/?[\w.-]+\.(?:ts|tsx|js|mjs|gs|html|sql))'/g))
        if (!ALLOW.has(m[1])) bad.push(`${f}:L${i + 1} '${m[1]}'`);
    });
  }
  if (bad.length) ng.push('エンジンが特定の宛先を直に持っています(宣言へ移すこと):\n      ' + bad.join('\n      '));
  else ok.push('エンジンは特定の宛先を1つも持っていない(どの現場へ持って行っても同じ中身)');
}

/* B6〜B7. 配布境界の照合 ── pull.mjs の【門】に対する双子(RULES 44条)
 *   (2026-08-29, AI Council EXP-001 → 依頼主の判断でホワイト＋ブラックの両立てに)
 *
 * ★門(pull.mjs)は取る側でしか働かない。**配る側で先に気づく**ための検査がここ。
 *   門と同じ2つの宣言を読む ── 表を2枚にしない。
 *
 * ★見るのは3方向:
 *   B6a 直下の全項目が、配るもの / 現場のもの の**どちらかちょうど1つ**に入っているか
 *   B6b エンジンが【配るもの】に入っているか(欠落の向き ── 配り忘れは黙って起きる)
 *   B7  install.mjs が配布先に作るものが【現場のもの】に入っているか(混入の向き)
 *       ── **独立した第二根拠**。据え付ける道具は、配る道具と同じ境界を逆側から知っている */
{
  /* 宣言を pull.mjs から読む(門と検査が同じ1つを読むため)。
   * ★正規表現を組み立てず、素直に切り出す ── 書き方が変われば下の「読めません」で止まる。 */
  const 配るもの = 分類表を取る('配るもの');
  const 現場のもの = 分類表を取る('現場のもの');

  /* 見本: この2つは必ず在る。拾えなければ pull.mjs の書き方が変わった合図(2026-08-30) */
  const 拾えた = 配るもの && 現場のもの
    && 拾えたか('配るもの', 配るもの, ['check.mjs', 'selfcheck.mjs'])
    && 拾えたか('現場のもの', 現場のもの, ['guardian.config.json', 'docs']);
  if (!拾えた) {
    if (配るもの && 現場のもの) { /* 見本が落としたので、ここでは何も言わない */ } else ng.push('pull.mjs の【配るもの】【現場のもの】が読めません。書き方を変えたならこの検査も直すこと');
  } else {
    /* B6a: 分類の網羅(この現場が正本であるときだけ意味がある ── 塊がリポジトリそのもの) */
    const 正本か = fs.existsSync(path.join(HERE, '..', '.git')) || fs.existsSync(path.join(HERE, '.git'));
    if (!正本か) {
      未測.push('配布境界の網羅は見ていません(ここは正本ではないので、直下に現場のものが同居しません)');
    } else {
      const 直下 = fs.readdirSync(HERE);
      const 未分類 = 直下.filter((n) => !配るもの.has(n) && !現場のもの.has(n));
      const 両方 = 直下.filter((n) => 配るもの.has(n) && 現場のもの.has(n));
      if (未分類.length) {
        ng.push('【配るものとも現場のものとも決まっていない】ものがあります: ' + 未分類.join(', ')
          + ' ── pull.mjs のどちらかに書くこと。決めないと、混入か欠落のどちらかが黙って起きます');
      } else if (両方.length) {
        ng.push('配るものと現場のものの両方に書かれています(どちらか一方に): ' + 両方.join(', '));
      } else {
        ok.push('直下 ' + 直下.length + ' 項目は全て分類済み(配る ' + 配るもの.size
          + ' / 現場 ' + 現場のもの.size + ')');
      }
    }

    /* B6b: 配るべきエンジンが、配るものに入っているか(欠落の向き) */
    const 抜け = ENGINE_FILES.filter((f) => !配るもの.has(f.split('/')[0]));
    const 紛れ = ENGINE_FILES.filter((f) => 現場のもの.has(f.split('/')[0]));
    if (抜け.length) {
      ng.push('エンジンが【配るもの】に入っていません(配布先へ届きません。エラーも出ません): ' + 抜け.join(', '));
    } else if (紛れ.length) {
      ng.push('エンジンが【現場のもの】に分類されています(配布されません): ' + 紛れ.join(', '));
    } else {
      ok.push('エンジン(' + ENGINE_FILES.length + '件)は【配るもの】に入り、【現場のもの】と重ならない');
    }

    /* B7: install が配布先に作るものは、定義上すべて現場固有物である */
    const 作る = new Set([...kit('install.mjs').matchAll(/path\.join\(ROOT,\s*'([^']+)'/g)].map((m) => m[1]));
    /* 見本: install は必ずこの3つを配布先に作る。拾えなければ形が変わった合図 */
    if (!拾えたか('install が配布先に作るもの', 作る, ['docs', 'guardian.config.json', 'CLAUDE.md'])) {
      /* 落としたので、この先は数えない */
    } else {
    const 漏れ = [...作る].filter((p) => !現場のもの.has(p));
    if (漏れ.length) {
      ng.push('install.mjs が配布先に作るものが【現場のもの】に入っていません(配ると配布先のものを壊します): '
        + 漏れ.join(', '));
    } else {
      ok.push('install が配布先に作るもの(' + 作る.size + '件)は、全て【現場のもの】に入っている');
    }
    }
  }
}

/* B8. 塊のフォルダを【プロジェクトの根】と取り違えないか(2026-08-29、実地で見つかった)
 *   ★事故: 古い pull.mjs は CLAUDE.md を【配らないもの】に持っていないので、取り直すと
 *     guardian/CLAUDE.md が出来る。根を探す判定は CLAUDE.md を目印にしていたため、
 *     **guardian/ で止まった** ── install.mjs はフックを guardian/.claude/ へ書き、
 *     「.claude/settings.json にフックを 4 本足しました」と**報告した**。
 *     配布先の本当の設定は一度も更新されない。**見えない失敗**そのものである。
 *   ★実際に見本を建てて確かめる(理屈ではなく実測) ── 塊らしいフォルダの中に目印を置き、
 *     根がその1つ上を指すことを確認する。 */
{
  const 仮 = fs.mkdtempSync(path.join(os.tmpdir(), 'guardian-root-'));
  try {
    const 塊 = path.join(仮, 'guardian');
    fs.mkdirSync(塊, { recursive: true });
    /* 塊らしく見せる(中身は要らない ── 判定はファイルの在る無しだけを見る) */
    for (const f of ['check.mjs', 'selfcheck.mjs']) fs.writeFileSync(path.join(塊, f), '');
    /* 古い取り直しが持ち込む【目印】を、塊の中に置く */
    fs.writeFileSync(path.join(塊, 'CLAUDE.md'), '');
    fs.writeFileSync(path.join(塊, 'guardian.config.json'), '{}');
    fs.mkdirSync(path.join(塊, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(塊, 'docs', 'CODEMAP.md'), '');
    /* 本当の根の目印 */
    fs.writeFileSync(path.join(仮, 'CLAUDE.md'), '');
    fs.writeFileSync(path.join(仮, 'guardian.config.json'), '{}');

    const 出た = spawnSync(process.execPath, ['-e',
      'const {findRoot}=require(' + JSON.stringify(path.join(HERE, 'hooks', 'lib-root.js')) + ');'
      + 'process.stdout.write(findRoot(' + JSON.stringify(塊) + '));'], { encoding: 'utf8' });
    const 根 = String(出た.stdout || '').trim();
    if (根 === fs.realpathSync(仮) || 根 === 仮) {
      ok.push('塊のフォルダを根と取り違えない(混入した目印があっても1つ上を指す)');
    } else {
      ng.push('根の判定が塊のフォルダで止まりました(' + 根 + ')。'
        + 'フックと導入が【配布先ではない場所】を見ます ── 報告は成功と出るので気づけません');
    }
  } finally {
    fs.rmSync(仮, { recursive: true, force: true });
  }
}

/* B7b. 【配ると宣言したものが、本当に配られるか】(2026-08-30、配布先を 9.13 → 9.22 に上げて見つかった)。
 *
 * ★実際に起きた: `pull.mjs` の配布一覧は `現場のもの` を**名前で・どの深さでも**弾いていた。
 *   `guardian.config.json` は現場のものなので、**`templates/guardian.config.json` まで弾かれる**。
 *   ところが指紋の対象は【配るもの】から導くので templates/ の中は入っている ──
 *   **配らないのに、配ったことにして指紋を照合していた。**
 *   配布先は取り直した直後に「配られたときの中身と違います」と言われ、1文字も直していないのに
 *   pull も stamp も拒否され、**出口が無くなった**。
 * ★これは正本では一生出ない ── ここには全部のファイルが在るので、欠けようがない。
 *   **配布の結果を、配る前にここで測る**しかない。
 * ★44条(門には双子を置く)。門(pull.mjs)は黙って落ちるので、
 *   同じ宣言を読む検査をこちらに置く。歩き方はわざと**別に書いてある**
 *   ── 同じ実装を共有すると、同じ誤りを二度数えるだけになる。 */
{
  /* ★門(pull.mjs)自身に「何を配るか」を言わせ、指紋の対象と突き合わせる。
   *   ここで歩き方を書き写すと、写した方は正しいままなので**門の退行を測れない**
   *   ── 実際、最初はそう書いて、直す前の形に戻しても緑のままだった。
   *   検査が当たらないまま緑を返すのは、この塊が生まれた事故そのものである。 */
  const r = spawnSync(process.execPath, [path.join(HERE, 'pull.mjs'), '--distributed'],
    { encoding: "utf8", windowsHide: true });
  const 配られる = new Set(String(r.stdout || "").split(String.fromCharCode(10)).map((x) => x.trim()).filter(Boolean));
  if (r.status !== 0 || !配られる.size) {
    未測.push("配布の網羅は見ていません(pull.mjs --distributed が答えません)");
  } else {
    const 届かない = ENGINE_FILES.filter((f) => !配られる.has(f));
    if (届かない.length) {
      ng.push("★指紋の対象なのに【配られない】ものがあります: " + 届かない.join(", ")
        + " ── 配布先は取り直した直後に「配られたときの中身と違います」と言われ、"
        + "**1文字も直していないのに pull も stamp も拒否されます**(出口の無い部屋)。"
        + "pull.mjs の配布一覧が、場所ではなく**名前**で弾いていないか見てください");
    } else {
      ok.push("配ると宣言したものは、本当に配られる(指紋の対象 " + ENGINE_FILES.length
        + "件すべてが、pull.mjs 自身の配布一覧に在る)");
    }
  }
}

/* B8b. 【install が2回目に判断を変えないか】(2026-08-30、違和感の掘り出しで見つかった)。
 *
 * ★実際に起きた: `CC`(この現場は Claude Code か)の判定材料に `CLAUDE.md` が入っていたが、
 *   **その CLAUDE.md は同じ install が下(手順6)で作る**。だから
 *     1回目「この現場に Claude Code の仕掛けが見当たらないので、フックは入れていません」+ CLAUDE.md 作成
 *     2回目(**何も変えずに**)「フックを4本足しました」
 *   ── 冪等が破れ、**他所の道具の現場に勝手にフックが入る**。
 * ★**冪等とは「2回目が1回目と同じ」ではなく「2回目が、1回目の出力を見ない」**である。
 * ★理屈で確かめない ── 見本を建てて**2回回す**(この事故は理屈の上では起きないので)。
 *   ついでに、判定が効くべき現場(人が書いた CLAUDE.md / .claude)でも入ることを見る
 *   ── 片側だけ見る検査は「何も入れない」に退化しても緑になる。 */
{
  const 仮 = fs.mkdtempSync(path.join(os.tmpdir(), 'guardian-cc-'));
  try {
    /* 見本を建てる: 塊は <根>/guardian/ に置き、install が読むものだけ用意する */
    const 建てる = (名, 仕込み) => {
      const 根 = path.join(仮, 名);
      const 塊 = path.join(根, 'guardian');
      fs.mkdirSync(path.join(塊, 'templates'), { recursive: true });
      fs.mkdirSync(path.join(根, 'src'), { recursive: true });
      fs.writeFileSync(path.join(根, 'src', 'a.js'), 'export const a = 1;\n');
      fs.mkdirSync(path.join(根, '.git'), { recursive: true });      // 根の目印
      /* ★見本の塊に selfcheck.mjs を置かない ── install は手順7で selfcheck を回すので、
       *   置くと【この検査が install を呼び、その install が selfcheck を呼ぶ】無限の入れ子になる
       *   (実測: 最初にそう書いたら、返ってこなくなった)。
       *   ここで測るのは install の判定だけなので、塊は install.mjs と templates/ で足りる。 */
      fs.copyFileSync(path.join(HERE, 'install.mjs'), path.join(塊, 'install.mjs'));
      for (const t of fs.readdirSync(path.join(HERE, 'templates')))
        fs.copyFileSync(path.join(HERE, 'templates', t), path.join(塊, 'templates', t));
      仕込み(根);
      return { 根, 塊 };
    };
    const 回す = ({ 根, 塊 }, ...引数) => {
      const r = spawnSync(process.execPath, [path.join(塊, 'install.mjs'), ...引数],
        { cwd: 根, encoding: 'utf8', windowsHide: true });
      return String(r.stdout || '') + String(r.stderr || '');
    };
    const 入った = (出) => /フックを \d+ 本足しました|フックは登録済み/.test(出);

    /* ① 他の道具の現場 ── 何回回しても入らない(これが破れていた) */
    const 他所 = 建てる('other', () => {});
    const 一度目 = 回す(他所), 二度目 = 回す(他所), 三度目 = 回す(他所);
    /* ② 人が書いた CLAUDE.md が在る現場 ── 入る */
    const 人 = 建てる('human', (根) => fs.writeFileSync(path.join(根, 'CLAUDE.md'), '# うちの規範\n\nテストは npm test。\n'));
    const 人の結果 = 回す(人);
    /* ③ .claude が在る現場 ── 入る */
    const 一式 = 建てる('cc', (根) => fs.mkdirSync(path.join(根, '.claude'), { recursive: true }));
    const 一式の結果 = 回す(一式);
    /* ④ --hooks で強制 ── 入る */
    const 強制 = 建てる('force', () => {});
    const 強制の結果 = 回す(強制, '--hooks');
    /* ⑤ --no-hooks で強制オフ ── .claude が在っても入らない(逃げ道が効くこと) */
    const 拒否 = 建てる('nohooks', (根) => fs.mkdirSync(path.join(根, '.claude'), { recursive: true }));
    const 拒否の結果 = 回す(拒否, '--no-hooks');

    const 外れ = [];
    if (入った(一度目)) 外れ.push('1回目で入った');
    if (入った(二度目)) 外れ.push('**2回目で入った**(1回目が作った CLAUDE.md を根拠にしている)');
    if (入った(三度目)) 外れ.push('3回目で入った');
    if (!入った(人の結果)) 外れ.push('人が書いた CLAUDE.md の現場で入らなかった');
    if (!入った(一式の結果)) 外れ.push('.claude が在る現場で入らなかった');
    if (!入った(強制の結果)) 外れ.push('--hooks を付けても入らなかった');
    if (入った(拒否の結果)) 外れ.push('--no-hooks を付けたのに入った');
    if (外れ.length) ng.push('install の Claude Code 判定が期待どおりではありません: ' + 外れ.join(' / '));
    else ok.push('install は2回目でも判断を変えない(他所の道具の現場に、回すたびにフックが増えない)');
  } catch (e) {
    /* ★見本が建てられなかったことを【緑にしない】(何も見ていないので) */
    未測.push('install の Claude Code 判定は見ていません(見本を建てられませんでした: '
      + String(e && e.message).slice(0, 120) + ')');
  } finally {
    fs.rmSync(仮, { recursive: true, force: true });
  }
}

/* B8c. 【門が、クラスで書かれた現場でも鳴るか】(2026-08-30、9.18 の作業中に見つかった)。
 *
 * ★実際に起きた: `defsOfText` が拾うのは function と const / let だけで、**class が定義にならない**。
 *   クラスの中身は字下げされているので(行頭定義だけを上位の記号と数える)メソッドも拾えず、
 *   **そのファイルは丸ごと持ち主なしになる。**
 *   実測: `class Cart { total(){ … * (1 + tax) } }` から税の掛け算を落とす(本物の破壊)→
 *   **「触れた記号: (器のコードに変更なし)」・近傍なし**。しかも何も言わない。
 *   ★JS/TS の現場の多くはクラスで書かれている。**そこでは門が丸ごと盲目**だった。
 *   この現場は関数と const だけなので、実測しないと一生出ない条件である。
 * ★だから見本を建てて【実際に門を回す】。門が鳴らないことは、この塊では合格ではない。
 * ★git が無い機械では測れない ── そのときは【未測】(緑にも赤にもしない)。 */
{
  const 仮 = fs.mkdtempSync(path.join(os.tmpdir(), 'guardian-class-'));
  const g = (...a) => spawnSync('git', a, { cwd: 仮, encoding: 'utf8', windowsHide: true });
  try {
    fs.mkdirSync(path.join(仮, 'src'), { recursive: true });
    const 書く = (p, s) => fs.writeFileSync(path.join(仮, p), s);
    書く('src/tax.js', 'export const tax = 0.1;\n');
    書く('src/cart.js', 'import { tax } from "./tax.js";\n\nexport class Cart {\n'
      + '  #items = [];\n  add(i) { this.#items.push(i); }\n'
      + '  total() { return this.#items.reduce((a, b) => a + b.price, 0) * (1 + tax); }\n}\n');
    書く('src/checkout.js', 'import { Cart } from "./cart.js";\nexport class Checkout {\n'
      + '  run(items) { const c = new Cart(); for (const i of items) c.add(i); return c.total(); }\n}\n');
    書く('guardian.config.json', JSON.stringify({
      neighbors: { rings: 2, code: ['src'], notes: [], ext: ['js'],
        answer: '.guardian/a.json', need: '.guardian/n.json' } }, null, 1) + '\n');
    if (g('init', '-q', '.').status !== 0) throw new Error('git init が失敗');
    g('config', 'user.email', 'selfcheck@example.invalid');
    g('config', 'user.name', 'selfcheck');
    g('add', '-A');
    if (g('commit', '-q', '-m', 'seed').status !== 0) throw new Error('git commit が失敗');
    /* 本物の破壊: 税の掛け算を落とす(クラスのメソッドの中) */
    書く('src/cart.js', fs.readFileSync(path.join(仮, 'src/cart.js'), 'utf8').replace(' * (1 + tax);', ';'));

    const r = spawnSync(process.execPath, [path.join(HERE, 'neighbors.mjs'), '--list'],
      { cwd: 仮, encoding: 'utf8', windowsHide: true });
    const 出 = String(r.stdout || '') + String(r.stderr || '');
    const 外れ = [];
    if (!/触れた記号:[^\n]*\bCart\b/.test(出)) 外れ.push('クラス Cart を【触れた記号】と見なせていない');
    if (!/\bCheckout\b/.test(出)) 外れ.push('Cart を使う Checkout が近傍に出ていない');
    if (外れ.length) {
      ng.push('門がクラスで書かれた現場で鳴りません: ' + 外れ.join(' / ')
        + ' ── そこでは**門が丸ごと盲目**になります(出力: ' + 出.split('\n').slice(0, 3).join(' / ').slice(0, 200) + ')');
    } else {
      ok.push('門はクラスで書かれた現場でも鳴る(class の変更を捉え、それを使う側を近傍に出す)');
    }
  } catch (e) {
    未測.push('門のクラス対応は見ていません(見本を建てられませんでした: '
      + String(e && e.message).slice(0, 120) + ')── git が要ります');
  } finally {
    fs.rmSync(仮, { recursive: true, force: true });
  }
}

/* B9. 運用の文脈が宣言されているか(2026-08-30、実験室での実測から)
 *   ★止めない。だが【見ていない】ことを黙らない ── B1c(個人情報の見張り)と同じ形。
 *
 *   実測(research/lab/EXP-004): 壊れが全部「無いもの」の題材で、
 *     「一から書くなら?」            … 3/6
 *     「何が起きたら困る?」          … 3/6(同じ3件を見つけ、同じ3件を見逃した)
 *     理由なし・確信度つき ×2体      … 3/6(やはり同じ3件)
 *     「一から書くなら?」+ 運用の文脈 … 5〜6/6
 *   **問いをどう変えても1ミリも動かず、文脈を足したら動いた。**
 *   足した文脈と出たものが1対1で対応した(数百MB→上限 / cron5分→錠 / 5人2年→記録)。
 *
 *   ★つまり運用の欠落(上限・錠・記録・退避)は、文脈が宣言されるまで
 *     **どんな問い方をしても永久に出ない。** 無音を安全と読ませないために、ここで言う。 */
{
  let 文脈 = null;
  try {
    const { 宣言 } = 宣言を読む();
    文脈 = 宣言 ? (Array.isArray(宣言.context) ? 宣言.context.filter((x) => String(x).trim()) : []) : null;
  } catch (_) { 文脈 = null; }

  if (文脈 === null) {
    未測.push('運用の文脈: 宣言が読めないので見ていません');
  } else if (!文脈.length) {
    未測.push('運用の文脈が宣言されていないので、**運用の欠落(上限・錠・記録・退避)は見ていません**'
      + ' ── guardian.config.json の context に書くまで、どんな問い方をしても出ません(guardian/hunch.md)');
  } else {
    ok.push('運用の文脈を ' + 文脈.length + ' 行 宣言している(違和感が届く広さは、ここで決まる)');
  }
}

/* ---------- 守りの下限を上げる(--tighten) ----------
 * check.mjs の max と同じラチェット。向きだけ逆(あちらは下げる、こちらは上げる)。
 * 文章で止まっていた事故を検査に変えたら、その進みを**後戻りできない形**で残す。 */
if (process.argv.includes('--tighten')) {
  console.log('');
  if (!whyLoose) console.log('  ✓ 上げられる下限はありません(ぴったり)');
  else {
    const p = path.join(HERE, 'WHY.md');
    const t = fs.readFileSync(p, 'utf8');
    const next = t.replace(/守られている:\s*\d+\s*件/, `守られている: ${whyLoose.held}件`);
    if (next === t) console.log('  ! WHY.md の下限が書き換えられません(手で直してください)');
    else { fs.writeFileSync(p, next, 'utf8'); console.log(`  ✓ WHY.md の守りの下限を上げました: ${whyLoose.floor} → ${whyLoose.held}件`); }
  }
}

/* ---------- 結果 ---------- */
/* ★3語で出す: ✓ 通過 / ? 未測 / ✗ 外れ。
 *   未測は【止めない】が【緑に混ぜない】── verdict.mjs の「不明」と同じ扱い。
 *   ★出口は 0 のまま(未測は失敗ではない)。合否の側で拾いたい現場は、
 *     guardian.config.json の evidence に `"unknownIf": "未測 [1-9]"` を足すと【不明】になる。 */
for (const s of ok) console.log('  ✓ ' + s);
for (const s of 未測) console.log('  ? 未測 ' + s);
if (ng.length) {
  console.log('');
  for (const s of ng) console.log('  ✗ ' + s);
  console.log(`\n塊の自己検査: ${ng.length}件の外れ`
    + (未測.length ? ` / 未測 ${未測.length}件` : ''));
  process.exit(1);
}
if (未測.length) {
  console.log(`\n塊の自己検査: 通過 ${ok.length}件 / **未測 ${未測.length}件**`);
  console.log('  ※【未測】は合格ではありません。**測れていない**という意味です'
    + '(guardian.config.json に宣言を書くと測れるようになります)。');
  process.exit(0);
}
console.log(`\n塊の自己検査: ${ok.length}件すべて期待どおり`);
