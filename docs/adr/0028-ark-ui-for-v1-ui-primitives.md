---
status: accepted
---

# v1 の UI プリミティブは `@ark-ui/solid` を使う

v0 は `@kobalte/core` でヘッドレス UI（`Popover` / `Progress` など）を組んでいる。`@ark-ui/solid` は以前から（v0 の開発中に他の用途で）依存に入っており、今回このスライスが 4.10.1 から 5.38.1 へ上げる前から両方が依存に入った状態だった。次にダイアログ・メニュー・ポップオーバーの類を作る人が、v0 のコードを真似て `@kobalte/core` を選ぶか、新しく `@ark-ui/solid` を選ぶか、参照するコードによって決まってしまう。

v1 の UI プリミティブ（ホバーカード、ダイアログ、メニュー、ポップオーバー等）は `@ark-ui/solid` を使う。

## なぜ

**保守が続いている。** 5.x 系として更新が続いており、4.x で止まっている状態から選び直す理由がない。

**ヘッドレスで、UnoCSS のスタイリングを妨げない。** `@kobalte/core` と同様、見た目を一切持たず属性（`data-*`）だけを付与するため、v1 が統一している UnoCSS のユーティリティクラスと衝突しない。

`@kobalte/core` ではなく `@ark-ui/solid` を選んだこと自体に強い理由があるわけではない —— どちらもヘッドレスで要件を満たす。**決定の本体は「2 つを併存させない」ことであり、どちらを残すかは今回上げた側（`@ark-ui/solid`）にした。**

## 射程

**v1 のみ。** v0 は #253 で丸ごと削除される予定であり、`@kobalte/core` を使っている v0 のコード（`src/features/CreatePost/components/PostInput.tsx` の `Popover` / `Progress` など）を `@ark-ui/solid` へ移行する作業はしない。`@kobalte/core` は v0 が消えるまで依存に残る。

## ADR-0020 との関係

[ADR-0020](0020-no-nostr-library-noble-primitives-only.md) は「ライブラリを避け自前実装する」ことを求めているが、これは **Nostr プロトコルの実装だけ**を射程にした決定である。UI ライブラリはその射程外であり、この ADR と矛盾しない。

## Consequences

- v1 で新しくダイアログ・メニュー・ポップオーバー等を作る場合は `@ark-ui/solid` を使う。`@kobalte/core` を新規に import しない
- `@kobalte/core` は v0 の削除（#253）まで `package.json` に残る。削除時にこの ADR も併せて見直す
- `@ark-ui/solid` の `asChild` は、関数を受け取りその引数もまた関数という形（`asChild?: (props: (userProps?) => JSX.HTMLAttributes<any>) => JSX.Element`）を 4.10.1 から 5.38.1 まで変えていない。この形に依存するコードは移行を気にせず書ける
