# A-1 デッキとカラム — 設計

## 0. このスライスは何のためにあるか

**成果物は「動くデッキ」だが、価値は押し返しである。**

読み取り層は接続予算・再接続・degraded・Outbox ルーティング・フィルタ照合・保持順まで作り込んであるが、その上に載っているのは `/v1-preview` の固定 3 カラム 1 本だけである。外部レビュー（`docs/design/read-layer-followups.md`「外部レビュー（2026-08-04）」）が指摘した「設計を維持するために実装している」状態から抜けるには、**次も使用を先に置く**必要がある。

このスライスは 5〜10 カラムを実地で回す。それによって初めて答えが出る問いを 12 節に列挙する。**その答えが出ないなら、このスライスは目的を果たしていない。**

前提知識は [CONTEXT.md](../../../CONTEXT.md)、決定は [docs/adr/](../../adr/)、繰延事項は [read-layer-followups.md](../../design/read-layer-followups.md)。

## 1. 範囲

**含む。** `/v1-preview` を `/v1` へ置き換える。カラムの追加・削除・並べ替え・タイトル編集。カラム種別 4 つ。派生ソース（フォローリストを焼き込まない）。デッキ永続化の valibot 化。ADR-0026 に沿った異常表示と開発者モード。投稿フォームと楽観挿入の維持。

**含まない。** モバイル 1 カラム表示（[ADR-0009](../../adr/0009-mobile-single-column-view-only-editing.md)、別スライス）。ドラッグ&ドロップ。カラム幅。NIP-78 へのデッキ保存（[ADR-0013](../../adr/0013-deck-persisted-to-nip78.md)）。レンダラ登録機構と `needs`（[ADR-0017](../../adr/0017-declarative-renderer-needs.md)、A-2）。通知カラム・検索カラム・ユーザー詳細カラム。`kind:3` 到着によるライブ再解決。設定画面（フェーズ C）。ページネーション。

## 2. ルートと移設

`/v1-preview` を削除し `/v1` を作る。**v0 の `/` には触らない** —— [ADR-0002](../../adr/0002-v0-parity-before-cutover.md) の一括切替は無傷のままにする。

```
src/routes/v1.tsx                          デッキ全体（ログイン・ヘッダ・投稿フォーム・カラム列）
src/routes/v1/DeckColumn.tsx               1 カラム
src/routes/v1/AddColumnForm.tsx            カラム追加フォーム
src/routes/v1/ColumnAlertBadge.tsx         異常アイコンと展開
src/routes/v1/DiagnosticsPanel.tsx         開発者モードの診断表示
src/routes/v1/Note.tsx                     v1-preview から移設（変更なし）
src/routes/v1/Profile.tsx                  v1-preview から移設（変更なし）
src/routes/v1/parse-relays.ts              v1-preview から移設（変更なし）
src/routes/v1/verify-optimistic-insert.ts  v1-preview から移設（変更なし）

src/core/deck/deck.ts                      ColumnSource / Deck / valibot スキーマ / load / save / defaultDeck
src/core/deck/resolve-source.ts            resolveSource
src/core/deck/column-alerts.ts             columnAlerts
src/core/settings/developer-mode.ts        開発者モードの読み書き
src/core/nostr/nip19.ts                    decodeNpub を追加（既存ファイル）
```

`?relays=` による e2e 用のリレー上書き（`parse-relays.ts`）は**そのまま残す**。ローカル docker リレーに対する既存の e2e はこれに依存している。

## 3. データモデル

### 3.1 保存するのは「意図」であって「結果」ではない

現在の `defaultDeck` は `authors: followees` としてフォローリストを**フィルタに焼き込んでいる**。誰かをフォローしても、ホーム列はデッキを作り直すまで永久に反映されない。カラムを増やせるようにすると、この形がユーザーの作る全カラムに効く。

したがって `ColumnDef.source` は NIP-01 のフィルタそのものではなく、**フィルタへ解決できる指定**にする。

