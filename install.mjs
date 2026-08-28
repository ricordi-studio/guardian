/**
 * 導入(機械にできる部分を全部やる)
 *
 *   node guardian/install.mjs          # 導入する
 *   node guardian/install.mjs --dry    # 何をするかだけ見る
 *
 * やること(すべて冪等・既にあるものは触らない):
 *   1. docs/CODEMAP.md を置く(無ければ雛形から)
 *   2. guardian.config.json を置く(無ければ、**このリポジトリを実際に見て**中身を推測して書く)
 *   3. .claude/settings.json にフックを登録する(既存の設定は壊さず足すだけ)
 *   4. CLAUDE.md(AIが最初に読む文書)に読む順の指定を足す
 *
 * やらないこと(人とAIの判断が要る):
 *   ・地図に何を書くか        … 機能ごとの接点は、そのプロジェクトを知らないと書けない
 *   ・不変条件に何を並べるか  … 「同じ値が2箇所にある」は、意味を知らないと見つけられない
 *   → 済んだら install.md をAIに読ませること。続きの手順が書いてある。
 */
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const DRY = process.argv.includes('--dry');
/* ★ファイルURL→パスの変換は node の口を使う(2026-08-28 配布先で見つかった)。
 *   自前で pathname を削る書き方は、**フォルダ名に空白が入ると壊れる**
 *   (URLでは %20 になるので、そのままパスとして使うと存在しない場所を指す)。
 *   こちらのパスに空白が無いので一生出なかった ── 配布先(空白入り)で初めて出た。 */
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const KIT = path.relative(process.cwd(), HERE).split(path.sep).join('/') || 'guardian';

/* 塊がどこに置かれていても、プロジェクトの根を自分で探す */
function findRoot(start) {
  let d = start;
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(d, '.git')) || fs.existsSync(path.join(d, 'package.json'))
        || fs.existsSync(path.join(d, 'CLAUDE.md'))) return d;
    const up = path.dirname(d);
    if (up === d) break;
    d = up;
  }
  return process.cwd();
}
const ROOT = findRoot(HERE);
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');
const did = [];
const skipped = [];
const todo = [];

function write(p, body, what) {
  if (fs.existsSync(p)) { skipped.push(`${rel(p)} は既にあるので触っていません`); return false; }
  if (!DRY) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); }
  did.push(`${rel(p)} を置きました（${what}）`);
  return true;
}

/* ---------- 1. 地図 ---------- */
const mapPath = path.join(ROOT, 'docs', 'CODEMAP.md');
write(mapPath, fs.readFileSync(path.join(HERE, 'templates', 'CODEMAP.md'), 'utf8'), '空の地図。ここから書き足していく');

