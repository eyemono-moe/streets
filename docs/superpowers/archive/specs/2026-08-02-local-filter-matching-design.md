# ローカルフィルタ照合 — リレーの配信を信用するのをやめる

読み取り層の後続 #4。信頼境界の作業を 1 つだけ扱う。

用語は [CONTEXT.md](../../../../CONTEXT.md)、決定は [docs/adr/](../../../adr/)、全体像は [architecture.md](../../../design/architecture.md)。

## 0. なぜこれを単独のスライスにしたか

当初は「REQ マージ + `max_subscriptions` + ローカル再照合」を 1 スライスとして構想していた。**再照合はマージの付随作業ではなく前提条件である**と分かったので分けた。

マージすると 1 つの `subscription_id` に複数セクションのフィルタが相乗りする。`EVENT` メッセージは `subscription_id` しか持たないので（NIP-01 `01.md`）、**届いたイベントをどのセクションへ配るか決める手段がフィルタ照合しかない**。マージは照合の上にしか乗らない。

[ADR-0023](../../../adr/0023-centralized-subscription-manager.md) 自身が 2026-08-01 の訂正でこう書いている:

> ローカル再マッチが要るのは、マージするからではなく **リレーの配信を信用しているから**である。（中略）したがって再マッチは後続 #3 でマージと同時に入れる「マージの付随作業」ではなく、**それ自体が独立した信頼境界の作業**として扱うこと。

そして単独でも価値がある。今日この層にある検証は署名だけで、署名は**偽造**を止めるが**混入**は止めない。ある著者の write リレーは、そのリレーを見ているセクションへ、フォローしていない人の正当な署名付きイベントや別 kind のイベントを押し込める。[ADR-0005](../../../adr/0005-outbox-model-from-v1.md) の Outbox がこの面積を実質的に広げた — **セクションが話しかけるリレー集合を決めるのが、ユーザー自身ではなくフォローしている著者になった**ためである。

**本仕様は REQ マージと `max_subscriptions` を含まない。** それらは次のスライス（後続 #5）が本仕様の照合器の上に構築する。

## 1. NIP-01 の意味論（一次情報）

推測で実装しないため、`nostr-protocol/nips` の `01.md` から直接引いた（2026-08-02 確認）。

| 規則 | 原文 |
|---|---|
| フィルタ内の条件は AND | "All conditions of a filter that are specified must match for an event for it to pass the filter, i.e., multiple conditions are interpreted as && conditions." |
| フィルタ間は OR | "A REQ message may contain multiple filters. In this case, events that match any of the filters are to be returned, i.e., multiple filters are to be interpreted as \|\| conditions." |
| **前方一致は存在しない** | "The ids, authors, #e and #p filter lists MUST contain exact 64-character lowercase hex values." |
| タグ | "In the case of tag attributes such as `#e`, for which an event may have multiple values, the event and filter condition values must have at least one item in common." |
| タグのどの要素か | "Only the first value in any given tag is indexed."（＝ `tags[i][0]` がタグ名、`tags[i][1]` が索引される値） |
| 時刻 | "events with created_at greater than or equal to since are considered to match" / "until property is similar except that created_at must be less than or equal to until"（両端を含む） |
| **`limit` は照合条件ではない** | "The limit property of a filter is only valid for the initial query and MUST be ignored afterwards." |

## 2. 照合器を貫く原則 — 「REQ より厳しくなってはならない」

**誤りの2方向は対称ではない。**

- **厳しすぎる**（頼んだのに捨てる）= [ADR-0011](../../../adr/0011-performance-budget.md) が禁じる隠れた劣化。しかも黙って起きるので、ユーザーにも我々にも見えない。
- **緩すぎる**（混入を許す）= 今日と同じ状態に戻るだけ。新たな害はない。

したがって**判断に迷う条件はすべて緩い側へ倒す**。この原則が、以下の各決定の根拠である。

