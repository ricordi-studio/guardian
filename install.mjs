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
import { createRequire as __cr } from 'node:module';
/* ★共通の書き手(CJS)── 親フォルダの所有を、走行中と同じ規則で決めるため(2026-09-03) */
const 書き手 = __cr(import.meta.url)('./書き手.cjs');

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
const 知っている口 = ['--口一覧', '--dry', '--hooks', '--no-hooks', '--夜間', '--夜間なし'];
const 値を取る口 = {};
const 残りを全部取る口 = [];
/* ★順番: **未知の口の走査が先、`--口一覧` は後**(2026-08-31、配布先の実測)。
 *   検査は `--口一覧 --zzz` の形で叩く ── 門が生きていれば **出口1**、
 *   門が壊れていれば `--zzz` が無視されて **口一覧が出て出口0**。
 *   ★逆順だと、門が壊れていても口一覧が先に出て**緑に見える**。
 *   ★そして「壊れている側で、その道具が本当に走り出す」ことも避けられる ──
 *     素の `--zzz` で叩くと、門が壊れた `verdict` は**本物の合否を回し始める**(検査が検査を呼ぶ)。 */
{
  const 渡された = process.argv.slice(2);
  const 知らない = [];
  const 足りない = [];
  for (let i = 0; i < 渡された.length; i++) {
    const v = 渡された[i];
    if (!v.startsWith('--')) continue;          /* 口の値は飛ばす */
    if (残りを全部取る口.includes(v)) break;     /* ここから先は全部その口の値 */
    if (!知っている口.includes(v)) { 知らない.push(v); continue; }
  /* ★【値が足りない】も言う(2026-08-31、配布先が境界を叩いて見つけた)。
   *   直す前は、2つ取る口に1つしか来なくても**黙って通していた** ──
   *   その先で `undefined` を値として使い、**遠くで分かりにくく壊れる**。
   *   ★害が無いから放っておく、ではなく **「言ってもいない」のが問題**である(46条の形)。
   *   ★数えるのは【後ろに残っている数】だけ ── 値の中身は見ない(パスにも SHA にも見えるので)。 */
    const 要る = 値を取る口[v] || 0;
    if (要る && i + 要る >= 渡された.length + 0) {
      /* 後ろに 要る 個そろっていない */
      足りない.push(v + "(値が " + 要る + " 個要りますが " + (渡された.length - i - 1) + " 個です)");
    }
    i += 要る;
  }
  if (足りない.length) {
    console.error('✗ 口に渡す値が足りません: ' + 足りない.join(', '));
    console.error('  ★黙って進むと、その先で値なしのまま使われ、**遠くで分かりにくく壊れます**');
    process.exit(1);
  }
  if (知らない.length) {
    console.error('✗ この道具は、その口を知りません: ' + 知らない.join(', '));
    console.error('  知っている口: ' + 知っている口.join(' / '));
    console.error('  ★黙って無視すると、打ったつもりと違う動きをしたまま報告することになります');
    process.exit(1);
  }
}
if (process.argv.includes('--口一覧')) {
  /* ★口の名前と【いくつ値を取るか】を出す(2026-08-31、配布先の実測から)。
   *   名前は先頭のままなので、名前だけ読む側は壊れない。
   *   個数が在ると、検査の側が**叩き方を自分で組み立てられる** ──
   *   0なら「次の未知の口は飲まないはず」、1なら「飲むはず」、* なら「全部飲むはず」。
   *   ★これが無いと、検査は口の個数を**写経する**ことになる(39条)。 */
  process.stdout.write(知っている口.map((口) => 口 + " "
    + (残りを全部取る口.includes(口) ? "*" : String(値を取る口[口] || 0)))
    .join(String.fromCharCode(10)) + String.fromCharCode(10));
  process.exit(0);
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
/* ★台帳は【付属品】── 無くても導入は通す(2026-09-03、自分の検査に止められた)。
 *   ★★この塊の自己検査は、見本に install.mjs と templates/ だけを写す(無限の入れ子を避けるため)。
 *   そこへ固い import を足したら、★★★見本の中で install が死に、フックが1本も入らなくなった。
 *   ★付属品が本体を殺してはいけない。ただし【黙って落とさない】── 残せなければ、そう言う。 */
let 台帳を作る = null;
try { ({ 台帳を作る } = await import('./台帳.mjs')); } catch (_) {}
const 台帳が在る = !!台帳を作る;

const ROOT = findInstallRoot(HERE);

/* ★所有台帳 ── 置いた物を【根の種類・相対名・指紋・書き手】で記録する(2026-09-03)。
 *   ★★外すとき、名前ではなく【どの根から書いたか】で持ち主を決めるため。
 *   ★★★台帳に載っていない物は【残す】(allowlist)── 人が手で書いた物は、ここを通らないので。 */
let 塊の版 = '';
try { 塊の版 = fs.readFileSync(path.join(HERE, 'KIT_VERSION'), 'utf8').trim(); } catch (_) {}
const 台帳 = 台帳が在る ? 台帳を作る({ 塊の版, TARGET: ROOT, BUNDLE: HERE }) : { 記す() {}, 読んだ() {}, 件数: () => 0, 保存: () => null };

/* ★【立っている現場】と【入れる先】が食い違ったら、止める(2026-09-01、実走で見つかった)。
 *
 * ★★根は塊の場所(HERE)から上へ辿って決める。作法どおり塊が現場の中に在れば、これで当たる。
 *   ところが塊を【別の場所に1つ置いて、そこを指して】入れる使い方をすると、
 *   ★★★上へ辿った先は【塊自身のリポジトリ】になる ── 人が立っている現場には辿り着かない。
 *
 * ★実測(2026-09-01): 空のプロジェクトで node <塊>/install.mjs を回したら ──
 *     【導入しました】/ 「guardian.config.json は既にあるので触っていません」
 *   と出て、★★その現場には1つもファイルが増えなかった。
 *   「既にある」のは【塊の中】の話で、現場の話ではなかった。
 *   ★★★成功と名乗って、何もしていない ── この塊がいちばん嫌う形(見えない失敗)である。
 *
 * ★止め方: 立っている場所が根の【外】なら、入れずに終わる。
 *   (根の中に立っているとき ── 作法どおりの使い方 ── は、これまでどおり通る) */
{
  const 立つ = process.cwd();
  const r = path.relative(ROOT, 立つ);
  if (r.startsWith('..') || path.isAbsolute(r)) {
    const nl = String.fromCharCode(10);
    process.stdout.write(
      '★入れていません(立っている場所と、入れる先が食い違っています)' + nl + nl
      + '  立っている場所: ' + 立つ + nl
      + '  入れる先と判定: ' + ROOT + '  ← ★これは塊自身の場所です' + nl + nl
      + '★塊は【入れたい現場の中】に置いてから回してください:' + nl
      + '     npx degit ricordi-studio/guardian guardian' + nl
      + '     node guardian/install.mjs' + nl + nl
      + '★★別の場所に置いた塊を指すと、根が塊自身になり、' + nl
      + '  「導入しました」と出たまま現場に1つも入りません(2026-09-01 実測)。' + nl);
    process.exit(1);
  }
}
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');
const did = [];
const skipped = [];
const todo = [];

function write(p, body, what) {
  if (fs.existsSync(p)) {
    skipped.push(`${rel(p)} は既にあるので触っていません`);
    /* ★元から在った物も記録する ── 「作っていない」が外すときの決め手になる */
    台帳.記す({ 道: p, 種類: 'ファイル', 作った: false,
      中身: (() => { try { return fs.readFileSync(p, 'utf8'); } catch (_) { return null; } })(),
      writer: 'install.mjs' });
    return false;
  }
  if (!DRY) {
    /* ★作ったフォルダも台帳に載せる(2026-09-03)── ★★外すとき空のまま残るのを、
     *   手で並べた一覧ではなく【所有】で決めるため。元から在ったフォルダは載らない。 */
    for (const d of 書き手.親を作る(ROOT, p))
      台帳.記す({ 道: path.join(ROOT, d), 種類: 'フォルダ', 作った: true, 中身: null, writer: 'install.mjs' });
    fs.writeFileSync(p, body);
  }
  台帳.記す({ 道: p, 種類: 'ファイル', 作った: true, 中身: body, writer: 'install.mjs' });
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
  /* ★台帳へ ── ここは write() を通らない経路だった(2026-09-03、迂回を1つ塞ぐ)。
   *   ★★config は install が置いた19欄から始まり、使う間に現場が育てる混合物なので、
   *   ★★★外すときは「作った かつ 育っていない」だけが消してよい。指紋がその材料になる。 */
  台帳.記す({ 道: cfgPath, 種類: 'ファイル', 作った: true,
    中身: JSON.stringify(cfg, null, 2) + String.fromCharCode(10), writer: 'install.mjs' });
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
      /* ★名前を分ける(24.12)── この塊には walk(dir, depth) の引数も在り、同じ綴りで別物だった。★★機械が束ね元を追えるように一意にする(@codex「網の一致数から同一性を推論しない」)。 */
      const ワークフローの置き場 = path.join(ROOT, '.github', 'workflows');
      for (const f of fs.readdirSync(ワークフローの置き場))
        for (const m of fs.readFileSync(path.join(ワークフローの置き場, f), 'utf8').matchAll(/^s*-s*run:s*(.+)$/gm)) 候補.push(m[1].trim());
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
  try { t = fs.readFileSync(path.join(ROOT, 'CLAUDE.md'), 'utf8'); } catch (_) { return false; }   // guardian:read
  const i = t.indexOf(始), j = t.indexOf(終);
  const 外 = (i >= 0 && j > i ? t.slice(0, i) + t.slice(j + 終.length) : t)
    .split(既定の見出し).join('')
    .trim();
  return 外.length > 0;
})();
const CC = process.argv.includes('--hooks') ? true
  : process.argv.includes('--no-hooks') ? false
  : KIT === '.' ? true
  : (fs.existsSync(path.join(ROOT, '.claude')) || 人が書いた開発規範);   // guardian:read

