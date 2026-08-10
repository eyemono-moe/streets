# GitHub Issues 草稿

`docs/design/read-layer-followups.md` の表と散文、`docs/backlog.md`、v0 パリティの機能群から抽出した残タスク。**この文書は Issue 作成後に削除する。**

ラベルの案:

- **領域**: `read-layer` / `ui` / `perf` / `test` / `infra` / `nip` / `observation`
- **優先度**: `P1`（移行前に必須）/ `P2`（移行前に望ましい）/ `P3`（移行後でよい）
- **`design-needed`**: 着手前にデザインの検討が要る。**このラベルが付いたものは私からは着手しない**

「解消済み」「直さないと決めた」「無害と判断済み」の項目は含めていない。

---

## 基盤（`design-needed` なし）

### 1. コアレッサが送るバッチのサイズを開発者モードに出す
`read-layer` `perf` `P1`

`event-requests.ts` / `profile-requests.ts` は 1 バッチを 1 本のフィルタに全部詰める。今この件数を観測する手段がどこにも無い。`first-render-ms` と同じ形で、直近および最大のバッチ件数を開発者モードへ出す。#2 の前提。

### 2. コアレッサのバッチを分割する
`read-layer` `P2`

REQ フレーム内で id 1 件は約 67 バイト。既定リレーの NIP-11 `max_message_length` は nos.lol 131,072 / damus 1,000,000 / yabu.me 1,310,720 で、**最も厳しい nos.lol でおよそ 1,950 件**。1 カラム（500 件 × 返信 1 + 引用 1）では届かないが、同じ 200ms 窓で 2 カラム以上が settled すると超えうる。超えるとバッチ全体が `isUnresolved` になり「読み込めませんでした」が一斉に並ぶ。`pending` を固定長で切って複数の `fetchOnce` に分ける。

### 3. 初回描画 3 秒の原因を分解する
`perf` `P1`

実鍵で約 3 秒（2026-08-07）。ADR-0011 の「初回イベント表示 2 秒」を超えている。候補はブートストラップの 2 往復（`kind:3` → `kind:10002`）/ `EventStore.put` の schnorr 検証 / 接続確立の 3 つで、どれがどれだけ効いているかは未測定。

### 4. イベントを IndexedDB にキャッシュし、起動時にメモリへ水和する
`read-layer` `P1`

ADR-0018 / ADR-0019。未着手。

### 5. `EventStore` を `createSection` の公開オプションから外す
`read-layer` `P1`

ADR-0018 は `EventStore` の seam 資格を明示的に取り消したが、実装は今も `SectionReader` と `createSection` の両方でオプションとして露出しており、共有するかどうかを呼び出し側が決められる。**#4 の冒頭で行う**（合成ルートの中身が揃ってから容器の形を決める）。`SectionReader` 側のオプションは内部の seam として残してよい。

### 6. 水和経路に信用済み挿入を用意するか決める
`read-layer` `P1`

`put()` は挿入のたびに schnorr 検証する。IndexedDB のキャッシュを起動時に `put()` で流し込むと全件を再検証することになり、ADR-0011 の「初回イベント表示 2 秒」がそれだけで埋まる。`put()` のシグネチャの話なので #4 と同時に決着させる。

### 7. `EventStore` のメモリ破棄戦略を決める
`read-layer` `P1`

10 カラム × 500 件で最大 5,000 件に加え、関連イベント・プロフィール・relay list が乗る。セクションの 500 件上限とは無関係に `EventStore` だけが増え続ける。単純な参照カウントは Solid の mount/unmount で揺れるため、参照理由の分類（section-membership / renderer-critical / routing / recent）と最終アクセス時刻の組み合わせが要る。ADR-0011 のメモリ 500MB はこれを決めないと満たせない。

### 8. `EventStore` のアカウント境界と機密情報の方針を決める
`read-layer` `P1`

最低限の 3 分類: 公開イベント本体は共有 / ミュート・既読・自分との関係はアカウント単位 / 復号結果（将来の NIP-44）はセッションまたは署名器単位。デッキは A-1 で pubkey ごとに分けたが、`EventStore` 自体は未分離。**後から分けるのは混ざった後では非常に高くつく。**