| 条件 | 扱い | 根拠 |
|---|---|---|
| `limit` | 照合に使わない | NIP-01（1節）。`{limit: 50}` だけのフィルタは全一致になる — 条件を 1 つも指定していないため |
| `search` | 照合に使わない | NIP-50 の全文検索。ローカルで判定不能。判定できないものを不一致に倒すと誤って捨てる |
| 未知のキー | 無視する | 上の原則。知らない条件で捨てない |
| `#foo`（複数文字） | タグ条件として扱う | NIP-01 は単一文字 (a-zA-Z) に限るが、`RelayFilter` 型は `` `#${string}` `` を許す。無視するより扱うほうが緩くない側 |
| `authors: []`（空配列） | 何にも一致しない | 「指定された条件は満たされねばならない」。空リストは満たしようがない |
| `filters: []`（空リスト） | 何にも一致しない | OR の単位元は偽。REQ を送っていない＝何も要求していない |
| `tags` が配列でない等の壊れた入力 | その条件を満たさないものとして扱い、**例外は投げない** | 4 節（全域性）を参照 |

## 3. 何をどこに置くか

### 3.1 新規 `src/core/read/filter-match.ts`

依存ゼロの純粋関数 2 つ。`NostrEvent` と `RelayFilter` の型以外は import しない。

```ts
export const matchesFilter = (event: NostrEvent, filter: RelayFilter): boolean;
export const matchesAnyFilter = (
  event: NostrEvent,
  filters: readonly RelayFilter[],
): boolean;
```

`matchesAnyFilter` は `filters.some((f) => matchesFilter(event, f))` — NIP-01 の OR そのもの。空配列に対して `false` を返すのは `Array.prototype.some` の定義から自動的に従う。

### 3.2 `subscription-manager.ts`

`#handlersFor(entry, url)` を `#handlersFor(entry, url, filters)` にする。呼び出し側 2 箇所（`:707` の張り直し経路、`:739` の新規経路）はどちらも既に `relayFilters` を手元に持っている。

**フィルタは `entry.opened` を引かずクロージャで捕捉する。** 不変式がハンドラ生成時点で閉じ、`#applyEntryDiff` が REQ を差し替えるときは必ず新しいハンドラが作られるので、**古い REQ に対応するハンドラが新しいフィルタで判定する**余地が構造的に消える。`entry.opened` を実行時に引く形だと、`pool.subscribe()` から `entry.opened.set()` までの窓で古い記録を読みうる（今日の同期的な制御フローでは実際には到達しないが、その安全性がコードの離れた 2 箇所の関係に依存することになる）。

`onEvent` の先頭に判定を置く:

```ts
onEvent: (event) => {
  if (entry.closed) return;
  if (!matchesAnyFilter(event, filters)) {
    this.#recordUnrequested(url);
    return;
  }
  const result = this.#options.store.put(event, url);
  ...
}
```

### 3.3 `bootstrap.ts`

`:138` の `onEvent` にも同じ判定を入れる。同じ信頼境界であり、ブートストラップが送っているフィルタ（`{kinds:[3], authors:[pubkey]}` / `{kinds:[10002], authors:[...]}`）は手元にある。

現在この位置には「ここではフィルタと突き合わせて確認しない」ことを明示的に認めるコメント（`:130-137`）がある。**このコメントは削除し、判定に置き換える。**

## 4. 照合器は全域関数である

**`matchesFilter` はいかなる入力に対しても真偽値を返し、例外を投げない。** これは付随的な行儀の良さではなく要件であり、テストで示す。

`onEvent` はソケットのメッセージ処理から呼ばれる。ここで投げると**そのリレーを見ている他のセクションへの配信ごと巻き込む**可能性がある — 接続プールの最終ブランチレビュー finding 4 が `#replanOnce` / `SectionReader.#notify()` で塞いだのと同じ形の欠陥を、新しい経路から作り直すことになる。

