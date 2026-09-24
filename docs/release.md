# リリース

`streets.eyemono.moe` は Cloudflare Workers（`streets`）で配る。本番を決めるのはタグだけで、main に入れただけでは本番は変わらない。

## 流れ

1. **リリースの準備**：手元の Claude Code で `/release-notes` を実行する。前のタグから入った PR を読んで版の番号を提案し、決めた番号でリリースノート `apps/web/src/releases/<タグ>.md` の下書きを書いて PR を出す。人がその PR で直してマージする
2. **タグを打つ**：main のそのコミットに `v1.2.3` のタグを打って push する
3. **プレビュー**（`.github/workflows/release.yaml` の Preview）：ビルドして Worker の版を上げる。本番には出さない。版のプレビュー URL がジョブの要約に出る
4. **承認**：プレビューで確かめ、Production のジョブを承認する（`production` 環境の必須レビュアー）
5. **本番**：プレビューで確かめたのと同じ版を出し（ビルドし直さない）、同じノートで GitHub の Release を作る。その Release へのリンクを Nostr に投稿して知らせる

タグが main に入っていないコミットを指しているとき、ノートのファイルが無いときは、3 で止まる。

```sh
git switch main && git pull
git tag v1.2.3
git push origin v1.2.3
```

## 戻す

前の版を出し直す。版は Cloudflare に残っている。

```sh
pnpm exec wrangler rollback            # 直前の版へ
pnpm exec wrangler versions list       # 版の ID を見る
pnpm exec wrangler versions deploy <版の ID>@100%
```

## PR ごとのプレビュー

PR を開く・更新すると、`.github/workflows/preview.yaml` が `pr-<番号>` の URL に版を上げ、PR にコメントで知らせる。本番には出さない。fork からの PR では動かない（secrets を読めない）。

## 初めに一度だけ用意するもの

- **Cloudflare の API トークン**（`streets-github-actions`）：テンプレート「Edit Cloudflare Workers」で作る。Account Resources はこのアカウント、Zone Resources は `eyemono.moe`
- **GitHub の secrets**：`preview` と `production` の両方の環境に `CLOUDFLARE_API_TOKEN`・`CLOUDFLARE_ACCOUNT_ID`。リポジトリに `VITE_SENTRY_DSN`
- **GitHub の variables**：リポジトリに `VITE_FEEDBACK_URL`（フィードバックの Google フォーム。値は `apps/web/.env.example`）。無いとフィードバックの導線が押せない
- **Nostr へのお知らせ**：variables の `NOSTR_RELAYS`（投稿先のリレー。1 行に 1 つ）と、secrets の `NOSTR_PRIVATE_KEY`（お知らせを投稿するアカウントの鍵）
- **`production` 環境**：必須レビュアーと、出してよい参照を `v*` のタグだけにする
- **タグの保護**：`v*` のタグを作れる・消せるのを管理者だけにするルールセット
- **Workers Builds**：Cloudflare の画面の GitHub 連携は止める（二重に出さない）

## 独自ドメイン

`streets.eyemono.moe` は Cloudflare の画面で Worker に独自ドメインとして付ける（Workers & Pages → streets → Settings → Domains & Routes）。付けるときに同じ名前の DNS レコードが残っていると付けられないので、先に消す。版を出してもドメインの割り当ては変わらない。
