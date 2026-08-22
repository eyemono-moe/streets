# 書き込みの土台 — 設計

## 0. このスライスは何のためにあるか

v1 が書けるイベントは **kind:1 の新規投稿ただ 1 種**で、その署名・楽観挿入・publish は `src/routes/v1/../v1.tsx` の `handlePost` にべた書きされている。`src/core/write/publisher.ts` は「署名済みイベントを write リレーへ配る」ところまでしか持たず、**イベントを組み立てる層が存在しない**。

そのため、[2026-08-21 の redesign](../../design/v1-feature-inventory.md) が描いた要素のほとんど —— アクション列（返信・リポスト・リアクション・ブックマーク）、⋮ メニュー（ミュート・フォロー・ブロック）、設定画面（リレー・プロフィール）—— は**下に乗る経路が無い**。このスライスはその経路を作る。

前提知識は [CONTEXT.md](../../../CONTEXT.md)、決定は [docs/adr/](../../adr/)、スライスの記録は [read-layer-followups.md](../../design/read-layer-followups.md)、機能の棚卸しは [v1-feature-inventory.md](../../design/v1-feature-inventory.md)。

## 1. 範囲

**含む。**

- kind ごとのイベントビルダ（純関数）: 1（返信・引用）/ 5 / 6 / 7 / 3 / 0 / 10002 / 10000 / 10003
- `Writer` seam（署名・時刻・順序・再取得・巻き戻し）
- 置換可能イベントの read-modify-write と、write リレーからの再取得
- `EventStore.remove()` と `EventPersistence.delete()` の新設
- `Signer` seam への NIP-44 の追加（ミュートリストの非公開項目に要る）
- `v1.tsx` の compose を `Writer` 経由へ差し替え（配線が動くことの証明）

**含まない。**

| 落とすもの | 理由 |
|---|---|
| UI（アクション列・⋮ の項目・設定画面） | このスライスの成果物はコア。UI は redesign を当てる別スライス |
| kind:30078（デッキの NIP-78 保存） | [ADR-0013](../../adr/0013-deck-persisted-to-nip78.md) は Should。`replace` の `identifier` 引数があるので seam を変えずに後から載る |
| 署名要求のデバウンス | 束ねる対象（デッキの連続操作）が射程外。置き場所だけ 6.4 節で決める |
| 削除の**表示**への反映 | kind:5 を作って送るところまで。「削除されたイベントを隠す」は読み取り側の話で、`EventStore` の deletion 索引を使う別スライス |
| 競合の警告 UI | `WriteResult` に材料を載せるところまで |
| kind:16（汎用リポスト） | v0 に無い。kind:1 以外をリポストする面がまだ無い |

## 2. なぜビルダを純関数として切り出すか

タグ規則を間違えても **publish は成功する**。リレーは NIP のタグ意味論を検証しないので、壊れていることは他クライアントで表示が崩れて初めて分かり、そのときには既に壊れたイベントが配布済みで取り消せない。

したがってこの層の価値は「動くこと」ではなく「**NIP の条文と 1 対 1 に対応する形で固定されていること**」にある。純関数にするのは、その対応をユニットテストで直接主張できるようにするため。ネットワークも store も触らないので、テストにモックが要らない。

[ADR-0004](../../adr/0004-kind-knowledge-lives-in-renderers.md) は「kind 固有の知識は kind 側に置き、共通層は kind を知らない」と定めている。書き込み側でも同じ切り方をする —— `Writer` は kind を一切知らず、受け取った `EventDraft` に `pubkey` と `created_at` を押して送るだけ。

## 3. 配置

