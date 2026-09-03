/* ★このフックが【黙って通る / 言って通る】道の宣言(24.7、2026-09-03、会議で @kozo が求めた)。
 *
 *   ★★検査(B18)は hooks/ を全部 叩き、**黙って通ったマス**を見つける。
 *   ★★★黙ってよい理由は【このファイル】に書く ── 離れた表に書くと、
 *   道を足した人と表を直す人が別の場所に居ることになり、黙って漏れる。
 *   (23.x で 外す.mjs の「手で並べた一覧」を消したのと同じ理由) */
/* @通す道: 設定が壊れている ── 既定値に落ちた事を stderr で言って続ける(合図なので止めない) */
/* PreToolUse フック: site/ worker/ gas/ 等を編集する【直前】に、
 * CODEMAP(機能→全接点の地図)の【該当項そのもの】を機械的に文脈へ差し込む。
 * 「最小読み込みで改修して別の層を見逃す」対策(依頼主提案 2026-08-08)。
 * 私(Claude)の注意力に依存させないための仕組みなので、外さないこと。
 *
 * 2026-08-10 全面書き換え。旧版は「CODEMAP.mdの該当項を開いて照合せよ」という【依頼文】を
 * 全編集に同じ文言で出していた。これには2つの欠陥があった:
 *   (1) 地図を一度も読んでいない。該当項を探す作業がモデルの注意力に残っていた
 *       ── 依存を外したつもりが、依存が一段外に出ただけだった。
 *   (2) 接点1箇所の些細な編集にも、接点6箇所の構造的な編集にも同じ文が出る。
 *       clock.js が正しく警告している「意味の無い通知に慣れて読み飛ばすようになる」を、
 *       このフック自身が起こしていた。
 * よって本版は:
 *   ・地図を実際に引き、該当項の【本文】を渡す(探させない)
 *   ・編集内容に出てくる実名(関数・定数・ルート)で該当項を絞る(場所ではなく触った番地で引く)
 *   ・該当が弱ければ項目名だけ、無ければ「地図の外」と一言。強いときだけ本文を出す
 * 判断は一切していない ── 地図を引いて数えるだけ。LLMを呼ばないので常に安い。
 *
 * 2026-08-10 PostToolUse から PreToolUse へ移設。旧版は書き込みが【終わった後】に催促していたが、
 * それでは特別が1個できた後の確認にしかならない。地図は読むための圧縮ではなく、
 * 触る前に引くための索引(ページテーブル)なので、引くのは書き込みの前でなければ意味がない。
 * 併せて「罠の実績」のある項に触れたときは依頼主の判断へ上げる(下の emit を参照)。 */
const fs = require('fs');
const path = require('path');

const { findRoot, loadConfig, 設定が壊れていたら言う } = require('./lib-root');

const ROOT = findRoot(__dirname);
const CFG = loadConfig(ROOT);
/* ★続けるなら【続けたと言う】(24.4)── 壊れた設定で既定値に落ちた事を、踏んだ人に見せる */
設定が壊れていたら言う(CFG, path.basename(__filename));  /* ★名は自分に答えさせる(写経しない) */
/* ★出力は【実際に読んだ道】の名で言う(24.6、2026-09-03、会議で @kozo が見つけた)。
 *
 *   ★★直す前、道具は CFG.map を読みながら、文には CODEMAP.md をべた書きしていた。
 *   ★★★実測(map: "docs/私の地図.md" の現場): 「… 項は CODEMAP.md に無い」と出た ──
 *   **この現場に存在しない道**を、人に見に行かせる形だった。
 *
 *   ★書き手は分かっていた ── 読めない時の文は MAP_PATH を出している。
 *   ★★他の4行に届いていなかっただけ。★★★「綴りで所有を決めない」の、出力の側である。 */
const 地図の名 = CFG.map || 'docs/CODEMAP.md';
const MAP_PATH = path.join(ROOT, 地図の名);

