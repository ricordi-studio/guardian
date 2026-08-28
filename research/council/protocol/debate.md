# Round 0(独立回答) / Round 1(相互批判)

## Round 0 ── Blind Analysis

**互いの回答を絶対に見せない。** 先に見せると「Claudeがそう言っているなら」というAI版の集団思考が起きる。
3者(Claude・ChatGPT・Gemini)それぞれに、`question.md` と `context.md` だけを渡す。

回答フォーマット(揃える。揃わないと Round 1 の比較がしづらくなる):

```
## Observation(何が起きているか)
## Hypothesis(なぜ起きると考えるか)
## Proposed mechanism(どう機械的に抑止・検出できるか)
## Expected benefit
## Risk
## Unknown(分からないこと。わからないと正直に書く ── Guardian本体の「不明」と同じ扱い)
```

保存先: `round0/{claude,chatgpt,gemini}.md`

## Round 1 ── Cross Review

Round 0 の3つの回答を**全員に**見せる。各AIに、**自分の案を含めた3案全部**について:

```
## Strong points
## Weak points
## Missing assumptions
## Possible false positives
## Possible false negatives
## Unnecessary complexity
## Evidence required(この指摘を裏付けるには何を確かめればよいか)
```

を書かせる。**目的は合意形成ではない。見落としを増幅して発見すること。**
「どれが一番良いか選べ」とは聞かない ── それは Round 1 の役目ではない(採否は `promotion.md` で人が行う)。

保存先: `round1/{claude,chatgpt,gemini}.md`

## 注意(最初の実験で崩れやすい点)

- 他AIの回答を見せる順番や量によって、後から読む側が引っ張られることがある。起きたら記録する(→ `experiment.md` 末尾)
- 「弱点もあります」で終わる形式的な指摘は、Round 1 としては不十分。**具体的な失敗ケース**を要求する
