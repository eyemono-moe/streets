import * as v from "valibot";
import { encodeBech32 } from "../nostr/nip19";
import type { RelayUrl } from "../relay/relay-connection";
import {
  type ColumnSource,
  TIMELINE_KINDS,
  columnSourceSchema,
} from "./column-kinds";
import { buildColumn, buildRelayColumn } from "./column-presets";

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
  /**
   * チャンネル（NIP-28）での発言。通知では自分への返信・メンション、ホームでは
   * フォローしている人の発言、ユーザーのカラムではその人の発言。
   */
  chats: boolean;
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
  /**
   * 開いたときに、見せるものがあると分かっていたリレー（押した投稿を受け取った
   * リレーや nevent のヒント）。カラムのどの取得にも、行き先に足して聞く。
   * 検索リレーのように普段は読まないリレーで見つけたものは、そこにしか無いことがある。
   */
  knownRelays?: string[];
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
  chats: true,
};

/** 保存された値と既定値を合わせる。カラムを読む側はこれだけを見る。 */
export const columnShow = (column: ColumnDef): ColumnShow => ({
  ...DEFAULT_COLUMN_SHOW,
  ...column.show,
});

/** 1 つのデッキ。名前を付けて、アカウントにいくつも持てる。 */
export type Deck = {
  id: string;
  name: string;
  columns: ColumnDef[];
};

/**
 * アカウントに保存する、デッキすべてと見た目。どのデッキを開いているかは端末ごとに
 * 違ってよいので、ここには持たない（`activeDeckStorageKey`）。
 *
 * `version` は形の違いを見分けるために持つ。version 2 は 1 つのデッキだけを持つ形で、
 * 読むときに version 3 へ移す。
 */
export type DeckSet = {
  version: 3;
  /** 少なくとも 1 つ。並びがそのまま切り替えの一覧の順になる。 */
  decks: Deck[];
  /** 見た目のうち、アカウントに保存するもの（どのデッキ・どの端末でも同じ色にする）。無ければ既定の色。 */
  appearance?: DeckAppearance;
  /**
   * 投稿に、Streets から投稿したことを示す `client` タグを付けるか。どのアプリを
   * 使っているかが公開されるので、`true` を選んだ人だけに付ける。
   */
  clientTag?: boolean;
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
 * 既定デッキのカラム (モバイル初回訪問者はデスクトップでデッキを組んでいないため
 * 必須)。新規ユーザーは誰もフォローしておらずホームが空なので、入口で見ていた
 * リレーの流れを間に置く。
 */
export const defaultColumns = (relays: readonly RelayUrl[]): ColumnDef[] => {
  const relayColumn = buildRelayColumn(relays);
  return [
    // `buildColumn` は不正入力で `undefined` を返すが、既定デッキは不正入力が無いので `!` で良い。
    buildColumn("home", "")!,
    // リレーが 0 本だと列を作れない。そのときはホームと通知だけにする。
    ...(relayColumn ? [relayColumn] : []),
    // 同上。
    buildColumn("notifications", "")!,
  ];
};

/**
 * 最初のデッキの id。既定デッキと version 2 から移したデッキに使う。2 つの端末が
 * それぞれ移しても同じ id になり、端末に覚えた「開いているデッキ」がずれない。
 */
export const FIRST_DECK_ID = "main";

export const FIRST_DECK_NAME = "メイン";

export const defaultDeckSet = (relays: readonly RelayUrl[]): DeckSet => ({
  version: 3,
  decks: [
    {
      id: FIRST_DECK_ID,
      name: FIRST_DECK_NAME,
      columns: defaultColumns(relays),
    },
  ],
});

/** デッキを保存する kind:30078 の `d` タグ。 */
export const DECK_EVENT_IDENTIFIER = "moe.eyemono.streets/deck";

export const saveDeckSet = (set: DeckSet): string => JSON.stringify(set);

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
  knownRelays: v.optional(v.array(v.string())),
  show: v.optional(
    v.object({
      replies: v.optional(v.boolean()),
      quotes: v.optional(v.boolean()),
      mentions: v.optional(v.boolean()),
      reposts: v.optional(v.boolean()),
      reactions: v.optional(v.boolean()),
      zaps: v.optional(v.boolean()),
      chats: v.optional(v.boolean()),
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

// 色が壊れていても、デッキ（カラムの並び）ごと捨てない。色だけ既定に戻す。
const appearanceSchema = v.fallback(
  v.optional(v.object({ accent: hexColorSchema, ui: hexColorSchema })),
  undefined,
);

const deckSchema = v.object({
  id: v.pipe(v.string(), v.minLength(1)),
  name: v.pipe(v.string(), v.minLength(1)),
  columns: columnListSchema,
});

/**
 * 読めないデッキは、そのデッキだけ捨てる（カラムと同じ理由）。同じ id が重なって
 * いたら後のものを捨てる。切り替えも編集も id で指すので、重なると片方に届かない。
 */
const deckListSchema = v.pipe(
  v.array(v.unknown()),
  v.transform((decks) => {
    const seen = new Set<string>();
    return decks.flatMap((deck) => {
      const parsed = v.safeParse(deckSchema, deck);
      if (!parsed.success) {
        console.warn("読めないデッキを飛ばしました", deck);
        return [];
      }
      if (seen.has(parsed.output.id)) return [];
      seen.add(parsed.output.id);
      return [parsed.output];
    });
  }),
  // 1 つも残らなければ、デッキの集まりとしては読めない。空の集まりを正として
  // 保存し直すと、手元にもリレーにも何も残らなくなる。
  v.minLength(1),
);

const deckSetSchema = v.object({
  version: v.literal(3),
  decks: deckListSchema,
  appearance: appearanceSchema,
  // 壊れた値は付けない（既定）に落とす。デッキごと捨てない。
  clientTag: v.fallback(v.optional(v.boolean()), undefined),
});

/** 1 つのデッキだけを持っていた形。読むときに、そのデッキを最初のデッキとして移す。 */
const deckSetV2Schema = v.pipe(
  v.object({
    version: v.literal(2),
    columns: columnListSchema,
    appearance: appearanceSchema,
  }),
  v.transform(({ columns, appearance }): DeckSet => ({
    version: 3,
    decks: [{ id: FIRST_DECK_ID, name: FIRST_DECK_NAME, columns }],
    ...(appearance ? { appearance } : {}),
  })),
);

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
export const loadDeckSet = (raw: string | null): DeckSet | undefined => {
  // JSON.parse(null) は例外を投げず null を返すため、valibot 任せにせず「raw が無い」意図を明示する。
  if (raw === null) return undefined;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }

  const result = v.safeParse(v.union([deckSetSchema, deckSetV2Schema]), parsed);
  if (!result.success) return undefined;
  return {
    ...result.output,
    decks: result.output.decks.map((deck) => ({
      ...deck,
      columns: deck.columns.map(migrateLegacyUserColumn),
    })),
  };
};

/**
 * どのデッキを開いているかを覚える localStorage のキー。デッキの集まりと同じく
 * pubkey ごとに分ける。値はデッキの id。
 */
export const activeDeckStorageKey = (pubkey: string): string =>
  `streets.v1.active-deck.${pubkey}`;
