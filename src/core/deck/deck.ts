import * as v from "valibot";
import { FALLBACK_RELAYS } from "../read/default-relays";
import type { RelayFilter, RelayUrl } from "../relay/relay-connection";

/**
 * デッキが保存する「意図」。`NostrSource` (読み取り層が理解する「クエリ」)
 * とは別物にしているのは、フォローリストのような**変わる値をデッキに
 * 焼き込まない**ため —— `resolve-source.ts` の `resolveSource` が唯一の
 * 変換場所になる。
 */
export type ColumnSource =
  | { kind: "literal"; filters: RelayFilter[]; relays?: RelayUrl[] }
  | { kind: "followees"; kinds: number[] }
  | { kind: "notifications" }
  | { kind: "user"; pubkey: string }
  | { kind: "followees-list"; pubkey: string }
  | { kind: "followers-list"; pubkey: string };

export type ColumnDef = { id: string; title: string; source: ColumnSource };

/**
 * 「誰かの投稿を時系列で並べる」列が集める kind。ホーム列とユーザー列が
 * これを使う。
 *
 * **リポスト (kind:6) を含めるのは v0 と同じ** ——
 * `features/Column/components/Column/Followings.tsx` と `User.tsx` が
 * どちらも `[ShortTextNote, Repost]` を購読している。リポストは
 * 「その人がタイムラインへ流したもの」であり、本人の kind:1 と同じ列に
 * 並ぶのが元の挙動である。
 *
 * **kind:16 (汎用リポスト) は含めない。** v0 が集めていないのに加え、
 * kind:16 の対象は kind:1 以外 (長文記事など) であり、短文の列へ混ぜると
 * その列が何を見せる列なのかが曖昧になる。`EventView` はレンダラを対象
 * イベント自身の kind から選ぶので描画側は 16 を扱えるが、**集めるか
 * どうかは列の意図の問題であって描画能力の問題ではない。**
 *
 * ハッシュタグ列とグローバル列には足さない。リポストは元イベントの `t`
 * タグを引き継がないのでハッシュタグ列では増えず、グローバル列は元から
 * 流量が多いので足す判断は別に要る。
 */
export const TIMELINE_KINDS: readonly number[] = [1, 6];

/**
 * 通知カラムが集める kind (仕様 2 節)。
 *
 * kind:16 (汎用リポスト) を入れないのは、表示できないからではない ——
 * `Repost.tsx` は 16 で登録済みで、ここに 16 と書けばそれだけで並ぶ。
 * 対象が kind:1 以外 (長文など) で v1 はまだそれを作れず、開発中に自分で
 * 再現できないため e2e で動作を確かめられない
 * (`docs/design/read-layer-followups.md`「通知に kind:16 を含めること」)。
 *
 * `TIMELINE_KINDS` が 16 を外す理由 (短文の列へ長文を混ぜない) とは別の
 * 判断であることに注意 —— 通知は種類を混ぜる場所なので、あちらの理由は
 * ここには効かない。
 */
export const NOTIFICATION_KINDS: readonly number[] = [1, 6, 7];

/**
 * `version` は ADR-0013 の NIP-78 移行のために残す。バージョンを持たない
 * 形式は「今の形と違う」ことしか言えず「壊れている」と区別できない。
 *
 * 1 → 2 の移行コードは書かない。version 1 は `loadDeck` が「壊れている」
 * として弾き、呼び出し側が既定デッキへ落ちる —— v1 は開発中であり、
 * version 1 の値が存在するのは開発者の手元の localStorage だけである。
 */
export type Deck = { version: 2; columns: ColumnDef[] };

/**
 * localStorage キーの接頭辞。**単独では使わない** —— `deckStorageKey()` で
 * 閲覧者の pubkey を必ず継ぎ足すこと。
 *
 * かつてはこれ自体が唯一のキーで、全アカウント共通の 1 本の保存先だった
 * (final review, Important 3)。それだと A でログインして保存されたデッキを
 * B が無条件に読み込んでしまう —— `home` 列に焼き込まれた followees も
 * `mine` 列の著者フィルタも A のものなのに、ヘッダーには B の pubkey が出て
 * 投稿フォームも B として投稿する、というアカウント境界の穴になる。
 * `docs/design/read-layer-followups.md` は「`EventStore` のアカウント境界」を
 * 縦断スライスの**前に**決めるべき事項として挙げていたが、spec がそれを
 * 拾わなかった。ここで最小限 (pubkey でキーを分けるだけ) に閉じる ——
 * セッション/グローバルを含む三分類の設計はこの修正の範囲外。
 */
const DECK_STORAGE_KEY_PREFIX = "streets.v1.deck";

/**
 * 閲覧者ごとに独立した localStorage キーを作る。同じキーを複数アカウントで
 * 共有すると、後からログインしたアカウントが前のアカウントのデッキ
 * (followees や自分の著者フィルタを含む) をそのまま引き継いでしまう
 * (final review, Important 3)。
 */
export const deckStorageKey = (pubkey: string): string =>
  `${DECK_STORAGE_KEY_PREFIX}.${pubkey}`;

/**
 * 初回起動時 (localStorage に何も無い、または壊れている) の既定デッキ。
 * ADR-0009 が「既定デッキは必須要件」としている —— モバイルから初めて
 * 訪れたユーザーはデスクトップでデッキを組んでいないため。
 *
 * 3 本の設計意図が違う:
 * - `home`: 派生ソース + Outbox ルーティング。**かつてここで followees を
 *   フィルタへ焼き込んでいたため、この引数が必要だった** —— 派生ソースに
 *   したことで引数ごと不要になった。
 * - `mine`: 単一著者。フォロー 0 人でも自分の投稿だけは必ず映る、
 *   ルーティングの成否を切り分けるための対照群。
 * - `global`: 明示リレー。Outbox をバイパスする経路が実際に機能することを
 *   見せる。
 */
