import type { NostrEvent } from "../nostr/event";
import type { EventRef } from "../nostr/event-refs";
import { relayOf } from "../nostr/event-refs";
import type { RelayUrl } from "../relay/relay-connection";
import { normalizeRelayUrl } from "../relay/relay-url";

/** NIP-51 のリレーセット。 */
export const RELAY_SET_KIND = 30_002;
/** NIP-51 のブックマークセット。 */
export const BOOKMARK_SET_KIND = 30_003;
/** NIP-51 のキュレーションセット（記事・投稿）。 */
export const CURATION_SET_KIND = 30_004;
/** NIP-51 の動画のキュレーションセット。 */
export const VIDEO_SET_KIND = 30_005;
/** NIP-51 の画像のキュレーションセット。 */
export const PICTURE_SET_KIND = 30_006;
/** NIP-51 の興味のセット（ハッシュタグ）。 */
export const INTEREST_SET_KIND = 30_015;
/** NIP-51 のスターターパック。 */
export const STARTER_PACK_KIND = 39_089;
/** NIP-51 のメディアのスターターパック。 */
export const MEDIA_STARTER_PACK_KIND = 39_092;

/**
 * 流れてきたリストの公開の部分。非公開の中身（暗号化された `content`）は
 * 持ち主にしか読めないので、数にも入れない。
 */
export type ListSet = {
  identifier: string;
  title: string | undefined;
  description: string | undefined;
  image: string | undefined;
  /** `p` タグ。同じ人は 1 人に数える。 */
  pubkeys: string[];
  /** `e` / `a` タグ。書かれた順。 */
  events: EventRef[];
  /** `relay` タグ。同じリレーは 1 つに数える。 */
  relays: RelayUrl[];
  /** `t` タグ。 */
  hashtags: string[];
};

const HEX64 = /^[0-9a-f]{64}$/;
/** `kind:pubkey:d`。`d` は空でもよい。 */
const ADDRESS = /^\d+:[0-9a-f]{64}:/;

const tagValue = (event: NostrEvent, name: string): string | undefined => {
  const value = event.tags.find((tag) => tag[0] === name)?.[1]?.trim();
  return value ? value : undefined;
};

const unique = <T>(values: T[]): T[] => [...new Set(values)];

export const readListSet = (event: NostrEvent): ListSet => {
  const pubkeys: string[] = [];
  const events: EventRef[] = [];
  const relays: RelayUrl[] = [];
  const hashtags: string[] = [];
  for (const tag of event.tags) {
    const value = tag[1];
    if (!value) continue;
    switch (tag[0]) {
      case "p":
        if (HEX64.test(value)) pubkeys.push(value);
        break;
      case "e":
        if (HEX64.test(value)) {
          const relay = relayOf(tag[2]);
          events.push({ form: "id", id: value, ...(relay ? { relay } : {}) });
        }
        break;
      case "a":
        if (ADDRESS.test(value)) {
          const relay = relayOf(tag[2]);
          events.push({
            form: "address",
            address: value,
            ...(relay ? { relay } : {}),
          });
        }
        break;
      case "relay": {
        const url = normalizeRelayUrl(value);
        if (url) relays.push(url);
        break;
      }
      case "t":
        hashtags.push(value);
        break;
    }
  }
  return {
    identifier: tagValue(event, "d") ?? "",
    // `name` は NIP-51 で `title` に替わる前の書き方。古いリストに残っている。
    title: tagValue(event, "title") ?? tagValue(event, "name"),
    description: tagValue(event, "description"),
    image: tagValue(event, "image"),
    pubkeys: unique(pubkeys),
    events,
    relays: unique(relays),
    hashtags: unique(hashtags),
  };
};