```ts
export type ColumnSource =
  | { kind: "literal"; filters: RelayFilter[]; relays?: RelayUrl[] }
  | { kind: "followees"; kinds: number[] };

export type ColumnDef = { id: string; title: string; source: ColumnSource };
export type Deck = { version: 2; columns: ColumnDef[] };
```

解決は 1 箇所だけに置く。

```ts
// src/core/deck/resolve-source.ts
export type ResolveContext = { followees: readonly string[] };

export const resolveSource = (
  source: ColumnSource,
  context: ResolveContext,
): NostrSource =>
  source.kind === "literal"
    ? { type: "nostr", filters: source.filters, ...(source.relays ? { relays: source.relays } : {}) }
    : {
        type: "nostr",
        filters: [{ kinds: source.kinds, authors: [...context.followees] }],
      };
```

**派生は `followees` の 1 種類だけから始める。** 増やすのはそれを要求する種別が現れてからでよい。ここで増やすと、使われない解決規則を検証なしに抱えることになる。

`followees` は `warmUpRouting` の結果（`WarmUpResult.followees`）から来る。取得は現在と同じくログイン時に 1 回。**フォロー変更のライブ反映（`kind:3` 到着での再解決）は範囲外** —— `kind:10002` の到着で replan する経路が無いのと同じ構図で、入口を作る側が責任を持つべき配線であり、このスライスはその入口を作らない。焼き込みをやめる効果として、**リロードすれば必ず反映される**状態にはなる（今は永久に反映されない）。

解決を呼ぶのは `DeckColumn` の 1 箇所だけにする。`?relays=` の e2e 上書きは**解決した後**に適用する —— 上書きが見るのは `NostrSource.relays` であって `ColumnSource` ではない。

```ts
const source = createMemo<NostrSource>(() => {
  const resolved = resolveSource(props.column.source, { followees: props.followees() });
  return RELAYS_OVERRIDE && resolved.relays
    ? { ...resolved, relays: RELAYS_OVERRIDE }
    : resolved;
});
```

### 3.2 既定デッキ

初回起動時（localStorage に何も無い、または壊れている）の既定デッキは 3 本。[ADR-0009](../../adr/0009-mobile-single-column-view-only-editing.md) が「既定デッキは必須要件」としている（モバイルから初めて訪れたユーザーは空画面になるため）。

```ts
export const defaultDeck = (viewerPubkey: string): Deck => ({
  version: 2,
  columns: [
    { id: "home",   title: "ホーム",     source: { kind: "followees", kinds: [1] } },
    { id: "mine",   title: "自分の投稿", source: { kind: "literal", filters: [{ kinds: [1], authors: [viewerPubkey] }] } },
    { id: "global", title: "グローバル", source: { kind: "literal", filters: [{ kinds: [1] }], relays: [...FALLBACK_RELAYS] } },
  ],
});
```

**`followees` 引数が消える。** 現在の `defaultDeck(viewerPubkey, followees)` は焼き込みのために受け取っていた。派生ソースにすれば不要になる —— これが 3.1 の変更が実際に何を単純にしたかの一例である。

3 本の設計意図は縦断スライスから変えない: `home` は Outbox ルーティング（このスライスの主目的）、`mine` はフォロー 0 人でも必ず映る対照群、`global` は明示リレーで Outbox をバイパスする経路。

### 3.3 バージョン 1 は受け付けない

`version` は 1 → 2。**version 1 のデッキは「壊れている」として扱い、既定デッキへ落とす。** 移行コードは書かない —— `loadDeck` の既存の契約（壊れていたら `undefined` を返し、呼び出し側が既定デッキへ落ちる）がそのまま使える。v1 は開発中であり、version 1 の値が存在するのは開発者の手元の localStorage だけである。

`version` フィールド自体は ADR-0013 の NIP-78 移行のために残す。バージョンを持たない形式は「今の形と違う」ことしか言えず「壊れている」と区別できない。

### 3.4 検証は valibot で書く

