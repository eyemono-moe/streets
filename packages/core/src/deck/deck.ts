import * as v from "valibot";
import { encodeBech32 } from "../nostr/nip19";
import type { RelayFilter, RelayUrl } from "../relay/relay-connection";
import { buildColumn, buildRelayColumn } from "./column-presets";

/**
 * デッキが保存する「意図」。フォローリストのような変わる値を焼き込まない
 * ため `NostrSource` (クエリ) とは別物にしており、`resolveSource` が唯一の変換場所になる。
 */
export type ColumnSource =
  | { kind: "literal"; filters: RelayFilter[]; relays?: RelayUrl[] }
  /**
   * 言葉から探す。問い合わせ先は設定（kind:10007）で変わるので、デッキには
   * 書いた条件だけを残し、リレーは解決のたびに決める。
   */
  | { kind: "search"; query: string }
  | { kind: "followees"; kinds: number[] }
  | { kind: "notifications" }
  | { kind: "bookmarks" }
  /** 1 本のスレッド。`focus` を中心に、その祖先と返信を見せる。 */
  | { kind: "thread"; focus: string }
  /** 1件の投稿に対するリポスト・引用・リアクション。 */
  | { kind: "activity"; target: string }
  | { kind: "user"; pubkey: string }
  | { kind: "followees-list"; pubkey: string }
  | { kind: "followers-list"; pubkey: string };

/** カラムの幅。数値ではなく段で持ち、実際の px は画面側が決める。 */
export type ColumnWidth = "s" | "m" | "l";

/** 1 件あたりの余白と文字の大きさ。`Event` の size と同じ意味。 */
export type ColumnDensity = "comfortable" | "compact";

/**
 * そのカラムに何を流すか。保存された値が無いときは全て true として扱う
 * （既存のデッキが黙って中身を失わないため）。
 */
export type ColumnShow = {
  replies: boolean;
  /** 引用（NIP-18 の `q`）。通知カラムで「引用されたことを知らせるか」を決めるのに要る。 */
  quotes: boolean;
  /** 自分宛だが返信でも引用でもない投稿。自分宛を集めるカラムでしか意味を持たない。 */
  mentions: boolean;
  reposts: boolean;
  reactions: boolean;
  /** Zap の受領（kind:9735）。通知カラムでしか意味を持たない。 */
  zaps: boolean;
};

/**
 * 本文のリンクをどう見せるか。`compact` は小さな画像を横に並べ、`large` は画像を
 * 上に大きく出す。`off` はカードを出さず、本文のリンクだけにする。
 */
export type LinkCardMode = "off" | "compact" | "large";

export type ColumnDef = {
  id: string;
  title: string;
  source: ColumnSource;
  width?: ColumnWidth;
  density?: ColumnDensity;
  show?: Partial<ColumnShow>;
  /** 画像を展開するか。何を流すかではなく、どう見せるかなので `show` とは分ける。 */
  expandMedia?: boolean;
  /** 保存された値が無いときは `compact`（`columnLinkCards`）。 */
  linkCards?: LinkCardMode;
  /**
   * 通知カラムで、同じノートへの連続したリアクション・リポストを 1 行にまとめるか。
   * 保存された値が無いときはまとめる（`groupsNotifications`）。
   */
  groupNotifications?: boolean;
};

export const columnLinkCards = (column: ColumnDef): LinkCardMode =>
  column.linkCards ?? "compact";

/** 通知をまとめるか。通知カラムだけが意味を持つ。 */
export const groupsNotifications = (column: ColumnDef): boolean =>
  column.source.kind === "notifications" && column.groupNotifications !== false;

export const DEFAULT_COLUMN_SHOW: ColumnShow = {
  replies: true,
  quotes: true,
  mentions: true,
  reposts: true,
  reactions: true,
  zaps: true,
};

/** 保存された値と既定値を合わせる。カラムを読む側はこれだけを見る。 */
export const columnShow = (column: ColumnDef): ColumnShow => ({
  ...DEFAULT_COLUMN_SHOW,
  ...column.show,
});

/**
 * 「誰かの投稿を時系列で並べる」列が集める kind。kind:6 はタイムラインへ
 * 流したものとして含め、kind:16 は対象外コンテンツで意図が曖昧になるため除外。
 */
export const TIMELINE_KINDS: readonly number[] = [1, 6];

