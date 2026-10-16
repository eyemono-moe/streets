---
status: accepted
---

# Service Worker は共有の受け口だけにする

ほかのアプリの共有メニュー（Web Share Target）からファイルを受け取るには、`POST /share` を受ける Service Worker が要る。`/sw.js`（`apps/web/src/share/sw.ts`）を入れるが、受けるのは `POST /share` だけにする。画面やデータのキャッシュは持たず、ほかのリクエストはすべて素通しにする。

## なぜ

- 一度入った Service Worker は、利用者のブラウザに残り続ける。画面をキャッシュする Service Worker は、壊れた版や古い版を配り続けたときに、こちらから取り除きにくい。受け口だけなら、壊れても共有が失敗するだけで済む
- いまの配信（`/assets/*` を名前のハッシュで immutable に配る）で、2 回目以降の読み込みは十分速い

## 捨てた案

- **Worker（Cloudflare）が POST を受ける**：共有された画像や動画が、利用者のアップロード先ではなく Streets のサーバーを通ることになる
- **オフラインでも開けるようにキャッシュも持つ**：Nostr のクライアントはリレーへ繋がないと役に立たず、得るものに比べて上の危険が大きい