/* 地図が指している実装(手足)。ここ以外の編集では黙る(docs/ の更新等で鳴らさない) */
/* 見張る場所はプロジェクトごとに違うので宣言(guardian.config.json の watch)から読む。
 * ここを決め打ちにすると、コピー先で「何も鳴らないフック」になって誰も気づかない。 */
/* ★見張る場所。**先頭が / でなくても当たる**ようにする(2026-08-31、不変条件6を入れて出た)。
 *   直す前は /(src)/ で、区切りが【前にも】要った ── つまり `src/index.js` のような
 *   相対の書き方だと **地図の対象外として黙る**。同じファイルを絶対パスで渡せば当たるので、
 *   ★**渡し方だけで結果が変わっていた**。しかも壊れ方は黙る方に出る(いちばん質が悪い形)。
 *   実際に Claude Code が渡すのは絶対パスなので日常では出ないが、
 *   **出ない理由が「呼び手の都合」なのは、性質としては壊れている**。 */
const WATCH = new RegExp('(^|/)(' + (CFG.watch || ['site', 'worker', 'gas', 'src', 'app', 'lib']).join('|') + ')/', 'i');
const MAX_SECTIONS = 3;   // 本文を出す項の上限(これ以上は名前だけ。出しすぎは慣れを作る)
const MAX_BODY = 1800;    // 1項あたりの本文の上限文字数

let raw = '';
process.stdin.on('data', (d) => { raw += d; });
/* ★握り潰したことは【言う】(2026-08-30、配布先からの報告⑥)。
 *   直す前は `catch (_)` で完全に無音だった。配布先で「起動はするが何も出さない」が起き、
 *   原因が main() の中の例外なのか、そもそも該当が無いのかを**外から区別できなかった**。
 * ★開発は止めない(44条)。だが**黙るのと、黙って死ぬのは違う**。
 *   何も出していないときだけ、落ちた事実を1行返す ── これで『無音=該当なし』の誤読が消える。 */
process.stdin.on('end', () => {
  try { main(); } catch (e) {
    if (!出した) {
      try {
        emit('CODEMAP: このフックは落ちました(' + String(e && e.message).slice(0, 200) + ')。'
          + '地図は差し込めていません ── **無音ではなく、失敗です**。'
          + 'node ' + __filename.split(/[\\/]/).slice(-2).join('/') + ' に入力を流すと再現できます');
      } catch (_) { /* 返し方まで壊れているときは、これ以上できることが無い */ }
    }
  }
});

/* PreToolUse の返し方(2026-08-10 公式ドキュメントで確認済み):
 *   hookSpecificOutput.permissionDecision = 'allow' | 'deny' | 'ask' | 'defer'
 *   additionalContext も PreToolUse で渡り、次のモデル要求に添えられる。
 * ここでの選び方:
 *   'defer' = 通常の許可フロー。情報(地図の該当項)を渡すだけのときはこれ。
 *   'ask'   = 依頼主の判断へ上げる。過去に「片方だけ直した」実績のある項に触れたときだけ。
 *   'allow' は使わない ── 通常の許可フローを飛ばすので、地図を読ませる仕組みが
 *             権限の緩めとして働いてしまう。情報を足すために安全性を下げてはならない。
 *   'deny'  は使わない ── 機械が一方的に禁じると正当な改修まで止まる。止めるのではなく人に上げる。 */
/* 2026-08-12 修正: 情報だけ渡すときは permissionDecision を【付けない】。
 * 'defer' を明示していたが、この値を返すと Write/Edit が内部エラーで落ち、
 * 【書き込みが起きていないのにモデル側にはエラーだけが返る】状態になっていた
 * (gas/ 配下への書き込みが3回連続で消えて発覚。省略=通常の許可フローが正)。 */