### 9. 同一リレー向けの REQ マージ
`read-layer` `P2`

ADR-0023 後続 #5。初回取得中はカラムごとに分け（EOSE の粒度が要る）、settled 後は 1 本にまとめて張り替える。`max_subscriptions` はリレーの除外基準ではなく初回取得の並列度を決める入力になる。

### 10. 性能予算の未測定 5 指標を E2E で測れるようにする
`perf` `test` `P1`

ADR-0011 は「測定できない予算は要件ではなく願望である」と定める。7 指標のうち測定済みは 30 接続上限と 500 件上限の 2 つだけ。残るカラム数・初回表示 2 秒・操作反映 100ms・メモリは未測定。**初回表示 2 秒は実地で超過が報告されているので最初に測れるようにする。**

### 11. CI で Playwright を走らせる
`infra` `test` `P1`

`.github/workflows/ci.yaml` は `check` / `test` / `build` の 3 ジョブだけで Playwright を一度も実行しない。前提が 2 つ: (a) `compose.yaml` の docker リレーを CI で起動しシードする手順、(b) `e2e/console-warning.spec.ts` がクリーンな木で赤い（旧実装の `/` を対象にしている）ので、直すか対象を変えるか除外するかを先に決める。

### 12. `tsconfig.test.json` が除外している既存の型エラー 22 件を直す
`infra` `P2`

`src/core/solid/*.test.tsx` 6 件と `src/routes/debug/v1-core.test.tsx`。古いモックが `NostrCoreQueryClient` / `QueryRegistry` / `RxNostr` の現行の型に追随しておらず、`createRxNostr()` の引数必須化にも追随していない。直したファイルから `exclude` を外す。

### 13. NIP-19 のルーティング
`nip` `P2`

npub / note / nevent / naddr の URL を開けるようにする。`src/core/nostr/nip19.ts` に `encodeBech32` / `decodeBech32` / `decodeNpub` がある。

### 14. `reserved` と `pinned` の「30 接続」の二重主張を 1 つにする
`read-layer` `P2`

`pinned`（選択器の中で予算を優先確保する）と `reserved`（`ConnectionPool` の予算チェック自体を飛ばす）が別々に同じ数字を主張している。ピーク同時接続数は `30 + |indexers|` = 34 になりうる（今日は到達しない —— 再ウォームアップの経路が無いため）。`ConnectionPool.reservedSize` で今何本が迂回しているかは読める。

### 15. `createSection` のライフサイクル API（画面外カラムの休止・優先度・破棄）
`read-layer` `P3`

**A-1 の実測で「今は要らない」と分かっている** —— 8 カラムで体感の重さ無し、`peakConnections` は 3 カラムのときと同じ 10。カラム数ではなく著者集合の広がりが接続数を決めている。互いに素な著者集合を持つカラムが増えたときに再検討する。

---

## デザインが要る（`design-needed`）

### 16. `content` のパース（URL・画像・`nostr:` メンション・カスタム絵文字）
`ui` `design-needed` `P2`

現在は本文をプレーンテキストとして出している。v0 の `src/shared/libs/parseTextContent.tsx` 相当。**表示の仕様（画像の扱いは ADR-0012）とパーサの両方が要る。**

### 17. リアクション（kind:7）の表示
`ui` `nip` `design-needed` `P2`

### 18. リアクションの送信
`ui` `nip` `design-needed` `P2`

### 19. リポストの送信
`ui` `nip` `design-needed` `P2`

### 20. 通知カラム
`ui` `design-needed` `P2`

メンション + リアクション + リポストを 1 本のリストに混ぜる形になる見込み（`NostrSource.filters` は複数形で、NIP-01 は 1 REQ に複数フィルタを載せられる）。

### 21. 検索カラム — どのリレーへ問い合わせるか決める
`ui` `nip` `design-needed` `P2`

NIP-50 の `search` は対応リレーが限られる。Outbox の選択（著者から引く）は使えない —— 検索は著者が未知だからこそ検索である。検索専用のリレー集合を持つのか、NIP-11 の `supported_nips` で選別するのか（`relay-info.ts` は既にある）、`fallbackRelays` に丸投げするのか。**`ColumnSource` に 3 つ目の `kind` が要るかどうかの判断でもある。**

