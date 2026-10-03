# Zap request の `relays` に何を入れるか

調査日: 2026-10-04。NIP の本文、他クライアントのソース、Streets の現行実装を確認した。ここでいう `relays` は、署名済みの kind:9734 に付くタグを指す。

## 結論

**Zap の受取人の read リレーを優先し、余裕があれば送信者の read リレーも入れる**のが、Streets の通知の読み方と合う。受取人の read リレーが不明なら、Streets の通知カラムが読む既定リレーを先に入れる。送信者の write リレーだけを入れる理由はない。ただし、受取人の read リレーを選ぶことは NIP-57 の明文規定ではなく、NIP-65 の配信先の考え方から導く判断である。他クライアントの実装も統一されていない。

| リレー | 受領を置く意味 |
| --- | --- |
| 受取人の read | 受取人が自分宛の Zap を通知で見つける。NIP-65 の「タグされた人の read リレーへ送る」という流儀に合う |
| 送信者の read | 送信者が支払い直後の受領を待ち、あとから自分宛の記録を探せる |
| 送信者の write | 送信者が書いたイベントを探す先だが、受領の著者はウォレットのサーバー。受取人がそこを読む保証もない |

## 仕様上の意味

[NIP-57 の手順と Appendix A/E](https://github.com/nostr-protocol/nips/blob/master/57.md#appendix-a-zap-request-event) では、kind:9734 はリレーへ公開せず LNURL の callback へ渡す。`relays` は受取人のウォレットが kind:9735 の受領を公開する先で、支払い後にそこへ公開することをウォレットへ求める。NIP-57 は、このリストを送信者と受取人のどちらのリレーから作るかは指定していない。

[NIP-65](https://github.com/nostr-protocol/nips/blob/master/65.md) は、ある人が書いたイベントを読む先をその人の write リレー、その人がタグされたイベントを読む先をその人の read リレーとしている。公開側には、著者の write リレーと、タグされた人それぞれの read リレーへ送ることを SHOULD で求める。Zap 受領はウォレットのサーバーが署名し、受取人の `p` タグを持つため、受取人の read リレーが通知の配信先として自然である。ただし NIP-57 のウォレットがこの NIP-65 の配信規則まで実行する保証はない。クライアントが kind:9734 の `relays` に書いておく必要がある。

## 他クライアントの実装

確認できた経路だけを示す。クライアント全体で常に同じ選び方をするとは限らない。

| クライアント・経路 | kind:9734 に渡すリレー | 一次資料 |
| --- | --- | --- |
| Amethyst、プロフィールへの Zap | 送信者の inbox と受取人の inbox の和集合 | [AccountZapActions.kt](https://github.com/vitorpamplona/amethyst/blob/2fe82b5c1a814a9e1b37f0a7522218575bf9151f/commons/src/commonMain/kotlin/com/vitorpamplona/amethyst/commons/model/AccountZapActions.kt#L281-L300) |
| Amethyst、投稿への Zap | 原則として送信者の inbox。グループ投稿では host relay | [AccountZapActions.kt](https://github.com/vitorpamplona/amethyst/blob/2fe82b5c1a814a9e1b37f0a7522218575bf9151f/commons/src/commonMain/kotlin/com/vitorpamplona/amethyst/commons/model/AccountZapActions.kt#L68-L100) |
| Damus、投稿への Zap | 送信者が設定したリレーの先頭 10 本 | [NoteZapButton.swift](https://github.com/damus-io/damus/blob/4a94f666d7e159e380e10b4dbbb2967d1688709e/damus/Features/Zaps/Views/NoteZapButton.swift#L188-L192) |
| Snort、通常の Zap | 送信者の接続中のリレーから ephemeral なものを除く | [zapper.ts](https://github.com/v0l/snort/blob/9500e62fa5241caac9c9787879d2e7a6cc62a6a8/packages/wallet/src/zapper.ts#L100-L119) |
| Snort、投票への Zap など | 受取人宛の reply routing。routing は相手の NIP-65 read リレーを使う | [Poll.tsx](https://github.com/v0l/snort/blob/9500e62fa5241caac9c9787879d2e7a6cc62a6a8/packages/app/src/Components/Event/Poll.tsx#L64-L70)、[outbox-model.ts](https://github.com/v0l/snort/blob/9500e62fa5241caac9c9787879d2e7a6cc62a6a8/packages/system/src/outbox/outbox-model.ts#L191-L199) |
| Primal Web、通常の投稿への Zap | 送信者アカウントの active relays | [NoteFooter.tsx](https://github.com/PrimalHQ/primal-web-app/blob/c96ee211043c6fee8a8b7c431746aab06392f765/src/components/Note/NoteFooter/NoteFooter.tsx#L409-L417)、[zap.ts](https://github.com/PrimalHQ/primal-web-app/blob/c96ee211043c6fee8a8b7c431746aab06392f765/src/lib/zap.ts#L65-L96) |

少なくとも Amethyst と Snort には受取人の read リレーを使う経路がある。一方、送信者側のリレーを渡す経路も複数あり、実装慣習だけでは優先順位は決まらない。

## Streets での判断

変更前のコードは**送信者の write ではなく read リレー**を最大 5 本渡していた。受取人の NIP-65 リレーは見ていなかった。[ZapMediator.tsx](../../apps/web/src/zap/ZapMediator.tsx) は request に入れたリレーで受領を待つ。[notificationsSource](../../packages/core/src/deck/column-sources.ts) は、自分宛の通知を自分の read リレーから取る。そのため、受取人の read リレーと重ならなければ、受取人の Streets の通知には Zap が載らなかった。

採用した方針は、受取人の kind:10002 の read リレーを先に取り、重複を除いて送信者の read リレーを足すこと。受取人の read リレーが分からなければ、通知カラムが使う既定リレーを先に置く。最大 5 本の枠では受取人側を優先する。送信者側の受領待ちは、最終的にタグへ入れたリレーを購読する。相手の kind:10002 が未取得の場合は索引リレーへ問い合わせるが、請求書の取得を長く止めないよう 2 秒で切り上げる。

この変更をしても、ウォレットが指定先への公開に失敗することや、リレーが受領を受け付けないことまで防げない。受領が届かないことを支払い失敗として扱わない現行の考え方は維持するのが妥当である。