```
src/core/nostr/build/      kind 固有・純関数。store もネットワークも知らない
  note.ts        buildReply / buildQuote                  NIP-10 / 18 / 27
  repost.ts      buildRepost                              NIP-18
  reaction.ts    buildReaction                            NIP-25 / 30
  deletion.ts    buildDeletion                            NIP-09
  follow.ts      addFollow / removeFollow                 NIP-02
  profile.ts     mergeProfile                             NIP-01
  relay-list.ts  setRelayList                             NIP-65
  mute.ts        addMute / removeMute                     NIP-51
  bookmark.ts    addBookmark / removeBookmark             NIP-51
src/core/write/
  writer.ts       署名・時刻・順序・再取得・巻き戻しの唯一の場所
  fetch-latest.ts write リレーから置換可能イベントの最新版を引く
  publisher.ts    既存。変更しない
```

`src/core/nostr/` に置くのは、既にある読み取り側の対（`event-refs.ts` が `replyTarget` / `quoteTargets` / `repostTarget`、`reaction.ts` が `parseReaction`）と**同じ NIP を同じディレクトリで扱う**ため。`build/` という下位ディレクトリで方向を分ける。

## 4. `EventDraft` と `Writer`

```ts
/** ビルダが返すもの。pubkey と created_at は持たない。 */
export type EventDraft = {
  kind: number;
  tags: string[][];
  content: string;
};

export type WriteResult = {
  /** 実際に署名して送ったもの。 */
  event: NostrEvent;
  accepted: RelayUrl[];
  rejected: { relay: RelayUrl; reason: string }[];
  /**
   * `replace` のときだけ入る、再取得した直前の版。UI が競合の警告を
   * 出すための材料 (このスライスでは誰も読まない)。
   */
  replaced?: NostrEvent;
};

/** 楽観挿入を UI へ映す方法は書き込む側ごとに違う (9 節)。 */
export type WriteHooks = {
  /** `store.put()` の直後・publish の前に**同期的に**呼ばれる。 */
  onOptimisticInsert?: (event: NostrEvent) => void;
};

export type Writer = {
  publish(draft: EventDraft, hooks?: WriteHooks): Promise<WriteResult>;
  replace(
    kind: number,
    identifier: string | undefined,
    mutate: (current: NostrEvent | undefined) => EventDraft,
    hooks?: WriteHooks,
  ): Promise<WriteResult>;
};
```

`pubkey` と `created_at` を **`Writer` が押す**。ビルダに持たせると時計の取り方が 9 ファイルに散り、`created_at` を付け忘れたビルダが 1 つ混ざっても型が通る。`EventDraft` がその 2 つを**持てない形**にしてあるので、押し忘れは型で落ちる。

`identifier` は `d` タグ用。kind:30078 は射程外だが、この引数があるので seam を変えずに載る。`undefined` のときは `d` タグを足さない。

### 4.1 失敗の型

```ts
/** publish が 1 本も通らなかった。挿入は巻き戻し済み。 */
export class WriteFailedError extends Error {
  readonly rejected: { relay: RelayUrl; reason: string }[];
}

/** 置換可能イベントの再取得が全リレーで失敗した。何も書いていない。 */
export class RefetchFailedError extends Error {
  readonly relays: RelayUrl[];
}
```

署名の拒否は `Signer` が投げるものをそのまま通す（`SignerUnavailableError` を含む）。**握り潰して包み直さない** —— 呼び出し側は「拡張機能が無い」と「リレーが全部落ちている」を別の文言で出す必要がある。

## 5. `publish` の順序

1. `draft` に `pubkey`（現在の閲覧者）と `created_at`（`Math.floor(Date.now() / 1000)`）を押して `UnsignedEvent` にする
2. `signer.signEvent(unsigned)` —— 例外はそのまま伝播する。**ここで落ちたら何も挿入されていない**
3. `store.put(signed, "local")` —— 楽観挿入。`"local"` は実在のリレー URL ではなく、手元での挿入だという印（現行 `v1.tsx` と同じ）
4. `publisher.publish(signed)`
5. `accepted.length === 0` なら `store.remove(signed.id)` して `WriteFailedError` を投げる
6. そうでなければ `WriteResult` を返す

### 5.1 巻き戻しの「戻す先」は `Writer` の外

