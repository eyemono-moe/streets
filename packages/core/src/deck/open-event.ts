import { FOLLOW_SET_KIND } from "../lists/follow-set";
import {
  type EventAddress,
  addressOfEvent,
  addressOfNaddr,
  formatEventAddress,
} from "../nostr/address";
import type { NostrEvent } from "../nostr/event";
import { relayOf } from "../nostr/event-refs";
import { KIND_SUPPORT } from "../nostr/kind-support";
import { LONG_FORM_KIND } from "../nostr/long-form";
import type { Nip19Ref } from "../nostr/nip19";
import type { RelayUrl } from "../relay/relay-connection";
import {
  buildArticleColumn,
  buildFollowSetColumn,
  buildThreadColumn,
} from "./column-presets";
import type { ColumnDef } from "./deck";

/**
 * 住所で指すイベントを押したときに開くカラム。kind の表示を足すときは、
 * ここに開き先を足す。無い kind はそのイベント 1 件を出すカラムで開く。
 */
const ADDRESS_OPENERS: Partial<
  Record<
    number,
    (address: EventAddress, relays: readonly RelayUrl[]) => ColumnDef
  >
> = {
  [LONG_FORM_KIND]: (address, relays) =>
    buildArticleColumn(address.pubkey, address.identifier, relays),
  // リストはメンバーの投稿を読むためのもの。名前は届いたら題名に出る。
  [FOLLOW_SET_KIND]: (address) =>
    buildFollowSetColumn(address.pubkey, address.identifier, "リスト"),
};

const kindLabel = (kind: number): string =>
  KIND_SUPPORT.find((entry) => entry.kind === kind)?.summary ?? `kind:${kind}`;

/**
 * 住所のイベント 1 件を出すカラム。`relays` は naddr が運ぶリレーの手がかりで、
 * そのイベントを持っている見込みが高い。
 */
const buildAddressColumn = (
  address: EventAddress,
  relays: readonly RelayUrl[],
): ColumnDef => ({
  id: `address:${formatEventAddress(address)}`,
  title: kindLabel(address.kind),
  source: {
    kind: "literal",
    filters: [
      {
        kinds: [address.kind],
        authors: [address.pubkey],
        "#d": [address.identifier],
      },
    ],
    ...(relays.length > 0 ? { relays: [...relays] } : {}),
  },
});

export const columnForAddress = (
  address: EventAddress,
  relays: readonly RelayUrl[] = [],
): ColumnDef =>
  ADDRESS_OPENERS[address.kind]?.(address, relays) ??
  buildAddressColumn(address, relays);

/**
 * naddr から開くカラム。住所で指せない kind では `undefined` を返し、
 * 呼び出し側が開けないことを示す。
 */
export const columnForNaddr = (
  ref: Extract<Nip19Ref, { kind: "naddr" }>,
): ColumnDef | undefined => {
  const address = addressOfNaddr(ref);
  if (!address) return undefined;
  const relays = ref.relays.flatMap((relay) => {
    const url = relayOf(relay);
    return url ? [url] : [];
  });
  return columnForAddress(address, relays);
};

/** note / nevent から開くスレッド。nevent が運ぶリレーの手がかりも持っていく。 */
export const columnForNoteRef = (
  ref: Extract<Nip19Ref, { kind: "note" | "nevent" }>,
): ColumnDef =>
  buildThreadColumn(
    ref.id,
    ref.kind === "nevent"
      ? ref.relays.flatMap((relay) => {
          const url = relayOf(relay);
          return url ? [url] : [];
        })
      : [],
  );

/**
 * 投稿を押したときに開くカラム。住所を持つものは版によらず住所で開く。
 * `relays` はその投稿を受け取ったリレー。検索リレーのように普段は読まない
 * リレーで見つけたものは、そこにしか無いことがあるので、開いた先でも聞く。
 */
export const columnForEvent = (
  event: NostrEvent,
  relays: readonly RelayUrl[] = [],
): ColumnDef => {
  const address = addressOfEvent(event);
  return address
    ? columnForAddress(address, relays)
    : buildThreadColumn(event.id, relays);
};