**そしてこれは机上の心配ではない。照合器は完全に未検証のワイヤデータを受け取る。** `websocket-relay-connection.ts:152-160` は `typeof subId !== "string"` と `typeof event !== "object"` だけを確認して `onEvent(event as NostrEvent)` とキャストしている。構造検証 (`isNostrEvent`) が走るのは `EventStore.put` の内部（`verifyEvent` 経由、`event.ts:75`）であり、**照合器はその手前に立つ**。したがって `event.tags` が存在しない・`event.created_at` が文字列である・`event.pubkey` が数値である、といった入力は実際に到達しうる。`NostrEvent` という静的型は**この地点では嘘である**ことを前提に書くこと。

したがって `event.tags` が配列でない、タグ要素が配列でない、`filter` の値が想定外の型である、といった入力はすべて「その条件を満たさない」に倒し、投げない。敵対的な入力によるファズで担保する（7.1）。

## 5. 観測可能性

### 5.1 `SubscriptionManager` のアクセサ

```ts
get unrequestedEventsByRelay(): ReadonlyMap<RelayUrl, number>;
```

**単調増加。リセットしない。** `ConnectionPool.peakSize` と同じ理屈で、押し込んだ後に静かになったリレーが潔白に見えてはいけない。

**リレーごとに分けるのは、合計値だけでは行動に移せないからである。** 「どこかが嘘をついている」は情報だが、「どのリレーが嘘をついているか」は判断材料になる。合計はデバッグルート側で足す。

### 5.2 `SectionStatus` には入れない

`incomplete` は「ユーザーが求めたのに欠けている」を意味する（[ADR-0015](../../../adr/0015-section-status-excludes-renderer-fetches.md)）。**捨てた迷い込みイベントは何も欠けさせていない** — 意味がずれる。加えて、おしゃべりなリレー 1 本で全セクションが恒久的に `incomplete` を主張し続けることになり、[ADR-0011](../../../adr/0011-performance-budget.md) が守ろうとしている「劣化の報告」そのものが信用を失う。

### 5.3 ブートストラップ

`warmUpRouting` の戻り値 `{followees, routed, unroutable}` に `unrequested: number` を足す。ブートストラップにはマネージャが無いので、そこで捨てた分の行き先が他にない。

### 5.4 デバッグルート

`/debug/v1-section` に `data-testid="unrequested"` を足し、合計と内訳を表示する。e2e（7.4）はこれを読む。

## 6. `kind:10002` 到着による再プランの引き金を削除する

**これは本仕様の副作用ではなく、明示的に決めた削除である。**

`subscription-manager.ts:828` には ADR-0016 の「未解決の著者を解決後に張り直す」を閉じるための引き金がある — `kind:10002` が届いたらデバウンスして再プランする。**しかしこの経路に今日届きうる送信元は「リレーが要求されていないイベントを push してくる場合」だけである。** コード自身のコメント（`:823-827`）がそう認めている。ウォームアップの `kind:10002` は `bootstrap.ts` 自身のハンドラを通り（`:139`）、`#handlersFor` を一切通らない。そしてセクションが送るフィルタは `{kinds:[1], authors:[...]}` である。

したがって**照合を入れた瞬間、この引き金は原理的に発火しなくなる。**

「要求していない `kind:10002` だけ照合を免除する」ことは選ばなかった。最終ブランチレビュー finding 5 が塞いだ「新規鍵ペアを量産して大域の貪欲選択を任意のタイミングで起こす」DoS を再び開けることになり、本仕様の目的そのものと矛盾する。

### 削除される範囲（実測）

| 対象 | 現在の唯一の呼び出し元 |
|---|---|
| `:796-834` の判定ブロックと約 40 行のコメント | — |
| `#scheduleReplan()` (`:409`) | `:833` のみ |
| `#replanTimer` フィールドと `dispose()` (`:373-375`) の後始末 | 上記のみ |
| `#isDemandedAuthor()` (`:854`) | `:831` のみ |
| 対応するユニットテスト（`subscription-manager.test.ts:1604` 周辺ほか） | — |

