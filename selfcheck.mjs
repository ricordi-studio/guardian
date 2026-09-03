#!/usr/bin/env node
/**
 * 塊の自己検査 ── 検査エンジンが【当たること】を機械で示す
 *
 * ★この器の性格(2026-09-03、会議で「置き場が方針を決めているのに、それが書かれていない」と出た):
 *   測る対象 … ★★【塊が自分自身】(配布物・指紋・自己整合)
 *   出口     … ok / ng / 未測 ── ★★★柔らかい出口が【無い】
 *   逃げ道   … ★無い(guardian:ok は効かない)
 *   → だから、ここに置いた検査は【注意で済ませられない】。
 *     ★★測った上で「まだ直っていない」なら ng で止まる ── それが分かって置くこと。
 *   実測(2026-09-03): check は notes 36 / problems 38(柔らかい出口が在る)、
 *     ここは ok 52 / ng 61 / 未測 19(柔らかい出口が無い)。
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
import { createRequire as __cr2 } from 'node:module';
/* ★git から道の一覧を取る唯一の口(2026-09-03)── ★★行では割れない(空白を持つ道が壊れる) */
/* ★取り込み名を 道の口 にする(2026-09-03)── ★★この現場には 道 という局所変数が別に在り(65行)、
 * ★★★同じ名前だと影になる。名前で衝突する形は、後から足す人に見えない。 */
const 道の口 = __cr2(import.meta.url)('./道.cjs');
/* ★共通の書き手 ── ★★B14 の期待値(正本の綴り)を、ここから受け取る(2026-09-03、@codex の線)。
 *   ★★★読み込んでも何も起きないことは、下の B16 が毎回 測る。 */
const 書き手の口 = __cr2(import.meta.url)('./書き手.cjs');
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/* ★【自分が出したゴミを数える】(2026-09-01、配布先 外の会議 の事故報告)。
 *
 * ★実際に起きた: 配布先で ★guardian-* が 202,086個(推定 61.5GB)まで溜まり、
 *   ★★依頼主の機械の空きが 5GB になった。★★★自己検査は【通過】で緑のままだった。
 * ★見本を建てる9箇所は、全部 finally で rmSync している ── ★★設計は正しい。
 *   だが ★★★rmSync が失敗しても、誰も気づかない(Windows では、子が掴んでいると失敗する)。
 * ★この事故は【壊して赤くなるか】では見つからない ── ★★壊れていないから。
 *   ★★★正常動作の副作用であり、この塊が持っていなかった種類の検査である:
 *     これまで: 「壊したら赤くなるか」/ ★今回: 「★★後始末をしたか」
 * ★分けて数える: ★★走る前から在ったもの=数 / ★★★この走行が出したもの=赤。
 *   (前から在る分まで赤にすると、他人のゴミで止まる ── 母数の段・⑥)
 * ★プロセスは数えていない ── 数え方が現場ごとに違うので(報告者の「6日前のプロセス」は、
 *   実測したら ★Adobe の node.exe だった)。**ここでは測れない**と書いておく。 */
const 一時の親 = os.tmpdir();
const 見本の名 = /^guardian-/;
/* ★【所有台帳】── 自分が作った見本だけを覚える(2026-09-01、@codex の指摘)。
 *
 * ★直す前は【一時領域の全体差分】で数えていた: 走る前の一覧と、走った後の一覧を引き算する。
 *   ★★これは所有ではない。★★★2本 並走すると壊れる:
 *     ・相手が作った物を【自分が出した】と数える
 *     ・★もっと悪い: 拾い直しの段で、★★相手が使っている最中の見本を消しに行く
 *   実測(2026-09-01): 2本 並走させたら、後から始めた方は「0個・後始末できています」、
 *   ★先に始めた方は「1個 残っています(拾い直しで0個)」── ★★互いの結果を汚していた。
 * ★だから【自分が mkdtempSync で作った道】だけを台帳に持ち、そこしか見ない・そこしか消さない。
 * ★★他人の見本は【数えるだけ】── 消さないし、赤にもしない。 */
const 私が建てた = new Set();
const 見本を建てる = (接頭) => {
  const 道 = fs.mkdtempSync(path.join(一時の親, 接頭));
  私が建てた.add(道);
  return 道;
};
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
const 知っている口 = ['--口一覧', '--changed', '--dry', '--receipt', '--report', '--send', '--sha', '--stamp', '--tighten', '--why', '--判定'];
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
/* ★この現場の根(宣言が在る場所)。報告書の落とし先に使う ── cwd に落とすと
 *   回した場所で行き先が変わり、正本で回すと自己検査を赤くする(2026-08-30)。 */
/* ★拾えなかったことを、緑にしない(2026-08-30、違和感の掘り出しで見つかった)。
 *
 *   この照合は install.mjs / pull.mjs を**文字列の形**で切って中身を取り出す。
 *   形が変われば何も拾えなくなるが、直す前は「0件は全部入っています ✓」と**緑**を返した。
 *   実測: install.mjs の path.join(ROOT, …) を別の書き方に変えても、B7 は緑のままだった。
 *
 *   これは selfcheck.mjs が生まれた事故そのもの ──
 *   **何も見ていない検査が緑を返し続け、番人が居るつもりで居なかった**(WHY)。
 *   check.mjs の検査には probe(見本)が義務づけられているのに、
 *   selfcheck の中に後から書いたこの照合には無かった。
 *
 * ★だから【必ず在るはずのもの】を1つ決めて、それが拾えなければ**照合自身を落とす**。 */
function 拾えたか(名, 実際, 必ず在る) {
  const 欠け = 必ず在る.filter((x) => !実際.has(x));
  if (!欠け.length) return true;
  ng.push(名 + ': 拾い方が当たっていません(' + 欠け.join(', ') + ' が見つからない)'
    + ' ── 相手の書き方が変わった可能性があります。**この照合は何も見ていないので、緑にできません**');
  return false;
}
const ROOT_DIR = (() => {
  const { 在り処 } = 宣言を読む();
  return 在り処 ? path.dirname(在り処) : process.cwd();
})();
const NL2 = String.fromCharCode(10);
/* ★第3の語彙【未測】(2026-08-30、違和感の掘り出しで見つかった)。
 *
 *   この塊の芯は【不明を緑に数えない】(verdict.mjs)。ところが自己検査には
 *   ok / ng の2語しか無く、"測っていない" を ok に混ぜていた。
 *   実測: まっさらな導入先で
 *     ✓ 個人情報の見張りは**していません**(private が空)
 *     ✓ 運用の欠落は見ていません(context が空)
 *   と出たうえで **「59件すべて期待どおり」** ── 全部宣言済みの正本と**同じ数字・同じ文**。
 *   数が「測って通った」と「測っていない」を区別できていなかった。
 *   ★しかもこの自己検査は verdict の**証拠①**である ── 合否の根拠が、そこで嘘をつく。
 * ★未測は【失敗ではない】ので止めない(不明は止めない・verdict と同じ規律)。
 *   だが**緑には混ぜない**。数を分け、最後の1行でも分けて言う。 */
const ok = [];
const 未測 = [];
/* ★第4の語彙【ここでは測れない】(2026-08-31、配布先の実測で分かれた)。
 *
 * ★配布先が見つけた食い違い: 画面には「未測1件」と出ているのに、合否は「不明0」と言う。
 *   `selfcheck` が未測でも出口0を返すので、`verdict` が**通過に数えていた** ──
 *   この塊がいちばん大事にしてきた【不明を緑に数えない】が、**機械が集める所で消えていた**。
 * ★では全部の未測を出口2にすればよいか ── **それが罠だった。**
 *   「配布先には正本の git 履歴が無い」のような**構造的に測れない**ものを不明に数えると、
 *   **すべての配布先の合否が永久に不明**になる。不明が日常になれば読み飛ばされる ──
 *   今夜の「直せない赤は、無視される赤である」とまったく同じ形。
 * ★だから2つに分ける(配布先が出した線引きそのまま):
 *     未測     … **宣言すれば測れる / 回せば測れる** → 出口2(不明)。放っておくべきでない
 *     測れない … **その場所では構造的に測れない**   → 出口0。ただし**必ず名前を出す**
 *   ★どちらも「通った」とは言わない。緑に混ぜないのは変わらない。 */
const 測れない = [];
const ng = [];

/* ★【判定】と【実行報告】を分ける(24.15、2026-09-03、@codex 11:27)。
 *
 * ★★事故: ok.push が2つの意味を持っていた ── @kozo が61件を仕分けたら、
 *   「事故レポートを書きました」のような**やった事の報告**と、
 *   ★★★「正本で測った数は合っている」のような**判定**が同じ配列に混ざっていた。
 *   → 構文の形だけでは【緑の判定】を数えられない = 監査できない。
 *
 * ★@codex の条文: 判定は専用の構造化配列へ(対象・状態・根拠・走査集合・件数・正本由来)。
 *   ★★利用者向けの実行報告は別に出し、**判定監査の勘定に入れない**。
 *   ★★★「疑いが全て外れた」緑と「全対象集合を走査して空だった」緑を、同じにしない。
 *
 * ★いますぐ61件を全部 置き換えることはしない(@codex も そう言っている)。
 *   ★★入口だけを作り、この塊が今夜 足した検査(B18〜B22)から通す。
 *   ★★★通していない物は【未仕分け】として数え、暫定であることを表に出す。 */
/* ★--判定 のときは、途中の印字を静かにする(24.15)── 機械が読む口なので、
 *   ★★JSON だけを出す(外す.mjs の --json と同じ形)。★★★本当の log は最後に戻す。 */
const 判定だけ = process.argv.includes('--判定');
const 本当のlog2 = console.log;
if (判定だけ) console.log = () => {};
const 判定たち = [];
const 判定 = (r) => {
  /* r = { 対象, 状態:'緑'|'赤'|'未測', 根拠, 走査集合, 件数, 正本由来, 文 } */
  判定たち.push({
    対象: r.対象,
    状態: r.状態,
    根拠: r.根拠 || null,
    走査集合: r.走査集合 || null,       /* 何の集合を走査したか(★空でも「走査した」と言える) */
    件数: (r.件数 === undefined ? null : r.件数),
    /* ★issueCount ── 赤なら 0 より大きく、緑なら 0(26.2、2026-09-03、@codex の契約)。
     *   ★★省いたら【件数】から導く: 赤は最低1件、緑と未測は 0。 */
    /* ★状態を、件数から【推測させない】(26.4、2026-09-03、@codex 12:47)。
     *   ★★直す前は 未測にも issueCount: 0 を付けていた ── 
     *   ★★★件数だけを読む側では【緑と未知が同じに見える】。
     *   契約: 未測 ⇒ null / 緑 ⇒ 0 / 赤 ⇒ 0 より大きい。下の B23 が毎回 確かめる。 */
    issueCount: (r.状態 === '未測' ? null
      : r.状態 === '赤' ? (r.issueCount !== undefined ? r.issueCount : Math.max(1, Number(r.件数) || 1))
      : 0),
    /* ★未測の【走査集合】が null なのは手抜きではない ── 
     *   ★★走査できなかったから未測なので、★★★走査した集合が【存在しない】。
     *   赤と緑には必ず中身を入れる(何を見て そう言ったかが、記録の値打ちなので)。 */
    正本由来: (r.正本由来 === undefined ? null : r.正本由来),  /* 緑の必須フィールド */
  });
  if (r.状態 === '緑') ok.push(r.文);
  else if (r.状態 === '赤') ng.push(r.文);
  else 未測.push(r.文);
};

/* ★個人情報の見張りの【結果】を、見張った所の外へ出す(2026-08-30、違和感の掘り出しで見つかった)。
 *
 *   直す前、B1c(見張り)の結果はその塊の中の局所変数で、B1e(事故レポートを送る)からは
 *   見えなかった。だから **`--why --send` は、見張っていない現場でも、
 *   見張って【見つかった】現場でも、そのまま公開リポジトリへ投げられた。**
 *   しかも報告書の冒頭には「**宣言が空のため見張っていません**」と自分で書いたうえで送る。
 * ★外向き・不可逆(公開の issue)なので、ここは黙って通してはいけない。 */
/* ★この現場の索引(塊の外)。**数の照合と個人情報の見張りが、同じ一覧を見る**(39条)。
 *   2026-08-31: 見張りが塊しか歩いておらず、名前が乗るのはむしろこちらだと配布先が実測した。 */
const OUT = ['CLAUDE.md', 'STATUS.md', 'docs/CODEMAP.md'];
/* いまの中身の指紋(受領証が使う。B1b が埋める) */
const 現在の指紋 = {};
const 個人情報の見張り = { 状態: "見張っていない", 見つかった: [], 現場の文書: [], 語数: 0 };
/* ★正本のアドレスは【1箇所】から読む(2026-08-30、違和感の掘り出しで見つかった)。
 *
 *   直す前は `pull.mjs` の 正本(取り直し先)と、ここの `gh issue create --repo …`(報告先)に
 *   **同じ宛先が2つ**書かれていた ── 39条(同じことを2か所で決めない)そのもの。
 *   正本を引っ越したら、取り直しは新しい方へ行き、**報告だけが古い方へ飛び続ける**。
 * ★配布物の一覧(ENGINE_FILES)と同じやり方で、pull.mjs を正本として読む。
 *   読めなければ**送り先が分からない**と正直に言う(推測で外へ出さない)。 */
const 正本の名前 = () => {
  try {
    const src = fs.readFileSync(path.join(HERE, 'pull.mjs'), 'utf8');
    const m = src.match(/正本\s*=\s*'https:\/\/github\.com\/([^'\/]+\/[^'\/]+?)(?:\.git)?'/);
    return m ? m[1] : '';
  } catch (_) { return ''; }
};
let whyLoose = null;      // 守りが下限より増えている(--tighten で上げる)

/* ★指紋を取る対象は【配るもの】から導く(2026-08-30、違和感の掘り出しで見つかった)。
 *
 *   直す前は、ここに12件を手で並べていた。だが `pull.mjs` が実際に配るのは23項目 ──
 *   **index.mjs / githooks / templates / 文書一式(16項目)は、配られるのに指紋が無かった。**
 *   実測: 配布先で index.mjs と templates/ を直しても selfcheck は「配られたときの中身のまま」と緑を返し、
 *   pull.mjs の門(直りが在れば止まる)も鳴らず、**取り直しで上書きされて現場の直りが消えた**。
 *   これは WHY 176(配布先の直りが消える)を防ぐ仕組みが、16項目では効いていなかったということ。
 *
 * ★根は「配布物の集合が2箇所にあり、片方が短い」── 39条(同じことを2か所で決めない)。
 *   だから【配るもの】1つを正本にし、ここはそれを読んで実ファイルへ展開する。
 * ★指紋の対象から外すのは【配布先で中身が育って当然のもの】だけ ── その一覧も1箇所(FP_SKIP)に置く。
 *   ・WHY.md / WHY_INDEX.md / WHY_SEEN … その現場で踏んだ事故が増える(それが本体)
 *   ・CHANGELOG.md / KIT_VERSION / ENGINE_FP … 版と指紋そのもの(自分で自分を測れない)
 * ★`RULES.md` を外していたのを戻した(2026-08-30、違和感の掘り出しで見つかった)。
 *   除外の理由は「配布先で事故が増えて当然」だったが、それは **WHY.md の話**である。
 *   RULES.md は**修繕の作法**で、配布先で勝手に育つものではない ──
 *   外したままだと、配布先が作法を書き換えても `selfcheck` は緑を返し、
 *   `--report` にも載らず、**その現場の改善が正本へ還る道が無い**。
 *   ★理由が1つの仲間にしか当てはまらないのに、同じ袋へ入っていた。 */
const FP_SKIP = new Set(['WHY.md', 'WHY_INDEX.md', 'WHY_SEEN', 'CHANGELOG.md', 'KIT_VERSION', 'ENGINE_FP']);
/* ★pull.mjs の分類表を切り出す【1つの口】(2026-08-30)。
 *   直す前は同じ切り出しが3箇所に写されていた(ENGINE_FILES / 配布境界の照合 / 配布の網羅)。
 *   書き方が変わったときに1箇所だけ直す事故を呼ぶので、ここに集めた(39条)。
 * ★正規表現を組み立てず、素直に切り出す ── 書き方が変われば呼ぶ側が「読めません」で止まる。 */
