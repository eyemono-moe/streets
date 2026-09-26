import { CHANNEL_CREATE_KIND } from "../nostr/channel";
import { relayOf } from "../nostr/event-refs";
import { decodeNip19 } from "../nostr/nip19";
import { buildChannelColumn, buildUserColumn } from "./column-presets";
import type { ColumnDef } from "./deck";

/** URL の 1 区画（`nevent1…` など）から開くカラム。デッキへは保存しない。 */
export const TEMP_COLUMN_ID = "temp";

/**
 * URL から開くカラムを作る。読めない文字列では `undefined` を返し、
 * 呼び出し側が「開けません」を出す —— 黙って空のカラムを出さない。
 */
export const tempColumnFor = (entity: string): ColumnDef | undefined => {
  const ref = decodeNip19(entity.trim());
  if (!ref) return undefined;

  if (ref.kind === "npub" || ref.kind === "nprofile") {
    return { ...buildUserColumn(ref.pubkey), id: TEMP_COLUMN_ID };
  }

  // チャンネル（kind:40）を指す nevent は、発言を並べるチャンネルのカラムで開く。
  if (ref.kind === "nevent" && ref.eventKind === CHANNEL_CREATE_KIND) {
    const relays = ref.relays.flatMap((relay) => {
      const url = relayOf(relay);
      return url ? [url] : [];
    });
    return {
      ...buildChannelColumn(ref.id, undefined, relays),
      id: TEMP_COLUMN_ID,
    };
  }

  if (ref.kind === "note" || ref.kind === "nevent") {
    const relay = ref.kind === "nevent" ? relayOf(ref.relays[0]) : undefined;
    return {
      id: TEMP_COLUMN_ID,
      title: "ノート",
      source: {
        kind: "literal",
        filters: [{ ids: [ref.id] }],
        // nevent が運ぶリレーヒントは、そのイベントを持っている可能性が高い。
        ...(relay ? { relays: [relay] } : {}),
      },
    };
  }

  // naddr（置換可能イベントの座標）はまだ引けない。
  return undefined;
};
