import { FALLBACK_RELAYS } from "../read/default-relays";
import type { NostrSource } from "../read/source";
import type { RelayFilter } from "../relay/relay-connection";

export type ColumnDef = { id: string; title: string; source: NostrSource };

/**
 * `version` は今すぐ増える予定はないが、外さない。デッキの正が localStorage
 * から NIP-78 (kind:30078, ADR-0013) へ移るとき、古い形 (このバージョン) を
 * 新しい形として誤って読み込まないための足場がこれしかない —
 * バージョンを持たない形式は「今の形と違う」ことしか言えず「壊れている」と
 * 区別できない。
 */
export type Deck = { version: 1; columns: ColumnDef[] };

export const DECK_STORAGE_KEY = "streets.v1.deck";

/**
 * 初回起動時 (localStorage に何も無い、または壊れている) の既定デッキ。
 *
 * 3 本の設計意図が違う:
 * - `home`: Outbox ルーティング (`relays` を指定しない)。フォローの投稿を
 *   ルーティング表に任せて集める、このスライスの主目的。
 * - `mine`: 単一著者。フォロー 0 人でも自分の投稿だけは必ず映る、
 *   ルーティングの成否を切り分けるための対照群。
 * - `global`: 明示リレー。Outbox をバイパスして `FALLBACK_RELAYS` へ直接繋ぐ
 *   経路が実際に機能することを見せる (ADR-0016 の fallback は「著者ごとの
 *   経路が引けないときの保険」だが、ここでは意図的に常時使う)。
 */
export const defaultDeck = (
  viewerPubkey: string,
  followees: string[],
): Deck => ({
  version: 1,
  columns: [
    {
      id: "home",
      title: "ホーム",
      source: {
        type: "nostr",
        filters: [{ kinds: [1], authors: followees }],
      },
    },
    {
      id: "mine",
      title: "自分の投稿",
      source: {
        type: "nostr",
        filters: [{ kinds: [1], authors: [viewerPubkey] }],
      },
    },
    {
      id: "global",
      title: "グローバル",
      source: {
        type: "nostr",
        filters: [{ kinds: [1] }],
        relays: [...FALLBACK_RELAYS],
      },
    },
  ],
});

export const saveDeck = (deck: Deck): string => JSON.stringify(deck);

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
  // リターンが無くても、その `null` は下の `isDeck()` の null チェックで
  // 結局弾かれる。ここが本当に守っているのは「raw が無い」という呼び出し側
  // の意図を、JSON.parse の型強制という偶然の挙動任せにしないこと。
  if (raw === null) return undefined;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }

  return isDeck(parsed) ? parsed : undefined;
};

const isDeck = (value: unknown): value is Deck => {
  if (typeof value !== "object" || value === null) return false;
  const deck = value as Record<string, unknown>;

  // NIP-78 へ移行したとき、version の無い (または違う) 古い形を新しい形
  // として読んでしまうと、存在しないフィールドへのアクセスで壊れるか、
  // 悪くすると意味の変わったフィールドを正しい値として使ってしまう。
  if (deck.version !== 1) return false;
  if (!Array.isArray(deck.columns)) return false;
  return deck.columns.every(isColumnDef);
};

const isColumnDef = (value: unknown): value is ColumnDef => {
  if (typeof value !== "object" || value === null) return false;
  const column = value as Record<string, unknown>;

  if (typeof column.id !== "string" || column.id.length === 0) return false;
  if (typeof column.title !== "string" || column.title.length === 0)
    return false;
  return isNostrSource(column.source);
};

const isNostrSource = (value: unknown): value is NostrSource => {
  if (typeof value !== "object" || value === null) return false;
  const source = value as Record<string, unknown>;

  if (source.type !== "nostr") return false;
  if (!Array.isArray(source.filters)) return false;
  if (!source.filters.every(isRelayFilter)) return false;
  if (source.relays !== undefined) {
    if (!Array.isArray(source.relays)) return false;
    if (!source.relays.every((url) => typeof url === "string")) return false;
  }
  return true;
};

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

const isNumberArray = (value: unknown): value is number[] =>
  Array.isArray(value) && value.every((item) => typeof item === "number");

/**
 * `authors`/`kinds`/`ids` などの型と、フィルタが少なくとも 1 つの
 * scoping フィールドを持つことを確かめる。
 *
 * 型を確かめないと `{ kinds:[1], authors: 42 }` のような値を素通しして
 * しまう —— `subscription-manager.ts` が `for (const author of filter.authors
 * ?? [])` と書いている箇所は `??` が `null`/`undefined` しか捕まえないので
 * `42 ?? []` は `42` のままになり、`for...of` が `TypeError: not iterable`
 * を投げる。これは `createSection` の `createEffect` の中、マウント中に
 * 同期的に起きる。このアプリに `ErrorBoundary` は無く、壊れた入力は
 * `loadDeck` のような境界で弾くことで白画面を防ぐ設計になっている ——
 * ここで型を確かめ損なうと、まさにその境界の役目を `isRelayFilter` 自身が
 * 破ることになる。
 *
 * `RelayFilter` は `#<tag>` の任意キーも許すが、その値は常に `string[]`
 * (NIP-01) なので、既知フィールドと同じ規則で確かめる。
 */
const isRelayFilter = (value: unknown): value is RelayFilter => {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return false;
  const filter = value as Record<string, unknown>;

  const keys = Object.keys(filter);

  if (filter.ids !== undefined && !isStringArray(filter.ids)) return false;
  if (filter.authors !== undefined && !isStringArray(filter.authors))
    return false;
  if (filter.kinds !== undefined && !isNumberArray(filter.kinds)) return false;
  if (filter.since !== undefined && typeof filter.since !== "number")
    return false;
  if (filter.until !== undefined && typeof filter.until !== "number")
    return false;
  if (filter.limit !== undefined && typeof filter.limit !== "number")
    return false;
  if (filter.search !== undefined && typeof filter.search !== "string")
    return false;

  const tagKeys = keys.filter((key) => key.startsWith("#"));
  for (const key of tagKeys) {
    if (!isStringArray(filter[key])) return false;
  }

  // `ids`/`authors`/`kinds`/`#tag` のどれも無いフィルタは「誰の・何を
  // 問わない」= 無制限購読 (firehose) になる。`{}` だけでなく `{ since: 123
  // }` のような形も同じ穴 —— `since`/`until`/`limit`/`search` はクエリを
  // 絞り込みはするが、誰の・何のイベントかという範囲そのものは定めない
  // (query-plan.ts: `authors` が無ければ「誰でもいい」、`kinds` が無ければ
  // 種類は無制限)。だから「範囲を決める」フィールド (`ids`/`authors`/
  // `kinds`/`#tag`) を scoping、それ以外 (`since`/`until`/`limit`/`search`)
  // を非 scoping として区別し、scoping フィールドが 1 つも無ければ拒否
  // する。壊れたデッキから偶然この形が出てきて、本物のリレー
  // (`FALLBACK_RELAYS`) への無制限購読として通ってしまう実害の方が大きい
  // ので、永続化されたデッキのフィルタとしては受け付けない。
  const hasScopingField =
    filter.ids !== undefined ||
    filter.authors !== undefined ||
    filter.kinds !== undefined ||
    tagKeys.length > 0;
  if (!hasScopingField) return false;

  return true;
};