export const defaultDeck = (viewerPubkey: string): Deck => ({
  version: 2,
  columns: [
    {
      id: "home",
      title: "ホーム",
      source: { kind: "followees", kinds: [...TIMELINE_KINDS] },
    },
    {
      id: "mine",
      title: "自分の投稿",
      source: {
        kind: "literal",
        filters: [{ kinds: [...TIMELINE_KINDS], authors: [viewerPubkey] }],
      },
    },
    {
      id: "global",
      title: "グローバル",
      source: {
        kind: "literal",
        filters: [{ kinds: [1] }],
        relays: [...FALLBACK_RELAYS],
      },
    },
  ],
});

export const saveDeck = (deck: Deck): string => JSON.stringify(deck);

/**
 * NIP-01 のフィルタ。**これはワイヤ形式の検証ではなく、localStorage に
 * 保存されたデッキの検証である** —— ADR-0020 が自前実装を求めているのは
 * 前者だけで、永続化フォーマットの検証に valibot を使うことは同 ADR の
 * 「この ADR の射程」節で明示的に許されている。
 *
 * `#<tag>` の任意キー (NIP-01) を落としたくないので `looseObject` +
 * 手書き `check` で試したが、`looseObject` の余剰キーは型として
 * `[key: string]: unknown` になり、`RelayFilter` が要求する
 * `[tag: \`#${string}\`]: string[] | undefined` と噛み合わない
 * (`unknown` は `string[] | undefined` に代入できない) —— `pnpm typecheck`
 * が `result.output` を `Deck` へ代入できないと言って落ちた。`as Deck` で
 * 握り潰さず、`objectWithRest` で余剰キーの値そのものを `string[]` に
 * 縛ることで型を一致させた。副作用として `#<tag>` 以外の余剰キーも
 * `string[]` を要求するようになるが、NIP-01 のフィルタに `#<tag>` 以外の
 * 余剰キーが乗ることは想定していないので実害はない。
 */
const relayFilterSchema = v.pipe(
  v.objectWithRest(
    {
      ids: v.optional(v.array(v.string())),
      authors: v.optional(v.array(v.string())),
      kinds: v.optional(v.array(v.number())),
      since: v.optional(v.number()),
      until: v.optional(v.number()),
      limit: v.optional(v.number()),
      search: v.optional(v.string()),
    },
    v.array(v.string()),
  ),
  // `ids`/`authors`/`kinds`/`#tag` のどれも無いフィルタは「誰の・何を
  // 問わない」= 無制限購読 (firehose) になる。`{}` だけでなく
  // `{ since: 123 }` のような形も同じ穴 —— `since`/`until`/`limit`/`search`
  // はクエリを絞り込みはするが、誰の・何のイベントかという範囲そのものは
  // 定めない。壊れたデッキから偶然この形が出てきて、本物のリレーへの
  // 無制限購読として通ってしまう実害のほうが大きいので、永続化された
  // デッキのフィルタとしては受け付けない。
  v.check(
    (filter) =>
      filter.ids !== undefined ||
      filter.authors !== undefined ||
      filter.kinds !== undefined ||
      Object.keys(filter).some((key) => key.startsWith("#")),
    "scoping フィールドを 1 つも持たないフィルタは無制限購読になる",
  ),
);

const columnSourceSchema = v.variant("kind", [
  v.object({
    kind: v.literal("literal"),
    filters: v.array(relayFilterSchema),
    relays: v.optional(v.array(v.string())),
  }),
  v.object({
    kind: v.literal("followees"),
    kinds: v.array(v.number()),
  }),
  v.object({
    kind: v.literal("notifications"),
  }),
  v.object({
    kind: v.literal("user"),
    pubkey: v.pipe(v.string(), v.regex(/^[0-9a-f]{64}$/)),
  }),
  v.object({
    kind: v.literal("followees-list"),
    pubkey: v.pipe(v.string(), v.regex(/^[0-9a-f]{64}$/)),
  }),
  v.object({
    kind: v.literal("followers-list"),
    pubkey: v.pipe(v.string(), v.regex(/^[0-9a-f]{64}$/)),
  }),
]);

const columnDefSchema = v.object({
  id: v.pipe(v.string(), v.minLength(1)),
  title: v.pipe(v.string(), v.minLength(1)),
  source: columnSourceSchema,
});

const deckSchema = v.object({
  version: v.literal(2),
  columns: v.array(columnDefSchema),
});

/**
 * `raw` は外部入力 —— `EventStore` がリレーからの値を `isNostrEvent` で
 * 確かめているのと同じ理由で、localStorage の値も信用しない。
 * ユーザーが手で書き換える、旧バージョンの形が残る、別のスクリプトが
 * 同じキーを使う、のどれが起きても JSON.parse の結果をそのままキャスト
 * せず、構造を実際に確かめてから返す。壊れていれば例外を投げず
 * `undefined` を返す (呼び出し側が既定デッキへ落ちられるように)。
 */
export const loadDeck = (raw: string | null): Deck | undefined => {
  // 「未保存」を明示的に表現する早期リターン。`JSON.parse(null)` は実は
  // 例外を投げない (`null` が `ToString` で `"null"` に強制変換され、JSON の
  // null リテラルとして正しくパースされて `null` を返す) —— この早期
  // リターンが無くても、その `null` は下の valibot のスキーマ検証で
  // 結局弾かれる。ここが本当に守っているのは「raw が無い」という呼び出し側
  // の意図を、JSON.parse の型強制という偶然の挙動任せにしないこと。
  if (raw === null) return undefined;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }

  const result = v.safeParse(deckSchema, parsed);
  return result.success ? result.output : undefined;
};