### 残るもの

- **公開 `replan()`** — 水和（後続 #6）や再ウォームアップが呼ぶ明示的な入口。
- **初回のルーティング** — 従来どおり `warmUpRouting` が作る。本仕様は初回経路に一切触れない。
- **`scheduler` オプション** — `ConnectionPool` が使う（`:278`）ので残る。

### 失うもの

「セッション中にリレーが自発的に push してきた `kind:10002` に追随する」機能。リレーに push の義務は無いので、もともと当てにできない偶然の経路だった。**専用の `kind:10002` 監視購読を作るかどうかは、ルーティング／水和のスライスが単独で判断する。** 本仕様はその判断を先取りしない。

なお ADR-0023 の「グループの再編成にはデバウンスが要る」は**マージ（後続 #5）の話**であり、ここで消すデバウンスとは別物である。後続 #5 は自前のデバウンスを持つことになる — 矛盾ではない。

## 7. テスト戦略

前スライスで「非 falsifiable なテストが約 12 件見つかった」ことを踏まえ、**各テストが捕まえる変異を明記する**。

### 7.1 照合器のユニットテスト

NIP-01 の規則ごとに、それが捕まえる変異を名指しで:

| 主張 | 捕まえる変異 |
|---|---|
| `limit` だけのフィルタは全一致 | `limit` を件数条件として扱ってしまう |
| `since` は境界を含む | `<` と `<=` の取り違え（`until` も同様） |
| タグは `tags[i][0]` がタグ名 | `tags[i][1]` で引く／添字の取り違え |
| フィルタ間は OR | OR を AND にする |
| フィルタ内は AND | AND を OR にする |
| `authors: []` は何にも一致しない | 空配列を「条件なし」として扱う |
| 大文字混じりの hex は一致しない | `toLowerCase()` を挟んで緩めてしまう（下記参照） |
| `search` があっても他の条件だけで判定 | `search` を不一致に倒す |

**大文字 hex について（2 節の原則との関係）。** `ids` / `authors` / `#e` / `#p` は大文字小文字を区別して厳密比較する。これは 2 節の「REQ より厳しくなってはならない」に反しない — **我々が送った REQ が小文字の `X` を要求している以上、`X.toUpperCase()` を持つイベントは「頼んだもの」ではない**からである。NIP-01 が "MUST contain exact 64-character lowercase hex values" と定めているのはフィルタ側であり、それに小文字で書いた我々の要求を、照合側で勝手に広げる理由がない。

**（2026-08-02 訂正）** 本節の初版はここに「イベント id は署名者自身の直列化に対するハッシュなので、大文字で署名されたイベントは自己整合的に検証を通りうる」と書いていた。**これは誤りである。** `verifyEvent` は先頭で `isNostrEvent` を呼び（`event.ts:75`）、そこの `HEX64 = /^[0-9a-f]{64}$/` が `id` と `pubkey` を小文字に限っている（`event.ts:31-33`）。大文字 hex のイベントは `store.put` で必ず `"rejected"` になる。

正しい位置づけはこうである。**大文字 hex のイベントはどのみち捨てられる。照合器の厳密比較が変えるのは「誰が捨てたか」だけである。** それでも意味がある: 照合器が捨てれば schnorr 検証が走らず（3 節のコスト論）、`unrequestedEventsByRelay` に正しいリレーが記録される。**したがって主張としては残すが、「これが唯一の防御線である」とは書かないこと。**

**全域性**: 敵対的な入力（`tags` が非配列、タグ要素が非配列、フィルタ値が非配列、`created_at` が非数値など）を投入し、**投げないこと**と真偽値を返すことを主張する。