/* ---------- 2. 宣言(このリポジトリを実際に見て推測する) ---------- */
const cfgPath = path.join(ROOT, 'guardian.config.json');
if (!fs.existsSync(cfgPath)) {
  const IGNORE = new Set(['node_modules', '.git', '.claude', 'dist', 'build', 'docs', 'tools',
                          '.github', '.wrangler', 'coverage', 'vendor', 'img', 'assets', 'public']);
  const CODEY = /^(src|app|lib|server|web|api|site|worker|gas|functions|packages|frontend|backend|scripts|supabase|companion)$/i;
  let dirs = [];
  try {
    dirs = fs.readdirSync(ROOT, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith('.') && !IGNORE.has(e.name))
      .map((e) => e.name);
  } catch (_) {}
  const watch = dirs.filter((d) => CODEY.test(d));
  // ソース候補: 見張る場所の直下にある、それらしい拡張子のファイル(深追いしない)
  const EXT = /\.(ts|tsx|js|mjs|cjs|jsx|html|gs|py|go|rb|php)$/i;
  const sources = [];
  const walk = (dir, depth) => {
    if (depth > 2 || sources.length > 60) return;
    let es = [];
    try { es = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
    for (const e of es) {
      if (e.name.startsWith('.') || IGNORE.has(e.name)) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full, depth + 1);
      else if (EXT.test(e.name)) sources.push(rel(full));
    }
  };
  for (const w of watch) walk(path.join(ROOT, w), 0);
  const selectors = sources.filter((f) => /\.html$/i.test(f)).slice(0, 8);

  const cfg = {
    _: 'このプロジェクト固有の不変条件。エンジン(' + KIT + '/check.mjs)はどこでも同じ中身で、違いは全部このファイルに集める。',
    _why: '各検査の why は『どの事故を防ぐか』。理由の無い検査は必ず外される(WHY.md 参照)。',
    map: 'docs/CODEMAP.md',
    _watch: '地図が指している実装の場所。フックはここを触ったときだけ鳴り、監査の催促もここの変更で駆動する',
    watch: watch.length ? watch : ['src'],
    auditHours: 3,
    _sources: '記号の実在照合の対象。地図に書いた実名がここに無ければ落ちる(導入時に自動で拾った候補)',
    sources,
    skipSymbols: [],
    _checks: '↓ここは【人とAIが書く】。同じ意味の値が複数箇所にある所を並べる。空でも動く',
    checks: [],
    /* ★近傍照合の門(ADR-081)。**書かないと門が黙る** ── 2026-08-28 に別プロジェクトへ
     *   実際にコピーして回したら「宣言が無いので回しません」と出た。既定を置いておく。 */
    _neighbors: '修正した記号の【2つ外側】を機械が列挙し、全項に 触れた/影響なし/報告+理由 が無ければ合否が差戻。回答はコミットに含める(監査できる痕跡)',
    neighbors: {
      rings: 2,
      code: watch.length ? watch : ['src'],
      notes: [],
      ext: ['ts', 'tsx', 'js', 'mjs', 'cjs', 'jsx', 'html', 'gs', 'py', 'go', 'rb'],
      answer: '.guardian/neighbors.answer.json',
      need: '.guardian/neighbors.need.json',
      max_callers: 40,
      skip_touched: ['\.selftest\.', '\.e2e\.', '\.test\.', '\.spec\.'],
      ignore_symbols: [],
      _entry_symbols: '実行環境が名前で呼ぶ入口(GASのdoPost等)。参照ゼロでも死にコードではない',
      entry_symbols: [],
    },
    /* ★合否の証拠。**空だと合否は【不明】から始まる**(何も測っていないので、それが正しい)。
     *   このリポジトリで実際に回る検査を並べるまで、合格とは言わせない。 */
    _evidence: '合否(verdict.mjs)が回す検査。name/run/fast/timeoutSec。空なら【不明】',
    evidence: [],
    selectors,
    okMarker: 'guardian:ok|lint-deps:ok',
  };
  if (!DRY) fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + '\n');
  did.push(`guardian.config.json を置きました（見張る場所 ${cfg.watch.join('/')} ・ソース候補 ${sources.length}件を自動で拾いました）`);
  todo.push('guardian.config.json の checks が空です。**同じ意味の値が複数箇所にある所**を探して並べてください(WHY.md の B を参照)');
  todo.push('guardian.config.json の evidence が空です。**このリポジトリで実際に回る検査**(型・単体・e2e・lint)を並べてください ── 空のままだと合否は【不明】のまま(不明は合格ではない)');
} else {
  skipped.push('guardian.config.json は既にあるので触っていません');
}

/* ★【この現場に Claude Code の仕掛けがあるか】(2026-08-28)。
 *
 *   Guardian の**本体**(検査・門・合否・監査の手順)は Node だけで動き、どの開発ツールでも使える。
 *   Claude Code に依存しているのは**自動で鳴る部分**だけ ── フックとスラッシュコマンド。
 *   だから他の道具の現場で `.claude/` を勝手に作らない。**作らずに、手で回す手順を出す。**
 * ★判定は「既に .claude/ か CLAUDE.md があるか」。--hooks / --no-hooks で上書きできる。
 *   どちらにしたかは**必ず言う**(黙って片方を選ぶと、なぜ鳴らないのか分からなくなる)。 */
const CC = process.argv.includes('--hooks') ? true
  : process.argv.includes('--no-hooks') ? false
  : (fs.existsSync(path.join(ROOT, '.claude')) || fs.existsSync(path.join(ROOT, 'CLAUDE.md')));

