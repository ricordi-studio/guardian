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
const NL2 = String.fromCharCode(10);
const ok = [];
const ng = [];
let whyLoose = null;      // 守りが下限より増えている(--tighten で上げる)

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
  const 対象 = ['check.mjs', 'selfcheck.mjs', 'neighbors.mjs', 'verdict.mjs', 'install.mjs', 'pull.mjs',
                'hooks/clock.js', 'hooks/codemap.js', 'hooks/lib-root.js',
                'hooks/no-fixed-names.js', 'hooks/no-reflex.js', 'hooks/stop.js'];
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
  const 違う = 対象.filter((f) => 記録[f] !== いま[f]);

  if (process.argv.includes("--stamp")) {
    押す();
    ok.push("エンジンの指紋を押し直しました(" + 対象.length + "件)── 配った先へも配り直すこと");
  } else if (!Object.keys(記録).length) {
    ng.push("ENGINE_FP がありません。`node guardian/selfcheck.mjs --stamp` で押してください");
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
      const 先 = path.join(process.cwd(), "guardian-report.md");
      fs.writeFileSync(先, 出.join("\n"));
      ok.push("改善報告を書きました: " + 先 + "(" + 違う.length + "ファイル)── 承認を得てから元の塊へ渡してください");
    } else {
      ng.push("★この塊は配られたときの中身と違います(" + 違う.join(", ") + ")。"
        + "**直したなら元の塊へ戻すこと**(戻さないと、次に配ったとき直りが消えます)。"
        + "`--report` で渡す1枚を作れます。意図した変更なら `--stamp` で押し直してください");
    }
  } else {
    ok.push("エンジンは配られたときの中身のまま(" + 対象.length + "件)");
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
    ok.push("個人情報の見張りは**していません**(guardian.config.json の private が空)"
      + " ── 配るなら、伏せたい語をそこに並べてください");
  } else {
    const 見つかった = [];
    const 歩く = (dir) => {
      for (const en of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, en.name);
        if (en.isDirectory()) { 歩く(full); continue; }
        if (!/\.(md|mjs|js|json|yml)$/.test(en.name)) continue;
        const s = fs.readFileSync(full, "utf8");
        for (const w of 語) if (s.includes(w)) 見つかった.push(en.name + ": " + w);
      }
    };
    歩く(HERE);
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
        const 先 = path.join(process.cwd(), "guardian-why-report.md");
        fs.writeFileSync(先, 出.join("\n"));
        const 送る = "gh issue create --repo ricordi-studio/guardian"
          + " --title " + JSON.stringify("事故レポート: " + 足された.length + "件")
          + " --body-file " + JSON.stringify(先);
        if (process.argv.includes("--send")) {
          const r = spawnSync(送る, { shell: true, encoding: "utf8" });
          if (r.status === 0) ok.push("事故レポートを送りました: " + String(r.stdout || "").trim());
          else ng.push("送れませんでした(gh が要ります / gh auth login で認証): "
            + String(r.stderr || "").slice(0, 200) + " ── 1枚は " + 先 + " に在ります");
        } else {
          ok.push("事故レポートを書きました: " + 先 + "(" + 足された.length + "件)");
          ok.push("中身を読んで**承認**したら、これで送れます:\n     " + 送る
            + "\n   (`--why --send` でその場で送ることもできます)");
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
      const 対 = [
        [/事故\s*(\d+)\s*件/g, real.WHY, '事故の件数'],
        [/作法\s*(\d+)\s*条/g, real.RULES, '作法の条数'],
        [/規律\s*(\d+)\s*条/g, real.RULES, '規律の条数'],
        [/自己検査\s*(\d+)\s*件/g, null, '自己検査の件数'],
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
  for (const d of DOCS) 裸(d, kit(d));

  for (const d of DOCS) look(d, kit(d));
  for (const d of OUT) { try { look(d, fs.readFileSync(path.join(HERE, '..', '..', d), 'utf8')); } catch (_) { /* 無ければ見ない */ } }
  if (bad.length) ng.push('文書が書いている件数が実数と合っていません:\n      ' + bad.join('\n      '));
  else ok.push(`文書の件数は実数と一致(RULES ${real.RULES}条 / WHY ${real.WHY}件)`);
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
for (const s of ok) console.log('  ✓ ' + s);
if (ng.length) {
  console.log('');
  for (const s of ng) console.log('  ✗ ' + s);
  console.log(`\n塊の自己検査: ${ng.length}件の外れ`);
  process.exit(1);
}
console.log(`\n塊の自己検査: ${ok.length}件すべて期待どおり`);
