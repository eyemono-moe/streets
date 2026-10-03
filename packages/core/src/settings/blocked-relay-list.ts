import { replaceTags } from "../nostr/build/draft";
import type { NostrEvent } from "../nostr/event";
import {
  type ItemVisibility,
  type PrivatePartStatus,
  decryptPrivateTags,
  rewritePrivateTags,
} from "../nostr/private-tags";
import type { RelayUrl } from "../relay/relay-connection";
import { normalizeRelayUrl } from "../relay/relay-url";
import type { Signer } from "../signer/signer";
import type { Replacement } from "../write/writer";

/**
 * 繋がないリレーの一覧（NIP-51 の kind:10006）。Outbox では、フォローした人の
 * リレーや返信相手のリレーへ自分の知らないうちに繋ぐので、そこから外したい
 * リレーをここで持つ。Amethyst・Coracle なども同じ一覧を読む。
 */
export const BLOCKED_RELAY_LIST_KIND = 10_006;

export type BlockedRelayEntry = {
  url: RelayUrl;
  visibility: ItemVisibility;
};

export type DecodedBlockedRelayList = {
  entries: readonly BlockedRelayEntry[];
  /** 非公開の項目を書けるか。 */
  privatePart: PrivatePartStatus;
  /** 非公開の項目まで読めたか。読めても、書けないことはある（NIP-04 だけの署名器）。 */
  complete: boolean;
};

export type BlockedRelayChange = {
  type: "add" | "remove";
  entry: BlockedRelayEntry;
};

const relayOf = (tag: readonly string[]): RelayUrl | undefined =>
  tag[0] === "relay" && tag[1] !== undefined
    ? normalizeRelayUrl(tag[1])
    : undefined;

const entriesOf = (
  tags: readonly (readonly string[])[],
  visibility: ItemVisibility,
): BlockedRelayEntry[] => {
  const entries: BlockedRelayEntry[] = [];
  for (const tag of tags) {
    const url = relayOf(tag);
    if (url && !entries.some((entry) => entry.url === url)) {
      entries.push({ url, visibility });
    }
  }
  return entries;
};

/** 公開の `relay` タグと、自分宛に暗号化した content の `relay` タグを読む。 */
export const decodeBlockedRelayList = async (
  event: NostrEvent | undefined,
  signer: Signer,
  pubkey: string,
): Promise<DecodedBlockedRelayList> => {
  // 一覧がまだ無くても、非公開の項目を足せるかは署名器の能力で決まる。
  if (!event) {
    return {
      entries: [],
      privatePart: signer.nip44 ? "ready" : "unavailable",
      complete: true,
    };
  }
  const publicEntries = entriesOf(event.tags, "public");
  const result = await decryptPrivateTags(event, signer, pubkey);
  if (result.status !== "ready") {
    return {
      entries: publicEntries,
      privatePart: result.status,
      complete: false,
    };
  }
  return {
    entries: [...publicEntries, ...entriesOf(result.tags, "private")],
    // NIP-04 の旧い項目を読めても、書くには NIP-44 が要る。
    privatePart: signer.nip44 ? "ready" : "unavailable",
    complete: true,
  };
};

/** 繋がない URL。公開と非公開の両方に入っていても 1 本にする。 */
export const blockedRelayUrls = (
  entries: readonly BlockedRelayEntry[],
): RelayUrl[] => [...new Set(entries.map((entry) => entry.url))];

/**
 * 外すときは、形をそろえると同じになる URL をすべて落とす。他のクライアントが
 * 形をそろえずに書いた URL（末尾の `/` が無いなど）も外せるようにするため。
 */
const changeTags = (
  tags: readonly string[][],
  change: BlockedRelayChange,
): string[][] => {
  const { url } = change.entry;
  if (change.type === "remove") {
    return tags.filter((tag) => relayOf(tag) !== url);
  }
  return tags.some((tag) => relayOf(tag) === url)
    ? [...tags]
    : [...tags, ["relay", url]];
};

/**
 * 1 本足す・外す。公開の項目を変えるときは content に触れず、非公開の項目を
 * 変えるときだけ復号し直す（拡張機能の署名器は復号のたびに確認を出すことがある）。
 */
export const changeBlockedRelays =
  (signer: Signer, pubkey: string, change: BlockedRelayChange): Replacement =>
  async (current) => {
    if (change.entry.visibility === "public") {
      return replaceTags(current, BLOCKED_RELAY_LIST_KIND, "relay", (tags) =>
        changeTags(tags, change),
      );
    }
    const content = await rewritePrivateTags(current, signer, pubkey, (tags) =>
      changeTags(tags, change),
    );
    return {
      kind: BLOCKED_RELAY_LIST_KIND,
      tags: (current?.tags ?? []).map((tag) => [...tag]),
      content,
    };
  };

/** 保存が届くまでの間も結果を見せるため、読み取った項目へ変更を当てる。 */
export const applyBlockedRelayChange = (
  entries: readonly BlockedRelayEntry[],
  change: BlockedRelayChange,
): BlockedRelayEntry[] => {
  const same = (entry: BlockedRelayEntry) =>
    entry.url === change.entry.url &&
    entry.visibility === change.entry.visibility;
  if (change.type === "remove") return entries.filter((entry) => !same(entry));
  return entries.some(same) ? [...entries] : [...entries, change.entry];
};

/**
 * 読み取り層へ当てる URL と、端末に控え直す URL。非公開の項目を読めなかった
 * ときは、控えにあった分も止め続け、控えは書き換えない —— 読めないだけで、
 * 止めていたリレーへ繋ぎ始めないため。
 */
export const blockedRelaysToApply = (
  decoded: DecodedBlockedRelayList,
  cached: readonly RelayUrl[],
): { relays: RelayUrl[]; cache?: RelayUrl[] } => {
  const relays = blockedRelayUrls(decoded.entries);
  if (!decoded.complete)
    return { relays: [...new Set([...relays, ...cached])] };
  return { relays, cache: relays };
};

/**
 * 端末に控える前回の一覧の置き場。kind:10006 はインデクサから取るので、
 * 届くまでの間に繋いでしまわないよう、起動したらまずこれを当てる。
 * 非公開の項目も入る（この端末の中だけに置く）。
 */
export const blockedRelaysStorageKey = (pubkey: string): string =>
  `streets.v1.blockedRelays.${pubkey}`;

/** 控えが無い・読めないなら、何も止めない。 */
export const loadBlockedRelaysCache = (raw: string | null): RelayUrl[] => {
  if (raw === null) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const relays: RelayUrl[] = [];
  for (const item of parsed) {
    const url = typeof item === "string" ? normalizeRelayUrl(item) : undefined;
    if (url && !relays.includes(url)) relays.push(url);
  }
  return relays;
};

export const saveBlockedRelaysCache = (relays: readonly RelayUrl[]): string =>
  JSON.stringify(relays);