/* ---------- 3. フックの登録(既存を壊さない) ---------- */
if (CC) {
const setPath = path.join(ROOT, '.claude', 'settings.json');
let settings = {};
try { settings = JSON.parse(fs.readFileSync(setPath, 'utf8')); } catch (_) {}
settings.hooks = settings.hooks || {};
const want = [
  ['UserPromptSubmit', null, `node ${KIT}/hooks/clock.js`, 10],
  ['PreToolUse', 'Edit|Write', `node ${KIT}/hooks/codemap.js`, 15],
  /* ★門(第4層)。**登録しないと、コピー先には最強の層だけが付いてこない**(2026-08-21 に実際そうだった)。
   * 禁止語は門が持たず、宣言の onlyIn(max:0)から読むので、宣言が無い現場では何もしない = 置いて安全。 */
  ['PreToolUse', 'Edit|Write', `node ${KIT}/hooks/no-fixed-names.js`, 10],
  /* ★完了を名乗る手前の合否(段取り2)。証拠が宣言されていない現場では何もしないので、置いて安全。 */
  ['Stop', null, `node ${KIT}/hooks/stop.js`, 900],
];
let added = 0;
for (const [event, matcher, command, timeout] of want) {
  const list = (settings.hooks[event] = settings.hooks[event] || []);
  const exists = JSON.stringify(list).includes(command);
  if (exists) { skipped.push(`${event} のフックは登録済み`); continue; }
  const slot = list.find((g) => (g.matcher || null) === matcher);
  const entry = { type: 'command', command, timeout };
  if (slot) (slot.hooks = slot.hooks || []).push(entry);
  else list.push(matcher ? { matcher, hooks: [entry] } : { hooks: [entry] });
  added++;
}
if (added) {
  if (!DRY) { fs.mkdirSync(path.dirname(setPath), { recursive: true }); fs.writeFileSync(setPath, JSON.stringify(settings, null, 2) + '\n'); }
  did.push(`.claude/settings.json にフックを ${added} 本足しました（既存の設定は残しています）`);
}

/* ---------- 4. 夜間の見張り(GitHub Actions) ----------
 * ★これが無いと、検査は「誰かが手で回したときだけ」動く道具になる。
 * クラウドで回るので、PCの電源にもAIのセッションにも依存しない。 */
/* ★既に check.mjs を呼ぶ workflow が在るなら、名前が違っても置かない(2026-08-21)。
 * ファイル名だけで見ていたので、手直しした workflow が在る所へ**2本目**を置いてしまい、
 * 毎晩2回検査して、片方だけ古いまま残る状態を作れた ── 冪等の判定を名前でやると、こうなる。 */
{
  const dir = path.join(ROOT, '.github', 'workflows');
  let already = '';
  try {
    for (const f of fs.readdirSync(dir))
      if (fs.readFileSync(path.join(dir, f), 'utf8').includes(`${KIT}/check.mjs`)) { already = f; break; }
  } catch (_) { /* .github が無ければ置く */ }
  if (already) skipped.push(`.github/workflows/${already} が既に検査を回しているので触っていません`);
  else write(path.join(dir, 'guardian-nightly.yml'),
    fs.readFileSync(path.join(HERE, 'templates', 'nightly-check.yml'), 'utf8').replace(/tools\/guardian/g, KIT),
    '毎晩01:00に検査し、赤ければIssueを立てる。緑に戻れば閉じる');
}

/* ---------- 5. 監査の呼び出し口(/guardian-audit) ----------
 * ★スラッシュコマンドは【リポジトリの中】に置ける = コピーで付いてくる。
 * 無人の定期実行は各自のアカウント側にしか置けないが、これがあれば
 * **誰でも1語で回せる**。手順の正典は塊の中にあり、ここは呼び出すだけ。 */
write(path.join(ROOT, '.claude', 'commands', 'guardian-audit.md'),
  fs.readFileSync(path.join(HERE, 'templates', 'guardian-audit-command.md'), 'utf8').replace(/tools\/guardian/g, KIT),
  '/guardian-audit で誰でも監査を回せるようにする');

}   /* ← Claude Code の現場のときだけ(フックとスラッシュコマンド) */
else {
  /* ★他の道具の現場: 自動で鳴る仕掛けは入れられないが、**中身は1つも減らない**。
   *   何を手で回すのかを、その場で全部見せる ── 「入らなかった」で終わらせない。 */
  skipped.push('この現場に Claude Code の仕掛けが見当たらないので、フックとスラッシュコマンドは入れていません'
    + '(--hooks を付ければ入れます)');
  todo.push('★自動で鳴る仕掛けの代わりに、**手で回してください**(中身は1つも減りません):'
    + String.fromCharCode(10) + '     node ' + KIT + '/verdict.mjs         … 完了の判定(通過/差戻/注意/不明)'
    + String.fromCharCode(10) + '     node ' + KIT + '/check.mjs           … 地図と実装のずれ'
    + String.fromCharCode(10) + '     node ' + KIT + '/neighbors.mjs --gate … 修正の2つ外側に答えたか'
    + String.fromCharCode(10) + '     node ' + KIT + '/neighbors.mjs --sweep … 全体の棚卸し(監査の下ごしらえ)'
    + String.fromCharCode(10) + '     ' + KIT + '/audit.md を読ませて定期監査(4観点)');
  todo.push('お使いの道具にフック相当の仕掛け(コミット前・応答前に何か走らせる機能)があれば、'
    + KIT + '/hooks/*.js を呼ぶよう設定すれば、鳴る部分も同じように働きます');
}

/* ---------- 6. AIが最初に読む文書へ追記 ---------- */
/* 貼るのは【読む順の指定】だけ。フック登録のJSONは上で済ませたので載せない
 * ── 済んだ手順が書いてあると、次に読む人が二重にやろうとする。 */
