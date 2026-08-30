# Storybook と EventScene — 実装計画

**Goal:** イベントレンダラとスレッドを、リレー・IndexedDB・外部署名器なしで
Storybook 上に再現できるようにする。

## 1. Storybook の最小構成

- [x] Storybook 10 と Solid/Vite adapter、a11y addon を固定バージョンで追加する
- [x] `.storybook/main.ts` と `.storybook/preview.tsx` を作る
- [x] reset、UnoCSS、フォント、Light/Dark、380px canvas を本体と共有する
- [x] `storybook` / `storybook:build` scripts を追加する
- [x] 静的 build を `verify` に含める

## 2. 決定的なイベント factory

- [x] 固定 seed から有効な鍵と署名済みイベントを作る
- [x] profile / note / reply / quote / repost / reaction / unknown を作れるようにする
- [x] reply / quote / repost / reaction は本番ビルダを再利用する
- [x] 同じ入力が同じ pubkey / id / sig を返すことをテストする
- [x] factory が作った全イベントを EventStore.put() が受理することをテストする

## 3. EventScene module

- [x] scene の events を本物の EventStore へ投入する
- [x] 外部接続しない request adapters を作る
- [x] unresolvedEventIds と通常の loading を区別する
- [x] defaultRenderers / RenderProvider / ThreadNavProvider を一度に配線する
- [x] 任意の MuteList を Provider へ重ねられるようにする
- [x] Provider の Store、renderer、loading / unresolved 契約をテストする

## 4. EventView Stories

- [x] kind:1 の plain / tokens / reply / quote / reactions と compact / full
- [x] kind:6 の resolved / loading / unresolved
- [x] kind:7 の `+` / Unicode / custom emoji
- [x] unknown kind fallback
- [x] muted event

## 5. ThreadView Stories

- [x] root → focus → replies
- [x] 多段祖先
- [x] 祖先 loading
- [x] settle 後の祖先欠落

## 6. 検証と引き渡し

- [x] `pnpm fix`
- [x] `pnpm verify`
- [x] `pnpm storybook:build`
- [x] ローカル Storybook を起動して主要 Story を目視する
- [x] 新規テストが捕まえる変異を実際に入れ、赤を確認して戻す
- [x] コミット・push・PR作成
- [x] 別コンテキストでPRをレビューし、指摘を反映する
