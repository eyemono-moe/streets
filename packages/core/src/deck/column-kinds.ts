import * as v from "valibot";
import { CHANNEL_MESSAGE_KIND } from "../nostr/channel";
import type { SectionStatus } from "../read/source";
import type { RelayFilter } from "../relay/relay-connection";
import { parseSearchQuery } from "../search/query";
import type { ReadRoutingMode } from "../settings/read-routing-setting";
import {
  type RelayListState,
  readRelayCount,
} from "../settings/relay-list-state";
import type { ColumnDef, ColumnShow } from "./deck";

/**
 * 「誰かの投稿を時系列で並べる」列が集める kind。kind:6 はタイムラインへ
 * 流したものとして含め、kind:16 は対象外コンテンツで意図が曖昧になるため除外。
 */
export const TIMELINE_KINDS: readonly number[] = [1, 6];

/**
 * 通知カラムが集める kind。kind:16 は表示不能だからではなく (対応済み)、
 * v1 がまだ長文を作れず e2e で確かめられないため外す (別の判断)。
 * kind:42 はチャンネル（NIP-28）での自分への返信・メンション。
 */
export const NOTIFICATION_KINDS: readonly number[] = [1, 6, 7, 9735, 42];

/**
 * NIP-01 フィルタの検証。ワイヤ形式でなく保存デッキ用なので valibot 可。
 * `looseObject` でなく `objectWithRest` を使うのは余剰キー型の不一致のため。
 */
