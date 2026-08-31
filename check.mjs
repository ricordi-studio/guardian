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
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
/* ★この道具が置かれている場所(= 塊の中)。A5 が neighbors に答えさせるために要る */
const KIT = path.dirname(fileURLToPath(import.meta.url));
/* ★地図の【コード柵の中】を落とす ── ここが正本(4箇所に写していた。39条)。
 *   柵の中は「例」であって接点ではない。`hooks/codemap.js` も同じ物差しで読む。 */
const 柵を落とす = (t) => String(t || '').replace(/```[\s\S]*?```/g, '');

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
const 知っている口 = ['--口一覧', '--片方だけ', '--名指しされていない', '--宣言の外', '--呼び先が地図に無い', '--逃げ道の理由', '--予想', '--root', '--selectors', '--tighten'];
const 値を取る口 = { '--root': 1, '--予想': 1 };
const 残りを全部取る口 = ['--selectors'];
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
    const mapBody = 柵を落とす(map);
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
    const 生成物 = [];
    const mapBody2 = 柵を落とす(map);
    /* 拡張子は白名簿。`chat.manner` のような【プロパティの道筋】をファイルと誤解しないため */
    const EXT = /\.(ts|tsx|js|mjs|cjs|html|htm|gs|json|jsonc|sql|md|css|webmanifest|yml|yaml|png|webp|jpg|svg|mp4)$/;
    for (const m of mapBody2.matchAll(/`([A-Za-z0-9_./-]+\/[A-Za-z0-9_.-]+|[A-Za-z0-9_-]+\.[a-z0-9]{2,12})`/g)) {
      if (!EXT.test(m[1])) continue;
      /* ★`.guardian/` の下は【道具が走ると生まれる物】であって、原本ではない。
       *   受領証(pulled.json)は取り直した現場にしか生まれず、正本には一生現れない。
       *   在ることを求めると、正本が自分の地図で差し戻される(2026-08-31 に実際そうなった)。
       * ★ただし黙って飛ばさない ── 何件飛ばしたかを下に出す(46条: 見えない例外は作らない)。 */
      if (m[1].startsWith(String.fromCharCode(46) + "guardian/")) { 生成物.push(m[1]); continue; }
      const p = m[1];
      if (miss.includes(p)) continue;
      if (!bases.some((b) => fs.existsSync(path.join(ROOT, b, p)))) miss.push(p);
    }
    if (miss.length) {
      problems.push(`地図が名指しするファイルが在りません(${miss.length}件): ${miss.join(', ')}`);
      problems.push(`  → 撤去したなら ${MAP_PATH} からも消す(掟5)。置き場所を変えたなら地図も追従する。`);
    } else notes.push('地図が名指しするファイルは全て実在');
    if (生成物.length) notes.push(`地図が名指す .guardian/ の ${生成物.length} 件は生成物なので実在を測っていません: ${生成物.join(', ')}`);
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
    const 本文 = 柵を落とす(map);
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
    /* ★【空でも、口は答えて終わる】(2026-08-31、配布先の実測)。
     *   直す前はこの口が「片方だけが1件以上あるとき」の中に在った。
     *   配布先が42件を全部直した直後に叩いたら、**口が何もせず通常の出力が出た** ──
     *   `wc -l` で数えて **「42 → 57 に悪化した」** と読みかけている。
     *   ★**直したら増えたように見える**、いちばん焦る形である。
     * ★機械が読む口は、**結果が空でも空を返して終わる**。0件は0行であって、別の出力ではない。 */
    /* ★【全部の名前を出す口】(2026-08-31、配布先の実測から)。
     *
     *   直す前は先頭5件だけを出し、残りは「ほか N 件」だった。
     *   配布先が42件を直そうとして**自分で数え直したら、3回とも違う数**になった
     *   (26 → 20 → 42)── 私の式と機械の式が違っていたためである
     *   (`index.ts` のようなスラッシュ無しの名前を、私はファイル扱いにしていた)。
     * ★**その道具が数えたものは、その道具から取り出せるようにする。**
     *   取り出せないと、直す人は**式を推測して数え直す**ことになる ──
     *   今夜さんざん見た「綴りで測る」が、数え方の側に出た形である。
     * ★notes は先頭5件のままにする(7条・毎回42行は読まれなくなる)。 */
    if (process.argv.includes("--片方だけ")) {
      if (片方だけ.length) process.stdout.write(片方だけ.join(NL) + NL);
      process.exit(0);          /* 0件は0行。空でも別の出力にしない */
    }
    if (片方だけ.length) {
      /* ★母数を出す(2026-08-31、配布先の実測 ── 「16箇所直した」に全体が無く、17箇所目が3日間開いていた)。
       *   ★『N件』だけでは進捗にならない。★★『地図の項 M 件のうち N 件』で初めて、
       *   ★★★直した後に残りが見え、母数そのものが増えたことにも気づける。 */
      notes.push('地図の項 ' + (塊.length - 1) + ' 件のうち、片方しか機械に見えていない項が ' + 片方だけ.length + '件: '
        + 片方だけ.slice(0, 5).join(' / ')
        + (片方だけ.length > 5 ? ' ほか' + (片方だけ.length - 5) + '件' : '')
        + ' ── 実名もファイルも**バッククォートで囲まないと機械には無いのと同じ**です(落としません)');
    } else notes.push('地図の各項は、ファイルと実名の両方が機械に見えている');
  }

  /* ---------- A5. 【この現場の実装のうち、地図が名指ししている割合】を出す
   *   (2026-08-31、配布先の実測から) ----------
   *
   * ★配布先の言葉: **「42」という数が効いたのは、数ではなく
   *   『**片方しか見えていない**』という言葉の方だった。数字だけなら流していた。」**
   *   そして「見本 N 項で確認」のような**こちら側の数**では、読む人は何とも衝突できない ──
   *   衝突できるのは**その現場自身の数**である(「40個のうち14個」を見て多い/少ないと感じられる)。
   * ★だから【言葉】と【その現場の数】を対にして出す。落とさない(7条・A4 と同じ理由)。
   * ★定義の拾い方は写さない ── `neighbors.mjs --定義一覧` に**答えさせる**(39条)。
   *   写すと、片方だけ直る日が来る。実際 9.51 で型の定義を足したのは neighbors 側だけである。
   * ★測れないときは黙らない ── 「見ていません」と出す。 */
  {
    const r = spawnSync(process.execPath, [path.join(KIT, "neighbors.mjs"), "--定義一覧"],
      { cwd: ROOT, encoding: "utf8", windowsHide: true });
    const 出 = String(r.stdout || "").trim();
    /* ★【答えの形】まで見る(2026-08-31、この検査の双子で出た)。
     *   口を殺すと --定義一覧 は既定動作(--list)に落ち、**出口0で別のものを出す**。
     *   出口と「空でないこと」だけを見ていたので、**0個のうち0個(0%)**という
     *   もっともらしい嘘を出した ── 今夜の「無音より質が悪い」形そのもの。
     * ★★配布先の指摘: **「その現場では正しく見える値」が返ったときこそ、形を疑う。**
     *   まっさらな現場では 0% が正解でもあるので、**壊れた顔と正しい顔が同じ**になる。
     * ★だから【名前が1つも取れないこと】を門にする ── 区切りの有無と別々に置くと、
     *   片方が死にコードになる(39条)。名前が取れなければ、形が違っても空でも同じ扱い。 */
    /* ★分母から【塊そのもの】を外す(2026-08-31、配布先の実測)。
     *
     *   配布先の宣言(sources)には guardian/ が入っている ── 地図の「修繕の仕組み」の項が
     *   塊の記号を名指ししているので、実在照合(A1)には要るからである。
     *   ★ところが A5 の分母に入ると、**塊を1版上げるたびにこの現場の数が動く**。
     *     実測(配布先): 9.59 → 9.60 で器を1行も触っていないのに実装が +1 になった。
     *   ★A5 が見たいのは【この現場の実装に地図が追いついているか】であって、塊の版ではない。
     * ★ただし**正本では外さない** ── 正本では塊そのものがこの現場の実装だからである。
     *   (KIT と ROOT が同じかどうかで見分ける。同じなら外さない) */
    const 塊は別 = path.resolve(KIT) !== path.resolve(ROOT);
    const 外した = [];
    const 名前 = new Set();
    for (const 行 of 出.split(NL)) {
      const t = 行.split(String.fromCharCode(9));
      if (t.length < 2 || !t[1]) continue;
      if (塊は別) {
        const 場所 = path.resolve(ROOT, t[0]);
        if (場所.startsWith(path.resolve(KIT) + path.sep)) { 外した.push(t[1]); continue; }
      }
      名前.add(t[1]);
    }
    /* ★測れなかったときも、口は答えて終わる(2026-08-31)。
     *   ただし**空(0行)と「測れなかった」を同じ顔にしない** ── 出口で分ける。
     *   0件は 0行・出口0 / 測れなかったは 0行・出口2(この塊の【不明】と同じ符号)。 */
    if (process.argv.includes("--名指しされていない") && (r.status !== 0 || !名前.size)) {
      process.exit(2);
    }
    if (r.status !== 0 || !名前.size) {
      notes.push("この現場の実装のうち、地図が名指ししている割合は**見ていません**"
        + "(neighbors.mjs --定義一覧 が定義を1つも答えません ── まだ何も書いていない現場か、口が答えていないかのどちらかです)");
    } else {
      const 地図に在る = new Set();
      for (const m of 柵を落とす(map).matchAll(/`([^`\n]+)`/g)) {
        const t = m[1].trim();
        if (名前.has(t)) 地図に在る.add(t);
        const 括弧の前 = t.split("(")[0].trim();
        if (名前.has(括弧の前)) 地図に在る.add(括弧の前);
      }
      /* ★【中身を取り出す口】── 9.65 で自分が作った規律を、自分の計器にも当てる。
       *   「数を出す計器には、その中身を取り出す口を対で置く」。
       *   A5 は「N 個のうち M 個」と言うだけで、**どれが名指しされていないかを言わなかった**。
       *   数だけを出すのは「直せ」と言って、どこを直すかを言わないのと同じである。
       * ★画面には出さない(1000行を超える現場が在る・7条)。口を叩いた人にだけ出す。 */
      if (process.argv.includes("--名指しされていない")) {
        const 出る = [...名前].filter((n) => !地図に在る.has(n)).sort();
        if (出る.length) process.stdout.write(出る.join(NL) + NL);
        process.exit(0);        /* 0件は0行。空でも別の出力にしない */
      }
      const 割 = Math.round((地図に在る.size / 名前.size) * 100);
      notes.push("この現場の実装 " + 名前.size + " 個のうち、**地図が名指ししているのは "
        + 地図に在る.size + " 個**(" + 割 + "%)"
        + " ── 地図は索引なので全部を名指しする必要はありません。**この数が下がり続けるなら、"
        + "地図が実装に追いついていません**(落としません)");
      if (外した.length) notes.push("うち塊(guardian/)の " + 外した.length + " 個は数えていません ── 塊の版で揺れないようにするため");
    }
  }
}

/* ---------- A6. 【検査が読んでいないコード】を数える(2026-08-31、配布先の実測) ----------
 *
 * ★実際に起きた: 配布先の `worker/src/foxgod/`(**10ファイル・4777行**)が、
 *   地図にも `sources` にも**1文字も無かった**。器からは呼ばれている。
 *   ★**宣言に無いものは、どの検査にも掛からない。**そして
 *     **言っていないことは、外からは「問題なし」に見える** ── 11時間ぜんぶ緑だった。
 * ★今夜の「壊れ方」のいちばん外側:
 *   黙る < 鳴りすぎる < 正しく見える値 < 関係ない口が黙る < ★**検査が存在すら知らない**
 *
 * ★★数え方は【2つ】に分ける ── 宣言の形が2種類あるからである:
 *     ① どの【場所】の宣言にも入っていない(watch / neighbors.code / selectors / map の外)
 *     ② 場所には入っているが、**`sources` に無い** ← ★配布先が踏んだのはこちら
 *   `sources` は**ファイルの一覧**で、B の検査(不変条件・固有名・重複)はそこしか読まない。
 *   だから「見張っている場所の中に在るのに、検査は一度も開いていない」が起きる。
 * ★落とさない(7条)── 在って当然のものは多い(試験・生成物・持ち込み)。
 *   **数と、取り出す口だけ**を置く(9.72 の3段の1段目と2段目)。判定は作らない。
 * ★配布先では**塊(guardian/)を数えない** ── 道具は道具の都合で増えるので(A5 と同じ理由)。 */
{
  let 管理下 = null;   /* try の外に置く ── 締めの1行がここを読む */
  let 落とした宣言外 = 0, 落とした無視 = 0;   /* ★この検査だけのもの(検査どうしで変数を借りない) */
  const 場所の外 = [];
  const 一覧の外 = [];
  try {
    const 要らない = /(^|[\\/])(\.git|node_modules|dist|build|coverage|\.guardian|\.next|out|vendor)([\\/]|$)/;
    const コード = /\.(m?js|cjs|ts|tsx|jsx|gs|py|rb|go|rs|java|php|sh)$/i;
    const 塊は別 = path.resolve(KIT) !== path.resolve(ROOT);
    /* ★宣言で外した場所(neighbors.skip_dirs)は最初から数えない ── そこは「見ない」と宣言済みである。
     *   実測: これを入れる前は 正本で 57件 出て、ほぼ全部が research/lab の実験用の写しだった。 */
    const 外した場所 = ((cfg.neighbors && cfg.neighbors.skip_dirs) || []).map((x) => path.resolve(ROOT, x));
    /* ★git が「管理しない」と言っているものは数えない(2026-08-31、配布先の実測)。
 *
     *   実測(配布先): 142件のうち **115件が `worker/.wrangler`**(ビルドの一時領域)だった。
     *   **本物27件が、一時生成物に 4:1 で埋もれていた**。
     * ★`.gitignore` は**その現場が「管理しない」と宣言したもの**なので、
     *   「宣言に無いものを数える」計器から見れば**構造的に外れている**。
     * ★読み方は git に聞く ── `.gitignore` を自分で解釈しない(入れ子・否定・除外規則が在る)。
     *   `git ls-files --cached --others --exclude-standard` = **管理しているもの + まだ管理していないが無視もされていないもの**。
     * ★git が答えなければ**絞らない**。そして**絞らなかったと言う** ── 黙って全部数えると、
     *   その現場では「一時領域だらけ」に見えて、本物が埋もれる(7条)。 */
    /* git に聞く(下の 管理下 を埋める) */
    {
      const r = spawnSync('git', ['-C', ROOT, 'ls-files', '--cached', '--others', '--exclude-standard'],
        { encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
      if (r.status === 0) {
        管理下 = new Set(String(r.stdout || "").split(NL).map((x) => x.trim()).filter(Boolean)
          .map((x) => path.resolve(ROOT, x)));
      }
    }
    const 場所 = new Set();
    const 足す = (x) => { if (typeof x === "string" && x) 場所.add(path.resolve(ROOT, x)); };
    for (const x of (cfg.watch || [])) 足す(x);
    for (const x of ((cfg.neighbors && cfg.neighbors.code) || [])) 足す(x);
    for (const x of (cfg.selectors || [])) 足す(x);
    足す(cfg.map);
    const 読む一覧 = new Set((cfg.sources || []).map((x) => path.resolve(ROOT, x)));
    /* ★落とした側も数える(2026-08-31、配布先の実測)。
     *   向こうの器は「相手が名乗った」も「実測で落ちた」も出していたのに、
     *   ★【実測は通ったのに、器が棚を持っていないので出さなかった】だけを出していなかった。
     *   ★★名乗らせるだけでは足りない ── ★落とした側も出さないと、落ちたことが見えない。
     *   この検査も同じで、分母から黙って外していた(⑥の3段目=母数)。 */
    const 場所に在る = (f) => {
      for (const d of 場所) if (f === d || f.startsWith(d + path.sep)) return true;
      return false;
    };
    const 中のコードを数える = (dir) => {
      let n = 0;
      let es = [];
      try { es = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return 0; }
      for (const en of es) {
        const full = path.join(dir, en.name);
        if (要らない.test(full)) continue;
        if (en.isDirectory()) { n += 中のコードを数える(full); continue; }
        if (コード.test(en.name)) n++;
      }
      return n;
    };
    const 歩く = (dir) => {
      for (const en of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, en.name);
        if (要らない.test(full)) continue;
        if (外した場所.some((d) => full === d || full.startsWith(d + path.sep))) {
          /* ★ここが【落とした側】── 外すのが場所(ディレクトリ)なら、中まで数えないと 0 になる */
          if (en.isDirectory()) 落とした宣言外 += 中のコードを数える(full);
          else if (コード.test(en.name)) 落とした宣言外++;
          continue;
        }
        if (塊は別 && (full === path.resolve(KIT) || full.startsWith(path.resolve(KIT) + path.sep))) continue;
        if (en.isDirectory()) { 歩く(full); continue; }
        if (!コード.test(en.name)) continue;
        if (管理下 && !管理下.has(full)) { 落とした無視++; continue; }   /* git が無視しているもの */
        const 相対 = path.relative(ROOT, full).split(path.sep).join("/");
        if (!場所に在る(full)) 場所の外.push(相対);
        else if (読む一覧.size && !読む一覧.has(full)) 一覧の外.push(相対);
      }
    };
    歩く(ROOT);
    場所の外.sort(); 一覧の外.sort();
  } catch (e) {
    notes.push("検査が読んでいないコードが在るかは**見ていません**(" + String(e && e.message).slice(0, 80) + ")");
  }
  if (process.argv.includes("--宣言の外")) {
    const 出る = [...場所の外.map((x) => "場所の外" + String.fromCharCode(9) + x),
      ...一覧の外.map((x) => "sourcesの外" + String.fromCharCode(9) + x)];
    if (出る.length) process.stdout.write(出る.join(NL) + NL);
    process.exit(0);        /* 0件は0行 */
  }
  const 言う = (名, 一覧, 説明) => {
    if (!一覧.length) return;
    notes.push("**" + 名 + " が " + 一覧.length + " ファイル**あります: "
      + 一覧.slice(0, 5).join(" / ") + (一覧.length > 5 ? " ほか" + (一覧.length - 5) + "件" : "")
      + " ── " + 説明 + "(落としません。中身は `--宣言の外` で出せます)");
  };
  言う("どの場所の宣言にも入っていないコード", 場所の外,
    "★**宣言に無いものは、どの検査にも掛かりません**(全部が緑でも、そこは見ていません)");
  言う("見張っている場所に在るのに `sources` に無いコード", 一覧の外,
    "★**B の検査(不変条件・固有名・重複)は `sources` しか読みません** ── そこは一度も開かれていません");
  if (落とした宣言外 || 落とした無視) {
    const 内訳 = [];
    if (落とした宣言外) 内訳.push("宣言(neighbors.skip_dirs)で外した " + 落とした宣言外 + " ファイル");
    if (落とした無視) 内訳.push("git が無視している " + 落とした無視 + " ファイル");
    notes.push("★この数は、" + 内訳.join(" / ") + " を**分母から外して**出しています ── "
      + "**外したものは、どの検査にも掛かりません**(落としません。外す先を変えたいなら宣言を直すこと)");
  }
  if (管理下 === null) notes.push("★git が答えないので、**無視されているファイルも数えています**"
    + "(一時領域や生成物が混ざります ── 本物がそこに埋もれます)");
  if (!場所の外.length && !一覧の外.length) notes.push("この現場のコードは、全部どこかの宣言に入っている");
}
/* ---------- A7. 【地図が名指しするファイルが呼んでいるのに、地図に無いファイル】
 *   (2026-08-31、配布先の実測) ----------
 *
 * ★実際に起きた: 配布先の地図に「見立て」の項が在り、
 *   接点として `worker/src/index.ts` が**書いてあった**。だが**その index.ts が呼んでいる
 *   `worker/src/foxgod/`(10ファイル・4777行)は、地図のどこにも無かった**。
 *   ★**項は在る。実名も在る。ファイルも在る。それでも接点が足りない。**
 *     A4 は「片方だけ」を探すので出ない。A5 は数には入っている。
 *     **A6(宣言の外)だけが出した** ── だが A6 は `sources` の話で、地図の話ではない。
 * ★だからここは【1歩だけ辿る】── 地図に載っているファイルが **import / require している先**が、
 *   地図のどこにも載っていないなら、その1件を出す。**1歩だけ**にするのは、
 *   2歩3歩と辿ると器の全部が出てきて、7条(鳴りすぎ)に落ちるからである。
 * ★見るのは**相対の呼び先だけ**(外の部品は地図に載せる対象ではない)。
 *   git が無視しているものも見ない(A6 と同じ物差し)。
 * ★落とさない ── 索引に全部は載らない。**数と、取り出す口だけ**(9.72 の3段)。 */
{
  const 呼び先 = [];
  try {
    const 地図の中身 = 柵を落とす(map);
    const 地図のファイル = new Set();
    for (const m of 地図の中身.matchAll(/`([^`\n]+)`/g)) {
      const t = m[1].trim();
      if (/^[\w.@/-]+$/.test(t) && /\.[a-z0-9]+$/i.test(t)) {
        for (const base of ["", ...(cfg.pathBases || [])]) {
          const f = path.resolve(ROOT, base, t);
          if (fs.existsSync(f)) { 地図のファイル.add(f); break; }
        }
      }
    }
    let 管理下 = null;
    {
      const r = spawnSync('git', ['-C', ROOT, 'ls-files', '--cached', '--others', '--exclude-standard'],
        { encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
      if (r.status === 0) 管理下 = new Set(String(r.stdout || "").split(NL)
        .map((x) => x.trim()).filter(Boolean).map((x) => path.resolve(ROOT, x)));
    }
    const 拡張 = ["", ".ts", ".tsx", ".js", ".mjs", ".cjs", ".jsx"];
    const 解く = (元, 先) => {
      const 基 = path.resolve(path.dirname(元), 先);
      for (const e of 拡張) { const f = 基 + e; if (fs.existsSync(f) && fs.statSync(f).isFile()) return f; }
      for (const e of 拡張.slice(1)) { const f = path.join(基, "index" + e); if (fs.existsSync(f)) return f; }
      return null;
    };
    /* ★A7 の中で【見張っている場所】を作る ── A6 のものは A6 の中に在る(39条の裏)。
     *   同じ形を2つ持つのは写経だが、**片方の中の変数を隣から読む方が危ない** ──
     *   実際 9.76 でそれをやって、検査が黙って死んだ。ここは見える形で分けておく。 */
    const 場所2 = new Set();
    {
      const 足す2 = (x) => { if (typeof x === "string" && x) 場所2.add(path.resolve(ROOT, x)); };
      for (const x of (cfg.watch || [])) 足す2(x);
      for (const x of ((cfg.neighbors && cfg.neighbors.code) || [])) 足す2(x);
      for (const x of (cfg.selectors || [])) 足す2(x);
    }
    const 場所に在る = (f) => {
      for (const d of 場所2) if (f === d || f.startsWith(d + path.sep)) return true;
      return false;
    };
    const 見た = new Set();
    for (const f of 地図のファイル) {
      let t = "";
      try { t = fs.readFileSync(f, "utf8"); } catch (_) { continue; }
      for (const m of t.matchAll(/(?:from|import|require)\s*\(?\s*["\x27](\.[^"\x27]+)["\x27]/g)) {
        const 先 = 解く(f, m[1]);
        if (!先 || 地図のファイル.has(先)) continue;
        if (管理下 && !管理下.has(先)) continue;
        const 鍵 = path.relative(ROOT, 先).split(path.sep).join("/");
        if (見た.has(鍵)) continue;
        見た.add(鍵);
        /* ★呼び先が【見張っている場所の中か外か】も出す(2026-08-31、見本で見つけた)。
         *   形の違う見本(HTML と vendor が在る現場)に当てたら、
         *   `src/main.js → vendor/lib.js`(外から持ってきた部品)が出た。
         *   ★**それは地図に載せる対象ではない** ── だが「呼んでいる」のは事実なので消さない。
         *   ★消すのではなく**印を付ける**: 場所の中なら直す対象、外なら見るだけ。
         *   (消すと、その現場では「呼び先の穴が無い」に見える ── 今夜の「黙る」と同じ形) */
        const 中か = 場所に在る(先) ? "場所内" : "場所外";
        呼び先.push(path.relative(ROOT, f).split(path.sep).join("/") + String.fromCharCode(9) + 鍵
          + String.fromCharCode(9) + 中か);
      }
    }
    呼び先.sort();
  } catch (e) {
    notes.push("地図の呼び先は**見ていません**(" + String(e && e.message).slice(0, 80) + ")");
  }
  if (process.argv.includes("--呼び先が地図に無い")) {
    if (呼び先.length) process.stdout.write(呼び先.join(NL) + NL);
    process.exit(0);        /* 0件は0行 */
  }
  const 呼び先の内 = 呼び先.filter((x) => x.endsWith("場所内"));
  const 呼び先の外 = 呼び先.filter((x) => x.endsWith("場所外"));
  if (呼び先.length) {
    notes.push("**地図に載っているファイルが呼んでいるのに、地図に無いファイルが " + 呼び先.length + " 件**あります: "
      + 呼び先.slice(0, 3).map((x) => { const t = x.split(String.fromCharCode(9)); return t[0] + " → " + t[1] + "(" + t[2] + ")"; }).join(" / ")
      + (呼び先.length > 3 ? " ほか" + (呼び先.length - 3) + "件" : "")
      + (呼び先の外.length ? "(うち " + 呼び先の外.length + " 件は見張っている場所の外 ── 外から持ってきた部品なら、地図に載せる対象ではありません)" : "")
      + " ── ★**項も実名もファイルも在るのに、接点が足りない**形です"
      + "(A4 も A5 も出しません)。索引に全部は載らないので、落としません。中身は `--呼び先が地図に無い` で出せます");
  } else notes.push("地図に載っているファイルの呼び先は、全部どこかの項に載っている");
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

/* ★【見本(probe)を持たない検査を数える】(2026-08-31、配布先の実測)。
 *
 * ★配布先が、自分で足した検査の pattern を「絶対に当たらない式」に差し替えたら、
 *   ★★見本が在ったので **この検査は死んでいます** と出た。**見本が無ければ、
 *   死んだ式が「0箇所」と★緑を出し続ける。**
 * ★★配布先の言葉:「①〜④は全部【赤】の話で、★⑤だけが【緑】の話でした。
 *   そして私が2回『守られている』と間違えたのは、全部★緑を信じたときでした。」
 * ★★★この塊は 2026-08-21 から probe を持っているが、★**任意の欄**だった ──
 *   書かなければ、何も言わずに素通りする。**任意の欄は、書かれない。**
 * ★判定にはしない(見本を書けない検査も在る)。★★数だけ出す ── 落とさない。 */
{
  const 見本が要る種類 = new Set(["onlyIn", "callArgs"]);
  const 対象 = (cfg.checks || []).filter((c) => 見本が要る種類.has(c && c.kind));
  if (対象.length) {
    const 見本あり = 対象.filter((c) => c.probe != null);
    const 割 = Math.round((見本あり.length / 対象.length) * 100);
    const 無い = 対象.filter((c) => c.probe == null).map((c) => c.name || "(名前なし)");
    notes.push("式で探す検査 " + 対象.length + " 本のうち、【見本(probe)】を持つのは "
      + 見本あり.length + " 本(" + 割 + "%)"
      + (無い.length ? " ── 見本の無い検査: " + 無い.slice(0, 5).join(" / ")
          + (無い.length > 5 ? " ほか" + (無い.length - 5) + "件" : "") : "")
      + " ── ★**見本が無いと、式が死んでも【0箇所】と緑を出し続けます**(落としません)");
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
  const 逃げ道詳 = [];
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
        逃げ道詳.push({ 場所: path.relative(ROOT, full).split(path.sep).join("/") + ":L" + (n + 1), 理由: 後 });
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
  /* ★逃げ道の【理由】を数える(2026-08-31、第3の議題・配布先の申告から)。
   *   配布先は「境界を跨ぐ口が4つ在り、行末に guardian:ok と理由で通している。
   *   ★理由の中身は誰も検めていない」と書いた ── 近傍の門と**まったく同じ形**である
   *   (門は「答えが在るか」しか見ていない / 逃げ道は「理由が在るか」しか見ていない)。
   * ★判定にはしない ── 同じ理由が正しい場合が在る(同じ理由で黙らせる4箇所は在りうる)。
   *   9.89/9.90 と同じく **2つの数を別の名前で出し、定義を隣に書く**。落とさない。 */
  if (process.argv.includes("--逃げ道の理由")) {
    console.log("逃げ道(guardian:ok)" + 逃げ道詳.length + "件 ── ★この数には【印を説明している行】も入ります(検査は印が在ることしか見ておらず、例外か説明かは形では分かりません)");
    for (const x of 逃げ道詳) console.log(x.場所 + "  ← " + (x.理由.length >= 4 ? x.理由 : "(理由なし)"));
  }
  {
    const 理由たち = 逃げ道詳.map((x) => x.理由).filter((r) => r && r.length >= 4);
    if (理由たち.length > 2) {
      const 数 = new Map();
      for (const r of 理由たち) 数.set(r, (数.get(r) || 0) + 1);
      let 最多 = 0, 重なり = 0;
      for (const n of 数.values()) { if (n > 最多) 最多 = n; if (n > 1) 重なり += n; }
      if (最多 > 1) {
        const 全 = 理由たち.length;
        const 割 = (x) => Math.round((x / 全) * 100);
        notes.push("逃げ道の理由: 種類 " + 数.size + " 通り / 【いちばん多い理由】が " + 最多 + "/" + 全
          + " 件(" + 割(最多) + "%)/ 【2件以上ある理由の合計】が " + 重なり + "/" + 全 + " 件(" + 割(重なり) + "%)"
          + " ── どちらも【理由の全文が一致するもの】を同じと見なしています。"
          + "**検査は【理由が在るか】しか見ていません。理由が正しいかは、書いた本人にしか分かりません**"
          + "(落としません。`--逃げ道の理由` で中身を出せます)");
      }
    }
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
/* ★【まだコミットしていない総量】を出す(2026-08-31、配布先の実測)。
 *
 * ★配布先が問われて数えたら、★★8917行が未コミットだった ── 39日ぶんの材料が git に在ったのに、
 *   ★★★誰も一度も数えていない。「測っているものは見える。測っていないものは、存在ごと見えない」。
 * ★★これは条でも検査でも数でもない【4つ目】である:
 *     条…守らない / 検査…個を見る / 数…穴を名指す / ★総量…「いつもと違う」を言う
 * ★判定にしない ── 大きいことは悪ではない(一晩で作れば大きくなる)。
 *   ★★上限も置かない(何行が正しいかを、こちらは知らない)。★★★出すだけ。
 * ★git が無ければ何も言わない(7条 ── 測れないものを言わない)。 */
{
  const r = spawnSync("git", ["-C", ROOT, "diff", "--numstat", "HEAD"], { encoding: "utf8", windowsHide: true });
  if (r.status === 0) {
    let 足 = 0, 引 = 0, 個 = 0;
    for (const 行 of String(r.stdout || "").split(/\r?\n/)) {
      const m = 行.match(/^(\d+|-)\t(\d+|-)\t/);
      if (!m) continue;
      個++;
      if (m[1] !== "-") 足 += Number(m[1]);
      if (m[2] !== "-") 引 += Number(m[2]);
    }
    if (個) {
      notes.push("まだコミットしていない変更: " + 個 + " ファイル / +" + 足 + " -" + 引 + " 行"
        + " ── ★**大きいことは悪ではありません**(一晩で作れば大きくなります)。"
        + "★★**ただし、誰も数えていないと【存在ごと見えなくなります】**(落としません。上限も置いていません)");
    }
  }
}
for (const n of notes) console.log('  ✓ ' + n);

/* ★予想の欄(2026-08-31、配布先の実測 ── 6回書いて3回外れ、★外れた3回のうち2件から本物が出た。
 *   当たった3回からは何も出ていない)。**予想は、外れたときにだけ材料になる。**
 * ★★これは【1人になったときの、訂正の代わり】として置いている ── 今夜の19件は全部
 *   もう1人の読み手が見つけたもので、検査が見つけたものは0件だった。人が居ないなら、
 *   **自分の予想と数を衝突させる**しか残っていない(9.79 は条だったので、欄にした ── 条<数<欄)。
 * ★落とさない・止めない。差分を出すだけ(7条)。予想を書いた人にしか意味が無いので、
 *   ★**書いていなければ何も出ない**。 */
{
  const 予想の道 = path.join(ROOT, ".guardian", "予想.json");
  const 数の行 = [...notes, ...problems].filter((l) => /[0-9]/.test(l));
  const 予想を書く = argv.indexOf("--予想");
  if (予想を書く >= 0) {
    const 文 = argv[予想を書く + 1];
    fs.mkdirSync(path.dirname(予想の道), { recursive: true });
    fs.writeFileSync(予想の道, JSON.stringify({ 文, 数の行 }, null, 1) + "\n");
    console.log("");
    console.log("★予想を置きました: " + 文);
    console.log("  次に " + "check.mjs" + " を素で走らせると、【そのときの数】と突き合わせて差分だけ出します");
    console.log("  ★当たっても何も出ません。外れたときだけ、そこに材料が在ります");
  } else if (fs.existsSync(予想の道)) {
    let 前 = null;
    try { 前 = JSON.parse(fs.readFileSync(予想の道, "utf8")); } catch (_) { 前 = null; }
    if (前 && Array.isArray(前.数の行)) {
      const 昔 = new Set(前.数の行), 今 = new Set(数の行);
      const 消えた = 前.数の行.filter((l) => !今.has(l));
      const 出た = 数の行.filter((l) => !昔.has(l));
      console.log("");
      console.log("★前に書いた予想: " + 前.文);
      if (!消えた.length && !出た.length) {
        console.log("  数はまだ1つも動いていません(予想が当たったかどうかは、まだ言えません)");
      } else {
        for (const l of 消えた) console.log("  － そのとき: " + l);
        for (const l of 出た) console.log("  ＋ いま    : " + l);
        console.log("  ★予想と違っていたら、そこを見ること。当たっていたら、何も出ません");
      }
    }
  }
}
if (problems.length) {

  for (const p of problems) console.log('  ✗ ' + p);
  console.log(`\n地図・正本の検査: ${problems.length}件のずれ`);
  process.exit(1);
}
console.log('\n地図・正本の検査: ずれなし');
