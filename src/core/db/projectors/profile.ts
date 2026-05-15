import type { NostrEvent } from "nostr-tools";
import type {
  NostrEventRow,
  NostrProfileRow,
  ProjectionContext,
} from "../types";

const getReceivedAt = (context?: ProjectionContext): number =>
  context?.receivedAt ?? Date.now();

const getSeenRelays = (context?: ProjectionContext): readonly string[] =>
  context?.seenRelays ?? [];

export const projectEventRow = (
  event: NostrEvent,
  context?: ProjectionContext,
): NostrEventRow => ({
  id: event.id,
  pubkey: event.pubkey,
  kind: event.kind,
  createdAt: event.created_at,
  raw: event,
  seenRelays: getSeenRelays(context),
  receivedAt: getReceivedAt(context),
});

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

  return next.updatedAt > current.updatedAt;
};
