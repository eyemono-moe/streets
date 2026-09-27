---
name: pick-streets-issue
description: open な Issue から、優先度が高く影響の大きいものを 1 つ選び、handle-streets-issue の手順で片付ける。
argument-hint: "[絞り込みの条件（例: bug、ui、P1）]"
disable-model-invocation: true
---

# Issue を選んで片付ける

`$ARGUMENTS` に条件があれば、その条件に合う Issue だけから選ぶ。

## 手順

1. **候補を集める**。

   ```sh
   gh issue list --state open --limit 200 --json number,title,labels,assignees,body,comments
   gh pr list --state open --json number,title,headRefName,closingIssuesReferences
   git fetch origin
   ```

   次に当たる Issue は候補から外す。人の判断が先に要るか、ほかの誰かが進めている。
   - ラベルが `observation`（実鍵でしか答えられない）・`question`・`wontfix`・`duplicate`
   - 題名や本文の目的が、実装ではなく「〜かを決める」「〜を用意するかどうか」のような判断そのもの
   - open PR の `closingIssuesReferences` にある、または PR の題名や本文がその Issue を進めていると読める
   - `main` に入っていないブランチに、この 7 日のうちのコミットがある。ブランチ名は `issue-<N>` で終わるものと `issue-<N>-…` の両方がある。それより古いだけのブランチは放置とみなして外さず、選んだときの報告で触れる

     ```sh
     git for-each-ref --no-merged origin/main --format='%(committerdate:short) %(refname:short)' \
       'refs/heads/**/*issue-<N>' 'refs/heads/**/*issue-<N>-*' \
       'refs/remotes/origin/**/*issue-<N>' 'refs/remotes/origin/**/*issue-<N>-*'
     ```
   - 自分以外が assignee になっている

   完了：open な Issue すべてが「候補」か「外した（理由つき）」のどちらかに分かれている。

2. **1 つ選ぶ**。候補を次の順に比べる。
   1. 優先度のラベル：`P1` → `P2` → `P3` → ラベル無し
   2. 同じ優先度の中では、影響の大きいもの。重いものから順に：
      - 使っている人が今困っている不具合（`bug`、`feedback` から起票されたもの）
      - データを失う、投稿が届かないなど、取り返しがつかないもの
      - 多くの人が毎回通る画面・操作（ホーム・投稿・通知など）に関わるもの
      - ほかの Issue がこれを待っている（本文で「#N の後に」「#N が要る」と書かれている）もの
   3. それでも並ぶなら、1 つの PR に収まりそうなものを先に取る

   選んだ Issue と、次点の 2 つを、選んだ理由とあわせて人に伝える。候補が 1 つも無ければ、外した理由の内訳を伝えて終える。

   完了：Issue を 1 つ選び、選んだ理由を伝えた。

3. **片付ける**。`.claude/skills/handle-streets-issue/SKILL.md` を読み、`$ARGUMENTS` を手順 2 で選んだ Issue の番号に読み替えて、その手順 1 から最後まで従う。そこで作業の前に聞くことがあれば、答えを待つ。

   完了：handle-streets-issue の手順 6（報告）まで済んだ。