`Writer` が保証するのは「失敗した」ことと「**もう store にも永続層にも入っていない**」ことだけ。本文をフォームへ戻すのは compose の責務、押下状態を戻すのはリアクションボタンの責務。書き込む側ごとに戻し方が違うので、ここで一般化しない。

### 5.2 `EventStore.remove()` が要る理由

`put()` は同時に `#persist()` を呼び、IndexedDB へ書く。取り除かずに放置すると **publish に失敗したイベントが永続層に残り、次回起動で水和されて戻ってくる**。`EventStore` にあるのは `invalidate()`（`fetchedAt` を 0 に戻すだけ）で、削除は存在しない。

```ts
// EventStore
remove(id: string): boolean;   // 索引 (#events / #replaceable / #byTag) から全部外す
// EventPersistence
delete(ids: readonly string[]): void;
```

**これは巻き戻しのための後付けではない。** kind:5 が射程に入っている以上、自分のノートを削除したときにローカルからも消す手段が要り、今それが無い。巻き戻しはこの機構の 2 番目の利用者になる。

`remove` は `#byTag` の逆引きを直す必要がある（`#indexTags` が張った索引から、そのイベントを含むエントリを外す）。索引を張った側と同じファイルで対称に実装する。

## 6. `replace` の順序

1. `fetchLatest(kind, identifier, viewerPubkey)` —— **write リレーから**引く
2. `mutate(current)` を呼んで `draft` を得る
3. `created_at` を押す。`current` があり、押した値が `current.created_at` **以下**なら `current.created_at + 1` に繰り上げる
4. 以下 5 節の 2〜6 と同じ。`WriteResult.replaced` に `current` を入れる

### 6.1 なぜ write リレーから引くか

read リレーから引くと、自分が最後に書いた版がまだ伝播していない可能性があり、**自分で自分の変更を消す**。publish 先と読み取り元を同じにすることでこれが起きない。`RoutingTable.writeRelaysFor(viewer)` が既に答えを持っているので追加の設計は要らない。write リレーが 1 本も分からないときは `publisher` と同じ `fallbackRelays` を使う。

### 6.2 「取れなかった」と「無い」を区別する

| 状況 | 判定 |
|---|---|
| 全リレーが接続失敗・タイムアウト | `RefetchFailedError`。**何も書かない** |
| 1 本以上が EOSE まで応答し、当該イベントが無い | `current = undefined`。正当な「まだ持っていない」 |
| 1 本以上が返した | `created_at` が最大のものを採る。同値なら `id` の昇順で先のもの（`compareEvents` と同じ全順序） |

これを取り違えると、既存のフォローリストを 1 件だけのリストで丸ごと上書きする。**巻き戻せない破壊**なので、遅いより黙って消すほうが悪い。

タイムアウトは `PUBLISH_TIMEOUT_MS` と同じ値を使う（`connection-pool.ts`）。新しい定数を作らない。

### 6.3 `created_at` の追い越し

リレーは置換可能イベントの新旧を `created_at` で決める（NIP-01）。同一秒内に 2 回更新すると、2 回目は「古くない」だけで**新しくもない**ので、リレーの実装次第で黙って捨てられる。3 の繰り上げはこれを防ぐ。

繰り上げた結果が未来になることは許容する。1 秒単位で連続操作したときだけ発生し、ずれは操作回数と同じ秒数で頭打ちになる。

### 6.4 署名要求のデバウンスの置き場所

**`Writer` には置かない。** `Writer` は 1 回の書き込みを 1 回の署名で完結させる層で、「複数の操作を 1 回の書き込みに束ねる」のは呼び出し側の関心事（[ADR-0013](../../adr/0013-deck-persisted-to-nip78.md) が言っているのはデッキ操作の話）。束ねる側が `mutate` の中で複数の変更を適用すればよい。

## 7. ビルダの仕様

すべて純関数。引数に `pubkey` や `created_at` を取らない。すべて `EventDraft` を返す。

### 7.1 `buildReply` — NIP-10

```ts
buildReply(parent: NostrEvent, content: string, options?: { relayHint?: RelayUrl }): EventDraft
```