/**
 * 通知カラムが集める kind。kind:16 は表示不能だからではなく (対応済み)、
 * v1 がまだ長文を作れず e2e で確かめられないため外す (別の判断)。
 */
export const NOTIFICATION_KINDS: readonly number[] = [1, 6, 7, 9735];

/**
 * `version` は NIP-78 移行のために残す (無いと壊れているのか形が違う
 * だけか区別できない)。version 1 は開発者の手元にしか無いため移行コードは書かない。
 */
export type Deck = {
  version: 2;
  columns: ColumnDef[];
  /** 見た目のうち、アカウントに保存するもの（どの端末でも同じ色にする）。無ければ既定の色。 */
  appearance?: DeckAppearance;
};

/** テーマ色の元になる 2 色。50〜950 の段は画面側がこの 2 色から作る。`#rrggbb`。 */
export type DeckAppearance = { accent: string; ui: string };

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
 * 組んでいないため必須)。新規ユーザーは誰もフォローしておらずホームが空なので、
 * 入口で見ていたリレーの流れを間に置く。
 */
export const defaultDeck = (relays: readonly RelayUrl[]): Deck => {
  const relayColumn = buildRelayColumn(relays);
  return {
    version: 2,
    columns: [
      // `buildColumn` は不正入力で `undefined` を返すが、既定デッキは不正入力が無いので `!` で良い。
      buildColumn("home", "")!,
      // リレーが 0 本だと列を作れない。そのときはホームと通知だけにする。
      ...(relayColumn ? [relayColumn] : []),
      // 同上。
      buildColumn("notifications", "")!,
    ],
  };
};

/** デッキを保存する kind:30078 の `d` タグ。 */
export const DECK_EVENT_IDENTIFIER = "moe.eyemono.streets/deck";

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
    kind: v.literal("bookmarks"),
  }),
  v.object({
    kind: v.literal("thread"),
    focus: v.pipe(v.string(), v.regex(/^[0-9a-f]{64}$/)),
  }),
  v.object({
    kind: v.literal("activity"),
    target: v.pipe(v.string(), v.regex(/^[0-9a-f]{64}$/)),
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
  v.object({
    kind: v.literal("search"),
    query: v.pipe(v.string(), v.minLength(1)),
  }),
]);

const columnDefSchema = v.object({
  id: v.pipe(v.string(), v.minLength(1)),
  title: v.pipe(v.string(), v.minLength(1)),
  source: columnSourceSchema,
  width: v.optional(v.picklist(["s", "m", "l"])),
  density: v.optional(v.picklist(["comfortable", "compact"])),
  expandMedia: v.optional(v.boolean()),
  // 知らない値（新しい版が足した見せ方）でカラムごと捨てない。既定の見せ方に戻す。
  linkCards: v.fallback(
    v.optional(v.picklist(["off", "compact", "large"])),
    undefined,
  ),
  groupNotifications: v.optional(v.boolean()),
  show: v.optional(
    v.object({
      replies: v.optional(v.boolean()),
      quotes: v.optional(v.boolean()),
      mentions: v.optional(v.boolean()),
      reposts: v.optional(v.boolean()),
      reactions: v.optional(v.boolean()),
      zaps: v.optional(v.boolean()),
    }),
  ),
});

const hexColorSchema = v.pipe(v.string(), v.regex(/^#[0-9a-fA-F]{6}$/));

/**
 * 読めないカラムは、そのカラムだけ捨てる。1 本のせいでデッキ全体が読めなく
 * なると、並びも設定も丸ごと失う —— 新しい版のアプリで足したカラム（この版が
 * 知らない種類）を、古い版で開いたときに実際に起きた。
 */
const columnListSchema = v.pipe(
  v.array(v.unknown()),
  v.transform((columns) =>
    columns.flatMap((column) => {
      const parsed = v.safeParse(columnDefSchema, column);
      if (parsed.success) return [parsed.output];
      console.warn("読めないカラムを飛ばしました", column);
      return [];
    }),
  ),
);

const deckSchema = v.object({
  version: v.literal(2),
  columns: columnListSchema,
  // 色が壊れていても、デッキ（カラムの並び）ごと捨てない。色だけ既定に戻す。
  appearance: v.fallback(
    v.optional(v.object({ accent: hexColorSchema, ui: hexColorSchema })),
    undefined,
  ),
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