let 出した = false;
function emit(msg, decision, reason) {
  出した = true;
  const o = { hookEventName: 'PreToolUse' };
  if (decision && decision !== 'defer') o.permissionDecision = decision;
  if (msg) o.additionalContext = msg;
  if (reason) o.permissionDecisionReason = reason;
  console.log(JSON.stringify({ suppressOutput: true, hookSpecificOutput: o }));
}

function uniq(a) { return Array.from(new Set(a)); }

/* 記号が編集文に出てきたかの判定。
 * 単純な部分一致だと、地図にある `warn` が編集文の "warning" に誤ヒットして
 * 無関係な項が引かれる ── 誤ヒットは慣れを作るので、素の識別子は語境界で照合する。
 * スラッシュや引用符を含む語(APIルートや `op:'invite'` の形)は境界が定義できないので部分一致のまま。 */
/* ★語境界を自前で持つ(2026-08-31、配布先の実測)。
 *
 *   直す前は `\b` と `^\w+$` を使っていた。**どちらも ASCII の物差し**である。
 *   `名札` のような日本語の記号名は `\w` に入らないので、
 *     ・`^\w+$` に落ちて部分一致へ流れる
 *     ・`\b名札\b` は前後に境界が成立せず **常に false**
 *   実測(配布先): 同じファイルで触る記号だけ変えると
 *     英語の記号 → 強い一致・該当項の本文が出る
 *     日本語の記号 → 強い一致ゼロ・**項目名が16個並ぶだけ**(どちらも配布先の記号名なので囲まない)
 *   ★症状が「黙る」ではなく「**鳴りすぎる**」ところが悪い。
 *     無音は壊れていると分かるが、**鳴りすぎは効いていると誤解させる**
 *     (このファイル自身が「出しすぎは慣れを作る」と書いている、その状態)。
 *
 * ★前後が【文字・数字・_】でないことを見る。英語も日本語も同じ規則で通る。
 *   実測 9/9: 英語・日本語・助詞入りの長い名前・APIルート・引用符入りは当たり、部分語は当たらない。
 * ★スラッシュや引用符を含む語(APIルート・`op:'invite'` の形)は境界が定義できないので部分一致のまま。 */
const 境界 = /[\p{L}\p{N}_]/u;
/* ★実名として拾う長さ ── 3文字は ASCII の物差し(2026-08-31、配布先の実測)。
 *   英語なら2文字の識別子は稀だが、**日本語は2文字が普通**である(名札 / 通話 / 記録)。
 *   1文字も在る(顔 / 鍵 / 声)。地図は**バッククォートで囲んだ語だけ**を見るので、
 *   1文字でも「囲んだ」時点で人が意図しており、拾ってよい。
 *   実測(配布先): `名札` は length 2 でここに落ち、**syms に一度も入っていなかった**。
 *   英語の記号だけが当たっていたのは、たまたま長かったから。 */
const 日本語 = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;
function 実名として十分(t) { return 日本語.test(t) ? t.length >= 1 : t.length >= 3; }
function touched(sym, text) {
  if (!text) return false;
  if (!境界.test(sym[0]) || !境界.test(sym[sym.length - 1])) return text.includes(sym);
  let i = 0;
  while ((i = text.indexOf(sym, i)) !== -1) {
    const 前 = text[i - 1], 後 = text[i + sym.length];
    i += sym.length;
    if ((前 && 境界.test(前)) || (後 && 境界.test(後))) continue;
    return true;
  }
  return false;
}

/* 引き金になれる記号か。
 * 地図には `console` `warn` `keyed` のような、どこにでも出る素の小文字語も載っている。   guardian:ok 説明のための例え(実在する記号ではない)
 * これを引き金にすると console.log を書いただけで無関係な項が引かれる ── 誤ヒットは慣れを作り、
 * 慣れは本当に必要なときの読み飛ばしを作る(clock.js と同じ理由)。
 * よって引き金は【その計画に固有だと分かる形】── 大文字・数字・下線・記号を含む語に限る。
 * (camelCase / UPPER_SNAKE / snake_case / スラッシュを含むルート は通り、
 *  console / warn / keyed のような素の小文字語は通らない。
 *  小文字語も、項が別の記号で引かれれば一覧には載る) */