`e` タグは**マーカー付き**（NIP-10 が推奨する形）。位置要素は `["e", <id>, <relay-url>, <marker>, <pubkey>]`。

- 親がスレッドの根（親自身に `root` マーカーの `e` タグが無い）→ `["e", parent.id, relay, "root", parent.pubkey]` の **1 本だけ**
  - NIP-10: *"A direct reply to the root of a thread should have a single marked 'e' tag of type 'root'."*
- 親が返信（親に `root` マーカーがある）→ その `root` をそのまま引き継いだ `["e", rootId, rootRelay, "root", rootPubkey]` と、`["e", parent.id, relay, "reply", parent.pubkey]` の **2 本**

`p` タグは NIP-10 の *"the reply event's 'p' tags should contain all of E's 'p' tags as well as the pubkey of the event being replied to"* に従う。**親の `p` タグを全部 + 親の著者**。順序は親の著者を先頭に、続けて親の `p` を出現順。重複は落とす。自分自身は落とす —— 自分への通知になる。

`relay-url` が無いときは空文字を入れる（位置要素なので省略できない）。

### 7.2 `buildQuote` — NIP-18 / NIP-27

```ts
buildQuote(target: NostrEvent, content: string, options?: { relayHint?: RelayUrl }): EventDraft
```

本文に `nostr:note1…` を含め、**同時に `q` タグを立てる**。

`nevent`（リレーヒントと著者を TLV で持つ形）は使わない —— `src/core/nostr/nip19.ts` は復号と素の bech32 しか持たず、**TLV の符号化器がまだ無い**。`note` でも参照としては一意に定まり、リレーヒントは `q` タグの 3 番目が持つ。TLV 符号化器を足すかどうかは別の判断であり、このスライスでは足さない。

- `q` タグの形は NIP-18 の `["q", <event-id>, <relay-url>, <pubkey>]`
- `e` タグは**立てない**。NIP-18: *"This ensures that quote reposts will not be shown in the feed as replies"*
- 引用先の著者に `p` タグを立てる

本文への `nostr:` の挿入位置は呼び出し側が決める。`content` に既に `nostr:` が含まれていればそれを使い、含まれていなければ末尾に改行 2 つで足す。

### 7.3 `buildRepost` — NIP-18

```ts
buildRepost(target: NostrEvent, options?: { relayHint?: RelayUrl }): EventDraft
```

- `kind: 6`
- `content` は **`JSON.stringify(target)`**。NIP-18: *"The content of a repost event is the stringified JSON of the reposted note."*
- `["e", target.id, relay, "", target.pubkey]` —— NIP-18 は**リレー URL を 3 番目に置くことを求めている**
- `["p", target.pubkey]`

`target.kind !== 1` のときは `undefined` を返す。kind:16 は射程外（1 節）で、kind:6 に kind:1 以外を入れるのは NIP-18 違反。

### 7.4 `buildReaction` — NIP-25 / NIP-30

```ts
type ReactionInput =
  | { type: "like" }                                   // content: "+"
  | { type: "text"; content: string }                  // 絵文字など
  | { type: "emoji"; shortcode: string; url: string }; // NIP-30

buildReaction(target: NostrEvent, input: ReactionInput): EventDraft
```

- `["e", target.id]` —— NIP-25: *"There MUST be always an `e` tag"*
- `["p", target.pubkey]` —— SHOULD
- `["k", String(target.kind)]` —— MAY だが、読み取り側の `parseReaction` が既に見ているので必ず入れる
- `emoji` の場合のみ `["emoji", shortcode, url]` を足し、`content` は `:shortcode:` **1 つだけ**。NIP-25: *"The content can be set only one `:shortcode:`. And emoji tag should be one."*

この `EventDraft` を `parseReaction`（`src/core/nostr/reaction.ts`）に通すと元の `ReactionInput` に戻ること（往復）をテストで主張する —— 書いたものを自分で読めないのは、この 2 つが同じ NIP を別々に解釈している証拠になる。

