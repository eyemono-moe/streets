import type { NostrEvent } from "nostr-tools";

export const isRegularReplaceableKind = (kind: number): boolean =>
  kind === 0 || kind === 3 || (kind >= 10_000 && kind < 20_000);

export const isParameterizedReplaceableKind = (kind: number): boolean =>
  kind >= 30_000 && kind < 40_000;

export const getRegularReplaceableEventKey = (
  kind: number,
  pubkey: string,
): string => `${kind}:${pubkey}`;

export const getParameterizedReplaceableEventKey = (
  kind: number,
  pubkey: string,
  d: string,
): string => `${kind}:${pubkey}:${d}`;

const getDTagValue = (event: NostrEvent): string | undefined => {
  for (const tag of event.tags) {
    if (tag[0] === "d") {
      return tag[1];
    }
  }

  return undefined;
};

export const getReplaceableEventKey = (
  event: NostrEvent,
): string | undefined => {
  if (isRegularReplaceableKind(event.kind)) {
    return getRegularReplaceableEventKey(event.kind, event.pubkey);
  }

  if (isParameterizedReplaceableKind(event.kind)) {
    const d = getDTagValue(event) ?? "";
    return getParameterizedReplaceableEventKey(event.kind, event.pubkey, d);
  }

  return undefined;
};

export const shouldReplaceEvent = (
  next: NostrEvent,
  current: NostrEvent,
): boolean => {
  if (next.created_at !== current.created_at) {
    return next.created_at > current.created_at;
  }

  return next.id > current.id;
};