### 22. 検索カラム — クエリ構文をどう扱うか決める
`ui` `design-needed` `P2`

v0 に `from:@...` や `since:` の実装がある（`src/features/Search/lib/parseSearchQuery.ts`）。NIP-01 のフィルタへ落ちるもの（`authors` / `since`）とリレー側の全文検索に投げるもの（`search`）が混ざっている。**どこまでをローカルのフィルタに翻訳し、どこからをリレーに委ねるか**を決めないと、同じクエリがリレーによって別の結果を返す。

### 23. ユーザー詳細カラム
`ui` `design-needed` `P2`

**「1 カラム = 1 セクション」をひっくり返す条件がここ。** プロフィール + 固定ポスト + 投稿一覧という「領域を積む」形は、`NostrSource.filters` でも `Order` の `thread-tree` でも表現できない（`CONTEXT.md` の用語定義は最初から「カラムは 1 つ以上のセクションの縦積み」と書いている）。複数セクションにするか、セクションの外側にレイアウトの概念を足すかを、ここで決める。

### 24. スレッド表示
`ui` `design-needed` `P2`

`Order` に `thread-tree` の値だけがあり、実装は無い。

### 25. ミュート
`ui` `design-needed` `P2`

### 26. 設定画面
`ui` `design-needed` `P2`

開発者モードのトグルは今デッキヘッダの隅にある（ADR-0026）。設定画面ができたらそちらへ移す。

### 27. Zap
`ui` `nip` `design-needed` `P3`

### 28. 画像アップロード
`ui` `design-needed` `P3`

### 29. プロフィール編集
`ui` `design-needed` `P3`

### 30. デッキ設定を NIP-78 に保存する
`nip` `design-needed` `P2`

ADR-0013。今は localStorage のみ。`Deck.version` は 2 で、この移行のための足場として置いてある。

### 31. NIP-46（bunker）でのログイン
`nip` `design-needed` `P2`

ADR-0008 の Consequences。今は NIP-07 のみ。

### 32. モバイル 1 カラム表示
`ui` `design-needed` `P2`

ADR-0009。幅 375px で 1 カラム全幅、スワイプとタブで切り替え、デッキ編集はデスクトップ専用。「なぜ編集できないのか」を伝える UI も要る。

### 33. `status.incomplete` の翻訳層
`ui` `design-needed` `P3`

ADR-0026 で「行動できる異常だけ常時表示、診断値は開発者モードの背後」と方針は決まった。**行動できる異常は今 1 種類だけ**（明示リレーを指定したカラムの `unreachableRelays`）。レンダラの失敗や未知 kind が判定に加わるときに再検討する。

---

## UI の不具合・小さいもの

### 34. カラム名を変えるとそのカラムの購読が張り直される
`ui` `P2`

`renameColumnIn` が該当カラムだけ新しいオブジェクト参照を作り、Solid の `<For>` は参照で照合するので `DeckColumn` の owner が破棄・再生成され `createSection` の `onCleanup` が購読を畳む。追加・削除・並べ替えは生き残るカラムの参照を保つので**リネームだけ**。blur/Enter のたびに 1 カラムが EOSE まで空になり、REQ が 1 本 30 接続予算へ再発行される。カラムの識別を参照ではなく `id` に寄せる（`createStore` で細粒度に持つ等）のが直し方。#37 も同時に消える。

### 35. `AddColumnForm` が種別を切り替えても入力欄を消さない
`ui` `P3`

「ユーザー」で npub を打ってから「ハッシュタグ」へ切り替えて送信すると、その npub がタグ値になったカラムが黙って出来る（スキーマ上は正しいが絶対に何も来ない）。エラーも出ない。

### 36. `AddColumnForm` のエラー文言が種別を問わず同じ
`ui` `P3`

### 37. `ColumnAlertBadge` の開閉状態が remount で失われる
`ui` `P3`

#34 と同じ原因。異常を開いたままリネームすると畳まれる。

### 38. レンダラが投げるとカラム全体が落ちる
`ui` `P2`

