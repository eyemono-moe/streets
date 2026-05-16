import type { NostrEvent } from "nostr-tools";
import { projectRepositoryEvent } from "../db/projectors/project-event";
import type { NostrCollections } from "../db/types";
import type { NostrRepository, RelayUrl } from "../repository/nostr-repository";
import { subscribeToTransportEvents } from "../transport/rx-nostr-transport";
import type { NostrSubscription, NostrTransport } from "../transport/transport";

export type EnsureEventOptions = {
  id: string;
  relays?: readonly RelayUrl[];
};

export type EnsureProfileOptions = {
  pubkey: string;
  relays?: readonly RelayUrl[];
};

export type NostrCoreQueryClient = {
  ensureEvent(options: EnsureEventOptions): Promise<NostrEvent | undefined>;
  ensureProfile(options: EnsureProfileOptions): Promise<NostrEvent | undefined>;
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

  const subscribeAndEmit: NostrTransport["subscribe"] = (options) => {
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
            if (options.mode !== "forward") {
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

      subscribeAndEmit({
        filters: { ids: [id] },
        relays,
        mode: "backward",
      });
      return undefined;
    },

    async ensureProfile({ pubkey, relays }) {
      const cached = await repository.getLatestReplaceable(0, pubkey);
      if (cached) {
        return cached;
      }

      subscribeAndEmit({
        filters: { authors: [pubkey], kinds: [0], limit: 1 },
        relays,
        mode: "backward",
      });
      return undefined;
    },

    dispose() {
      for (const subscription of activeSubscriptions) {
        subscription.close();
      }
      activeSubscriptions.clear();
    },
  };
};