### 7.5 `buildDeletion` — NIP-09

```ts
buildDeletion(target: NostrEvent, reason?: string): EventDraft
```

- `kind: 5`、`["e", target.id]`、`["k", String(target.kind)]`
- `content` は `reason ?? ""`

**`target.pubkey` が自分でないときは呼んではならない。**リレーは pubkey が一致しない削除依頼を無視するので送っても無害だが、ビルダは自分のものかどうかを知らない（`pubkey` を受け取らない）。この検査は `Writer` でもなく**呼び出し側**の責務であることをドキュメントコメントに書く。

### 7.6 `addFollow` / `removeFollow` — NIP-02

```ts
addFollow(pubkey: string, options?: { relay?: RelayUrl; petname?: string }):
  (current: NostrEvent | undefined) => EventDraft
removeFollow(pubkey: string): (current: NostrEvent | undefined) => EventDraft
```

`replace` の `mutate` として渡せる形（`current` を取って `EventDraft` を返す関数）を返す。

- `p` タグの位置要素は `["p", <32-bytes hex>, <main relay URL>, <petname>]`
- **`current` の `p` タグを順序ごと保つ。** NIP-02: *"clients should append them to maintain chronological order"*。追加は末尾。削除は該当する `p` タグだけを落とす
- **`p` 以外のタグを保つ。** 他クライアントが立てた未知のタグを消さない
- **`content` を保つ。** NIP-02 は *"The `.content` is not used"* と言うが、レガシーなクライアントがリレーリストの JSON を入れている。`current` の `content` をそのまま引き継ぎ、`current` が無いときだけ空文字にする
- 既に居る pubkey を `addFollow` しても重複させない。居ない pubkey を `removeFollow` しても失敗しない（どちらも `current` と同じ内容の `EventDraft` を返す）

**この「未知のタグと content を保つ」は 7.6〜7.10 の全部に適用する共通規則**であり、ビルダごとに書き直さない。

### 7.7 `mergeProfile` — NIP-01

```ts
mergeProfile(changes: Partial<ProfileFields>): (current: NostrEvent | undefined) => EventDraft
```

`current.content` を JSON として読み、`changes` を浅くマージして書き戻す。**読めなかった場合は `changes` だけの JSON にする**（壊れた JSON を保っても誰も得をしない）。`current` に有って `changes` に無いキーは残す —— 他クライアントが入れた `lud16` などを消さない。

### 7.8 `setRelayList` — NIP-65

```ts
setRelayList(entries: readonly RelayListEntry[]): (current: NostrEvent | undefined) => EventDraft
```

`RelayListEntry`（`src/core/read/relay-list.ts`）をそのまま入力に取る。`read && write` ならマーカー無し、片方だけならマーカー付き、**どちらも false のエントリは落とす**（意味を持たない）。

`parseRelayList(built) === entries`（正規化後）を往復テストで主張する。

### 7.9 `addMute` / `removeMute` — NIP-51

```ts
type MuteTarget =
  | { type: "pubkey"; value: string }   // p
  | { type: "hashtag"; value: string }  // t
  | { type: "word"; value: string }     // word (小文字化)
  | { type: "thread"; value: string };  // e
```

**このスライスでは公開項目（`tags`）だけを書く。**非公開項目は NIP-51 が *"stringified and encrypted using the same scheme from NIP-44"* と定めており、NIP-44 は ECDH に秘密鍵を要求する。[ADR-0008](../../adr/0008-signer-only-key-handling.md) によりアプリは鍵を持たないので、**署名器へ委譲するしかない**。

`Signer` seam を拡張する:

```ts
export type Signer = {
  getPublicKey(): Promise<string>;
  signEvent(template: UnsignedEvent): Promise<NostrEvent>;
  /** NIP-07 の `window.nostr.nip44`。実装しない署名器がある。 */
  nip44?: {
    encrypt(peerPubkey: string, plaintext: string): Promise<string>;
    decrypt(peerPubkey: string, ciphertext: string): Promise<string>;
  };
};
```

