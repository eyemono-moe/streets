import type { NostrSource } from "../read/source";
import type { RelayUrl } from "../relay/relay-connection";
import { normalizeRelayUrl } from "../relay/relay-url";
import type { ColumnDef } from "./deck";

const normalized = (relays: readonly string[]): RelayUrl[] => [
  ...new Set(relays.flatMap((relay) => normalizeRelayUrl(relay) ?? [])),
];

/** 開くカラムに、見せるものがあると分かっているリレーを覚えさせる。 */
export const withKnownRelays = (
  column: ColumnDef,
  relays: readonly string[],
): ColumnDef => {
  const known = normalized([...(column.knownRelays ?? []), ...relays]);
  return known.length > 0 ? { ...column, knownRelays: known } : column;
};

/**
 * カラムが覚えているリレーを、取得の行き先に足す。`relays` で行き先を決めて
 * いる取得（チャンネルや、リレーを選んで作ったカラム）は、そこだけを読む約束
 * なので触らない。
 */
export const addKnownRelays = (
  source: NostrSource | undefined,
  column: ColumnDef,
): NostrSource | undefined => {
  if (!source || source.relays) return source;
  const extra = normalized([
    ...(source.extraRelays ?? []),
    ...(column.knownRelays ?? []),
  ]);
  return extra.length > 0 ? { ...source, extraRelays: extra } : source;
};
