# Streets の NIP 対応

この表は `packages/core/src/nostr/nip-support.json` と `kind-support.json` から生成する。画面の「Streets について」も同じデータを使う。NIP の `対応` は記載した機能の範囲で扱えること、`一部` は仕様の一部を扱うことを表す。NIP の全文への準拠を保証する表ではない。

NIP の仕様変更時は、対応の程度、実装箇所、kind・タグ、残る差を更新する。生成は `vp run nips:generate`。

| NIP | 対応 | Streets でできること | kind | タグ | 主な実装 | まだ扱わないこと |
| --- | --- | --- | --- | --- | --- | --- |
| [NIP-01](https://github.com/nostr-protocol/nips/blob/master/01.md) | 一部 | イベントの検証、フィルタ、リレーとの送受信 | — | — | [`event.ts`](../packages/core/src/nostr/event.ts)<br>[`filter-match.ts`](../packages/core/src/read/filter-match.ts)<br>[`websocket-relay-connection.ts`](../packages/core/src/relay/websocket-relay-connection.ts) | すべてのリレーメッセージや拡張フィルタには対応していない |
| [NIP-02](https://github.com/nostr-protocol/nips/blob/master/02.md) | 対応 | フォローリストの読み書き | 3 | `p` | [`follow-list.ts`](../packages/core/src/nostr/follow-list.ts)<br>[`follow.ts`](../packages/core/src/nostr/build/follow.ts) | — |
| [NIP-04](https://github.com/nostr-protocol/nips/blob/master/04.md) | 一部 | 旧形式で暗号化された非公開リストの読み取り | — | — | [`private-tags.ts`](../packages/core/src/nostr/private-tags.ts) | 旧形式の新規暗号化や DM は扱わない |
| [NIP-05](https://github.com/nostr-protocol/nips/blob/master/05.md) | 対応 | プロフィールのドメイン認証 | 0 | — | [`nip05.ts`](../packages/core/src/nostr/nip05.ts)<br>[`Nip05Badge.tsx`](../apps/web/src/profile/Nip05Badge.tsx) | — |
| [NIP-07](https://github.com/nostr-protocol/nips/blob/master/07.md) | 対応 | ブラウザ拡張機能による署名 | — | — | [`nip07-signer.ts`](../packages/core/src/signer/nip07-signer.ts) | — |
| [NIP-09](https://github.com/nostr-protocol/nips/blob/master/09.md) | 対応 | イベントの削除依頼と非表示 | 5 | `e`, `a`, `k` | [`deletion.ts`](../packages/core/src/nostr/build/deletion.ts)<br>[`event-store.ts`](../packages/core/src/read/event-store.ts) | — |
| [NIP-10](https://github.com/nostr-protocol/nips/blob/master/10.md) | 対応 | 返信とスレッドの参照 | 1 | `e`, `p` | [`event-refs.ts`](../packages/core/src/nostr/event-refs.ts)<br>[`references.ts`](../packages/core/src/nostr/build/references.ts)<br>[`thread-spine.ts`](../packages/core/src/view/thread-spine.ts) | — |
| [NIP-11](https://github.com/nostr-protocol/nips/blob/master/11.md) | 一部 | リレーの情報を取得して表示 | — | — | [`relay-info.ts`](../packages/core/src/relay/relay-info.ts)<br>[`RelayRecommendations.tsx`](../apps/web/src/settings/RelayRecommendations.tsx) | 画面に必要な項目だけを読む |
| [NIP-18](https://github.com/nostr-protocol/nips/blob/master/18.md) | 一部 | リポストの表示と通常の投稿のリポスト | 6, 16 | `e`, `p`, `k` | [`repost.ts`](../packages/core/src/nostr/build/repost.ts)<br>[`repost-target.ts`](../packages/core/src/view/repost-target.ts)<br>[`Event.tsx`](../apps/web/src/note/Event.tsx) | kind:16 の投稿操作はない |
| [NIP-19](https://github.com/nostr-protocol/nips/blob/master/19.md) | 対応 | npub・note・nevent などの読み書き | — | — | [`nip19.ts`](../packages/core/src/nostr/nip19.ts) | — |
| [NIP-21](https://github.com/nostr-protocol/nips/blob/master/21.md) | 対応 | nostr: リンクを開く | — | — | [`content.ts`](../packages/core/src/nostr/content.ts)<br>[`UserLink.tsx`](../apps/web/src/note/UserLink.tsx) | — |
| [NIP-23](https://github.com/nostr-protocol/nips/blob/master/23.md) | 未対応 | 長文記事 | 30023 | — | — | 長文記事の専用表示・投稿はない |
| [NIP-24](https://github.com/nostr-protocol/nips/blob/master/24.md) | 一部 | プロフィールの追加項目と小文字のハッシュタグ | 0, 1 | `t` | [`profile.ts`](../packages/core/src/nostr/profile.ts)<br>[`content.ts`](../packages/core/src/nostr/content.ts)<br>[`note.ts`](../packages/core/src/nostr/build/note.ts) | bot・birthday などの追加項目は扱わない |
| [NIP-25](https://github.com/nostr-protocol/nips/blob/master/25.md) | 対応 | リアクションの読み書き | 7 | `e`, `p`, `k` | [`reaction.ts`](../packages/core/src/nostr/reaction.ts)<br>[`reaction.ts`](../packages/core/src/nostr/build/reaction.ts) | — |
| [NIP-27](https://github.com/nostr-protocol/nips/blob/master/27.md) | 対応 | 本文中の Nostr 参照 | 1 | — | [`content.ts`](../packages/core/src/nostr/content.ts)<br>[`Event.tsx`](../apps/web/src/note/Event.tsx) | — |
| [NIP-28](https://github.com/nostr-protocol/nips/blob/master/28.md) | 対応 | 公開チャンネルとチャット | 40, 41, 42, 43, 44 | `e`, `p` | [`channel.ts`](../packages/core/src/nostr/channel.ts)<br>[`channel.ts`](../packages/core/src/nostr/build/channel.ts)<br>[`ChannelChat.tsx`](../apps/web/src/columns/blocks/ChannelChat.tsx) | — |
| [NIP-30](https://github.com/nostr-protocol/nips/blob/master/30.md) | 対応 | 投稿とプロフィールのカスタム絵文字 | 30030 | `emoji` | [`content.ts`](../packages/core/src/nostr/content.ts)<br>[`emoji-set.ts`](../packages/core/src/settings/emoji-set.ts)<br>[`Event.tsx`](../apps/web/src/note/Event.tsx) | — |
| [NIP-33](https://github.com/nostr-protocol/nips/blob/master/33.md) | 対応 | 名前付きの置換可能イベント | — | `d`, `a` | [`event-store.ts`](../packages/core/src/read/event-store.ts)<br>[`nip19.ts`](../packages/core/src/nostr/nip19.ts) | — |
| [NIP-36](https://github.com/nostr-protocol/nips/blob/master/36.md) | 対応 | 閲覧注意タグの読み書き、本文の表示制御、ウェルカム欄からの除外 | 1, 42 | `content-warning` | [`content-warning.ts`](../packages/core/src/nostr/content-warning.ts)<br>[`content-warning.ts`](../packages/core/src/nostr/build/content-warning.ts)<br>[`welcome-feed.ts`](../packages/core/src/deck/welcome-feed.ts)<br>[`ContentWarningGate.tsx`](../apps/web/src/note/ContentWarningGate.tsx)<br>[`ComposePanel.tsx`](../apps/web/src/note/ComposePanel.tsx) | NIP-32 の補助ラベルは付けない |
| [NIP-42](https://github.com/nostr-protocol/nips/blob/master/42.md) | 対応 | 認証を求めるリレーへ署名して、購読と書き込みを再試行 | 22242 | `relay`, `challenge` | [`relay-auth.ts`](../packages/core/src/nostr/build/relay-auth.ts)<br>[`websocket-relay-connection.ts`](../packages/core/src/relay/websocket-relay-connection.ts)<br>[`connection-pool.ts`](../packages/core/src/read/connection-pool.ts) | NIP-46 の署名器が使うリレー自体に認証が必要な場合は署名がタイムアウトする |
| [NIP-44](https://github.com/nostr-protocol/nips/blob/master/44.md) | 一部 | 非公開リストとリモート署名の暗号化 | — | — | [`private-tags.ts`](../packages/core/src/nostr/private-tags.ts)<br>[`nip44.ts`](../packages/core/src/signer/nip46/nip44.ts) | 一般の暗号化メッセージ機能はない |
| [NIP-46](https://github.com/nostr-protocol/nips/blob/master/46.md) | 対応 | リモート署名器への接続 | 24133 | `p` | [`client.ts`](../packages/core/src/signer/nip46/client.ts)<br>[`nip46-signer.ts`](../packages/core/src/signer/nip46/nip46-signer.ts) | — |
| [NIP-50](https://github.com/nostr-protocol/nips/blob/master/50.md) | 一部 | 検索対応リレーへ検索を送る | — | — | [`query.ts`](../packages/core/src/search/query.ts)<br>[`search-relay-list.ts`](../packages/core/src/settings/search-relay-list.ts) | 検索演算子をすべて扱うわけではない |
| [NIP-51](https://github.com/nostr-protocol/nips/blob/master/51.md) | 一部 | ミュート・ブックマーク・フォローセットなどのリスト | 10000, 10003, 10005, 10007, 10030, 30000 | `d`, `e`, `p`, `a`, `t`, `relay` | [`private-tags.ts`](../packages/core/src/nostr/private-tags.ts)<br>[`mute-list.ts`](../packages/core/src/moderation/mute-list.ts)<br>[`follow-set.ts`](../packages/core/src/lists/follow-set.ts) | NIP-51 のリストをすべて扱うわけではない |
| [NIP-57](https://github.com/nostr-protocol/nips/blob/master/57.md) | 一部 | Zap の送信と受領の表示 | 9734, 9735 | `e`, `p`, `k`, `relays`, `amount`, `lnurl`, `bolt11`, `description` | [`zap-request.ts`](../packages/core/src/zap/zap-request.ts)<br>[`zap-receipt.ts`](../packages/core/src/zap/zap-receipt.ts) | Zap のすべてのオプションや受領形式には対応していない |
| [NIP-65](https://github.com/nostr-protocol/nips/blob/master/65.md) | 対応 | 人ごとの読み書きリレーの選択 | 10002 | `r` | [`relay-list.ts`](../packages/core/src/read/relay-list.ts)<br>[`relay-selector.ts`](../packages/core/src/read/relay-selector.ts)<br>[`relay-list.ts`](../packages/core/src/nostr/build/relay-list.ts) | — |
| [NIP-66](https://github.com/nostr-protocol/nips/blob/master/66.md) | 一部 | リレーの計測情報から候補を選ぶ | 30166 | `d` | [`relay-recommendation.ts`](../packages/core/src/settings/relay-recommendation.ts)<br>[`RelayRecommendations.tsx`](../apps/web/src/settings/RelayRecommendations.tsx) | 計測イベントの発行はしない |
| [NIP-78](https://github.com/nostr-protocol/nips/blob/master/78.md) | 対応 | デッキ設定をアカウントに保存 | 30078 | `d` | [`deck.ts`](../packages/core/src/deck/deck.ts)<br>[`create-nip78-document.ts`](../packages/core/src/solid/create-nip78-document.ts) | — |
| [NIP-89](https://github.com/nostr-protocol/nips/blob/master/89.md) | 一部 | 投稿に client タグを付ける（選んだ人だけ）。Streets を説明する kind:31990 をリリースのたびに出す。他の人の投稿の client タグから、そのアプリの説明と開き方を見せる | 31990 | `client` | [`client-tag.ts`](../packages/core/src/nostr/build/client-tag.ts)<br>[`streets-handler.json`](../packages/core/src/nostr/streets-handler.json)<br>[`app-handler.mjs`](../scripts/app-handler.mjs)<br>[`app-handler.ts`](../packages/core/src/nostr/app-handler.ts)<br>[`ClientDialog.tsx`](../apps/web/src/note/ClientDialog.tsx) | アプリのおすすめ（kind:31989）と、知らない kind を開けるアプリを探す使い方には対応しない |
| [NIP-92](https://github.com/nostr-protocol/nips/blob/master/92.md) | 一部 | 添付画像・動画の情報を投稿に添える | 1 | `imeta` | [`imeta.ts`](../packages/core/src/nostr/imeta.ts)<br>[`media.ts`](../packages/core/src/nostr/build/media.ts) | 扱うメディア情報は画面に必要な項目に限る |
| [NIP-B7](https://github.com/nostr-protocol/nips/blob/master/B7.md) | 一部 | Blossom サーバーの一覧とファイルのアップロード | 10063, 24242 | `server`, `t`, `x`, `expiration` | [`blossom.ts`](../packages/core/src/media/blossom.ts) | BUD の全操作やダウンロード管理は扱わない |

## kind ごとの対応

`表示対応` は `Event` に渡したとき専用の表示がある。`内部利用` は読み書きなどに使うが、`Event` に渡すと未対応表示になる。`未対応` は現在扱わない。NIP の対応状態と kind の表示対応は別の意味を持つ。

| kind | 対応 | 内容 | 関連する NIP |
| --- | --- | --- | --- |
| 0 | 表示対応 | プロフィール | [NIP-05](https://github.com/nostr-protocol/nips/blob/master/05.md), [NIP-24](https://github.com/nostr-protocol/nips/blob/master/24.md) |
| 1 | 表示対応 | 投稿 | [NIP-10](https://github.com/nostr-protocol/nips/blob/master/10.md), [NIP-24](https://github.com/nostr-protocol/nips/blob/master/24.md), [NIP-27](https://github.com/nostr-protocol/nips/blob/master/27.md), [NIP-36](https://github.com/nostr-protocol/nips/blob/master/36.md), [NIP-92](https://github.com/nostr-protocol/nips/blob/master/92.md) |
| 3 | 内部利用 | フォローリスト | [NIP-02](https://github.com/nostr-protocol/nips/blob/master/02.md) |
| 5 | 内部利用 | 削除依頼 | [NIP-09](https://github.com/nostr-protocol/nips/blob/master/09.md) |
| 6 | 表示対応 | リポスト | [NIP-18](https://github.com/nostr-protocol/nips/blob/master/18.md) |
| 7 | 表示対応 | リアクション | [NIP-25](https://github.com/nostr-protocol/nips/blob/master/25.md) |
| 16 | 表示対応 | 汎用リポスト | [NIP-18](https://github.com/nostr-protocol/nips/blob/master/18.md) |
| 40 | 表示対応 | チャンネルの作成 | [NIP-28](https://github.com/nostr-protocol/nips/blob/master/28.md) |
| 41 | 表示対応 | チャンネル情報の更新 | [NIP-28](https://github.com/nostr-protocol/nips/blob/master/28.md) |
| 42 | 表示対応 | チャンネルの発言 | [NIP-28](https://github.com/nostr-protocol/nips/blob/master/28.md), [NIP-36](https://github.com/nostr-protocol/nips/blob/master/36.md) |
| 43 | 内部利用 | チャンネルの発言の非表示 | [NIP-28](https://github.com/nostr-protocol/nips/blob/master/28.md) |
| 44 | 内部利用 | チャンネルのミュート | [NIP-28](https://github.com/nostr-protocol/nips/blob/master/28.md) |
| 9734 | 内部利用 | Zap の依頼 | [NIP-57](https://github.com/nostr-protocol/nips/blob/master/57.md) |
| 9735 | 内部利用 | Zap の受領 | [NIP-57](https://github.com/nostr-protocol/nips/blob/master/57.md) |
| 10000 | 内部利用 | ミュートリスト | [NIP-51](https://github.com/nostr-protocol/nips/blob/master/51.md) |
| 10002 | 内部利用 | リレーリスト | [NIP-65](https://github.com/nostr-protocol/nips/blob/master/65.md) |
| 10003 | 内部利用 | ブックマークリスト | [NIP-51](https://github.com/nostr-protocol/nips/blob/master/51.md) |
| 10005 | 内部利用 | 公開鍵のリスト | [NIP-51](https://github.com/nostr-protocol/nips/blob/master/51.md) |
| 10007 | 内部利用 | 検索リレーのリスト | [NIP-51](https://github.com/nostr-protocol/nips/blob/master/51.md) |
| 10030 | 内部利用 | 絵文字リスト | [NIP-51](https://github.com/nostr-protocol/nips/blob/master/51.md) |
| 10063 | 内部利用 | Blossom サーバーのリスト | [NIP-B7](https://github.com/nostr-protocol/nips/blob/master/B7.md) |
| 22242 | 内部利用 | リレーの認証 | [NIP-42](https://github.com/nostr-protocol/nips/blob/master/42.md) |
| 24133 | 内部利用 | リモート署名の通信 | [NIP-46](https://github.com/nostr-protocol/nips/blob/master/46.md) |
| 24242 | 内部利用 | Blossom の認証 | [NIP-B7](https://github.com/nostr-protocol/nips/blob/master/B7.md) |
| 30000 | 内部利用 | フォローセット | [NIP-51](https://github.com/nostr-protocol/nips/blob/master/51.md) |
| 30023 | 未対応 | 長文記事 | [NIP-23](https://github.com/nostr-protocol/nips/blob/master/23.md) |
| 30030 | 内部利用 | 絵文字セット | [NIP-30](https://github.com/nostr-protocol/nips/blob/master/30.md) |
| 30078 | 内部利用 | アプリの設定 | [NIP-78](https://github.com/nostr-protocol/nips/blob/master/78.md) |
| 30166 | 内部利用 | リレーの計測情報 | [NIP-66](https://github.com/nostr-protocol/nips/blob/master/66.md) |
| 31990 | 内部利用 | アプリの説明 | [NIP-89](https://github.com/nostr-protocol/nips/blob/master/89.md) |
