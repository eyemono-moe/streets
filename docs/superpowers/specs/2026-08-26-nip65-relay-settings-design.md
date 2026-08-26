# NIP-65 リレー設定 — 設計

## 0. このスライスは何のためにあるか

v1 の設定ダイアログは Ark UI で開けるが、変更できるのは端末設定の
開発者モードだけである。NIP-65 (`kind:10002`) の読み取りと書き込みの部品は
既にあるものの、画面から編集する経路と、変更後に通知カラム・Outbox を
張り直す経路が無い。

このスライスでは、Penpot の `Streets / v1 / redesign / Settings` を一次情報に、
設定ダイアログの骨格とリレー設定を一つの縦断スライスとして実装する。同時に、
通知カラムがリレーリストの取得中・欠落・取得済みを取り違えている問題を直す。

対象は設定画面の基盤と、通知リレーの取得状態・fallback・変更反映である。

## 1. 設定の所有権

端末設定とアカウント設定を混ぜない。

- `DeviceSettings`: localStorage に保存する端末固有の設定。今回も開発者モードを持つ
- `AccountSettings`: Nostr の置換可能イベントとして読む・書くアカウント固有の設定

`SettingsDialog` へ設定値・読み込み状態・保存関数を個別の Props として渡さない。
`AccountSettingsProvider` が次の小さい interface を提供し、イベントストア、Writer、
URL 正規化、保存中の状態は実装内へ隠す。

```ts
type RelayListState =
  | { phase: "signed-out" }
  | { phase: "loading" }
  | { phase: "missing" }
  | { phase: "ready"; entries: readonly RelayListEntry[] };

type AccountRelaySettings = {
  current: Accessor<RelayListState>;
  draft: Accessor<readonly RelayListEntry[]>;
  dirty: Accessor<boolean>;
  saving: Accessor<boolean>;
  error: Accessor<string | undefined>;
  add(rawUrl: string): boolean;
  toggle(url: RelayUrl, direction: "read" | "write"): void;
  remove(url: RelayUrl): void;
  reset(): void;
  save(): Promise<void>;
};
```

`current` は保存済み・受信済みの値、`draft` はフォームで編集中の値である。
未保存の編集で通知カラムの購読先を変えない。外から新しい kind:10002 が届いた場合、
フォームが dirty でなければ draft も追随する。dirty なら編集中の値を優先する。

## 2. リレーリストの状態

`relayListSettled: boolean` と `readRelayCount: number` の組を廃止し、
`RelayListState` 一つで表す。これにより「未取得なのに取得済み」「リストが無いのに
ユーザー設定リレーが不通」という組み合わせを型の形から作れなくする。

通知カラムの解決は次のとおり。

| 状態 | 購読先 |
| --- | --- |
| `signed-out` / `loading` | `relays: []`。取得が片付くまで外部へ接続しない |
| `missing` | `FALLBACK_RELAYS` |
| `ready` で read リレーが 0 本 | `FALLBACK_RELAYS` |
| `ready` で read リレーが 1 本以上 | 宣言された read リレー |

ここで `relays: []` は意図的な「0 本の明示指定」である。取得中だけに限定し、
取得後の空リストは fallback へ落とす。

警告も同じ状態を使う。

- `loading` では、まだ存在しない劣化を表示しない
- `missing` または read リレー 0 本では、fallback を使っている警告だけを出す
- read リレーがある場合だけ、その到達不能を「あなたの設定したリレー」と表示する

これで fallback の不通をユーザー設定の不通と呼ばない。

## 3. kind:10002 の変更通知

`EventStore` に「最新版の置換可能イベントが変わった」という通知を足す。
通知するのは、挿入・水和・巻き戻しで `latestReplaceable(kind, pubkey)` の指す
イベントが実際に変わった場合だけ。同じイベントの再配送や、最新版にならない旧版では
通知しない。

利用者は二つ。

1. `AccountSettings`: 自分の kind:10002 を Solid の状態へ反映する
2. `ReadLayer`: kind:10002 の変更をまとめ、`SubscriptionManager.replan()` を呼ぶ

再計画はイベント 1 件ごとに同期実行しない。ウォームアップでは多数の kind:10002 が
まとまって入るため、短いバッチ窓で一回に畳む。dispose 時は購読とタイマーを解除する。

`resolveSource` が状態アクセサを読むのは `notifications` 分岐だけに限定する。
警告用 memo は状態を読んでよいが、購読を作る source memo で literal / followees まで
依存させてはならない。

