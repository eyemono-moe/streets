# 通知カラムの設計

## 1. 何を作るか

**自分宛のイベントを 1 本のカラムに集める。** 返信・言及・リアクション・リポストを分けない。

v1 の `column-presets.ts` が持つ種別は `home` / `user` / `hashtag` / `global` の 4 つで、**自分宛（`#p`）を引く経路が 1 つも無い**。誰かが自分の投稿に返信しても、それを見る手段が無い。[スレッド](2026-08-22-thread-design.md)が入ったことで「通知から返信へ辿って会話を読む」経路が初めて成立するので、その入口をここで作る。

Zap (kind:9735) は**このスライスに含めない**。理由と継ぎ目は 8 節。

## 2. 何を通知とみなすか

```json
{ "kinds": [1, 6, 7], "#p": ["自分"] }
```

1 フィルタで足りる。v0 の `Notifications.tsx` と同じ形。

### 2.1 巻き添えの返信もそのまま出す

NIP-10 は返信に**祖先全員の `p` タグを引き継がせる**（*"the reply event's 'p' tags should contain all of E's 'p' tags as well as the pubkey of the event being replied to"*）。つまり一度でも参加したスレッドは、以降の返信が全部「自分宛」として届く。

**これを間引かない。** 間引くには返信先イベントを引いて著者が自分かを見る必要があるが、返信先が未取得の間は判定できない。判定できない間をどちらに倒しても、**後から消えるか、後から出てくる**という、ユーザーから見て説明の付かない挙動になる。取りこぼしゼロで、実装が読み取りだけで閉じるほうを採る。他クライアントもおおむねこの挙動である。

### 2.2 自分が著者のイベントは落とす

自分の投稿への自分の返信・自分のリアクションは `#p` に自分が入るので、素直に引くと自分の行動が通知に並ぶ。これは通知ではない。

NIP-01 のフィルタは「著者が自分**でない**」を表せない（`authors` は許可リストであって拒否リストではない）ので、**届いたものを手元で捨てる**。判定は「イベントの著者が自分か」の 1 行で、kind:1 / 6 / 7 のどれでも同じ規則になる（返信者・リポストした人・リアクションした人が、いずれもそのイベントの著者だから）。

### 2.3 kind:16 は今回入れない（表示はできる）

**表示できないからではない。** `Repost.tsx` は既に kind:16 で登録済みで、レンダラを足す必要は無い。`NOTIFICATION_KINDS` に 16 を書けばそれだけで並ぶ。

入れないのは**このスライスで確かめたいことに寄与しないから**である。kind:16 の対象は kind:1 以外（長文記事など）で、v1 はまだそれを作れない。つまり通知として届くのは「他人が v1 の外で作った自分のコンテンツへの汎用リポスト」だけで、開発中に自分で作れず、e2e で意味のあるフィクスチャも組めない。**動くことを確かめられない行を仕様に入れない。**

`TIMELINE_KINDS` が 16 を外している理由（短文の列へ長文を混ぜない）とは別の判断であることに注意。あちらは「混ぜたくない」で、こちらは「今は確かめられない」。通知は種類を混ぜる場所なので、あちらの理由はここには効かない。

**後回しにした項目として `docs/design/read-layer-followups.md` に記録する。** 1 行の変更で入るものを黙って落とすと、次に読む人には「検討して外した」のか「忘れた」のか区別が付かない。

## 3. どのリレーで待つか

**自分の read リレー（NIP-65 の inbox）。引けなければ `FALLBACK_RELAYS`。**

### 3.1 なぜ read リレーか

`#p` フィルタには `authors` が無い。`query-plan.ts` は「著者を指定していないフィルタはルーティングのしようがない」として fallback へ同報するので、**何もしないと固定の 3 本を見ることになる** —— あなた宛に送られた場所を見ずに。

