# v1 に足りない機能の棚卸し（2026-08-22）

「デザインさえ当てれば完成する」状態にするために、**コア側に何が無いか**を数えた。
[ADR-0002](../adr/0002-v0-parity-before-cutover.md) が「v1 の Must は v0 機能パリティで下限が固定される」と
決めているので、v0 に有って v1 に無いものは原則ぜんぶ Must に入る。

実行するタスクの正は [GitHub Issues](https://github.com/eyemono-moe/streets/issues)。
この文書は機能単位の棚卸し、[read-layer-followups.md](./read-layer-followups.md) は
スライスで得た知見と判断理由を残す。未完の作業は Issue 番号から追う。

---

## 0. いま動くもの（比較の基準）

- 読み取り: Outbox ルーティング、接続プール（30 接続）、購読管理、ローカルフィルタ照合、
  IndexedDB キャッシュ、セクション（items / status / loadMore）、窓付きレンダリング
- 表示: kind:1 / 6 / 7 / 未知 kind、本文パース（NIP-27/30）、引用・返信先の入れ子、
  リアクション一覧、プロフィールカード（ホバー）
- 書き込み: イベントビルダ（kind:30078 を除く全 kind）と `Writer` seam
  （`src/core/write/writer.ts`）が揃い、compose は `Writer` 経由。署名 → 楽観挿入 →
  publish → 全滅時の巻き戻しが 1 経路にまとまっている（1.1/1.2 参照）
- 認証: NIP-07 のみ
- デッキ: localStorage のみ（閲覧者ごとにキー分離済み）

---

## 1. 書き込み

2026-08-22 の書き込みの土台スライスで、イベントを組み立てる層（1.1）と
署名〜publish を束ねる層（1.2）の両方ができた。残る穴は次の 5 つ
（詳しい経緯は [followups の「書き込みの土台（2026-08-22）」節](./read-layer-followups.md)）:

- NIP-46（リモート署名） — 1.3 参照
- kind:30078（デッキの NIP-78 保存）
- 署名要求のデバウンス
- 非公開リスト項目（NIP-44 の暗号化経路）— `Signer.nip44?` と
  `Nip44UnavailableError` は定義済みだが、throw する側・catch する側の
  どちらもまだリポジトリに無い
- 削除（kind:5）の表示への反映 — 送るところまでで、読み取り側が隠す経路が無い

### 1.1 イベントビルダ — `src/core/nostr/build/*`

kind ごとのタグ規則は仕様が分かれていて、間違えても publish は成功してしまう
（他クライアントで表示が壊れて初めて分かる）。**純関数として切り出し、
NIP の条文を根拠にテストで固定する**のがこの層の存在理由。

**kind:30078 を除いて実装済み。**

| kind | NIP | 要点 | ビルダ | 読み取り側の有無 |
|---|---|---|---|---|
| 1（返信） | NIP-10 | `e` の marked tag（`root` / `reply`）、祖先全員の `p` | ✅ `note.ts` | 読みは `replyTarget` が有る |
| 1（引用） | NIP-18 / NIP-27 | `q` タグと本文の `nostr:` の両方 | ✅ `note.ts` | 読みは `quoteTargets` が有る |
| 6（リポスト） | NIP-18 | `e`（リレーヒント必須）/ `p`、`content` に対象の JSON | ✅ `repost.ts` | 読みは `repostTarget` が有る |
| 7（リアクション） | NIP-25 | `e` / `p` / `k`、`content` は `+` / 絵文字 / `:shortcode:` + `emoji` タグ | ✅ `reaction.ts` | 読みは `parseReaction` が有る |
| 5（削除依頼） | NIP-09 | `e` / `k` | ✅ `deletion.ts` | **読みも無い**（削除の反映が未実装。上記参照） |
| 3（フォロー） | NIP-02 | **全置換**。既存リストを読んでから差分適用 | ✅ `follow.ts` | 読みは `bootstrap` が有る |
| 0（プロフィール） | NIP-01 | 既存の全フィールドを保ってから差分適用 | ✅ `profile.ts` | 読みは `profile-data.ts` が有る |
| 10000（ミュート） | NIP-51 | 公開 `p`/`e`/`t`/`word` + 暗号化 `content`（NIP-44） | ✅ `mute.ts`（公開項目のみ。非公開項目は上記参照） | **読みも無い** |
| 10002（リレーリスト） | NIP-65 | `r` タグ + `read`/`write` マーカー | ✅ `relay-list.ts` | 読みは `relay-list.ts` が有る |
| 10003（ブックマーク） | NIP-51 | `e` / `a` | ✅ `bookmark.ts` | **読みも無い** |
| 30078（デッキ） | NIP-78 | `d` タグ + NIP-44 暗号化。[ADR-0013](../adr/0013-deck-persisted-to-nip78.md) | ❌ 無い | 無い |

kind:30078 が無いのは、ビルダが未着手なだけでなく**土台側にも前提が要るため**。
`fetchLatest`（`src/core/write/fetch-latest.ts`）は `identifier`（`d` タグ）付きで
呼ぶと現状 throw する — `EventStore` の置換可能索引が `kind:pubkey` しか見ておらず
`d` を持たないため。着手する前に索引へ `d` を足す必要がある
（[followups](./read-layer-followups.md) の該当節を参照）。

### 1.2 書き込みの共通経路 — `src/core/write/writer.ts`

`v1.tsx` にあった「署名 → `store.put` → `publisher.publish` → 結果表示」を
**UI から呼べる 1 つの seam** `Writer`（`publish` / `replace`）にまとめ、
compose はこれ経由になった。

このスライスで同時に解いたもの:

- **楽観挿入の巻き戻し。** publish が全滅すると `store.remove()` する。
  ただし無条件の巻き戻しは危険 — Nostr の id は `sig` を含まないハッシュなので、
  同一秒に同じ本文を 2 回投稿すると id が一致しうる。`verifyOptimisticInsert` の
  verdict が `"inserted"` のときだけ remove する形にして、既に成功していた
  1 回目を巻き戻しが誤って消さないようにした（詳細は followups）。
- **置換可能イベントの read-modify-write。** kind:3 / 0 / 10002 / 10000 は
  `fetchLatest` で読んでから差分を当てて `Writer.replace` で送る経路が動く。
  **ただし `identifier` 付き（kind:30000 番台）は未対応**（1.1 参照）。
  ADR-0013 が NIP-78 について下した「マージはできない。競合を検出して警告する」を
  置換可能イベント全体へ広げるかどうかは、引き続き未決。
- **楽観挿入の計測（ADR-0011）。** `onOptimisticInsert` フックが `store.put()`
  直前の時刻を受け取るようにし、schnorr 検証込みで計測している
  （詳細は followups — この値を e2e が testid で見ていない点も含む）。

まだ無いもの:

- **署名要求のデバウンス。** ADR-0013 が指摘している通り、カラム操作のたびに
  署名器へ往復すると体感速度に直結する。デバウンスの置き場所は
  `writer.ts` になる想定だが、未実装。

### 1.3 NIP-46（リモート署名）

`src/routes/v1.tsx:378` に TODO として残っている。[ADR-0008](../adr/0008-signer-only-key-handling.md)
が「鍵を持たない」と決めている以上、NIP-07 拡張が無い環境（= モバイル全般）では
**現状ログインする手段がまったく無い**。[ADR-0009](../adr/0009-mobile-single-column-view-only-editing.md)
がモバイルを閲覧専用と決めているが、閲覧にもログインは要る。

---

## 2. 読み取り — 画面が要求するのに経路が無いもの

### 2.1 通知カラム

`column-presets.ts` の種別は `home` / `user` / `hashtag` / `global` の 4 つで、
**自分宛（`#p`）を引く種別が無い**。リアクション・返信・リポスト・Zap を 1 本に
まとめるか分けるかは設計が要る（redesign では 1 本にまとめている）。

### 2.2 スレッド（子返信の取得）— 2026-08-22 のスレッドスライスで実装済み

根への 1 購読でスレッド全体を取り、背骨（祖先 → 選択したイベント → 返信）を
計算して表示する経路ができた（[設計](../superpowers/specs/2026-08-22-thread-design.md)、
詳しい経緯は [followups](./read-layer-followups.md)）。`Order` 型に予約されていた
`"thread-tree"` は答えではなかったため削除した（背骨は並べ替えではなく計算であり、
順序関数は「focus からの距離」という文脈依存の値を持てない）。

残る穴:

- **返信を書くこと。** `buildReply` は既にあるが、返信フォームの面が無い。
  書き込み UI は redesign を当てるスライスでまとめて
- **兄弟の枝・返信の返信を同時に見せること。** 表示する形は「背骨だけ」と
  決めている。木の描画は別の設計が要る

### 2.3 ミュートの適用

kind:10000 を読む経路も、読み取り結果から落とす経路も無い。
**`matchesAnyFilter` の隣**（`SubscriptionManager` の `onEvent`）に置くのか、
表示側で落とすのかは未決 —— 前者だと store に入らないので「ミュートを解除したら
すぐ見える」が成立しない。

### 2.4 ユーザーカラムを開く導線

`buildColumn("user", npub)` は有るが、**名前やアイコンを押して開く経路が無い**。
`Profile.tsx` / `ProfileHover.tsx` のコメントが `#205` として参照している。
[ADR-0026](../adr/0026-actionable-errors-visible-diagnostics-behind-developer-mode.md) の
「押せる合図を先に出さない」に従って、いま名前は押せる見た目のまま何も起きない。

### 2.5 検索（NIP-50）

followups の「検索カラムは別に設計が要る（2026-08-07）」がそのまま残っている。
NIP-50 は対応リレーが限られるので、Outbox ルーティングに乗らない
（= 明示リレー指定の別系統になる）。

### 2.6 フォロー / フォロワー一覧

v0 は `/addColumn/followees` `/addColumn/followers` を持つ。
フォロワーは `#p` の逆引きなのでインデクサ依存。

### 2.7 `replan()` を呼ぶ入口

followups の「解消済み」節に**明示的に書かれている穴**。再計画の機構は
生きているが、`kind:10002` の到着で自動起動する経路が消えたので、
今これを動かすのは明示的な `replan()` 呼び出しだけ。
**呼ぶ側がまだ誰もいない。**

---

## 3. アカウントと設定

### 3.1 設定画面

v1 に設定ルートが無い。v0 は `/settings` の下に profile / relay / display / mute / file の
5 つを持つ。redesign では「デッキの上に開くダイアログ + 左ナビ」にしてある。

### 3.2 デッキの NIP-78 保存

[ADR-0013](../adr/0013-deck-persisted-to-nip78.md)（Should、切替のブロッカーではない）。
1.2 の read-modify-write と署名デバウンスに依存する。

### 3.3 アカウント切替

[ADR-0010](../adr/0010-single-active-account.md) は「同時に 1 アカウント」だが、
切り替える手段は要る。[ADR-0027](../adr/0027-account-boundary-and-cache-scope.md) が
キャッシュの scope 分離を決めているので、切替時に何を捨てるかは決まっている。

---

## 4. メディアと Zap

### 4.1 画像アップロード（NIP-96 / Blossom）

v0 は `src/features/FileServer` を持つ。redesign の compose にも画像ボタンがある。

### 4.2 Zap（NIP-57）

v0 は `src/features/Zap` と `src/shared/libs/zap.ts` を持つ。
LNURL の往復と kind:9734 / 9735 が要る。redesign のアクション列にも入れてある。

---

## 5. 基盤の穴（followups から再掲）

- **初回イベント表示 2 秒（ADR-0011）が未測定のまま超過している。** 実地で約 3 秒。
  5 つの未測定指標のうち、これを最初に測れるようにすると followups が名指ししている。
- **E2E は CI で走っている**（`.github/workflows/ci.yaml` の `e2e` ジョブ）。
  followups の「満たしていない要件」節にある「CI が Playwright を一度も
  実行していない」は**その後に解消されており、記述のほうが古い**。
  ただし E2E は不安定で、ドキュメントだけのコミットでも落ちることがある
  （`connection-budget.spec.ts` の 1 本目が、開発サーバーが温まる前に
  15 秒のタイムアウトへ当たる）。

---

## 着手順の提案

依存関係だけで並べると、**1.1 → 1.2 が全ての前提**になる。
アクション列（返信・リポスト・リアクション・ブックマーク）も ⋮ メニュー
（ミュート・フォロー・ブロック）も、redesign が描いた要素のほとんどが
ここに乗っている。

1. **1.1 + 1.2（書き込みの土台）** — ビルダと `writer` seam。**完了（2026-08-22）。**
   kind:1 返信 / kind:6 / kind:7 の 3 ボタンは実装可能になった（UI 配線はまだ無い）
2. **2.2（スレッド）** — redesign の中心。2.1 より先なのは、通知から返信へ辿る
   動線がスレッド無しでは行き止まりになるため。**完了（2026-08-22）。**
3. **2.1（通知カラム）** — 1 が終わっていれば読み取りだけで済む
4. **1.3（NIP-46）** — ここまでで「触れる人」が自分だけである状態が解ける
5. **3.1（設定）+ 2.3（ミュート）** — 設定画面はミュートの受け皿が要る
6. **2.4 / 2.5 / 2.6 / 4.1 / 4.2** — v0 パリティの残り
