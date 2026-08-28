# Round 2 ── Falsification(自己反証)

各AIに、**自分自身の Round 0 の提案**を攻撃させる。

> あなた自身の提案が失敗する具体的ケースを作れ。
> その対策を導入してもGuardianが防げない事故を考えよ。
> 可能なら最小再現ケースを作成せよ。

**defend your proposal ではなく destroy your proposal を優先する。**
「自分の案を守れ」と聞くと、もっともらしい理由付けが返ってくるだけになる。
「自分の案を壊せ」と聞いて初めて、提案者自身が気づいていなかった穴が出てくる。

回答フォーマット:

```
## Counterexample(反例)
## Failure condition(どういう条件で失敗するか)
## Why mechanism fails(なぜその機構では防げないか)
## Possible mitigation(あれば)
## Remaining unknown
```

保存先: `round2/{claude,chatgpt,gemini}.md`

## ここで終わる(いまの段階)

VISION.mdの Round 3(実際にコードを書かせて worktree で比較する)は**まだやらない**。
Round 0〜2 だけで Finding が書けるかを先に確かめる。書けないなら、それ自体が「Round 3 が要る」という発見になる。
