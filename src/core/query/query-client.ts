import type { NostrEvent } from "nostr-tools";
import {
  upsertEventFeedItem,
  upsertEventFeedState,
} from "../db/projectors/event-feed";
import { projectRepositoryEvent } from "../db/projectors/project-event";
import type { NostrCollections } from "../db/types";
import type {
  NostrEventQuery,
  NostrRepository,
  RelayUrl,
} from "../repository/nostr-repository";
import { subscribeToTransportEvents } from "../transport/rx-nostr-transport";
import type {
  NostrSubscription,
  NostrTransport,
  NostrTransportEventPacket,
  NostrTransportFilter,
} from "../transport/transport";
import type { EventFeedDefinition } from "./event-feed";
import { withBackfillCursor } from "./event-feed";

export type EnsureEventOptions = {
  id: string;
  relays?: readonly RelayUrl[];
};

export type EnsureProfileOptions = {
  pubkey: string;
  relays?: readonly RelayUrl[];
};

export type EnsureEventRelationsOptions = {
  query: NostrEventQuery;
  relays?: readonly RelayUrl[];
};

export type FetchEventPageOptions = {
  filter: NostrTransportFilter;
  relays?: readonly RelayUrl[];
};

export type NostrCoreQueryClient = {
  ensureEvent(options: EnsureEventOptions): Promise<NostrEvent | undefined>;
  ensureProfile(options: EnsureProfileOptions): Promise<NostrEvent | undefined>;
  ensureEventRelations(
    options: EnsureEventRelationsOptions,
  ): Promise<NostrEvent[]>;
  fetchEventPage(
    options: FetchEventPageOptions,
  ): Promise<NostrTransportEventPacket[]>;
  ensureEventFeed(definition: EventFeedDefinition): void;
  fetchMoreEventFeed(feedId: string): Promise<NostrTransportEventPacket[]>;
  stopEventFeed(feedId: string): void;
  dispose(): void;
};

export type NostrCoreQueryClientDependencies = {
  transport: NostrTransport;
  repository: NostrRepository;
  collections: NostrCollections;
  now?: () => number;
  requestTimeoutMs?: number;
};

