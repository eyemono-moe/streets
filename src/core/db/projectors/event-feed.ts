import type { NostrEvent } from "nostr-tools";
import type { RelayUrl } from "../../repository/nostr-repository";
import type {
  EventFeedItemRow,
  EventFeedStateRow,
  EventFeedStatus,
  EventFeedStrategy,
  NostrCollections,
} from "../types";

const persist = async <
  TTransaction extends { isPersisted: { promise: Promise<unknown> } },
>(
  transaction: TTransaction,
) => {
  await transaction.isPersisted.promise;
};

export type ProjectEventFeedItemInput = {
  feedId: string;
  event: NostrEvent;
  insertedAt?: number;
  matchedFilterIndex?: number;
  score?: number;
};

export const getEventFeedItemId = (feedId: string, eventId: string): string =>
  `${feedId}:${eventId}`;

export const projectEventFeedItem = ({
  feedId,
  event,
  insertedAt = Date.now(),
  matchedFilterIndex,
  score,
}: ProjectEventFeedItemInput): EventFeedItemRow => ({
  id: getEventFeedItemId(feedId, event.id),
  feedId,
  eventId: event.id,
  pubkey: event.pubkey,
  kind: event.kind,
  createdAt: event.created_at,
  insertedAt,
  matchedFilterIndex,
  score,
});

export const upsertEventFeedItem = async (
  collections: NostrCollections,
  input: ProjectEventFeedItemInput,
): Promise<void> => {
  const row = projectEventFeedItem(input);
  const current = collections.eventFeedItems.get(row.id);

  if (current) {
    await persist(
      collections.eventFeedItems.update(row.id, (draft) => {
        draft.pubkey = row.pubkey;
        draft.kind = row.kind;
        draft.createdAt = row.createdAt;
        draft.insertedAt = row.insertedAt;
        draft.matchedFilterIndex = row.matchedFilterIndex;
        draft.score = row.score;
      }),
    );
    return;
  }

  await persist(collections.eventFeedItems.insert(row));
};

export type UpsertEventFeedStateInput = {
  feedId: string;
  strategy: EventFeedStrategy;
  status: EventFeedStatus;
  updatedAt?: number;
  error?: string;
  oldestCreatedAt?: number;
  newestCreatedAt?: number;
  hasMoreBackfill?: boolean;
  eoseRelays?: readonly RelayUrl[];
  activeRelays?: readonly RelayUrl[];
};

const projectEventFeedState = ({
  feedId,
  strategy,
  status,
  updatedAt = Date.now(),
  error,
  oldestCreatedAt,
  newestCreatedAt,
  hasMoreBackfill,
  eoseRelays = [],
  activeRelays = [],
}: UpsertEventFeedStateInput): EventFeedStateRow => ({
  id: feedId,
  feedId,
  strategy,
  status,
  error,
  oldestCreatedAt,
  newestCreatedAt,
  hasMoreBackfill,
  eoseRelays,
  activeRelays,
  updatedAt,
});

export const upsertEventFeedState = async (
  collections: NostrCollections,
  input: UpsertEventFeedStateInput,
): Promise<void> => {
  const row = projectEventFeedState(input);
  const current = collections.eventFeedStates.get(row.id);

  if (current) {
    await persist(
      collections.eventFeedStates.update(row.id, (draft) => {
        draft.strategy = row.strategy;
        draft.status = row.status;
        draft.error = row.error;
        draft.oldestCreatedAt = row.oldestCreatedAt;
        draft.newestCreatedAt = row.newestCreatedAt;
        draft.hasMoreBackfill = row.hasMoreBackfill;
        draft.eoseRelays = [...row.eoseRelays];
        draft.activeRelays = [...row.activeRelays];
        draft.updatedAt = row.updatedAt;
      }),
    );
    return;
  }

  await persist(collections.eventFeedStates.insert(row));
};
