import type { NostrEvent } from "nostr-tools";
import type { NostrEventRow, ProjectionContext } from "../types";

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