`<For>` の周りに `ErrorBoundary` が無い。未対応 kind の fallback は「1 件が描けなくてもカラムを壊さない」ために作ったのに、**その fallback 自身が投げたら守れない**（A-2 Task 5 の変異検証で実証）。item 単位で `ErrorBoundary` を張るのが直し方 —— カラム単位だと 1 件で全部消えるのは変わらない。

### 39. `EventView` が `id` 変更時に前の `event` を消さない
`ui` `P3`

`unresolved` だけリセットする。同じインスタンスが別の id へ使い回されると、新しい id の取得が終わるまで前のイベントを新しい id のものとして描き続ける。`Profile.tsx` も同じ形。今日は到達しない見込み（`<For>` は参照で照合し、Nostr のイベント id は内容アドレス）。

### 40. `EventView` の `rendererFor` がメモ化されていない
`ui` `P3`

`<Show>` の children 内で毎回呼ばれる。現在の規模では無害。

### 41. `EventRequests.relayHint` が受け取られたまま使われていない
`read-layer` `P3`

NIP-10 / NIP-18 のタグが運ぶリレーヒント。使うなら、悪意あるリレーが任意の URL を書ける問題を先に検討する必要がある。

### 42. `event-requests.ts` の `settled` が無限に増える
`read-layer` `P3`

バッチが解決した id は永久に残る。**#7（`EventStore` の破棄戦略）と一緒に扱う。**

---

## 読み取り層の小さいもの

### 43. `deck.ts` の `objectWithRest` の境界にテストが無い
`read-layer` `test` `P3`

valibot へ移した副作用で、`#` で始まらない未知のキーを持つフィルタも `string[]` を要求するようになった（手書きの型ガードは無視していた）。実害は無い（拒否されたデッキは既定デッキへ落ちる既存の縮退経路）が、`{ kinds:[1], extra: 42 }` は拒否・`{ kinds:[1], extra: ["a"] }` は受理という境界を固定するテストが無い。

### 44. `SectionReader.stop()` が `#items` / `#ids` を保持する
`read-layer` `P3`

`createSection` からは到達しないが、公開メソッドとして意味が未文書。終局的と明記するか状態をクリアする。

### 45. `SectionReader.start()` に `openRelay` の例外経路が無い
`read-layer` `P3`

既に購読したリレーが漏れる。URL ごとに包んで `unreachable` にするほうが ADR-0011 に忠実。

### 46. `SectionReader` が `source.relays` の重複 URL を二重購読する
`read-layer` `P3`

`unreachableRelays` を二重計上する。

### 47. `SectionReader.#items` が store の内部オブジェクトをそのまま渡す
`read-layer` `P2`

消費者が `items[0].content` を書き換えると全セクションの store が壊れる。水和（#4）が入る時点で `Object.freeze` かコピーを検討する。

### 48. `websocket-relay-connection` が CLOSING 窓で無駄な `REQ` + `CLOSE` を送る
`read-layer` `P3`

ソケットが開く前に購読を閉じた場合。`RelaySubscription.close()` は `#isClosed()` で守られていない。いずれも自己解消し有界。

### 49. `websocket-relay-connection` の `Array.isArray(message)` が型付けを失う
`read-layer` `P3`

`any[]` に絞られる。`readonly unknown[]` 注釈で回復する。**`subId` / `eventId` の `typeof` ガード 4 箇所は削除しないこと**（信用できないリレーと `NostrEvent` の間に存在する唯一の検証）。

### 50. `ConnectionPool.#attachConnection` のハンドシェイク窓
`read-layer` `P3`

`pooled.connection = connection`（`size` に数えられる）が `onOpen` の登録より先に起こる。実ソケットではこの窓が TCP/TLS ハンドシェイク全体に及ぶ。窓の間に replan が来ると、`size` 上は生きているのに `degradedRelays` はまだクリアされておらず、開いたばかりのソケットごと閉じられる。発生確率は低く、テストも無い。

### 51. `ConnectionPool.subscribe()` 自身の `onClosed` が隔離されていない
`read-layer` `P3`

`#attachConnection` 側は A-2 の前のスライスで隔離したが、`subscribe()` の初回失敗経路は素のまま呼んでおり、投げると公開メソッドの「例外を投げない」契約を破る。1 エントリなので他を巻き添えにするループは無い。

