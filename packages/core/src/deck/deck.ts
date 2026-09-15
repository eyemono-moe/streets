import * as v from "valibot";
import { encodeBech32 } from "../nostr/nip19";
import { FALLBACK_RELAYS } from "../read/default-relays";
import type { RelayFilter, RelayUrl } from "../relay/relay-connection";

/**
 * デッキが保存する「意図」。フォローリストのような変わる値を焼き込まない
 * ため `NostrSource` (クエリ) とは別物にしており、`resolveSource` が唯一の変換場所になる。
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
 * 「誰かの投稿を時系列で並べる」列が集める kind。kind:6 はタイムラインへ
 * 流したものとして含め、kind:16 は対象外コンテンツで意図が曖昧になるため除外。
 */
export const TIMELINE_KINDS: readonly number[] = [1, 6];

/**
 * 通知カラムが集める kind。kind:16 は表示不能だからではなく (対応済み)、
 * v1 がまだ長文を作れず e2e で確かめられないため外す (別の判断)。
 */
export const NOTIFICATION_KINDS: readonly number[] = [1, 6, 7];

/**
 * `version` は NIP-78 移行のために残す (無いと壊れているのか形が違う
 * だけか区別できない)。version 1 は開発者の手元にしか無いため移行コードは書かない。
 */
export type Deck = { version: 2; columns: ColumnDef[] };

/**
 * localStorage キーの接頭辞。単独では使わない —— pubkey を継ぎ足さないと、
 * 後からログインしたアカウントが前のアカウントのデッキを引き継いでしまう。
 */
const DECK_STORAGE_KEY_PREFIX = "streets.v1.deck";

/**
 * 閲覧者ごとに独立したキーを作る。同じキーを複数アカウントで共有すると、
 * 後からログインしたアカウントが前のアカウントのデッキを引き継いでしまう。
 */
export const deckStorageKey = (pubkey: string): string =>
  `${DECK_STORAGE_KEY_PREFIX}.${pubkey}`;

/**
 * 初回起動時の既定デッキ (モバイル初回訪問者はデスクトップでデッキを
 * 組んでいないため必須)。`home` は派生ソース、`mine` はフォロー数に
 * よらず自分の投稿が映るかの対照群、`global` は Outbox バイパスの証明。
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
 * NIP-01 フィルタの検証。ワイヤ形式でなく保存デッキ用なので valibot 可。
 * `looseObject` でなく `objectWithRest` を使うのは余剰キー型の不一致のため。
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
  // ids/authors/kinds/#tag が全て無いフィルタ ({} や { since: 123 } など) は無制限購読になるため受け付けない。
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

const migrateLegacyUserColumn = (column: ColumnDef): ColumnDef => {
  if (
    column.source.kind !== "literal" ||
    column.source.relays !== undefined ||
    column.source.filters.length !== 1
  ) {
    return column;
  }
  const filter = column.source.filters[0];
  const filterKeys = filter ? Object.keys(filter) : [];
  const pubkey = filter?.authors?.length === 1 ? filter.authors[0] : undefined;
  if (
    !pubkey ||
    !/^[0-9a-f]{64}$/.test(pubkey) ||
    filterKeys.length !== 2 ||
    !filterKeys.includes("authors") ||
    !filterKeys.includes("kinds") ||
    column.title !== `@${encodeBech32("npub", pubkey).slice(0, 12)}` ||
    filter.kinds?.length !== TIMELINE_KINDS.length ||
    !TIMELINE_KINDS.every((kind) => filter.kinds?.includes(kind))
  ) {
    return column;
  }
  return { ...column, source: { kind: "user", pubkey } };
};

/**
 * `raw` は外部入力 (手書き改変や旧バージョンの形もあり得る) なので、
 * `isNostrEvent` と同じ理由で検証し、壊れていれば `undefined` を返す。
 */
export const loadDeck = (raw: string | null): Deck | undefined => {
  // JSON.parse(null) は例外を投げず null を返すため、valibot 任せにせず「raw が無い」意図を明示する。
  if (raw === null) return undefined;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }

  const result = v.safeParse(deckSchema, parsed);
  return result.success
    ? {
        ...result.output,
        columns: result.output.columns.map(migrateLegacyUserColumn),
      }
    : undefined;
};