## 4. 編集規則

- URL は `normalizeRelayUrl` で正規化する
- `ws:` / `wss:` 以外は追加しない
- 正規化後に同じ URL なら重複追加しない
- 追加時は read + write の両方を有効にする
- read / write のどちらも無効な行は表現しない。最後の一方はトグルで消せず、削除操作を使う
- 0 件では保存しない。リレーリストを消す専用操作はこのスライスに含めない
- 保存は `Writer.replace(10002, undefined, setRelayList(draft))`
- `setRelayList` が既知でないタグと content を保つ既存契約は変えない

NIP-65 は read / write 各 2〜4 本程度に抑えるよう案内するが、ハード上限にはしない。
著者ごとの本数切り捨てを廃止した ADR-0016 と同じく、宣言値を黙って落とさない。

## 5. 保存先

Writer の楽観挿入後は `RoutingTable.writeRelaysFor(viewer)` が新しいリストを返す。
新しい write リレーだけへ publish すると、削除した旧 write リレーには古い
kind:10002 が残りうる。

置換可能イベントの publish では、再取得後・楽観挿入前の publish 先を保持し、
楽観挿入後に解決した publish 先との和集合へ送る。リレーリスト以外の置換可能イベントは
前後で同じ集合になるため、この規則を Writer の `replace` 全体へ適用してよい。
リストがまだ無い側は Publisher の fallback を使う。

この規則は「旧版を持つ可能性がある場所」と「今後の送信先」の両方へ新版を届けるための
もので、ConnectionPool を迂回する専用 publish 経路は作らない。

## 6. ダイアログ

プリミティブはすべて Ark UI を使う。

- `Dialog`: Portal、スクラム、Positioner、Content、CloseTrigger
- `Tabs`: 左ナビと本文
- read / write: Ark UI の toggle primitive

Penpot の寸法を次のように写す。

- ダイアログ本体: 最大 880 × 640、角丸 12px、`border.primary`
- 左ナビ: 220px、`bg.secondary`、上下 12px・左右 8px
- 本文: 残り幅、24px padding、20px gap
- リレー行: 52px、左右 12px、上下 10px
- 入力: 36px、角丸 8px
- 追加ボタン: 36px、pill、`bg.accent.primary`

スクラムに `bg.secondary` は使わない。これは面の背景色であり、背面を暗くする用途では
ない。Backdrop と Positioner の z-index を明示し、次をブラウザテストで固定する。

- Content 内のクリックでは閉じない
- Content 外、Escape、CloseTrigger で閉じる
- 背面へクリックが貫通しない
- 閉じたら開いたボタンへフォーカスが戻る

操作できない項目を先に見せない。今回は「リレー」と、既存の開発者モードを置く
「ラボ」だけをナビへ出す。アカウント・表示・通知・ミュートは実装時に追加する。

## 7. テスト

### 7.1 ブラウザ無し

- `RelayListState` の各状態から通知購読先が正しく決まる
- literal / followees の解決ではリレーリスト accessor を呼ばない
- fallback 利用中に到達不能でも「あなたの設定した read リレー」と表示しない
- EventStore は最新版が変わったときだけ通知し、巻き戻しでは直前版へ戻ったことを通知する
- ReadLayer は kind:10002 のバーストを一回の replan に畳み、dispose 後は呼ばない
- AccountSettings は URL を正規化・重複排除し、最後の方向を無効化しない
- 保存は kind:10002 を Writer.replace へ渡し、成功・失敗をフォーム状態へ反映する
- Writer.replace は旧 publish 先と新 publish 先の和集合へ一回ずつ送る

新しいテストには「捕まえる変異」を書き、対応する変異を実際に入れて赤くなることを
確認してから戻す。

### 7.2 E2E

ローカルリレーと NIP-07 スタブを使い、次を確認する。

- Penpot の主要寸法・背景が反映された設定ダイアログを開ける
- 外側クリックと Escape で閉じ、内側クリックでは閉じない
- リレーを追加し read / write を変更して保存できる
- 再度開いたとき保存後の値が表示される
- 保存後、通知カラムの購読先が新しい read リレーへ切り替わる

## 8. 範囲外

- リレーの接続状態・レイテンシ表示（観測 interface の設計が先）
- 通知 read リレーと 30 接続予算の競合方針
- NIP-51 ミュート
- プロフィール・表示・通知の各設定
- v1 全体の未定義 `alpha-*` 色の一括修正
- Penpot ファイル自体の変更
