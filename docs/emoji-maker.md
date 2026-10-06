# カスタム絵文字を作る（運用）

絵文字ピッカーの「カスタム絵文字を作る」で作った画像の、置き場所と運用。URL の形は [ADR-0035](./adr/0035-custom-emoji-url.md)。

## しくみ

- 画面は打った言葉を `@streets/core/emoji-maker` で描いて見本にする。送るときは Worker の `POST /api/emoji` に指定を送る
- Worker は同じ処理で描き、R2 のバケット `streets-emoji` に置いて URL を返す。もう置いてあれば描かない。新しく描くときだけ、IP ごとに 1 分 30 回まで（`EMOJI_LIMITER`）
- 画像はバケットに付けた `emoji.streets.eyemono.moe` から CDN が配る。Worker は通らない
- 文字の輪郭は `apps/web/public/emoji-glyphs/v1/`（アプリの静的ファイル）。作り方とフォントのライセンスは [tools/emoji-glyphs](../tools/emoji-glyphs/README.md)

## 初めに一度だけ用意するもの

1. R2 のバケット `streets-emoji` を作る

   ```sh
   vp exec wrangler r2 bucket create streets-emoji
   ```

2. Cloudflare の画面で、バケットに独自のドメイン `emoji.streets.eyemono.moe` を付ける（R2 → streets-emoji → Settings → Custom Domains）。`r2.dev` の公開 URL は有効にしない
3. 画像を 1 つ作り、`emoji.streets.eyemono.moe` から開いて、2 回目に `cf-cache-status: HIT` になることを確かめる（`.png` は既定で CDN にキャッシュされ、置くときに付けた `Cache-Control: public, max-age=31536000, immutable` に従う）

バケットが無いと Worker を出せない（`wrangler deploy` が失敗する）。

## 消してほしいと頼まれたら

1. 絵文字の URL からハッシュを出し、`workers/app/src/emoji-denylist.ts` に足して出す（同じ指定でもう作られなくなる）

   ```sh
   vp run emoji:deny-hash -- https://emoji.streets.eyemono.moe/v1/…
   ```

2. R2 から消す

   ```sh
   vp exec wrangler r2 object delete "streets-emoji/v1/…"
   ```

3. Cloudflare の画面で、その URL の CDN のキャッシュを消す（Caching → Configuration → Purge Cache → Custom Purge）

ハッシュにするのは、消したものの文字をリポジトリに残さないため。
