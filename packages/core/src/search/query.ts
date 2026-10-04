import type { NostrEvent } from "../nostr/event";
import { decodeNip19 } from "../nostr/nip19";

/**
 * 検索の条件。文字列（人が打つ形）と、この形を行き来できるようにしてある
 * —— 画面のフォームで触っても、文字列を直接書いても、同じものを指す。
 *
 * v0 と同じ書き方に、`kind:` と `-` で除く指定を足した:
 *
 *   ねこ -いぬ from:npub1… -from:npub1… -to:npub1… #nostr -#bot kind:1 -is:bot
 *
 * 除く指定は NIP-50 に決まりが無く、既定の検索リレーも解釈しない（`-いぬ` を
 * その文字列として探してしまう）。リレーへは送らず、届いた結果を手元でふるう。
 */
export type SearchQuery = {
  /** 本文に含む言葉。空白で区切った並び。 */
  words: string[];
  hashtags: string[];
  /** 書いた人（16 進の公開鍵、またはフォロー中を指す `follows`）。 */
  from?: string;
  /** 宛先（`p` タグ。16 進の公開鍵）。 */
  to?: string;
  /** 秒。Nostr の `created_at` に合わせる。 */
  since?: number;
  until?: number;
  kinds: number[];
  /** 本文に含んでいたら除く言葉。 */
  excludeWords: string[];
  excludeHashtags: string[];
  /** 除く書いた人（16 進の公開鍵）。 */
  excludeFrom: string[];
  /** 除く宛先（`p` タグ。16 進の公開鍵）。 */
  excludeTo: string[];
  /** プロフィールで bot と名乗っている人（NIP-24 の `bot`）を除く。 */
  excludeBots: boolean;
};

