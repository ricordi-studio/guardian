/* 共通の書き手 ── 走行中に増える物を【書いた事実で】台帳に登録する(2026-09-03)。
 *
 * ★なぜ在るか: 導入のときに置いた物は install が台帳に載せる。
 *   ★★だが【使っている間に増える物】(予想.json / coverage / audit_at …)は誰も載せない。
 *   → 外すとき「誰の物か決まっていない」に落ち、★★★判定が UNKNOWN になる。
 *
 * ★会議で寄った線:
 *   ・★静的な一覧を手で持たない ── 手で持つと、書き込みを足した人が一覧を直し忘れる(黙って漏れる)
 *   ・★★【書いた事実】を台帳にする ── 書けば必ず載るので、直し忘れが起きない
 *   ・★★★迂回した書き込みは、検査で赤くする(書き手を作っても、迂回できるなら同じ穴)
 *
 * ★これは CommonJS である ── ★★hooks/*.js(CJS)と *.mjs(ESM)の両方から使うため。
 *   ESM 側は createRequire で読む。
 *
 * ★★載せるのは【道と、いつ・誰が書いたか】だけ。中身の指紋は入れない ──
 *   ★★★走行中の物は毎回 変わるので、指紋を持っても「変わっている」としか言えない。
 *   外すときに要るのは「これは塊が書いた物である」という一点。 */

const fs = require('fs');
const path = require('path');

/* ★台帳は TARGET の .guardian/ に在る(2026-09-03 に移した)。無ければ何もしない ──
 *   ★★台帳が無い現場でも、書き込み自体は通す(付属品が本体を殺さない)。 */
/* ★台帳の道は【ここが正本】── ★★相対と絶対の【対】で持つ(2026-09-03、会議で @kozo が数えた)。
 *
 *   ★実測: 関数だけ作ったら、写しが 3箇所 → ★★5箇所に増えた。
 *   ★★★正本が在るのに写しが同居する形は、無いより悪い ──
 *   「正本が在る」と思って読む人が居て、実際には5箇所が独立に決めているから。
 *
 * ★@codex の指摘どおり、絶対の道だけでは足りない ──
 *   ★★外す側は【相対の綴り】で自分を除外する(比較の相手が相対名なので)。
 *   だから対で持ち、★★★どちらかを必ず使う。
 *
 * ★ここに置く理由: 書き手.cjs は 台帳.mjs も 外す.mjs も install.mjs も既に読んでいる
 *   【いちばん下の層】である。新しい層(所有道.cjs)を足すと、層が1つ増えるだけになる。 */
const 台帳の相対 = '.guardian/導入台帳.json';
const 台帳の道 = (ROOT) => path.join(ROOT, ...台帳の相対.split('/'));


/** ★親フォルダを作り、【作った分だけ】相対名で返す(2026-09-03)。
 *
 *  ★★実測で見つけた残滓: ファイルを外したあと `docs/` と `.claude/commands/` が
 *  ★★★空のまま残っていた。走査はファイルしか数えないので retained にも出ない ── 見えない残滓。
 *
 *  最初は「畳んでよいフォルダ」を手で並べた。だがそれは【静的な一覧を手で持つ】形で、
 *  ★書き込みを足した人が一覧を直し忘れると黙って漏れる ── 書き手を作った理由と同じ穴である。
 *  ★★だからフォルダも【作った物だけ】を台帳に載せ、外すときは所有で決める。
 *  ★★★元から在ったフォルダは載らないので、中が空でも触らない。 */
function 親を作る(ROOT, 先) {
  const 作った = [];
  let d = path.dirname(先);
  const 積む = [];
  while (d.startsWith(ROOT) && d !== ROOT && !fs.existsSync(d)) { 積む.push(d); d = path.dirname(d); }
  fs.mkdirSync(path.dirname(先), { recursive: true });
  /* ★浅い方から並べる ── 外すときは【深い方から】畳むので、外す側で逆に読む */
  for (const q of 積む.reverse()) 作った.push(path.relative(ROOT, q).split(path.sep).join('/'));
  return 作った;
}

/** 走行中に書いた物を、台帳へ1件 登録する(同じ道は二度 載せない)。 */
/* ★【追記】の共通の口(27.6、2026-09-03、会議で @kozo が実測 → @codex が形を出した)。
 *
 *   ★★事故: 27.2 で受け取りを 追記(JSONL)に直したとき、
 *   書き手に【追記の口が無かった】ので、外す.mjs が appendFileSync を直に呼んだ。
 *   ★★★実測(@kozo、af4): 受け取りは台帳に載らず、次の撤去で「誰の物か決まっていない」に落ちた。
 *   ★この塊は「使っている間に増える物は、書いた事実で台帳にする」と名乗っている ──
 *   ★★その塊自身の【撤去の記録】が、その外を通っていた。
 *
 *   ★★★だから 上書き(書く)と同じ格の口を、追記にも作る。
 *   ここが持つのは3つ: 親を作る / ★完全行の保証 / ★★台帳に載せる。
 *
 *   ★完全行について(@kozo が 15:52 に測った事故):
 *     前の走行が途中で切れて【改行で終わっていない】と、
 *     ★★次の追記が その壊れた行に くっついて、2つの記録が1行に化ける。
 *     ★★★だから、末尾が改行でなければ 先に改行を1つ足してから書く。
 *     壊れた行は【壊れたまま残す】── 消さない(消すと、消えた事も分からなくなる)。 */
