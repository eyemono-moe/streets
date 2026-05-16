import type { NostrEvent } from "nostr-tools";
import type { NostrCollections } from "../db/types";
import type {
  NostrEventQuery,
  NostrRepository,
  RelayUrl,
} from "../repository/nostr-repository";
import type { FeedStateStore } from "../store/feed-state-store";
import { MemoryFeedStateStore } from "../store/memory-feed-state-store";
import { subscribeToTransportEvents } from "../transport/rx-nostr-transport";
import type {
  NostrSubscription,
  NostrTransport,
  NostrTransportEventPacket,
  NostrTransportFilter,
} from "../transport/transport";
import type { EventFeedDefinition } from "./event-feed";
import { withBackfillCursor, withLiveCursor } from "./event-feed";

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
  feedStateStore?: FeedStateStore;
  now?: () => number;
  requestTimeoutMs?: number;
};

export const createNostrCoreQueryClient = ({
  transport,
  repository,
  collections: _collections,
  feedStateStore = new MemoryFeedStateStore(),
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
  };

  const projectFeedEvent = async (
    feedId: string,
    event: NostrEvent,
    relay: RelayUrl,
  ) => {
    await projectTransportEvent(event, relay);
    const current = feedStateStore.getSnapshot(feedId);
    feedStateStore.addItem(feedId, event);
    feedStateStore.setStatus(feedId, "live", {
      hasMoreBackfill: current.hasMoreBackfill,
      activeRelays: current.activeRelays,
      eoseRelays: current.eoseRelays,
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

      feedStateStore.setStatus(definition.id, "loading", {
        activeRelays: definition.relays ?? [],
        eoseRelays: [],
        hasMoreBackfill: definition.strategy === "liveBackfill",
      });

      if (
        definition.strategy !== "liveBackfill" &&
        definition.strategy !== "liveOnly"
      ) {
        eventFeeds.set(definition.id, { definition });
        return;
      }

      const liveFilter = withLiveCursor(
        definition.filters,
        Math.floor(now() / 1_000),
      );
      const subscription = subscribeToTransportEvents(
        transport,
        {
          filters: liveFilter,
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
      subscription.emit(liveFilter);
      eventFeeds.set(definition.id, { definition, closeLive });
    },

    async fetchMoreEventFeed(feedId) {
      const registered = eventFeeds.get(feedId);
      if (!registered) {
        return [];
      }
      const state = feedStateStore.getSnapshot(feedId);
      const until =
        state.oldestCreatedAt === undefined
          ? undefined
          : state.oldestCreatedAt - 1;
      const filter = withBackfillCursor(
        registered.definition.filters,
        until,
        registered.definition.limit,
      );

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
        const finish = async () => {
          if (done) {
            return;
          }
          done = true;
          if (timeoutHandle !== undefined) {
            clearTimeout(timeoutHandle);
            timeoutHandle = undefined;
          }
          close();
          const packets = [...packetsByEventId.values()];
          const current = feedStateStore.getSnapshot(feedId);
          const hasMoreBackfill =
            registered.definition.limit === undefined
              ? packets.length > 0
              : packets.length >= registered.definition.limit;
          feedStateStore.setStatus(feedId, "live", {
            hasMoreBackfill,
            activeRelays:
              current.activeRelays.length > 0
                ? current.activeRelays
                : (registered.definition.relays ?? []),
            eoseRelays: current.eoseRelays,
          });
          resolve(packets);
        };
        timeoutHandle = setTimeout(() => void finish(), requestTimeoutMs);
        subscription.events$.subscribe({ complete: () => void finish() });
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