export const createNostrCoreQueryClient = ({
  transport,
  repository,
  collections,
  now = Date.now,
  requestTimeoutMs = 10_000,
}: NostrCoreQueryClientDependencies): NostrCoreQueryClient => {
  const activeSubscriptions = new Set<NostrSubscription>();
  const eventFeeds = new Map<
    string,
    { definition: EventFeedDefinition; closeLive?: () => void }
  >();

  const projectTransportEvent = async (event: NostrEvent, relay: RelayUrl) => {
    await repository.putEvent({ event, relay });
    await projectRepositoryEvent(collections, event, {
      receivedAt: now(),
      seenRelays: await repository.getSeenRelays(event.id),
    });
  };

  const projectFeedEvent = async (
    feedId: string,
    event: NostrEvent,
    relay: RelayUrl,
  ) => {
    await projectTransportEvent(event, relay);
    await upsertEventFeedItem(collections, {
      feedId,
      event,
      insertedAt: now(),
    });
    const current = collections.eventFeedStates.get(feedId);
    await upsertEventFeedState(collections, {
      feedId,
      strategy: current?.strategy ?? "liveBackfill",
      status: "live",
      updatedAt: now(),
      oldestCreatedAt:
        current?.oldestCreatedAt === undefined
          ? event.created_at
          : Math.min(current.oldestCreatedAt, event.created_at),
      newestCreatedAt:
        current?.newestCreatedAt === undefined
          ? event.created_at
          : Math.max(current.newestCreatedAt, event.created_at),
      hasMoreBackfill: current?.hasMoreBackfill ?? true,
      activeRelays: current?.activeRelays ?? [],
      eoseRelays: current?.eoseRelays ?? [],
    });
  };

  const trackSubscription = (
    subscription: NostrSubscription,
    { closeAfterMs }: { closeAfterMs?: number } = {},
  ) => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const close = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = undefined;
      }
      if (activeSubscriptions.delete(subscription)) {
        subscription.close();
      }
    };
    activeSubscriptions.add(subscription);
    if (closeAfterMs !== undefined) {
      timeoutId = setTimeout(close, closeAfterMs);
    }
    return close;
  };

  const subscribeAndEmit = (
    options: Parameters<NostrTransport["subscribe"]>[0],
    { closeOnFirstEvent }: { closeOnFirstEvent: boolean },
  ) => {
    const closeTrackedSubscriptionRef: { current?: () => void } = {};
    const subscription = subscribeToTransportEvents(
      transport,
      options,
      (packet) => {
        void projectTransportEvent(packet.event, packet.from)
          .catch(() => {
            // Projection failures are handled by the caller-facing validation layer later;
            // this boundary prevents fire-and-forget projection from creating unhandled rejections.
          })
          .finally(() => {
            if (closeOnFirstEvent) {
              closeTrackedSubscriptionRef.current?.();
            }
          });
      },
    );
    closeTrackedSubscriptionRef.current = trackSubscription(subscription, {
      closeAfterMs: options.mode === "forward" ? undefined : requestTimeoutMs,
    });
    subscription.emit(options.filters);
    return subscription;
  };

  return {
    async ensureEvent({ id, relays }) {
      const cached = await repository.getEvent(id);
      if (cached) {
        return cached;
      }

      subscribeAndEmit(
        {
          filters: { ids: [id] },
          relays,
          mode: "backward",
        },
        { closeOnFirstEvent: true },
      );
      return undefined;
    },

    async ensureProfile({ pubkey, relays }) {
      const cached = await repository.getLatestReplaceable(0, pubkey);
      if (cached) {
        return cached;
      }

      subscribeAndEmit(
        {
          filters: { authors: [pubkey], kinds: [0], limit: 1 },
          relays,
          mode: "backward",
        },
        { closeOnFirstEvent: true },
      );
      return undefined;
    },

    async ensureEventRelations({ query, relays }) {
      const cached = await repository.queryEvents(query);
      subscribeAndEmit(
        {
          filters: toTransportFilter(query),
          relays,
          mode: "backward",
        },
        { closeOnFirstEvent: false },
      );
      return cached;
    },

    async fetchEventPage({ filter, relays }) {
      return new Promise((resolve) => {
        const packetsByEventId = new Map<string, NostrTransportEventPacket>();
        let done = false;
        let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
        const subscription = subscribeToTransportEvents(
          transport,
          {
            filters: filter,
            relays,
            mode: "backward",
          },
          (packet) => {
            if (!packetsByEventId.has(packet.event.id)) {
              packetsByEventId.set(packet.event.id, packet);
            }
            void projectTransportEvent(packet.event, packet.from).catch(() => {
              // Keep page collection resilient if one projection rejects.
            });
          },
        );
        const close = trackSubscription(subscription);
        const finish = () => {
          if (done) {
            return;
          }
          done = true;
          if (timeoutHandle !== undefined) {
            clearTimeout(timeoutHandle);
            timeoutHandle = undefined;
          }
          close();
          resolve([...packetsByEventId.values()]);
        };
        timeoutHandle = setTimeout(finish, requestTimeoutMs);
        subscription.events$.subscribe({ complete: finish });
        subscription.emit(filter);
        subscription.complete();
      });
    },

    ensureEventFeed(definition) {
      const existing = eventFeeds.get(definition.id);
      if (existing?.closeLive) {
        eventFeeds.set(definition.id, { ...existing, definition });
        return;
      }

      void upsertEventFeedState(collections, {
        feedId: definition.id,
        strategy: definition.strategy,
        status: "loading",
        updatedAt: now(),
        activeRelays: definition.relays ?? [],
        eoseRelays: [],
        hasMoreBackfill: definition.strategy === "liveBackfill",
      }).catch(() => {
        // Feed state initialization is best-effort; callers observe later state rows.
      });

      if (
        definition.strategy !== "liveBackfill" &&
        definition.strategy !== "liveOnly"
      ) {
        eventFeeds.set(definition.id, { definition });
        return;
      }

      const subscription = subscribeToTransportEvents(
        transport,
        {
          filters: definition.filters,
          relays: definition.relays,
          mode: "forward",
        },
        (packet) => {
          void projectFeedEvent(definition.id, packet.event, packet.from).catch(
            () => {
              // Feed projections are best-effort at the transport boundary; callers observe state rows.
            },
          );
        },
      );
      const closeLive = trackSubscription(subscription);
      subscription.emit(definition.filters);
      eventFeeds.set(definition.id, { definition, closeLive });
    },

    async fetchMoreEventFeed(feedId) {
      const registered = eventFeeds.get(feedId);
      if (!registered) {
        return [];
      }
      const state = collections.eventFeedStates.get(feedId);
      const until =
        state?.oldestCreatedAt === undefined
          ? undefined
          : state.oldestCreatedAt - 1;
      const filter = withBackfillCursor(registered.definition.filters, until);

      return new Promise((resolve) => {
        const packetsByEventId = new Map<string, NostrTransportEventPacket>();
        let done = false;
        let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
        const subscription = subscribeToTransportEvents(
          transport,
          {
            filters: filter,
            relays: registered.definition.relays,
            mode: "backward",
          },
          (packet) => {
            if (!packetsByEventId.has(packet.event.id)) {
              packetsByEventId.set(packet.event.id, packet);
            }
            void projectFeedEvent(feedId, packet.event, packet.from).catch(
              () => {
                // Keep feed pagination resilient if one projection rejects.
              },
            );
          },
        );
        const close = trackSubscription(subscription);
        const finish = () => {
          if (done) {
            return;
          }
          done = true;
          if (timeoutHandle !== undefined) {
            clearTimeout(timeoutHandle);
            timeoutHandle = undefined;
          }
          close();
          resolve([...packetsByEventId.values()]);
        };
        timeoutHandle = setTimeout(finish, requestTimeoutMs);
        subscription.events$.subscribe({ complete: finish });
        subscription.emit(filter);
        subscription.complete();
      });
    },

    stopEventFeed(feedId) {
      const registered = eventFeeds.get(feedId);
      registered?.closeLive?.();
      eventFeeds.delete(feedId);
    },

    dispose() {
      for (const registered of eventFeeds.values()) {
        registered.closeLive?.();
      }
      eventFeeds.clear();
      for (const subscription of activeSubscriptions) {
        subscription.close();
      }
      activeSubscriptions.clear();
    },
  };
};

const toTransportFilter = (query: NostrEventQuery): NostrTransportFilter => ({
  ids: query.ids ? [...query.ids] : undefined,
  authors: query.authors ? [...query.authors] : undefined,
  kinds: query.kinds ? [...query.kinds] : undefined,
  limit: query.limit,
  ...Object.fromEntries(
    Object.entries(query.tags ?? {}).map(([name, values]) => [
      `#${name}`,
      [...values],
    ]),
  ),
});
