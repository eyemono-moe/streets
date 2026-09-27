import type { RelayListEntry } from "../read/relay-list";
import type { RelayUrl } from "../relay/relay-connection";

export type RelaySuggestion = {
  url: RelayUrl;
  group: "account" | "followees";
  /** 行の右に添える一言（「読み書き」「12 人」など）。 */
  detail: string;
  /** もう足してあるか。 */
  added: boolean;
};

const usage = (entry: RelayListEntry): string =>
  entry.read && entry.write ? "読み書き" : entry.read ? "読み込み" : "書き込み";

/** `wss://` などを外し、大文字・小文字を無視して比べる。 */
const bare = (text: string) =>
  text
    .trim()
    .toLowerCase()
    .replace(/^wss?:\/\//, "")
    .replace(/\/$/, "");

/**
 * リレーを足す欄の候補。自分のアカウントで使っているリレーと、フォローしている人が
 * 書き込みに使っているリレー（使っている人の多い順）を出す。打った文字を含む
 * ものだけに絞る。フォローしている人のリレーは多くなりうるので上限を切る。
 */
export const relaySuggestions = (input: {
  account: readonly RelayListEntry[];
  /** フォローしている人ごとの、書き込みに使うリレー。 */
  followeeWriteRelays: readonly (readonly RelayUrl[])[];
  selected: readonly RelayUrl[];
  query: string;
  followeeLimit?: number;
}): RelaySuggestion[] => {
  const query = bare(input.query);
  const matches = (url: RelayUrl) => query === "" || bare(url).includes(query);
  const selected = new Set(input.selected);
  const own = new Set(input.account.map((entry) => entry.url));

  const counts = new Map<RelayUrl, number>();
  for (const relays of input.followeeWriteRelays) {
    for (const url of new Set(relays)) {
      if (own.has(url)) continue;
      counts.set(url, (counts.get(url) ?? 0) + 1);
    }
  }

  return [
    ...input.account
      .filter((entry) => matches(entry.url))
      .map((entry): RelaySuggestion => ({
        url: entry.url,
        group: "account",
        detail: usage(entry),
        added: selected.has(entry.url),
      })),
    ...[...counts]
      .filter(([url]) => matches(url))
      .sort(([a, x], [b, y]) => y - x || a.localeCompare(b))
      .slice(0, input.followeeLimit ?? 10)
      .map(([url, count]): RelaySuggestion => ({
        url,
        group: "followees",
        detail: `${count} 人`,
        added: selected.has(url),
      })),
  ];
};
