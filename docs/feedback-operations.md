# フィードバック受付の運用

Streets β版では、Google Forms の回答を Cloudflare Workers AI で整理し、GitHub Issue として登録する。
連絡先は AI と GitHub へ送らず、フォームの回答先 Spreadsheet にだけ保存する。

```text
Streets → Google Forms → Apps Script → Cloudflare Worker → Workers AI
                                      └──────────────→ GitHub Issues
```

## フォーム

Google Form に次の設問を、この表記のまま作る。

| 設問 | 形式 | 必須 |
| --- | --- | --- |
| 種別 | ラジオボタン（不具合／機能リクエスト／その他） | はい |
| 概要 | 記述式 | はい |
| 詳細 | 段落 | はい |
| 再現手順 | 段落 | いいえ |
| 期待した結果 | 段落 | いいえ |
| 実際の結果 | 段落 | いいえ |
| 環境情報 | 段落 | いいえ |
| 連絡先 | 記述式 | いいえ |
| 取り扱いへの同意 | チェックボックス（下記の同意文） | はい |

メールアドレスの自動収集と回答概要の公開は無効にする。
環境情報は「事前入力したリンクを取得」で得たURLの値を `{context}` に置き換え、Cloudflare Pages の `VITE_FEEDBACK_URL` に設定する。

フォーム冒頭には次の文面を掲載する。角括弧の部分は公開前に確定する。

> このフォームでは、Streets β版の改善を目的として、不具合報告・機能要望を受け付けます。
>
> 入力内容（概要、詳細、再現手順など）と、アプリが付加する環境情報（Streetsのビルド識別子、配信元、ブラウザ情報）はGoogle Forms／Sheetsに保存され、Cloudflare Workers AIで整理したうえで、公開GitHub Issueとして掲載される場合があります。任意で入力した連絡先は、AIやGitHubへ送りません。
>
> 氏名、メールアドレス、秘密鍵、公開したくない投稿内容、その他の機密情報を報告本文へ入力しないでください。回答は受領から［90日］を目安に原本を削除します。ただし、公開されたGitHub Issueはプロジェクトの記録として残る場合があります。
>
> 運営者：［氏名または屋号］  
> 問い合わせ：［メールアドレス］  
> プライバシーポリシー：［URL］

必須の同意項目には次の選択肢を置く。

> 上記を確認し、入力内容（連絡先を除く）がAIで処理され、公開GitHub Issueに掲載される可能性に同意します。

送信後メッセージには次の文面を使う。

> 送信ありがとうございました。内容はAIによる整理後、公開GitHub Issueとして登録されます。返信や実装をお約束するものではありません。

## プライバシーポリシーへ追記する文面

以下は運用者情報と保存期間を確定したうえで掲載するためのひな型であり、個別の法的助言ではない。

### フィードバック情報の取り扱い

Streets は、β版の品質改善、不具合調査、機能要望の検討および問い合わせ対応のため、利用者がフォームへ入力した内容と、Streets のビルド識別子、アクセス元のオリジンおよびブラウザ情報を取得します。連絡先の入力は任意です。

入力内容は Google Forms／Google Sheets に保存され、報告内容を要約・分類するため Cloudflare Workers／Workers AI で処理されます。連絡先を除く報告内容は、公開 GitHub Issue に掲載される場合があります。Cloudflare は、顧客の明示的な同意なしに Workers AI の顧客コンテンツをモデルの学習または改善に利用しない旨を案内しています。

連絡先は問い合わせ対応のみに利用し、AIによる処理および公開GitHub Issueへの掲載対象にしません。フォームの原本は受領から［90日］を目安に削除します。ただし、公開されたGitHub Issueおよびその編集履歴は、プロジェクト運営上必要な期間保存される場合があります。

利用者は、本人または第三者の秘密鍵、非公開情報、個人情報その他公開を望まない情報を報告本文へ入力しないものとします。送信された提案は、Streets の改善に無償で利用できるものとします。報告への返信、Issue化または実装を保証するものではなく、運営者は公開前後に内容の編集、非公開化または削除を行うことがあります。

開示、訂正、削除その他の問い合わせは［問い合わせ先］までご連絡ください。

## Cloudflare Worker

`workers/feedback` がHMAC署名を検証し、入力を検査してからWorkers AIとGitHub APIを呼ぶ。
AI処理に失敗した場合も原文からIssueを作成し、D1とIssue本文のIDで二重登録を防ぐ。

1. D1を作成し、表示されたIDを `wrangler.jsonc` の `database_id` に設定する。

   ```sh
   pnpm --filter @streets/feedback-worker exec wrangler d1 create streets-feedback
   pnpm --filter @streets/feedback-worker exec wrangler d1 migrations apply streets-feedback --remote
   ```

2. `eyemono-moe/streets` だけを対象に、Issues の読み書きを許可した fine-grained personal access token を作る。
3. GitHub token と十分に長いランダムな共有鍵をSecretへ保存する。

   ```sh
   pnpm --filter @streets/feedback-worker exec wrangler secret put GITHUB_TOKEN
   pnpm --filter @streets/feedback-worker exec wrangler secret put WEBHOOK_SECRET
   pnpm --filter @streets/feedback-worker deploy
   ```

## Apps Script

フォームの回答先Spreadsheetから「拡張機能 → Apps Script」を開き、`workers/feedback/apps-script/Code.gs` を貼り付ける。

1. スクリプトプロパティ `FEEDBACK_WORKER_URL` にデプロイしたWorkerのURLを設定する。
2. `FEEDBACK_WEBHOOK_SECRET` にWorkerと同じ共有鍵を設定する。
3. インストール型トリガーとして、`onFormSubmit` を「スプレッドシートから」「フォーム送信時」で登録する。
4. テスト回答を送り、Spreadsheetの「処理状態」が `created`、GitHub Issue欄にURLが入ることを確認する。

失敗時は行に `failed` とエラーが残る。同じ処理IDの再送はWorker側で重複登録されない。

## 公開前チェック

- 運営者、問い合わせ先、保存期間、プライバシーポリシーURLを確定した
- フォームでメールアドレスを自動収集していない
- 回答概要を回答者へ公開していない
- GitHub tokenをリポジトリやApps Scriptへ直書きしていない
- Apps Scriptから連絡先をWorkerへ送っていない
- テスト回答によりIssueの原文、分類、ラベル、重複防止を確認した
- Spreadsheetの原本を保存期間に従って削除する担当と手順を決めた
