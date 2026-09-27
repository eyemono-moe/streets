---
name: handle-streets-issue
description: 番号で指定した GitHub Issue を、最新の main から切った worktree で片付けて PR を出す。
argument-hint: "#<Issue 番号>"
disable-model-invocation: true
---

# Issue を片付ける

対象：`$ARGUMENTS` の Issue。番号が無ければ、何番かを聞いてから始める。

作業のやり方（構成・デザイン・画面の組み立て・テスト・検証）は `AGENTS.md` が正で、この手順はその上に、Issue を受けてから PR を出すまでの流れと、踏みやすい罠だけを足す。

## 手順

1. **Issue と進行中の PR を読む**。
   - `gh issue view <N> --json title,body,labels,comments,state` で読む。`--json` を付けないと何も出ずに終わることがある
   - その Issue を進めている open PR を探す（`gh pr list --state open --search "<N>"` と、`gh pr list --state open` の題名）。Issue が開いたまま、複数の PR に分けて進んでいることがある
   - Issue の本文は短いことが多い。触る画面・部品を `AGENTS.md` の「構成」「カラムを足す」などから当たりを付け、似た既存の機能（同じパネルの別の項目など）がどう作られ、押した後にどう動くか（パネルが閉じるか、など）をコードで確かめる

   完了：Issue の要求を、変える画面と操作の言葉で言い直せる。似た既存の機能の作りと動きを、ファイルの位置つきで挙げられる。

2. **作業の前に確かめる**。次のどれかに当たるなら、利用可能な質問ツールで聞いて**答えを待ってから**手順 3 へ進む。
   - 要求が 2 通り以上に読め、どちらかで作る物が変わる
   - Penpot の v1 / redesign にも既存の部品にも、合わせる見た目が無い
   - 秘密鍵の境界・保存の形式など、ADR にするほど戻しにくい決定が要る
   - 1 つの PR に収まらず、分け方を決める必要がある（手順 5）

   どれにも当たらないなら、聞かずに進む。自分で決めたこと（置き場所・文言など）は PR の本文と最後の報告に書く。

   完了：上のどれにも当たらないか、当たったものすべてに答えがある。

3. **worktree を切る**。メインのチェックアウトではブランチを切らない。

   ```sh
   git fetch origin main
   git worktree add -b eyemono-moe/issue-<N>-<短い英語> .claude/worktrees/issue-<N> origin/main
   cd .claude/worktrees/issue-<N>
   vp install
   ```

   `vp install` を飛ばすと、`vp check` が数百件の型エラーを出す。コードのせいではなく、依存が入っていないだけ。

   完了：worktree の中で `vp check` が通る（まだ何も変えていない状態で）。

4. **作る**。`AGENTS.md` に従う。とくに次を落としやすい。
   - 見た目を変えたら、同じ変更でストーリーを足すか直す（端の状態も並べる）
   - core の純粋なロジックを変えたら、テストを足す
   - コメントは、コードを読んでも分からない理由だけ

   完了：`vp run verify` が通る。ストーリーを変えたなら `vp run @streets/web#storybook:build` も通り、変えたストーリーを下の「ストーリーを目で見る」で画像にして確かめた。

5. **PR を出す**。コミットのメッセージと PR の本文は日本語で、本文の頭に `Closes #<N>` を書く。コミットのたびに `vp check --fix` が走る（`.vite-hooks/pre-commit`）。
   - 1 つの PR に収まるなら、main 宛てに 1 本出す
   - 分けるなら、`gh stack` で積み重ねた PR にする（`gh-stack` の skill を読んでから使う）。土台（core の変更など）を下に、それに頼る画面を上に置く。`gh stack` が使えないときは、子の PR の宛先を親のブランチにして出し、どの順でマージするかを本文に書く。この場合、親を `--delete-branch` でマージすると GitHub が子の PR を閉じるので、先に子の宛先を main に付け替えるよう本文に書いておく
   - 本文には、変えたこと・自分で決めたこと・見る場所（ストーリーの名前）を書く

   完了：すべての PR の URL がそろい、どれも main（または積み重ねの親）宛てになっている。

6. **報告する**。PR の URL、変えたこと、確かめたこと・確かめていないこと（実際のアプリで動かしたか、など）、残っている質問を伝える。既存の機能の動きに触れるときは、手順 1 でコードを見て確かめたことだけを書く。

## ストーリーを目で見る

ビルドしたストーリーを配って、Playwright で画像にする。

```sh
# 空いているポートを使う。6006 や 6107 は、ほかの worktree の Storybook が使っていることがある
cd apps/web && npx --yes http-server storybook-static -p 6213 -s &
curl -s localhost:6213/index.json   # 足したストーリーが載っているか確かめる。載っていなければ別のサーバーに繋がっている
```

- `playwright` はルートから `import` できない。`ls -d node_modules/.pnpm/playwright@*/node_modules/playwright` で場所を探し、その `index.mjs` を絶対パスで import するスクリプトを scratchpad に書く
- 開く URL は `iframe.html?id=<index.json の id>&viewMode=story`
- 画像は Read で見る
- 済んだらサーバーを `fuser -k 6213/tcp` で止める。`pkill -f <パターン>` は、そのコマンドを打ったシェル自身にも当たって、作業中のコマンドごと止まる