### 52. `PUBLISH_ONLY_HANDLERS` の暗黙の順序依存にテストが無い
`read-layer` `test` `P3`

`WebSocketRelayConnection.fail()` が保留中の publish を reject してから `onClose` を発火する、というマイクロタスク／マクロタスクの順序に依存している。`fail()` の順序をリファクタすると `["REQ", subId]`（フィルタ 0 個）がワイヤに出る。

### 53. `relay-info` が失敗をキャッシュしない
`read-layer` `P3`

NIP-11 を持たないリレーへ毎回 fetch する。恒久的な焼き付きを避けた結果であり、対処するなら失敗側に短い TTL。

### 54. `relay-info` の `supported_nips` が 1 要素の非数値で全体を捨てる
`read-layer` `P2`

実在するリレーには `"1"` のような文字列要素を出すものがあり、その場合 `supportsNip` が一律 false になる。**#21（検索カラムのリレー選別）がこれに依存する。** 要素単位のフィルタにする。

### 55. `relay-info.get()` の clone-`.then()` が両分岐で重複
`read-layer` `P3`

`structuredClone` のほうが素直。

### 56. `relay-info` の `fetchImpl.bind(globalThis)` が過剰
`read-layer` `P3`

既定の native `fetch` には必要だが、注入された実装まで束縛し直すのは過剰。`constructor(fetchImpl = fetch.bind(globalThis))` にして保存時は束縛しない。

### 57. `relay-url` がパーセントエンコードを正規化しない
`read-layer` `P3`

`%2f` と `%2F` が別 URL になる。userinfo もそのまま保持する。既定ポート・大文字スキーム・IPv6 は正しいがテストが無い。

### 58. `query-plan` が 1 フィルタ内の重複著者を除去しない
`read-layer` `P3`

`Map` の反復順序も表明していない。

### 59. `routing-table` が参照のたびに全部やり直す
`read-layer` `perf` `P2`

store 検索と `parseRelayList`（Map 構築 + 全タグ走査）を丸ごとやり直し、3 件を残して捨てる。`planQuery` は著者ごとに呼ぶため、500 人 × セクション数 × 再計画のたびに走る。導出元イベントの `id` をキーにメモ化すれば ADR-0016 の「導出・TTL なし」を壊さずに済む。**#3（初回描画 3 秒）の候補の 1 つ。**

### 60. `SectionReader.countUnroutableAuthors` が `status` の読み取りごとに再計算する
`read-layer` `P3`

リレーが 0 件のときだけ通る経路なので現状は無料。

### 61. `parse-relays` が URL を検証しない
`read-layer` `P3`

壊れた URL が安全なのは `ConnectionPool.subscribe()` が 3 ファイル離れた場所で `connect()` を try/catch しているからで、その依存は文書化されていない。e2e 専用の抜け道なので実害は小さい。

---

## テストの穴

### 62. `/v1` で `status.incomplete` を立てられる e2e フィクスチャ
`test` `P2`

`seed-preview.ts` は 3 人全員の `kind:10002` を到達可能な 1 本のリレーに置くので、3 つの数値が構造的に全部 0 になる。「開発者モードを入れると `deck-column-incomplete` が出る」を e2e で主張できない。`/debug/v1-section?budget=` に相当する予算上書きを `/v1` にも作れば書ける。

### 63. `column-alert` の e2e
`test` `P3`

判定ロジックは `column-alerts.test.ts` が固定しているが、「明示リレーを指定したカラムで実際にバッジが出る」ことは未確認。ローカル docker で「到達不能な明示リレーを持つカラム」を安定して作る手段が無いのが理由。#62 と同じ仕掛けで書けるようになる可能性がある。

### 64. `subscription-manager` の未テスト経路
`test` `P3`

`onEose` / `onClosed` の close 後抑制（`onEvent` のみテスト済み）、1 プラン内の重複 URL、空プラン。明示リレー経路で `fallbackRelays` を使わないのに計算している点も。

### 65. `bootstrap` の未テスト経路
`test` `P3`

`clearTimeout` / `getTimerCount` の表明、インデクサ 2 つが矛盾する `kind:3` を返すケース、不正な `p` タグの端から端まで。

