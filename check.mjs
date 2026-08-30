/**
 * 地図と正本の機械検査(汎用エンジン)
 *
 * このファイルは【どのプロジェクトでも同じ中身】。プロジェクト固有のことは
 * 全部 guardian.config.json(宣言)に書く ── だから guardian/ ごとコピペで配れる。
 *
 * 検査は2種類しかない:
 *   A. 地図の記号が実装に実在するか(設定不要・地図さえあれば効く)
 *   B. 宣言された不変条件(同じ意味の値が複数箇所にある / 決めた書き方から外れていない)
 *   ＋ おまけ: HTMLのセレクタ参照が実在するか
 *
 * 使い方:
 *   node guardian/check.mjs                 # そのリポジトリを検査
 *   node guardian/check.mjs --root ../other # 他のリポジトリを外から検査(読むだけ)
 *   node guardian/check.mjs --selectors a.html b.html   # セレクタだけ単発で
 *
 * 出口コード: ずれがあれば 1(CIがそのまま落ちる)。
 *
 * なぜこの道具があるのか・各検査が生まれた事故は WHY.md に書いてある。
 * **検査を足すときは、必ず WHY.md に「どの事故を防ぐのか」を書くこと。**
 * 理由の無い検査は、次の人に「意味の無い儀式」として外される。
 */
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const rootArg = argv.indexOf('--root');
const ROOT = path.resolve(rootArg >= 0 ? argv[rootArg + 1] : process.cwd());
const NL = String.fromCharCode(10);
const read = (p) => { try { return fs.readFileSync(path.join(ROOT, p), 'utf8'); } catch (_) { return ''; } };

const problems = [];
const notes = [];
const loose = [];        // 許容(max)より口が減っている検査 ── --tighten で下げる対象

/* ---------- 設定を読む ---------- */
const CONFIG_PATHS = ['guardian.config.json', 'guardian/guardian.config.json'];
let cfg = null;
let cfgPath = '';
for (const p of CONFIG_PATHS) {
  const t = read(p);
  if (!t) continue;
  try { cfg = JSON.parse(t); cfgPath = p; break; }
  catch (e) { problems.push(`${p} が壊れています(JSONとして読めません): ${String(e.message).slice(0, 120)}`); }
}
if (!cfg) cfg = {};
const MAP_PATH = cfg.map || 'docs/CODEMAP.md';

/* ---------- A. 地図の記号が実装に実在するか ---------- */
/* バッククォートで囲まれたもののうち【識別子とAPIルートだけ】を拾う。
 * 日本語・説明文・ファイルパスは対象外 ── 誤検出を出すと誰も見なくなる(厳しめに絞る)。 */
const IDENT = /^[A-Za-z_][A-Za-z0-9_]{2,}$/;
const ROUTE = /^\/[A-Za-z0-9\-\/_]+$/;
const SKIP = new Set([
  'CODEMAP', 'STATUS', 'CLAUDE', 'ARCHITECTURE', 'README', 'WHY', 'RULES',
  'IndexedDB', 'LiveKit', 'WebRTC', 'PCM', 'SHA', 'HMAC', 'JWT', 'CSS', 'HTML', 'PWA', 'JSON', 'DNS',
  'true', 'false', 'null', 'undefined',
  ...(cfg.skipSymbols || []),
]);

