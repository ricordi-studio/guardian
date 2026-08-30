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

/* ★【この道具が知っている口】── 宣言ではなく、ここが実装そのものである
 *   (2026-08-31、第2の議題。配布先(現場A)の実測が発端)。
 *
 * ★実際に起きたこと: 案内されている口を「ソースにその文字列が在るか」で照合したら、
 *   3通りの数え方で3通りの答えが出た。とくに `neighbors --list` は**文字列としては在るが、
 *   argv を見ていない**(既定動作だった)── **書いてある ≠ 口として在る**。
 *   これは 9.46 で `PROTOCOL.json` に置き換えたばかりの「綴りで能力を測る」罠と同じ形である。
 * ★だから【この配列が唯一の正】にする: ここが未知の口を拒み、ここが `--口一覧` を答える。
 *   selfcheck の B11 が、SPEC.md の表と**この出力**を突き合わせる(44条の双子)。
 * ★穴として書く: これが証明するのは「その口を受け付ける」までで、
 *   **その口が仕事をする**ことではない。そこは各口の検査の仕事。 */
const 知っている口 = ['--口一覧', '--dry', '--hooks', '--no-hooks'];
const 値を取る口 = {};
const 残りを全部取る口 = [];
if (process.argv.includes('--口一覧')) {
  process.stdout.write(知っている口.join(String.fromCharCode(10)) + String.fromCharCode(10));
  process.exit(0);
}
{
  const 渡された = process.argv.slice(2);
  const 知らない = [];
  for (let i = 0; i < 渡された.length; i++) {
    const v = 渡された[i];
    if (!v.startsWith('--')) continue;          /* 口の値は飛ばす */
    if (残りを全部取る口.includes(v)) break;     /* ここから先は全部その口の値 */
    if (!知っている口.includes(v)) { 知らない.push(v); continue; }
    i += (値を取る口[v] || 0);
  }
  if (知らない.length) {
    console.error('✗ この道具は、その口を知りません: ' + 知らない.join(', '));
    console.error('  知っている口: ' + 知っている口.join(' / '));
    console.error('  ★黙って無視すると、打ったつもりと違う動きをしたまま報告することになります');
    process.exit(1);
  }
}
const HERE = path.dirname(fileURLToPath(import.meta.url));
/* ★塊がリポジトリそのものである現場(=Guardian 自身を開発する場所)では、
 *   ここが空文字になる。以前は空なら "guardian" に落としていたが、それは**存在しないパス**で、
 *   案内が `node guardian/check.mjs` になり、貼っても動かなかった(2026-08-29 実地で発覚)。
 *   空なら "." ── その場所そのものが塊である、と正しく言う。 */
const KIT = path.relative(process.cwd(), HERE).split(path.sep).join('/') || '.';

/* 塊がどこに置かれていても、プロジェクトの根を自分で探す */
/* ★hooks/lib-root.js の findRoot とは【別の仕事】である(2026-08-29 監査で名前を分けた)。
 *   あちらは【導入後】に走るので guardian.config.json / docs/CODEMAP.md を目印にできる。
 *   こちらは【導入する前】に走るので、それらはまだ存在しない ── .git / package.json / CLAUDE.md しか手がかりが無い。
 *   同じ名前だったので「写経(重複)」に見えていたが、目印が違う以上ひとつにはできない。
 *   ★名前を分けたのは、次に直す人が【もう一方も直すべきか】を毎回考えずに済むようにするため。 */
