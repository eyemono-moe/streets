import type { NostrEvent } from "nostr-tools";
import { shouldReplaceEvent } from "../../nostr/replaceable";
import type { NostrProfileRow, ProjectionContext } from "../types";

const getReceivedAt = (context?: ProjectionContext): number =>
  context?.receivedAt ?? Date.now();

const getSeenRelays = (context?: ProjectionContext): readonly string[] =>
  context?.seenRelays ?? [];

const getString = (metadata: Record<string, unknown>, key: string) => {
  const value = metadata[key];
  return typeof value === "string" ? value : undefined;
};

const parseMetadata = (content: string): Record<string, unknown> => {
  try {
    const parsed = JSON.parse(content) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
};

export const projectProfileRow = (
  event: NostrEvent,
  context?: ProjectionContext,
): NostrProfileRow | undefined => {
  if (event.kind !== 0) {
    return undefined;
  }

  const metadata = parseMetadata(event.content);

  return {
    pubkey: event.pubkey,
    name: getString(metadata, "name"),
    displayName:
      getString(metadata, "display_name") ?? getString(metadata, "displayName"),
    about: getString(metadata, "about"),
    picture: getString(metadata, "picture"),
    nip05: getString(metadata, "nip05"),
    lud16: getString(metadata, "lud16"),
    sourceEventId: event.id,
    updatedAt: event.created_at,
    receivedAt: getReceivedAt(context),
    seenRelays: getSeenRelays(context),
  };
};

const profileRowSourceEvent = (row: NostrProfileRow): NostrEvent => ({
  id: row.sourceEventId,
  pubkey: row.pubkey,
  kind: 0,
  created_at: row.updatedAt,
  tags: [],
  content: "",
  sig: "",
});

export const shouldReplaceProfileRow = (
  next: NostrProfileRow | undefined,
  current: NostrProfileRow | undefined,
): boolean => {
  if (!next) {
    return false;
  }
  if (!current) {
    return true;
  }

  return shouldReplaceEvent(
    profileRowSourceEvent(next),
    profileRowSourceEvent(current),
  );
};
