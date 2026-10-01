import type { NostrEvent } from "./event";
import type { Nip19Ref } from "./nip19";

const HEX_64 = /^[0-9a-f]{64}$/;
const DECIMAL = /^(0|[1-9][0-9]*)$/;

/**
 * 置換可能イベントの住所（`kind:pubkey:d`）。版ごとに id が変わるので、
 * 共有や引用はこの 3 つ組で指す（NIP-01・NIP-19 の naddr）。
 */
export type EventAddress = {
  kind: number;
  pubkey: string;
  identifier: string;
};

export const isAddressableKind = (kind: number): boolean =>
  kind >= 30_000 && kind < 40_000;

/** `kind:pubkey:d` を読む。`d` に `:` が入ることはあるので、3 つ目以降は繋ぎ直す。 */
export const parseEventAddress = (
  raw: string | undefined,
): EventAddress | undefined => {
  if (!raw) return undefined;
  const [rawKind, pubkey, ...rest] = raw.split(":");
  if (!DECIMAL.test(rawKind ?? "") || !HEX_64.test(pubkey ?? "")) {
    return undefined;
  }
  if (rest.length === 0) return undefined;
  const kind = Number(rawKind);
  if (!isAddressableKind(kind)) return undefined;
  return { kind, pubkey: pubkey as string, identifier: rest.join(":") };
};

export const formatEventAddress = (address: EventAddress): string =>
  `${address.kind}:${address.pubkey}:${address.identifier}`;

/** 住所で指せるイベントならその住所。`d` が無いものは指し示せないので返さない。 */
export const addressOfEvent = (event: NostrEvent): EventAddress | undefined => {
  if (!isAddressableKind(event.kind)) return undefined;
  const identifier = event.tags.find((tag) => tag[0] === "d")?.[1];
  if (identifier === undefined) return undefined;
  return { kind: event.kind, pubkey: event.pubkey, identifier };
};

/** naddr が指す住所。住所で指せない kind（通常の置換可能イベントなど）は扱わない。 */
export const addressOfNaddr = (
  ref: Extract<Nip19Ref, { kind: "naddr" }>,
): EventAddress | undefined =>
  isAddressableKind(ref.eventKind) && HEX_64.test(ref.pubkey)
    ? { kind: ref.eventKind, pubkey: ref.pubkey, identifier: ref.identifier }
    : undefined;
