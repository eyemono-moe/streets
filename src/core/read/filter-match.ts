import type { NostrEvent } from "../nostr/event";
import type { RelayFilter } from "../relay/relay-connection";

/**
 * NIP-01 のフィルタ意味論をローカルで再実装したもの。
 *
 * **この関数はいかなる入力に対しても真偽値を返し、例外を投げない全域関数
 * である。** `onEvent` はソケットのメッセージ処理から呼ばれるため、ここで
 * 投げると同じリレーを見ている他のセクションへの配信ごと巻き込みかねない。
 * 未検証なのは引数 2 つとも: `event` は未検証のワイヤデータである ——
 * `websocket-relay-connection.ts` は `typeof event === "object"` だけを
 * 確認して `NostrEvent` にキャストしており、構造検証 (`isNostrEvent`) が
 * 走るのは `EventStore.put` の内部、つまりこの関数より後ろである。`filter`
 * も同様に静的型を信用してはならない —— `RelayFilter` は型注釈であって
 * 実行時の保証ではなく、想定外の型の値が来ても投げずに「その条件を満たさ
 * ない」に倒す。どちらの引数も先頭で構造ガードする (下記)。
 *
 * **原則: REQ より厳しくなってはならない。** 判断に迷う条件は緩い側へ倒す。
 * 厳しすぎれば「頼んだのに黙って捨てる」(ADR-0011 が禁じる隠れた劣化) になり、
 * 緩すぎても今日と同じ状態に戻るだけである。この 2 つは対称ではない。
 */
export const matchesFilter = (
  event: NostrEvent,
  filter: RelayFilter,
): boolean => {
  if (typeof event !== "object" || event === null) return false;
  if (typeof filter !== "object" || filter === null) return false;

  // `limit` と `search` はここで一切読まない。それがこの 2 つを「照合条件では
  // ない」と扱うことの実装である。NIP-01: "The limit property of a filter is
  // only valid for the initial query and MUST be ignored afterwards."
  // `search` (NIP-50) は全文検索であり、ローカルでは判定できない —— 判定でき
  // ないものを不一致に倒すと、正当なイベントを誤って捨てる。

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
    // RelayFilter の索引シグネチャは `#${string}` なので、任意の string での
    // 添字アクセスは型が付かない。ここだけ Record として読む。
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
 * NIP-01: "the event and filter condition values must have at least one item
 * in common"、かつ "Only the first value in any given tag is indexed" ——
 * タグ名は `tag[0]`、索引される値は `tag[1]` である。
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