function distinctive(sym) { return !/^[a-z]+$/.test(sym); }
function short(f) { return f.split('/').slice(-2).join('/'); }
function clip(s, n) { return s.length <= n ? s : s.slice(0, n) + '\n…(以下略。全文は ' + 地図の名 + ')'; }

/* CODEMAP.md を「## 見出し」単位に割り、各項が名指ししている実名を拾う。
 * バッククォートで囲まれた語のうち、拡張子つきの相対パスをファイル、それ以外を記号として扱う。
 * (`/api/avatar-config` のようなルートは先頭が / なのでパス判定に掛からず記号側に入る ── それでよい)   guardian:ok 説明のための例え(実在する記号ではない)
 * ★逃げ道(guardian:ok)は【囲みコメントの中】に置く ── 2026-08-30、上の行では
 *   囲みを閉じたあとに置いてあった。そのせいで**このファイルは構文エラー**になり、
 *   フックとして**一度も動いていなかった**(配布先の type:module 報告から掘り当てた)。
 *   フックは失敗しても黙って通す(44条)ので、**誰も気づけない**。 */
/* ★地図の【コード柵の中】は読まない(2026-08-31、配布先の監査で出た)。
 *
 * ★実際に起きた: 配布先が地図に、この現場に無い記号を**例として**囲んで書いたら、
 *   `check.mjs` が実名と読んで「実装に見つかりません」と赤くした。
 *   ★**地図のバッククォートは「これは実在の記号だ」という宣言**であって、例を書く場所ではない。
 *   では例はどこへ書くのか ── **コード柵(```)の中**である。`check.mjs` は前から柵を落としている。
 * ★★ところが**このフックは落としていなかった** ── 同じ地図を、2つの読み手が違う物差しで読んでいた。
 *   柵の中に書いた例が、フックでは実名になり、**関係ない項が引かれる**(誤ヒットは慣れを作る・7条)。
 * ★だから同じにする。柵の中は、どちらの読み手からも見えない。 */