非公開ミュートを書こうとして `signer.nip44` が無いときは **`Nip44UnavailableError` を投げる**。公開項目として黙って書いてはならない —— ミュートリストは「誰を嫌っているか」であり、非公開のつもりのものが公開されるのは巻き戻せない。

v0 は NIP-04 で暗号化している（`src/shared/libs/parser/10000_muteList.ts`）。NIP-51 は後方互換のため `iv` の有無で判別せよと言うが、**このスライスは NIP-44 でのみ書く**。読み取りは射程外。

### 7.10 `addBookmark` / `removeBookmark` — NIP-51

kind:10003。`e`（kind:1）と `a`（kind:30023）。ミュートと同じ構造で、非公開項目は同じ扱い。

## 8. `fetchLatest`

```ts
fetchLatest(options: {
  pool: ConnectionPool;
  routing: RoutingTable;
  fallbackRelays: readonly RelayUrl[];
  kind: number;
  identifier: string | undefined;
  pubkey: string;
}): Promise<{ event: NostrEvent | undefined; answered: RelayUrl[] }>
```

`{ kinds: [kind], authors: [pubkey], ...(identifier ? { "#d": [identifier] } : {}) }` を write リレー全部へ投げ、EOSE か timeout まで集める。

**`collect()`（`src/core/read/collect.ts`）を使う。** `bootstrap.ts` と `SubscriptionManager.fetchOnce` が既に同じことをしており、`matchesAnyFilter` による信頼境界もそこに入っている。新しい取得経路を増やさない。`reserved` は**渡さない**（`collect.ts` のコメントの通り `warmUpRouting` 専用）。

`collect()` は**届いたイベントを `EventStore` に入れるだけで呼び出し元へ返さない**。したがって `fetchLatest` は collect の後に `store.latestReplaceable(kind, pubkey)` を読む。6.2 節の「`created_at` が最大のものを採る」は `EventStore` の `#indexReplaceable` が既に行っており、ここで再実装しない。

`answered` は `CollectOptions.onRelaySettled` から導く。**`reason === "eose"` だけを「応答した」と数える。** `"closed"` はリレーがフィルタを拒否した場合を含み（`bootstrap.ts` が実際に `blocked: filters must specify at least one kind` を踏んでいる）、不在の証明にならない。`"rejected"`（予算切れ）と `"timeout"` も同様。

**`identifier` は `fetchLatest` ではまだ効かない。** `latestReplaceable(kind, pubkey)` の索引は `kind:pubkey` だけを鍵にしており、`d` タグを見ない。射程内の kind（0 / 3 / 10000 / 10002 / 10003）はすべて非アドレス可能なので今は問題にならないが、**kind:30078 を載せる時点で `EventStore` 側に `d` を含む索引が要る**。`identifier` が `undefined` でないときは `fetchLatest` から `Error` を投げ、静かに間違った版を返さないようにする。

## 9. `v1.tsx` の差し替え

`handlePost` の中身を `writer.publish({ kind: 1, tags: [], content: text })` に置き換える。

**測定を壊さないこと。** 現行は `store.put()` から `setOptimisticEvents()` までを `performance.now()` で挟み、`optimisticInsertMs` として出している（[ADR-0011](../../adr/0011-performance-budget.md) の 100ms 予算、仕様 10 節 問い 3）。`signEvent` を含めないという性質が本質なので、`Writer` は**楽観挿入が終わった時点を呼び出し側へ知らせる**必要がある:

```ts
publish(draft: EventDraft, hooks?: { onOptimisticInsert?: (event: NostrEvent) => void }): Promise<WriteResult>
```

`onOptimisticInsert` は `store.put()` の**直後**に同期的に呼ぶ。`v1.tsx` はこの中で `setOptimisticEvents` を行い、その前後で計測する。フックにしたのは、楽観挿入を UI へ映す方法が書き込む側ごとに違うため（compose はカラムへ重ねる、リアクションは `ReactionList` が `store.eventsByTag` から自動で拾うので何も要らない）。

