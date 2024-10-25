import { type Filter, kinds, nip19 } from "nostr-tools";
import { decode } from "nostr-tools/nip19";

type ExtractedFilter<T extends string> = {
  type: T;
  prefix: string;
  value: string;
};

type FilterExtractor<T extends string> = (
  q: string,
) => ExtractedFilter<T> | string;

const rawQuery = <T extends string>(extracted: ExtractedFilter<T> | string) => {
  if (typeof extracted === "string") {
    return extracted;
  }

  return `${extracted.prefix}${extracted.value}`;
};

const makePrefixedFilterExtractor =
  <T extends string>(type: T, prefixes: string[]) =>
  (q: string): ExtractedFilter<T> | string => {
    for (const prefix of prefixes) {
      if (q.startsWith(prefix)) {
        return { type, prefix, value: q.slice(prefix.length) };
      }
    }
    return q;
  };

// biome-ignore lint/complexity/noBannedTypes: TODO: 一旦実装見送り
export type StoreForParser = {
  // usernameToHexPubkey: (name: string) => string | undefined;
};

const parseToFilter =
  <F, T extends string>(
    parser: (
      // store: StoreForParser,
      extracted: ExtractedFilter<T>,
    ) => Promise<F | undefined>,
    extractor: FilterExtractor<T>,
  ) =>
  () =>
  async (q: string): Promise<F | string> => {
    const extracted = extractor(q);
    if (typeof extracted === "string") {
      return q;
    }

    const parsed = await parser(extracted);
    if (!parsed) {
      return q;
    }
    return parsed;
  };

// 時刻を含まない日付の正規表現
const dateOnlyFormRegex = /^[0-9]{4}(-[0-9]{2}(-[0-9]{2})?)?$/;

const dateParser = <T extends string>(
  extracted: ExtractedFilter<T>,
): Date | undefined => {
  // 時刻を含まない日付の場合は、T00:00:00.000を付与する
  const dateQuery = dateOnlyFormRegex.test(extracted.value)
    ? `${extracted.value}T00:00:00.000`
    : extracted.value;
  const date = new Date(dateQuery);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }
  return date;
};

/**
 * ユーザー名(name/display_name), npub, nprofile, hex pubkeyをhex pubkeyにパースする
 *
 * TODO: store.usernameToHexPubkeyを実装する
 */
const userParser = <T extends string>(
  extracted: ExtractedFilter<T>,
): string | undefined => {
  // const pubkey = store.usernameToHexPubkey(extracted.value);
  // if (!pubkey) {
  //   return undefined;
  // }

  if (nip19.BECH32_REGEX.test(extracted.value)) {
    try {
      const { data, type } = decode(extracted.value);
      switch (type) {
        case "npub":
          return data;
        case "nprofile":
          return data.pubkey;
        default:
          return undefined;
      }
    } catch {
      return undefined;
    }
  }

  return extracted.value;
};

type SearchQueryObject = {
  kind?: number[];
  word?: string;
  since?: Date;
  until?: Date;
  from?: string;
  to?: string;
  hashtag?: string;
};

type SearchFilter =
  | { type: "since"; raw: string; value: Date }
  | { type: "until"; raw: string; value: Date }
  | { type: "from"; raw: string; value: string }
  | { type: "to"; raw: string; value: string }
  | { type: "hashtag"; raw: string; value: string };
type FilterType = SearchFilter["type"];

const filterExtractors: FilterExtractor<FilterType>[] = [
  makePrefixedFilterExtractor("since", ["since:", "after:"]),
  makePrefixedFilterExtractor("until", ["until:", "before:"]),
  makePrefixedFilterExtractor("from", ["from:", "by:"]),
  makePrefixedFilterExtractor("to", ["to:"]),
  makePrefixedFilterExtractor("hashtag", ["#", "hashtag:"]),
];

const extractor: FilterExtractor<FilterType> = (q) => {
  for (const extractor of filterExtractors) {
    const extracted = extractor(q);
    if (typeof extracted !== "string") {
      return extracted;
    }
  }
  return q;
};

const parser = async (
  extracted: ExtractedFilter<FilterType>,
): Promise<SearchFilter | undefined> => {
  switch (extracted.type) {
    case "since":
    case "until": {
      const date = dateParser(extracted);
      return date
        ? { type: extracted.type, raw: rawQuery(extracted), value: date }
        : undefined;
    }
    case "from":
    case "to": {
      const pubkey = userParser(extracted);
      return pubkey
        ? { type: extracted.type, raw: rawQuery(extracted), value: pubkey }
        : undefined;
    }
    case "hashtag":
      return extracted.value.length
        ? {
            type: extracted.type,
            raw: rawQuery(extracted),
            value: extracted.value,
          }
        : undefined;
  }
};

const parseQueryFragment = parseToFilter(parser, extractor);

export const createQueryParser = (
  // store: StoreForParser
) => {
  const parseQuery = parseQueryFragment();

  return async (q: string): Promise<SearchQueryObject> => {
    const filters = q.split(/\s+/).map(parseQuery);
    const parsedFilters = await Promise.all(filters);

    const queryObject = parsedFilters
      .map(filterToQuery)
      .reduce(mergeQueryObject, {});
    return queryObject;
  };
};

const filterToQuery = (filter: SearchFilter | string): SearchQueryObject => {
  if (typeof filter === "string") {
    return { word: filter };
  }

  switch (filter.type) {
    case "since":
      return { since: filter.value };
    case "until":
      return { until: filter.value };
    case "from":
      return { from: filter.value };
    case "to":
      return { to: filter.value };
    case "hashtag":
      return { hashtag: filter.value };
  }
};

const mergeQueryObject = (
  base: SearchQueryObject,
  query: SearchQueryObject,
): SearchQueryObject => {
  return {
    word: [base.word, query.word].filter((w) => w).join(" "),
    since: query.since ?? base.since,
    until: query.until ?? base.until,
    from: query.from ?? base.from,
    to: query.to ?? base.to,
    hashtag: query.hashtag ?? base.hashtag,
  };
};

export const queryObjectToNostrFilter = (query: SearchQueryObject): Filter => {
  return {
    // kindは一旦ShortTextNoteのみ
    kinds: [kinds.ShortTextNote],
    // 空文字列の場合はundefinedを指定
    search: query.word || undefined,
    since: query.since ? Math.floor(query.since.getTime() / 1000) : undefined,
    until: query.until ? Math.floor(query.until.getTime() / 1000) : undefined,
    authors: query.from ? [query.from] : undefined,
    "#t": query.hashtag ? [query.hashtag] : undefined,
    "#p": query.to ? [query.to] : undefined,
  };
};