function parseMap(md0) {
  const md = String(md0 || '').replace(/```[\s\S]*?```/g, '');
  const sections = [];
  const parts = md.split(/\n## /);
  for (let i = 1; i < parts.length; i++) {
    const chunk = parts[i];
    const nl = chunk.indexOf('\n');
    const title = (nl < 0 ? chunk : chunk.slice(0, nl)).trim();
    const body = (nl < 0 ? '' : chunk.slice(nl + 1)).replace(/\s+$/, '');
    const files = [];
    const syms = [];
    const re = /`([^`\n]+)`/g;
    let m;
    while ((m = re.exec(chunk))) {
      const t = m[1].trim();
      if (/^[\w.@-]+(\/[\w.@-]+)+$/.test(t) && /\.[a-z0-9]+$/i.test(t)) files.push(t.toLowerCase());
      else if (実名として十分(t)) {
        syms.push(t);
        /* ★呼び出しの形で書かれた実名から、名前だけも拾う(2026-08-31、配布先の実測)。
         *   地図に「名札(env, user, slot)」と**呼び出しの形**で書くと、実名はその全体になり、
         *   引数名が違う実コードには**永久に一致しない**。
         *   配布先で英語の記号だけが当たっていたのは、地図の別の場所にたまたま
         *   名前だけの項があったから ── **偶然に頼っていた**。 */
        const 括弧の前 = t.split('(')[0].trim();
        if (括弧の前 !== t && 実名として十分(括弧の前)) syms.push(括弧の前);
      }
    }
    sections.push({
      title, body,
      files: uniq(files),
      syms: uniq(syms),
      trap: /罠の実績/.test(chunk),
    });
  }
  return sections;
}

function main() {
  const j = JSON.parse(raw);
  const ti = j.tool_input || {};
  const file = String(ti.file_path || '').replace(/\\/g, '/');
  if (!file || !WATCH.test(file)) return;          // 地図の対象外 ── 黙る

  const lower = file.toLowerCase();
  const edited = [ti.old_string, ti.new_string, ti.content]
    .filter((v) => typeof v === 'string').join('\n');

  let md;
  try {
    md = fs.readFileSync(MAP_PATH, 'utf8');
  } catch (_) {
    return emit(地図の名 + ' が読めない(' + MAP_PATH + ')。地図が無いまま実装が進んでいる状態。');
  }

  const sections = parseMap(md);
  const named = sections.filter((s) => s.files.some((f) => lower === f || lower.endsWith('/' + f)));

  /* 地図に載っていない場所を編集した ── 沈黙させない。
   * 「異常なし」と「見ていない」が外から区別できなくなるのを避けるため、短く一言だけ出す。 */
  if (!named.length) {
    return emit('CODEMAP: 地図の外 ── ' + short(file) + ' を名指ししている項は ' + 地図の名 + ' に無い。'
      + '些細な変更なら無視してよい。別の層に接点があるなら地図の穴なので項を足すこと。');
  }

  /* 触った番地で絞る: その項が名指ししている実名が、実際の編集文に出ているか。
   * worker/src/index.ts のように多くの項に現れるファイルでも、これで該当項が絞れる。 */
  for (const s of named) s.hit = s.syms.filter((y) => distinctive(y) && touched(y, edited));
  const strong = named.filter((s) => s.hit.length > 0)
    .sort((a, b) => b.hit.length - a.hit.length);

  /* 弱い一致(ファイルは載っているが、その項の実名には触れていない)── 項目名だけ渡す */
  if (!strong.length) {
    const list = named.map((s) => (s.trap ? '⚠ ' : '') + s.title).join(' / ');
    return emit('CODEMAP: ' + short(file) + ' は次の項に載っている ── ' + list
      + '。該当するものがあれば ' + 地図の名 + ' の当該項を開いて接点を照合すること'
      + '(⚠ は過去に片方だけ直した実績がある項)。');
  }

  const show = strong.slice(0, MAX_SECTIONS);
  const rest = strong.slice(MAX_SECTIONS);
  const contacts = uniq(show.flatMap((s) => s.files));

  let msg = 'CODEMAP 該当項(これから ' + short(file) + ' を編集。触れる実名: '
    + uniq(show.flatMap((s) => s.hit)).join(', ') + ')\n'
    + 'この概念の接点は ' + contacts.length + ' ファイルに跨っている: ' + contacts.join(', ') + '\n'
    + '── 下は地図の本文。**別の層のゲート・性質表・消費箇所に触れ残しが無いか**を、書いた後ではなく'
    + '**この編集を含む一連の改修の中で**必ず潰すこと。新しい接点を作った/構造を変えたなら ' + 地図の名 + ' も更新する。\n';

  for (const s of show) {
    msg += '\n## ' + s.title + (s.trap ? '  ⚠過去に片方だけ直した実績あり' : '') + '\n'
      + clip(s.body, MAX_BODY) + '\n';
  }
  if (rest.length) msg += '\n(他に該当し得る項: ' + rest.map((s) => s.title).join(' / ') + ')\n';

  /* 「罠の実績」= 過去に実際に片方だけ直して壊した箇所。ここだけは通さず依頼主に上げる。
   * 事後の催促では間に合わなかったからこそ実績として記録されている。 */
  const trapped = show.filter((s) => s.trap);
  if (trapped.length) {
    return emit(msg, 'ask',
      '⚠ ' + trapped.map((s) => s.title).join(' / ')
      + ' ── 過去に「片方だけ直して壊した」実績のある項に触れます。'
      + '接点は ' + contacts.length + ' ファイル: ' + contacts.join(', ')
      + '。他の接点の触れ残しが無いか確認してから通してください。');
  }
  emit(msg);
}