### 7.2 マネージャ配線のユニットテスト

- 一致しないイベント → `store.put` が呼ばれない・`delivery.onEvent` が呼ばれない・カウンタが増える
- 一致するイベント → 通る・カウンタが増えない
- **再プランでフィルタが変わった後、新しいフィルタで判定される**（クロージャ捕捉が効いていること）
- カウンタがリレーごとに分かれている
- 削除した引き金が本当に無いこと: フォローしている著者の**新しい** `kind:10002` を relay が push しても、`store.put` に到達せず、`onPlanChanged` が呼ばれず、セクションのリレー集合が変わらない

  「デバウンスタイマーが積まれないこと」を主張してはならない。`ConnectionPool` は同じ `scheduler` を再接続に使う（`:278`）ので、タイマー本数の主張はプール側の挙動と混線し、何を測っているのか分からなくなる。**計画が変わらないことを直接主張する。**

### 7.3 `bootstrap.ts` のユニットテスト

インデクサが `kind:1` を押し込んでも `store.put` に到達しない。`warmUpRouting` の戻り値の `unrequested` が増える。

### 7.4 e2e — 実際に嘘をつくリレー

`page.routeWebSocket`（`e2e/relay-recovery.spec.ts` で確立した手法）で relay 2 の前に割り込み、**悪意あるリレーを本物として再現する**。実リレーはフィルタを守るので、この経路以外に再現手段がない。

手順:

1. fixture で、**閲覧者がフォローしていない著者**の正当な署名付き `kind:1` を用意する
2. ルートハンドラで `connectToServer()`。`ws.onMessage` でページ→サーバのメッセージを覗き、`["REQ", subId, ...]` から `subId` を控える。`ws.onMessage` を張ると自動中継が止まるので `server.send(message)` で明示的に転送する
3. `ws.send(JSON.stringify(["EVENT", subId, forgedEvent]))` でページへ注入する

主張:

- そのイベントは `items` に**出ない**
- `unrequested` が relay 2 について 1 以上になる
- **`outboxNoteBText` は従来どおり出る** — relay 2 を壊しただけではないことの担保

**署名は本物にする。** 無効な署名だと `store.put` の schnorr 検証が先に弾き、**照合器が効いたのかどうか区別できない**。カウンタの主張がこの区別を担う（schnorr 拒否ではカウンタは増えない）。

**変異による検証**: `matchesAnyFilter` の呼び出しを外すと迷い込みノートが `items` に出ることを確認する。

## 8. 影響を受ける ADR

- **[ADR-0023](../../../adr/0023-centralized-subscription-manager.md)** — 「ローカル再マッチが必要になる」は本仕様で解消。実装の段階の記述を更新する（後続 #3 でマージと同時、ではなく後続 #4 で単独）。
- **[ADR-0016](../../../adr/0016-routing-bootstrap.md)** — 「解決後に張り直す」の引き金が `kind:10002` の到着から明示的な `replan()` のみに変わる。6 節の裁定を追記する。
- **[ADR-0011](../../../adr/0011-performance-budget.md)** — 変更なし。本仕様は 5.2 の判断でこの ADR に従っている。

新しい ADR は起こさない。本仕様が決めているのは既存 ADR の実装方法であり、新しい方針の決定ではない。

## 9. 本仕様に含めないもの

- **REQ マージと `max_subscriptions`** — 後続 #5。本仕様の照合器がその前提になる。
- **`kind:10002` 監視購読** — 6 節のとおりルーティング／水和のスライスが判断する。
- **捨てたイベントの内容の記録** — カウンタのみ。内容を貯めるとリレー起因のメモリ増加という、まさに防ごうとしている性質を持ち込む。
- **`degraded` なリレーの再選択**（[followups](../../../design/read-layer-followups.md) の finding 9b）、**指数バックオフの修正**（同）— どちらも接続プールの話で、信頼境界とは別。
