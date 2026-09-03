#!/usr/bin/env node
/* ★このフックが【黙って通る / 言って通る】道の宣言(24.7、2026-09-03、会議で @kozo が求めた)。
 *
 *   ★★検査(B18)は hooks/ を全部 叩き、**黙って通ったマス**を見つける。
 *   ★★★黙ってよい理由は【このファイル】に書く ── 離れた表に書くと、
 *   道を足した人と表を直す人が別の場所に居ることになり、黙って漏れる。
 *   (23.x で 外す.mjs の「手で並べた一覧」を消したのと同じ理由) */
/* @黙る道: 全部 ── 反射の形が無ければ言う事が無い。見つけた時だけ止める */
/**
 * 反射の門(PreToolUse: Write / Edit)── 依頼主指示 2026-08-23
 *
 * なぜ要るか:
 *   「器に値を持たせるな」「情報・作法・器を分けろ」は、規則にもフックにも書いてあったのに
 *   **同じ日に十数回破った**(8000→16000→8000 / 60秒→90秒 / 3件→2件 / 1024 / 4回 …)。
 *   書き手(AI)は「壊れた → その場で器に数を足して直す」を**反射で**やる。
 *   そのとき書き手は「今回は正しい」と思っていて、規則を思い出さない。
 *   既存の門(固有名)は社名しか見ておらず、反射の形(数・黙る・文言の決め打ち)は素通りだった。
 *
 * 依頼主:「反射でその場しのぎの対策をやろうとすることを全てやろうとした時に停止させて下さい。
 *   そして、もっと深く考えて、どうやったら全体として最適化(情報、作法、器の役割にそれぞれ
 *   落とし込む)されるかを考えるようにしてください。」
 *
 * 何を止めるか(器のファイルへの書き込みで、反射の形をしたもの):
 *   ① 数の決め打ち ── 時間・回数・件数・長さの上限を、器が数字で持つ
 *   ② 黙る      ── catch して何も言わずに null / 空 / false を返す
 *   ③ 文言で判定 ── 相手の返事の**英語の文言**で分岐する(会社ごとに違うので必ず外れる)
 *   ④ 名前で判定 ── 会社名・モデル名で分岐する(固有名の門と重なるが、ここでも止める)
 *
 * 止めたあと何をするか:
 *   **止めるだけでは反射は別の形で戻ってくる**。だから問いを返す ──
 *   「それは情報(ノート/宣言)が持つべきか / 作法(棚)が持つべきか / 器が持つなら限界か」。
 *   答えを行末に書いたものだけ通す(guardian:ok 理由)。理由が通行料。
 *
 * 器のファイルとは: guardian.config.json の reflex_gate.files(無ければ worker/src/*.ts)。
 */
const fs = require('fs');
const path = require('path');

