#!/usr/bin/env node
/**
 * 固有名の門(PreToolUse: Write / Edit)── 依頼主指示 2026-08-19
 *
 * なぜ要るか:
 *   「器に固有名を書かない」は .md に書いてある規則だが、**同じ日に2回破った**。
 *   1回目は器へ、2回目は情報の見本へ。文章の規則は、書き手が守るつもりでも守れないことがある。
 *   検査(check.mjs)は【書いた後】に落ちるが、それでは一度は書かれ、レビューを通り、配信されうる。
 *   だから【書く手前】で止める。守るのは意志ではなく門。
 *
 * 何を止めるか:
 *   guardian.config.json の checks から「固有名を数える検査」(kind:onlyIn で max:0)の
 *   pattern と files を読み、**その対象ファイルへ、その語を含む行を書き込もうとしたら拒否する**。
 *   ── 語の一覧をこのファイルに持たない(持ったら、それ自体が2枚目の表になる)。
 *
 * 通し方(正当な場合):
 *   行末に guardian:ok を付ける。**理由を書くこと**が通行料。
 */
const fs = require('fs');
const path = require('path');

let input = '';
process.stdin.on('data', (c) => { input += c; });
process.stdin.on('end', () => {
  let ev = {};
  try { ev = JSON.parse(input || '{}'); } catch (_) { process.exit(0); }
  const tool = ev.tool_name || '';
  if (!/^(Write|Edit|MultiEdit)$/.test(tool)) process.exit(0);
  const inp = ev.tool_input || {};
  const file = String(inp.file_path || '');
  if (!file) process.exit(0);

  const root = process.cwd();
  /* ★宣言の置き場は check.mjs と同じ2箇所を見る。片方しか見ないと、
   * 宣言を塊の中へ置いた現場では【何もしない門】が黙って立っていることになる。 */
  let cfg;
  for (const c of ['guardian.config.json', 'guardian/guardian.config.json']) {
    try { cfg = JSON.parse(fs.readFileSync(path.join(root, c), 'utf8')); break; } catch (_) {}
  }
  if (!cfg) process.exit(0);

  const rel = path.relative(root, file).split(path.sep).join('/');
  /* 「固有名を数える検査(max 0)」だけを門にする ── 数を許している検査は既存の負債なので通す */
  const gates = (cfg.checks || []).filter((c) =>
    c.kind === 'onlyIn' && Number(c.max) === 0 && c.pattern && (c.files || []).includes(rel));
  if (!gates.length) process.exit(0);

  /* 書き込もうとしている本文(Writeは全文・Editは差し替え後の文字列) */
  const texts = [];
  if (typeof inp.content === 'string') texts.push(inp.content);
  if (typeof inp.new_string === 'string') texts.push(inp.new_string);
  for (const e of (inp.edits || [])) if (typeof e.new_string === 'string') texts.push(e.new_string);
  if (!texts.length) process.exit(0);

  const hits = [];
  for (const g of gates) {
    let re;
    try { re = new RegExp(g.pattern, 'gi'); } catch (_) { continue; }
    for (const t of texts) {
      for (const line of t.split('\n')) {
        if (/guardian:ok/.test(line)) continue;
        const m = line.match(re);
        if (m) hits.push({ name: g.name, word: m[0], line: line.trim().slice(0, 100) });
      }
    }
  }
  if (!hits.length) process.exit(0);

  const h = hits[0];
  const msg = '【固有名の門】この書き込みは止めました。\n'
    + '  ファイル: ' + rel + '\n'
    + '  見つけた語: 「' + h.word + '」\n'
    + '  行: ' + h.line + '\n'
    + '  規則: ' + h.name + '\n\n'
    + 'このファイルは【構造と形】だけを持つ器です。会社名・製品名・モデル名は、\n'
    + '検索で集めて宣言(users.vendor_notes / 運営ノート)に入れるもので、ここには書きません。\n'
    + '固有名を書かずに同じ目的を果たす方法を考えてください'
    + '(例: 名前ではなく【形】で言う / 値ではなく【穴の位置】を示す)。\n'
    + '本当に正当な例外なら、その行の末尾に guardian:ok と理由を書けば通ります。';
  console.error(msg);
  process.exit(2);   // 2 = ツール呼び出しを拒否し、この文言をClaudeへ返す
});