[ADR-0020](../../adr/0020-no-nostr-library-noble-primitives-only.md) の「ライブラリに依存しない」は **Nostr に関連する部分にだけかかる**（同 ADR「この ADR の射程」節）。localStorage の JSON を検証するのは Nostr の問題ではない。現在の `deck.ts` は `isDeck` / `isColumnDef` / `isNostrSource` / `isRelayFilter` として約 100 行の型ガードを手書きしているが、**valibot は既にこのリポジトリの依存にある**（`src/features/Column/libs/deckSchema/v0.ts`）。

`loadDeck` を valibot のスキーマ 1 つに置き換える。

**手書きから必ず持ち越す判断が 1 つある。** `isRelayFilter` は「`ids` / `authors` / `kinds` / `#tag` のどれも持たないフィルタを拒否する」という検査を持っている。これは型の話ではなく、**壊れたデッキから本物のリレーへの無制限購読（firehose）が生まれないための安全策**であり、レビューで足された経緯がある。valibot では `v.check()` として表現し、拒否理由をコメントに残すこと。

`NostrEvent` / `RelayFilter` そのもののワイヤ検証（`EventStore.put` の `isNostrEvent` など）は ADR-0020 のとおり自前のまま。**valibot に置き換えてよいのは永続化フォーマットの検証だけ**である。

`?relays=` のパース（`parse-relays.ts`）も valibot に寄せてよいが、必須ではない（入力が単純な文字列分割であり、現在のテストで十分に固定されている）。**判断は実装者に委ねる。どちらでも spec の要求は満たす。**

## 4. カラム種別

追加 UI が提供するのは 4 種別。

| 種別 | 入力 | `ColumnSource` |
|---|---|---|
| ホーム | なし | `{ kind: "followees", kinds: [1] }` |
| ユーザー | npub または hex | `{ kind: "literal", filters: [{ kinds: [1], authors: [pubkey] }] }` |
| ハッシュタグ | タグ文字列 | `{ kind: "literal", filters: [{ kinds: [1], "#t": [tag] }] }` |
| グローバル | なし | `{ kind: "literal", filters: [{ kinds: [1] }], relays: [...FALLBACK_RELAYS] }` |

**種別を増やすことが目的ではない。読み取り層の 4 つの異なる経路を 1 本ずつ通すことが目的である。**

- **ホーム** —— 派生 + Outbox ルーティング（多数の著者）
- **ユーザー** —— Outbox ルーティング（単一著者）。ルーティングが引けなければ `unroutableAuthors` に出る
- **ハッシュタグ** —— **`authors` を持たないフィルタの初めての実例。** `query-plan.ts` は `authors` が無いフィルタを「誰でもいい」として扱い、`selectRelays` には渡す著者が無い。実際にどのリレーへ行くのか（`fallbackRelays` に落ちるはず）を実地で確かめる価値がある
- **グローバル** —— 明示リレー（Outbox バイパス）。ADR-0026 で「常に見せる異常」が発生しうる唯一の種別でもある（7 節）

ユーザー種別の入力は npub と hex の両方を受ける。`src/core/nostr/nip19.ts` に薄いラッパを 1 つ足す。

```ts
/** npub または 64 桁 hex を受け、hex pubkey を返す。不正なら undefined */
export const decodeNpub = (input: string): string | undefined
```

タイトルは種別ごとの既定値を入れる（「ホーム」「@<npub の先頭 8 文字>」「#<tag>」「グローバル」）。ユーザーが後から編集できる。

## 5. カラムは 1 セクションである（決定）

**このスライスは「1 カラム = 1 セクション」を決定として記録する。** 現在の実装がそうなっているのは縦断スライスの仕様が「3 カラム」と書いていたからで、**判断としてはどこにも記録されていなかった**（2026-08-06 に発見）。

[ADR-0003](../../adr/0003-open-column-abstraction.md) は「イベントの配列」に収まらないケース（ユーザー詳細・スレッド・ブックマークセット・フォロー中一覧）を列挙し「抽象の妥当性はそこで決まる」として保留している。それらを検討すると、3 つの形に分かれる。

