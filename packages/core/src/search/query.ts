import { decodeNip19 } from "../nostr/nip19";

/**
 * 検索の条件。文字列（人が打つ形）と、この形を行き来できるようにしてある
 * —— 画面のフォームで触っても、文字列を直接書いても、同じものを指す。
 *
 * v0 と同じ書き方に、`kind:` を足した:
 *
 *   ねこ from:npub1… since:2026-09-01 #nostr kind:1
 */
export type SearchQuery = {
  /** 本文に含む言葉。空白で区切った並び。 */
  words: string[];
  hashtags: string[];
  /** 書いた人（16 進の公開鍵）。 */
  from?: string;
  /** 宛先（`p` タグ。16 進の公開鍵）。 */
  to?: string;
  /** 秒。Nostr の `created_at` に合わせる。 */
  since?: number;
  until?: number;
  kinds: number[];
};

export const emptySearchQuery = (): SearchQuery => ({
  words: [],
  hashtags: [],
  kinds: [],
});

/** 公開鍵の指定。npub・nprofile・16 進のどれでも受ける。 */
const toPubkey = (value: string): string | undefined => {
  if (/^[0-9a-f]{64}$/i.test(value)) return value.toLowerCase();
  const ref = decodeNip19(value);
  if (ref?.kind === "npub" || ref?.kind === "nprofile") return ref.pubkey;
  return undefined;
};

/** 日付だけなら、その日の始まりとして読む。 */
const toSeconds = (value: string): number | undefined => {
  const text = /^\d{4}(-\d{2}(-\d{2})?)?$/.test(value)
    ? `${value}T00:00:00`
    : value;
  const time = new Date(text).getTime();
  return Number.isNaN(time) ? undefined : Math.floor(time / 1000);
};

/** 秒を、書き戻せる形（その日の始まりなら日付だけ）にする。 */
const fromSeconds = (seconds: number): string => {
  const date = new Date(seconds * 1000);
  const pad = (value: number) => String(value).padStart(2, "0");
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  if (
    date.getHours() === 0 &&
    date.getMinutes() === 0 &&
    date.getSeconds() === 0
  ) {
    return day;
  }
  return `${day}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const PREFIXES: { keys: string[]; field: keyof SearchQuery }[] = [
  { keys: ["from:", "by:"], field: "from" },
  { keys: ["to:"], field: "to" },
  { keys: ["since:", "after:"], field: "since" },
  { keys: ["until:", "before:"], field: "until" },
  { keys: ["kind:"], field: "kinds" },
  { keys: ["hashtag:", "#"], field: "hashtags" },
];

/**
 * 打った文字列を条件に直す。読み取れない指定（`from:` に壊れた鍵など）は、
 * ふつうの言葉として扱う —— 打っている途中に消えてしまわないように。
 */
export const parseSearchQuery = (text: string): SearchQuery => {
  const query = emptySearchQuery();
  for (const token of text.trim().split(/\s+/)) {
    if (token === "") continue;
    const matched = PREFIXES.find(({ keys }) =>
      keys.some((key) => token.toLowerCase().startsWith(key)),
    );
    const key = matched?.keys.find((candidate) =>
      token.toLowerCase().startsWith(candidate),
    );
    const value = key === undefined ? token : token.slice(key.length);
    switch (matched?.field) {
      case "from":
      case "to": {
        const pubkey = toPubkey(value);
        if (pubkey) query[matched.field] = pubkey;
        else query.words.push(token);
        break;
      }
      case "since":
      case "until": {
        const seconds = toSeconds(value);
        if (seconds !== undefined) query[matched.field] = seconds;
        else query.words.push(token);
        break;
      }
      case "kinds": {
        const kind = Number.parseInt(value, 10);
        if (Number.isInteger(kind) && kind >= 0) query.kinds.push(kind);
        else query.words.push(token);
        break;
      }
      case "hashtags": {
        // 小文字を SHOULD とする決まりに合わせる（`t` タグと同じ扱い）。
        const tag = value.toLowerCase();
        if (tag.length > 0) query.hashtags.push(tag);
        else query.words.push(token);
        break;
      }
      default:
        query.words.push(token);
    }
  }
  return query;
};

/** 条件を、打った形に戻す。フォームで触った結果を入力欄へ返すのに使う。 */
export const formatSearchQuery = (query: SearchQuery): string =>
  [
    ...query.words,
    ...query.hashtags.map((tag) => `#${tag}`),
    ...(query.from ? [`from:${query.from}`] : []),
    ...(query.to ? [`to:${query.to}`] : []),
    ...(query.since !== undefined ? [`since:${fromSeconds(query.since)}`] : []),
    ...(query.until !== undefined ? [`until:${fromSeconds(query.until)}`] : []),
    ...query.kinds.map((kind) => `kind:${kind}`),
  ].join(" ");

/** 何も指定していないか。空のまま検索しても意味が無いので、送る前に見る。 */
export const isEmptySearchQuery = (query: SearchQuery): boolean =>
  query.words.length === 0 &&
  query.hashtags.length === 0 &&
  query.kinds.length === 0 &&
  query.from === undefined &&
  query.to === undefined &&
  query.since === undefined &&
  query.until === undefined;

/** リレーへ送る形（NIP-50 の `search` と、ふつうの絞り込み）。 */
export const searchFilter = (query: SearchQuery) => ({
  kinds: query.kinds.length > 0 ? query.kinds : [1],
  ...(query.words.length > 0 ? { search: query.words.join(" ") } : {}),
  ...(query.hashtags.length > 0 ? { "#t": query.hashtags } : {}),
  ...(query.from ? { authors: [query.from] } : {}),
  ...(query.to ? { "#p": [query.to] } : {}),
  ...(query.since !== undefined ? { since: query.since } : {}),
  ...(query.until !== undefined ? { until: query.until } : {}),
});
