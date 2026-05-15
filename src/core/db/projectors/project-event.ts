import type { NostrEvent } from "nostr-tools";
import type { NostrCollections, ProjectionContext } from "../types";
import { projectEventRow } from "./event";
import { projectProfileRow, shouldReplaceProfileRow } from "./profile";

const persist = async <
  TTransaction extends { isPersisted: { promise: Promise<unknown> } },
>(
  transaction: TTransaction,
) => {
  await transaction.isPersisted.promise;
};

const mergeSeenRelays = (
  current: readonly string[],
  next: readonly string[],
): string[] => [...new Set([...current, ...next])];

const upsertEventRow = async (
  collections: NostrCollections,
  event: NostrEvent,
  context?: ProjectionContext,
) => {
  const row = projectEventRow(event, context);
  const current = collections.events.get(row.id);

  if (current) {
    await persist(
      collections.events.update(row.id, (draft) => {
        draft.pubkey = row.pubkey;
        draft.kind = row.kind;
        draft.createdAt = row.createdAt;
        draft.raw = row.raw;
        draft.seenRelays = mergeSeenRelays(current.seenRelays, row.seenRelays);
        draft.receivedAt = row.receivedAt;
      }),
    );
    return;
  }

  await persist(collections.events.insert(row));
};

const upsertProfileRow = async (
  collections: NostrCollections,
  event: NostrEvent,
  context?: ProjectionContext,
) => {
  const row = projectProfileRow(event, context);

  if (!row) {
    return;
  }

  const current = collections.profiles.get(row.pubkey);

  if (!shouldReplaceProfileRow(row, current)) {
    if (current?.sourceEventId !== row.sourceEventId) {
      return;
    }
  }

  if (current) {
    await persist(
      collections.profiles.update(row.pubkey, (draft) => {
        draft.name = row.name;
        draft.displayName = row.displayName;
        draft.about = row.about;
        draft.picture = row.picture;
        draft.nip05 = row.nip05;
        draft.lud16 = row.lud16;
        draft.sourceEventId = row.sourceEventId;
        draft.updatedAt = row.updatedAt;
        draft.receivedAt = row.receivedAt;
        draft.seenRelays = mergeSeenRelays(current.seenRelays, row.seenRelays);
      }),
    );
    return;
  }

  await persist(collections.profiles.insert(row));
};

export const projectRepositoryEvent = async (
  collections: NostrCollections,
  event: NostrEvent,
  context?: ProjectionContext,
): Promise<void> => {
  await upsertEventRow(collections, event, context);
  await upsertProfileRow(collections, event, context);
};