function findInstallRoot(start) {
  let d = start;
  for (let i = 0; i < 8; i++) {
    const has = (p) => fs.existsSync(path.join(d, p));
    /* ★【塊のフォルダ自身を根と見なさない】(2026-08-29 実地で見つかった)。
     *   古い pull.mjs は CLAUDE.md を【配らないもの】に持っていないので、取り直すと
     *   **guardian/CLAUDE.md** が出来る。CLAUDE.md を根の目印にしていたこの判定は、
     *   そこで止まって **guardian/ を根だ**と言った ── フックを guardian/.claude/ へ書き、
     *   「足しました」と報告する。**配布先の本当の設定は一度も更新されない**(見えない失敗)。
     * ★塊がリポジトリそのものである現場(正本)では、同じ場所に .git が在るので下の判定が勝つ。 */
    const 塊そのもの = has('check.mjs') && has('selfcheck.mjs') && !has('.git');
    if (!塊そのもの && (has('.git') || has('package.json') || has('CLAUDE.md'))) return d;
    const up = path.dirname(d);
    if (up === d) break;
    d = up;
  }
  return process.cwd();
}
const ROOT = findInstallRoot(HERE);
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
    _context: '★この道具が【どう運用されるか】。誰が・いつ・どれだけ・何度・どこへ公開されるか。ここが空だと運用の欠落(上限・錠・記録・退避)は永久に出ない ── 実測: 問いを3通りに変えても同じ3件を落とし、文脈4行を足した1回だけが見つけた(' + KIT + '/hunch.md)',
    context: [],
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
      /* ★欄は【書かない】= エンジンの既定を使う、という意味にしてある(空配列を書くと「1語も落とさない」)。
       *   既定の一覧を写すと正本が2つになるので、ここには案内だけ置く(39条)。 */
      _common_keys: 'ノート(宣言)の欄名のうち、コード中の別物としても出るので数えない語の一覧。書かなければエンジンの既定(' + KIT + '/neighbors.mjs の 一般語)。★この現場で**本当に使っている欄名**が既定に入っているなら、既定から外した一覧をここに書くこと ── 外さないと、その欄の読み手は近傍に出ない(黙って落ちる)',
      _global_scope: '★全ファイルが【同じ大域スコープ】を共有する言語の拡張子(GAS の gs / HTML の <script> から呼ぶ古典スクリプトの js 等)。書かないと、export の橋が無い呼び出しが見えず、実際は呼ばれている記号が死にコード候補に出る(2026-08-30 配布先の実測)',
      global_scope: [],
      _entry_symbols: '実行環境が名前で呼ぶ入口(GASのdoPost等)。参照ゼロでも死にコードではない',
      entry_symbols: [],
    },
    /* ★合否の証拠。**空だと合否は【不明】から始まる**(何も測っていないので、それが正しい)。
     *   このリポジトリで実際に回る検査を並べるまで、合格とは言わせない。 */
    /* ★【塊が配る4件】は、どの現場でも同じなので自動で書く(2026-08-30、配布先の実測から)。
     *   配布先の言葉:「evidence 8件の決め方は、はっきり2層に割れている」──
     *   塊の4件(どこでも同じ)と、現場の4件(その現場しか知らない)。
     *   前者を空のままにする理由が無い。**空だと合否は【不明】のまま=まだ稼働していない。**
     * ★後者は**勝手に埋めない**。埋めたら『測っていないのに緑』になる ── この塊が防ぎたいことそのもの。
     *   代わりに package.json / Makefile / CI から**候補を出すだけ**にして、選ぶのは人。 */
    _evidence: '合否(verdict.mjs)が回す検査。name/run/fast/timeoutSec。★塊の4件は自動で入っている。**この現場の検査を足すまで、測れているのは塊だけ**',
    evidence: [
      { name: '塊の自己検査(わざと壊して赤くなるか)', run: 'node ' + KIT + '/selfcheck.mjs', fast: true, timeoutSec: 180 },
      { name: 'WHY の索引が最新か', run: 'node ' + KIT + '/index.mjs --check', fast: true, timeoutSec: 60 },
      { name: '地図・正本', run: 'node ' + KIT + '/check.mjs', fast: true, timeoutSec: 120 },
      { name: '近傍照合(修正の2つ外側に答えたか)', run: 'node ' + KIT + '/neighbors.mjs --gate', fast: true, timeoutSec: 120 },
    ],
    selectors,
    okMarker: 'guardian:ok|lint-deps:ok',
  };
  if (!DRY) fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + '\n');
  did.push(`guardian.config.json を置きました（見張る場所 ${cfg.watch.join('/')} ・ソース候補 ${sources.length}件を自動で拾いました）`);
  todo.push('guardian.config.json の checks が空です。**同じ意味の値が複数箇所にある所**を探して並べてください(WHY.md の B を参照)');
  todo.push('guardian.config.json の **context が空**です。**この道具がどう運用されるか**(誰が・いつ・どれだけ・何度・どこへ公開されるか)を数行で書いてください ── ここが空だと【運用の欠落】(上限・錠・記録・退避)は、どんな問い方をしても永久に出ません(' + KIT + '/hunch.md)');
  /* ★候補を出すだけ ── 選ぶのは人(2026-08-30、配布先の実測から) */
  {
    const 候補 = [];
    try {
      const pj = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));   // guardian:read
      for (const k of Object.keys(pj.scripts || {})) 候補.push('npm run ' + k);
    } catch (_) {}
    try {
      for (const m of fs.readFileSync(path.join(ROOT, 'Makefile'), 'utf8').matchAll(/^([a-zA-Z0-9_-]+):/gm)) 候補.push('make ' + m[1]);   // guardian:read
    } catch (_) {}
    try {
      const dir = path.join(ROOT, '.github', 'workflows');
      for (const f of fs.readdirSync(dir))
        for (const m of fs.readFileSync(path.join(dir, f), 'utf8').matchAll(/^s*-s*run:s*(.+)$/gm)) 候補.push(m[1].trim());
    } catch (_) {}
    const 一意 = [...new Set(候補)].slice(0, 12);
    todo.push('guardian.config.json の evidence には【塊の4件】だけが入っています。'
      + '**この現場の検査を足すまで、測れているのは塊だけ**です(合否は通っても、この現場のことは何も言っていない)。'
      + (一意.length ? String.fromCharCode(10) + '     候補(この現場から拾いました。**選ぶのは人**): ' + 一意.join(' / ') : '')
      + String.fromCharCode(10) + '     ★並べ方の軸は【一段下が測れないもの】── 型は記号を測れるが振る舞いは測れない、'
      + '単体は振る舞いを測れるが外との往復は測れない、e2e がそこを埋める。積み上げになるので、どれか1つでは足りない。'
      + String.fromCharCode(10) + '     ★相手を起こす必要があるもの(e2e)は fast:false にして、CI の速い回では外れるようにする');
  }
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
/* ★この現場に Claude Code の仕掛けがあるか(2026-08-28)。
 *   本体は Node だけで動き、Claude Code に依存するのは自動で鳴る部分だけ。
 *   だから他の道具の現場で .claude/ を勝手に作らない。**作らずに、手で回す手順を出す。**
 * ★塊自身を開発する現場(KIT === ".")では、CLAUDE.md は塊の配布物なので判定材料にならない。
 *   そこは「Claude Code で開発している前提」で入れる ── 要らなければ --no-hooks で外せる
 *   (2026-08-29 実地: CLAUDE.md はあるのに .claude が無く、フックが入らなかった)。 */