NIP-65 は publish 側にこう求めている（[65.md](https://github.com/nostr-protocol/nips/blob/master/65.md)、原文確認済み）。

> When publishing an event, clients SHOULD:
>
> - Send the event to the **write** relays of the author
> - Send the event to all **read** relays of each tagged user

つまり自分を `#p` で指したイベントは、**送り手が自分の read リレーへも送る**ことになっている。read リレーを見るのはこの SHOULD に乗るということであり、送り手が守らなければ拾えない —— この依存は受け入れる。

「自分の write リレーを読めば、自分の投稿を読んでいる人の反応が落ちているはず」という案は検討して**採らない**。read リレーへ届く設計になっているものを write 側で待ち受ける理由がクライアント側に無く、実装の実態でも nostrudel・Coracle(welshman)・Amethyst・Snort のいずれもが read/inbox リレーを使っており、write を読む例は見つからなかった。詳細と原文引用は [通知をどのリレーから読むか](../../design/notification-relay-selection.md)。

「自分のフォロワーの write リレー全部」はコスト以前に**集合が手に入らない**。Nostr には自分をフォローしている人を安く逆引きする仕組みが無い（kind:3 は自分→他人の向きのみ）。

### 3.2 材料は既にある

`warmUpRouting` は「自分の kind:10002 が引けないと自分の投稿が引けなくなる」という理由で**自分の pubkey を明示的に相② へ足している**（`bootstrap.ts`）。`RoutingTable.readRelaysFor(pubkey)` も実装済み。**新しい取得経路は要らない。**

### 3.3 0 本のときは fallback へ落とす

`readRelaysFor()` が空配列を返したとき、それを `relays: []` としてそのまま渡してはならない。`resolve-source.ts` が `authors: []` について書いているのと同じ罠で、**空配列は「該当なし」であって「未指定」ではない** —— リレー 0 本の明示指定になり、永久に何も来ない。空なら `FALLBACK_RELAYS` を載せる。

## 4. デッキへの入り方

### 4.1 保存するのは意図だけ

`ColumnSource` に variant を足す。

```ts
export type ColumnSource =
  | { kind: "literal"; filters: RelayFilter[]; relays?: RelayUrl[] }
  | { kind: "followees"; kinds: number[] }
  | { kind: "notifications" };
```

フィールドを持たない。**pubkey も read リレーもデッキに焼き込まない。**

焼き込むと、リレー設定（kind:10002）を変えたユーザーの通知カラムは、カラムを作り直すまで古いリレーを見続ける。`resolve-source.ts` の doc コメントが記録しているとおり、これは 2026-08-06 時点の実装が実際にやっていた壊れ方（フォローしてもホーム列が永久に反映されない）と同型である。read リレーは followees と同じ「変わる値」に属する。

pubkey については、デッキが `streets.v1.deck.${pubkey}` として pubkey ごとに保存されている以上、焼き込んでも古くはならない。それでも `ResolveContext` から取るのは、**「自分が誰か」の出どころを 2 つにしないため**。

`deck.ts` の `columnSourceSchema`（valibot の `v.variant("kind", ...)`）にも同じ variant を足す。既存の保存済みデッキは variant が増えても読めるので、`version` は 2 のまま据え置く。

### 4.2 解決

`ResolveContext` を広げる。

```ts
export type ResolveContext = {
  followees: () => readonly string[];
  viewer: string;
  readRelays: () => readonly RelayUrl[];
};
```

`readRelays` が**遅延アクセサ**なのは `followees` と同じ理由。即時評価する形（`{ readRelays: props.readRelays() }`）にすると、`literal` 列を解決するときにも呼ばれ、Solid の `createMemo` が warmUp のリソースを依存として記録する。結果、ウォームアップが settle するたびに全カラムの `source` memo が再計算され、`createSection` の `createEffect` が古い `SectionReader` を破棄して張り直す —— 既存コメントが「最終レビュー Important 1」として警告している事故そのもの。**呼ぶのを `kind === "notifications"` の分岐の中だけに閉じる。**

`viewer` は平の文字列でよい。ログイン中は変わらず、同期的に読めるので、依存として記録されても再購読を招かない。

`DeckColumn` は今 `followees` しか受け取っておらず、閲覧者の pubkey を知らない。`viewer: string` と `readRelays: () => readonly RelayUrl[]` の 2 つを props に足し、`/v1` (`src/routes/v1.tsx`) が `pubkey()` と `readLayer.routing.readRelaysFor(pubkey())` から渡す。`DeckColumn` はこの 2 つを `ResolveContext` へ組み立てるだけで、自分では読まない。

`resolveSource` の `notifications` 分岐:

```ts
if (source.kind === "notifications") {
  const relays = context.readRelays();
  return {
    type: "nostr",
    filters: [{ kinds: [...NOTIFICATION_KINDS], "#p": [context.viewer] }],
    relays: relays.length > 0 ? [...relays] : [...FALLBACK_RELAYS],
  };
}
```

`NOTIFICATION_KINDS`（= `[1, 6, 7]`）は `TIMELINE_KINDS` の隣、`deck.ts` に置く。

### 4.3 カラムを足す UI

- `ColumnPresetKind` に `"notifications"` を足す
- `buildColumn` の分岐は `{ id, title: "通知", source: { kind: "notifications" } }`
- `AddColumnForm.tsx` の `KIND_LABELS` に `notifications: "通知"`、`NEEDS_INPUT` に `notifications: false`（`home` / `global` と同じ）、`KINDS` の配列にも足す

`/v1` はデッキ全体が `<Show when={pubkey()}>` の中にあるので、**未ログイン用のプレースホルダは要らない**。通知カラムは pubkey がある前提で書ける。

## 5. 自分の行動を落とす場所

純関数として切り出す。

```ts
// src/core/deck/notification-filter.ts
export const excludeOwnActions = (
  events: readonly NostrEvent[],
  viewer: string,
): NostrEvent[] => events.filter((event) => event.pubkey !== viewer);
```

`DeckColumn.tsx` が `ColumnItems` へ渡す前に、`source.kind === "notifications"` のときだけ通す。`ColumnItems` の口は `items: () => readonly NostrEvent[]` なので、`createMemo` を 1 つ挟むだけで足りる。

**UI から切り出すのは、`column-presets.ts` を切り出したのと同じ理由** —— 「誰を落とすか」がブラウザ無しで固定できる。

### 5.1 受け入れる代償

**保持上限の 200 件は、捨てる前の件数で数える。** `SortedEvents` はセクションの中で保持しており、除外はその外側で起きるので、自分の行動が多いと見える件数がそのぶん減る。

読み取り層に述語を持たせて保持前に捨てる案（`NostrSource` に「自分の著作を落とす」を足す）は採らない。利用者 1 つのために読み取り層の界面を広げることになり、ADR-0015 が `SectionStatus` から余計な関心を追い出したのと逆向き。この代償が実際に効く（通知が自分の行動で埋まる）と分かってから動かせばよい。

## 6. 劣化の見せ方

自分の kind:10002 が引けないと read リレーが 0 本になり、fallback の 3 本へ落ちる。**黙って落とさない**（[ADR-0011](../../adr/0011-performance-budget.md)）。通知は「届いていないこと」に気づきにくい —— 誰も反応していないのか、見る場所が違うのか、画面からは区別が付かない。

`columnAlerts` は今 `(column, status)` しか受け取らず、「自分の kind:10002 が引けたか」はどちらにも入っていない。第 3 引数を足す。

```ts
export const columnAlerts = (
  column: ColumnDef,
  status: SectionStatus,
  context: { relayListSettled: boolean; readRelayCount: number },
): ColumnAlert[]
```

**判定 (settle のゲート) は `columnAlerts` の中で行う。** `context.relayListSettled && context.readRelayCount === 0` を `viewerRelayListMissing` として扱う。呼び出し側 (`DeckColumn.tsx`) は 2 つの値を渡すだけで、判定そのものは持たない。

`readRelayCount() === 0` は「設定が無い」と「まだ届いていない (ウォームアップ中)」を区別できない。区別せずに settle 前から警告を出すと、起動直後は必ず 0 本なので「リレー設定が見つからない」が毎回一瞬光って消える —— **まだ存在しない劣化を確定した事実として見せることになる。** `relayListSettled` のゲートはこれを防ぐためのものであり、判定を UI 側ではなく `columnAlerts` に置くのは、この 1 行 (settle 前は出さない) がカラムの実装ごとに独立に守られるより、判定を集約した 1 関数のテストで固定するほうが壊れにくいため。

`notifications` 列で `viewerRelayListMissing` が真のとき:

- `message`: `あなたのリレー設定 (kind:10002) が見つからないか取得できなかったため、既定のリレーで待っています`
- `action`: `通知が届かない場合は、リレー設定を publish しているか確認してください`

`message` を「見つからない」だけでなく「取得できなかった」も含む言い回しにしているのは、`viewerRelayListMissing` が kind:10002 の取得が timeout したケースも含むため —— 既に publish 済みの利用者に「publish しているか確認してください」とだけ出すのは、取れない行動を指示することになる。

**read リレーが到達不能な場合も知らせる。** `viewerRelayListMissing` は kind:10002 自体が引けたか (readRelayCount) しか見ないので、kind:10002 は引けているがそこに書かれた read リレーへ接続できない場合には真にならない。しかし画面から見える結果 (通知が来ない) も取れる行動 (リレー設定を直す) も設定が無い場合と同じなので、`notifications` 列では `status.incomplete.unreachableRelays > 0` のときも別の警告を出す:

- `message`: `あなたの設定した read リレーに接続できません (N 本)`
- `action`: `リレー設定 (kind:10002) の read リレーを確認してください`

既存の `literal` 列向けの到達不能警告 (`source.kind === "literal" && source.relays !== undefined`) はこの条件を満たさない —— 通知カラムは `literal` ではないので、この警告が無いと read リレーが全滅していても黙ったままになる。

`columnAlerts` の doc コメントは「返り値を配列にしてあるのは A-2 以降で…同じ入口へ集まるため」と成長を想定しており、方向は一致している。ADR-0026 の「ユーザーが行動できるものだけを返す」も満たす —— リレー設定の publish はユーザーが取れる行動である。

## 7. テスト

### 7.1 ブラウザ無しで固定するもの

| 対象 | 捕まえる変異 |
| --- | --- |
| `buildColumn("notifications")` | `source.kind` を別の値にする / 入力を要求する |
| `resolveSource` の `notifications` 分岐 | `#p` に viewer を入れない / `kinds` を変える |
| 同上、read リレーがあるとき | `relays` を載せない（fallback へ同報してしまう） |
| 同上、read リレーが 0 本のとき | `relays: []` をそのまま渡す（永久に何も来ない） |
| **`resolveSource` が `readRelays()` を呼ぶ分岐** | `literal` / `followees` の解決でも呼ぶ |
| `excludeOwnActions` | viewer の著作を落とさない / 他人の著作まで落とす |
| `columnAlerts` の新しい警告 | 通知列以外でも出す / 引けているのに出す |

**`readRelays()` の呼び出し範囲のテストを落とさない。** これは「動くかどうか」ではなく「再購読が起きないかどうか」を見るもので、動作からは見えない。呼ばれた回数を記録するアクセサを渡し、`literal` 列と `followees` 列の解決で **0 回**であることを主張する。同型の事故が `followees` で一度起きている。

### 7.2 e2e

`e2e/fixtures/seed-notification.ts` を足す。ローカルリレー (8080) へ publish するもの:

1. viewer の kind:10002（`ws://127.0.0.1:8080` を **read** としてマーク）—— read リレーの経路そのものを通す
2. viewer の kind:1（反応の対象）
3. 他人から viewer 宛の kind:1 返信
4. 他人から viewer 宛の kind:7 リアクション
5. 他人から viewer 宛の kind:6 リポスト
6. **viewer 自身が著者の kind:7**（対象は viewer 自身の投稿）—— 除外されるべきもの

`e2e/notification.spec.ts` で、通知カラムを足して 3・4・5 が出ること、**6 が出ないこと**を見る。

**除外の主張は必ず対照と並べる。** 「viewer のリアクションが出ない」だけでは、カラムが空でも通る。他人の同じ形のリアクション（4）が同じ画面に出ていることを同時に主張して初めて、除外が効いていることの証拠になる。

fallback へ落ちる経路（kind:10002 が無い場合）は e2e では見ない —— `FALLBACK_RELAYS` は実在の外部リレーで、CI から叩かせない。ユニットテストで固定する。

## 8. 範囲外

### 8.1 Zap (kind:9735) —— 次のスライス

このスライスに含めない。1/6/7 とは必要な仕事が別物だから。

- **NIP-57 の解析が全部新規。** v0 にも無い（v0 は LNURL アドレスの検証と送金ボタンだけで、receipt を読む処理を持たない）。`description` に埋まった kind:9734 の JSON、`P` タグ、`bolt11` からの金額
- **真正性の照合が要る。** zap receipt の署名者は**送金者ではなく受け取り手の LNURL サーバ**。NIP-57 は *"The `zap receipt` event's `pubkey` MUST be the same as the recipient's lnurl provider's `nostrPubkey`"* と定めている。照合しなければ誰でも偽の Zap を金額込みで publish でき、ADR-0011 の「劣化を隠さない」に反する。照合先は通知カラムでは常に自分の 1 件だが、**自分の lightning アドレスの提供者へ HTTPS で問い合わせる** —— Nostr のリレーではない通信経路が初めて入る
- **自己除外の規則が違う。** Zap の「誰が」はイベントの著者ではなく `description` の中の送金者なので、5 節の 1 行では判定できない
- **read リレーだけでは取りこぼしうる。** NIP-57 は zap receipt を*"publish it to the `relays` specified in the `zap request`"* と MUST で定めており、送り先を決めるのは送金側クライアント。そこに受け手の read リレーを含めるのは慣習であって規定ではない

**継ぎ目**: `NOTIFICATION_KINDS` に 9735 を足し、kind:9735 のレンダラを `defaultRenderers` へ登録し、5 節の除外に Zap の規則を足す。カラムの骨格（リレー選択・デッキへの入り方・劣化の表示）はそのまま使える。

### 8.2 未読

「どこまで見たか」の永続化・ヘッダの未読件数は含めない。デッキ保存・複数端末・リロード時の振る舞いを巻き込むので、カラムが動くようになってから別に決める。

### 8.3 通知の絞り込み UI

「リアクションだけ見る」のような絞り込みは含めない。1 本にまとめる判断（redesign と v0 に一致）を先に実地で確かめる。
