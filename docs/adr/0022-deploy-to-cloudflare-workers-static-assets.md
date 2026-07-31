---
status: proposed
---

# v1 以降は Cloudflare Workers の static assets として配信する

**この ADR はまだ実装されていない。** 現時点では方針の記録であり、配信経路の移行は別途行う。

streets v1 以降は **Cloudflare Workers** で配信する。バックエンドを持たないため、**フロントエンドを static assets として配信するだけ**の構成とする。

## 経緯

- v0 は **Vercel** にデプロイしていた。`vercel.json` と `.vercel/` がその名残として残っている。
- 無効化されている `.github/workflows/deploy.yaml_` は **Cloudflare Pages** へデプロイする内容（`wrangler pages deploy ./dist --project-name=streets`）。
- v1 以降の配信先は **Pages ではなく Workers** とする。

**この違いは重要である。** `deploy.yaml_` を「プレビューを復活させよう」として単純にリネーム有効化すると、意図と異なり Pages へデプロイされる。移行時にはワークフローの中身を書き換える必要がある。

## 現在のデプロイ経路の状態

| ワークフロー | 状態 |
|---|---|
| `deploy.yaml_` | **無効**（ファイル名末尾のアンダースコアにより GitHub Actions が認識しない）。有効なら全ブランチの push ごとに Cloudflare Pages へデプロイし、`release` ブランチのみ production 環境になる |
| `createReleaseBranch.yaml` | 有効。release 公開時に `release-vX.Y.Z` ブランチを作り、`release` ブランチへ PR を出す。**その PR のマージが本番反映** |
| `ci.yaml` | 有効。push ごとに check のみ |

したがって **`main` へのマージは本番に影響しない。** 本番は `release` ブランチであり、release 公開 → PR マージという明示的な手順を踏む必要がある。[ADR-0002](./0002-v0-parity-before-cutover.md) の「v0 機能パリティを満たしてから一括切替」が守るのはこの release 経路であって、`main` へのマージではない。

**現状、プレビュー環境は存在しない。** `deploy.yaml_` が無効なため、ブランチを push しても PR を出しても自動デプロイは走らない。v1 の動作確認はローカル（`pnpm preview` + ローカルリレー）で行う。

## 移行時に決めること

- `on: push` のブランチ絞り込み。全ブランチ無差別デプロイは dependabot ブランチや古い feature ブランチまで配信するため、`v1` と `release` などに限定する。
- `vercel.json` の `rewrites`（SPA フォールバック）と `headers`（`/.well-known/nostr.json` の CORS）に相当する設定を Workers 側でどう表現するか。**この2つは機能要件に紐づく** — SPA フォールバックが無ければルーティングが壊れ、CORS ヘッダが無ければ NIP-05 検証が壊れる。
- `vercel.json` と `.vercel/` を削除するタイミング。
- `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` / `VITE_SENTRY_DSN` の各 secret が現在も有効か。