/* ★【自分が作ったものを、次の回の根拠にしない】(2026-08-30、違和感の掘り出しで見つかった)。
 *
 *   直す前の判定材料は「.claude か CLAUDE.md が在るか」だった。
 *   ところが **CLAUDE.md は、この install が下(手順6)で作る**。
 *   実測: .claude の無い現場で回すと
 *     1回目「この現場に Claude Code の仕掛けが見当たらないので、フックは入れていません」+ CLAUDE.md 作成
 *     2回目(**何も変えずに**)「フックを4本足しました」
 *   ── 冪等が破れ、しかも**他所の道具の現場に勝手にフックが入る**。
 *   この判定のすぐ上に「他の道具の現場で .claude/ を勝手に作らない」と書いてあった。
 *
 * ★だから CLAUDE.md は【人が書いた中身があるときだけ】根拠にする。
 *   マーカー区間(install が書き換える所)と、install が作るときの見出しを外して、
 *   何か残れば人の文書。何も残らなければ install の作りもの ── 根拠にしない。 */
const 始 = '<!-- guardian:begin 修繕の仕組み(この区間は install.mjs が書き換えます。外側は触りません) -->';
const 終 = '<!-- guardian:end -->';
const 既定の見出し = '# CLAUDE.md — 開発規範';
const 人が書いた開発規範 = (() => {
  let t = '';
  try { t = fs.readFileSync(path.join(ROOT, 'CLAUDE.md'), 'utf8'); } catch (_) { return false; }
  const i = t.indexOf(始), j = t.indexOf(終);
  const 外 = (i >= 0 && j > i ? t.slice(0, i) + t.slice(j + 終.length) : t)
    .split(既定の見出し).join('')
    .trim();
  return 外.length > 0;
})();
const CC = process.argv.includes('--hooks') ? true
  : process.argv.includes('--no-hooks') ? false
  : KIT === '.' ? true
  : (fs.existsSync(path.join(ROOT, '.claude')) || 人が書いた開発規範);

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
  /* ★冪等の判定を【1本の綴り】に頼らない(2026-08-30、配布先からの報告②)。
   *
   *   直す前は `${KIT}/check.mjs` という**その1本の文字列**を探していた。
   *   配布先の報告: 8月から在った workflow と**別名で2本目**が置かれ、同じ時刻に同じ検査が2回走った。
   *   ★測ったら、名前ではなく**何を指しているか**が軸だった(5つの現実的な形のうち3つで二重置き):
   *     guardian/check.mjs          … 気づく
   *     tools/guardian/check.mjs    … 気づく(綴りが部分一致するので、たまたま)
   *     tools/codemap/check.mjs     … **二重置き**(9.0 の改名より前)
   *     guardian/verdict.mjs        … **二重置き**(その現場が --fast だけ回すよう手直しした)
   *     npm run guardian:check      … **二重置き**(npm script でくるんだ)
   *   ★報告者の案(古い名前の一覧に nightly-check.yml を足す)は名前の軸なので、
   *     手直しされた版・くるんだ版には届かない。**中身の軸を広げる**ほうが当たる。
   * ★それでも当たらない形(npm script)は残る ── そこは**黙らずに言う**。
   *   置いたうえで「既に N本ある」と名指しし、二重に走っていないか人に確かめてもらう。 */
  const dir = path.join(ROOT, '.github', 'workflows');
  const 塊の道具 = /(check|verdict|selfcheck|neighbors|index)\.mjs/;
  let already = '';
  const ほかの仕掛け = [];
  try {
    for (const f of fs.readdirSync(dir)) {
      const t = fs.readFileSync(path.join(dir, f), 'utf8');
      if (塊の道具.test(t) || t.includes(KIT + '/')) { if (!already) already = f; continue; }
      ほかの仕掛け.push(f);
    }
  } catch (_) { /* .github が無ければ置く */ }
  if (already) skipped.push(`.github/workflows/${already} が既に塊の検査を回しているので触っていません`);
  else if (ほかの仕掛け.length) {
    todo.push('★`.github/workflows/` に既に ' + ほかの仕掛け.length + '本あります('
      + ほかの仕掛け.join(', ') + ')。塊の道具を名指ししていないので**別物と見なして置きました**が、'
      + '**夜間の検査が二重に走らないか確かめてください**(npm script などでくるんでいると、こちらからは見えません)');
  }
  if (!already) write(path.join(dir, 'guardian-nightly.yml'),
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
  todo.push('★**git のフックで代替できます**(3本ぶん)。この1行で有効になります:'
    + String.fromCharCode(10) + '     git config core.hooksPath ' + KIT + '/githooks'
    + String.fromCharCode(10) + '   コミットの手前で合否が回り、**差戻なら止まります**(不明・注意は止めない)。'
    + String.fromCharCode(10) + '   ★代替できないもの: 編集の直前に地図を差し込む / 応答の直前に監査を催促する'
    + String.fromCharCode(10) + '     ── その瞬間が git に無いので、この2つは失われます(承知のうえで使うこと)');
}

