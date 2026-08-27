# Storybook と EventScene — 設計

## 0. このスライスは何のためにあるか

v1 のイベント表示は、実ブラウザで確認するたびにローカルリレーを起動し、
秘密鍵から署名済みイベントを作って seed する必要がある。kind:1 単体だけなら
耐えられるが、プロフィール、引用、リポスト、リアクション、祖先と返信を含む
スレッドでは、確認したい見た目よりも fixture の配送準備へ時間を使っている。

Storybook を Solid + Vite で導入し、本番の EventStore、defaultRenderers、
RenderProvider、EventView、ThreadView をリレーなしで動かす。Story の作者が
知るのはイベントの関係と表示対象だけとし、署名、Store、requests、context の
組み立ては EventScene module の内側へ隠す。

## 1. Storybook の位置づけ

Storybook は次の三つを担当する。

- kind ごと、variant ごと、関連イベントの有無ごとの表示確認
- Penpot のパターンを実際の Solid / Ark UI で確認する UI カタログ
- hard-to-reach state（取得中、取得失敗、祖先欠落、ミュート）の再現

Vitest は純粋関数と描画契約の厳密な主張、Playwright は実リレー・購読・永続化を
含む縦断確認を引き続き担当する。既存テストを Story へ移さない。画像差分 CI と
Storybook の外部公開もこのスライスには含めない。

## 2. EventScene の interface

Story ごとに RenderContextValue の全フィールドを作らせない。次の小さい interface
を Storybook 専用 module に置く。

```ts
type EventScene = {
  events: readonly NostrEvent[];
  viewerPubkey?: string;
  unresolvedEventIds?: readonly string[];
  mutes?: readonly MuteEntry[];
};

type EventSceneProviderProps = {
  scene: EventScene;
  children: JSX.Element;
};
```

Provider は scene から次を作る。

- 永続化しない EventStore
- defaultRenderers を持つ RenderContextValue
- 外部接続を行わない EventRequests / ProfileRequests / ReactionRequests
- ThreadNavProvider
- 必要な場合だけ、mutes から表示専用 MuteList を作って重ねる MuteListProvider

events は実際に EventStore.put() へ通し、Storybook のために本番 Store へ
無検証挿入の入口を増やさない。unresolvedEventIds は EventView の
「読み込めませんでした」を作るために request adapter が参照する。それ以外の
Store に無い id は「読み込み中」のままにする。

## 3. イベント fixture

Story の作者は秘密鍵、pubkey、id、sig を直接書かない。名前付き著者を作る
factory が、固定鍵から有効なイベントを同期生成する。

```ts
const alice = createStoryAuthor(1, { name: "alice", displayName: "Alice" });
const bob = createStoryAuthor(2, { name: "bob", displayName: "Bob" });
const root = alice.note("root");
const reply = bob.reply("reply", { parent: root });
```

note / reply / quote / repost / reaction は可能な限り本番のイベントビルダを使う。
fixture 固有コードが NIP のタグ規則を二重実装しない。created_at は明示値または
factory 内の決定的な値とし、Story の再読み込みで表示順やスナップショットが
変わらないようにする。

署名は fixture factory の実装詳細であり、NIP-07 / NIP-46 は使わない。これは
「秘密鍵をアプリが持たない」という本番境界を変えない。Storybook bundle に入る
のは開発専用の stories と fixture module だけで、本番 entry から import しない。

## 4. 最初の Story

### EventView

- kind:1: plain、content tokens、返信、引用、リアクション付き、compact / full
- kind:6: 対象あり、対象取得中、対象取得失敗
- kind:7: `+`、Unicode emoji、custom emoji
- 未登録 kind の fallback
- ミュート済みイベント

### ThreadView

- root → focus → 直接返信
- 多段の祖先
- focus への複数返信
- 祖先取得中
- settle 後も祖先が欠けた状態

表示の網羅を優先し、同じ差を unit test として重複主張しない。Story のデータを
組み立てる factory と Provider の分岐は Vitest で直接検証する。

## 5. 見た目の共有

Storybook preview は本体と同じ reset、UnoCSS、Noto Sans JP を読み込む。
キャンバスには本体の bg.primary / text.primary と同じクラスを当てる。
Light / Dark は toolbar の global で切り替え、`dark` class を preview root へ
反映する。

EventView はカラム幅 380px を基準に確認できる decorator を持つ。ThreadView も
同じ幅で表示し、幅の違いで折返しが本体とずれないようにする。

## 6. 検証入口

```sh
pnpm storybook
pnpm storybook:build
```

静的 build を `pnpm verify` に含める。Storybook の設定や story の型が壊れたまま
通常 CI だけ通る状態を作らない。`verify:all` は従来どおり verify の後に
Playwright を実行する。

## 7. 範囲外

- Storybook のホスティング
- Chromatic 等の画像差分サービス
- screenshot を必須 CI にすること
- addon-vitest への既存テスト移行
- Storybook MCP
- Settings と UI パターンキット本体（この基盤の次のスライス）