| 形 | 例 | 今の型で表現できるか |
|---|---|---|
| **1 本のリストに混ぜる** | 通知（メンション + リアクション + リポスト） | **できる。** `NostrSource.filters` は複数形で、NIP-01 は 1 つの REQ に複数フィルタを載せられる（OR）。混ぜたいなら順序も 500 件上限も 1 つであるべきで、これは 1 セクションが正しい形である |
| **構造を持つ** | スレッド | **できる。** `Order` に `thread-tree` があり（`source.ts`）、構造はセクションの内側に置く前提で型が作られている |
| **領域を積む** | ユーザー詳細（プロフィール + 固定ポスト + 投稿一覧） | **できない。** 下記 |

**「領域を積む」は既存のどの機構でも表現できない。** `filters` は NIP-01 のワイヤフィルタであり「何を取るか」しか言えない。複数フィルタは 1 本のストリームに混ざり、`Order` が並べる —— kind:0 を混ぜても `created_at` の位置に落ちるだけで最上部には固定されない。`needs`（ADR-0017）は「このイベントを描くのに他に何が要るか」であって「このカラムにどんな領域があるか」ではない。`thread-tree` が構造を解けているのは**1 つのメンバーシップ集合に対する順序**として表現できるからで、異質な領域の積み重ねは順序では表現できない。

**それでも A-1 では単数のままにする。** 「領域を積む」を今設計すると、必要になる形（1 カラム = 複数セクションか、セクションの外側にレイアウトの概念を足すか）を**実例なしに選ぶ**ことになる。このプロジェクトが外部レビューで指摘された失敗の再演である。A-1 の 4 種別はいずれも 1 本の時系列リストであり、2 本目のセクションを要求しない。

**ひっくり返す条件を明記する: ユーザー詳細カラムを作るとき。** それが「領域を積む」の最初の実例であり、A-2（レンダラと `needs`）でセクションとレンダラの境界を引く人が同時に決める。`Deck.version` はこの種の変更のための足場である。

## 6. 操作

- **追加** —— ヘッダの「+」でフォームを開き、種別を選び、必要な入力を入れて確定。`id` は `crypto.randomUUID()`
- **削除** —— カラムヘッダのメニューから。確認ダイアログは出さない（誤操作の被害は「作り直す」で済み、確認を挟むほうが 10 カラムの編集を重くする）
- **並べ替え** —— カラムヘッダの左右ボタン。**ドラッグ&ドロップは作らない** —— 実装も e2e も高く、A-1 の目的（カラムを増やして測る）には不要
- **タイトル編集** —— ヘッダのタイトルをクリックしてインライン編集
- **永続化** —— 変更のたびに `saveDeck` して localStorage へ書く。キーは既存の `deckStorageKey(pubkey)`（アカウントごと）

デッキが 0 カラムになることは許す。「+ でカラムを追加してください」という空状態を出す。

## 7. 異常の表示

[ADR-0026](../../adr/0026-actionable-errors-visible-diagnostics-behind-developer-mode.md) に従う。**常に見せるのはユーザーが行動できる異常だけ。行動できない診断値は開発者モードの背後。**

判定は 1 箇所に集める。カラムの実装に散らさない。

```ts
// src/core/deck/column-alerts.ts
export type ColumnAlert = {
  /** ヘッダのアイコンを押したときに出る一行 */
  message: string;
  /** ユーザーが取れる行動 */
  action: string;
};

export const columnAlerts = (
  column: ColumnDef,
  status: SectionStatus,
): ColumnAlert[]
```

**A-1 で発生する Alert は 1 種類だけである。**

> **明示リレーを指定したカラムで、`status.incomplete.unreachableRelays` が 0 より大きい。**
> message: 「指定したリレーに接続できません」
> action: 「カラムの設定でリレーの URL を確認してください」

