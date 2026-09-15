import type { NostrEvent } from "../nostr/event";
import type { RelayFilter } from "../relay/relay-connection";

/**
 * NIP-01 のフィルタ意味論をローカル再実装。ソケットのメッセージ処理から
 * 呼ばれるため例外を投げない全域関数でなければならない (投げると他セクション
 * の配信ごと巻き込む)。`event`/`filter` は未検証なので不一致に倒す。判断に
 * 迷う条件は REQ より緩い側へ —— 厳しすぎは隠れた劣化、緩すぎとは実害が非対称。
 */
export const matchesFilter = (
  event: NostrEvent,
  filter: RelayFilter,
): boolean => {
  if (typeof event !== "object" || event === null) return false;
  if (typeof filter !== "object" || filter === null) return false;

  // `limit`/`search` は照合条件として扱わない: NIP-01 で limit は初回のみ
  // 有効、`search` (NIP-50) はローカルで判定できないため不一致にしない。

  if (filter.ids !== undefined && !includesValue(filter.ids, event.id)) {
    return false;
  }
  if (
    filter.authors !== undefined &&
    !includesValue(filter.authors, event.pubkey)
  ) {
    return false;
  }
  if (filter.kinds !== undefined && !includesValue(filter.kinds, event.kind)) {
    return false;
  }

  // NIP-01: since/until はどちらも境界を含む。
  if (filter.since !== undefined) {
    if (typeof event.created_at !== "number") return false;
    if (event.created_at < filter.since) return false;
  }
  if (filter.until !== undefined) {
    if (typeof event.created_at !== "number") return false;
    if (event.created_at > filter.until) return false;
  }

  for (const key of Object.keys(filter)) {
    if (!key.startsWith("#")) continue;
    // `#${string}` の索引シグネチャは string 添字に型が付かないため Record として読む。
    const values = (filter as Record<string, unknown>)[key];
    if (values === undefined) continue;
    if (!Array.isArray(values)) return false;
    if (!hasTag(event.tags, key.slice(1), values)) return false;
  }

  return true;
};

/** NIP-01 の複数フィルタは OR。空配列は偽 (`some` の定義からそうなる)。 */
export const matchesAnyFilter = (
  event: NostrEvent,
  filters: readonly RelayFilter[],
): boolean =>
  Array.isArray(filters) && filters.some((f) => matchesFilter(event, f));

const includesValue = (list: unknown, value: unknown): boolean =>
  Array.isArray(list) && list.includes(value);

/**
 * NIP-01: タグは最初の値だけが索引される —— タグ名は `tag[0]`、索引される
 * 値は `tag[1]`。
 */
const hasTag = (
  tags: unknown,
  name: string,
  values: readonly unknown[],
): boolean => {
  if (!Array.isArray(tags)) return false;
  return tags.some(
    (tag) => Array.isArray(tag) && tag[0] === name && values.includes(tag[1]),
  );
};