const 分類表を取る = (名) => {
  let src = ''; try { src = fs.readFileSync(path.join(HERE, 'pull.mjs'), 'utf8'); } catch (_) { return null; }
  const 頭 = src.indexOf(名 + ' = new Set([');
  if (頭 < 0) return null;
  const 尾 = src.indexOf(']);', 頭);
  if (尾 < 0) return null;
  return new Set([...src.slice(頭, 尾).matchAll(/'([^']*)'/g)].map((x) => x[1]));
};
/* ★フォルダごと配る宣言の中から、1件だけ外している分を読む(2026-09-03)。
 *   ★★門(pull.mjs)は 配らない道 でそれを言う。指紋の対象は【実際に配る物】と揃えないと、
 *   ★★★「指紋の対象なのに配られない」で、配布先が出口の無い部屋に入る(既に在る検査が言う)。
 *   ここも 分類表を取る と同じく、門の宣言を読む(写経しない・39条)。 */
const 配らない道を取る = () => {
  try {
    const s = fs.readFileSync(path.join(HERE, 'pull.mjs'), 'utf8');
    const h = s.indexOf('const 配らない道 = new Set([');
    if (h < 0) return new Set();
    return new Set([...s.slice(h, s.indexOf(']);', h)).matchAll(/'([^']+)'/g)].map((m) => m[1]));
  } catch (_) { return new Set(); }
};
const 配らない道 = 配らない道を取る();

const ENGINE_FILES = (() => {
  const 表 = 分類表を取る('配るもの');
  if (!表) return [];
  const 名 = [...表];
  const 展開 = (n) => {
    if (FP_SKIP.has(n)) return [];
    const abs = path.join(HERE, n);
    try {
      if (!fs.statSync(abs).isDirectory()) return [n];
      return fs.readdirSync(abs).filter((f) => !FP_SKIP.has(n + '/' + f) && !配らない道.has(n + '/' + f)).map((f) => n + '/' + f);
    } catch (_) { return []; }
  };
  return 名.flatMap(展開).sort();
})();

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
  const dir = 見本を建てる('guardian-selfcheck-');
  try {
    for (const [p, body] of Object.entries(files)) {
      if (body == null) continue;                       // null = そのファイルを置かない
      const full = path.join(dir, p);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, body, 'utf8');
    }
    const r = spawnSync(process.execPath, [path.join(HERE, tool), '--root', dir, ...args], { encoding: 'utf8', timeout: 60000 });
    return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch (_) { /* ★残ったことは、走り終わりの検査が赤で言う(黙らせていない) */ }
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
  const 対象 = ENGINE_FILES;
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
  /* ★受領証のために、いまの中身の指紋を外へ出す(2026-08-31、CodeX の指摘)。
   *   「どの SHA から取ったか」だけでは、取ったあとに1本壊れても同じ値を返し続ける。
   *   だから【いまの中身そのもの】の digest を、検査の結果と**同じ回で**出せるようにする。 */
  for (const f of 対象) 現在の指紋[f] = いま[f];

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
  /* ★【消えたファイル】は、いまの一覧からも消える(2026-08-30、配布先の実走で見つかった)。
   *
   *   対象(ENGINE_FILES)はディスクを readdir して作るので、**消したファイルは最初から居ない**。
   *   だから指紋の照合にも掛からず、件数が静かに1つ減るだけだった。
   *   実測(配布先): `hooks/stop.js`(完了を名乗る手前で止める層)を消しても
   *     ✓ エンジンは配られたときの中身のまま(25件)
   *   と**緑**を返す。**層が1枚消えているのに、消えたと言えない。**
   * ★記録(ENGINE_FP)は「配られたとき何が在ったか」を知っている ── **両方向で見る**。 */
  const 消えた = Object.keys(記録).filter((f) => !対象.includes(f));
  const 違う = 対象.filter((f) => 記録[f] !== いま[f]);

  /* ★食い違ったファイルの【名前だけ】を機械が読める形で出す(2026-08-30、配布先からの報告②)。
   *
   *   配布先の指摘: 指紋が食い違ったとき、この道具は
   *   「**こちらで直した**」と「**正本が進んだ(こちらは古いだけ)**」を区別できていない。
   *   どちらも「違う」の一言になるので、取り直しが止まり、**堂々巡り**に入る
   *   (手で新しくする → 守りが止める → 指紋を手で入れる → 別のファイルが違うと言われる)。
   * ★区別する材料は `pull.mjs` の側にある(正本を一時領域に取っているので、突き合わせられる)。
   *   だからこちらは【どのファイルが食い違ったか】だけを渡し、判断は向こうでする。
   * ★文字列で判定させない ── 直す前の pull.mjs は赤い文の**文言**を includes で見ていた。
   *   文言は変わる(実際、9.21 で変えた)。機械が読む口を別に用意する。 */
  if (process.argv.includes("--changed")) {
    /* ★消えたものも載せる ── pull はこれを「手元に無い」として取り込み直す */
    for (const f of [...違う, ...消えた]) process.stdout.write(f + "\n");
    process.exit(0);
  }

  /* ★【この塊が、単独のリポジトリとして置かれているか】= 正本で回しているか。
   *   配布先では塊は <プロジェクト>/guardian/ なので HERE/.git は無い。
   *   ★B6a の 正本か(HERE/../.git も見る)とは【別の判定】である ── あちらは
   *     配布先でも真になる(guardian/ の1つ上はプロジェクトの .git)。
   *     直すかどうかは依頼主の判断なので触っていない(docs/HANDOVER.md に記録した)。 */
  const 塊が単独のリポジトリ = fs.existsSync(path.join(HERE, ".git"));

  if (process.argv.includes("--stamp")) {
    /* ★一言で押させない(2026-08-30、違和感の掘り出しで見つかった)。
     *
     *   直す前の --stamp は、確認も控えも一覧も無く ENGINE_FP を押し直した。
     *   pull.mjs は「配られたときの中身と違います」という**文字列**で
     *   「この現場の直りを上書きしない」を守っているので、**一言でその守りが外れる**。
     * ★実測: 配布先で verdict.mjs を直す → selfcheck 赤・pull 拒否 →
     *   **その赤い文が案内するとおり** --stamp → selfcheck 緑 →
     *   `pull --check` が「変わるもの: verdict.mjs」。**その現場の直りは次の取り直しで消える。**
     * ★赤い文は配布先の人も読む。「意図した変更なら --stamp」は、
     *   バグを直した現場にはそのまま当てはまるように読める ── だから道具の側で止める。
     * ★正本では --stamp は普通の作業なので止めない。止めるのは【還す道がまだ在る所】だけ。 */
    if (!塊が単独のリポジトリ && 違う.length) {
      ng.push("★ここは配布先です。--stamp を押すと、この現場で直した分(" + 違う.join(", ") + ")が"
        + "**記録ごと消えます** ── 次の `pull.mjs` が黙って上書きするようになります。"
        + "先に `--report` で1枚を作り、正本へ渡してください。"
        + "(正本で取り込んでから配り直せば、指紋は正しく揃います)");
    } else {
      /* 何を押すのかを必ず出す ── 黙って押す道具は、押した人にも何をしたか残らない */
      console.log(違う.length
        ? "  押し直す前の食い違い(" + 違う.length + "件): " + 違う.join(", ")
        : "  食い違いはありません(押しても中身は変わりません)");
      押す();
      ok.push("エンジンの指紋を押し直しました(" + 対象.length + "件"
        + (違う.length ? " / うち変わっていたのは " + 違う.length + "件" : "") + ")── 配った先へも配り直すこと");
    }
  } else if (!Object.keys(記録).length) {
    ng.push("ENGINE_FP がありません。`node guardian/selfcheck.mjs --stamp` で押してください");
  } else if (消えた.length) {
    ng.push("★配られたはずのエンジンが【無くなっています】: " + 消えた.join(", ")
      + " ── 層が1枚消えても、直す前は件数が静かに減るだけで気づけませんでした。"
      + "意図して外したのなら**正本で外して配り直す**こと(この現場だけで消すと、次の取り直しで黙って戻ります)。"
      + "戻すなら `node guardian/pull.mjs` で取り込み直せます");
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
      /* ★落とす先を固定する(2026-08-30、違和感の掘り出しで見つかった)。
       *   直す前は process.cwd() ── 回した場所で落ち先が変わり、同名の既存ファイルを確認なく上書きした。
       *   さらに正本(塊がリポジトリそのもの)で回すと直下に残り、
       *   **その直後の自己検査が「配るものとも現場のものとも決まっていません」で赤くなった** ──
       *   報告書を作る行為が、自分の自己検査を壊していた。
       *   .guardian/ はこの現場の作業記録の置き場(=配らないもの)なので、そこへ落とす。 */
      const 出先 = path.join(ROOT_DIR, ".guardian");
      try { fs.mkdirSync(出先, { recursive: true }); } catch (_) {}
      const 先 = path.join(出先, "guardian-report.md");
      fs.writeFileSync(先, 出.join("\n"));
      ok.push("改善報告を書きました: " + 先 + "(" + 違う.length + "ファイル)── 承認を得てから元の塊へ渡してください");
    } else {
      /* ★案内は【読む人がどこに居るか】で変える(2026-08-30)。
       *   直す前はどこで読んでも「意図した変更なら --stamp」と出ていた。
       *   配布先でバグを直した人は「意図した変更」をしているので、その案内を自分に当てはめる ──
       *   そして押した瞬間に、還す道(pull.mjs の守り)が外れる。 */
      /* ★【直した】と【壊れている】を分ける(2026-08-31、配布先からの報告)。
       *
       *   指紋が食い違ったとき、いままで見分けていたのは2つだけだった:
       *     こちらで直した / 正本が進んだだけ(pull.mjs が中身を突き合わせて分ける)
       *   3つ目の【壊れている】が **「直した」に混ざっていた**。
       *   配布先の言葉:「私は直していません。壊れています」──
       *   そう言われた人が `--report` を作りに行くと、**壊れた中身を正本へ還そうとする**。そこが危ない。
       * ★見分けは安い ── **構文が通るか**(`node --check`)。
       *   ★穴(配布先が自分で書いている): 構文しか見ない。
       *     構文は通るが動かない壊れ方(依存の消失・無限ループ)は、これでも「直した」に混ざる。 */
      const 壊れている = 違う.filter((f) => {
        if (!/\.(mjs|js)$/.test(f)) return false;
        const r = spawnSync(process.execPath, ["--check", path.join(HERE, f)],
          { encoding: "utf8", windowsHide: true, timeout: 60000 });
        return r.status !== 0;
      });
      if (壊れている.length) {
        const 名 = 正本の名前();
        ng.push("★この塊は【壊れています】(構文が通りません): " + 壊れている.join(", ")
          + " ── **直したのではなく、壊れています。**`--report` で正本へ還そうとしないでください"
          + "(壊れた中身を還すことになります)。"
          + (名
              ? "外から1ファイルだけ入れ直してください:" + NL2 + "     curl -fsSL https://raw.githubusercontent.com/"
                + 名 + "/main/" + 壊れている[0] + " -o <塊>/" + 壊れている[0]
              : "外から1ファイルだけ入れ直してください(正本のアドレスが読めませんでした)"));
      }
      const 直り = 違う.filter((f) => !壊れている.includes(f));
      if (直り.length) {
        ng.push("★この塊は配られたときの中身と違います(" + 直り.join(", ") + ")。"
          + "**直したなら元の塊へ戻すこと**(戻さないと、次に配ったとき直りが消えます)。"
          + "`--report` で渡す1枚を作れます。"
          + (塊が単独のリポジトリ
              ? "意図した変更なら `--stamp` で押し直してください"
              : "★ここは配布先なので `--stamp` は使えません(押すと、この直りが記録ごと消えるため)"));
      }
    }
  } else {
    ok.push("エンジンは配られたときの中身のまま(" + 対象.length + "件・記録と過不足なし)");
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
    未測.push("個人情報の見張りは**していません**(guardian.config.json の private が空)"
      + " ── 配るなら、伏せたい語をそこに並べてください");
  } else {
    個人情報の見張り.状態 = "見張った";
    個人情報の見張り.語数 = 語.length;
    const 見つかった = [];      /* 塊の中 ── 配る物に混ざっている(赤) */
    const 現場の文書 = [];    /* この現場の索引 ── 在って正常(赤にしない) */
    const 歩く = (dir) => {
      for (const en of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, en.name);
        if (en.isDirectory()) { 歩く(full); continue; }
        if (!/\.(md|mjs|js|json|yml)$/.test(en.name)) continue;
        const s = fs.readFileSync(full, "utf8");
        if (en.name === "guardian.config.json") continue;   // 見張る語を並べる所は、見張らない
        for (const w of 語) if (s.includes(w)) 見つかった.push(en.name + ": " + w);
      }
    };
    歩く(HERE);
    /* ★【この現場の索引】も見る(2026-08-31、配布先の実測)。
     *
     *   直す前は塊(HERE)しか歩いていなかった。配布先では HERE = <proj>/guardian なので、
     *   **その現場の CODEMAP / STATUS / CLAUDE.md / 宣言は一度も見ていない**。
     *   ところが配布先が実測したところ、名前が乗るのは**まさにそちら**だった:
     *     CODEMAP(1300行) 2件 / STATUS(3300行) 3件 / **宣言 8件(見張った全語)**
     *   ★端末固有の絶対パスは0件だった ── 心配していた所は空振りで、
     *     本当に乗るのは**人の名前**の方だった。
     * ★これは【宣言した語の補助信号】である ── **公開可否の証明ではない**
     *   (配布先の提案)。伏せる語を宣言している現場なら、そのまま使える。
     * ★宣言そのもの(guardian.config.json)は見張る語を並べる所なので、数えない ── 下の 歩く と同じ扱い。 */
    for (const d of OUT) {
      if (/guardian\.config\.json$/.test(d)) continue;
      let t = '';
      try { t = fs.readFileSync(path.join(ROOT_DIR, d), 'utf8'); } catch (_) { continue; }
      for (const w of 語) if (t.includes(w)) 現場の文書.push(d + ': ' + w);
    }
    個人情報の見張り.見つかった = 見つかった;
    個人情報の見張り.現場の文書 = 現場の文書;
    if (見つかった.length)
      ng.push("★塊にこの現場の個人情報が混ざっています: " + 見つかった.slice(0, 8).join(" / ")
        + "(配る前に伏せること)");
    else ok.push("宣言した " + 語.length + " 語は、塊の中に見つかりません"
      + "(**未宣言の情報は見ていません** ── 鍵・token・メール・顧客名・宣言外の人名は、この検査の外です)");
    /* ★【現場の文書に乗っているのは、正常である】(2026-08-31、配布先の実測で判明)。
     *
     *   9.37 で見る範囲をこの現場の索引まで広げた ── そこは正しかった。
     *   壊れたのは**判定**の方で、配布先の CLAUDE.md の「開発規範に書かれた人名」と
     *   STATUS.md の家族の名前を捕まえ、**伏せれば規範と記録が壊れる**ので直せない。
     *   つまり**その現場では永久に赤**になった(46条の逆 ── 直せない赤は、無視される赤である)。
     * ★区別はこう:
     *     塊の中(配る物)に乗っている  … 配る前に伏せる ── **赤**
     *     この現場の文書に乗っている    … 持っている分には正常 ── **赤にしない**
     *   ただし黙らない。**外へ写しを出すなら何箇所が一緒に出るか**を、毎回数えて出す。
     * ★言えるのは【宣言した語がどこに何箇所あるか】までである。
     *   「外へ出してよい」とは言わない ── 未宣言の人名・鍵・token・メール・顧客名・
     *   対象外の拡張子は、この検査では否定できない(2026-08-31、配布先(CodeX)の指摘)。
     *   ★「鳴っていない」を「安全」と読むのは、今夜くり返し出た形そのものである。 */
    if (現場の文書.length)
      ok.push("この現場の文書には " + 現場の文書.length + " 箇所あります(**持っている分には正常**): "
        + 現場の文書.slice(0, 8).join(" / ")
        + (現場の文書.length > 8 ? " ほか" + (現場の文書.length - 8) + "件" : "")
        + " ── ★**外へ写しを出すなら、少なくともこれが一緒に出ます**"
        + "(宣言した語の分だけです。未宣言の情報は見ていません)");
    else if (語.length) ok.push("宣言した " + 語.length + " 語は、この現場の文書にも見つかりません"
      + "(**未宣言の情報は未検査です** ── これは「出してよい」という意味ではありません)");
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
      /* ★落とす先を固定する(2026-08-30、違和感の掘り出しで見つかった)。
       *   直す前は process.cwd() ── 回した場所で落ち先が変わり、同名の既存ファイルを確認なく上書きした。
       *   さらに正本(塊がリポジトリそのもの)で回すと直下に残り、
       *   **その直後の自己検査が「配るものとも現場のものとも決まっていません」で赤くなった** ──
       *   報告書を作る行為が、自分の自己検査を壊していた。
       *   .guardian/ はこの現場の作業記録の置き場(=配らないもの)なので、そこへ落とす。 */
        const 出先 = path.join(ROOT_DIR, ".guardian");
        try { fs.mkdirSync(出先, { recursive: true }); } catch (_) {}
        const 先 = path.join(出先, "guardian-why-report.md");
        fs.writeFileSync(先, 出.join("\n"));
        const 送り先 = 正本の名前();
        const 題 = "事故レポート: " + 足された.length + "件";
        const 送る = "gh issue create --repo " + 送り先
          + " --title " + JSON.stringify(題)
          + " --body-file " + JSON.stringify(先);
        /* ★見張っていない中身を、外へ出さない(2026-08-30、違和感の掘り出しで見つかった)。
         *
         *   直す前の `--send` は、**見張っていない現場でも、見張って見つかった現場でも**、
         *   そのまま公開リポジトリへ issue を立てた。しかも報告書の冒頭には
         *   「宣言が空のため見張っていません」と**自分で書いたうえで**送っていた。
         *   事故の記録は「実機で起きたことを具体的に書く」ものなので、**人名が入り込む所**である
         *   (B1c がそのために在る)。外向き・不可逆(公開の issue)なので、ここは通さない。
         * ★止めるだけで終わらせない ── 1枚は書けているので、**送る道を必ず案内する**。 */
        const 出せない = !送り先
          ? "**送り先が分かりません**(pull.mjs から正本のアドレスが読めません)"
          : 個人情報の見張り.状態 !== "見張った"
            ? "この現場は**個人情報を見張っていません**(guardian.config.json の private が空)"
            /* ★ここが見るのは【塊の中】だけ(2026-08-31)。現場の文書に人名が在るのは正常で、
             *   それで外向きの口を塞ぐと、配布先は事故を一生報告できない。
             *   送る中身そのものは、下の「足した事故に混ざっていないか」が別に見ている(44条の分担)。 */
            : 個人情報の見張り.見つかった.length
              ? "**見張りが引っかかっています**(" + 個人情報の見張り.見つかった.slice(0, 3).join(" / ") + ")"
              : "";
        /* ★【送らずに、送る内容を見る】口を作る(2026-08-30、この道具で実際に事故を起こした)。
         *
         *   起きたこと: 開発中、`--send` の**表示だけ**を確かめるつもりで `--why --send` を回した。
         *   その機械には gh が入っていて認証も通っていたので、**本物の issue が公開リポジトリに立った**
         *   (ricordi-studio/guardian#2。試験用の作り話だったが、公開されたことに変わりはない)。
         * ★根は「**見るには、やるしかなかった**」こと ── `--stamp` とまったく同じ形である。
         *   外向きで不可逆な口には、**必ず下見の口を対で置く**(install.mjs の --dry と同じ)。 */
        const 下見 = process.argv.includes("--dry");
        const 見せる = () => console.log("  送り先: " + 送り先 + " / 題: " + 題
          + " / 中身: " + fs.statSync(先).size + "バイト・事故 " + 足された.length + "件"
          + " / 見張り: " + 個人情報の見張り.語数 + "語を通しました");
        if (process.argv.includes("--send") && 出せない) {
          ng.push("★送りませんでした: " + 出せない + "。**公開リポジトリへ出す前に伏せてください**。"
            + "1枚は " + 先 + " に在ります(private を書いてもう一度 `--why --send`、"
            + "または中身を読んでから手で `" + 送る + "`)");
        } else if (process.argv.includes("--send") && 下見) {
          見せる();
          ok.push("【下見】送りませんでした。この命令が走ります:\n     " + 送る
            + "\n   (本当に送るときは --dry を外してください)");
        } else if (process.argv.includes("--send")) {
          /* 何を・どこへ出すのかを必ず先に出す(黙って外へ出す道具を作らない) */
          見せる();
          const r = spawnSync(送る, { shell: true, encoding: "utf8", timeout: 60000 });
          if (r.status === 0) ok.push("事故レポートを送りました: " + String(r.stdout || "").trim());
          else ng.push("送れませんでした(gh が要ります / gh auth login で認証): "
            + String(r.stderr || "").slice(0, 200) + " ── 1枚は " + 先 + " に在ります");
        } else {
          ok.push("事故レポートを書きました: " + 先 + "(" + 足された.length + "件)");
          ok.push("中身を読んで**承認**したら、これで送れます:\n     " + 送る
            + (出せない ? "\n   ★ただし " + 出せない + " ── `--send` は止めます" : "")
            + "\n   (`--why --send --dry` で**送らずに**中身と宛先を見られます。"
            + "外すとその場で公開リポジトリへ出ます)");
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
    /* ★数えられる部品を増やす(2026-08-30、配布先からの報告③)。
     *   どれも【1箇所から機械が数えられる】ものだけ ── 数えられないものは網に入れない。 */
    要件: [...kit('SPEC.md').matchAll(/^\|\s*R\d+\s*\|/gm)].length,
    フック: (() => {
      /* install.mjs が実際に登録する本数(want の行数)。分類表と同じく、素直に切り出す */
      const src = kit('install.mjs');
      const h = src.indexOf('const want = [');
      if (h < 0) return 0;
      return [...src.slice(h, src.indexOf('];', h)).matchAll(/^\s*\['/gm)].length;
    })(),
    証拠: (() => {
      try { const { 宣言 } = 宣言を読む(); return Array.isArray(宣言?.evidence) ? 宣言.evidence.length : 0; }
      catch (_) { return 0; }
    })(),
  };
  const DOCS = ['METHOD.md', 'README.md', 'RULES.md', 'WHY.md', 'audit.md', 'install.md'];
  /* ★履歴の印は【塊の文書にも】効かせる(2026-08-31、48条を足したときに出た)。
   *   直す前は、この現場の索引(OUT)だけが印を見ていて、塊の文書(DOCS)は見ていなかった。
   *   ★`WHY.md` は**全部が履歴**である ── 過ぎた事故を、そのときの数字のまま残す文書なので、
   *     「RULES 全47条」のような**当時の件数**が必ず出てくる。
   *     48条を足した瞬間、**過去の記録2件が赤くなった** ── 直せば記録が嘘になる。
   *   ★印の判定を2箇所に書かない(39条)── ここで1つ決めて、両方の走査が使う。
   *   ★完全一致にしない: 人は必ず `<!-- guardian:history ここから下 -->` と理由を書き足す。 */
  const 履歴印 = /<!--\s*guardian:history/;
  const 履歴印の見本 = '<!-- guardian:history -->';
  const 履歴を落とした = [];
  const 履歴を落とす = (d, t) => {
    if (typeof t !== "string") return t;
    const h = t.search(履歴印);
    if (h < 0) return t;
    履歴を落とした.push(d + "(" + (t.slice(h).split(NL2).length - 1) + "行)");
    return t.slice(0, h);
  };
  /* OUT は上(module の頭)で宣言している ── 個人情報の見張りも同じ一覧を見るため(39条) */
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
      /* ★網は【数えられる部品】に広げる(2026-08-30、配布先からの報告③)。
       *
       *   報告者の現場では、地図と STATUS の数が**6件**腐っていた。
       *   その提案は「全 が付かない数は全部『照合していない』と言う」だったが、
       *   **こちらで試したら 13箇所鳴って、13箇所とも騒音だった**
       *   (「1本も入っていない」「39条」= 規則番号への参照、など)。
       *   索引には「いまの主張」と「あのとき測った記録」が同居するので、**数の有無では割れない**。
       * ★割れるのは【名詞】である ── 腐った6件は全部、この塊の**数えられる部品**を指していた:
       *   証拠 / 要件(R番号) / フックの本数。だから名詞ごとに実数と突き合わせる。
       * ★数えられないものは網に入れない(誤検出1件で検査ごと外される・配る約束の5)。 */
      const 対 = [
        [/事故\s*(\d+)\s*件/g, real.WHY, '事故の件数'],
        [/作法\s*(\d+)\s*条/g, real.RULES, '作法の条数'],
        [/規律\s*(\d+)\s*条/g, real.RULES, '規律の条数'],
        [/自己検査\s*(\d+)\s*件/g, null, '自己検査の件数'],
        [/証拠\s*(\d+)\s*件/g, real.証拠, '合否が回す証拠の件数'],
        [/要件\s*(\d+)\s*件/g, real.要件, '要件(R番号)の件数'],
        [/フック\s*(\d+)\s*本/g, real.フック, 'install が登録するフックの本数'],
        [/(\d+)\s*本(?:を)?登録/g, real.フック, 'install が登録するフックの本数'],
        [/R1\s*[〜~-]\s*R?(\d+)/g, real.要件, '要件(R番号)の最後の番号'],
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
  for (const d of DOCS) { const t = 履歴を落とす(d, kit(d)); 裸(d, t); look(d, t); }

  /* ★塊の外の3文書を【本当に読む】(2026-08-30、配布先からの報告③)。
   *
   *   直す前の経路は `HERE/../../<文書>` ── **1つ深く、プロジェクトの外**を指していた。
   *     配布先: <proj>/guardian → HERE/../.. = <proj> の親
   *     正本  : リポジトリそのもの → デスクトップの親
   *   しかも `catch (_) { 無ければ見ない }` で握り潰していたので、
   *   **この3文書は一度も読まれていない**のに、検査は緑を返し続けた。
   *   実測(配布先の報告): 地図と STATUS に**腐った数が6件**在ったのに、1件も鳴らなかった。
   *   ★報告者は「全 が付かない数は照合されない」と読んだ。それも本当だが、
   *     **その手前で、文書そのものを開いていなかった。**
   * ★根は ROOT_DIR を使わず、HERE から段数を数えたこと ── 段数は置き方で変わる。
   * ★読めなかったものは**名前を出す**(無音を「見た」と読ませない)。 */
  /* ★【履歴の印】と【多すぎたら測れないと言う】(2026-08-30、配布先からの報告④)。
   *
   *   9.24 でこの網を外の文書へ掛けた直後、配布先で **58件鳴って、そのうち本物は1件**だった。
   *   残り57件は、3316行の STATUS.md に積まれた**過去のセッションの完了報告**
   *   (「証拠6件」×51 など)── **どれも当時は正しかった記録**で、腐りようがない。
   *   ★私はこの網を作るとき、**自分の地図でしか測らなかった**。この塊の地図には
   *     セッションの履歴が積まれていないので、騒音がゼロに見えた。
   *     「配布の結果は配布先を建てて測る」を、自分で書いた版の次に破っている。
   *   ★しかも私は、報告者の案を「13箇所中13箇所が騒音だった」と却下していた。
   *     作り直した私の網は **57/58 が騒音**で、**却下した案より悪い**。
   *
   * ★直し1: 文書が【どこから下は履歴か】を自分で宣言できるようにする。
   *   報告者が「構造の芽②」で求めていたもの(ADR の `状態:` の札と同じ考え)。
   *   1行で済み、53箇所に逃げ道を撒く形(門が儀式になる)を避けられる。
   * ★直し2: それでも多すぎるときは【測れない】と言って、その文書では落とさない。
   *   1件の本物のために57件の騒音で止めるのは、計器として壊れている(7条)。
   *   ★上限は「腐り」と「数を語る文書」を分けるための網であって、正しさの基準ではない。 */
  /* ★印は【前方一致】で探す(2026-08-30、配布先からの報告)。
   *   完全一致だと `<!-- guardian:history ここから下は履歴 -->` のように
   *   理由を書き足した瞬間に効かなくなる ── 人は必ず理由を書き足す。 */
  const 多すぎる上限 = 5;
  const 読めなかった = [];
  const 測れない文書 = [];
  for (const d of OUT) {
    let t = null;
    try { t = fs.readFileSync(path.join(ROOT_DIR, d), 'utf8'); } catch (_) {}
    if (t === null) { 読めなかった.push(d); continue; }
    t = 履歴を落とす(d, t);
    const 前 = bad.length;
    look(d, t); 裸(d, t);
    const 出た = bad.length - 前;
    if (出た > 多すぎる上限) {
      const 見本 = bad.slice(前, 前 + 3);
      bad.length = 前;                       // この文書の分は落とさない(測れていないので)
      測れない文書.push({ d, 出た, 見本 });
    }
  }
  if (履歴を落とした.length) {
    ok.push('履歴の印から下は数を照合していません(そう宣言されているので): ' + 履歴を落とした.join(' / '));
  }
  for (const x of 測れない文書) {
    未測.push(x.d + ' の数は**照合できませんでした**(' + x.出た + '箇所が実数と違う ── '
      + 'これは腐りではなく、**過去の記録が積まれている文書**の形です)。'
      + '見本: ' + x.見本.join(' / ')
      + ' ── 直すなら、いまの記述と履歴の境目に **' + 履歴印の見本 + '** の1行を置いてください'
      + '(その下は数を見ません。理由を書き足しても効きます)。逃げ道を1行ずつ撒くのは、門を儀式にするので勧めません');
  }
  if (読めなかった.length) {
    測れない.push('この現場の文書のうち ' + 読めなかった.join(' / ') + ' は**在りません**(数の照合をしていません)');
  }

  if (bad.length) ng.push('文書が書いている件数が実数と合っていません:\n      ' + bad.join('\n      '));
  else ok.push(`文書の件数は実数と一致(RULES ${real.RULES}条 / WHY ${real.WHY}件`
    + ` / この現場の文書 ${OUT.length - 読めなかった.length}/${OUT.length} 件も見ました)`);
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

/* B6〜B7. 配布境界の照合 ── pull.mjs の【門】に対する双子(RULES 44条)
 *   (2026-08-29, AI Council EXP-001 → 依頼主の判断でホワイト＋ブラックの両立てに)
 *
 * ★門(pull.mjs)は取る側でしか働かない。**配る側で先に気づく**ための検査がここ。
 *   門と同じ2つの宣言を読む ── 表を2枚にしない。
 *
 * ★見るのは3方向:
 *   B6a 直下の全項目が、配るもの / 現場のもの の**どちらかちょうど1つ**に入っているか
 *   B6b エンジンが【配るもの】に入っているか(欠落の向き ── 配り忘れは黙って起きる)
 *   B7  install.mjs が配布先に作るものが【現場のもの】に入っているか(混入の向き)
 *       ── **独立した第二根拠**。据え付ける道具は、配る道具と同じ境界を逆側から知っている */
{
  /* 宣言を pull.mjs から読む(門と検査が同じ1つを読むため)。
   * ★正規表現を組み立てず、素直に切り出す ── 書き方が変われば下の「読めません」で止まる。 */
  const 配るもの = 分類表を取る('配るもの');
  const 現場のもの = 分類表を取る('現場のもの');

  /* 見本: この2つは必ず在る。拾えなければ pull.mjs の書き方が変わった合図(2026-08-30) */
  const 拾えた = 配るもの && 現場のもの
    && 拾えたか('配るもの', 配るもの, ['check.mjs', 'selfcheck.mjs'])
    && 拾えたか('現場のもの', 現場のもの, ['guardian.config.json', 'docs']);
  if (!拾えた) {
    if (配るもの && 現場のもの) { /* 見本が落としたので、ここでは何も言わない */ } else ng.push('pull.mjs の【配るもの】【現場のもの】が読めません。書き方を変えたならこの検査も直すこと');
  } else {
    /* B6a: 分類の網羅(この現場が正本であるときだけ意味がある ── 塊がリポジトリそのもの) */
    const 正本か = fs.existsSync(path.join(HERE, '..', '.git')) || fs.existsSync(path.join(HERE, '.git'));
    if (!正本か) {
      測れない.push('配布境界の網羅は見ていません(ここは正本ではないので、直下に現場のものが同居しません)');
    } else {
      const 直下 = fs.readdirSync(HERE);
      const 未分類 = 直下.filter((n) => !配るもの.has(n) && !現場のもの.has(n));
      const 両方 = 直下.filter((n) => 配るもの.has(n) && 現場のもの.has(n));
      if (未分類.length) {
        ng.push('【配るものとも現場のものとも決まっていない】ものがあります: ' + 未分類.join(', ')
          + ' ── pull.mjs のどちらかに書くこと。決めないと、混入か欠落のどちらかが黙って起きます');
      } else if (両方.length) {
        ng.push('配るものと現場のものの両方に書かれています(どちらか一方に): ' + 両方.join(', '));
      } else {
        ok.push('直下 ' + 直下.length + ' 項目は全て分類済み(配る ' + 配るもの.size
          + ' / 現場 ' + 現場のもの.size + ')');
      }
    }

    /* B6b: 配るべきエンジンが、配るものに入っているか(欠落の向き) */
    const 抜け = ENGINE_FILES.filter((f) => !配るもの.has(f.split('/')[0]));
    const 紛れ = ENGINE_FILES.filter((f) => 現場のもの.has(f.split('/')[0]));
    if (抜け.length) {
      ng.push('エンジンが【配るもの】に入っていません(配布先へ届きません。エラーも出ません): ' + 抜け.join(', '));
    } else if (紛れ.length) {
      ng.push('エンジンが【現場のもの】に分類されています(配布されません): ' + 紛れ.join(', '));
    } else {
      ok.push('エンジン(' + ENGINE_FILES.length + '件)は【配るもの】に入り、【現場のもの】と重ならない');
    }

    /* B7: install が配布先に作るものは、定義上すべて現場固有物である */
    /* ★【作る】と【読む】を分ける(2026-08-30、新規プロジェクトの実走で誤検出した)。
     *   直す前は `path.join(ROOT, '…')` を全部『作るもの』と読んでいた。
     *   install が候補を拾うために package.json / Makefile を**読む**ようになった途端、
     *   その2つが『配布先に作るもの』として数えられ、**配るものを壊す**と赤くなった。
     * ★読むだけの行は行末の `guardian:read` で外す ── 逃げ道ではなく、**向きの宣言**である。 */
    const 作る = new Set();
    for (const 行 of kit('install.mjs').split(/\r?\n/)) {
      if (/guardian:read/.test(行)) continue;
      for (const m of 行.matchAll(/path\.join\(ROOT,\s*'([^']+)'/g)) 作る.add(m[1]);
    }
    /* 見本: install は必ずこの3つを配布先に作る。拾えなければ形が変わった合図 */
    if (!拾えたか('install が配布先に作るもの', 作る, ['docs', 'guardian.config.json', 'CLAUDE.md'])) {
      /* 落としたので、この先は数えない */
    } else {
    const 漏れ = [...作る].filter((p) => !現場のもの.has(p));
    if (漏れ.length) {
      ng.push('install.mjs が配布先に作るものが【現場のもの】に入っていません(配ると配布先のものを壊します): '
        + 漏れ.join(', '));
    } else {
      ok.push('install が配布先に作るもの(' + 作る.size + '件)は、全て【現場のもの】に入っている');
    }
    }
  }
}

/* B8. 塊のフォルダを【プロジェクトの根】と取り違えないか(2026-08-29、実地で見つかった)
 *   ★事故: 古い pull.mjs は CLAUDE.md を【配らないもの】に持っていないので、取り直すと
 *     guardian/CLAUDE.md が出来る。根を探す判定は CLAUDE.md を目印にしていたため、
 *     **guardian/ で止まった** ── install.mjs はフックを guardian/.claude/ へ書き、
 *     「.claude/settings.json にフックを 4 本足しました」と**報告した**。
 *     配布先の本当の設定は一度も更新されない。**見えない失敗**そのものである。
 *   ★実際に見本を建てて確かめる(理屈ではなく実測) ── 塊らしいフォルダの中に目印を置き、
 *     根がその1つ上を指すことを確認する。 */
{
  const 仮 = 見本を建てる('guardian-root-');
  try {
    const 塊 = path.join(仮, 'guardian');
    fs.mkdirSync(塊, { recursive: true });
    /* 塊らしく見せる(中身は要らない ── 判定はファイルの在る無しだけを見る) */
    for (const f of ['check.mjs', 'selfcheck.mjs']) fs.writeFileSync(path.join(塊, f), '');
    /* 古い取り直しが持ち込む【目印】を、塊の中に置く */
    fs.writeFileSync(path.join(塊, 'CLAUDE.md'), '');
    fs.writeFileSync(path.join(塊, 'guardian.config.json'), '{}');
    fs.mkdirSync(path.join(塊, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(塊, 'docs', 'CODEMAP.md'), '');
    /* 本当の根の目印 */
    fs.writeFileSync(path.join(仮, 'CLAUDE.md'), '');
    fs.writeFileSync(path.join(仮, 'guardian.config.json'), '{}');

    const 出た = spawnSync(process.execPath, ['-e',
      'const {findRoot}=require(' + JSON.stringify(path.join(HERE, 'hooks', 'lib-root.js')) + ');'
      + 'process.stdout.write(findRoot(' + JSON.stringify(塊) + '));'], { encoding: 'utf8' });
    const 根 = String(出た.stdout || '').trim();
    if (根 === fs.realpathSync(仮) || 根 === 仮) {
      ok.push('塊のフォルダを根と取り違えない(混入した目印があっても1つ上を指す)');
    } else {
      ng.push('根の判定が塊のフォルダで止まりました(' + 根 + ')。'
        + 'フックと導入が【配布先ではない場所】を見ます ── 報告は成功と出るので気づけません');
    }
  } finally {
    try { fs.rmSync(仮, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch (_) { /* ★残ったことは、走り終わりの検査が赤で言う(黙らせていない) */ }
  }
}

/* B7b. 【配ると宣言したものが、本当に配られるか】(2026-08-30、配布先を 9.13 → 9.22 に上げて見つかった)。
 *
 * ★実際に起きた: `pull.mjs` の配布一覧は `現場のもの` を**名前で・どの深さでも**弾いていた。
 *   `guardian.config.json` は現場のものなので、**`templates/guardian.config.json` まで弾かれる**。
 *   ところが指紋の対象は【配るもの】から導くので templates/ の中は入っている ──
 *   **配らないのに、配ったことにして指紋を照合していた。**
 *   配布先は取り直した直後に「配られたときの中身と違います」と言われ、1文字も直していないのに
 *   pull も stamp も拒否され、**出口が無くなった**。
 * ★これは正本では一生出ない ── ここには全部のファイルが在るので、欠けようがない。
 *   **配布の結果を、配る前にここで測る**しかない。
 * ★44条(門には双子を置く)。門(pull.mjs)は黙って落ちるので、
 *   同じ宣言を読む検査をこちらに置く。歩き方はわざと**別に書いてある**
 *   ── 同じ実装を共有すると、同じ誤りを二度数えるだけになる。 */
{
  /* ★門(pull.mjs)自身に「何を配るか」を言わせ、指紋の対象と突き合わせる。
   *   ここで歩き方を書き写すと、写した方は正しいままなので**門の退行を測れない**
   *   ── 実際、最初はそう書いて、直す前の形に戻しても緑のままだった。
   *   検査が当たらないまま緑を返すのは、この塊が生まれた事故そのものである。 */
  const r = spawnSync(process.execPath, [path.join(HERE, 'pull.mjs'), '--distributed'],
    { encoding: "utf8", windowsHide: true, timeout: 60000 });
  const 配られる = new Set(String(r.stdout || "").split(String.fromCharCode(10)).map((x) => x.trim()).filter(Boolean));
  if (r.status !== 0 || !配られる.size) {
    未測.push("配布の網羅は見ていません(pull.mjs --distributed が答えません)");
  } else {
    const 届かない = ENGINE_FILES.filter((f) => !配られる.has(f));
    if (届かない.length) {
      ng.push("★指紋の対象なのに【配られない】ものがあります: " + 届かない.join(", ")
        + " ── 配布先は取り直した直後に「配られたときの中身と違います」と言われ、"
        + "**1文字も直していないのに pull も stamp も拒否されます**(出口の無い部屋)。"
        + "pull.mjs の配布一覧が、場所ではなく**名前**で弾いていないか見てください");
    } else {
      ok.push("配ると宣言したものは、本当に配られる(指紋の対象 " + ENGINE_FILES.length
        + "件すべてが、pull.mjs 自身の配布一覧に在る)");
    }
  }
}

/* ---------- B13. 配る物が【現場の物】に依存していないか(2026-09-03、会議で導かれた) ----------
 *
 * ★規則: 【配るもの】の中のファイルが【現場のもの】の下を require / import していたら赤。
 *   ★★これは判断ではなく依存から出る ── 配布先には現場の物が無いので、その部品は必ず落ちる。
 *   実測(2026-09-03): hooks/in-loop.js が `.guardian/印の場所.cjs` を require していた。
 *   配布の形の写しで叩くと Cannot find module。★★★配る物の中に、配布先では動かない物が在った。
 *
 * ★★道を【畳んでから】当てる。文字列を見るだけでは取りこぼす ──
 *   実測: `require(` の直後の文字列だけを探すと **0件** と出た(本物は path.join で組み立てていた)。
 *   ★★★取りこぼす検査は、いちばん危ない形で緑を出す。 */
{
  const r2 = spawnSync(process.execPath, [path.join(HERE, "pull.mjs"), "--distributed"],
    { encoding: "utf8", windowsHide: true, timeout: 60000 });
  const 配る = String(r2.stdout || "").split(String.fromCharCode(10)).map((x) => x.trim()).filter(Boolean);
  const src現場 = (() => { try { return fs.readFileSync(path.join(HERE, "pull.mjs"), "utf8"); } catch (_) { return ""; } })();
  const h現場 = src現場.indexOf("const 現場のもの = new Set([");
  const 現場 = h現場 < 0 ? null
    : [...src現場.slice(h現場, src現場.indexOf("]);", h現場)).matchAll(/'([^']+)'/g)].map((m) => m[1]);
  if (!配る.length || !現場) {
    未測.push("配る物の依存は見ていません(pull.mjs の宣言か配布一覧が読めません)");
  } else {
    const 違反 = [];
    const 対象 = 配る.filter((x) => /.(mjs|cjs|js)$/.test(x));
    for (const rel of 対象) {
      let src = "";
      try { src = fs.readFileSync(path.join(HERE, rel), "utf8"); } catch (_) { continue; }
      for (const m of src.matchAll(/(?:require|import)s*(([^)]*))/g)) {
        const 片 = [...m[1].matchAll(/['"`]([^'"`]+)['"`]/g)].map((x) => x[1]);
        if (!片.length) continue;
        const 道 = 片.join("/");
        for (const 名 of 現場) {
          if (道.split("/").includes(名)) { 違反.push(rel + " → " + 道 + "(" + 名 + " は現場のもの)"); break; }
        }
      }
    }
    if (違反.length) {
      ng.push("★配る物が【現場の物】に依存しています(" + 違反.length + "件) ── "
        + "配布先には無いので、その部品は必ず落ちます。配るのをやめるか、依存を切ること:" + String.fromCharCode(10) + "      "
        + 違反.slice(0, 5).join(String.fromCharCode(10) + "      "));
    } else {
      ok.push("配る物は【現場の物】に依存していない(" + 対象.length + "件を、道を畳んで当てた)");
    }
  }
}

/* ---------- B17. git のフック(pre-commit)は、文書の約束どおり振る舞うか(2026-09-03、外の監査で見つかった) ----------
 *
 * ★事故: `githooks/pre-commit` の先頭に `set -e` が在り、
 *   ★★`node verdict.mjs --fast` が非0で終わった瞬間にスクリプトが死んでいた。
 *   その直後の `code=$?` に到達しないので、★★★下の2つの枝が【両方とも死にコード】だった:
 *     差戻(1) … 止まるが、理由も --no-verify の案内も1行も出ない
 *     不明(2) … ★文書は「止めない」と約束しているのに、止まる
 *
 *   ★★導入直後の verdict は(private と context が空なので)必ず 出口2 を返す。
 *   ★★★案内どおり core.hooksPath を有効にした現場は、その時点から【一切コミットできなくなる】。
 *
 * ★なぜ生き延びたか: この門は ENGINE_FP に指紋が載っているのに、
 *   ★★この検査が【一度も実行していなかった】── バイトは見張られ、振る舞いは見張られていなかった。
 *   ★★★SPEC の「双子のいない門を足さない」に、この門だけが反していた。
 *
 * ★測り方: にせの verdict(出口 0 / 1 / 2 を返すだけ)を一時の場所に置いて、門を叩く。
 *   ★★本物の合否は回さない ── 測りたいのは【出口の受け取り方】だけだから。 */
{
  const 門 = path.join(HERE, 'githooks', 'pre-commit');
  if (!fs.existsSync(門)) {
    未測.push("git のフック(githooks/pre-commit)が在りません(振る舞いを測れません)");
  } else {
    let 仮 = null;
    try { 仮 = fs.mkdtempSync(path.join(os.tmpdir(), 'guardian-pc-')); } catch (_) {}
    if (!仮) 未測.push("git のフックの振る舞い: 一時の場所が作れません");
    else {
      try {
        fs.mkdirSync(path.join(仮, 'guardian'), { recursive: true });
        fs.copyFileSync(門, path.join(仮, 'pc'));
        /* ★文書の約束(SPEC 3節 / install.md / 門の注)をそのまま表にする */
        const 約束 = [
          { 出口: 0, 門の出口: 0, 言う: null,   何: '通過 … 通す' },
          { 出口: 1, 門の出口: 1, 言う: '差戻', 何: '差戻 … 止める + 理由と --no-verify の案内' },
          { 出口: 2, 門の出口: 0, 言う: '不明', 何: '不明 … ★止めない + 何が測れていないかを返す' },
        ];
        const 外れ = [];
        for (const 約 of 約束) {
          fs.writeFileSync(path.join(仮, 'guardian', 'verdict.mjs'),
            "console.log('にせの合否');" + String.fromCharCode(10) + "process.exit(" + 約.出口 + ");" + String.fromCharCode(10));
          const r = spawnSync('sh', ['pc'], { cwd: 仮, encoding: 'utf8', windowsHide: true, timeout: 60000 });
          const 出 = String(r.stdout || '') + String(r.stderr || '');
          if (r.status !== 約.門の出口)
            外れ.push(約.何 + " → 門の出口が " + r.status + "(約束は " + 約.門の出口 + ")");
          if (約.言う && !出.includes(約.言う))
            外れ.push(約.何 + " → 「" + 約.言う + "」を1行も言いません");
        }
        if (外れ.length) {
          ng.push("★git のフック(pre-commit)が、文書の約束どおりに振る舞いません(" + 外れ.length + "件): "
            + 外れ.join(" / ") + " ── ★★この門は他の道具の現場向けの唯一の代替経路です。"
            + "★★★『不明は止めない』が破れると、案内どおり入れた現場が一切コミットできなくなります");
        } else {
          ok.push("git のフックは文書の約束どおり(通過=通す / 差戻=止めて理由を言う / ★不明=止めずに言う)");
        }
      } catch (e) {
        未測.push("git のフックの振る舞い: 測れませんでした(" + String(e && e.message).slice(0, 60) + ")");
      } finally {
        try { fs.rmSync(仮, { recursive: true, force: true }); } catch (_) {}
      }
    }
  }
}

/* ---------- B22. install が置く道を、外す側の 既知の道 が覆っているか(2026-09-03、@kozo が語彙を見つけ、@codex が名乗りを直させた) ----------
 *
 * ★@kozo が見つけた: `guardian:read` は【向きの宣言】で、B7 が既に読んでいる。
 *   だから「install が置く道」は 字面 − guardian:read で機械が集められる。
 *
 * ★★@codex の指摘(10:29 / 10:32): 最初の実装は「6件を見た」と名乗ったが、
 *   その6件には【親フォルダ】が混ざっていて、★★★親の下に子を1本 足しても緑のままだった。
 *   「列挙できた字面の範囲だけ照合済み」としか名乗ってはいけない。
 *
 * ★動的な子(path.join(dir, '…'))を1段 追う条件も、@codex が条文にした:
 *   ・束ね元が許された path.join の字面である
 *   ・再代入・別スコープ・条件依存・未解決の関数呼出しが無い
 *   ・子の書込み先と束ね元の基底が一致する
 *
 * ★★実測(2026-09-03、直接 確かめた ── 網の一致数から同一性を推論しない):
 *   install.mjs の `dir` は :308 と :442 の const 2本(どちらも同じ字面)に加え、
 *   ★★★:225 に `walk = (dir, depth) =>` の【引数】が在る。名前が同じでも別物である。
 *   → だから この塊では `dir` は【解決できない】。未解決として出す。
 *
 * ★出口は2つに分ける(@codex:「別検査の赤を B22 の合格根拠にしない」):
 *   ① 字面で拾えた【置く道】が 既知の道 に無い → ★赤(ラチェットはここ)
 *   ② 未解決の動的な子が在る → ★★未測(緑にしない)
 *   ③ 両方 無い → ★★★緑 */
{
  try {
    const NL1 = String.fromCharCode(10);
    const 行々 = kit('install.mjs').split(NL1);
    const 生 = (p) => new RegExp(p, 'g');
    const B = String.fromCharCode(92);
    const 継ぐ = () => new RegExp('path' + B + '.join' + B + '(ROOT,((?:' + B + "s*'[^']+',?)+)" + B + 's*' + B + ')', 'g');
    const 片取り = () => new RegExp("'([^']+)'", 'g');
    /* ★識別子は ASCII だけではない(24.12)── この塊の変数名は日本語である。
     *   ★★実測: 置き場を「ワークフローの置き場」に替えた途端、動的な子が【網から消え】、
     *   ★★★未解決 0件 = 嘘の緑になった。ASCII だけの網は、この塊では必ず嘘をつく。 */
    const 字 = '[' + B + 'p{L}' + B + 'p{N}_$]+';   /* ★逆斜線は書かない ── 文字列に直に書くと JS が食う(今夜7度目) */
    const 動的 = () => new RegExp('path' + B + '.join' + B + '((' + 字 + '),' + B + "s*'([^']+)'", 'gu');

    const 字面 = new Set();
    const 動く = [];   /* {変数, 子} */
    for (const 行 of 行々) {
      if (/guardian:read/.test(行)) continue;
      for (const m of 行.matchAll(継ぐ())) {
        const 片 = [...m[1].matchAll(片取り())].map((x) => x[1]);
        if (片.length) 字面.add(片.join('/'));
      }
      for (const m of 行.matchAll(動的())) {
        if (m[1] === 'ROOT' || m[1] === 'HERE') continue;   /* ROOT は上で拾っている */
        動く.push({ 変数: m[1], 子: m[2] });
      }
    }

    /* ★束ね元を1段だけ追う ── 追えない形は【追えない】と言う(推論しない) */
    const 解けた = new Set(), 未解決 = [];
    const 見た変数 = new Set();
    for (const d of 動く) {
      if (見た変数.has(d.変数 + '/' + d.子)) continue;
      見た変数.add(d.変数 + '/' + d.子);
      const 束 = [];
      let 引数か = false;
      for (const 行 of 行々) {
        if (new RegExp('(const|let|var)' + B + 's+' + d.変数 + B + 's*=').test(行)) 束.push(行);
        if (new RegExp('=' + B + 's*' + B + '(?[^)]*' + B + 'b' + d.変数 + B + 'b[^)]*' + B + ')?' + B + 's*=>').test(行)) 引数か = true;
        if (new RegExp('function' + B + 's+[A-Za-z0-9_$]*' + B + 's*' + B + '([^)]*' + B + 'b' + d.変数 + B + 'b').test(行)) 引数か = true;
      }
      const 字面の束 = 束.map((行) => {
        const m = [...行.matchAll(継ぐ())][0];
        if (!m) return null;
        return [...m[1].matchAll(片取り())].map((x) => x[1]).join('/');
      });
      const 揃った = 字面の束.length > 0 && 字面の束.every((x) => x !== null && x === 字面の束[0]);
      if (引数か) {
        未解決.push(d.変数 + '/' + d.子 + '(★' + d.変数 + ' は関数の引数でもあります ── 名前が同じでも別物)');
      } else if (!揃った) {
        未解決.push(d.変数 + '/' + d.子 + '(束ね元が ' + 束.length + ' 本で、字面が揃いません)');
      } else {
        解けた.add(字面の束[0] + '/' + d.子);
      }
    }

    const 外 = kit('外す.mjs');
    const 既知 = new Set();
    const h = 外.indexOf('const 既知の道 = new Set([');
    if (h >= 0) {
      const 尾 = 外.indexOf(']);', h);
      for (const m of 外.slice(h, 尾).matchAll(片取り())) 既知.add(m[1]);
    }
    const 入れ物 = new Set(['docs', '.claude', '.github', '.github/workflows', '.claude/commands']);
    const 子付き = new Set([...字面, ...解けた].filter((p) => !入れ物.has(p)));

    if (!字面.size) {
      判定({ 対象: "B22 install が置く道を 既知の道 が覆うか", 状態: '未測', 根拠: "網が空振り(1件も拾えなかった)", 走査集合: null, 件数: null, 正本由来: null, 文: 'install が置く道の覆い: 網が1件も拾えませんでした(install.mjs の書き方が変わった可能性 ── 直すこと)' });
    } else if (!既知.size) {
      判定({ 対象: "B22 install が置く道を 既知の道 が覆うか", 状態: '未測', 根拠: "照らす相手が取り出せない(外す.mjs の 既知の道)", 走査集合: null, 件数: null, 正本由来: null, 文: 'install が置く道の覆い: 外す.mjs から 既知の道 を取り出せません(書き方が変わった?)' });
    } else {
      const 漏れ = [...子付き].filter((p) => !既知.has(p));
      const 名乗り = '親フォルダ ' + [...字面].filter((p) => 入れ物.has(p)).length + '件'
        + ' / 字面の子 ' + [...字面].filter((p) => !入れ物.has(p)).length + '件'
        + ' / 解決した子 ' + 解けた.size + '件'
        + ' / ★未解決の動的な子 ' + 未解決.length + '件';
      /* ① ラチェット(字面で見えた分の照合)── ここは常に効く */
      if (漏れ.length) {
        判定({ 対象: "B22 install が置く道を 既知の道 が覆うか", 状態: '赤', 根拠: "★字面と解決済みの子を照合して、既知の道 に無い【置く道】が在った", 走査集合: 名乗り, 件数: 漏れ.length, issueCount: 漏れ.length, 正本由来: null, 文: '★install が置く道を、外す側の 既知の道 が覆っていません(' + 漏れ.length + '件): '
          + 漏れ.join(' / ')
          + ' ── ★★置いた物が、外すとき【誰の物か分からない】に落ちます。'
          + '★★★外す.mjs の 既知の道 に足してください'
          + '(読むだけの行なら install 側に guardian:read を付ける)。【' + 名乗り + '】' });
      } else if (未解決.length) {
        /* ② 未解決が在るなら【覆っている】とは名乗らない(@codex 10:29) */
        判定({ 対象: "B22 install が置く道を 既知の道 が覆うか", 状態: '未測', 根拠: "未解決の動的な子が在る(親フォルダで数えているので、その下の子に気づけない)", 走査集合: null, 件数: null, 正本由来: null, 文: 'install が置く道の覆い: 字面で拾えた分は 既知の道 が覆っていますが、'
          + '★動的に組む子が ' + 未解決.length + '件 解決できません ── ' + 未解決.join(' / ')
          + ' ── ★★親フォルダで数えているので、その下に子を1本 足しても この検査は気づきません。'
          + '【' + 名乗り + '】' });
      } else {
        判定({ 対象: 'B22 install が置く道を 既知の道 が覆うか', 状態: '緑', 根拠: '字面と解決済みの子を全部 照合して、漏れが空だった',
          走査集合: 名乗り, 件数: 0, 正本由来: null,
          文: 'install が置く道は 外す側の 既知の道 が覆っている【' + 名乗り + '】' });
      }
    }
  } catch (e) {
    判定({ 対象: "B22 install が置く道を 既知の道 が覆うか", 状態: '未測', 根拠: "例外(この検査の中で落ちた)", 走査集合: null, 件数: null, 正本由来: null, 文: 'install が置く道の覆い: 測れませんでした(' + String(e && e.message).slice(0, 80) + ')' });
  }
}


/* ---------- B21. 「正本で測った」と書いた数が、古くなっていないか(2026-09-03、会議で @kozo が求め、@codex が P0 を出した) ----------
 *
 * ★外す.mjs の profileCoverage は「install.mjs が変わった版 23」と書いている。
 *   これは正本の git でしか測れない数で、書いた瞬間から古くなり始める。
 *
 * ★★最初の実装は【配布先で偽の赤】を出した(@codex の P0、実測で再現した):
 *   (a) git なし                    … 未測 ○
 *   (b) guardian の中で git init    … ✗ 赤「いま git は 1 版です」
 *   (c) 親が guardian を追跡        … ✗ 赤(同上)
 *   (d) 別の親 repo(未追跡)        … ✗ 赤(同上)★別のリポジトリの履歴を正本として測っていた
 *
 * ★★★@codex の契約:「正本由来を証明できない現場では、合否比較をせず【未測】。
 *   検出した根・問うた相対の道・現場の版数は【診断としてだけ】出し、赤の理由には使わない」
 *
 * ★ここで出来る証明(署名の仕組みは無いので、次の2つを重ねる):
 *   ① その git が【この install.mjs そのもの】を追っている
 *      = HEAD の中身が手元とバイトで一致する(別の repo なら そもそも無い)
 *   ② 履歴が、書いてある数以上に長い
 *      = 短ければ「この塊自身の歴史ではない」(配布先で git init した現場が これに当たる)
 *
 * ★★残る穴を、はっきり書く: 正本ではないのに、バイト一致する install.mjs を
 *   24回以上 触った repo が在れば、まだ偽の赤になる。★★★署名の仕組みが要る。 */
{
  let 書いた = null;
  try {
    const m = kit('外す.mjs').match(new RegExp('install' + String.fromCharCode(92) + '.mjs が変わった版 (' + String.fromCharCode(92) + 'd+)'));
    if (m) 書いた = Number(m[1]);
  } catch (_) {}
  const 診断 = [];
  if (書いた === null) {
    判定({ 対象: "B21 正本で測った数が古くないか", 状態: '未測', 根拠: "照らす相手が取り出せない(外す.mjs の版数)", 走査集合: null, 件数: null, 正本由来: null, 文: '正本で測った数: 外す.mjs に「install.mjs が変わった版 N」が在りません(書き方が変わった?)' });
  } else {
    /* ★問い合わせ先と pathspec の【基準を揃える】(24.13、2026-09-03、@codex が B として指した)。
     *
     *   ★★直す前: -C HERE で走らせながら、pathspec には ls-files --full-name の値
     *   (=リポジトリの根からの道)を渡していた。git の pathspec は cwd 基準なので、
     *   ★★★HERE が根でない現場では【必ず外れる】── 真の履歴3版に対して 0版 を返した(実測)。
     *
     *   ★これは A(正本由来の証明)とは別の穴である。A で未測に落として隠さず、B として直す。
     *   ★★直し: まず根を出し、以後の git は【根を cwd】にして、道も根からの道で渡す。 */
    const 根探し = spawnSync('git', ['-C', HERE, 'rev-parse', '--show-toplevel'],
      { encoding: 'utf8', windowsHide: true, timeout: 60000 });
    const 根 = (!根探し.error && 根探し.status === 0)
      ? String(根探し.stdout || '').trim() : null;
    const 基 = 根 || HERE;   /* 根が取れないなら HERE のまま(その時は履歴も取れない) */
    const g = (...a) => spawnSync('git', ['-C', 基, ...a],
      { encoding: 'utf8', windowsHide: true, timeout: 60000 });
    const gB = (...a) => spawnSync('git', ['-C', 基, ...a],
      { encoding: 'buffer', windowsHide: true, timeout: 60000 });
    const top = 根;
    /* ★根を cwd にしたので、install.mjs は そのままでは当たらない ── 根からの道で探す */
    const 相対 = (() => { const r = g('ls-files', '--full-name', '--', '*install.mjs');
      return (!r.error && r.status === 0) ? String(r.stdout || '').trim().split(String.fromCharCode(10))[0] : ''; })();
    診断.push('根=' + (top || '(git なし)'), '問うた道=' + (相対 || '(追跡されていません)'));
    let 同じバイト = false;
    if (相対) {
      const r = gB('cat-file', 'blob', 'HEAD:' + 相対);
      if (!r.error && r.status === 0 && r.stdout) {
        try {
          同じバイト = Buffer.compare(r.stdout, fs.readFileSync(path.join(HERE, 'install.mjs'))) === 0;
        } catch (_) {}
      }
    }
    const 実 = (() => {
      if (!相対) return null;
      const r = g('log', '--format=%H', '--follow', '--', 相対);
      if (r.error || r.status !== 0) return null;
      return String(r.stdout || '').split(String.fromCharCode(10)).filter((x) => x.trim()).length;
    })();
    診断.push('現場の版数=' + (実 === null ? '(取れません)' : 実), 'バイト一致=' + (同じバイト ? 'はい' : 'いいえ'));
    /* ★理由の【主文】は いつも同じ一文にする(24.14、2026-09-03、@codex 11:15)。
     *
     *   ★★直す前は括弧に「履歴が3版しかなく…」と書いていた。読む人は
     *   ★★★「履歴が短いのが理由だ」と読む ── すると【同じバイト＋長い履歴の偽 repo】に対して
     *   証明が足りていない事が、その文の陰に隠れる。
     *
     *   ★足りていないのは常に【正本由来の証明】である。履歴長・バイト一致・対象の道は
     *   ★★どれも【診断の補足】であって、理由ではない。 */
    const 主文 = '正本で測った数: ★正本由来を証明できません ── この現場が正本だと示す物が在りません'
      + '(署名や固定マニフェストの仕組みは まだ在りません)。書いてある数 ' + 書いた + ' は確かめません。';
    const 補足 = (何) => 主文 + ' ★★補足(理由では ありません): ' + 何 + '【' + 診断.join(' / ') + '】';
    /* ★【正本由来: true】の分岐を、丸ごと消す(26.1、2026-09-03、@codex 11:49 の P0)。
     *
     *   ★★25.0 で私は「バイト一致 ＋ 履歴の数が一致」を証明として true を出した。
     *   ★★★それは証明ではない ── 同じバイトの install.mjs を同じ回数 触った別の repo でも true になる。
     *   構造化したことで、**証明できていない主張が、機械が信じられる形へ昇格していた**。
     *
     *   ★@codex の条文:「署名/マニフェストを後続にするなら、
     *   ★★検証済みの true を出す分岐【自体】を、未導入の間は存在させないでください」。
     *
     *   ★★★だから この検査は【緑にも赤にもならない】── 署名の仕組みが入るまで、常に未測。
     *   失う物も書く: **install.mjs が変わったときに数え直しを促すラチェットは、ここで失われる。**
     *   それでも消すのは、嘘の true を機械に読ませる方が高くつくからである。 */
    const 一致 = (実 !== null && 実 === 書いた) ? "はい" : (実 === null ? "(測れません)" : "いいえ");
    診断.push("書いてある数=" + 書いた, "数の一致=" + 一致);
    判定({ 対象: "B21 正本で測った数が古くないか", 状態: "未測",
      根拠: "★正本由来を証明する仕組み(署名・固定マニフェスト)が この塊に在りません",
      走査集合: "install.mjs の履歴 1本", 件数: (実 === null ? null : 実),
      正本由来: false,
      文: 主文 + " ★★補足(理由では ありません): "
        + (!相対 || 実 === null ? "この現場は install.mjs を追跡していません"
           : !同じバイト ? "追跡されている install.mjs が手元と別のバイトです"
           : "履歴 " + 実 + " 版 / 書いてある数 " + 書いた + " と " + (一致 === "はい" ? "一致します" : "違います"))
        + "【" + 診断.join(" / ") + "】" });
  }
}


/* ---------- B20. 塊の半分どうしが【コードとは何か】で食い違っていないか(2026-09-03、会議で @kozo が「測っていない」と挙げた) ----------
 *
 * ★事故: 見る所の既定値が【3箇所】に在り、しかも値が違った。
 *   clock / codemap … site worker gas src app lib
 *   stop            … src app lib server web
 *
 *   ★★実測(watch を宣言していない現場):
 *     server/a.js … 合否の門は見るのに、地図は差し込まれない(codemap 0バイト)
 *     gas/a.js    … 地図は差し込まれるのに、合否の門が見ない
 *   ★★★**同じ塊の2つの半分が、「コードとは何か」で食い違っていた。**
 *
 * ★測り方は【綴りを読まない】── 正本(lib-root の 既定の見る所)を読み、
 *   ★★その全部の場所で 合図のフックが実際に反応するかを叩く。
 *   ★★★どこか1つでも黙れば、そのフックは正本より狭い所を見ている。
 *   (stop の側は同じ正本を import しているので構造で揃うが、**振る舞いは測っていない** ── HANDOVER に書く) */
{
  let 仮 = null, 既定 = null;
  /* ★ここは ESM なので createRequire を通す(2026-09-03、双子で未測が出て気づいた) */
  try { 既定 = __cr2(import.meta.url)('./hooks/lib-root.js').既定の見る所; } catch (_) {}
  if (!Array.isArray(既定) || !既定.length) {
    判定({ 対象: "B20 半分どうしが同じ見る所を使うか", 状態: '未測', 根拠: "正本(既定の見る所)が取り出せない", 走査集合: null, 件数: null, 正本由来: null, 文: "見る所の正本: hooks/lib-root.js が 既定の見る所 を出しません" });
  } else {
    try { 仮 = fs.mkdtempSync(path.join(os.tmpdir(), 'guardian-watch-')); } catch (_) {}
    if (!仮) 判定({ 対象: "B20 半分どうしが同じ見る所を使うか", 状態: '未測', 根拠: "作り物の場所が作れない", 走査集合: null, 件数: null, 正本由来: null, 文: "見る所の正本: 一時の場所が作れません" });
    else {
      try {
        fs.mkdirSync(path.join(仮, 'guardian', 'hooks'), { recursive: true });
        fs.mkdirSync(path.join(仮, 'docs'), { recursive: true });
        for (const f of fs.readdirSync(path.join(HERE, 'hooks')))
          fs.copyFileSync(path.join(HERE, 'hooks', f), path.join(仮, 'guardian', 'hooks', f));
        fs.writeFileSync(path.join(仮, 'docs', 'CODEMAP.md'),
          '# 地図' + String.fromCharCode(10,10) + '## 何か' + String.fromCharCode(10,10) + '接点: `どこにも無い.js`');
        fs.writeFileSync(path.join(仮, 'guardian.config.json'),
          JSON.stringify({ evidence: [{ name: "x", run: "node -e 0" }] }));   /* ★watch を宣言しない */
        const 黙 = [];
        for (const d of 既定) {
          fs.mkdirSync(path.join(仮, d), { recursive: true });
          fs.writeFileSync(path.join(仮, d, 'a.js'), 'x');
          const r = spawnSync(process.execPath, [path.join(仮, "guardian", "hooks", "codemap.js")],
            { cwd: 仮, input: JSON.stringify({ tool_input: { file_path: d + "/a.js", content: "x" } }),
              encoding: "utf8", windowsHide: true, timeout: 60000 });
          if (!String(r.stdout || "").trim()) 黙.push(d);
        }
        /* ★正本に無い所では黙る事も見る(広すぎないか) */
        fs.mkdirSync(path.join(仮, 'どこにも無い所'), { recursive: true });
        fs.writeFileSync(path.join(仮, 'どこにも無い所', 'a.js'), 'x');
        const r外 = spawnSync(process.execPath, [path.join(仮, "guardian", "hooks", "codemap.js")],
          { cwd: 仮, input: JSON.stringify({ tool_input: { file_path: "どこにも無い所/a.js", content: "x" } }),
            encoding: "utf8", windowsHide: true, timeout: 60000 });
        const 外も反応 = !!String(r外.stdout || "").trim();
        if (黙.length) {
          判定({ 対象: 'B20 半分どうしが同じ見る所を使うか', 状態: '赤', 根拠: '正本に在るのに黙る所が出た', 走査集合: '既定の見る所(' + 既定.length + '箇所)', 件数: 黙.length, 正本由来: null, 文: "★塊の半分どうしが【コードとは何か】で食い違っています ── 正本(既定の見る所)に在るのに、地図が差し込まれない所が " + 黙.length + "件: " + 黙.join(", ") + ' ── ★★合否の門は見るのに地図は来ない、という現場が生まれます。' + '★★★既定値は hooks/lib-root.js の 既定の見る所 が正本です。' });
        } else if (外も反応) {
          判定({ 対象: "B20 半分どうしが同じ見る所を使うか", 状態: '赤', 根拠: "★正本に無い場所でも反応した(見る所の絞りが効いていない)", 走査集合: '既定の見る所(' + 既定.length + '箇所)＋外1件', 件数: 1, issueCount: 1, 正本由来: null, 文: "★正本に無い場所でも地図が差し込まれます ── 見る所の絞りが効いていません" });
        } else {
          判定({ 対象: 'B20 半分どうしが同じ見る所を使うか', 状態: '緑', 根拠: '★正本の全箇所で叩いて、黙る所が空だった', 走査集合: '既定の見る所(' + 既定.length + '箇所)＋外1件', 件数: 0, 正本由来: null, 文: "塊の半分どうしが同じ【見る所】を使っている(正本 " + 既定.length + " 箇所ぶん叩いた・外では黙る)" });
        }
      } catch (e) {
        判定({ 対象: "B20 半分どうしが同じ見る所を使うか", 状態: '未測', 根拠: "例外(この検査の中で落ちた)", 走査集合: null, 件数: null, 正本由来: null, 文: "見る所の正本: 測れませんでした(" + String(e && e.message).slice(0, 80) + ")" });
      } finally {
        try { fs.rmSync(仮, { recursive: true, force: true }); } catch (_) {}
      }
    }
  }
}

/* ---------- B19. 宣言で道を変えた現場で、出力が【既定値の名前】を言わないか(2026-09-03、会議で @kozo が見つけた) ----------
 *
 * ★事故: hooks/codemap.js は CFG.map を読んで地図を開くのに、
 *   ★★文には CODEMAP.md をべた書きしていた(5行)。
 *   ★★★実測(map: "docs/私の地図.md" の現場): 「… 項は CODEMAP.md に無い」と出た ──
 *   **その現場に存在しない道**を、人に見に行かせる形だった。
 *
 * ★書き手は分かっていた ── 読めない時の文だけは実際の道を出していた。他に届いていなかった。
 *
 * ★★測り方は【綴りを読まない】── それがこの塊の掟である。
 *   ★★★珍しい名前を宣言した現場で実際に叩き、**出力に既定値の名前が出ないか**を見る。
 *   (綴りで測ると、注釈や履歴の記述まで拾って偽陽性になる) */
{
  let 仮 = null;
  try { 仮 = fs.mkdtempSync(path.join(os.tmpdir(), 'guardian-map-')); } catch (_) {}
  if (!仮) 判定({ 対象: "B19 出力は実際に読んだ道の名で言うか", 状態: '未測', 根拠: "作り物の場所が作れない", 走査集合: null, 件数: null, 正本由来: null, 文: "宣言で道を変えた現場の出力: 一時の場所が作れません" });
  else {
    try {
      fs.mkdirSync(path.join(仮, 'guardian', 'hooks'), { recursive: true });
      fs.mkdirSync(path.join(仮, 'docs'), { recursive: true });
      fs.mkdirSync(path.join(仮, 'src'), { recursive: true });
      for (const f of fs.readdirSync(path.join(HERE, 'hooks')))
        fs.copyFileSync(path.join(HERE, 'hooks', f), path.join(仮, 'guardian', 'hooks', f));
      const 珍 = "docs/この現場だけの地図.md";
      fs.writeFileSync(path.join(仮, 'guardian.config.json'),
        JSON.stringify({ evidence: [{ name: "x", run: "node -e 0" }], map: 珍, watch: ["src"] }));
      fs.writeFileSync(path.join(仮, ...珍.split('/')), '# 地図' + String.fromCharCode(10, 10)
        + '## 何かの機能' + String.fromCharCode(10, 10) + '接点: `src/b.js`' + String.fromCharCode(10));
      fs.writeFileSync(path.join(仮, 'src', 'a.js'), 'x' + String.fromCharCode(10));
      const r = spawnSync(process.execPath, [path.join(仮, "guardian", "hooks", "codemap.js")],
        { cwd: 仮, input: JSON.stringify({ tool_input: { file_path: "src/a.js" } }),
          encoding: "utf8", windowsHide: true, timeout: 60000 });
      const 出 = String(r.stdout || "") + String(r.stderr || "");
      if (!出.trim()) {
        判定({ 対象: "B19 出力は実際に読んだ道の名で言うか", 状態: '未測', 根拠: "叩いたが出力が空(この作り物ではその道に入らない)", 走査集合: null, 件数: null, 正本由来: null, 文: "宣言で道を変えた現場の出力: 何も出ませんでした(この作り物では測れません)" });
      } else if (出.includes("CODEMAP.md")) {
        判定({ 対象: 'B19 出力は実際に読んだ道の名で言うか', 状態: '赤', 根拠: '既定値の名前が出力に出た', 走査集合: '珍しい名前を宣言した作り物 1件', 件数: 1, 正本由来: null, 文: "★宣言で地図の道を変えた現場なのに、出力が【既定値の名前】CODEMAP.md を言っています" + ' ── ★★この現場が読んでいるのは ' + 珍 + ' です。' + '★★★人は【存在しないかもしれない道】を見に行きます(実際に 5行 在りました)。' });
      } else if (!出.includes(珍)) {
        判定({ 対象: "B19 出力は実際に読んだ道の名で言うか", 状態: '未測', 根拠: "出力にどちらの名前も出ない(その道を通っていない)", 走査集合: null, 件数: null, 正本由来: null, 文: "宣言で道を変えた現場の出力: 既定値も宣言した道も出ませんでした(この道は通っていません)" });
      } else {
        判定({ 対象: 'B19 出力は実際に読んだ道の名で言うか', 状態: '緑', 根拠: '★叩いた出力に既定値の名前が出ず、宣言した道が出た', 走査集合: '珍しい名前を宣言した作り物 1件', 件数: 0, 正本由来: null, 文: "宣言で地図の道を変えた現場では、出力も【その道】の名で言う(既定値をべた書きしていない)" });
      }
    } catch (e) {
      判定({ 対象: "B19 出力は実際に読んだ道の名で言うか", 状態: '未測', 根拠: "例外(この検査の中で落ちた)", 走査集合: null, 件数: null, 正本由来: null, 文: "宣言で道を変えた現場の出力: 測れませんでした(" + String(e && e.message).slice(0, 60) + ")" });
    } finally {
      try { fs.rmSync(仮, { recursive: true, force: true }); } catch (_) {}
    }
  }
}

/* ---------- B18. 黙って通る道は【このファイルが宣言しているか】(2026-09-03、会議で @kozo が2度 直させた) ----------
 *
 * ★最初の形は【手で並べた3行の表】だった。@kozo が読んで指した:
 *   ★★「あなたが 23.x で 外す.mjs から消した形が、24.5 で検査の側に戻っています」
 *   ★★★「B18 は、この表に無い通す道を【見つけられません】」
 *
 *   叩いたら、その通りだった ── ★hooks を全部 × 3条件 = 21マス のうち
 *   ★★【12マスが黙って通っていた】(4ファイル)。手書きの表は1つも見ていなかった。
 *
 * ★★★直した形: 母集団を【hooks/ の全部 × 条件】にする(数えるので、思い出さなくてよい)。
 *   黙ってよい理由は【そのファイル自身】が宣言する ── 
 *   ★離れた表に書くと、道を足す人と表を直す人が別の場所に居ることになる。
 *   これは 書き手 でやった形と同じ:★★「書いた者が台帳に載せる」。通す者が載せる。
 *
 * ★宣言の綴り(ファイルの頭のコメント):
 *   @通す道: <条件> ── 通すが、必ず言う
 *   @黙る道: <条件 または 全部> ── 黙ってよい理由
 *
 * ★★測るのは stderr と stdout の【両方】── どちらも空で、止めてもいなければ「黙って通った」。
 *   出口では測らない(フックは decision で言うので、出口は常に0)。 */
{
  const 条件 = [
    { 名: "正しい設定", 設定: "{\"evidence\":[{\"name\":\"x\",\"run\":\"node -e 0\"}],\"watch\":[\"src\"]}", 入力: "{\"tool_input\":{\"file_path\":\"src/a.js\",\"content\":\"x\"}}" },
    /* ★★カンマの欠けは【わざと】である(2026-09-03、@kozo が「次の人が直す」と指した)。
     *   ★★★ここを直すと、この作り物は別の道(evidence が空)を測ることになる。 */
    { 名: "設定が壊れている", 設定: "{\"evidence\":[{\"name\":\"x\"} \"watch\":[\"src\"]}", 入力: "{\"tool_input\":{\"file_path\":\"src/a.js\",\"content\":\"x\"}}" },
    { 名: "入力が読めない", 設定: "{\"evidence\":[{\"name\":\"x\",\"run\":\"node -e 0\"}],\"watch\":[\"src\"]}", 入力: "これはJSONでない" },
  ];
  let 仮 = null;
  try { 仮 = fs.mkdtempSync(path.join(os.tmpdir(), 'guardian-say-')); } catch (_) {}
  if (!仮) 判定({ 対象: "B18 通した道は通したと言うか", 状態: '未測', 根拠: "作り物の場所が作れない", 走査集合: null, 件数: null, 正本由来: null, 文: "黙って通る道の宣言: 一時の場所が作れません" });
  else {
    try {
      fs.mkdirSync(path.join(仮, 'guardian', 'hooks'), { recursive: true });
      fs.mkdirSync(path.join(仮, 'src'), { recursive: true });
      fs.mkdirSync(path.join(仮, 'docs'), { recursive: true });
      fs.writeFileSync(path.join(仮, 'src', 'a.js'), 'x');
      fs.writeFileSync(path.join(仮, 'docs', 'CODEMAP.md'),
        '# 地図' + String.fromCharCode(10,10) + '## 何か' + String.fromCharCode(10,10) + '接点: `src/b.js`');
      const 皆 = fs.readdirSync(path.join(HERE, 'hooks')).filter((f) => f.endsWith('.js'));
      for (const f of 皆)
        fs.copyFileSync(path.join(HERE, 'hooks', f), path.join(仮, 'guardian', 'hooks', f));
      const 黙 = [], 宣言なし = [];
      for (const f of 皆) {
        const src = fs.readFileSync(path.join(HERE, 'hooks', f), 'utf8');
        const 黙る道 = [...src.matchAll(new RegExp("@黙る道:\\s*([^\\s─]+)", "g"))].map((m) => m[1]);
        const 通す道 = [...src.matchAll(new RegExp("@通す道:\\s*([^\\s─]+)", "g"))].map((m) => m[1]);
        const 宣言0 = (!黙る道.length && !通す道.length);
        for (const c of 条件) {
          fs.writeFileSync(path.join(仮, 'guardian.config.json'), c.設定);
          const r = spawnSync(process.execPath, [path.join(仮, "guardian", "hooks", f)],
            { cwd: 仮, input: c.入力, encoding: "utf8", windowsHide: true, timeout: 60000 });
          const 出 = String(r.stdout || "");
          const 言 = String(r.stderr || "");
          if (出.includes("\"block\"") || 出.includes("\"deny\"")) continue;   /* 止めた道は「通した道」ではない */
          if (出.trim() || 言.trim()) continue;                                 /* 何か言っている */
          const 許 = 黙る道.includes(c.名) || 黙る道.includes("全部");
          if (!許) 黙.push(f + "(" + c.名 + ")");
        }
        /* ★赤になった物は ここで数えない ── 赤と未測を同じ物に付けると【文が嘘になる】
         *   (2026-09-03、双子を回して自分で見つけた: 赤なのに「赤にはしていません」と出た) */
        if (宣言0 && !黙.some((x) => x.indexOf(f + "(") === 0)) 宣言なし.push(f);
      }
      if (黙.length) {
        判定({ 対象: 'B18 通した道は通したと言うか', 状態: '赤', 根拠: '通ったのに stdout も stderr も空', 走査集合: 'hooks/*.js × 条件', 件数: 黙.length, 正本由来: null, 文: "★宣言に無い【黙って通る道】が在ります(" + 黙.length + "件): " + 黙.join(" / ") + ' ── ★★そのファイルの頭に @黙る道: <条件> ── <黙ってよい理由> を書くか、' + '言うようにしてください。★★★通ったことがどこにも残らないと、次に同じ形を見つけた人が' + '「そういう道が在る」のか「たまたま黙った」のかを区別できません。' });
      } else {
        判定({ 対象: 'B18 通した道は通したと言うか', 状態: '緑', 根拠: '★集合を走査して、宣言に無い黙りが空だった', 走査集合: 'hooks/*.js(' + 皆.length + '本) × 条件(' + 条件.length + '通り)', 件数: 0, 正本由来: null, 文: "黙って通る道は すべて そのファイル自身が宣言している(hooks " + 皆.length + "本 × 条件 " + 条件.length + "通り)" });
      }
      if (宣言なし.length)
        判定({ 対象: "B18 通した道は通したと言うか", 状態: '未測', 根拠: "宣言が1本も無いフックが在る(赤にはしていない ── この作り物では黙らなかったので)", 走査集合: null, 件数: null, 正本由来: null, 文: "黙って通る道の宣言: 宣言が1本も無いフックが在ります(" + 宣言なし.join(", ") + ")── この作り物では黙らなかったので赤にはしていません" });
    } catch (e) {
      判定({ 対象: "B18 通した道は通したと言うか", 状態: '未測', 根拠: "例外(この検査の中で落ちた)", 走査集合: null, 件数: null, 正本由来: null, 文: "黙って通る道の宣言: 測れませんでした(" + String(e && e.message).slice(0, 80) + ")" });
    } finally {
      try { fs.rmSync(仮, { recursive: true, force: true }); } catch (_) {}
    }
  }
}

/* ---------- B16. 低い層の module は、読み込んだだけで何も起こさないか(2026-09-03、会議で @codex が出し @kozo が叩いた) ----------
 *
 * ★なぜ要るか: この検査は `書き手.cjs` と `道.cjs` を **import している**。
 *   ★★読み込んだだけで何かが起きる module を import すると、
 *   ★★★検査を回すこと自体が現場を変える ── 計器が対象を動かす形になる。
 *
 * ★静的に「top-level の文が在るか」を見る網では足りない(@kozo が2つ持っていた) ──
 *   ★★require の先(fs / path / child_process)の副作用までは、叩かないと分からない。
 *
 * ★★★だから【隔離した子で実際に読み込む】(@codex の形):
 *   一時の場所で全木を採る → node -e "require(絶対の道)" → もう一度 採る
 *   出口0 / stdout 0バイト / stderr 0バイト / 木の差 0
 *
 * ★2回 読み込む ── ★★「初回だけ何か作る」形を落とさないため(@kozo が測っていないと書いた所)。
 *
 *   ★★★ただし【同じ子の中で 2回 require しても、2回目は Node の module cache に当たる】
 *   (2026-09-03、会議で @codex が指摘し、実測で確かめた:
 *    同じ process で2回 → top-level は1回しか走らない / 別の子で1回ずつ → 2回 走る)。
 *   ★だから【別の子を2回】起こし、★★境目ごとに別々に比べる ── 前→1回目 と 1回目→2回目。
 *   ★★★まとめて前後だけ見ると「1回目に作り、2回目に消す」副作用が相殺されて見えなくなる。
 *
 * ★★★この門の値打ちは【これから】に在る: 誰かが top-level に1行 足した瞬間に赤くなる。
 *   その1行は、たぶん善意で足される(設定を読んでおこう / ログを1行)。
 *   ★足す人は、この検査がその module を import している事を知らない。門なら、知らなくても止まる。 */
{
  const 低い層 = ['書き手.cjs', '道.cjs'];
  const 汚した = [];
  let 測れた = 0;
  for (const rel of 低い層) {
    const 絶対 = path.join(HERE, rel);
    if (!fs.existsSync(絶対)) { 未測.push(rel + " が在りません(読み込みの門を回せません)"); continue; }
    let 仮 = null;
    try { 仮 = fs.mkdtempSync(path.join(os.tmpdir(), "guardian-load-")); } catch (_) {
      未測.push("読み込みの門: 一時の場所が作れません"); continue;
    }
    try {
      const 採る = () => {
        const 出 = [];
        const 歩く = (d, 相対) => {
          let es = [];
          try { es = fs.readdirSync(d, { withFileTypes: true }); } catch (_) { return; }
          for (const e of es.sort((a, b) => (a.name < b.name ? -1 : 1))) {
            const q = 相対 ? 相対 + "/" + e.name : e.name;
            if (e.isDirectory()) { 出.push(q + "/"); 歩く(path.join(d, e.name), q); }
            else { let n = -1; try { n = fs.statSync(path.join(d, e.name)).size; } catch (_) {} 出.push(q + " " + n); }
          }
        };
        歩く(仮, "");
        return 出.join(String.fromCharCode(10));
      };
      const 訴え = [];
      /* ★別の子を2回 起こし、★★境目ごとに別々に比べる(同じ子だと2回目は cache に当たる) */
      let 印 = 採る();
      for (let 回 = 1; 回 <= 2; 回++) {
        const r = spawnSync(process.execPath, ["-e", "require(" + JSON.stringify(絶対) + ");"],
          { cwd: 仮, encoding: "utf8", windowsHide: true, timeout: 60000 });
        if (r.status !== 0) 訴え.push(回 + "回目: 出口 " + r.status);
        if ((r.stdout || "").length) 訴え.push(回 + "回目: stdout " + r.stdout.length + "バイト");
        if ((r.stderr || "").length) 訴え.push(回 + "回目: stderr " + r.stderr.length + "バイト: "
          + String(r.stderr).split(String.fromCharCode(10))[0].slice(0, 80));
        const 後 = 採る();
        if (印 !== 後) 訴え.push(回 + "回目: 読み込んだ場所の木が変わりました");
        印 = 後;
      }
      if (訴え.length) 汚した.push(rel + "(" + 訴え.join(" / ") + ")");
      測れた++;
    } finally {
      try { fs.rmSync(仮, { recursive: true, force: true }); } catch (_) {}
    }
  }
  if (汚した.length) {
    ng.push("★読み込んだだけで何かが起きる module が在ります(" + 汚した.length + "件): " + 汚した.join(", ")
      + " ── ★★この検査はその module を import しています。"
      + "★★★読み込みで何かが起きると、検査を回すこと自体が現場を変えます(計器が対象を動かす)");
  } else if (測れた) {
    ok.push("低い層の module は、読み込んでも何も起こさない(" + 測れた + "件 ── ★別の子を2回 起こし、★★境目ごとに 出口0 / 出力0バイト / 木の差0)");
  }
}

/* ---------- B15. 道の一覧を、共通の口の外で取っていないか(2026-09-03、会議で @codex が形を出した) ----------
 *
 * ★事故は2つ、続けて起きた:
 *   ① git は非ASCIIの道を**クォートして**返す(17.2 で切った)
 *   ② ★★クォートを切っても `.trim().split(改行)` は**空白を持つ道を壊す**
 *
 * ```
 * 在るファイル : " leading.mjs" / "middle space.mjs" / "trailing .mjs" / "日本語.mjs"
 * trim().split : ["leading.mjs", ...]   ← ★先頭の空白が消え、★★実在しない道になる
 * -z + NUL 割り: [" leading.mjs", ...]  ← ★★★正しい
 * ```
 *
 * ★★壊れ方が悪い: 消えた道は【無かったこと】になる。エラーも出ないし、
 *   ★★★「見なかった」とも言わない ── 届いていないので、居たことすら知らない。
 *
 * ★門の形(@codex の案): **道の一覧を返す git を、共通の口の外で叩いていたら赤。**
 *   ★★1つ1つの trim を追いかけるのではなく、【入口を1本にする】ことを見張る。 */
{
  /* ★道の一覧を返す下位命令 ── ★★status は道にしていないので、ここには入れない
   *   (実測: neighbors の status は真偽にしか使っておらず、道を壊していない) */
  const 道を返す命令 = ['ls-files', 'diff-tree', 'diff-index'];
  const 外で叩いている = [];
  for (const rel of ENGINE_FILES.filter((x) => /\.(mjs|cjs|js)$/.test(x))) {
    if (rel === '道.cjs') continue;              /* ★ここが唯一の口 */
    let t = null;
    try { t = fs.readFileSync(path.join(HERE, rel), "utf8"); } catch (_) { continue; }
    /* ★改行の定数は、この現場では NL2 である ── ★★NL は無い(B13 で一度 踏んだ形)。
     *   ★★★ここは字面で作る(名前を思い出さなくてよい形にする)。 */
    for (const 行 of t.split(String.fromCharCode(10))) {
      if (!/spawnSync\s*\(\s*['"`]git['"`]/.test(行)) continue;
      const 命令 = 道を返す命令.find((c) => 行.includes("'" + c + "'") || 行.includes('"' + c + '"'));
      const 名前だけ = /--name-only|--name-status/.test(行);
      if (命令 || 名前だけ) 外で叩いている.push(rel + ": " + (命令 || "--name-only"));
    }
  }
  if (外で叩いている.length) {
    ng.push("★道の一覧を、共通の口(道.cjs)の外で取っています(" + 外で叩いている.length + "件): "
      + 外で叩いている.join(", ") + " ── ★★行では割れません。"
      + "先頭・末尾に空白を持つ道が壊れ、★★★実在しない道になります(エラーは出ません)。"
      + "道.cjs の 道を取る() を通してください");
  } else {
    ok.push("道の一覧は、共通の口(道.cjs)だけが取っている ── ★-z と NUL で割り、整形しない");
  }
}

/* ---------- B14. 正本の綴りが、写しを持っていないか(2026-09-03、会議で @kozo が数えた) ----------
 *
 * ★事故: 台帳の道が【5箇所】に直書きされていた(綴りはここに書かない ── ★★書けば これも写しになる)。
 *   ★★書き手.cjs に正本の関数を作った【あと】に、写しが 3箇所 → 5箇所に増えた。
 *   ★★★正本が在るのに写しが同居する形は、無いより悪い ──
 *   「正本が在る」と思って読む人が居て、実際には5箇所が独立に決めているから。
 *
 * ★@codex の指摘: 関数(絶対の道)だけでは足りない。★★外す側は【相対の綴り】で比べる。
 *   だから正本は【対】で持ち、どちらかを必ず使う。
 *
 * ★★★門の形も @codex の案: **正本の1枚以外にその綴りが1件でも在れば赤**。
 *   ★これは「同じ意味の値が複数箇所にある」(この塊の一番の敵)の、いちばん硬い見張り方である。
 *   ★★増やす時は、この一覧に1行 足す ── 足す手が要ることが、抑えになる。 */
{
  /* ★綴り → その綴りを持ってよい唯一のファイル */
  const 正本 = [
    /* ★綴りは【正本から受け取る】(2026-09-03、@codex の線)。
     *   ★★直す前は '導入台帳' + '.json' と切って書いていた ── 検査自身が写しにならないための逃げ。
     *   ★★★逃げも写しである: 正本の綴りが変わっても、この文字列は変わらない。
     *   import すれば、正本が変わった瞬間にこの検査も一緒に変わる。 */
    { 綴り: 書き手の口.台帳の相対.split('/').pop(), 正本: '書き手.cjs', 名: '台帳の道' },
  ];
  const 写し = [];
  for (const 件 of 正本) {
    /* ★見るのは【コード】だけ ── ★★文書は道を名指ししてよい(読む人に教えるため)。
     *   実測: 直す前は install.md が引っかかった。★★★案内から道を消したら、案内でなくなる。 */
    for (const rel of ENGINE_FILES.filter((x) => /.(mjs|cjs|js)$/.test(x))) {
      if (rel === 件.正本) continue;
      let t = null;
      try { t = fs.readFileSync(path.join(HERE, rel), "utf8"); } catch (_) { continue; }
      if (t.includes(件.綴り)) 写し.push(件.名 + ": " + rel + "(正本は " + 件.正本 + ")");
    }
  }
  if (写し.length) {
    ng.push("★正本が在るのに、綴りの写しが残っています(" + 写し.length + "件): " + 写し.join(", ")
      + " ── ★★正本を呼んでください。★★★正本と写しが同居する形は、正本が無いより悪い"
      + "(「正本が在る」と思って読む人が居て、実際には別々に決まっているため)");
  } else {
    ok.push("正本の綴りに写しは無い(" + 正本.length + "件とも、正本の1枚だけが持っている)");
  }
}

/* ---------- B13b. 除外の理由が、まだ生きているか(2026-09-03、会議の提案) ----------
 *
 * ★B13 は「配る物が現場の物に依存していたら赤」を見る。★★その逆を見るのが ここ。
 *   `配らない道` に載っている物が、★★★まだ その依存を持っているか。
 *
 * ★なぜ要るか: 除外の理由は【コメント】に書いてあり、機械は読めない。
 *   ★★誰かが将来その依存を切っても、除外は残り続ける ──
 *   ★★★理由の無いまま配られない1本ができ、誰も気づかない(撤去日の無い旧経路)。
 *
 * ★落とす理由: この塊の自己検査には【注意】の置き場が無い(ok / ng / 未測 の3つ)。
 *   ★★黙って残るより、赤で止めて人に決めさせる方が、この塊の掟に合う。
 *   ★★★直しは1行(配らない道 から外す)なので、止められても高くつかない。 */
{
  const src = (() => { try { return fs.readFileSync(path.join(HERE, "pull.mjs"), "utf8"); } catch (_) { return ""; } })();
  const h道 = src.indexOf("const 配らない道 = new Set([");
  const 道一覧 = h道 < 0 ? []
    : [...src.slice(h道, src.indexOf("]);", h道)).matchAll(/'([^']+)'/g)].map((m) => m[1]);
  const h現場 = src.indexOf("const 現場のもの = new Set([");
  const 現場2 = h現場 < 0 ? []
    : [...src.slice(h現場, src.indexOf("]);", h現場)).matchAll(/'([^']+)'/g)].map((m) => m[1]);
  if (!道一覧.length) {
    ok.push("配らない道は空(除外が1件も無いので、理由が死ぬ心配も無い)");
  } else {
    const 理由なし = [];
    for (const rel of 道一覧) {
      let s2 = "";
      try { s2 = fs.readFileSync(path.join(HERE, rel), "utf8"); } catch (_) { continue; }
      let 依存 = false;
      for (const m of s2.matchAll(/(?:require|import)\s*\(([^)]*)\)/g)) {
        const 片 = [...m[1].matchAll(/['"`]([^'"`]+)['"`]/g)].map((x) => x[1]);
        if (!片.length) continue;
        const 道 = 片.join("/");
        if (現場2.some((名) => 道.split("/").includes(名))) { 依存 = true; break; }
      }
      if (!依存) 理由なし.push(rel);
    }
    if (理由なし.length) {
      ng.push("★配らない道 に、理由が無くなった物が在ります(" + 理由なし.length + "件): "
        + 理由なし.join(", ") + " ── ★★現場の物に依存しなくなっています。"
        + "★★★配ってよいなら pull.mjs の 配らない道 から外してください。"
        + "外さない理由が別に在るなら、その理由をコメントに書き直してください");
    } else {
      ok.push("配らない道の理由は、まだ生きている(" + 道一覧.length + "件とも、現場の物に依存している)");
    }
  }
}

/* B8b. 【install が2回目に判断を変えないか】(2026-08-30、違和感の掘り出しで見つかった)。
 *
 * ★実際に起きた: `CC`(この現場は Claude Code か)の判定材料に `CLAUDE.md` が入っていたが、
 *   **その CLAUDE.md は同じ install が下(手順6)で作る**。だから
 *     1回目「この現場に Claude Code の仕掛けが見当たらないので、フックは入れていません」+ CLAUDE.md 作成
 *     2回目(**何も変えずに**)「フックを4本足しました」
 *   ── 冪等が破れ、**他所の道具の現場に勝手にフックが入る**。
 * ★**冪等とは「2回目が1回目と同じ」ではなく「2回目が、1回目の出力を見ない」**である。
 * ★理屈で確かめない ── 見本を建てて**2回回す**(この事故は理屈の上では起きないので)。
 *   ついでに、判定が効くべき現場(人が書いた CLAUDE.md / .claude)でも入ることを見る
 *   ── 片側だけ見る検査は「何も入れない」に退化しても緑になる。 */
{
  const 仮 = 見本を建てる('guardian-cc-');
  try {
    /* 見本を建てる: 塊は <根>/guardian/ に置き、install が読むものだけ用意する */
    const 建てる = (名, 仕込み) => {
      const 根 = path.join(仮, 名);
      const 塊 = path.join(根, 'guardian');
      fs.mkdirSync(path.join(塊, 'templates'), { recursive: true });
      fs.mkdirSync(path.join(根, 'src'), { recursive: true });
      fs.writeFileSync(path.join(根, 'src', 'a.js'), 'export const a = 1;\n');
      fs.mkdirSync(path.join(根, '.git'), { recursive: true });      // 根の目印
      /* ★見本の塊に selfcheck.mjs を置かない ── install は手順7で selfcheck を回すので、
       *   置くと【この検査が install を呼び、その install が selfcheck を呼ぶ】無限の入れ子になる
       *   (実測: 最初にそう書いたら、返ってこなくなった)。
       *   ここで測るのは install の判定だけなので、塊は install.mjs と templates/ で足りる。 */
      /* ★install が【起動時に取り込む物】も一緒に置く(2026-09-03)。
       *   ★★直す前は install.mjs だけ置いていた。書き手.cjs を足した日に install は
       *   読み込みで落ち、この検査は「人が書いた CLAUDE.md の現場で入らなかった」と出した ──
       *   ★★★赤くはなったが、理由が違う。落ちたことは、どこにも出ていなかった。
       *   selfcheck を置かない理由(無限の入れ子)は下のとおりで、これらは呼び返さない。 */
      for (const 要る of ['install.mjs', '書き手.cjs', '台帳.mjs'])
        fs.copyFileSync(path.join(HERE, 要る), path.join(塊, 要る));
      for (const t of fs.readdirSync(path.join(HERE, 'templates')))
        fs.copyFileSync(path.join(HERE, 'templates', t), path.join(塊, 'templates', t));
      仕込み(根);
      return { 根, 塊 };
    };
    const 落ちた = [];
    const 回す = ({ 根, 塊 }, 名前, ...引数) => {
      const r = spawnSync(process.execPath, [path.join(塊, 'install.mjs'), ...引数],
        { cwd: 根, encoding: 'utf8', windowsHide: true, timeout: 60000 });
      /* ★出口と stderr を捨てない(2026-09-03)。捨てると【落ちた】が【入らなかった】に化ける。 */
      const 出 = String(r.stdout || '') + String(r.stderr || '');
      if (r.status !== 0 || !出.trim()) {
        /* ★理由の行は【Error の行】を拾う ── 末尾は 'Node.js v24.x' で、読んでも何も分からない */
        const 並 = 出.trim().split(String.fromCharCode(10)).map((l) => l.trim()).filter(Boolean);
        const 訳 = 並.find((l) => /Error|error:/.test(l)) || 並[並.length - 1] || '(何も言わずに終わった)';
        落ちた.push(名前 + ': 出口 ' + r.status + ' / ' + 訳.slice(0, 120));
      }
      return 出;
    };
    const 入った = (出) => /フックを \d+ 本足しました|フックは登録済み/.test(出);

    /* ① 他の道具の現場 ── 何回回しても入らない(これが破れていた) */
    const 他所 = 建てる('other', () => {});
    const 一度目 = 回す(他所, '他所①'), 二度目 = 回す(他所, '他所②'), 三度目 = 回す(他所, '他所③');
    /* ② 人が書いた CLAUDE.md が在る現場 ── 入る */
    const 人 = 建てる('human', (根) => fs.writeFileSync(path.join(根, 'CLAUDE.md'), '# うちの規範\n\nテストは npm test。\n'));
    const 人の結果 = 回す(人, '人の CLAUDE.md');
    /* ③ .claude が在る現場 ── 入る */
    const 一式 = 建てる('cc', (根) => fs.mkdirSync(path.join(根, '.claude'), { recursive: true }));
    const 一式の結果 = 回す(一式, '.claude が在る');
    /* ④ --hooks で強制 ── 入る */
    const 強制 = 建てる('force', () => {});
    const 強制の結果 = 回す(強制, '--hooks', '--hooks');
    /* ⑤ --no-hooks で強制オフ ── .claude が在っても入らない(逃げ道が効くこと) */
    const 拒否 = 建てる('nohooks', (根) => fs.mkdirSync(path.join(根, '.claude'), { recursive: true }));
    const 拒否の結果 = 回す(拒否, '--no-hooks', '--no-hooks');

    const 外れ = [];
    /* ★落ちたなら、それを先に言う ── 判定の話にすり替えない */
    if (落ちた.length) 外れ.push('★install が落ちています(判定以前の話): ' + 落ちた.join(' / '));
    if (入った(一度目)) 外れ.push('1回目で入った');
    if (入った(二度目)) 外れ.push('**2回目で入った**(1回目が作った CLAUDE.md を根拠にしている)');
    if (入った(三度目)) 外れ.push('3回目で入った');
    if (!入った(人の結果)) 外れ.push('人が書いた CLAUDE.md の現場で入らなかった');
    if (!入った(一式の結果)) 外れ.push('.claude が在る現場で入らなかった');
    if (!入った(強制の結果)) 外れ.push('--hooks を付けても入らなかった');
    if (入った(拒否の結果)) 外れ.push('--no-hooks を付けたのに入った');
    if (外れ.length) ng.push('install の Claude Code 判定が期待どおりではありません: ' + 外れ.join(' / '));
    else ok.push('install は2回目でも判断を変えない(他所の道具の現場に、回すたびにフックが増えない)');
  } catch (e) {
    /* ★見本が建てられなかったことを【緑にしない】(何も見ていないので) */
    未測.push('install の Claude Code 判定は見ていません(見本を建てられませんでした: '
      + String(e && e.message).slice(0, 120) + ')');
  } finally {
    try { fs.rmSync(仮, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch (_) { /* ★残ったことは、走り終わりの検査が赤で言う(黙らせていない) */ }
  }
}

/* B8a. 【フックが、その現場で本当に起動するか】(2026-08-30、配布先からの報告⑤)。
 *
 * ★実際に起きた: 配布先の `package.json` に `"type": "module"` が在ると、
 *   `guardian/hooks/*.js` は ESM 扱いになり `require is not defined` で落ちる。
 *   **フックは失敗しても黙って通す設計(44条)なので、5本とも静かに全滅する。**
 *   検査自身が「報告は成功と出るので気づけません」と書いている、その形そのもの。
 *   実測: 空リポ + type:module + degit + install → 5本とも ReferenceError。
 * ★こちらでは一生出ない ── この塊の直下に package.json が無かったから。
 *   「自分の静かな現場で測ると、自分の現場の性質が見えない」の、これで6件目。
 * ★直しは `guardian/package.json` に `{"type":"commonjs"}` の1枚。
 *   だが**直したことを測らないと、次に誰かが消したときにまた静かに死ぬ**。だからここで起動を測る。
 * ★測るのは【起動するか】だけ ── 中身の判断は各フックの仕事で、ここでは見ない。 */
{
  const 仮 = 見本を建てる('guardian-hook-');
  try {
    /* 見本: その現場が ESM だと宣言している状態を作る */
    fs.mkdirSync(path.join(仮, 'guardian', 'hooks'), { recursive: true });
    fs.writeFileSync(path.join(仮, 'package.json'), JSON.stringify({ name: 'x', type: 'module' }) + '\n');
    for (const f of fs.readdirSync(path.join(HERE, 'hooks')))
      fs.copyFileSync(path.join(HERE, 'hooks', f), path.join(仮, 'guardian', 'hooks', f));
    /* 塊の package.json も一緒に配られる ── それが在れば CommonJS に固定される */
    try { fs.copyFileSync(path.join(HERE, 'package.json'), path.join(仮, 'guardian', 'package.json')); } catch (_) {}

    const 落ちた = [];
    for (const f of fs.readdirSync(path.join(仮, 'guardian', 'hooks'))) {
      if (!f.endsWith('.js') || f === 'lib-root.js') continue;      // lib-root は入口ではなく道具
      const r = spawnSync(process.execPath, [path.join(仮, 'guardian', 'hooks', f)],
        { input: '{}', encoding: 'utf8', windowsHide: true });
      const 出 = String(r.stdout || '') + String(r.stderr || '');
      if (/ReferenceError|SyntaxError|ERR_REQUIRE_ESM|Cannot use import statement/.test(出)) 落ちた.push(f);
    }
    /* ★【起動する】と【仕事をする】は別(2026-08-30、配布先からの報告⑥)。
     *   直す前の B8a は起動だけを見ていた。配布先で codemap が『起動はするが何も出さない』
     *   状態になり、緑のまま通った ── main() の中の例外を catch が握り潰していた。
     * ★最初の測り方は【健全なフックを赤にした】(同日、Stop の差戻で気づいた)。
     *   この現場の地図からファイルを拾い、仮の現場のフックに食わせていた。
     *   仮の現場には宣言も地図も無いので watch が既定(site|worker|gas|src|app|lib)に落ち、
     *   hooks/ は見張りの外 ── **フックは設計どおり黙る**。それを「仕事をしていない」と読んでいた。
     *   ★測る場所と食わせる物はセットである。片方だけ本物にすると、嘘の赤が出る。
     * ★よって見本の現場に【宣言・地図・見張られるファイル】の3つを揃えてから食わせる。
     *   合格の条件は本文まで出る強い一致(CODEMAP 該当項)── 「地図の外」や「項に載っている」だけの
     *   弱い返事は、地図の本文を引けていなくても出せるので数えない。 */
    const 中身が出ない = [];
    try {
      fs.writeFileSync(path.join(仮, 'guardian.config.json'),
        JSON.stringify({ watch: ['src'], map: 'docs/CODEMAP.md' }, null, 2) + '\n');
      fs.mkdirSync(path.join(仮, 'docs'), { recursive: true });
      fs.writeFileSync(path.join(仮, 'docs', 'CODEMAP.md'),
        '# 地図\n\n## 買い物かごの税\n\n- `src/cart.js` が `TAX_RATE` を掛ける\n');
      fs.mkdirSync(path.join(仮, 'src'), { recursive: true });
      fs.writeFileSync(path.join(仮, 'src', 'cart.js'), 'const TAX_RATE = 0.1;\n');

      const 入力 = JSON.stringify({
        tool_name: 'Edit',
        tool_input: { file_path: path.join(仮, 'src', 'cart.js'), new_string: 'const TAX_RATE = 0.08;' },
      });
      const r = spawnSync(process.execPath, [path.join(仮, 'guardian', 'hooks', 'codemap.js')],
        { input: 入力, encoding: 'utf8', windowsHide: true, timeout: 60000 });
      const 出 = String(r.stdout || '');
      /* ★落ちたことを言う返事も additionalContext を持つ ── それを合格に数えない */
      if (/このフックは落ちました/.test(出)) 中身が出ない.push('codemap.js(見本の現場で落ちている)');
      else if (!/CODEMAP 該当項/.test(出)) 中身が出ない.push('codemap.js(地図に載せた src/cart.js を食わせても該当項の本文を出さない)');
      else ok.push('フックは起動するだけでなく仕事をする(見本の現場で地図の該当項を引けている)');
    } catch (e) {
      未測.push('フックが中身を出すかは見ていません(見本を建てられませんでした: '
        + String(e && e.message).slice(0, 120) + ')');
    }
    if (中身が出ない.length) {
      ng.push('★フックは【起動するが、仕事をしていません】: ' + 中身が出ない.join(', ')
        + ' ── 起動と中身は別です。main() の中で落ちて握り潰されている疑い');
    }
    if (落ちた.length) {
      ng.push('★フックが【その現場では起動しません】: ' + 落ちた.join(', ')
        + ' ── 配布先の package.json に "type": "module" が在ると .js が ESM 扱いになります。'
        + '**フックは失敗しても黙って通すので、静かに全滅します**(報告は成功と出る)。'
        + '直しは、塊の直下に package.json を置いて type を commonjs にする(1枚で済む)');
    } else {
      ok.push('フックは type:module の現場でも起動する(package.json で CommonJS に固定)');
    }
  } catch (e) {
    未測.push('フックの起動は見ていません(見本を建てられませんでした: ' + String(e && e.message).slice(0, 120) + ')');
  } finally {
    try { fs.rmSync(仮, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch (_) { /* ★残ったことは、走り終わりの検査が赤で言う(黙らせていない) */ }
  }
}

/* B8e. 【記号名の長さと言語で、地図への到達が変わらないか】
 *   (2026-08-31、配布先(現場A / CodeX)の提案)。
 *
 * ★これは症状ごとの回帰例ではなく【不変条件】である ── 症状を知らなくても言える。
 *   「同じ形の項が、記号名の長さと言語だけで結果を変えてはいけない」。
 *   今夜の3件(語境界が ASCII 前提 / 実名の長さ閾値が3 / 括弧付きを拾えない)は、
 *   どれもこの1つの条件で先に赤にできた ── **書けなかったのではなく、書いていなかった**。
 * ★あわせて2つ目の不変条件も同じ見本で測る:
 *   **裸名(`名札`)と呼び出し形(`顔(user, slot)`)は、同じ実名を指す。**
 * ★最小例より寿命が長い ── 次に閾値・文字クラス・括弧の扱いを触った人が、
 *   何の症状も知らないまま赤を受け取れる(提案者の言葉)。
 * ★測れない場合は【未測】── 見本を建てられなかったことを緑に混ぜない。 */
{
  const 見本 = [
    { 名: "sbUser",   項: "英語6字の口",   書き: "`sbUser`" },
    { 名: "顔",       項: "日本語1字の口", 書き: "`顔(user, slot)`" },   /* 呼び出し形でも同値のはず */
    { 名: "名札",     項: "日本語2字の口", 書き: "`名札`" },
    { 名: "出席者",   項: "日本語3字の口", 書き: "`出席者`" },
  ];
  const 仮 = 見本を建てる("guardian-fuhen-");
  try {
    fs.mkdirSync(path.join(仮, "guardian", "hooks"), { recursive: true });
    for (const f of fs.readdirSync(path.join(HERE, "hooks")))
      fs.copyFileSync(path.join(HERE, "hooks", f), path.join(仮, "guardian", "hooks", f));
    try { fs.copyFileSync(path.join(HERE, "package.json"), path.join(仮, "guardian", "package.json")); } catch (_) {}
    fs.writeFileSync(path.join(仮, "guardian.config.json"),
      JSON.stringify({ watch: ["src"], map: "docs/CODEMAP.md" }, null, 2) + NL2);
    fs.mkdirSync(path.join(仮, "docs"), { recursive: true });
    fs.mkdirSync(path.join(仮, "src"), { recursive: true });
    /* 同じ形の項を並べ、記号名の長さと言語だけを変える */
    let 地図 = "# 地図" + NL2 + NL2;
    for (const m of 見本) 地図 += "## " + m.項 + NL2 + NL2 + "- " + m.書き + " @`src/index.js`" + NL2 + NL2;
    /* ★【コード柵の中は例】── そこを接点として引かないこと(2026-08-31、配布先の監査で出た)。
     *   地図のバッククォートは「これは実在の記号だ」という宣言であって、例を書く場所ではない。
     *   例は柵の中に書く ── `check.mjs` は前から柵を落としていたが、
     *   **フックは落としていなかった**(同じ地図を2つの読み手が違う物差しで読んでいた)。 */
    地図 += "## 例だけの項(柵の中)" + NL2 + NL2 + "```" + NL2
      + "- `名札` @`src/index.js` ← こう書きます(これは例)" + NL2 + "```" + NL2 + NL2;
    fs.writeFileSync(path.join(仮, "docs", "CODEMAP.md"), 地図);
    fs.writeFileSync(path.join(仮, "src", "index.js"),
      見本.map((m) => "function " + m.名 + "() {}").join(NL2) + NL2);
    const 届かない = [];
    for (const m of 見本) {
      const 入力 = JSON.stringify({
        tool_name: "Edit",
        tool_input: { file_path: path.join(仮, "src", "index.js"), new_string: "function " + m.名 + "() { return 1; }" },
      });
      const r = spawnSync(process.execPath, [path.join(仮, "guardian", "hooks", "codemap.js")],
        { input: 入力, encoding: "utf8", windowsHide: true, timeout: 60000 });
      const 出 = String(r.stdout || "");
      if (/このフックは落ちました/.test(出)) { 届かない.push(m.名 + "(フックが落ちた)"); continue; }
      /* ★【弱い返事を合格に数えない】(2026-08-31、この検査を書いている最中に自分で踏んだ)。
       *   実名を拾えなかったとき、フックは「次の項に載っている」と**全部の見出しを並べる**。
       *   最初はここで見出しの名前だけを探していたので、**閾値を壊しても緑のまま**だった。
       *   B7b と同じ形 ── 失敗する側の出力にも入っている文字列を、合格の証拠にしていた。
       * ★合格の条件は【強い一致】: 該当項の見出しであり、かつ**その実名を拾ったと言っている**こと。 */
      if (出.includes("例だけの項")) 届かない.push("柵の中の例を、接点として引いている(地図の柵は例を書く場所であって接点ではない)");
      const 強い = /CODEMAP 該当項/.test(出) && new RegExp("触れる実名: [^\n]*" + m.名).test(出) && 出.includes("## " + m.項);
      if (!強い) 届かない.push(m.名 + "(" + m.書き + " → 該当項『" + m.項 + "』に強く届かない)");
    }
    /* ★不変条件は【両向き】である(2026-08-31、この検査の双子を測っていて分かった)。
     *   上の4項は「届くべきものが届くか」しか見ておらず、語境界を ASCII に戻しても緑のままだった。
     *   ASCII の境界だと日本語は境界が定義できず、touched は**部分一致に落ちる** ──
     *   つまり壊れ方は「届かない」ではなく**「関係ない語で当たる」**方に出る。
     *   誤ヒットは慣れを作り、慣れは本当に必要なときの読み飛ばしを作る(7条)。
     * ★だから逆向きも測る: 実名を**含むだけの長い語**を書いても、強くは当たらないこと。 */
    let 誤って当たる = "";
    {
      const 入力 = JSON.stringify({
        tool_name: "Edit",
        tool_input: { file_path: path.join(仮, "src", "index.js"), new_string: "const 記名札束 = 1;" },
      });
      const r = spawnSync(process.execPath, [path.join(仮, "guardian", "hooks", "codemap.js")],
        { input: 入力, encoding: "utf8", windowsHide: true, timeout: 60000 });
      const 出 = String(r.stdout || "");
      if (/CODEMAP 該当項/.test(出)) 誤って当たる = "記名札束 → 『名札』の項に当たった";
    }
    if (誤って当たる)
      ng.push("★実名を含むだけの語で、地図の項に当たっています: " + 誤って当たる
        + " ── 語境界が ASCII の文字クラスに戻っている疑い(日本語では境界が定義できず部分一致に落ちます)。"
        + "**誤ヒットは慣れを作り、慣れは読み飛ばしを作ります**(7条)");
    if (届かない.length)
      ng.push("★記号名の長さ・言語で地図への到達が変わります: " + 届かない.join(" / ")
        + " ── 同じ形の項が、名前の書き方だけで届かなくなっています"
        + "(語境界の文字クラス / 実名の長さ閾値 / 括弧の前を拾うか、のどれかです)");
    else if (!誤って当たる) ok.push("記号名の長さと言語で到達が変わらない ── 英6字・日1字・日2字・日3字の4項(うち1つは呼び出し形)は届き、実名を含むだけの語(記名札束)では当たらない【両向き】");
  } catch (e) {
    未測.push("長さと言語の不変条件は見ていません(見本を建てられませんでした: "
      + String(e && e.message).slice(0, 120) + ")");
  } finally {
    try { fs.rmSync(仮, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch (_) { /* ★残ったことは、走り終わりの検査が赤で言う(黙らせていない) */ }
  }
}
/* B8f. 【パスの書き方と改行で、判定が変わらないか】
 *   (2026-08-31、配布先(CodeX)が挙げた不変条件の6番目)。
 *
 * ★これも症状を知らなくても言える性質である ── **同じ意味の書き方で、結果が変わってはいけない**。
 *   変わる所は4つある: 地図の改行 / 編集文の改行 / パスの区切り( と /) / パスに空白を含む。
 * ★配布先の現場は改行が混在している(最大のファイルだけ CRLF、他93本が LF)。
 *   こちらは .gitattributes で eol=lf に揃えてあるので、**混在を作れない** ──
 *   だから見本の中で作る。★測る場所と食わせる物はセットである(B8a の教訓)。
 * ★合格は【強い一致】── 弱い返事(全見出しを並べる方)を数えない(B8e の教訓)。 */
{
  const 仮の親 = 見本を建てる("guardian-path-");
  /* ★名前に空白を入れる ── 空白入りパスで壊れる道具は多い(この塊も一度やっている) */
  const 仮 = path.join(仮の親, "見 本 の 現場");
  try {
    fs.mkdirSync(path.join(仮, "guardian", "hooks"), { recursive: true });
    for (const f of fs.readdirSync(path.join(HERE, "hooks")))
      fs.copyFileSync(path.join(HERE, "hooks", f), path.join(仮, "guardian", "hooks", f));
    try { fs.copyFileSync(path.join(HERE, "package.json"), path.join(仮, "guardian", "package.json")); } catch (_) {}
    fs.writeFileSync(path.join(仮, "guardian.config.json"),
      JSON.stringify({ watch: ["src"], map: "docs/CODEMAP.md" }, null, 2) + NL2);
    fs.mkdirSync(path.join(仮, "docs"), { recursive: true });
    fs.mkdirSync(path.join(仮, "src"), { recursive: true });
    fs.writeFileSync(path.join(仮, "src", "index.js"), "function 名札() {}" + NL2);
    const 地図の中身 = ["# 地図", "", "## 名札の口", "", "- `名札` @`src/index.js`", ""];
    const 書く地図 = (改行) => fs.writeFileSync(path.join(仮, "docs", "CODEMAP.md"), 地図の中身.join(改行) + 改行);
    const CRLF = String.fromCharCode(13) + String.fromCharCode(10);
    const 走らせる = (地図の改行, 編集文, パス) => {
      書く地図(地図の改行);
      const r = spawnSync(process.execPath, [path.join(仮, "guardian", "hooks", "codemap.js")],
        { input: JSON.stringify({ tool_name: "Edit", tool_input: { file_path: パス, new_string: 編集文 } }),
          encoding: "utf8", windowsHide: true, cwd: 仮 });
      const 出 = String(r.stdout || "");
      if (/このフックは落ちました/.test(出)) return "フックが落ちた";
      const 強い = /CODEMAP 該当項/.test(出) && new RegExp("触れる実名: [^"+String.fromCharCode(92)+"n]*名札").test(出) && 出.includes("## 名札の口");
      return 強い
        ? "" : "該当項に強く届かない";
    };
    const 絶対 = path.join(仮, "src", "index.js");
    const 場合 = [
      { 名: "地図が LF・編集文が LF・絶対パス",        r: () => 走らせる(String.fromCharCode(10), "function 名札() { return 1; }", 絶対) },
      { 名: "★地図が CRLF",                            r: () => 走らせる(CRLF, "function 名札() { return 1; }", 絶対) },
      { 名: "★編集文が CRLF",                          r: () => 走らせる(String.fromCharCode(10), "function 名札() {" + CRLF + "  return 1;" + CRLF + "}", 絶対) },
      { 名: "★パスが Windows 形式(バックスラッシュ)", r: () => 走らせる(String.fromCharCode(10), "function 名札() { return 1; }", 絶対.split("/").join("\\")) },
      { 名: "★パスが相対",                             r: () => 走らせる(String.fromCharCode(10), "function 名札() { return 1; }", "src/index.js") },
      { 名: "★地図も編集文も CRLF",                    r: () => 走らせる(CRLF, "function 名札() {" + CRLF + "  return 1;" + CRLF + "}", 絶対) },
    ];
    const 変わった = [];
    for (const c of 場合) { const 訳 = c.r(); if (訳) 変わった.push(c.名 + "(" + 訳 + ")"); }
    if (変わった.length)
      ng.push("★パスの書き方や改行で、地図への到達が変わります: " + 変わった.join(" / ")
        + " ── 同じ意味の書き方で結果が変わってはいけません"
        + "(配布先は改行が混在した現場です: 最大のファイルだけ CRLF・他93本が LF)");
    else ok.push("パスの書き方と改行で判定が変わらない(地図と編集文の LF・CRLF、パスの区切り2種、相対/絶対、空白入りパスの6通り)");
  } catch (e) {
    未測.push("パスと改行の不変条件は見ていません(見本を建てられませんでした: "
      + String(e && e.message).slice(0, 120) + ")");
  } finally {
    try { fs.rmSync(仮の親, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch (_) { /* ★残ったことは、走り終わりの検査が赤で言う(黙らせていない) */ }
  }
}
/* B8g. 【約束の宣言(PROTOCOL.json)が、実際の振る舞いと合っているか】
 *   (2026-08-31、配布先(CodeX)の指摘・現場A の実測)。
 *
 * ★`pull --at` は、相手の `PROTOCOL.json` を読んで「同じ約束を持つか」を決める。
 *   **宣言には嘘が書ける** ── 書き換え忘れ、能力を消したのに宣言だけ残った、など。
 *   だからここで、宣言と**いまの pull.mjs が実際にする振る舞い**を突き合わせる(44条の双子)。
 * ★測り方は【綴りを読まない】── それが今回の事故そのものだった。
 *   実際に走らせて、**出口と言い分**で能力を判定する。
 * ★安全に走らせられる理由: どちらの口も**クローンより前**で止まる(ネットに出ない・何も書き換えない)。
 *   ★この前提が崩れたら、ここは嘘の緑になる ── だから「取り直しが始まっていないこと」も見る。 */
{
  const 走らせて = (args) => {
    const r = spawnSync(process.execPath, [path.join(HERE, "pull.mjs"), ...args],
      { encoding: "utf8", windowsHide: true, cwd: HERE, timeout: 60000 });
    return { code: r.status, 出: String(r.stdout || "") + String(r.stderr || "") };
  };
  let 宣言 = null;
  try { 宣言 = JSON.parse(fs.readFileSync(path.join(HERE, "PROTOCOL.json"), "utf8")); } catch (_) {}
  if (!宣言) {
    未測.push("約束の宣言(PROTOCOL.json)が読めません ── `pull --at` は"
      + "**相手がこれを持っているか**で配るかを決めるので、無い塊は配布先から拒否されます");
  } else {
    const 宣言した = Array.isArray(宣言.capabilities) ? 宣言.capabilities : [];
    const 実際 = [];
    /* ① 知らない口を拒むか */
    const a = 走らせて(["--この口は無い"]);
    if (a.code === 1 && /その口を知りません/.test(a.出)) 実際.push("reject-unknown-options");
    /* ② --at を口として持つか(SHA でない値で、SHA を求めて止まること) */
    const b = 走らせて(["--at", "これはSHAではない"]);
    if (b.code === 1 && /--at には SHA を渡してください/.test(b.出)) 実際.push("at-sha");
    /* ★どちらの回も、取り直しが始まっていないこと(始まっていたら測り方が危ない) */
    const 始まった = /正本を取れませんでした|取り直しました|変わるもの:/.test(a.出 + b.出);
    if (始まった) {
      ng.push("★約束を測るはずの空回しが、**取り直しを始めています** ── "
        + "この検査はネットに出ない前提で書かれています(口の門がクローンより後ろへ動いた疑い)");
    }
    const 宣言だけ = 宣言した.filter((c) => !実際.includes(c));
    const 実際だけ = 実際.filter((c) => !宣言した.includes(c));
    if (宣言だけ.length)
      ng.push("★宣言しているのに、実際にはできません: " + 宣言だけ.join(", ")
        + " ── 配布先はこの宣言を見て `--at` を許します。**嘘の宣言は、嘘の受領証と同じ**です");
    if (実際だけ.length)
      ng.push("★できるのに宣言していません: " + 実際だけ.join(", ")
        + " ── 配布先はこの塊を『約束を持たない』として拒否します(PROTOCOL.json に足してください)");
    if (!宣言だけ.length && !実際だけ.length && !始まった)
      ok.push("約束の宣言が実際の振る舞いと合っている(" + 実際.join(" / ") + " ── 綴りではなく出口で測った)");
  }
}
/* B1e. 【同じ版が、2つの中身を指していないか】(2026-08-31、配布先(CodeX)の指摘)。
 *
 * ★実際に起きた: 会議で「9.35 を測ってください」と依頼したのに、配布先が測ったのは別の SHA だった。
 *   **どちらも版は 9.35**。私が版を上げずに中身を直して push していた。
 *   受領証(SHA)はそれを検出したが、**人は版で報告する**ので、版が嘘をつくと会話が壊れる。
 * ★測り方: 【最後に KIT_VERSION が変わった commit】を git に聞き、
 *   その commit の版が**いまの版と同じ**なのに、**配布物の中身が変わっている**なら赤。
 *   ── 版を上げてから直している最中は、commit の版といまの版が違うので鳴らない(7条)。
 * ★正本でしか測れない(git が要る)。配布先では **未測** ── 分からないを緑に混ぜない。
 * ★これは push を止める仕組みではない。**push する前に気づく**ための計器である。 */
{
  const 正本か = fs.existsSync(path.join(HERE, ".git"));
  const g = (...a) => spawnSync("git", a, { cwd: HERE, encoding: "utf8", windowsHide: true, timeout: 60000 });
  if (!正本か) {
    測れない.push("版と中身が1対1かは見ていません(ここは配布先で、正本の履歴が読めません)");
  } else {
    const いまの版 = (() => { try { return fs.readFileSync(path.join(HERE, "KIT_VERSION"), "utf8").trim(); } catch (_) { return ""; } })();
    const 版を上げた = g("log", "-1", "--format=%H", "--", "KIT_VERSION");
    const c = String(版を上げた.stdout || "").trim();
    if (版を上げた.status !== 0 || !/^[0-9a-f]{7,40}$/.test(c)) {
      未測.push("版と中身が1対1かは見ていません(KIT_VERSION の履歴が読めません)");
    } else {
      const 版 = g("show", c + ":KIT_VERSION");
      const その時の版 = String(版.stdout || "").trim();
      if (その時の版 !== いまの版) {
        /* 版を上げてから直している最中 ── 正常。鳴らせば7条(鳴りすぎる計器は無視される) */
        ok.push("版 " + いまの版 + " はまだ公開していません(直している最中なので、中身が動いても構いません)");
      } else {
        /* 配布物だけを見る ── この現場のものが変わっても、配る中身は変わっていない */
        const 変わった = [];
        /* ★道の一覧は 道.cjs から取る(2026-09-03、会議で @codex と @kozo が形を出した)。
         *   ★★直す前は split(改行).map(trim) で、★★★空白を持つ道が【全件】壊れた
         *   (実測: " leading.mjs" → "leading.mjs" = 実在しない道。エラーは出ない)。 */
        const d = 道の口.道を取る(HERE, "diff", "--name-only", c, "--");
        const 一覧 = d.道;
        /* ★読めなかった道を黙って落とさない ── 保存則(発見 = 読めた + 読めなかった) */
        if (d.読めなかった.length) 未測.push("公開後の中身の照合: git が返した道 "
          + d.読めなかった.length + "件が UTF-8 として読めません(その道は見ていません)");
        if (d.落ちた) 未測.push("公開後の中身の照合: " + d.落ちた);
        /* ★保存則(2026-09-03、会議で @codex が形を出した)── 入った道は、
         *   ★★使われたか、理由付きで外れたかの どちらかでなければならない。
         *   ここで外れるのは【この現場の物】── ★★★配る中身ではないので、見なくてよい。
         *   だが「見なくてよい」と【言う】ことが要る(見落としと区別がつかないため)。 */
        const 外した = [];
        for (const f of 一覧) {
          if (ENGINE_FILES.includes(f)) 変わった.push(f);
          else 外した.push(f);
        }
        if (変わった.length + 外した.length !== 一覧.length) {
          未測.push("公開後の中身の照合: 入った道 " + 一覧.length + "件のうち "
            + (一覧.length - 変わった.length - 外した.length) + "件が、使われも外れもしていません");
        }
        if (変わった.length) {
          ng.push("★版 " + いまの版 + " は既に公開されていて、その後に配る中身が変わっています: "
            + 変わった.slice(0, 6).join(", ") + (変わった.length > 6 ? " ほか" + (変わった.length - 6) + "件" : "")
            + " ── **同じ版が2つの中身を指します**。人は版で報告するので、版が嘘をつくと会話が壊れます"
            + "(実際に「9.35 を測って」と依頼して、別の中身が測られました)。KIT_VERSION を上げてください");
        } else {
          ok.push("版 " + いまの版 + " と中身が1対1(公開してから配る中身は変わっていません)");
        }
      }
    }
  }
}
/* B11. 【案内されている口が、本当に口として在るか】
 *   (2026-08-31、第2の議題。配布先(現場A)の実測が発端)。
 *
 * ★実際に起きた: 案内されている口を「ソースにその文字列が在るか」で照合したら、
 *   3通りの数え方で3通りの答えが出た。とくに `neighbors --list` は**文字列としては在るが、
 *   argv を見ていない**(既定動作だった)── **書いてある ≠ 口として在る**。
 *   これは 9.46 で PROTOCOL.json に置き換えたばかりの「綴りで能力を測る」罠と同じ形である。
 * ★だから綴りを読まない ── **道具に答えさせる**(`--口一覧`)。それを SPEC.md の表と突き合わせる。
 *   道具の側では、その同じ配列が未知の口を拒む ── **答えと振る舞いが同じ1つから出る**(44条)。
 * ★安全に走らせられる理由: `--口一覧` は他に何もせず、すぐ出口0で終わる(何も書き換えない)。
 * ★穴として書く: 証明できるのは「その口を受け付ける」までで、**その口が仕事をする**ことではない。
 *   そこは各口の検査の仕事である(9.43 の未知オプション拒否と同じ線)。 */
{
  const 道具 = ["check.mjs", "index.mjs", "install.mjs", "neighbors.mjs", "pull.mjs", "selfcheck.mjs", "verdict.mjs",
    "外す.mjs"];
  /* ★【引数の誤りの出口】は道具ごとに違う(2026-09-03、会議で @kozo が数えた)。
   *   ★★7口は 1 を使う。★★★外す.mjs は使えない ── 出口に【2つの軸】が載っているため:
   *     軸A 判定(0=PASS / 1=CONFLICT / 2=UNKNOWN)/ 軸B 判定器が成立したか
   *   1 も 2 も判定で埋まっているので、引数の誤りは 3 を使う。
   *   ★7口を 3 に揃えないのは、既に測定契約として 1 が使われているためである。
   *   ★★ここに書くのは【綴りではなく約束】── 道具が変えたら、この表も変える(片方だけ古くなる)。 */
  const 引数の誤りの出口 = { "外す.mjs": 3 };
  const 誤りの出口 = (t) => (引数の誤りの出口[t] || 1);
  let spec = null;
  try { spec = fs.readFileSync(path.join(HERE, "SPEC.md"), "utf8"); } catch (_) {}
  if (!spec) {
    未測.push("案内されている口は見ていません(SPEC.md が読めません)");
  } else {
    /* SPEC の表を読む。行の頭が `道具名` なら持ち主が変わり、`| |` なら直前の持ち主のまま */
    const 宣言 = {};
    let いま = null;
    for (const 行 of spec.split(NL2)) {
      if (!行.startsWith("|")) { continue; }
      /* ★道具の名は【ASCII だけ】ではない(2026-09-03、今夜3度目の同じ形)。
       *   ★★直す前の網は [A-Za-z0-9_./-] だったので、外す.mjs の行が読めず、
       *   ★★★直前の持ち主(pull.mjs)の続きとして数えられていた ──
       *   「SPEC に在るが口として無い」と、無い側を名指しして赤くしていた。
       *   同じ形: git のクォート(18.0)/ 命令の道の網(21.2)/ ここ(22.1)。 */
      const m = 行.match(new RegExp("^\\|\\s*`([^`\\s|]+\\.(?:mjs|js|cjs))`\\s*\\|"));
      if (m) { いま = m[1]; if (!宣言[いま]) 宣言[いま] = new Set(); }
      if (!いま || !宣言[いま]) continue;
      /* 口の欄(2番目のセル)だけを見る ── 説明文に出てくる口は数えない */
      const セル = 行.split("|");
      const 口欄 = セル.length > 2 ? セル[2] : "";
      for (const g of 口欄.matchAll(/`(--[^`\s]+)/g)) 宣言[いま].add(g[1]);
    }
    const ずれ = [];
    const 測れた = [];
    /* ★【口は在るのに、合否では回らない】を数える(2026-08-31、配布先の実測)。
     *   配布先は今日、--sweep と --跨ぐ記号 を★初めて回した ── ★★3週間前から在ったのに。
     *   そして回した1回目に、本物が3件出た(緑の嘘 / 三つ子 / 公開口の穴)。
     * ★★「当てに行くこと自体が入口」で、★★★当てに行く費用は道具が在る限りほぼ0だった。
     *   ★足りなかったのは道具ではなく【回す機会】である。
     * ★判定にはしない ── 全部の口を合否で回すのは間違い(取り出す口は人が読むためのもの)。
     *   ★★数だけ出す。消せない数として残り、次に見た人が「今日はどれを回すか」を決める。 */
    const 口の一覧 = [];
    for (const t of 道具) {
      const r = spawnSync(process.execPath, [path.join(HERE, t), "--口一覧"],
        { encoding: "utf8", windowsHide: true, cwd: HERE, timeout: 60000 });
      if (r.status !== 0) { ずれ.push(t + "(--口一覧 が答えません)"); continue; }
      /* ★【名前だけでなく、拒むかも測る】(2026-08-31、配布先の実測)。
       *   直す前の B11 は `--口一覧` の**答え**しか見ていなかった。配布先が門の拒否だけを壊すと、
       *   口一覧は無傷なので **B11 は一言も言わなかった**(気づいたのは指紋だけ)。
       *   ★そして**指紋は正本では守りにならない** ── `--stamp` を押せるからである。
       *     つまり「正本で1本だけ直し忘れる」は、どの検査にも掛からなかった。
       * ★叩き方は `--口一覧 --zzz` の形にする ── 素の `--zzz` で叩くと、
       *   **門が壊れている道具は本物の仕事を始める**(壊れた verdict は合否を回し始め、検査が検査を呼ぶ)。
       *   この形なら、門が壊れていても**口一覧が出て終わる**だけで済む。 */
      const z = spawnSync(process.execPath, [path.join(HERE, t), "--口一覧", "--この口は無い"],
        { encoding: "utf8", windowsHide: true, cwd: HERE, timeout: 60000 });
      if (z.status !== 誤りの出口(t))
        ずれ.push(t + ": 知らない口を拒みません(出口 " + z.status + " ── ★この道具は " + 誤りの出口(t) + " のはずです)");
      /* 出力は「口 個数」の2列。名前だけを取り出す(個数は下の叩き方が使う) */
      const 個数 = new Map();
      const 供 = new Map();
      for (const 行 of String(r.stdout || "").split(NL2)) {
        const t = 行.trim(); if (!t) continue;
        const [名, 数] = t.split(/\s+/);
        /* ★【一緒に要る口】も、道具に答えさせる(2026-09-03)。
         *   ★★この検査は mode を知らない ── 知らせるのではなく、道具が「要る:--走査」と言う。
         *   ★★★知らないと、mode を持つ道具の口を単独で叩いて「宣言と振る舞いが違う」と誤る。 */
        const m2 = t.match(new RegExp("要る:([^ ]+)"));
        if (m2) 供.set(名, m2[1]);
        個数.set(名, 数 === undefined ? "0" : 数);
      }
      const 実際 = new Set(個数.keys());
      for (const 名 of 実際) 口の一覧.push({ 道具: t, 口: 名 });
      /* ★【値を何個飲むか】も測る(2026-08-31、配布先が手で叩いて出した6行をそのまま検査へ)。
       *   叩き方は**個数の宣言から組み立てる** ── 検査の側に口の個数を写経しない(39条)。
       *   値の位置には「未知の口に見えるもの」を置く ── 飲めば見えなくなり、飲み忘れれば見える。
       *   ★期待が口ごとに逆になる: 0個の口は**出口1**(飲まないのが正しい)、
       *     1個・2個・* の口は**出口0**(飲むのが正しい)。
       *   ★本物の値(実在するパスや SHA)を渡さない ── 渡すとその道具が本当に走り出す。 */
      for (const [名, 数] of 個数) {
        if (名 === "--口一覧") continue;
        const 餌 = 数 === "*" ? ["--餌1", "--餌2", "--餌3"]
          : Array.from({ length: Math.max(1, Number(数) || 0) }, (_, n) => "--餌" + (n + 1));
        /* ★飲まない口に未知を渡せば【その道具の引数の誤りの出口】/ 飲む口なら出口0(2026-09-03) */
        const 期待 = (数 === "0") ? 誤りの出口(t) : 0;
        const w = spawnSync(process.execPath, [path.join(HERE, t), "--口一覧", ...(供.get(名) ? [供.get(名)] : []), 名, ...餌],
          { encoding: "utf8", windowsHide: true, cwd: HERE, timeout: 60000 });
        if (w.status !== 期待)
          ずれ.push(t + ": " + 名 + " が値を " + 数 + " 個飲むと宣言していますが、振る舞いが違います(出口 " + w.status + " / 期待 " + 期待 + ")");
        /* ★【足りない側】も測る(2026-08-31、配布先が境界を叩いて見つけた)。
         *   宣言より1つ少なく渡すと、**出口1で「値が足りません」と言う**のが正しい。
         *   直す前は黙って通し、その先で undefined を値として使っていた ──
         *   **害が無いから放っておく、ではなく「言ってもいない」のが問題**である(46条の形)。
         *   ★`*`(残り全部)の口には、足りないという状態が無いので測らない。 */
        if (数 !== "*" && Number(数) >= 1) {
          const 短い = 餌.slice(0, Number(数) - 1);
          const v2 = spawnSync(process.execPath, [path.join(HERE, t), "--口一覧", ...(供.get(名) ? [供.get(名)] : []), 名, ...短い],
            { encoding: "utf8", windowsHide: true, cwd: HERE, timeout: 60000 });
          if (v2.status !== 誤りの出口(t))
            ずれ.push(t + ": " + 名 + " に値を " + 短い.length + " 個しか渡していないのに止まりません(出口 " + v2.status + ")");
        }
        /* ★【飲みすぎない】も測る(2026-08-31、配布先の実測を機械に移した)。
         *   値を飲んだ【後ろ】に未知の口を置くと、そこは未知として見えるはずである。
         *   見えなければ、その口は**宣言より多く飲んでいる**。
         *   ★配布先が手で1回測って正しいと分かっていたが、根拠が実測1回だけだった ──
         *     叩くだけで足りるので、機械へ移した(足すのは口あたり1回)。
         *   ★`*`(残り全部)の口は、後ろを全部飲むのが正しいので測らない。 */
        if (数 !== "*" && Number(数) >= 1) {
          const v3 = spawnSync(process.execPath,
            [path.join(HERE, t), "--口一覧", ...(供.get(名) ? [供.get(名)] : []), 名, ...餌, "--この口は無い"],
            { encoding: "utf8", windowsHide: true, cwd: HERE, timeout: 60000 });
          if (v3.status !== 誤りの出口(t))
            ずれ.push(t + ": " + 名 + " が値の後ろの未知の口まで飲んでいます(出口 " + v3.status + ")");
        }
      }
      const 書いてある = 宣言[t] || new Set();
      const 案内だけ = [...書いてある].filter((x) => !実際.has(x));
      const 実装だけ = [...実際].filter((x) => !書いてある.has(x));
      if (案内だけ.length) ずれ.push(t + ": SPEC に在るが口として無い ── " + 案内だけ.join(", "));
      if (実装だけ.length) ずれ.push(t + ": 口として在るが SPEC に無い ── " + 実装だけ.join(", "));
      if (!案内だけ.length && !実装だけ.length) 測れた.push(t + "(" + 実際.size + ")");
    }
  {
    /* ★合否(evidence)で実際に打たれている口を数える。★★宣言を読む ── 綴りで当てない(39条)。 */
    let 走る文 = [];
    try {
      const c = JSON.parse(fs.readFileSync(path.join(HERE, "guardian.config.json"), "utf8"));
      走る文 = (c.evidence || []).map((e) => String((e && e.run) || e || ""));
    } catch (_) { 走る文 = []; }
    if (走る文.length && 口の一覧.length) {
      const 回る = 口の一覧.filter((x) => 走る文.some((r) => r.includes(x.道具) && r.includes(x.口)));
      const 回らない = 口の一覧.filter((x) => !回る.includes(x));
      const 割 = Math.round((回る.length / 口の一覧.length) * 100);
      ok.push("道具の口は全部で " + 口の一覧.length + " 本。そのうち【合否で回る】のは " + 回る.length
        + " 本(" + 割 + "%)── 残り " + 回らない.length + " 本は、**人が思い出したときしか回りません**"
        + "(実測: 配布先は `--sweep` を3週間回さず、初めて回した日に本物が3件出ました)。落としません");
    }
  }
    if (ずれ.length) {
      ng.push("★案内と口が食い違っています: " + ずれ.join(" / ")
        + " ── **案内された口が存在しないのは、黙る事故より質が悪い**"
        + "(案内どおり打った人が、打ったつもりのまま別の動きを受け取ります)");
    } else {
      ok.push("案内されている口は、全部その道具が口として答え、知らない口を拒む(" + 測れた.join(" / ")
        + " ── 綴りではなく --口一覧 に答えさせて突き合わせた)");
    }
  }
}
/* B8h. 【門が、型で書かれた現場でも鳴るか】(2026-08-31、第2の議題)。
 *
 * ★class のとき(B8c)とまったく同じ形が、TypeScript の **型**に残っていた。
 *   実測(見本): `interface 名札の形` の中身を書き換えると、門は
 *   **「器のコードに変更なし」**と言い、近傍を1件も出さなかった。
 *   ★TS の現場では型は**接点そのもの**である ── 型を1つ変えると、
 *     それを受ける全部の関数が影響を受ける。むしろ関数より波及が広い。
 * ★この現場(正本)は .mjs しか無いので、**実測しないと一生出ない条件**である ── これで5件目。
 * ★git が無い機械では測れない ── そのときは【未測】。 */
{
  const 仮 = 見本を建てる('guardian-type-');
  const g = (...a) => spawnSync('git', a, { cwd: 仮, encoding: 'utf8', windowsHide: true, timeout: 60000 });
  try {
    fs.mkdirSync(path.join(仮, 'src'), { recursive: true });
    const 書く = (q, t) => fs.writeFileSync(path.join(仮, q), t);
    書く('src/model.ts', 'export interface 名札 { id: string; 色: string }' + NL2
      + 'export type 呼び名 = string;' + NL2);
    書く('src/use.ts', 'import { 名札 } from "./model";' + NL2
      + 'export function 出す(x: 名札) { return x.色; }' + NL2);
    書く('guardian.config.json', JSON.stringify({
      neighbors: { rings: 2, code: ['src'], notes: [], ext: ['ts'],
        answer: '.guardian/a.json', need: '.guardian/n.json' } }, null, 1) + NL2);
    if (g('init', '-q', '.').status !== 0) throw new Error('git init が失敗');
    g('config', 'user.email', 'selfcheck@example.invalid');
    g('config', 'user.name', 'selfcheck');
    g('add', '-A');
    if (g('commit', '-q', '-m', 'seed').status !== 0) throw new Error('git commit が失敗');
    /* 本物の破壊: 型から欄を1つ落とす(それを読む関数が壊れる) */
    書く('src/model.ts', 'export interface 名札 { id: string }' + NL2 + 'export type 呼び名 = string;' + NL2);

    const r = spawnSync(process.execPath, [path.join(HERE, 'neighbors.mjs'), '--list'],
      { cwd: 仮, encoding: 'utf8', windowsHide: true, timeout: 60000 });
    const 出 = String(r.stdout || '') + String(r.stderr || '');
    const 外れ = [];
    if (!/触れた記号:[^\n]*名札/.test(出)) 外れ.push('interface を【触れた記号】と見なせていない');
    if (!/出す/.test(出)) 外れ.push('その型を受け取る 出す が近傍に出ていない');
    if (外れ.length) {
      ng.push('門が型で書かれた現場で鳴りません: ' + 外れ.join(' / ')
        + ' ── TS の現場では**型が接点そのもの**なので、そこが盲目だと波及がいちばん広い所を見落とします'
        + '(出力: ' + 出.split(NL2).slice(0, 3).join(' / ').slice(0, 200) + ')');
    } else {
      ok.push('門は型で書かれた現場でも鳴る(interface の変更を捉え、それを受け取る側を近傍に出す)');
    }
  } catch (e) {
    未測.push('門の型対応は見ていません(見本を建てられませんでした: '
      + String(e && e.message).slice(0, 120) + ')── git が要ります');
  } finally {
    try { fs.rmSync(仮, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch (_) { /* ★残ったことは、走り終わりの検査が赤で言う(黙らせていない) */ }
  }
}
/* B0. 【この塊は、どの中身から来たか】(2026-08-31、配布先(CodeX)の提案)。
 *
 * ★版は**人が上げる番号**なので、同じ版のまま中身が変わることも、
 *   push されていない差が在ることもある。実際この会議で「9.29 で緑」と報告された時点で、
 *   正本は既に 9.30 だった ── **配布先の「緑」が、どの中身の緑か決まっていなかった。**
 * ★`pull.mjs` が取り直しのたびに SHA を受領証として残す。ここはそれを読んで出すだけ。
 * ★無ければ**未測**(手で写した / degit で入れた等)── 「分からない」を緑に混ぜない。 */
{
  /* ★機械が読む口(2026-08-31、配布先の提案)。
   *   「どれを取ったか」と「どれを測ったか」を、同じ値かどうか機械で照合できるようにする。 */
  if (process.argv.includes("--sha")) {
    let sha = "";
    try { sha = String(JSON.parse(fs.readFileSync(path.join(HERE, ".guardian", "pulled.json"), "utf8")).sha || ""); }
    catch (_) { sha = ""; }
    /* ★空は0行、そして「無い」は【不明】の符号で返す(2026-08-31、9.67 の規律を自分に当てた)。
     *   直す前は受領証が無くても【空行を1行】出して出口0だった ──
     *   **0件は0行**であり、そして**受領証が無いのは「空」ではなく「どこから来たか分からない」**。
     *   B0 が画面では【未測】と言っているのに、機械の口は出口0を返していた(9.48 と同じ食い違い)。 */
    if (sha) { process.stdout.write(sha + NL2); process.exit(0); }
    process.exit(2);          /* 受領証が無い = 不明(この塊の符号) */
  }
  let 受領証 = null;
  try { 受領証 = JSON.parse(fs.readFileSync(path.join(HERE, '.guardian', 'pulled.json'), 'utf8')); } catch (_) {}
  if (受領証 && /^[0-9a-f]{40}$/.test(受領証.sha || '')) {
    ok.push('この塊の出どころ: ' + 受領証.sha.slice(0, 12) + '(' + (受領証.at || '').slice(0, 19) + ')'
      + ' ── 緑を報告するときは、この SHA を添えてください');
  } else if (fs.existsSync(path.join(HERE, '.guardian', 'pulled.json.updating'))) {
    /* ★【取り直しが途中で終わっている】(2026-08-31、配布先が実走した反例)。
     *   pull は1文字でも書き換える前に古い受領証を .updating へ退避する。
     *   それが残っているということは、置き換えの途中で死んだか、受領証が書けなかったということ。
     *   ★ここを黙って『受領証なし』と同じ扱いにすると、**中身が混ざっている可能性**が消える。 */
    未測.push('**取り直しが途中で終わっています**(.guardian/pulled.json.updating が残っています)。'
      + '中身が混ざっている可能性があります ── `node guardian/pull.mjs` をもう一度回してください');
  } else {
    /* ★【受領証が無い】は3つの意味を持つ(2026-08-31、配布先の実測)。
     *   手で写した / degit で入れた / **1つ前の版から上げた直後**。
     *   3つ目はこの塊の自己更新の性質そのもの ── 受領証を書けるようになった版を取る回の pull は、
     *   **まだ受領証を書けない古い pull.mjs** が走っている。もう一度回せば消える。
     *   ★これを言わないと、配布先は『壊れている』と読んで直しに行く(実際そうなった)。 */
    /* ★正本には受領証が生まれない(自分を pull しないので)── そこで不明を出し続けると、
     *   正本の合否が永久に不明になる。配布先では回せば消えるので【未測】のまま。 */
    const ここが正本 = fs.existsSync(path.join(HERE, '.git'));
    if (ここが正本) 測れない.push('ここは正本なので受領証は生まれません(自分を取り直さないため)'
      + ' ── 配布先では、どの中身から来たかが受領証で決まります');
    else 未測.push('この塊が**どの中身から来たか分かりません**(取り直しの受領証がありません)。'
      + '意味は3つあります ── 手で写した / degit で入れた / '
      + '**受領証の機能が入った版に上げた直後**(その回の pull は、まだ受領証を書けない古い pull.mjs が走っています)。'
      + '3つ目なら `node guardian/pull.mjs` をもう一度回せば消えます ── '
      + '版だけでは「どの中身の緑か」が決まりません');
  }
}

/* B8d. 【門が生きているか】── 起動でも中身でもなく、**止めるべきものを止めるか**
 *   (2026-08-31、配布先からの提案)。
 *
 * ★配布先の言葉:「門の出力が平文 stderr + 終了コードなのは Claude Code の作法として正しいが、
 *   **外から自動で確かめにくい**。配布先が『この門は生きているか』を機械で測れる口が欲しい」。
 * ★実際、配布先は測り方を3回間違えている(相対パスを渡した / 出力を JSON だと思って grep した /
 *   宣言に無いパターンで試した)。**測り方が当たっているかを、測る側が確かめられない**のが問題。
 * ★だから見本をこちらで建てて、こちらの入力で測る ── 配布先は `selfcheck` を回すだけでよい。
 * ★実測(2026-08-31): 9.32 の `no-reflex` は、社名がエンジンにべた書きされていたため
 *   **一覧に無い会社(新しい会社・日本語の社名)を素通し**していた。この検査があれば出た。 */
{
  const 仮 = 見本を建てる('guardian-gate-');
  try {
    fs.mkdirSync(path.join(仮, 'guardian', 'hooks'), { recursive: true });
    fs.mkdirSync(path.join(仮, 'worker', 'src'), { recursive: true });
    for (const f of fs.readdirSync(path.join(HERE, 'hooks')))
      fs.copyFileSync(path.join(HERE, 'hooks', f), path.join(仮, 'guardian', 'hooks', f));
    try { fs.copyFileSync(path.join(HERE, 'package.json'), path.join(仮, 'guardian', 'package.json')); } catch (_) {}
    fs.writeFileSync(path.join(仮, 'worker', 'src', 'index.ts'), 'export const a = 1;\n');
    /* 見本の宣言 ── **この現場の宣言は使わない**(現場ごとに中身が違うと、測る内容も変わってしまう) */
    fs.writeFileSync(path.join(仮, 'guardian.config.json'), JSON.stringify({
      map: 'docs/CODEMAP.md', watch: ['worker'],
      reflex_gate: { files: ['worker/src/index.ts'] },
      checks: [{ name: '見本', kind: 'onlyIn', max: 0, pattern: 'まぼろし社|phantomcorp', files: ['worker/src/index.ts'] }],
    }, null, 1) + '\n');
    const 的 = path.join(仮, 'worker', 'src', 'index.ts');
    const 叩く = (フック, 本文) => {
      const r = spawnSync(process.execPath, [path.join(仮, 'guardian', 'hooks', フック)], {
        input: JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: 的, new_string: 本文 } }),
        encoding: 'utf8', windowsHide: true, cwd: 仮,
      });
      const 出 = String(r.stdout || '') + String(r.stderr || '');
      if (/ReferenceError|SyntaxError/.test(出)) return '落ちた';
      return r.status !== 0 ? '止める' : '通す';
    };
    const 例 = [
      ['no-reflex.js', 'if (m === "まぼろし社") return 1;', '止める', '宣言に在る固有名(日本語)'],
      ['no-reflex.js', 'if (m === "phantomcorp") return 1;', '止める', '宣言に在る固有名(英語)'],
      ['no-reflex.js', 'if (m === "よそのなにか") return 1;', '通す', '宣言に無い語'],
      ['no-reflex.js', 'try { x(); } catch (e) {}', '止める', '黙る catch(形で見る)'],
      ['no-fixed-names.js', 'const s = "まぼろし社";', '止める', '固有名の門(日本語)'],
      ['no-fixed-names.js', 'const s = "ふつうの語";', '通す', '固有名の門(通すべき)'],
    ];
    const 外れ = [];
    for (const [f, 本文, 期待, 名] of 例) {
      const r = 叩く(f, 本文);
      if (r !== 期待) 外れ.push(名 + ': ' + r + '(期待=' + 期待 + ')');
    }
    /* ★【宣言が無い現場では何もしない】を測る(2026-08-31、配布先の実測のあとで数えた)。
     *   install.mjs の注釈は「宣言が無い現場では何もしないので、置いて安全」と★断言していたが、
     *   ★★それを測る双子が1つも無かった。同じ日に、案内文の別の断言(『実害はありません』)が
     *   実測で覆っている(10.2 ── 出口が 0 から 2 になった)。★断言は、測るまで断言ではない。 */
    fs.writeFileSync(path.join(仮, 'guardian.config.json'), JSON.stringify({
      map: 'docs/CODEMAP.md', watch: ['worker'],
    }, null, 1) + '\n');
    const 宣言なし = [
      ['no-reflex.js', 'if (m === "まぼろし社") return 1;', '通す', '宣言が無ければ固有名で止めない(no-reflex)'],
      ['no-fixed-names.js', 'const s = "まぼろし社";', '通す', '宣言が無ければ固有名で止めない(no-fixed-names)'],
    ];
    for (const [f, 本文, 期待, 名] of 宣言なし) {
      const r = 叩く(f, 本文);
      if (r !== 期待) 外れ.push(名 + ': ' + r + '(期待=' + 期待 + ')');
    }
    if (外れ.length) {
      ng.push('★門が期待どおりに働いていません: ' + 外れ.join(' / ')
        + ' ── **止めるべきものを止めるか**を見本で測っています。'
        + 'エンジンが固有名を持っていないか(宣言から読んでいるか)を疑ってください');
    } else {
      ok.push('門は見本で期待どおりに働く(固有名は宣言から読み、形は形で見る・' + (例.length + 宣言なし.length) + '通り ── ★うち ' + 宣言なし.length + '通りは【宣言が無い現場では何もしない】を測っている)');
    }
  } catch (e) {
    未測.push('門が生きているかは見ていません(見本を建てられませんでした: '
      + String(e && e.message).slice(0, 120) + ')');
  } finally {
    try { fs.rmSync(仮, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch (_) { /* ★残ったことは、走り終わりの検査が赤で言う(黙らせていない) */ }
  }
}

/* ★B12.【版の上げ方が、宣言どおりか】(2026-08-31、依頼主の指示で決めた規則)。
 *
 * ★実際に起きた: 9.99 まで小番号を2桁で使っていたのに、10.0 から黙って .9 で繰り上げた。
 *   ★★規則がどこにも書いていなかったので、気分で変えられた ── 依頼主が数字の進み方に気づいて発覚。
 *   実測: 10.0 以降の29版は、前の規則なら 10.0〜10.28。★大番号が2回 余計に上がっている。
 * ★規則(SPEC.md「版の付け方」): 大番号は【口が変わった / 出口の語が変わった / 配る構成が変わった】
 *   ときだけ。それ以外は小番号で、★★繰り上げない(12.9 の次は 12.10)。
 * ★★★見るもの: 大番号が上がった版で、SPEC.md が一緒に変わっているか。
 *   (口も語も配る構成も、全部 SPEC.md に書いてあるので、そこが動かずに大番号だけ上がったら規則違反)
 * ★git が無ければ【ここでは測れない】── 正本の履歴が要る。 */
{
  const 版 = (v) => { const m = String(v).match(/^(\d+)\.(\d+)/); return m ? { 大: +m[1], 小: +m[2] } : null; };
  const g = (...a) => spawnSync("git", a, { cwd: HERE, encoding: "utf8", windowsHide: true, timeout: 60000 });
  /* ★【いま】は作業木の値、【前】は それと違う いちばん新しい committed 値。
   *   ★★こう取らないと、コミット前は1つずれる(実測: 12.9 を 12.7 と比べた)。 */
  const 履歴 = g("log", "--format=%H", "-8", "--", "KIT_VERSION");
  if (履歴.status !== 0 || !String(履歴.stdout || "").trim()) {
    測れない.push("版の上げ方は見ていません(git が正本の履歴を答えません)");
  } else {
    const shas = String(履歴.stdout).trim().split(/\r?\n/);
    const いま = 版(kit("KIT_VERSION"));
    let 前 = null, 前sha = null;
    for (const sha of shas) {
      const v = String(g("show", sha + ":KIT_VERSION").stdout || "").trim();
      const x = 版(v);
      if (x && いま && (x.大 !== いま.大 || x.小 !== いま.小)) { 前 = x; 前sha = sha; break; }
    }
    if (!いま || !前) {
      測れない.push("版の上げ方は見ていません(前の版が読めません)");
    } else if (いま.大 === 前.大) {
      ok.push("版の上げ方は宣言どおり(" + 前.大 + "." + 前.小 + " → " + いま.大 + "." + いま.小
        + " ── 小番号だけ動いた。繰り上げていない)");
    } else {
      /* 大番号が動いた ── その版の中で SPEC.md も動いているか(作業木まで含めて見る) */
      /* ★ここも 道.cjs を通す(2026-09-03)── ★★使うのは真偽だが、
       *   ★★★「道の一覧を返す git を、共通の口の外で叩かない」を1本の規則にするため。 */
      const d = 道の口.道を取る(HERE, "diff", "--name-only", 前sha, "--", "SPEC.md");
      if (d.道.length) {
        ok.push("版の上げ方は宣言どおり(大番号 " + 前.大 + " → " + いま.大 + " ── SPEC.md も一緒に変わっている)");
      } else {
        ng.push("★大番号を上げたのに SPEC.md が変わっていません(" + 前.大 + "." + 前.小
          + " → " + いま.大 + "." + いま.小 + ")。**大番号は【口が変わった / 出口の語が変わった / 配る構成が変わった】ときだけ**です(SPEC.md「版の付け方」)。★小番号は繰り上げません ── " + 前.大 + "." + (前.小 + 1) + " にしてください");
      }
    }
  }
}

/* B8c. 【門が、クラスで書かれた現場でも鳴るか】(2026-08-30、9.18 の作業中に見つかった)。
 *
 * ★実際に起きた: `defsOfText` が拾うのは function と const / let だけで、**class が定義にならない**。
 *   クラスの中身は字下げされているので(行頭定義だけを上位の記号と数える)メソッドも拾えず、
 *   **そのファイルは丸ごと持ち主なしになる。**
 *   実測: `class Cart { total(){ … * (1 + tax) } }` から税の掛け算を落とす(本物の破壊)→
 *   **「触れた記号: (器のコードに変更なし)」・近傍なし**。しかも何も言わない。
 *   ★JS/TS の現場の多くはクラスで書かれている。**そこでは門が丸ごと盲目**だった。
 *   この現場は関数と const だけなので、実測しないと一生出ない条件である。
 * ★だから見本を建てて【実際に門を回す】。門が鳴らないことは、この塊では合格ではない。
 * ★git が無い機械では測れない ── そのときは【未測】(緑にも赤にもしない)。 */
{
  const 仮 = 見本を建てる('guardian-class-');
  const g = (...a) => spawnSync('git', a, { cwd: 仮, encoding: 'utf8', windowsHide: true, timeout: 60000 });
  try {
    fs.mkdirSync(path.join(仮, 'src'), { recursive: true });
    const 書く = (p, s) => fs.writeFileSync(path.join(仮, p), s);
    書く('src/tax.js', 'export const tax = 0.1;\n');
    書く('src/cart.js', 'import { tax } from "./tax.js";\n\nexport class Cart {\n'
      + '  #items = [];\n  add(i) { this.#items.push(i); }\n'
      + '  total() { return this.#items.reduce((a, b) => a + b.price, 0) * (1 + tax); }\n}\n');
    書く('src/checkout.js', 'import { Cart } from "./cart.js";\nexport class Checkout {\n'
      + '  run(items) { const c = new Cart(); for (const i of items) c.add(i); return c.total(); }\n}\n');
    書く('guardian.config.json', JSON.stringify({
      neighbors: { rings: 2, code: ['src'], notes: [], ext: ['js'],
        answer: '.guardian/a.json', need: '.guardian/n.json' } }, null, 1) + '\n');
    if (g('init', '-q', '.').status !== 0) throw new Error('git init が失敗');
    g('config', 'user.email', 'selfcheck@example.invalid');
    g('config', 'user.name', 'selfcheck');
    g('add', '-A');
    if (g('commit', '-q', '-m', 'seed').status !== 0) throw new Error('git commit が失敗');
    /* 本物の破壊: 税の掛け算を落とす(クラスのメソッドの中) */
    書く('src/cart.js', fs.readFileSync(path.join(仮, 'src/cart.js'), 'utf8').replace(' * (1 + tax);', ';'));

    const r = spawnSync(process.execPath, [path.join(HERE, 'neighbors.mjs'), '--list'],
      { cwd: 仮, encoding: 'utf8', windowsHide: true, timeout: 60000 });
    const 出 = String(r.stdout || '') + String(r.stderr || '');
    const 外れ = [];
    if (!/触れた記号:[^\n]*\bCart\b/.test(出)) 外れ.push('クラス Cart を【触れた記号】と見なせていない');
    if (!/\bCheckout\b/.test(出)) 外れ.push('Cart を使う Checkout が近傍に出ていない');
    if (外れ.length) {
      ng.push('門がクラスで書かれた現場で鳴りません: ' + 外れ.join(' / ')
        + ' ── そこでは**門が丸ごと盲目**になります(出力: ' + 出.split('\n').slice(0, 3).join(' / ').slice(0, 200) + ')');
    } else {
      ok.push('門はクラスで書かれた現場でも鳴る(class の変更を捉え、それを使う側を近傍に出す)');
    }
  } catch (e) {
    未測.push('門のクラス対応は見ていません(見本を建てられませんでした: '
      + String(e && e.message).slice(0, 120) + ')── git が要ります');
  } finally {
    try { fs.rmSync(仮, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch (_) { /* ★残ったことは、走り終わりの検査が赤で言う(黙らせていない) */ }
  }
}

/* B9. 運用の文脈が宣言されているか(2026-08-30、実験室での実測から)
 *   ★止めない。だが【見ていない】ことを黙らない ── B1c(個人情報の見張り)と同じ形。
 *
 *   実測(research/lab/EXP-004): 壊れが全部「無いもの」の題材で、
 *     「一から書くなら?」            … 3/6
 *     「何が起きたら困る?」          … 3/6(同じ3件を見つけ、同じ3件を見逃した)
 *     理由なし・確信度つき ×2体      … 3/6(やはり同じ3件)
 *     「一から書くなら?」+ 運用の文脈 … 5〜6/6
 *   **問いをどう変えても1ミリも動かず、文脈を足したら動いた。**
 *   足した文脈と出たものが1対1で対応した(数百MB→上限 / cron5分→錠 / 5人2年→記録)。
 *
 *   ★つまり運用の欠落(上限・錠・記録・退避)は、文脈が宣言されるまで
 *     **どんな問い方をしても永久に出ない。** 無音を安全と読ませないために、ここで言う。 */
{
  let 文脈 = null;
  try {
    const { 宣言 } = 宣言を読む();
    文脈 = 宣言 ? (Array.isArray(宣言.context) ? 宣言.context.filter((x) => String(x).trim()) : []) : null;
  } catch (_) { 文脈 = null; }

  if (文脈 === null) {
    未測.push('運用の文脈: 宣言が読めないので見ていません');
  } else if (!文脈.length) {
    未測.push('運用の文脈が宣言されていないので、**運用の欠落(上限・錠・記録・退避)は見ていません**'
      + ' ── guardian.config.json の context に書くまで、どんな問い方をしても出ません(guardian/hunch.md)');
  } else {
    ok.push('運用の文脈を ' + 文脈.length + ' 行 宣言している(違和感が届く広さは、ここで決まる)');
  }
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
/* ★4語で出す: ✓ 通過 / ? 未測 / － ここでは測れない / ✗ 外れ。
 *   未測は【止めない】が【緑に混ぜない】── verdict.mjs の「不明」と同じ扱い。
 * ★出口も4語ぶん持つ(2026-08-31、配布先の実測): 外れ=1 / **未測=2(不明)** /
 *   ここでは測れない=0 / それ以外=0。
 *   ★直す前は未測でも0を返していたので、verdict が通過に数えていた ──
 *     画面には「未測1件」と出ているのに、合否は「不明0」。**CI は画面を読まない。**
 *   ★そして直す前のここには「合否で拾いたい現場は evidence に unknownIf を足すと【不明】になる」
 *     と書いてあったが、**verdict はそれを出口0のときに見ていなかった** ──
 *     案内された逃げ道が実装に無い、という形だった(9.49 で verdict 側も直した)。
 *   ★人に見せる語彙と、機械に返す符号は、同じ数だけ持つ。
 *     語彙が4つで符号が3つなら、どれか2つが同じ符号に潰れ、潰れた方は必ず緑に化ける。 */
/* ★後始末をしたか(上の宣言の続き)。★★ここは【最後】に置く ── 見本を建てる検査が全部済んだ後。 */
{
  /* ★台帳に在るものだけを見る(全体差分ではない ── @codex の指摘・2026-09-01) */
  const 建てた = [...私が建てた];
  const 残っている = 建てた.filter((道) => { try { return fs.existsSync(道); } catch (_) { return false; } });
  /* ★1段目(見本ごとの finally)で消えなかったものだけ、ここで拾い直す。
   *   ★★台帳に在る道しか触らない ── ★★★他の走行の見本には、絶対に手を出さない。 */
  let 拾えた = 0;
  for (const 道 of 残っている) {
    try { fs.rmSync(道, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); } catch (_) {}
    try { if (!fs.existsSync(道)) 拾えた++; } catch (_) {}
  }
  const 残り = 残っている.length - 拾えた;
  /* ★他人の見本は【数えるだけ】── 消さない・赤にしない・自分の数に混ぜない */
  let 他所 = null;
  try {
    他所 = fs.readdirSync(一時の親).filter((n) => 見本の名.test(n))
      .map((n) => path.join(一時の親, n)).filter((道) => !私が建てた.has(道)).length;
  } catch (_) { 他所 = null; }
  const 但し = 他所 ? "(★別に " + 他所 + " 個ありますが、★★この走行の台帳に無いので触っていません ── 他の走行のものか、前から在るものです)" : "";
  if (残り) {
    ng.push("★この走行が建てた見本が " + 残り + " 個 残っています"
      + "(建てた " + 建てた.length + " 個 / 1段目で消えなかった " + 残っている.length
      + " 個のうち、拾い直しで " + 拾えた + " 個は消せました)"
      + " ── **見本を建てた検査が、後始末をしていません**。"
      + "★配布先で 202,086個(推定61.5GB)まで溜まった実績があります(2026-09-01)" + 但し);
  } else if (残っている.length) {
    ok.push("この走行が建てた見本 " + 建てた.length + " 個は、全部 片づきました ── ★ただし "
      + 残っている.length + " 個は【1段目では消えず、拾い直しで消えました】。"
      + "**混み合うと rmSync が落ちます**。これが続くなら、見本の建て方を疑うこと" + 但し);
  } else {
    ok.push("この走行が建てた見本 " + 建てた.length + " 個は、全部 片づきました" + 但し);
  }
}

/* ★【受領証】── 取得元と、いまの中身と、合否を【同じ回で】返す(2026-08-31、CodeX の指摘)。
 *
 *   `--sha` が言えるのは『最後に pull が記録した SHA』までで、
 *   **『いまの中身をその SHA として測った』ではない**。取ったあとに1本壊れても同じ値を返す。
 *   SHA の読み取りと緑判定を**別のコマンド**でやると、別の時点の結果を結び付けられてしまう。
 * ★だから1回で全部返す: 取得元 / いまの中身の digest / 合否。
 *   ★赤や未測のときは【成功の受領証を出さない】── verdict を明記し、出口も 0 にしない。 */
if (process.argv.includes('--receipt')) {
  let 取得元 = null;
  try { 取得元 = JSON.parse(fs.readFileSync(path.join(HERE, '.guardian', 'pulled.json'), 'utf8')).sha || null; } catch (_) {}
  const 並び = Object.keys(現在の指紋).sort();
  let h = 2166136261;
  for (const f of 並び) { const t = f + '=' + 現在の指紋[f] + ';';
    for (let k = 0; k < t.length; k++) { h ^= t.charCodeAt(k); h = Math.imul(h, 16777619); } }
  const verdict = ng.length ? '外れ' : (未測.length ? '未測あり' : (測れない.length ? '通過(ここでは測れないものあり)' : '通過'));
  process.stdout.write(JSON.stringify({
    sourceSha: 取得元, verdict, currentDigest: (h >>> 0).toString(36) + '-' + 並び.length,
    version: (() => { try { return fs.readFileSync(path.join(HERE, 'KIT_VERSION'), 'utf8').trim(); } catch (_) { return null; } })(),
    ng: ng.length, 未測: 未測.length, 測れない: 測れない.length, ok: ok.length,
  }, null, 1) + NL2);
  process.exit(ng.length ? 1 : (未測.length ? 2 : 0));
}
for (const s of ok) console.log('  ✓ ' + s);
for (const s of 未測) console.log('  ? 未測 ' + s);
for (const s of 測れない) console.log('  － ここでは測れない ' + s);

/* ★構造化された【判定】の表(24.15、2026-09-03、@codex 11:27)。
 *   ★★ok/ng/未測 の件数は【押した回数】であって、判定の数ではない ──
 *   @kozo が61件を仕分けたら、大半は「やった事の報告」だった。
 *   ★★★ここは 判定の入口を通った物だけを、機械が集計できる形で出す。
 *   通っていない物は【未仕分け】として数え、**暫定であることを表に出す**。 */
/* ---------- B23. 判定レコードの形が、契約どおりか(2026-09-03、@codex 12:47 が条文にした) ----------
 *
 * ★@codex:「state=unknown ⇒ issueCount is null / green ⇒ 0 / red ⇒ >0 をスキーマ検証し、
 *   ★★状態を後から件数で推測しない契約にします」。
 *
 *   ★★★この検査は【自分より前に積まれたレコード】だけを見る(自分は最後に積む)。
 *   契約を破ったレコードが1つでも在れば赤 ── **記録の形が壊れたら、記録は読めない。** */
{
  const 破り = [];
  for (const r of 判定たち) {
    if (r.状態 === '未測' && r.issueCount !== null) 破り.push(r.対象 + '(未測なのに issueCount=' + r.issueCount + ')');
    if (r.状態 === '緑' && r.issueCount !== 0) 破り.push(r.対象 + '(緑なのに issueCount=' + r.issueCount + ')');
    if (r.状態 === '赤' && !(Number(r.issueCount) > 0)) 破り.push(r.対象 + '(赤なのに issueCount=' + r.issueCount + ')');
    /* ★機械が読む欄が【人の文を見ろ】と言ってはいけない(26.5、2026-09-03、@kozo が見つけた)。
     *   ★★実測: 赤2件の 根拠 が「検査が違反を示しました(下の文を見てください)」だった。
     *   ★★★機械は【下の文】を読めない。読めるなら 構造化は要らなかった。 */
    if (!r.根拠 || /下の文|下記|上の文/.test(String(r.根拠)))
      破り.push(r.対象 + '(根拠が人の文を指しています: ' + String(r.根拠).slice(0, 30) + ')');
  }
  判定({
    対象: 'B23 判定レコードの形が契約どおりか',
    状態: 破り.length ? '赤' : '緑',
    根拠: 破り.length ? '契約(未測⇒null / 緑⇒0 / 赤⇒>0)を破ったレコードが在ります'
      : '★積まれたレコードを全部 見て、契約を破った物が空だった',
    走査集合: '判定たち(' + 判定たち.length + '件・この検査より前に積まれた分)',
    件数: 破り.length, issueCount: 破り.length, 正本由来: null,
    文: 破り.length ? ('★判定レコードが契約を破っています(' + 破り.length + '件): ' + 破り.join(' / ')
        + ' ── ★★件数だけを読む側では【緑と未知が同じに見えます】。'
        + '★★★状態を後から件数で推測しない、が この記録の契約です。')
      : '判定レコードは契約どおり(未測⇒issueCount null / 緑⇒0 / 赤⇒0より大きい)',
  });
}

if (判定だけ) {
  console.log = 本当のlog2;
  console.log(JSON.stringify({
    形: 'guardian-判定 v1',
    判定: 判定たち,
    数: {
      判定: 判定たち.length,
      緑: 判定たち.filter((x) => x.状態 === '緑').length,
      赤: 判定たち.filter((x) => x.状態 === '赤').length,
      未測: 判定たち.filter((x) => x.状態 === '未測').length,
      未仕分けの押し: ok.length + ng.length + 未測.length - 判定たち.length,
    },
    注: '★【未仕分けの押し】は、判定の入口を通っていない ok/ng/未測 の数です。'
      + '★★その中には【やった事の報告】と【まだ通していない判定】が混ざっています ── '
      + '★★★数え分けは まだ出来ていません(暫定)。'
      + '★正本由来: null = その検査には要らない / false = ★★証明を試みたが できなかった。'
      + 'true は【署名や固定マニフェストで検証できた時だけ】── ★★★いまの版に その仕組みは在りません。'
      + '★issueCount: 未測 = null / 緑 = 0 / 赤 = 0 より大きい。★★状態を件数から推測しないこと(B23 が毎回 確かめます)。',
  }, null, 1));
  process.exit(0);
}
if (ng.length) {
  console.log('');
  for (const s of ng) console.log('  ✗ ' + s);
  console.log(`\n塊の自己検査: ${ng.length}件の外れ`
    + (未測.length ? ` / 未測 ${未測.length}件` : '')
    + (測れない.length ? ` / ここでは測れない ${測れない.length}件` : ''));
  process.exit(1);
}
/* ★出口は【未測が在れば2】(2026-08-31、配布先の実測)。
 *   直す前は未測でも0を返していたので、`verdict` が**通過に数えていた** ──
 *   画面には「未測1件」と出ているのに、合否は「不明0」と言っていた。
 *   ★この塊の芯は【不明を緑に数えない】である。それが機械の側で消えていた。
 * ★「ここでは測れない」は0のまま ── 構造的に測れないものを不明に数えると、
 *   すべての配布先の合否が永久に不明になり、不明が読み飛ばされる(7条・直せない赤と同じ形)。
 *   だが**黙らない**: 件数も中身も必ず出す。 */
if (未測.length) {
  console.log(`\n塊の自己検査: 通過 ${ok.length}件 / **未測 ${未測.length}件**`
    + (測れない.length ? ` / ここでは測れない ${測れない.length}件` : ''));
  console.log('  ※【未測】は合格ではありません。**測れていない**という意味です'
    + '(guardian.config.json に宣言を書く / pull を回す ── 測れるようになります)。');
  console.log('  ★出口2を返します ── 合否(verdict)はこれを【不明】として受け、緑に数えません。');
  process.exit(2);
}
if (測れない.length) {
  console.log(`\n塊の自己検査: 通過 ${ok.length}件 / ここでは測れない ${測れない.length}件`);
  console.log('  ※【ここでは測れない】は、その場所に前提が無いという意味です'
    + '(正本の履歴が無い / その文書が無い)。**直せるものではないので止めませんが、通ったとも言いません。**');
  process.exit(0);
}
console.log(`\n塊の自己検査: ${ok.length}件すべて期待どおり`);
