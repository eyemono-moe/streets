# v1 に足りない機能の棚卸し（2026-08-29 更新）

「デザインさえ当てれば完成する」状態にするために、**コア側に何が無いか**を数えた。[ADR-0002](../adr/0002-v0-parity-before-cutover.md) が「v1 の Must は v0 機能パリティで下限が固定される」と決めているので、v0 に有って v1 に無いものは原則ぜんぶ Must に入る。

実行するタスクの正は [GitHub Issues](https://github.com/eyemono-moe/streets/issues)。この文書は機能単位の棚卸し、[read-layer-followups.md](./read-layer-followups.md) は実装で得た知見と判断理由を残す。未完の作業は Issue 番号から追う。

---

## 0. いま動くもの（比較の基準）

- 読み取り: Outbox ルーティング、接続プール（30 接続）、購読管理、ローカルフィルタ照合、IndexedDB キャッシュ、セクション（items / status / loadMore）、窓付きレンダリング
- 表示: kind:1 / 6 / 7 / 未知 kind、本文パース（NIP-27/30）、引用・返信先の入れ子、リアクション一覧、プロフィールカード（ホバー）
- 書き込み: イベントビルダ（kind:30078 を除く全 kind）と `Writer` seam（`src/core/write/writer.ts`）が揃い、compose とイベントアクション（返信 / kind:6 リポスト / `+` Like）は `ProjectedWriter` 経由。署名 → 楽観挿入 → publish → 全滅時の巻き戻しが 1 経路にまとまっている（1.1/1.2 参照）
- 認証: NIP-07 / NIP-46（`bunker://`）
- デッキ: 閲覧者別のlocalStorage cache + 暗号化kind:30078による端末間同期（2秒デバウンス、競合検出と手動解決）
- 設定: read/writeリレー、公開・非公開ミュート、開発者モード、デッキ同期状態

---

## 1. 書き込み

イベントを組み立てる層（1.1）と署名〜publish を束ねる層（1.2）、NIP-46 remote signer（1.3）が実装されている。残る穴は次の 1 つ（判断理由は [followups の「書き込みの土台（2026-08-22）」節](./read-layer-followups.md)）:

- 削除（kind:5）の自動同期（[#333](https://github.com/eyemono-moe/streets/issues/333)）— 到着後の表示反映は動くが、通常カラムが対象 id / 座標に関係する kind:5 を追加取得する購読は未実装

### 1.1 イベントビルダ — `src/core/nostr/build/*`

kind ごとのタグ規則は仕様が分かれていて、間違えても publish は成功してしまう（他クライアントで表示が壊れて初めて分かる）。**純関数として切り出し、NIP の条文を根拠にテストで固定する**のがこの層の存在理由。

**実装済み。** kind:30078は専用ビルダではなく、汎用`Nip78Document<T>`が暗号化・競合検出を行い、`Writer.replace`が`d`タグを正規化する。

| kind | NIP | 要点 | ビルダ | 読み取り側の有無 |
|---|---|---|---|---|
| 1（返信） | NIP-10 | `e` の marked tag（`root` / `reply`）、祖先全員の `p` | ✅ `note.ts` | 読みは `replyTarget` が有る |
| 1（引用） | NIP-18 / NIP-27 | `q` タグと本文の `nostr:` の両方 | ✅ `note.ts` | 読みは `quoteTargets` が有る |
| 6（リポスト） | NIP-18 | `e`（リレーヒント必須）/ `p`、`content` に対象の JSON | ✅ `repost.ts` | 読みは `repostTarget` が有る |
| 7（リアクション） | NIP-25 | `e` / `p` / `k`、`content` は `+` / 絵文字 / `:shortcode:` + `emoji` タグ | ✅ `reaction.ts` | 読みは `parseReaction` が有る |
| 5（削除依頼） | NIP-09 | `e` / `a` / `k` | ✅ `deletion.ts`（送信は `e`） | ✅ 到着順・著者・`a` の時刻を検証して現在表示へ反映。通常カラムの自動同期は未実装 |
| 3（フォロー） | NIP-02 | **全置換**。既存リストを読んでから差分適用 | ✅ `follow.ts` | 読みは `bootstrap` が有る |
| 0（プロフィール） | NIP-01 | 既存の全フィールドを保ってから差分適用 | ✅ `profile.ts` | 読みは `profile-data.ts` が有る |
| 10000（ミュート） | NIP-51 | 公開 `p`/`e`/`t`/`word` + 暗号化 `content`（NIP-44） | ✅ `mute.ts` + `mute-list.tsx` | ✅ 公開・非公開を復元し、表示時に適用 |
| 10002（リレーリスト） | NIP-65 | `r` タグ + `read`/`write` マーカー | ✅ `relay-list.ts` | 読みは `relay-list.ts` が有る |
| 10003（ブックマーク） | NIP-51 | `e` / `a` | ✅ `bookmark.ts` | **読みも無い** |
| 30078（デッキ） | NIP-78 | `d` タグ + NIP-44 暗号化。[ADR-0013](../adr/0013-deck-persisted-to-nip78.md) | ✅ `create-nip78-document.ts` + `Writer.replace` | ✅ Account設定で状態・競合解決 |

### 1.2 書き込みの共通経路 — `src/core/write/writer.ts`

**UI から呼べる 1 つの seam** `Writer`（`publish` / `replace`）が「署名 → `store.put` → `publisher.publish` → 結果表示」を担い、compose はこれ経由になっている。併せて次の点を扱っている:

- **楽観挿入の巻き戻し。** publish が全滅すると `store.remove()` する。ただし無条件の巻き戻しは危険 — Nostr の id は `sig` を含まないハッシュなので、同一秒に同じ本文を 2 回投稿すると id が一致しうる。`verifyOptimisticInsert` の verdict が `"inserted"` のときだけ remove する形にして、既に成功していた 1 回目を巻き戻しが誤って消さないようにした（詳細は followups）。
- **置換可能イベントの read-modify-write。** kind:3 / 0 / 10002 / 10000 は `fetchLatest` で読んでから差分を当てて `Writer.replace` で送る経路が動く。`identifier`付き（kind:30000番台）にも対応し、EventStoreは`kind + pubkey + d`で最新版を分離する。デッキの競合判定は汎用`Nip78Document<T>`に閉じる。
- **楽観挿入の計測（ADR-0011）。** `onOptimisticInsert` フックが `store.put()` 直前の時刻を受け取るようにし、schnorr 検証込みで計測している（詳細は followups — この値を e2e が testid で見ていない点も含む）。

デッキ操作の署名要求は`Nip78Document`が2秒デバウンスし、保存中の変更をrevision付き直列queueで再送する。他の書き込みを一律に遅らせないため、`Writer`全体にはデバウンスを入れていない。

イベントアクションは 2026-08-28 に返信 / kind:6 リポスト / `+` Like の最小面を接続した。任意テキスト・カスタム絵文字リアクション、kind:16 generic repost、引用、ブックマーク、Zap は各機能の後続 Issue に残す。

### 1.3 NIP-46（リモート署名）

**完了（2026-08-25）。** `bunker://` から remote signer へ接続し、投稿、reload後のsession復元、明示logoutまで通る。NIP-07とNIP-46は`ActiveSigner`を介して常にどちらか一方だけが有効になる。transportのNIP-44、kind:24133 RPC、client session keyの境界は[ADR-0031](../adr/0031-nip46-session-key-boundary.md)を参照。

`nostrconnect://` / QRは後続。remote signer経由のpayload NIP-44はデッキ同期と非公開ミュートで利用済み。必要権限文字列をsession v3へ保存し、権限追加前のsessionは復元せず再認可を求める。

---

## 2. 読み取り — 画面が要求するのに経路が無いもの

### 2.1 通知カラム — 実装済み

返信・リポスト・リアクションを自分宛（`#p`）で引く通知カラムが動く。Zap は NIP-57 自体が未実装なので対象外。

### 2.2 スレッド（子返信の取得）— 2026-08-22 のスレッドスライスで実装済み

根への 1 購読でスレッド全体を取り、背骨（祖先 → 選択したイベント → 返信）を計算して表示する経路ができた（詳しい判断理由は [followups](./read-layer-followups.md)）。背骨は並べ替えではなく計算結果であり、順序関数は「focus からの距離」という文脈依存の値を持てないため、`Order` 型に thread 専用の並び順は無い。

2026-08-28 に Ark UI の返信ダイアログと `ProjectedWriter` を接続し、返信は送信直後から同じスレッドへ投影されるようになった。

残る穴: **兄弟の枝・返信の返信を同時に見せること。** 表示する形は「背骨だけ」と決めている。木の描画は別の設計が要る。

### 2.3 ミュートの適用 — 実装済み

kind:10000 の公開タグと NIP-44 暗号化 `content` を読み、表示直前の `MuteList` context で著者・イベント・ハッシュタグ・単語を落とす。イベントは store に残るため、ミュートを解除すると再取得を待たず表示へ戻る。設定画面から公開・非公開を分けて保存でき、NIP-44 非対応時に非公開対象を公開へ漏らさない。

### 2.4 ユーザーカラムを開く導線

`buildColumn("user", npub)` は有るが、**名前やアイコンを押して開く経路が無い**。`Profile.tsx` / `ProfileHover.tsx` のコメントが `#205` として参照している。[ADR-0026](../adr/0026-actionable-errors-visible-diagnostics-behind-developer-mode.md) の「押せる合図を先に出さない」に従って、いま名前は押せる見た目のまま何も起きない。

### 2.5 検索（NIP-50）

followups の「検索カラムは別に設計が要る（2026-08-07）」がそのまま残っている。NIP-50 は対応リレーが限られるので、Outbox ルーティングに乗らない（= 明示リレー指定の別系統になる）。

### 2.6 フォロー / フォロワー一覧

v0 は `/addColumn/followees` `/addColumn/followers` を持つ。フォロワーは `#p` の逆引きなのでインデクサ依存。

### 2.7 `replan()` を呼ぶ入口 — 実装済み

`EventStore.onReplaceableChanged` が kind:10002 の変更を通知し、`createReadLayer` が 200ms の窓でまとめて `SubscriptionManager.replan()` を呼ぶ。リレーリストを保存した直後も、同じアカウントの生きているセクションが新しいルーティングへ張り直される。

---

## 3. アカウントと設定

### 3.1 設定画面 — 基盤実装済み

Ark UIのダイアログ + 左ナビで、Account（デッキ同期）、リレー、ミュート、ラボが動く。プロフィール / display / fileの各設定と、Penpotで未確定の本文デザインは後続。

### 3.2 デッキの NIP-78 保存

**実装済み（2026-08-29）。** [ADR-0013](../adr/0013-deck-persisted-to-nip78.md)どおり NIP-44 self-encryption、local-first cache、2秒デバウンス、上書き前の競合検出、local / remoteの手動選択を持つ。同期機構はデッキ専用ではなく`Nip78Document<T>`として、次のkind:30078用途へ再利用できる。

### 3.3 アカウント切替

[ADR-0010](../adr/0010-single-active-account.md) は「同時に 1 アカウント」だが、切り替える手段は要る。[ADR-0027](../adr/0027-account-boundary-and-cache-scope.md) がキャッシュの scope 分離を決めているので、切替時に何を捨てるかは決まっている。

---

## 4. メディアと Zap

### 4.1 画像アップロード（NIP-96 / Blossom）

v0 は `src/features/FileServer` を持つ。redesign の compose にも画像ボタンがある。

### 4.2 Zap（NIP-57）

v0 は `src/features/Zap` と `src/shared/libs/zap.ts` を持つ。LNURL の往復と kind:9734 / 9735 が要る。redesign のアクション列にも入れてある。

---

## 5. 基盤の穴（followups から再掲）

- **初回イベント表示 2 秒（ADR-0011）が未測定のまま超過している。** 実地で約 3 秒。5 つの未測定指標のうち、これを最初に測れるようにすると followups が名指ししている。
- **E2E は CI で走っている**（`.github/workflows/ci.yaml` の `e2e` ジョブ）。followups の「満たしていない要件」節にある「CI が Playwright を一度も実行していない」は**その後に解消されており、記述のほうが古い**。Playwright は Vite の開発サーバーではなく本番ビルドの preview を使う。これにより初回モジュール変換中の再読み込みが assertion と競合しない。

---

## 着手順の提案

依存関係だけで並べると、**1.1 → 1.2 が全ての前提**になる。アクション列（返信・リポスト・リアクション・ブックマーク）も ⋮ メニュー（ミュート・フォロー・ブロック）も、redesign が描いた要素のほとんどがここに乗っている。

1. **1.1 + 1.2（書き込みの土台）** — ビルダと `writer` seam。**完了（2026-08-22）。** kind:1 返信 / kind:6 / kind:7 の 3 ボタンは実装可能になった（UI 配線はまだ無い）
2. **2.2（スレッド）** — redesign の中心。2.1 より先なのは、通知から返信へ辿る動線がスレッド無しでは行き止まりになるため。**完了（2026-08-22）。**
3. **2.1（通知カラム）** — **完了。**
4. **1.3（NIP-46）** — **完了（2026-08-25）。** 拡張なしでもbunkerでログイン可能
5. **イベントアクション（返信 / リポスト / Like）** — **最小面を完了（2026-08-28）。** 任意リアクション等は上記の後続へ分離
6. **3.1（設定）+ 2.3（ミュート）+ 3.2（デッキ同期）** — **完了（2026-08-29）。**
7. **削除反映** — **到着後の適用は完了（2026-08-29）。** 通常カラムの自動同期は [#333](https://github.com/eyemono-moe/streets/issues/333)
8. **2.4（ユーザー詳細）+ 2.6（フォロー一覧・送信）** — 日常操作の導線を閉じる
9. **2.5 / 3.3 / 4.1 / 4.2 / モバイル** — 残る v0 パリティとアカウント操作