const map = read(MAP_PATH);
if (!map) {
  problems.push(`${MAP_PATH} が読めません(地図が無いまま実装が進んでいる状態)`);
} else {
  /* ★注釈は主張ではない ── **コメントに残った名前を「実在する」と数えない**。
   * 2026-08-18の監査で判明: 撤去済みの記号でも「以前ここに◯◯があった」という注釈が残っていると、
   * この検査は緑のままだった。地図の誤り10件を1件も捕まえられていなかった
   * ── 検査が当てにならない側の誤りなので、いちばん質が悪い。 */
  const stripComments = (s) => s.split(NL).filter((l) => {
    const t = l.trim();
    return !(t.startsWith('*') || t.startsWith('//') || t.startsWith('/*') || t.startsWith('<!--'));
  }).join(NL);
  {
  const SRC = (cfg.sources || []).map((f) => stripComments(read(f))).join(NL);
  if (!SRC) {
    notes.push('記号の実在照合は飛ばしました(guardian.config.json の sources が空)');
  } else {
    const seen = new Set();
    const missing = [];
    /* ★囲みコード(```…```)の中は【例示】なので拾わない。
     * 地図の雛形に載せた書き方の見本まで「実装に無い記号」として落ちると、
     * 入れた初日に嘘の指摘が出る ── 最初の1件の誤検出で、この道具は信用を失う。 */
    const mapBody = map.replace(/```[\s\S]*?```/g, '');
    for (const m of mapBody.matchAll(/`([^`\n]+)`/g)) {
      const raw = m[1].trim();
      // `foo` / `foo()` / `foo:'bar'` のような書き方から名前だけを取り出す   guardian:ok 説明のための例え(実在する記号ではない)
      const name = raw.replace(/\(\)$/, '').split(/[\s:(\[]/)[0];
      if (!name || seen.has(name)) continue;
      const ok = (IDENT.test(name) && !SKIP.has(name)) || ROUTE.test(name);
      if (!ok) continue;
      seen.add(name);
      if (!SRC.includes(name)) missing.push(name);
    }
    if (missing.length) {
      problems.push(`地図が名指しする記号が実装に見つかりません(${missing.length}件): ${missing.join(', ')}`);
      problems.push(`  → 消したなら ${MAP_PATH} からも消す。名前を変えたなら地図も追従する。`);
    } else {
      notes.push(`地図の記号 ${seen.size} 件は全て実装に存在(注釈は数えない)`);
    }
  }
  }

  /* ---------- A2. 地図が名指しするファイルは実在するか ----------
   * 記号だけ見ていて【パス】を見ていなかったので、撤去したファイルが地図に残り続けた
   * (2026-08-18の監査で発覚。「済んだら消す」と書いてあるのに地図だけ生き残っていた)。 */
  {
    const bases = ['', ...(cfg.pathBases || [])];
    const miss = [];
    const mapBody2 = map.replace(/```[\s\S]*?```/g, '');
    /* 拡張子は白名簿。`chat.manner` のような【プロパティの道筋】をファイルと誤解しないため */
    const EXT = /\.(ts|tsx|js|mjs|cjs|html|htm|gs|json|jsonc|sql|md|css|webmanifest|yml|yaml|png|webp|jpg|svg|mp4)$/;
    for (const m of mapBody2.matchAll(/`([A-Za-z0-9_./-]+\/[A-Za-z0-9_.-]+|[A-Za-z0-9_-]+\.[a-z0-9]{2,12})`/g)) {
      if (!EXT.test(m[1])) continue;
      const p = m[1];
      if (miss.includes(p)) continue;
      if (!bases.some((b) => fs.existsSync(path.join(ROOT, b, p)))) miss.push(p);
    }
    if (miss.length) {
      problems.push(`地図が名指しするファイルが在りません(${miss.length}件): ${miss.join(', ')}`);
      problems.push(`  → 撤去したなら ${MAP_PATH} からも消す(掟5)。置き場所を変えたなら地図も追従する。`);
    } else notes.push('地図が名指しするファイルは全て実在');
  }

  /* ---------- A3. 注釈が名指ししている記号は実在するか ----------
   * 依頼主指摘 2026-08-18「コメント内も、そこにその内容が記載されているのは正しいのか、という検査を」。
   * ★コメントは【いちばん腐りやすい】。実装を消してもコメントは残り、次に読む人を騙す。
   *   実際、撤去済みの仕組みを今も謳っている注釈が現に在った。
   * ★誤検出を出さないため、拾うのは【バッククォートで囲まれた識別子・ルート】だけ
   *   ── 散文に出てくる普通の語は見ない。行末に guardian:ok を書けば黙る。 */
  {
    const OK = new RegExp(cfg.okMarker || 'guardian:ok|lint-deps:ok');
    const ALL = (cfg.sources || []).map((f) => stripComments(read(f))).join(NL);
    const stale = [];
    for (const f of (cfg.sources || [])) {
      const src = read(f);
      if (!src) continue;
      src.split(NL).forEach((line, i) => {
        const t = line.trim();
        const isComment = t.startsWith('*') || t.startsWith('//') || t.startsWith('/*') || t.startsWith('<!--');
        if (!isComment || OK.test(line)) return;
        for (const m of line.matchAll(/`([^`\n]+)`/g)) {
          const name = m[1].trim().replace(/\(\)$/, '').split(/[\s:(\[]/)[0];
          if (!name) continue;
          const ok2 = (IDENT.test(name) && !SKIP.has(name)) || ROUTE.test(name);
          if (!ok2) continue;
          if (!ALL.includes(name) && !stale.some((s) => s.startsWith(name + ' '))) {
            stale.push(`${name} (${f}:L${i + 1})`);
          }
        }
      });
    }
    if (stale.length) {
      problems.push(`注釈が名指ししている記号が実装にありません(${stale.length}件): ${stale.slice(0, 10).join(' / ')}`
        + (stale.length > 10 ? ` …他${stale.length - 10}件` : ''));
      problems.push('  → コメントは実装より長生きする。撤去したら注釈も直すこと(行末に guardian:ok で例外にできる)。');
    } else notes.push('注釈が名指しする記号も全て実在');
  }

  /* ---------- A4. 【機械から見えていない項】を数える(2026-08-31、配布先からの報告) ----------
   * 配布先の実測: 地図に `@index.ts` と書いてあり、**人には読めるがバッククォートが無いので
   * 機械には見えていなかった**。フックは該当項を絞れず項目名を16個並べるだけになり、
   * しかも**誰も何も言わなかった**。配布先の言葉:「規約が暗黙で、破っても誰も言いません」。
   * ★落とさない ── 概念だけを書いた項(方針・原則)は接点を持たなくて当然で、
   *   全部鳴らすと騒音になる(配布先が自分でこの穴を書いている)。
   *   だから**片方だけ在る項**に絞る: ファイルは在るのに実名が無い / 実名は在るのにファイルが無い。
   *   ── 接点を書こうとして、**半分だけ機械に見えている**状態がこれである。 */
  {
    const 本文 = map.replace(/```[\s\S]*?```/g, '');
    const 片方だけ = [];
    const 塊 = 本文.split(/\n## /);
    for (let i = 1; i < 塊.length; i++) {
      const c = 塊[i];
      const nl = c.indexOf(NL);
      const 題 = (nl < 0 ? c : c.slice(0, nl)).trim();
      let ファイル = 0, 実名 = 0;
      for (const m of c.matchAll(/`([^`\n]+)`/g)) {
        const t = m[1].trim();
        if (/^[\w.@-]+(\/[\w.@-]+)+$/.test(t) && /\.[a-z0-9]+$/i.test(t)) ファイル++;
        else 実名++;
      }
      if (ファイル && !実名) 片方だけ.push(題 + '(ファイルだけ)');
      else if (実名 && !ファイル) 片方だけ.push(題 + '(実名だけ)');
    }
    if (片方だけ.length) {
      notes.push('片方しか機械に見えていない項が ' + 片方だけ.length + '件: '
        + 片方だけ.slice(0, 5).join(' / ')
        + (片方だけ.length > 5 ? ' ほか' + (片方だけ.length - 5) + '件' : '')
        + ' ── 実名もファイルも**バッククォートで囲まないと機械には無いのと同じ**です(落としません)');
    } else notes.push('地図の各項は、ファイルと実名の両方が機械に見えている');
  }
}

/* ---------- B. 宣言された不変条件 ----------
 * 4つの形しかない:
 *   same    … 複数箇所から1つの値を抜いて、全部同じか(為替・版番号)
 *   sameMap … 複数箇所から key→value の表を抜いて、全部同じか(単価表)
 *   sameSet … 複数箇所から鍵の集合を抜いて、全部同じか(性質表に会社が揃っているか)
 *   shape   … あるファイルが決めた書き方から外れていないか(他所が正規表現で読んでいる)
 * どれも「同じ事実が2箇所以上にあり、ずれると事故になる」を機械で見張るためのもの。 */
const rx = (s) => new RegExp(s, s.includes('\n') ? 'm' : '');

function pickOne(p) {
  const src = read(p.file);
  if (!src) return { label: p.label || p.file, missing: true };
  const m = src.match(rx(p.re));
  return { label: p.label || p.file, value: m ? (m[1] ?? m[0]) : undefined };
}
function pickBlock(p) {
  /* files(配列)なら、その全部を繋げて1枚として読む(2026-08-23)。
   * 「器が読む欄」のように、1つの集合が2ファイルに分かれて在るとき、枚ごとに比べると必ずずれる。 */
  const src = Array.isArray(p.files) ? p.files.map(read).join(NL) : read(p.file);
  if (!src) return null;
  const m = src.match(new RegExp(p.block));
  return m ? m[1] : null;
}

for (const c of (cfg.checks || [])) {
  const name = c.name || '(名前なし)';
  const why = c.why ? `(${c.why})` : '';
  try {
    /* ★宣言の【必須の欄】が無い検査は、動いていないのと同じ(2026-08-19 監査)。
     * 実際に kind:noInline へ patterns(正しくは names)を渡した検査が、0件=緑を返し続けた。
     * **何も見ていない検査が緑を返すのが、いちばん危ない** ── 見張られている気になるため。 */
    const NEED = { shape: ['file'], same: ['picks'], sameMap: ['picks'], sameSet: ['picks'],
                   onlyIn: ['pattern', 'files'], noInline: ['names', 'files'],
                   callArgs: ['call', 'files', 'minArgs'],
                   perSection: ['file', 'section', 'must'],
                   citeLive: ['file', 'idIn', 'deadIf', 'citedIn', 'cite'] };
    const need = NEED[c.kind] || [];
    const missing = need.filter((k) => c[k] == null || (Array.isArray(c[k]) && !c[k].length));
    if (missing.length) {
      problems.push(`${name}: 宣言に ${missing.join('/')} がありません`
        + `(kind:${c.kind} が読む欄)。**この検査はいま何も見ていません**${why}`);
      continue;
    }
    if (c.kind === 'shape') {
      const src = read(c.file);
      if (!src) { problems.push(`${name}: ${c.file} が読めません(移動したか消えた)。**この検査はいま何も見ていません**${why}`); continue; }
      if (new RegExp(c.re).test(src)) notes.push(`${name} は決めた書き方どおり`);
      else problems.push(`${name} が決めた書き方から外れています(${c.file})${why}`);
      continue;
    }
    if (c.kind === 'same') {
      const got = (c.picks || []).map(pickOne).filter((x) => !x.missing && x.value != null);
      /* ★読めないときは【落とす】。宣言したのに値を拾えていない検査は、
       * 何も見ていないのに毎回✓を返す ── 「無音を成功と読まない」(RULES.md 2)。
       * 静かに通る検査は、無い検査より悪い(見張っているつもりになる)。 */
      if (got.length < 2) {
        problems.push(`${name}: ${(c.picks || []).length}箇所を宣言しているのに ${got.length}箇所しか読めていません`
          + `(書き方が変わったか、正規表現が合っていない)。**この検査はいま何も見ていません**${why}`);
        continue;
      }
      if (new Set(got.map((x) => x.value)).size > 1)
        problems.push(`${name} が一致していません: ` + got.map((x) => `${x.label}=${x.value}`).join(' / ') + why);
      else notes.push(`${name} は ${got.length} 箇所とも ${got[0].value} で一致`);
      continue;
    }
    if (c.kind === 'sameMap') {
      const maps = [];
      for (const p of (c.picks || [])) {
        const body = pickBlock(p);
        if (body == null) continue;
        const o = {};
        for (const kv of body.matchAll(new RegExp(p.pair, 'g'))) o[kv[1]] = kv[2];
        maps.push({ label: p.label || p.file, o });
      }
      if (maps.length < 2) { problems.push(`${name} が片方にしかありません(名前が変わった可能性)${why}`); continue; }
      const [a, ...rest] = maps;
      const bad = [];
      for (const b of rest)
        for (const k of new Set([...Object.keys(a.o), ...Object.keys(b.o)]))
          if (a.o[k] !== b.o[k]) bad.push(`${k}(${a.label}=${a.o[k] ?? '無し'} / ${b.label}=${b.o[k] ?? '無し'})`);
      if (bad.length) problems.push(`${name} が食い違っています: ` + bad.join(' / ') + why);
      else notes.push(`${name} は ${maps.length} 箇所とも一致`);
      continue;
    }
    if (c.kind === 'sameSet') {
      const sets = [];
      for (const p of (c.picks || [])) {
        const body = pickBlock(p);
        if (body == null) continue;
        sets.push({ label: p.label || p.file || (p.files || []).join('+'), s: new Set([...body.matchAll(new RegExp(p.key, 'gm'))].map((m) => m[1])) });
      }
      if (sets.length < 2) {
        problems.push(`${name}: ${(c.picks || []).length}枚を宣言しているのに ${sets.length}枚しか読めていません`
          + `(書き方が変わった可能性)。**この検査はいま何も見ていません**${why}`);
        continue;
      }
      const [a, ...rest] = sets;
      const only = [];
      for (const b of rest) {
        for (const k of a.s) if (!b.s.has(k)) only.push(`${k}(${b.label}に無い)`);
        for (const k of b.s) if (!a.s.has(k)) only.push(`${k}(${a.label}に無い)`);
      }
      if (only.length) problems.push(`${name} が揃っていません: ` + only.join(', ') + why);
      else notes.push(`${name} は ${sets.length} 枚とも同じ ${a.s.size} 件`);
      continue;
    }
    if (c.kind === 'onlyIn') {
      /* 【口の数を数える】検査(2026-08-17)。
       *
       * これまでの検査は全部「2つの宣言が一致するか」= **散らばりを前提にして見張る**もの。
       * これは違う: **その概念に触れてよい場所は1つ(または数箇所)だけ**、という構造の主張。
       *
       * max は【下げる方向にしか動かさない数字】。誰かが口を1つ足すと数が超えて落ちる。
       * 寄せて減らしたときだけ max を下げる ── 構造の改善が後戻りできない形で記録される。
       *
       * 使い方(宣言側):
       *   pattern     … 数える対象の正規表現(例: 会社名のリテラル)
       *   files       … 探す先
       *   allowRegion … この範囲の中は数えない(=正しい口。性質表の本体など)
       *   max         … 外に在ってよい数。0 が理想
       */
      const OK = new RegExp(cfg.okMarker || 'guardian:ok|lint-deps:ok');
      const pat = new RegExp(c.pattern, 'g');
      /* ★【この検査は生きているか】を、検査自身に言わせる(2026-08-21)。
       * 設定に書いた正規表現は、JSONのエスケープ1つで**何にも当たらない式**になる。
       * 当たらない検査は「ずれなし」と言い続けるので、無いより悪い(嘘をつく計器)。
       * probe = 必ず当たるはずの見本。当たらなければ、検査ではなく検査自身を落とす。 */
      if (c.probe != null && !new RegExp(c.pattern).test(String(c.probe))) {
        problems.push(`${name}: **この検査は死んでいます**(見本に当たりません)。`
          + `式: ${c.pattern} / 見本: ${String(c.probe).slice(0, 60)}${why}`);
        continue;
      }
      const hits = [];
      for (const f of (c.files || [])) {
        let src = read(f);
        if (!src) { problems.push(`${name}: ${f} が読めません。**この検査はいま何も見ていません**${why}`); src = ''; continue; }
        /* 正しい口(性質表の本体)は数えない。空白に潰して行番号だけ保つ */
        if (c.allowRegion) {
          src = src.replace(new RegExp(c.allowRegion, 'g'),
            (m) => m.replace(/[^\n]/g, ' '));
        }
        src.split('\n').forEach((line, i) => {
          if (OK.test(line)) return;
          const t = line.trim();
          if (t.startsWith('*') || t.startsWith('//') || t.startsWith('/*')) return;  // 注釈は主張ではない
          const n = (line.match(pat) || []).length;
          if (n) hits.push(`${f}:L${i + 1}`);
        });
      }
      const max = Number(c.max ?? 0);
      if (hits.length > max) {
        problems.push(`${name}: 口が ${hits.length} 箇所あります(許容 ${max})${why}\n      `
          + hits.slice(0, 12).join(' / ') + (hits.length > 12 ? ` …他${hits.length - 12}件` : ''));
      } else {
        if (hits.length < max) loose.push({ name, max, hits: hits.length });
        notes.push(`${name}: 口は ${hits.length} 箇所(許容 ${max}`
          + (hits.length < max ? ' ← 減りました。--tighten で下げられます' : '') + ')');
      }
      continue;
    }
    if (c.kind === 'noInline') {
      /* 性質表に集めたはずの判定が、インラインに散らばっていないか。
       * 同じ行に仲間の語が2つ以上並んでいたら「表の外で分岐している」印
       * ── 層ごとにリストが割れて、片方だけ直す事故になる(待機動画事件の型)。 */
      const OK = new RegExp(cfg.okMarker || 'guardian:ok|lint-deps:ok');
      const allow = c.allow ? new RegExp(c.allow) : null;
      /* ★【この検査は生きているか】(2026-08-21)。見張るはずの語が実装から1つも消えていたら、
       * この検査は永久に0件=緑を返す ── 表ごと名前が変わった後も「散らばりは無い」と言い続ける。
       * 語が見つからないのは【安全になった】のではなく【見ていない】である。 */
      {
        const dead = (c.names || []).filter((nm) => !(c.files || []).some((f) => {
          const s = read(f);
          return s.includes(`'${nm}'`) || s.includes(`"${nm}"`);
        }));
        if (dead.length) {
          problems.push(`${name}: 見張るはずの語が実装に1つもありません(${dead.join(', ')})`
            + `。**この検査はいま何も見ていません**${why}`);
          continue;
        }
      }
      const hitsAll = [];
      for (const f of (c.files || [])) {
        const src = read(f);
        if (!src) continue;
        src.split('\n').forEach((line, i) => {
          if (OK.test(line) || (allow && allow.test(line))) return;
          const t = line.trim();
          if (t.startsWith('*') || t.startsWith('//') || t.startsWith('/*')) return;
          const n = (c.names || []).filter((nm) => line.includes(`'${nm}'`)).length;
          /* ★【分岐に見える行】だけを咎める。名前が並んでいるだけの一覧(選択肢の配列・
           * 行末のコメント)まで落とすと誤検出が増え、誤検出が増えると検査ごと外される。 */
          if (n >= (c.min || 2) && new RegExp(c.branch || 'includes\\(|===|!==').test(line))
            hitsAll.push(`${f}:L${i + 1}(${n}社)`);
        });
      }
      if (hitsAll.length) problems.push(`${name}: 表の外に判定が散らばっています(${hitsAll.length}件) ── ` + hitsAll.slice(0, 6).join(' / ') + why);
      else notes.push(`${name}: 表の外に散らばった判定は無し`);
      continue;
    }
    if (c.kind === 'perSection') {
      /* 【節ごとに、決めた1行があること】(2026-08-22)。
       *
       * 決定記録(ADR等)は書いた瞬間から増え、**古い決定と現在の決定が同じ見た目で並ぶ**。
       * 読む側(人もAI)は区別できないので、古い決定を現在の仕様として実装してしまう
       * ── 実際に、改定済みの決定が規範文書の「絶対規則」として生き残っていた。
       *
       * 宣言:
       *   file    … 決定記録のファイル
       *   section … 節の始まりの正規表現(例: ^### ADR-\d+)
       *   must    … その節の先頭に必ず在る行の正規表現(例: ^状態: )
       *   within  … 節の先頭から何行以内に在ればよいか(既定3)
       */
      const src = read(c.file);
      if (!src) { problems.push(`${name}: ${c.file} が読めません。**この検査はいま何も見ていません**${why}`); continue; }
      const lines = src.split(NL);
      const secRe = new RegExp(c.section);
      const mustRe = new RegExp(c.must);
      const within = Number(c.within || 3);
      const heads = [];
      lines.forEach((l, i) => { if (secRe.test(l)) heads.push(i); });
      if (!heads.length) {
        problems.push(`${name}: ${c.file} に節が1つも見つかりません(式: ${c.section})`
          + `。**この検査はいま何も見ていません**${why}`);
        continue;
      }
      const bad = heads.filter((i) => !lines.slice(i + 1, i + 1 + within).some((l) => mustRe.test(l)));
      if (bad.length) {
        problems.push(`${name}: ${bad.length}/${heads.length} 個の節に「${c.say || c.must}」がありません${why}\n      `
          + bad.slice(0, 8).map((i) => `${c.file}:L${i + 1} ${lines[i].slice(0, 50)}`).join('\n      '));
      } else notes.push(`${name}: ${heads.length} 個の節すべてに書いてある`);
      continue;
    }
    if (c.kind === 'citeLive') {
      /* 【もう現行でない決定を、現行として引いていないか】(2026-08-22)。
       *
       * 決定記録は履歴なので、古い節が残っているのは正しい。問題は
       * **それを「いまの規則」として引いている文書**の方である。
       * 実際に、改定済みの ADR-004 を根拠にした条文が規範文書の絶対規則に残り、
       * 実装(暗号化して保存している)と真正面から食い違っていた。
       *
       * 宣言:
       *   file    … 決定記録の正本
       *   idIn    … 正本の中で決定のIDを拾う式(例: ^### (ADR-\d+))
       *   deadIf  … その節がこの形なら【もう現行ではない】(例: ^状態: (改定済み|廃止))
       *   citedIn … 「いまの規則」を語る文書(ここで死んだIDを引いたら赤)
       *   cite    … 引用を拾う式(例: (ADR-\d+))
       * 逃げ道: 行末に guardian:ok(履歴として引くのは正当なので、必ず要る)
       */
      const src = read(c.file);
      if (!src) { problems.push(`${name}: ${c.file} が読めません。**この検査はいま何も見ていません**${why}`); continue; }
      const lines = src.split(NL);
      const idRe = new RegExp(c.idIn);
      const deadRe = new RegExp(c.deadIf);
      const within = Number(c.within || 3);
      const dead = new Map();          // id -> その節の状態行
      let all = 0;
      lines.forEach((l, i) => {
        const m = l.match(idRe);
        if (!m) return;
        all++;
        const near = lines.slice(i + 1, i + 1 + within).find((x) => deadRe.test(x));
        if (near) dead.set(m[1], near.trim());
      });
      if (!all) {
        problems.push(`${name}: ${c.file} に決定が1つも見つかりません(式: ${c.idIn})`
          + `。**この検査はいま何も見ていません**${why}`);
        continue;
      }
      const OK = new RegExp(cfg.okMarker || 'guardian:ok|lint-deps:ok');
      const citeRe = new RegExp(c.cite, 'g');
      const hits = [];
      for (const f of (c.citedIn || [])) {
        const t = read(f);
        if (!t) { problems.push(`${name}: ${f} が読めません。**この検査はいま何も見ていません**${why}`); continue; }
        t.split(NL).forEach((l, i) => {
          if (OK.test(l)) return;
          /* 同じ行が同じ決定を2度引いても1件。数を水増しすると、重さの感覚が狂う */
          const seen = new Set();
          for (const m of l.matchAll(citeRe)) {
            if (!dead.has(m[1]) || seen.has(m[1])) continue;
            seen.add(m[1]);
            hits.push(`${f}:L${i + 1} ${m[1]} は【${dead.get(m[1])}】`);
          }
        });
      }
      if (hits.length) {
        problems.push(`${name}: もう現行でない決定を、いまの規則として引いています(${hits.length}件)${why}\n      `
          + hits.slice(0, 8).join('\n      ')
          + `\n      → 条文を現在の決定に合わせるか、履歴として引くなら行末に guardian:ok と理由を書く`);
      } else notes.push(`${name}: 現行でない決定 ${dead.size} 件を、いまの規則として引いている所は無い`);
      continue;
    }
    if (c.kind === 'callArgs') {
      /* 【既定に任せてはいけない引数】(2026-08-21)。
       *
       * 省略できる引数を持つ関数は、**省略した側が既定の意味で静かに動く**。
       * 呼ぶ側が「今回はどちらか」を言わないと、書いた人の意図と逆の既定で通ってしまう
       * ── 例外も型エラーも出ないので、気づけるのは結果がおかしくなった後だけ。
       *
       * 宣言:
       *   call    … 関数名
       *   when    … その呼び出しのうち、どれを対象にするか(引数の並びに当てる正規表現・省略可)
       *   minArgs … 対象の呼び出しに最低いくつ引数が要るか
       *   probe   … 必ず当たるはずの見本(当たらなければ、検査自身を落とす)
       *   say     … 落ちたときに何を書き忘れたと言うか
       */
      const call = String(c.call);
      const when = c.when ? new RegExp(c.when) : null;
      if (c.probe != null) {
        const p = String(c.probe);
        if (!p.includes(call + '(') || (when && !when.test(p))) {
          problems.push(`${name}: **この検査は死んでいます**(見本に当たりません)。`
            + `関数: ${call} / 条件: ${c.when || '(無し)'} / 見本: ${p.slice(0, 60)}${why}`);
          continue;
        }
      }
      const esc = call.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const min = Number(c.minArgs);
      let seen = 0;
      const bad = [];
      let unreadable = false;
      for (const f of (c.files || [])) {
        const src = read(f);
        if (!src) { problems.push(`${name}: ${f} が読めません。**この検査はいま何も見ていません**${why}`); unreadable = true; continue; }
        src.split(NL).forEach((line, i) => {
          const t = line.trim();
          if (t.startsWith('*') || t.startsWith('//') || t.startsWith('/*')) return;
          const m = line.match(new RegExp(esc + '\\(([^;]*)'));
          if (!m) return;
          const args = m[1];
          if (when && !when.test(args)) return;
          seen++;
          /* 引数の数を数える(丸括弧が閉じる所まで) */
          let depth = 1, n = 1;
          for (const ch of args) {
            if (ch === '(' || ch === '[' || ch === '{') depth++;
            else if (ch === ')' || ch === ']' || ch === '}') { depth--; if (!depth) break; }
            else if (ch === ',' && depth === 1) n++;
          }
          if (n < min) bad.push(`${f}:L${i + 1}`);
        });
      }
      if (unreadable) continue;
      /* ★対象が1つも無いのは【安全になった】のではなく【見ていない】。
       * 呼び出しが消えたのなら、この検査も宣言から外す判断を人がすること。 */
      if (!seen) {
        problems.push(`${name}: ${call}( の対象の呼び出しが1つも見つかりません`
          + `(名前が変わったか、呼ばれなくなった)。**この検査はいま何も見ていません**${why}`);
        continue;
      }
      if (bad.length) problems.push(`${name}: ${call} の呼び出しで【${c.say || '省略できない引数'}】の引数を省いています ── `
        + bad.join(' / ') + why);
      else notes.push(`${name}(${call} の呼び出し ${seen} 箇所は書き分けてある)`);
      continue;
    }
    problems.push(`${name}: 知らない検査の種類 "${c.kind}"(same / sameMap / sameSet / shape / onlyIn / noInline / callArgs / perSection / citeLive のどれか)`);
  } catch (e) {
    problems.push(`${name} の検査中にエラー: ${String(e.message).slice(0, 160)}`);
  }
}

/* ---------- C. HTMLのセレクタ参照が実在するか ----------
 * JSが $('id') や querySelector('.cls') で掴もうとしている相手が、そのファイルに無い
 * = 動かない機能の芽。エラーも出ずに黙って何もしないので、人の目では見つからない。 */
const selArg = argv.indexOf('--selectors');
const selFiles = selArg >= 0 ? argv.slice(selArg + 1) : (cfg.selectors || []);
for (const f of selFiles) {
  const src = selArg >= 0 ? (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '') : read(f);
  if (!src) { notes.push(`セレクタ照合: ${f} が読めないので飛ばしました`); continue; }
  const classes = new Set(); const ids = new Set();
  for (const m of src.matchAll(/class=\\?"([^"\\]+)\\?"/g)) for (const c of m[1].split(/\s+/)) if (c) classes.add(c);
  for (const m of src.matchAll(/classList\.add\('([^']+)'\)/g)) classes.add(m[1]);
  for (const m of src.matchAll(/className\s*=\s*'([^']+)'/g)) for (const c of m[1].split(/\s+/)) classes.add(c);
  for (const m of src.matchAll(/id=\\?"([^"\\]+)\\?"/g)) ids.add(m[1]);
  for (const m of src.matchAll(/\.id\s*=\s*'([^']+)'/g)) ids.add(m[1]);
  const bad = [];
  const lines = src.split('\n');
  /* 「無くてもよい」参照は行末に印を書けば黙る(nullガード前提の任意要素用)。
   * ★この逃げ道は必須。無いと、正当な例外のために検査ごと外される。 */
  const OK = new RegExp(cfg.okMarker || 'guardian:ok|lint-deps:ok');
  lines.forEach((line, i) => {
    if (OK.test(line)) return;
    for (const m of line.matchAll(/\$\('([A-Za-z][\w-]*)'\)/g)) if (!ids.has(m[1])) bad.push(`L${i + 1} $('${m[1]}') (id実在せず)`);
    for (const m of line.matchAll(/querySelector(?:All)?\('\.([\w-]+)'\)/g)) if (!classes.has(m[1])) bad.push(`L${i + 1} .${m[1]} (class実在せず)`);
  });
  if (bad.length) problems.push(`${f}: 実在しない参照 ${bad.length}件 ── ` + bad.slice(0, 8).join(' / '));
  else notes.push(`${f}: セレクタの参照は全て実在`);
}

/* ---------- D. max を下げる(--tighten) ----------
 * 【一方通行を、人の手作業にしない】(2026-08-21)
 *
 * onlyIn の max は「下げる方向にしか動かさない数字」── 口を寄せて減らしたときに下げて初めて、
 * 改善が**後戻りできない形**で残る。だが下げるのはこれまで人の作業で、
 * 「減ったので下げられます」と出続けたまま**誰も下げなかった**(実際に2件放置されていた)。
 * 下げ忘れた分だけ、また口を増やせる余地が残っている ── ラチェットの歯が抜けている状態である。 */
if (argv.includes('--tighten')) {
  console.log('');
  if (!cfgPath) console.log('  ! 宣言(guardian.config.json)が見つからないので、下げられません');
  else if (!loose.length) console.log('  ✓ 下げられる max はありません(全部ぴったり)');
  else {
    let text = read(cfgPath);
    const done = [];
    for (const t of loose) {
      const at = text.indexOf(`"name": "${t.name}"`);
      if (at < 0) { console.log(`  ! ${t.name}: 宣言の中に見つかりません(手で下げてください)`); continue; }
      const rest = text.slice(at);
      const m = rest.match(/"max"\s*:\s*(\d+)/);
      if (!m || Number(m[1]) !== t.max) { console.log(`  ! ${t.name}: max が読めません(手で下げてください)`); continue; }
      text = text.slice(0, at) + rest.slice(0, m.index) + `"max": ${t.hits}` + rest.slice(m.index + m[0].length);
      done.push(`${t.name}: ${t.max} → ${t.hits}`);
    }
    if (done.length) {
      fs.writeFileSync(path.join(ROOT, cfgPath), text, 'utf8');
      console.log(`  ✓ ${cfgPath} の max を下げました(${done.length}件)`);
      for (const d of done) console.log('      ' + d);
    }
  }
}

/* ---------- 結果 ---------- */
  console.log('');
/* ★【逃げ道の乱用に歯止めを置く】(2026-08-29 外部評価の指摘)。
 *
 *   誤検出を黙らせる逃げ道(guardian:ok)は**必ず要る** ── 逃げ道の無い検査は、
 *   1件の誤検出で検査ごと外されるから。だが逃げ道は、**AIがエラーを消す最短経路**でもある。
 *   「直す」より「黙らせる」ほうが速いので、放っておけば増える一方になる。
 * ★実測(2026-08-29): この現場で49件。**全部に理由が書かれていた**ので乱用ではなかった。
 *   問題は数ではなく、**歯止めが1つも無かった**こと ── 増えても誰も気づかない。
 * ★2つ置く:
 *   ① 理由の無い逃げ道は**落とす**(黙らせるなら、なぜ黙らせるかを書かせる)
 *   ② 数を宣言の okMax と突き合わせ、**増えたら落とす**(--tighten で下げる。ラチェット)
 *   ★上限を決め打ちしない ── いまの数を下限にして、**そこから増えないこと**だけを守る。 */
{
  const 逃げ道 = [];
  const 理由なし = [];
  const 見る = (dir) => {
    let es = [];
    try { es = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
    for (const e of es) {
      if (e.name.startsWith('.') || e.name === 'node_modules') continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { 見る(full); continue; }
      if (!/\.(ts|tsx|js|mjs|cjs|jsx|html|gs|py|go|rb)$/.test(e.name)) continue;
      let s = "";
      try { s = fs.readFileSync(full, "utf8"); } catch (_) { continue; }
      s.split(/\r?\n/).forEach((line, n) => {
        const m = line.match(/guardian:ok(.*)$/);
        if (!m) return;
        逃げ道.push(path.relative(ROOT, full).split(path.sep).join("/") + ":L" + (n + 1));
        /* 理由 = 印のあとに続く文。閉じ記号だけなら理由なし */
        const 後 = String(m[1]).replace(/[*/>"'` ]+$/, "").trim();
        if (後.length < 4) 理由なし.push(path.relative(ROOT, full).split(path.sep).join("/") + ":L" + (n + 1));
      });
    }
  };
  for (const w of (cfg.watch || [])) 見る(path.join(ROOT, w));

  if (理由なし.length) {
    problems.push("★逃げ道(guardian:ok)に理由が書かれていません(" + 理由なし.length + "件): "
      + 理由なし.slice(0, 5).join(" / ")
      + "。**黙らせるなら、なぜ黙らせるかを書くこと** ── 理由の無い逃げ道は、次の人が外せません");
  }
  const 上限 = Number(cfg.okMax);
  if (!Number.isFinite(上限)) {
    notes.push("逃げ道は " + 逃げ道.length + "件(宣言に okMax が無いので見張っていません"
      + " ── `check.mjs --tighten` で今の数を上限として置けます)");
  } else if (逃げ道.length > 上限) {
    problems.push("★逃げ道(guardian:ok)が増えました: " + 逃げ道.length + "件(上限 " + 上限 + ")。"
      + "**黙らせる前に、直せないかを見ること** ── 増やすなら宣言の okMax を人が上げる");
  } else {
    notes.push("逃げ道は " + 逃げ道.length + "件(上限 " + 上限 + " を超えていない)"
      + (逃げ道.length < 上限 ? " ── `--tighten` で下げられます" : ""));
  }
  /* --tighten: 減っていれば上限を実数まで下げる(一方通行) */
  if (argv.includes('--tighten') && (!Number.isFinite(上限) || 逃げ道.length < 上限)) {
    const c2 = JSON.parse(fs.readFileSync(path.join(ROOT, cfgPath), "utf8"));
    c2.okMax = 逃げ道.length;
    c2._okMax = "逃げ道(guardian:ok)の上限。増やすときは人が上げる ── 黙らせるのは直すより速いので、放っておくと増える一方になる";
    fs.writeFileSync(path.join(ROOT, cfgPath), JSON.stringify(c2, null, 2) + "\n");
    notes.push("逃げ道の上限を " + 逃げ道.length + " に下げました(一方通行)");
  }
}
for (const n of notes) console.log('  ✓ ' + n);
if (problems.length) {

  for (const p of problems) console.log('  ✗ ' + p);
  console.log(`\n地図・正本の検査: ${problems.length}件のずれ`);
  process.exit(1);
}
console.log('\n地図・正本の検査: ずれなし');