`source.kind === "literal" && source.relays !== undefined` のときだけ成立する。ユーザーが自分で URL を指定したのだから直せる。

**Alert にならないもの（すべて診断値）:**

- Outbox が選んだリレーの `unreachableRelays` —— ユーザーはどのリレーが選ばれたかを指定していないし、変えられない
- `unroutableAuthors` —— `kind:10002` を公開していない著者。ユーザーには何もできない
- `uncoveredAuthors` —— 接続予算の超過。「カラムを減らす」は一応の行動だが、こちらから促したい行動ではない

アイコンは `incomplete` 専用ではなく、**そのカラムに起きた異常全般の入口**である。A-2 以降でレンダラの失敗や未知の kind が出てきたら同じ場所に集まる。Alert が 0 件ならアイコンを出さない。

`status.incomplete` の値そのものは、開発者モードの有無に関わらず常に正しく計算される（ADR-0026 の「値を計算し続けること」）。

## 8. 開発者モード

```ts
// src/core/settings/developer-mode.ts
export const DEVELOPER_MODE_STORAGE_KEY = "streets.v1.developerMode";
export const loadDeveloperMode = (raw: string | null): boolean;
export const saveDeveloperMode = (enabled: boolean): string;
```

端末ごとの設定であり、既定は無効。**アカウントごとではない** —— どの端末で開発者として見ているかはアカウントの設定ではないので、`deckStorageKey` のような pubkey の継ぎ足しはしない。

**A-1 では設定画面を作らず、デッキヘッダの隅のトグルにする。** 設定画面はフェーズ C。

有効なときに出るもの（すべて `/v1-preview` に今あるものの移設。**捨てない** —— 実鍵での検証はこれらが読めることに依存している）:

- ヘッダ: `connections` / `peakConnections` / `optimistic-insert-ms`
- カラムごと: `phase` と `incomplete` の 3 数値
- ヘッダ: `unrequestedEventsByRelay`（リレーごとの、フィルタに合わないイベントの受信数）

`data-testid` は現在のものをそのまま引き継ぐ（`connections` / `peak-connections` / `deck-column-phase` / `deck-column-incomplete` / `optimistic-insert-ms`）。名前を変える理由が無く、実鍵での検証手順もこの名前で書かれている。

**`/debug/v1-section` は開発者モードの対象外。** ADR-0026 が定めているのはユーザーが使う画面の話であり、`/debug/` 以下は経路自体が開発者専用である。二重に隠す意味は無く、隠すと `connection-budget.spec.ts` / `section-cap.spec.ts` を無意味に壊す。**この 2 つの e2e は変更しなくてよい**（どちらも `/debug/v1-section` を見ており、`/v1-preview` の診断値には触れていない —— 2026-08-07 に確認）。

## 9. 投稿フォームと楽観挿入

現在の実装をそのまま残す。**唯一の書き込み経路であり、これが無いとデッキを実地で使えない。**

楽観挿入（署名直後に `setOptimisticEvents` へ入れ、`DeckColumn` が `matchesAnyFilter` で自分のカラムに合う分だけ重ねる）も現在の形を維持する。計測値 `optimistic-insert-ms` は開発者モード側へ移す。

## 10. エラー処理

| 起きること | 扱い |
|---|---|
| localStorage のデッキが壊れている / version 1 | `loadDeck` が `undefined`。既定デッキへ落ちる。ユーザーには何も出さない |
| ユーザー種別に不正な npub / hex | フォームがその場で拒否し、追加させない。カラムは作られない |
| ハッシュタグが空文字 | 同上 |
| `warmUpRouting` はそもそも失敗しない（最終レビュー Minor 6 で訂正: `collect()` は `new Promise((resolve) => ...)` でタイムアウト経由にせよ settle 経由にせよ必ず resolve し、reject する経路が無い。`src/core/read/collect.ts` 参照） | 到達しない状態のため、読む側のコードも不要。フォローリストが薄い/空でもホーム列は著者 0 人として動き続け、他の種別は元々無関係 |
| 明示リレーが到達不能 | 7 節の Alert |
| NIP-07 拡張が無い | 現在と同じ `SignerUnavailableError` の表示 |
| 投稿の publish が全リレーで失敗 | 現在と同じ `PublishResult` の表示 |