### 66. `fake-signer` が未使用
`test` `P3`

鍵から pubkey を導く挙動に直接のテストが無く、さらに**呼び出し元がリポジトリ内に 1 つも無い**。署名器のテストへ配線するか、削除する。

### 67. `debug/v1-section.tsx` の `DEFAULT_RELAY` が環境変数を見ない
`test` `P3`

`STREETS_E2E_RELAY_URL` を見ない。`e2e/fixtures/seed.ts` は見るため、上書きした環境で e2e が落ちる。

### 68. フィルタ照合器に property-based test を入れる
`test` `P3`

現在は表駆動のユニットテストで観点は網羅している。自前実装の NIP-01 フィルタとしては生成的テストのほうが強い。

### 69. CI の `test` ジョブに `timeout-minutes` が無い
`infra` `test` `P2`

再入ガードと反復上限が同時に壊れると `subscription-manager.test.ts` の収束テストが真の同期無限ループを再現する。JS の単一スレッドでは vitest のテスト単位タイムアウトが割り込めず、CI がプラットフォーム既定（数時間）までハングする。1 行の保険。

### 70. seed データの NIPs 準拠検証と循環参照テスト
`test` `P2`

`e2e/fixtures/seed.ts` が生成するイベントが NIPs に準拠しているかを検証できるようにする。あわせて引用・リプライの循環（A↔B、A→B→C→A、自己引用、`e` タグで閉じる循環、3 階層以上の入れ子）をテストデータとして用意する。**A-2 は深さ上限のカウンタを持たず `compact` が関連を要求しないという規則で止めているので、循環は「止まること」ではなく「compact で打ち切られること」の確認になる。**

---

## インフラ

### 71. knip による旧実装の削除
`infra` `P2`

ADR-0002 の一括切替に向けて、旧実装の削除を手書きのリストではなく knip で機械的に行う。新旧のコードが `src/core/solid/` と `src/core/nostr/` に同居しておりディレクトリ単位で消せない。着手前に: `@line/ts-remove-unused` を置き換えるか併用するか、Vite+ 移行との順序、`src/router.tsx` の `lazy(() => import(...))` を knip が追えるか。

### 72. Vite+ (`vp`) への移行
`infra` `P3`

Vite・Vitest・Oxlint・Oxfmt・Rolldown・tsdown を 1 バイナリに束ねた統合ツールチェーン。**Biome → Oxlint/Oxfmt が最大の変更点** —— `pnpm check` / `pnpm fix` は CI と全スクリプトが依存し、`scripts/check-read-layer-deps.mjs` もこの経路に乗っている。単一パッケージなのでモノレポ向けの利点は効かない。着手前に SolidJS プラグイン・`vite-plugin-pwa`・UnoCSS が Rolldown ベースで動くかを検証する。

### 73. `valibot` を安定版へ上げる
`infra` `P3`

`package.json` で `1.0.0-rc.0` に固定されている。

---

## 実鍵でしか答えられない観測

### 74. A-2 後の初回描画時間を実鍵で読む
`observation` `perf` `P1`

開発者モードの `first-render-ms`。A-1 時点では約 3 秒（体感）。**A-2 は関連イベントの取得を増やしたので悪化しているのが当然**であり、悪化幅そのものが答え。#3 の入力になる。

### 75. A-2 後の 8 カラムでの接続数を実鍵で読む
`observation` `perf` `P2`

開発者モードの `peak-connections`。A-1 は 8 カラムでピーク 10 だった。関連イベントの `fetchOnce` が予算にどう効くか。

### 76. リポストの `content` 埋め込みが署名検証に通る割合を実地で測る
`observation` `P2`

通らないものが多ければ、埋め込みを信じる最適化そのものが無駄になる（常に `e` タグから引き直すことになる）。ユニットテストは合成フィクスチャでしか確かめていない。

### 77. `e` / `q` タグに pubkey が実際に入っている割合を実地で測る
`observation` `P2`

「親イベントの到着を待たずに `@name への返信` を出せる」という A-2 の設計上の前提は、タグに pubkey を入れているクライアントの割合に依存する。入っていなければこの最適化は効かない。