function 追記(ROOT, 相対の道, 行, writer, 種類) {
  const 先 = path.join(ROOT, 相対の道);
  let 前の行が壊れていた = false;
  親を作る(ROOT, 先);
  try {
    const st = fs.statSync(先);
    if (st.size > 0) {
      const fd = fs.openSync(先, "r");
      const buf = Buffer.alloc(1);
      fs.readSync(fd, buf, 0, 1, st.size - 1);
      fs.closeSync(fd);
      if (buf[0] !== 10) {
        前の行が壊れていた = true;
        fs.appendFileSync(先, String.fromCharCode(10));   /* ★くっつけない ── 壊れた行は壊れたまま1行に残す */
      }
    }
  } catch (_) { /* 無い or 読めない ── 新しく作る扱い */ }
  fs.appendFileSync(先, 行 + String.fromCharCode(10));
  const 載った = 登録(ROOT, 相対の道, writer, 種類 || "走行中の物(追記)");
  return { 載った, 前の行が壊れていた };
}

function 登録(ROOT, 相対の道, writer, 種類) {
  try {
    const 先 = 台帳の道(ROOT);
    let 台帳 = null;
    try { 台帳 = JSON.parse(fs.readFileSync(先, 'utf8')); } catch (_) { return false; }
    if (!台帳 || !Array.isArray(台帳.走行)) return false;

    /* ★走行中の分は【1つの走行】にまとめる ── 導入の走行と混ぜない。
     *   ★★導入の走行は「入れたときの基準」で、こちらは「使っている間に増えた物」。 */
    let 走 = 台帳.走行.find((r) => r.種類 === '走行中');
    if (!走) { 走 = { 種類: '走行中', 時刻: new Date().toISOString(), 項: [] }; 台帳.走行.push(走); }

    if (走.項.some((x) => x.rel === 相対の道)) return true;   /* もう載っている */
    走.項.push({
      rootKind: 'TARGET', rel: 相対の道, 種類: 種類 || '走行中の物',
      作った: true, hash: null, writer, 時刻: new Date().toISOString(),
    });
    fs.mkdirSync(path.dirname(先), { recursive: true });
    fs.writeFileSync(先, JSON.stringify(台帳, null, 1) + '\n');
    return true;
  } catch (_) { return false; }   /* ★台帳に載せられなくても、書き込みは止めない */
}

/** 書いて、台帳へ載せる。★親フォルダは自分で作る(2026-09-03、13.25 の直しと同じ理由)。 */
function 書く(ROOT, 相対の道, 中身, writer) {
  const 先 = path.join(ROOT, 相対の道);
  for (const d of 親を作る(ROOT, 先)) 登録(ROOT, d, writer, 'フォルダ');
  fs.writeFileSync(先, 中身);
  登録(ROOT, 相対の道, writer);
  return 先;
}


/* ★指紋 ── ★★ここが唯一の実装(2026-09-03)。台帳.mjs もここから取る。
 *   直す前は台帳.mjs と2つ在った。★★★式がずれても誰も気づけない ──
 *   ずれた指紋は「変わっている」と読まれ、外す側が静かに CONFLICT を出すだけだから。
 *   ★★★2つ持って双子で照らすのではなく、1本にした ── 照らす物が無ければ ずれようが無い。 */
const 指紋 = (s) => {
  let h = 2166136261;
  const t = String(s);
  for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36) + '-' + t.length;
};

/** ★塊が【自分で置いた物を、自分で書き換える】ときに呼ぶ(2026-09-03)。
 *
 *  ★★実測でこうなっていた: `check.mjs --tighten` が guardian.config.json を書き換えると、
 *  外すとき指紋が合わず「入れたときから変わっています(この現場が育てた物なので、消しません)」
 *  ── ★★★塊自身がやったことを、人のせいにして CONFLICT で止まっていた。
 *
 *  だから【塊が書き換えたら、台帳の指紋も塊が直す】。人が触った変更だけが CONFLICT に残る。
 *  ★載っていない物には何もしない ── 勝手に所有を主張しない。 */
function 更新(ROOT, 相対の道, 中身, writer) {
  try {
    const 先 = 台帳の道(ROOT);
    let 台帳 = null;
    try { 台帳 = JSON.parse(fs.readFileSync(先, 'utf8')); } catch (_) { return false; }
    if (!台帳 || !Array.isArray(台帳.走行)) return false;
    let 直した = false;
    for (const 走 of 台帳.走行) {
      for (const x of (走.項 || [])) {
        if (x.rel !== 相対の道 || x.種類 !== 'ファイル') continue;
        if (!x.作った) continue;            /* ★入れる前から在った物は、塊の物ではない */
        x.hash = 指紋(String(中身));
        x.更新 = { writer, 時刻: new Date().toISOString() };
        直した = true;
      }
    }
    if (直した) fs.writeFileSync(先, JSON.stringify(台帳, null, 1) + String.fromCharCode(10));
    return 直した;
  } catch (_) { return false; }
}

/** 書き換えて、台帳の指紋も直す。 */
function 書き換える(ROOT, 相対の道, 中身, writer) {
  fs.writeFileSync(path.join(ROOT, 相対の道), 中身);
  更新(ROOT, 相対の道, 中身, writer);
}

module.exports = { 書く, 追記, 登録, 更新, 書き換える, 指紋, 親を作る, 台帳の道, 台帳の相対 };