/* ---------- 6. AIが最初に読む文書へ追記 ---------- */
/* 貼るのは【読む順の指定】だけ。フック登録のJSONは上で済ませたので載せない
 * ── 済んだ手順が書いてあると、次に読む人が二重にやろうとする。 */
/* 注釈(<!-- … -->)を丸ごと落として、**箇条書きだけ**を貼る。
 * 作業指示や、上で済ませたフック登録のJSONを貼ると、次に読む人が二重にやろうとする。 */
const snippet = fs.readFileSync(path.join(HERE, 'templates', 'CLAUDE-snippet.md'), 'utf8')
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/tools\/guardian/g, KIT).replace(/\n{3,}/g, '\n\n').trim();
/* ★マーカーで囲んだ区間を【置き換える】(2026-08-30、違和感の掘り出しで見つかった)。
 *
 *   直す前は「既に書いてあるか」を `${KIT}/RULES.md` という**導出値**で判定していたが、
 *   貼る本文(templates/CLAUDE-snippet.md)は `guardian/RULES.md` と**べた書き**だった。
 *   つまり KIT が 'guardian' 以外(塊自身の現場では '.'、tools/guardian に置いた現場では
 *   'tools/guardian')のとき、**判定は永久に一致せず、回すたびに同じ節が増える**。
 *   実測: cwd を変えて回すだけで「## 修繕の仕組み」が4個まで増えた。
 *   ★この事故は現物に残っていた ── この塊自身の CLAUDE.md に同じ節が2つ並んでいた。
 *
 * ★もう1つ、直す前は【一度書いたら二度と更新しない】形でもあった。
 *   塊に新しい層を足しても、既存の配布先の CLAUDE.md は永久に古い案内のまま。
 *
 * ★だから、機械が人の文書へ追記する道具が普通にやる形にした ──
 *   マーカーで区間を囲み、**その区間を丸ごと置き換える**。
 *   区間の外(人が書いたもの)には触らない。区間は1つしか無いので二重にならない。 */