export const emptySearchQuery = (): SearchQuery => ({
  words: [],
  hashtags: [],
  kinds: [],
  excludeWords: [],
  excludeHashtags: [],
  excludeFrom: [],
  excludeTo: [],
  excludeBots: false,
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

/** `-` の後ろを読む。読み取れない指定は、除く言葉として扱う。 */
const excludeToken = (query: SearchQuery, token: string): void => {
  const lower = token.toLowerCase();
  if (lower === "is:bot") {
    query.excludeBots = true;
    return;
  }
  const people = [
    { keys: ["from:", "by:"], list: query.excludeFrom },
    { keys: ["to:"], list: query.excludeTo },
  ];
  for (const { keys, list } of people) {
    const key = keys.find((candidate) => lower.startsWith(candidate));
    if (key === undefined) continue;
    const pubkey = toPubkey(token.slice(key.length));
    if (!pubkey) break;
    if (!list.includes(pubkey)) list.push(pubkey);
    return;
  }
  const hashtag = ["hashtag:", "#"].find((key) => lower.startsWith(key));
  if (hashtag !== undefined && lower.length > hashtag.length) {
    query.excludeHashtags.push(lower.slice(hashtag.length));
    return;
  }
  query.excludeWords.push(token);
};

/**
 * 打った文字列を条件に直す。読み取れない指定（`from:` に壊れた鍵など）は、
 * ふつうの言葉として扱う —— 打っている途中に消えてしまわないように。
 */
export const parseSearchQuery = (text: string): SearchQuery => {
  const query = emptySearchQuery();
  for (const token of text.trim().split(/\s+/)) {
    if (token === "") continue;
    // `-` だけ（や `--`）は除く指定にしない。打ち始めで消えないように。
    if (token.startsWith("-") && token.length > 1 && token[1] !== "-") {
      excludeToken(query, token.slice(1));
      continue;
    }
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
        if (matched.field === "from" && value.toLowerCase() === "follows") {
          query.from = "follows";
          break;
        }
        const pubkey = toPubkey(value);
        if (!pubkey) {
          query.words.push(token);
          break;
        }
        // follows と個人が混在しても、書いた順に結果が変わらないようにする。
        if (!(matched.field === "from" && query.from === "follows")) {
          query[matched.field] = pubkey;
        }
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
    ...query.excludeWords.map((word) => `-${word}`),
    ...query.hashtags.map((tag) => `#${tag}`),
    ...query.excludeHashtags.map((tag) => `-#${tag}`),
    ...(query.from ? [`from:${query.from}`] : []),
    ...query.excludeFrom.map((pubkey) => `-from:${pubkey}`),
    ...(query.to ? [`to:${query.to}`] : []),
    ...query.excludeTo.map((pubkey) => `-to:${pubkey}`),
    ...(query.since !== undefined ? [`since:${fromSeconds(query.since)}`] : []),
    ...(query.until !== undefined ? [`until:${fromSeconds(query.until)}`] : []),
    ...query.kinds.map((kind) => `kind:${kind}`),
    ...(query.excludeBots ? ["-is:bot"] : []),
  ].join(" ");

/**
 * 何も指定していないか。空のまま検索しても意味が無いので、送る前に見る。
 * 除く指定だけでは探すものが決まらないので、空とみなす。
 */
export const isEmptySearchQuery = (query: SearchQuery): boolean =>
  query.words.length === 0 &&
  query.hashtags.length === 0 &&
  query.kinds.length === 0 &&
  query.from === undefined &&
  query.to === undefined &&
  query.since === undefined &&
  query.until === undefined;

/** リレーへ送る形（NIP-50 の `search` と、ふつうの絞り込み）。 */
export const searchFilter = (
  query: SearchQuery,
  followees: readonly string[] = [],
) => ({
  kinds: query.kinds.length > 0 ? query.kinds : [1],
  ...(query.words.length > 0 ? { search: query.words.join(" ") } : {}),
  ...(query.hashtags.length > 0 ? { "#t": query.hashtags } : {}),
  ...(query.from
    ? {
        authors:
          query.from === "follows" ? [...new Set(followees)] : [query.from],
      }
    : {}),
  ...(query.to ? { "#p": [query.to] } : {}),
  ...(query.since !== undefined ? { since: query.since } : {}),
  ...(query.until !== undefined ? { until: query.until } : {}),
});

/** 除く指定があるか。無ければ、届いた結果をふるう手間を省ける。 */
export const hasSearchExclusions = (query: SearchQuery): boolean =>
  query.excludeWords.length > 0 ||
  query.excludeHashtags.length > 0 ||
  query.excludeFrom.length > 0 ||
  query.excludeTo.length > 0 ||
  query.excludeBots;

/** 全角・半角や大文字・小文字の違いで取りこぼさないよう、比べる前にそろえる。 */
const normalize = (text: string): string =>
  text.normalize("NFKC").toLowerCase();

/**
 * 届いた結果を、除く指定で残すか決める。`isBot` はその人が bot と名乗って
 * いるか（まだ分からなければ undefined）。分かるまでは残さない —— 出した後で
 * 消すと、読んでいる位置がずれる。
 */
export const passesSearchExclusions = (
  query: SearchQuery,
  event: NostrEvent,
  isBot: (pubkey: string) => boolean | undefined,
): boolean => {
  if (query.excludeFrom.includes(event.pubkey)) return false;
  if (
    query.excludeTo.length > 0 &&
    event.tags.some(
      (tag) =>
        tag[0] === "p" &&
        tag[1] !== undefined &&
        query.excludeTo.includes(tag[1].toLowerCase()),
    )
  ) {
    return false;
  }
  if (query.excludeHashtags.length > 0) {
    const tagged = event.tags.some(
      (tag) =>
        tag[0] === "t" &&
        tag[1] !== undefined &&
        query.excludeHashtags.includes(tag[1].toLowerCase()),
    );
    if (tagged) return false;
  }
  if (query.excludeWords.length > 0) {
    const content = normalize(event.content);
    if (query.excludeWords.some((word) => content.includes(normalize(word)))) {
      return false;
    }
  }
  if (query.excludeBots && isBot(event.pubkey) !== false) return false;
  return true;
};