publish に失敗して巻き戻したとき、`v1.tsx` は `optimisticEvents` からも取り除いたうえで本文をフォームへ戻す。

## 10. テスト

### 10.1 ビルダ（純関数、モック不要）

各ビルダについて、NIP の条文を根拠にした主張を置く。**捕まえる変異を各テストに書く。**

| 主張 | 捕まえる変異 |
|---|---|
| 根への返信は `root` マーカー 1 本 | `reply` マーカーも足す / マーカーを空にする |
| 返信への返信は `root` + `reply` の 2 本 | 親の `root` を引き継がず親だけ指す |
| `p` は親の全 `p` + 親の著者、自分は除く | 親の `p` を引き継がない / 自分を残す |
| 引用は `q` を立て `e` を立てない | `e` タグも立てる（= 返信として表示される） |
| リポストの `content` は対象の JSON | 空文字にする |
| リポストの `e` はリレー URL を 3 番目に持つ | 2 要素だけにする |
| リアクションは `e`/`p`/`k` を持つ | `k` を落とす |
| カスタム絵文字は `emoji` タグ 1 つ + `:shortcode:` 1 つ | `content` に飾りを足す |
| `addFollow` は既存の `p` の順序と未知のタグと `content` を保つ | 新しい配列を作り直す |
| `addFollow` は重複させない | 無条件に push する |
| `setRelayList` は read/write 両方でマーカーを付けない | 常に 2 本の `r` タグを出す |

**往復テスト**を 2 つ置く: `buildReaction` → `parseReaction`、`setRelayList` → `parseRelayList`。書いたものを自分で読めないのは、同じ NIP を 2 箇所で別々に解釈している証拠。

### 10.2 `Writer`（fake signer / fake store / fake publisher）

| 主張 | 捕まえる変異 |
|---|---|
| 署名 → put → publish の順で呼ばれる | put を publish の後にする |
| 署名が投げたら put も publish も呼ばれない | try の外に出す |
| `accepted` が空なら `store.remove` が呼ばれ `WriteFailedError` | 巻き戻さない |
| `accepted` が 1 本でもあれば残る | 1 本でも rejected があれば巻き戻す |
| `onOptimisticInsert` は put の直後・publish の前に同期的に呼ばれる | await の後にする |
| `replace` は fetchLatest → mutate → sign の順 | store の値で mutate する |
| 再取得が全滅なら `RefetchFailedError`、何も書かない | `current = undefined` で続行する |
| 1 本応答して不在なら `current = undefined` で続行 | `RefetchFailedError` にする |
| `created_at` が `current` 以下なら +1 に繰り上げ | 常に現在時刻を使う |

### 10.3 `EventStore.remove()`

| 主張 | 捕まえる変異 |
|---|---|
| `get(id)` が `undefined` になる | `#events` からだけ消す |
| `eventsByTag` から消える | `#byTag` を直さない |
| 置換可能の索引から消える | `#replaceable` を直さない |
| 永続層の `delete` が呼ばれる | 呼ばない |
| 存在しない id は `false` を返し何も壊さない | 例外を投げる |

### 10.4 e2e

**新しい e2e は書かない。** `v1.tsx` の差し替えにより、既存の `e2e/v1.spec.ts`（投稿 → 自分のカラムに出る → リロードで残る）がそのまま `Writer` の回帰テストになる。UI がこのスライスに無い以上、e2e で新しく測れるものは無い。

## 11. 決めなかったこと

- **削除の表示反映。** kind:5 を送るところまで。「削除されたイベントを隠す」は `EventStore` の deletion 索引を使う読み取り側の話
- **NIP-04 で書かれた既存のミュートリストの読み取り。** 7.9 節の通り書き込みは NIP-44 のみ。読み取りはミュート適用のスライスで扱う
- **`replaced` を UI がどう見せるか。** 材料を `WriteResult` に載せるだけ