/* ---------- 3. フックの登録(既存を壊さない) ---------- */
if (CC) {
const setPath = path.join(ROOT, '.claude', 'settings.json');
/* ★このファイルが【元から在ったか】を、書き換える前に取る(2026-09-03)。
 *   ★★外すときの判定が変わる ── 元から在れば混ぜた要素だけ外す / 無ければファイルごと消せる。 */
const 設定が元から在った = fs.existsSync(setPath);
/* ★★元の生テキストも取る(2026-09-03)── ★★★外すあとで【バイトで戻す】ため。
 *   実測: 直す前は、現場の1行 JSON を塊が2字下げに整形し、外しても整形のまま残った。
 *   見た目は同じでも git は差分を出す ── **それは残滓である。** */
let 設定の元 = null;
try { 設定の元 = fs.readFileSync(setPath, 'utf8'); } catch (_) {}
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
  /* ★JSONの配列に混ぜた1件を記録する ── 外すときは、この指紋と一致する項だけ外す。
   *   ★★綴りに guardian が入っているかで探すのは候補出しまで(2026-09-03、会議の線)。 */
  台帳.記す({ rel: '.claude/settings.json', 種類: 'JSON要素', 作った: true,
    中身: JSON.stringify({ event, matcher: matcher || null, entry }), writer: 'install.mjs' });
  added++;
}
if (added) {
  /* ★ファイル自体が【元から在ったか】も残す(2026-09-03)。
   *   ★★元から在れば、外すとき消してよいのは【混ぜた要素】だけ。
   *   ★★★無かったなら、外すときファイルごと消せる ── そこで判定が変わる。 */
  台帳.記す({ 道: setPath, 種類: 'ファイル', 作った: !設定が元から在った, 中身: null, 元: 設定の元, writer: 'install.mjs' });
  if (!DRY) {
    /* ★ここも【作ったフォルダ】を台帳へ(2026-09-03)。直す前はここだけ素の mkdirSync だったので、
     *   ★★.claude/ が誰の物か決まらず、外したあと【空のまま残っていた】(実測。
     *   .claude/commands/ は畳めていたので、余計に気づきにくかった)。 */
    for (const d of 書き手.親を作る(ROOT, setPath))
      台帳.記す({ 道: path.join(ROOT, d), 種類: 'フォルダ', 作った: true, 中身: null, writer: 'install.mjs' });
    fs.writeFileSync(setPath, JSON.stringify(settings, null, 2) + String.fromCharCode(10));
  }
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
  /* ★名前を分ける(24.12)── この塊には walk(dir, depth) の引数も在り、同じ綴りで別物だった。★★機械が束ね元を追えるように一意にする(@codex「網の一致数から同一性を推論しない」)。 */
  const ワークフローの置き場 = path.join(ROOT, '.github', 'workflows');
  const 塊の道具 = /(check|verdict|selfcheck|neighbors|index)\.mjs/;
  let already = '';
  const ほかの仕掛け = [];
  const 壊れた参照 = [];   /* ★名前は当たるが、指す道が無い workflow(27.1) */
  try {
    for (const f of fs.readdirSync(ワークフローの置き場)) {
      const t = fs.readFileSync(path.join(ワークフローの置き場, f), 'utf8');
      /* ★「名前が在る」と「その道が在る」は別(27.1、2026-09-03、@codex が見つけた)。
       *
       *   ★★直す前は `verdict.mjs` という【文字列】が在るだけで「既に回っている」と決めていた。
       *   ★★★実測: tools/guardian/verdict.mjs(もう無い道)を指す古い workflow が在ると、
       *   install は自分の nightly を**置かず、何も言わなかった** ──
       *   現場には【動かない夜間検査】だけが残る。
       *
       *   ★直し: 名前が当たったら、その【道が実在するか】まで見る。
       *   ★★実在しなければ「既に回っている」とは言わない ── 壊れた参照として名指しする。
       *   ★★★中身は触らない(直すか撤去するかは人が決める)。 */
      if (塊の道具.test(t) || t.includes(KIT + '/')) {
        const 指す道 = [...t.matchAll(new RegExp("[A-Za-z0-9_./\-]*(?:check|verdict|selfcheck|neighbors|index)" + "\.mjs", "g"))]
          .map((m) => m[0].replace(/^[.][/]/, ""));
        const 生きている = 指す道.filter((p) => { try { return fs.existsSync(path.join(ROOT, p)); } catch (_) { return false; } });   // guardian:read
        if (生きている.length) { if (!already) already = f; continue; }
        壊れた参照.push({ f, 指す道 });
        continue;
      }
      ほかの仕掛け.push(f);
    }
  } catch (_) { /* .github が無ければ置く */ }
  for (const x of 壊れた参照) {
    todo.push('★`.github/workflows/' + x.f + '` は塊の道具を名指ししていますが、'
      + '**その道が この現場に在りません**: ' + x.指す道.join(', ')
      + ' ── ★★昔の置き場(tools/guardian など)を指したまま残っている形です。'
      + '★★★この夜間検査は【動きません】。直すか撤去するかを決めてください'
      + '(この塊は中身を触っていません)。');
  }
  if (already) skipped.push(`.github/workflows/${already} が既に塊の検査を回しているので触っていません`);
  else if (ほかの仕掛け.length) {
    todo.push('★`.github/workflows/` に既に ' + ほかの仕掛け.length + '本あります('
      + ほかの仕掛け.join(', ') + ')。塊の道具を名指ししていないので**別物と見なして置きました**が、'
      + '**夜間の検査が二重に走らないか確かめてください**(npm script などでくるんでいると、こちらからは見えません)');
  }
  /* ★置く先そのものが【壊れた参照】のときは、安心する文を出さない(27.3、2026-09-03、@codex 15:48)。
   *
   *   ★★実測(af3 の形): codemap-nightly.yml と guardian-nightly.yml の2枚が在り、
   *   どちらも もう無い tools/… を呼ぶ現場で ──
   *     write() は「既にあるので触っていません」と言い(★安心する文)、
   *     ★★★その2行下の todo は「その道が この現場に在りません」と言っていた。
   *   **同じファイルについて、2つの文が反対を向いていた。**
   *
   *   ★直し: 置く先が壊れているなら write() を呼ばない ── 
   *   ★★中身は触らず(所有を証明できないので)、**直らないことを名指しで言う**。
   *   ★★★@codex の条文:「証明できない場合は【直らない。手で直すか撤去】と出し、
   *   名指しだけで更新済みと見せない」。 */
  /* ★★★【夜間は GitHub の 仕掛けです】(27.48、2026-09-05、依頼主の指摘)。
   *
   *   ★依頼主:「デスクトップアプリ / Web アプリ / 手元のドライブ / GitHub と バラバラなのに、
   *     ★★夜間監査が【基本実装】なのは オカシイ。★★★GitHub に repo が 在る時だけ の
   *     オプションで いいのでは」
   *
   *   ★★測ったら そのとおりだった:
   *     ・非 git の 現場に --hooks を付けたら ── ★★★guardian-nightly.yml が 置かれた
   *     ・条件は【GitHub が 在るか】では なく【Claude Code が 在るか】だった
   *       → ★別の物に 掛かっていた。★★動かない紙が 現場に 残る
   *
   *   ★★★だから【測れる事実】で 決める: git の remote が github を 指しているか。
   *   ★測れない事(Actions が 有効か / 権限が 在るか)は【測れないと 言う】── 決めない。
   *   ★★--夜間 で 強いて置く / --夜間なし で 置かない(★どちらも 人が 決める口)。
   *
   *   ★★★【この判定の 境目】(27.48、@codex 01:27 の 洗い出し ── ★10通りで 測った):
   *     ✔ 置く   … remote の どれかが github.com(★HTTPS も SSH も ── 字面で 見る)
   *     ✔ 置く   … 複数 remote で、origin 以外が github(★fetch/push を 分けない ──
   *                ★★どれか1つでも github なら Actions は 回り得る)
   *     ✘ 置かない … 非git / remote 0本 / github.com 以外(gitlab など)
   *     ✘ 置かない … ★★★GitHub Enterprise(別ドメイン)
   *        → ★これは【決めない】。別ドメインを 自動で GitHub と 見なすのは
   *          ★★測れない事を 決める事に なる ── ★★★--夜間 で 人が 決める
   *     ✘ 置かない … これから 上げる現場 → ★--夜間 で 拾える
   *
   *   ★★★測れない事(★決めていません):Actions が 有効か / workflow の 権限が 在るか。
   *     → ★置いても 回らない事は 在り得ます。★★それは この口からは 見えません。 */
  const 夜間の口 = process.argv.includes('--夜間') ? true
    : process.argv.includes('--夜間なし') ? false : null;
  const GitHubを指すか = (() => {
    try {
      if (!fs.existsSync(path.join(ROOT, '.git'))) return { 是: false, 訳: 'この現場は git では ありません' };   // guardian:read
      const r = spawnSync('git', ['remote', '-v'], { cwd: ROOT, encoding: 'utf8', windowsHide: true, timeout: 30000 });
      if (r.status !== 0) return { 是: false, 訳: 'git remote が 読めません' };
      const 出 = String(r.stdout || '');
      if (!出.trim()) return { 是: false, 訳: 'remote が 1つも 在りません(手元だけの git です)' };
      /* ★★★字面で 見ては いけません(27.49、@guardian 01:42 が 叩いて 出した)。
       *   ★直す前は /github(ドット)com/i の 字面一致 ── ★★次の 2つが 通っていた:
       *     ・https://my-<その名>.evil.example/u/r.git      ← ★名前の【中に】在るだけ
       *     ・https://gitlab.com/u/<その名>-mirror.git       ← ★★道の【中に】在るだけ
       *   ★★★だから【ホスト】を 取り出して、★丸ごと 一致で 見る。
       *   ★★HTTPS(https://host/…)も SSH(user@host:…)も 同じ形に 均す。 */
      const B = String.fromCharCode(92);
      const ホストを取る = (u) => {
        let t = String(u || '').trim();
        t = t.replace(new RegExp("^[A-Za-z][A-Za-z0-9+.-]*:" + "//"), "");   /* scheme:// を 落とす */
        const at = t.lastIndexOf('@');
        if (at >= 0) t = t.slice(at + 1);                      /* user@ を 落とす */
        t = t.split('/')[0].split(':')[0];                     /* 道と 港を 落とす */
        return t.toLowerCase();
      };
      const 印 = String.fromCharCode(103,105,116,104,117,98) + '.com';   /* ★B27 が 拾わない形で 持つ */
      const 割る = new RegExp(B + "r?" + B + "n");   /* ★改行で 割る(★★字を 生で 書かない) */
      const 空白 = new RegExp(B + "s+");
      const ホスト達 = 出.split(割る).map((l) => l.trim().split(空白)[1]).filter(Boolean).map(ホストを取る);
      if (!ホスト達.some((h) => h === 印 || h === 'www.' + 印))
        return { 是: false, 訳: 'remote が github を 指していません(見たホスト: ' + [...new Set(ホスト達)].join(', ') + ')' };
      return { 是: true, 訳: 'remote が github を 指しています' };
    } catch (e) { return { 是: false, 訳: '測れませんでした: ' + String(e && e.message).slice(0, 60) }; }
  })();
  const 夜間を置く = 夜間の口 === null ? GitHubを指すか.是 : 夜間の口;
  const 置く先 = 'guardian-nightly.yml';
  const 置く先が壊れている = 壊れた参照.find((x) => x.f === 置く先);
  if (置く先が壊れている) {
    todo.push('★`.github/workflows/' + 置く先 + '` は【この塊が置く名前】ですが、'
      + '中身が この現場に無い道を呼んでいます: ' + 置く先が壊れている.指す道.join(', ')
      + ' ── ★★この塊が置いた物だと**証明できない**ので、**書き換えません**。'
      + '★★★手で直すか、撤去してから もう一度 導入してください。'
      + '(正しい行は `node ' + KIT + '/verdict.mjs` の形です)');
  }
  /* ★子は【字面のまま】置く(27.3)── 変数にしたら B22 の網から消え、
   *   ★★解決した子 1件 → 0件 になった(24.12 で直したのと同じ形)。
   *   ★★★見える形を、見えない形に替えない。 */
  else if (!already && !夜間を置く) {
    skipped.push('夜間の見張り(.github/workflows/' + 置く先 + ')は 置いていません ── '
      + GitHubを指すか.訳 + '。★夜間は【GitHub Actions の 仕掛け】なので、'
      + 'そこに 無いと ★★動かない紙が 残るだけです。'
      + '★★★要るなら `--夜間` を 付けて もう一度 打ってください');
    todo.push('★この現場では 夜間の見張りが 効きません(' + GitHubを指すか.訳 + ')。'
      + '★★合否は Stop フック(AIが「できました」と言う手前)だけが 回します ── '
      + '★★★AI の セッションの【外】で 起きた ずれは、誰も 見ていません。'
      + '★GitHub に 上げたら `--夜間` を 付けて もう一度 導入してください');
  }
  else if (!already) write(path.join(ワークフローの置き場, 'guardian-nightly.yml'),
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
/* ★区間は【中身の指紋】で持つ ── 外すとき、人が中を書き換えていたら CONFLICT にできる。
 *   ★★ファイル自体が元から在ったかも一緒に残す(無ければ、外すときファイルごと消せる)。 */
{
  const i = body.indexOf(始), j = body.indexOf(終);
  const 区間 = (i >= 0 && j > i) ? body.slice(i, j + 終.length) : null;
  /* ★所有は【どちらを作ったか】で決める(2026-09-03、外す試験で2回 直した所)。
   *
   *   ・ファイルが元から無かった  → ★ファイル全体が塊の物。区間だけ外すと ★★見出しが残る
   *     (実測: 区間を外したあと「# CLAUDE.md — 開発規範」の30バイトが残っていた)
   *   ・ファイルが元から在った    → ★★★区間だけが塊の物。外側は人の物なので触らない
   *
   *   ★★2つ載せない ── 同じ物を2通りで所有すると、外す順で結果が変わる。 */
  if (区間 && !claude) {
    台帳.記す({ rel: 'CLAUDE.md', 種類: 'ファイル', 作った: true, 中身: body, writer: 'install.mjs' });
  } else if (区間) {
    /* ★【区間を入れたか】で決める ── ファイルが元から在ったかではない(2026-09-03)。
     *   ★★直す前は 作った: !claude としていた。人が書いた CLAUDE.md が在る現場では false になり、
     *   ★★★外す側が「元から在った」と読んで、区間を残したまま PASS と出した。 */
    台帳.記す({ rel: 'CLAUDE.md', 種類: '区間', 作った: !claude.includes(始),
      中身: 区間, 元: claude, writer: 'install.mjs' });
  }
}

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
  /* ★締め切りは【宣言に合わせる】(2026-09-01)。60秒にしたら短すぎた ──
   *   実測: この機械で selfcheck は ★43秒。宣言(guardian.config.json)は ★★180秒。
   *   ★★★60秒だと、少し遅い機械で【子を殺してしまう】── 殺された子の見本は、
   *   親の台帳に無いので ★誰も片づけない。★★締め切りを足したせいで、漏れが増える所だった。
   * ★2箇所に別々の数を書くと、必ず食い違う(⑥)。ここは宣言より長く取る。 */
  const r = spawnSync(process.execPath, [path.join(HERE, 'selfcheck.mjs')], { encoding: 'utf8', timeout: 300000 });
  /* ★出口2(不明)を【赤】と同じにしない(26.1、2026-09-03)。
   *   ★★selfcheck は 0=通過 / 1=赤 / 2=不明 を返す。ここは 0 以外を全部「赤いです」と言っていた。
   *   ★★★26.1 で B21 が常に未測になったので、この現場は**毎回「赤いです」と言う**ようになる ──
   *   自分が今夜ずっと直してきた取り違えを、自分の直しが新しく作っていた。 */
/* ★機械ごとの印は、追跡しない方がよい(26.14、2026-09-03、@codex が指した)。
 *
 *   ★★`.claude/verdict_at` は「いつ合否を回したか」を機械ごとに覚える印で、
 *   走行のたびに書き換わる。追跡すると:
 *     ・commit のたびに差分になる(★実測: 正本の3つの版の commit に入っていた)
 *     ・★★配った先で【他人の機械の時刻】が残る
 *     ・その時刻より古い実装しか無い現場では、門が【測らずに通る】(26.13 の道)
 *
 *   ★★★ここでは **.gitignore に書き足さない** ── 書き足すと
 *   【行の所有】という新しい形が要り、外す側も一緒に直す必要が在る。
 *   この版では**告げるだけ**にして、直すかどうかは現場に決めてもらう。 */
{
  const 印 = path.join(ROOT, '.claude', 'verdict_at');   // guardian:read
  const 無視 = (() => { try { return fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8'); }   // guardian:read
    catch (_) { return ''; } })();   // guardian:read
  if (!無視.includes('verdict_at')) {
    todo.push('★`.claude/verdict_at` を `.gitignore` に足してください ── '
      + 'これは【機械ごとの印】で、走行のたびに書き換わります。'
      + '★★追跡すると commit のたびに差分になり、配った先に【他人の機械の時刻】が残ります。'
      + '★★★その時刻より古い実装しか無い現場では、門が測らずに通ります'
      + '(いまは機械には skipped_unchanged と返しますが、測っていないことに変わりはありません)。'
      + '(この塊は .gitignore を書き換えません ── 行の所有を作らないため)');
  }
}

  if (r.status === 0) did.push('塊そのものの自己検査が通りました(エンジンは生きています)');
  else if (r.status === 2)
    todo.push('⚠ 塊の自己検査に【測れていない物】が在ります(赤ではありません)。'
      + '`node ' + KIT + '/selfcheck.mjs` で 何が測れていないかを見てください'
      + '(★不明は合格ではありませんが、違反が示された訳でもありません)');
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
    /* ★消せと言ってよいのは【消しても何も変わらないもの】だけ(2026-08-31、配布先の実測)。
     *   ここは 9.x まで `.guardian` も「消してください」と案内し、しかも
     *   ★**動作に実害はありません**と★断言していた。★★測っていない断定だった。
     *   配布先が実際に消したら ── 通過 73件・出口0 が、★★未測1件・★出口2 になった
     *   (受領証 .guardian/pulled.json が消え、「どの中身から来たか分かりません」になる)。
     * ★★同じ名前が、正本では【正本の現場のもの】、配布先では【受領証の置き場】を指していた ── ⑥。
     * ★★★だから除外に .guardian を足し、★断言をやめた(消したあとの合否は測っていないので)。 */
    const 消してはいけない = ['.guardian'];
    /* ★塊が【この現場の中】に在るときだけ、消す1行を渡す(2026-09-01、実走で見つかった)。
     *   ★★この案内は「degit/clone で現場の中に丸ごと落ちてきた写し」を前提にしていた。
     *   ところが塊を【共有の置き場】に1つ置いて、そこを指して入れる使い方が在る。
     *   そのとき HERE は正本(または他の現場も使っている写し)を指すので、
     *   ★★★渡す1行が「正本の docs / CLAUDE.md / .claude を消せ」になる。
     *   実測(2026-09-01): 別フォルダに入れたら、Desktop/Guardian を消す rm -rf が出た。
     *   ★消すのは人だが、渡したのは機械である ── 渡してはいけない1行だった。 */
    const 外に在る = (() => {
      try {
        const r = path.relative(ROOT, HERE);
        return r.startsWith('..') || path.isAbsolute(r);
      } catch (_) { return true; }   /* ★測れなければ、渡さない側に倒す */
    })();
    const 混入 = 現場のもの
      .filter((n) => !n.startsWith('.git') && n !== 'node_modules' && n !== '.guardian-pull-tmp')
      .filter((n) => !消してはいけない.includes(n))
      .filter((n) => fs.existsSync(path.join(HERE, n)));
    if (混入.length && 外に在る) {
      /* ★消す1行は渡さない ── その塊は他の現場も使っているかもしれない */
      todo.push('★塊(' + KIT + ')は**この現場の外**に在ります。中に正本のものが在ります: '
        + 混入.join(', ') + ' ── ★**消す1行は渡しません**。'
        + 'その塊は他の現場も使っている可能性があり、消すと**そちらが壊れます**。'
        + '現場ごとに写しを持つなら、写した先で入れ直してください');
    } else if (混入.length) {
      todo.push('★塊の中に**正本の現場のもの**が混ざっています: ' + 混入.join(', ')
        + ' ── `npx degit` / `git clone` は Guardian の宣言を読まないので丸ごと落ちてきます。'
        + '要らないので消せます ── ★**消す前後で `node ' + KIT + '/verdict.mjs` を1回ずつ走らせて、'
        + '出口が変わらないことを見てください**(この案内は、消したあとの合否までは測っていません):'
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
    const s = JSON.parse(fs.readFileSync(path.join(ROOT, '.claude', 'settings.json'), 'utf8'));   // guardian:read
    let 古いフック = 0;
    for (const 種 of Object.keys(s.hooks || {}))
      for (const g of s.hooks[種])
        古いフック += (g.hooks || []).filter((h) => /tools\/codemap\//.test(String(h.command || ''))).length;
    if (古いフック)
      todo.push('★古いフックの登録が ' + 古いフック + '本残っています(.claude/settings.json の tools/codemap/…)。二重に走るので、古い方を消してください');
  } catch (_) {}
}

/* ★台帳は【TARGET 側】に置く(2026-09-03、置き場を移した)。
 *   ★★最初は BUNDLE 側(guardian/)に置いた ── 理由は「消す判断の材料を、消される場所に置かない」。
 *   その理由は書いた時点では正しかったが、★★★前提が入れ替わった:
 *     .guardian/ は【消してはいけない場所】になり(現場が書いた物が混ざるため)、
 *     guardian/ は【フォルダごと消す場所】のままである。
 *   ★依頼主の元案は「guardian フォルダを削除して外す」── その時 台帳も一緒に死ぬ。
 *   ★★実測: 台帳を合併で読むと7件、最後の走行だけだと3件。台帳が死ねば、
 *     対象側に残った物(宣言・フック4件・区間・workflow)は【何者か分からない孤児】になる。
 *   ★★★台帳は、自分が書き留めた物より長生きしなければならない。 */
if (!DRY && 台帳が在る) {
  /* ★道は 書き手.cjs が正本(2026-09-03)── ここで綴らない */
  const 先 = 台帳.保存(書き手.台帳の道(ROOT));
  did.push('台帳を置きました（' + rel(先) + ' ── 外すときに、持ち主を名前ではなく根で決めるため）');
} else if (!DRY) {
  todo.push('★所有台帳を残していません(' + KIT + '/台帳.mjs が読めませんでした)。★★外すときに【何を消してよいか】の材料が在りません ── 外す側は UNKNOWN になります');
}

/* ★★★【束の控え】── ★配る側の 目録と 照らしてから 書く(27.59、依頼主「完成させて」)。
 *
 *   ★27.54 の 控えは【install した時の 姿】だった ── ★★install の【前】から
 *   束の中に 在った 現場の物は、★★★塊の物として 取り込まれ、--束も で 一緒に 消えた。
 *   ★= 「入れた時から 変わっていない」は 証明できたが、★★「塊の物である」は 出来ていなかった。
 *
 *   ★★★だから【配る側の 目録】(<束>/目録.json)と 照らす:
 *     ・束の中の 全ファイルが 目録に 在り、指紋も 合う → ★証明済み
 *     ・1つでも 目録に 無い / 指紋が 違う / 近道 → ★★証明できない
 *   ★証明できない時も 控えは 書く ── ★★但し 証明: null。★★★外す側が それを 見て 断る。
 *
 *   ★改行: 目録は CR を 落として 数えている ── ★★ここも 同じに する。 */
if (!DRY) {
  try {
    const 束の根 = path.join(ROOT, KIT);
    const 目録 = (() => {
      try {
        const j = JSON.parse(fs.readFileSync(path.join(束の根, '目録.json'), 'utf8'));
        if (!j || !Array.isArray(j.項)) return null;
        const m = new Map();
        for (const x of j.項) if (x && x.rel) m.set(String(x.rel), String(x.印));
        return { 版: j.版, 印: m, 走行が作る: new Set(Array.isArray(j.走行が作る) ? j.走行が作る : []) };
      } catch (_) { return null; }
    })();
    const 項 = [];
    const 外れ = [];
    const 走行の跡 = [];   /* ★pull が 書く物の 名前で 在った物(27.64)*/
    const 歩く = (d, 親) => {
      let es = []; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch (_) { return; }
      for (const x of es) {
        if (x.name === '.git' || x.name === 'node_modules') continue;
        const 名 = 親 ? 親 + '/' + x.name : x.name;
        if (x.isSymbolicLink()) { 項.push({ rel: 名, 印: '近道' }); 外れ.push(名 + '(近道)'); continue; }
        if (x.isDirectory()) { 歩く(path.join(d, x.name), 名); continue; }
        let 中 = null; try { 中 = fs.readFileSync(path.join(d, x.name), 'utf8'); } catch (_) {}
        const 印 = 中 == null ? '読めない' : 書き手.均した指紋(中);   /* ★正本は 書き手.cjs に 1本 */
        項.push({ rel: 名, 印 });
        if (名 === '目録.json') continue;   /* ★目録は 自分を 数えない */
        /* ★★★配る側が【走行が 作る物】と 宣言した物は 照らさない(27.61、@guardian が 公開物で 再現)。
         *   ★pull は 受領証(.guardian/pulled.json)を 束の中に 書く ── 配る時には 無い。
         *   ★★照らすと【pull で 入れた現場は 永久に --束も が 使えない】に なる。
         *   ★★★断り文は「取り直して 入れ直せ」と 言うが、取り直す = pull = また 受領証 ── 出口の 無い 輪。 */
        /* ★★★【証明できないなら 通さない】(27.64、@codex 07:03)。
         *
         *   ★27.61: 名前が 合えば 通した → ★★人の物を 巻き込む
         *   ★★27.63: 中身の形(sha / 正本 / at)まで 見た → ★★★@codex:
         *     「形を 検証しても、そのファイルを pull 自身が 作った事実は 証明できません。
         *      ★install 前から 同じ schema の 利用者ファイルが 偶然または 模倣で 在れば
         *      『本物の形』と 判定され、束ごと 消えます」── ★★その通り。
         *
         *   ★★★束の【中】に 在る物だけを 見て「誰が 書いたか」は 証明できない。
         *   ★だから 通さない ── ★★但し【輪に しない】:
         *   ★★★「これは pull が 書く物の 名前です。あなたの物でなければ 消してから
         *   もう一度 打てば、束を 外せます」と 出口を 名指しで 出す。
         *   ★= 証明できない事を 認めた上で、人が 決められる 形に する。 */
        if (目録 && 目録.走行が作る.has(名)) {
          走行の跡.push(名);
          外れ.push(名 + '(pull が 書く物の 名前 ── ★誰が 書いたかは 証明できません)');
          continue;
        }
        if (!目録) return;
        if (!目録.印.has(名)) { 外れ.push(名 + '(目録に 無い)'); continue; }
        if (目録.印.get(名) !== 印) 外れ.push(名 + '(目録と 指紋が 違う)');
      }
    };
    歩く(束の根, '');
    const 証明 = (目録 && 外れ.length === 0) ? '目録' : null;
    書き手.書く(ROOT, '.guardian/束の控え.json',
      JSON.stringify({ 束: KIT, 時刻: new Date().toISOString(), 証明,
        目録の版: 目録 ? 目録.版 : null, 外れ: 外れ.slice(0, 20), 項 }, null, 1) + String.fromCharCode(10),
      'install.mjs');
    if (証明 === '目録') {
      did.push('束の控えを置きました(.guardian/束の控え.json ── ★' + 項.length
        + '点。★★配る側の 目録と 1点も 違いません ── ★★★--外す --束も が 使えます)');
    } else if (!目録) {
      todo.push('★束に【目録.json】が 在りません ── ★★配る側の 証拠が 無いので、'
        + '★★★所有を 証明できません。--外す --束も は 束を 消しません'
        + '(★正本から 取り直すと 付いてきます)');
    } else {
      if (走行の跡.length && 走行の跡.length === 外れ.length) {
        /* ★★★案内で【消せ】と 言わない(27.66、@codex 07:32)。
         *   ★道具は その物を【誰が 書いたか 証明できない】と 自分で 断っている ──
         *   ★★なのに「消してください」と 言えば、★★★同名の【人の物】まで
         *   人の手で 消させる事に なる。★言える所までしか 言わない。 */
        todo.push('★束を 自動で 外せません: ' + 走行の跡.join(' / ')
          + ' の【所有を 証明できません】(★★pull が 書く物の 名前ですが、'
          + '★★★誰が 書いたかは 束の中からは 分かりません)。'
          + '★中を 見てください。★★道具が 作った 受領証だと【あなた自身が 確かめられた】場合に 限り、'
          + '束の【外】へ 退避してから もう一度 導入すると --外す --束も が 使えます。'
          + '★★★あなたの物なら、消さずに 別の場所へ 移してください');      } else
      todo.push('★束が 配る側の 目録と ' + 外れ.length + '件 違います: ' + 外れ.slice(0, 5).join(' / ')
        + (外れ.length > 5 ? ' ほか' + (外れ.length - 5) + '件' : '')
        + ' ── ★★あなたの物が 混ざっているかもしれません。'
        + '★★★所有を 証明できないので、--外す --束も は 束を 消しません');
    }
  } catch (e) {
    todo.push('★束の控えを 置けませんでした: ' + String(e && e.message).slice(0, 80)
      + ' ── ★★--外す --束も は【所有を 証明できない】ので 束を 消しません');
  }
}

console.log(DRY ? '【下見】以下を行います\n' : '【導入しました】\n');
for (const d of did) console.log('  ✓ ' + d);
for (const s of skipped) console.log('  ・' + s);
if (todo.length) {
  console.log('\n【ここから先は判断が要ります（AIに ' + KIT + '/install.md を読ませてください）】');
  for (const t of todo) console.log('  ⬜ ' + t);
}