/* 始 / 終 は CC の判定でも使うので、上(手順3の手前)で定義してある ── 正本は1つ */
const 中身 = 始 + '\n\n## 修繕の仕組み\n\n' + snippet + '\n' + 終;

const claudePath = path.join(ROOT, 'CLAUDE.md');
let claude = '';
try { claude = fs.readFileSync(claudePath, 'utf8'); } catch (_) {}

const i = claude.indexOf(始), j = claude.indexOf(終);
let body;
if (i >= 0 && j > i) {
  const 前 = claude.slice(0, i), 後 = claude.slice(j + 終.length);
  body = 前 + 中身 + 後;
  if (body === claude) skipped.push('CLAUDE.md は既に最新です');
  else did.push('CLAUDE.md の区間を更新しました(区間の外は触っていません)');
} else if (claude) {
  /* ★古い形(マーカー無しで貼られた節)が在れば、名指しで教える。勝手には消さない。 */
  if (/^##\s*修繕の仕組み/m.test(claude)) {
    todo.push('CLAUDE.md に**マーカーの無い古い「修繕の仕組み」の節**が残っています。'
      + '中身は現場のものなので勝手に消しません ── 読んで、要らなければ手で消してください'
      + '(以後はマーカーの区間だけが更新されます)');
  }
  body = claude.replace(/\s*$/, '') + '\n\n' + 中身 + '\n';
  did.push('CLAUDE.md に読む順の指定を足しました');
} else {
  body = 既定の見出し + '\n\n' + 中身 + '\n';
  did.push('CLAUDE.md を作りました');
}
if (!DRY && body !== claude) fs.writeFileSync(claudePath, body);