このアプリに `ErrorBoundary` は無い。**壊れた入力は境界（`loadDeck`、追加フォーム）で弾いて白画面を防ぐ**という既存の設計を守る。

## 11. テスト

**ユニット（vitest）**

- `resolveSource` —— `literal` が `relays` の有無で正しい `NostrSource` を作ること、`followees` が context のフォローリストを展開すること、**空のフォローリストで `authors: []` になること**（`authors` を落として firehose にしない）
- `loadDeck` —— version 2 を受ける / version 1 を拒否する / 壊れた JSON を拒否する / scoping フィールドの無いフィルタを拒否する
- `columnAlerts` —— 明示リレー + `unreachableRelays > 0` で 1 件返す / Outbox 経路では `unreachableRelays > 0` でも 0 件 / `uncoveredAuthors > 0` だけでは 0 件
- `decodeNpub` —— npub / hex / 不正入力
- `loadDeveloperMode` —— 未設定は false / 壊れた値は false

**E2E（Playwright、ローカル docker リレー）**

- カラムを追加 → リロード → 復元されている
- カラムを削除 → リロード → 消えたまま
- カラムを並べ替え → リロード → 順序が保たれている
- **開発者モードが無効のとき `deck-column-phase` / `deck-column-incomplete` / `connections` が DOM に存在しない**
- 有効にすると出る

開発者モードを有効にした状態で開くには `page.addInitScript` で `localStorage` に `streets.v1.developerMode` を書く。**新しい e2e のためのヘルパーであり、既存の e2e を直すためのものではない**（8 節のとおり、既存の 2 つは `/debug/v1-section` を見ている）。

**既存 e2e の修正が要るのは `v1-preview.spec.ts` だけ。** ルート名が `/v1-preview` → `/v1` に変わり、`defaultDeck` のシグネチャと `Deck.version` も変わる。診断値は読んでいないので開発者モードとは無関係。ファイル名も `v1.spec.ts` に改める。

テストは捕まえる変異を明記し、実際にその変異を入れて落ちることを確認すること（このリポジトリの規律）。

## 12. 実際に動かして初めて答えられる問い

**このスライスの本当の成果物はここへの回答である。** 実装完了時に `docs/design/read-layer-followups.md` へ書く。推測は書かない。分からなかったものは「分からなかった」と書く。

1. **30 接続予算は 5〜10 カラムで成立するか。** 実鍵の 3 カラムはピーク 10 だった（[followups](../../design/read-layer-followups.md) 問い2）。カラム数と接続数の関係は線形ではない（Outbox は著者の重なりで畳まれる）ので推測できない。`peakConnections` を読むこと
2. **`createSection` に画面外カラムの休止・優先度・破棄が要るか。** followups が「10 カラムのうち実際に見えているのは数列だけ、という事実が 30 接続予算と噛み合うかを実測してから決める」として保留している API 判断
3. **`warmUpRouting` → `NostrSource` の約 15 行のパターンの 3 箇所目が出るか。** 縦断スライスが「3 箇所目が出たら共通化する」と決めた条件。`/v1-preview` を置き換えるなら呼び出しは 2 箇所のままなので、**出ないという答えも答えである**
4. **派生ソースは `followees` だけで足りたか。** 4 種別を実装して、2 つ目の派生が欲しくなった場面があったか
5. **4 種別のどれかが 2 本目のセクションを欲しがったか。** 5 節の決定（1 カラム = 1 セクション）を実地で試す。欲しがったなら、それが A-2 の設計入力になる
6. **ハッシュタグ（`authors` の無いフィルタ）は実際にどこへ繋いだか。** `query-plan.ts` / `selectRelays` がこの形をどう扱うかは、コードから読めば分かるが実地で確かめたことがない
