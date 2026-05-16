import type { NostrEvent } from "nostr-tools";
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

  const projectTransportEvent = async (event: NostrEvent, relay: RelayUrl) => {
    await repository.putEvent({ event, relay });
    await projectRepositoryEvent(collections, event, {
      receivedAt: now(),
      seenRelays: await repository.getSeenRelays(event.id),
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

    dispose() {
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