/* ★地図が空かどうかを【実際に見て】言う(2026-08-30、配布先からの報告②)。
 *
 *   直す前は条件が1つも無く、無条件で「まだ空です」と出していた。
 *   配布先の報告: **1239行の地図がある現場でも毎回そう言われる**。
 *   ★これは計器が嘘をついている形である。新規の現場では正しい案内だが、
 *     育っている現場では嘘になり、読む人は「この道具は中身を見ていない」と学ぶ。
 *     **一度そう学ばれると、本当に空のときの案内も読み飛ばされる**(7条の別の顔)。
 * ★数え方は【雛形に無い見出し】。行数や総見出し数だと、雛形そのものを「項がある」と数えてしまう。
 * ★在るときは在ると言う ── 無音を「見ていない」と読ませないため(報告者の提案どおり)。 */
{
  const 見出しを取る = (t) => (String(t).match(/^##\s+.*$/gm) || []).map((s) => s.trim());
  const 雛形 = new Set(見出しを取る(fs.readFileSync(path.join(HERE, 'templates', 'CODEMAP.md'), 'utf8')));
  let 地図 = '';
  try { 地図 = fs.readFileSync(mapPath, 'utf8'); } catch (_) {}
  const 項 = 見出しを取る(地図).filter((h) => !雛形.has(h));
  if (!項.length) {
    todo.push('docs/CODEMAP.md がまだ空です(雛形のほかに項がありません)。'
      + '**触った機能から**項を足していってください(全部いっぺんに書かなくてよい)');
  } else {
    skipped.push('docs/CODEMAP.md を見ました: ' + 項.length + '項あるので、「空です」の案内は出しません');
  }
}
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
/* ---------- 塊の中に【正本の現場のもの】が混ざっていないか(2026-08-30) ----------
 *
 * ★`npx degit`(と `git clone`)は Guardian の宣言を一切読まないので、
 *   正本のリポジトリを**丸ごと** guardian/ に落とす ── `.claude` / `CLAUDE.md` / `docs` /
 *   `research` / `talk` / `guardian.config.json` まで付いてくる。
 *   実測(2026-08-30、新規プロジェクトで実走): 6項目が混入した。
 * ★実害は 9.13 の守り(塊のフォルダを根と見なさない)で消えているので、**止めない**。
 *   だが黙っていると「Guardian はこういうものだ」と思われ、次に取り直したとき
 *   `pull` が「配るものとも現場のものとも決まっていません」で止まる形にもなる。
 * ★勝手に消さない ── 中身が現場のものである可能性がゼロではない(この塊の掟)。
 *   **名指しして、消す1行を渡す**までが機械の仕事。
 * ★何が「正本の現場のもの」かは pull.mjs の宣言が持つ(39条・写さない)。 */
{
  const 表を取る = (名) => {
    let src = '';
    try { src = fs.readFileSync(path.join(HERE, 'pull.mjs'), 'utf8'); } catch (_) { return null; }
    const h = src.indexOf(名 + ' = new Set([');
    if (h < 0) return null;
    return [...src.slice(h, src.indexOf(']);', h)).matchAll(/'([^']*)'/g)].map((m) => m[1]);
  };
  const 現場のもの = 表を取る('現場のもの');
  if (!現場のもの) {
    todo.push('塊の中に正本のものが混ざっていないか**見ていません**(' + KIT + '/pull.mjs から宣言が読めません)');
  } else {
    const 混入 = 現場のもの
      .filter((n) => !n.startsWith('.git') && n !== 'node_modules' && n !== '.guardian-pull-tmp')
      .filter((n) => fs.existsSync(path.join(HERE, n)));
    if (混入.length) {
      todo.push('★塊の中に**正本の現場のもの**が混ざっています: ' + 混入.join(', ')
        + ' ── `npx degit` / `git clone` は Guardian の宣言を読まないので丸ごと落ちてきます。'
        + '**動作に実害はありません**が、要らないので消してください:'
        + String.fromCharCode(10) + '     rm -rf ' + 混入.map((n) => KIT + '/' + n).join(' '));
    }
  }
}

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