let input = '';
process.stdin.on('data', (c) => { input += c; });
process.stdin.on('end', () => {
  let ev = {};
  try { ev = JSON.parse(input || '{}'); } catch (_) { process.exit(0); }
  if (!/^(Write|Edit|MultiEdit)$/.test(ev.tool_name || '')) process.exit(0);
  const inp = ev.tool_input || {};
  const file = String(inp.file_path || '');
  if (!file) process.exit(0);
  const root = process.cwd();
  const rel = path.relative(root, file).split(path.sep).join('/');

  let cfg = {};
  for (const c of ['guardian.config.json', 'guardian/guardian.config.json']) {
    try { cfg = JSON.parse(fs.readFileSync(path.join(root, c), 'utf8')); break; } catch (_) {}
  }
  /* ★止める固有名は【宣言】から集める(エンジンは持たない)。
   *   onlyIn max:0 の pattern は「この語がここに在ってはいけない」の宣言そのもの。
   *   宣言が無ければ ④ は**出さない**(見ていないものを、見たふりにしない)。 */
  const 宣言の固有名 = (cfg.checks || [])
    .filter((c) => c.kind === 'onlyIn' && Number(c.max) === 0 && c.pattern)
    .map((c) => c.pattern)
    .join('|') || null;
  const gate = cfg.reflex_gate || {};
  const files = gate.files || ['worker/src/index.ts', 'worker/src/vendors.ts'];
  if (!files.includes(rel)) process.exit(0);

  const texts = [];
  if (typeof inp.content === 'string') texts.push(inp.content);
  if (typeof inp.new_string === 'string') texts.push(inp.new_string);
  for (const e of (inp.edits || [])) if (typeof e.new_string === 'string') texts.push(e.new_string);
  if (!texts.length) process.exit(0);

  /* 反射の形。★ここに会社名や具体の数は置かない ── 形だけ */
  const B = String.fromCharCode(92);
  const 反射 = [
    { 名: '数の決め打ち(時間・回数・件数・長さ)',
      形: new RegExp('(Date' + B + '.now' + B + '(' + B + ')' + B + 's*' + B + '+' + B + 's*[0-9]{4,}'
        + '|(巡|回|件|塊|上限|期限|max|limit|MAX|LIMIT|ONCE|retry|timeout|deadline)[A-Za-z_]*' + B + 's*(<=?|>=?|=|:)' + B + 's*[0-9]+'
        + '|for' + B + '(let' + B + 's+[^;]+;' + B + 's*[^;]*(<|<=)' + B + 's*[0-9]{1,3}' + B + 's*;'
        + '|' + B + '.slice' + B + '(0,' + B + 's*[0-9]{4,}' + B + ')'
        + '|' + B + 'b[0-9]{4,}' + B + 'b' + B + 's*[;,)]' + ')'),
      問: 'その数は【情報】(運営ノート/宣言に欄を持ち、実測や運営の判断で入る)が持つべきでは?'
        + ' それとも【作法】(棚が自分で言う)? 器が持つのは「限界」だけで、限界なら返らなければ自分で小さくして測り直す形にできないか?' },
    { 名: '黙る(catch して何も言わずに返す)',
      形: new RegExp('catch' + B + 's*' + B + '(' + B + 's*[_a-zA-Z]*' + B + 's*' + B + ')' + B + 's*' + B + '{' + B + 's*(return' + B + 's*(null|undefined|false|' + B + '[' + B + ']|' + B + '{' + B + '}|' + "''" + ')' + B + 's*;?|' + B + '}|)' + B + 's*' + B + '}'),
      問: '測れなかったことは「測れなかった」と言う。誰が・なぜを【返り値か記録】に残せないか? 無音を成功と読ませていないか?' },
    { 名: '相手の返事の文言で判定(英語の決め打ち)',
      形: new RegExp('/[^/' + B + 'n]*(max_tokens|too large|exceed|rate limit|not found|invalid|unauthorized|quota)[^/' + B + 'n]*/i?' + B + '.test' + B + '('),
      問: '返事の文言は会社ごとに違う。状態番号(4xx/5xx)や「試してみる」で済まないか? 文言で分けるなら、それは【作法】(棚)の知識として置けないか?' },
    /* ★固有名は【宣言】が持つ(2026-08-31、配布先の実測)。
     *   直す前はここに社名が7つ埋まっていた ── **その3行上に**
     *   「ここに会社名や具体の数は置かない ── 形だけ」と自分で書いてあるのに。
     *   配布先の実測: 一覧に在る社名は止まり、**一覧に無い社名(新しい会社・日本語の社名)は素通り**した。
     * ★`no-fixed-names.js` と同じ口(宣言の onlyIn max:0 の pattern)から読む。
     *   あちらは「宣言から読む設計が、そのまま多言語対応になっている」と実測されている。
     *   ★エンジンが社名を持つ必要は無い ── 持った瞬間、次の会社が生まれた日に穴が開く。 */
    ...(宣言の固有名 ? [{ 名: '会社名・モデル名で判定(宣言から)',
      形: new RegExp('(===|!==|includes|startsWith|test)' + B + 's*' + B + '(?' + B + "s*['\"](" + 宣言の固有名 + ')', 'i'),
      問: 'それは【情報】(宣言)に書けば済むか? 器が会社を見分ける必要は本当にあるか?' }] : []),
  ];

  const hits = [];
  for (const t of texts) for (const line of t.split('\n')) {
    if (/guardian:ok/.test(line)) continue;
    const 本 = line.replace(/\/\*.*?\*\//g, '').replace(/\/\/.*$/, '');   // コメントは見ない
    if (!本.trim()) continue;
    for (const r of 反射) { if (r.形.test(本)) { hits.push({ r, line: line.trim().slice(0, 110) }); break; } }
  }
  if (!hits.length) process.exit(0);

  const lines = ['【反射の門】この書き込みは止めました(' + rel + ')。'];
  for (const h of hits.slice(0, 4)) {
    lines.push('');
    lines.push('  形: ' + h.r.名);
    lines.push('  行: ' + h.line);
    lines.push('  問: ' + h.r.問);
  }
  if (hits.length > 4) lines.push('  …他 ' + (hits.length - 4) + ' 行');
  lines.push('');
  lines.push('★「壊れた → その場で器に足す」は反射です。一度止まって、全体として');
  lines.push('  【情報(ノート/宣言)/ 作法(棚)/ 器(限界だけ)】のどこに落とすべきかを考えてください。');
  lines.push('  器が持ってよいのは「鍵を見せない・宛先を出さない・天井」のような限界だけで、');
  lines.push('  天井の数そのものも情報(運営ノート)が持てます。');
  lines.push('  考えた上で器に置くのが正しいなら、その行末に guardian:ok と【理由】を書けば通ります。');
  console.error(lines.join('\n'));
  process.exit(2);
});