/* 注釈(<!-- … -->)を丸ごと落として、**箇条書きだけ**を貼る。
 * 作業指示や、上で済ませたフック登録のJSONを貼ると、次に読む人が二重にやろうとする。 */
const snippet = fs.readFileSync(path.join(HERE, 'templates', 'CLAUDE-snippet.md'), 'utf8')
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/tools\/guardian/g, KIT).replace(/\n{3,}/g, '\n\n').trim();
const claudePath = path.join(ROOT, 'CLAUDE.md');
let claude = '';
try { claude = fs.readFileSync(claudePath, 'utf8'); } catch (_) {}
if (claude.includes(`${KIT}/RULES.md`)) {
  skipped.push('CLAUDE.md には既に書いてあります');
} else {
  const body = claude
    ? claude.replace(/\s*$/, '') + '\n\n## 修繕の仕組み(' + KIT + ')\n\n' + snippet + '\n'
    : '# CLAUDE.md — 開発規範\n\n## 修繕の仕組み(' + KIT + ')\n\n' + snippet + '\n';
  if (!DRY) fs.writeFileSync(claudePath, body);
  did.push(claude ? 'CLAUDE.md に読む順の指定を足しました' : 'CLAUDE.md を作りました');
}

todo.push('docs/CODEMAP.md がまだ空です。**触った機能から**項を足していってください(全部いっぺんに書かなくてよい)');
todo.push(`検査を回す: node ${KIT}/check.mjs`);

/* ---------- 7. 塊そのものが生きていることを、その場で確かめる ----------
 * 「わざと壊して落ちることを確かめる」は、これまで導入した人の judgment 任せだった。
 * 機械にできる部分(エンジンが壊れたら赤くなるか)は、その場で機械に言わせる。 */
if (!DRY) {
  const r = spawnSync(process.execPath, [path.join(HERE, 'selfcheck.mjs')], { encoding: 'utf8' });
  if (r.status === 0) did.push('塊そのものの自己検査が通りました(エンジンは生きています)');
  else todo.push('⚠ 塊の自己検査が赤いです。まず `node ' + KIT + '/selfcheck.mjs` を見てください'
    + '(この状態の check.mjs の「ずれなし」は信用できません)');
}

/* ---------- 結果 ---------- */
/* ---------- 古い名前の置き去りを見る(2026-08-28) ---------- */
/* ★実際に起きた: 塊の名前を codemap → guardian に変えて配ったとき、配布先に
 *   codemap.config.json(その現場が**自分で書いた検査2件**入り)が残り、
 *   install が「既にあるものは触らない」ので**空の guardian.config.json を作って終わった**。
 *   古い方は誰も読まなくなるので、**その現場の検査が黙って効かなくなる**ところだった。
 * ★フックも二重登録になっていた(古い4本 + 新しい4本)。
 * ★勝手に移さない ── 中身は現場のもの。**見つけて、名指しで教える**までが機械の仕事。 */
{
  const 古い = [
    { p: 'codemap.config.json', say: '宣言(この現場で書いた検査が入っています)' },
    { p: '.claude/commands/codemap-audit.md', say: '監査のコマンド' },
    { p: 'tools/codemap', say: '塊の古いフォルダ' },
    { p: 'tools/guardian', say: '塊の古いフォルダ(9.0 でルート直下 guardian/ へ移りました)' },
    { p: 'tools/codemap.config.json', say: '古い宣言' },
  ].filter((x) => fs.existsSync(path.join(ROOT, x.p)));
  for (const x of 古い)
    todo.push('★古い名前が残っています: ' + x.p + '(' + x.say + ')。**中身を新しい方へ移してから消してください** ── 残したままだと、そちらは誰にも読まれません');
  /* フックの二重登録 */
  try {
    const s = JSON.parse(fs.readFileSync(path.join(ROOT, '.claude', 'settings.json'), 'utf8'));
    let 古いフック = 0;
    for (const 種 of Object.keys(s.hooks || {}))
      for (const g of s.hooks[種])
        古いフック += (g.hooks || []).filter((h) => /tools\/codemap\//.test(String(h.command || ''))).length;
    if (古いフック)
      todo.push('★古いフックの登録が ' + 古いフック + '本残っています(.claude/settings.json の tools/codemap/…)。二重に走るので、古い方を消してください');
  } catch (_) {}
}

console.log(DRY ? '【下見】以下を行います\n' : '【導入しました】\n');
for (const d of did) console.log('  ✓ ' + d);
for (const s of skipped) console.log('  ・' + s);
if (todo.length) {
  console.log('\n【ここから先は判断が要ります（AIに ' + KIT + '/install.md を読ませてください）】');
  for (const t of todo) console.log('  ⬜ ' + t);
}