const relayFilterSchema: v.GenericSchema<unknown, RelayFilter> = v.pipe(
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

const hexId = v.pipe(v.string(), v.regex(/^[0-9a-f]{64}$/));

/**
 * デッキが保存する「意図」。フォローリストのような変わる値を焼き込まない。
 * 種類を足すときはここに足し、下の `COLUMN_KINDS` と web の `COLUMN_VIEWS` を
 * 型検査が求めるとおりに埋める。型は検証から作るので、両者はずれない。
 */
export const columnSourceSchema = v.variant("kind", [
  v.object({
    kind: v.literal("literal"),
    filters: v.array(relayFilterSchema),
    relays: v.optional(v.array(v.string())),
  }),
  /**
   * 言葉から探す。問い合わせ先は設定（kind:10007）で変わるので、デッキには
   * 書いた条件だけを残し、リレーは読むたびに決める。
   */
  v.object({
    kind: v.literal("search"),
    query: v.pipe(v.string(), v.minLength(1)),
  }),
  v.object({ kind: v.literal("followees"), kinds: v.array(v.number()) }),
  v.object({ kind: v.literal("notifications") }),
  v.object({ kind: v.literal("bookmarks") }),
  /** 1 本のスレッド。`focus` を中心に、その祖先と返信を見せる。 */
  v.object({ kind: v.literal("thread"), focus: hexId }),
  /** 1件の投稿に対するリポスト・引用・リアクション。 */
  v.object({ kind: v.literal("activity"), target: hexId }),
  v.object({ kind: v.literal("user"), pubkey: hexId }),
  v.object({ kind: v.literal("followees-list"), pubkey: hexId }),
  v.object({ kind: v.literal("followers-list"), pubkey: hexId }),
  /**
   * NIP-28 のチャンネル。`relays` は開いたときに分かっていたリレー（nevent の
   * ヒントなど）。チャンネルの情報が届けば、そこに書かれたリレーも使う。
   */
  /** チャンネルの情報。チャンネルのカラムの見出しの ⓘ から重ねて開く。 */
  v.object({
    kind: v.literal("channel-info"),
    id: hexId,
    relays: v.optional(v.array(v.string())),
  }),
  /** チャンネルの一覧（お気に入り・最近アクティブ・すべてから探す）。 */
  v.object({ kind: v.literal("channel-list") }),
  v.object({
    kind: v.literal("channel"),
    id: hexId,
    relays: v.optional(v.array(v.string())),
  }),
]);

export type ColumnSource = v.InferOutput<typeof columnSourceSchema>;
export type ColumnKind = ColumnSource["kind"];
export type ColumnSourceOf<K extends ColumnKind> = Extract<
  ColumnSource,
  { kind: K }
>;

/**
 * カラムの題名。中身から決める —— 足したときの文字（ユーザーのカラムなら npub の
 * 短縮形）を保存して出すと、名前が分かったあとも npub のまま残る。人に紐づく
 * カラムは、名前を読み取ってから出す（`person` の部分を名前に置き換える）。
 */
export type ColumnTitle =
  | { text: string }
  | { person: string; suffix: string }
  /** チャンネルは、情報が届いたらその名前で呼ぶ。届くまでは `fallback`。 */
  | { channel: string; fallback: string };

/** 「表示するもの」で切り替えられる項目。 */
export type ColumnFacet = keyof ColumnShow;

export type ColumnAlert = {
  /** ヘッダのアイコンを押したときに出る一行 */
  message: string;
  /** ユーザーが取れる行動 */
  action: string;
};

export type ColumnAlertInput = {
  status: SectionStatus;
  relayList: RelayListState;
  readMode: ReadRoutingMode;
};

type ColumnKindDef<S> = {
  title: (source: S, column: ColumnDef) => ColumnTitle;
  /**
   * そのカラムに流れうる kind。「表示するもの」に出す項目を決める。
   * `undefined` は「決められない」で、全項目を出す。
   */
  kinds: (source: S) => readonly number[] | undefined;
  /** ミュートした人を出さないか。 */
  hidesMuted: boolean;
  /**
   * 自分宛を集めるカラムか。「メンション」（自分宛だが返信でも引用でもない投稿）は
   * ここでしか意味を持たず、ほかで切ると普通の投稿まで消える。
   */
  addressedToViewer?: boolean;
  /** ユーザーが行動できる異常だけを返す（診断値は含めない）。 */
  alerts?: (source: S, input: ColumnAlertInput) => ColumnAlert[];
};

/** 読み込みリレーだけを読んでいるなら、そこが落ちると何も出ない。 */
const directReadUnreachable = (input: ColumnAlertInput): ColumnAlert[] => {
  const unreachable = input.status.incomplete?.unreachableRelays ?? 0;
  return input.readMode === "direct" && unreachable > 0
    ? [
        {
          message: `読み込みに使うリレーに接続できません (${unreachable} 本)`,
          action:
            "設定の「リレー」で読み込みリレーを確かめるか、読み方を「人ごとに選ぶ」に戻してください",
        },
      ]
    : [];
};

const relayLabelOf = (relays: readonly string[]): string =>
  relays.length === 1
    ? relays[0].replace(/\/$/, "")
    : `リレー（${relays.length}）`;

const COLUMN_KINDS: { [K in ColumnKind]: ColumnKindDef<ColumnSourceOf<K>> } = {
  literal: {
    title: (source, column) => {
      const tags = source.filters.flatMap((filter) => filter["#t"] ?? []);
      if (tags.length > 0)
        return { text: tags.map((tag) => `#${tag}`).join(" ") };
      const search = source.filters.find((filter) => filter.search)?.search;
      if (search) return { text: search };
      const onlyKinds = source.filters.every((filter) =>
        Object.keys(filter).every((key) => key === "kinds"),
      );
      if (onlyKinds && source.relays && source.relays.length > 0) {
        return { text: relayLabelOf(source.relays) };
      }
      // 条件を直に書いたカラム（「自分の投稿」など）は、中身から名前を決められない。
      // 足したときの題名を使う。
      return { text: column.title };
    },
    // ハッシュタグ・グローバル・検索はすべて `literal` なので、種類だけでは決まらない。
    // kinds を持たないフィルタは「その他すべて」なので決められない。
    kinds: (source) =>
      source.filters.every((filter) => filter.kinds !== undefined)
        ? source.filters.flatMap((filter) => filter.kinds ?? [])
        : undefined,
    hidesMuted: true,
    alerts: (source, input) => {
      const unreachable = input.status.incomplete?.unreachableRelays ?? 0;
      // ユーザーが指定した URL だけが対象 —— Outbox が選んだリレーはユーザーには変えられない。
      return source.relays !== undefined && unreachable > 0
        ? [
            {
              message: `指定したリレーに接続できません (${unreachable} 本)`,
              action: "カラムの設定でリレーの URL を確認してください",
            },
          ]
        : [];
    },
  },
  search: {
    title: (source) => ({ text: source.query }),
    kinds: (source) => {
      // 書いた条件で決まる。`kind:` を指定していなければテキストノート。
      const kinds = parseSearchQuery(source.query).kinds;
      return kinds.length > 0 ? kinds : [1];
    },
    hidesMuted: false,
  },
  followees: {
    title: () => ({ text: "ホーム" }),
    kinds: (source) => source.kinds,
    hidesMuted: true,
    alerts: (_, input) => directReadUnreachable(input),
  },
  notifications: {
    title: () => ({ text: "通知" }),
    kinds: () => NOTIFICATION_KINDS,
    hidesMuted: true,
    addressedToViewer: true,
    alerts: (_, input) => {
      const { relayList, status } = input;
      const unreachable = status.incomplete?.unreachableRelays ?? 0;
      // phase で区別しないと、起動直後は常に 0 本なので loading 中も「設定が無い」が一瞬表示される。
      const missing =
        (relayList.phase === "missing" || relayList.phase === "ready") &&
        readRelayCount(relayList) === 0;
      // 通知が来ない原因 (無反応 or リレー未設定) は画面から区別できないので、kind:10002 が無ければ知らせる。
      if (missing) {
        return [
          {
            // missing は取得 timeout も含む (未確定なだけ) ので、publish 済みの人にも意味が通る文言にする。
            message:
              "あなたのリレー設定 (kind:10002) が見つからないか取得できなかったため、既定のリレーで待っています",
            action:
              "通知が届かない場合は、リレー設定を publish しているか確認してください",
          },
        ];
      }
      // kind:10002 は引けていても read リレーが全滅なら、`literal` 列と同じ理由で知らせる。
      return relayList.phase === "ready" && unreachable > 0
        ? [
            {
              message: `あなたの設定した read リレーに接続できません (${unreachable} 本)`,
              action:
                "リレー設定 (kind:10002) の read リレーを確認してください",
            },
          ]
        : [];
    },
  },
  bookmarks: {
    title: () => ({ text: "ブックマーク" }),
    // id で引くので kind は決まらない。何を保存したかは人による。
    kinds: () => undefined,
    hidesMuted: false,
  },
  thread: {
    title: () => ({ text: "スレッド" }),
    kinds: () => [1],
    hidesMuted: false,
  },
  activity: {
    title: () => ({ text: "アクティビティ" }),
    kinds: () => [],
    hidesMuted: false,
  },
  user: {
    title: (source) => ({ person: source.pubkey, suffix: "" }),
    kinds: () => TIMELINE_KINDS,
    hidesMuted: false,
    alerts: (_, input) => [
      ...directReadUnreachable(input),
      // 1 人を見るカラムでは、その人のリレー設定が無いと既定のリレーにしか行けない。
      // フォロー中の人のカラムでは、設定の無い人が少しいるのは普通なので出さない。
      ...(input.readMode === "outbox" &&
      input.status.phase === "settled" &&
      (input.status.incomplete?.unroutableAuthors ?? 0) > 0
        ? [
            {
              message:
                "この人のリレー設定が見つからないため、既定のリレーから読んでいます",
              action:
                "投稿が出ない場合は、設定の「リレー」で読み方を「読み込みリレーだけ」に切り替えてください",
            },
          ]
        : []),
    ],
  },
  "followees-list": {
    title: (source) => ({ person: source.pubkey, suffix: " のフォロー" }),
    kinds: () => [3],
    hidesMuted: false,
  },
  "followers-list": {
    title: (source) => ({ person: source.pubkey, suffix: " のフォロワー" }),
    kinds: () => [3],
    hidesMuted: false,
  },
  "channel-info": {
    title: (source, column) => ({ channel: source.id, fallback: column.title }),
    kinds: () => [],
    hidesMuted: false,
  },
  "channel-list": {
    title: () => ({ text: "チャンネル" }),
    kinds: () => [],
    hidesMuted: false,
  },
  channel: {
    // URL や「覗く」で開いたカラムは、足したときに名前を知らない。情報が届いたら名前で呼ぶ。
    title: (source, column) => ({ channel: source.id, fallback: column.title }),
    kinds: () => [CHANNEL_MESSAGE_KIND],
    hidesMuted: true,
  },
};

// 種類と中身の型の対応は union の分配では表せないので、引く場所をここ 1 つに閉じる。
const kindOf = (source: ColumnSource) =>
  COLUMN_KINDS[source.kind] as unknown as ColumnKindDef<ColumnSource>;

export const columnTitle = (column: ColumnDef): ColumnTitle =>
  kindOf(column.source).title(column.source, column);

/**
 * そのカラムで意味のある項目だけを返す。切っても何も起きない項目を設定に
 * 出さないための判断で、順番は設定画面の並びに合わせてある。
 */
export const columnFacets = (column: ColumnDef): ColumnFacet[] => {
  const kind = kindOf(column.source);
  const kinds = kind.kinds(column.source);
  const has = (kind: number) => kinds === undefined || kinds.includes(kind);
  const facets: ColumnFacet[] = [];
  if (has(1)) {
    facets.push("replies", "quotes");
    if (kind.addressedToViewer) facets.push("mentions");
  }
  if (has(6) || has(16)) facets.push("reposts");
  if (has(7)) facets.push("reactions");
  // Zap は誰かの通知にしか流れない（kind を決められないカラムにも出さない）。
  if (kinds?.includes(9735)) facets.push("zaps");
  // チャンネルでの返信・メンション。自分宛を集めるカラムでだけ切り替える
  // （チャンネルのカラムでは、発言そのものが中身なので切らない）。
  if (kind.addressedToViewer && kinds?.includes(42)) facets.push("chats");
  return facets;
};

export const columnHidesMuted = (column: ColumnDef): boolean =>
  kindOf(column.source).hidesMuted;

/**
 * カラムに起きたことのうち、ユーザーが行動できるものだけを返す (診断値
 * は含めない)。複数の警告を同時に返しうるため配列。
 */
export const columnAlerts = (
  column: ColumnDef,
  status: SectionStatus,
  relayList: RelayListState,
  readMode: ReadRoutingMode = "outbox",
): ColumnAlert[] =>
  kindOf(column.source).alerts?.(column.source, {
    status,
    relayList,
    readMode,
  }) ?? [];

/**
 * カラムの中の全セクションの状態を 1 つにまとめる。警告はカラムに 1 か所で出すため。
 * 全部が落ち着いたら落ち着いた、全部がまだなら取得前、それ以外は取得中。
 * 届かなかった数は足し合わせる。
 */
export const columnStatus = (
  statuses: readonly SectionStatus[],
): SectionStatus => {
  const phase = statuses.every((status) => status.phase === "settled")
    ? "settled"
    : statuses.every((status) => status.phase === "initial")
      ? "initial"
      : "streaming";
  const incompletes = statuses.flatMap((status) =>
    status.incomplete ? [status.incomplete] : [],
  );
  if (incompletes.length === 0) {
    return { phase: statuses.length === 0 ? "initial" : phase };
  }
  return {
    phase,
    incomplete: {
      unreachableRelays: sum(incompletes, "unreachableRelays"),
      unroutableAuthors: sum(incompletes, "unroutableAuthors"),
      uncoveredAuthors: sum(incompletes, "uncoveredAuthors"),
    },
  };
};

const sum = (
  incompletes: readonly NonNullable<SectionStatus["incomplete"]>[],
  key: keyof NonNullable<SectionStatus["incomplete"]>,
): number => incompletes.reduce((total, item) => total + item[key], 0);
