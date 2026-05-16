import { subscribeToTransportEvents } from "../transport/rx-nostr-transport";
import type {
  NostrSubscription,
  NostrTransport,
  NostrTransportEventPacket,
  NostrTransportFilter,
  NostrTransportSubscribeOptions,
} from "../transport/transport";

export type QueryRegistryHandle = {
  complete(): void;
  close(): void;
};

export type QueryRegistryOpenOptions = {
  options: NostrTransportSubscribeOptions;
  closeOnFirstEvent?: boolean;
  closeAfterMs?: number;
  onEvent(packet: NostrTransportEventPacket): void;
  onComplete?(): void;
};

export type QueryRegistry = {
  open(options: QueryRegistryOpenOptions): QueryRegistryHandle;
  dispose(): void;
};

export type QueryRegistryDependencies = {
  transport: NostrTransport;
  requestTimeoutMs?: number;
};

type Listener = {
  onEvent(packet: NostrTransportEventPacket): void;
  onComplete?(): void;
  closeOnFirstEvent: boolean;
  timeoutId?: ReturnType<typeof setTimeout>;
  closed: boolean;
};

type SharedSubscription = {
  key: string;
  subscription: NostrSubscription;
  listeners: Set<Listener>;
  closed: boolean;
};

const sortedValues = <T extends string | number>(
  values: readonly T[] | undefined,
) =>
  values === undefined
    ? undefined
    : [...values].sort((left, right) =>
        String(left).localeCompare(String(right)),
      );

const hasLazyFilterValue = (filter: NostrTransportFilter) =>
  Object.values(filter).some((value) => typeof value === "function");

const hasLazyFilterValues = (
  filters: NostrTransportSubscribeOptions["filters"],
) => {
  const filterList = Array.isArray(filters) ? filters : [filters];
  return filterList.some((filter) => hasLazyFilterValue(filter));
};

const canonicalizeFilter = (filter: NostrTransportFilter) => {
  const entries = Object.entries(filter)
    .map(([key, value]) => {
      if (Array.isArray(value)) {
        return [
          key,
          sortedValues(value as readonly (string | number)[]),
        ] as const;
      }
      return [key, value] as const;
    })
    .sort(([left], [right]) => left.localeCompare(right));

  return Object.fromEntries(entries);
};

const canonicalizeFilters = (
  filters: NostrTransportSubscribeOptions["filters"],
) => {
  const filterList = Array.isArray(filters) ? filters : [filters];
  return filterList
    .map((filter) => canonicalizeFilter(filter))
    .sort((left, right) =>
      JSON.stringify(left).localeCompare(JSON.stringify(right)),
    );
};

const sharedQueryKeyFor = (options: NostrTransportSubscribeOptions) => {
  if (options.mode !== "forward" || hasLazyFilterValues(options.filters)) {
    return undefined;
  }

  return JSON.stringify({
    mode: options.mode,
    relays: sortedValues(options.relays),
    defaultReadRelays: options.defaultReadRelays,
    filters: canonicalizeFilters(options.filters),
  });
};

export const createQueryRegistry = ({
  transport,
  requestTimeoutMs = 10_000,
}: QueryRegistryDependencies): QueryRegistry => {
  const sharedSubscriptions = new Map<string, SharedSubscription>();
  let requestSequence = 0;

  const closeSharedSubscription = (shared: SharedSubscription) => {
    if (shared.closed) {
      return;
    }
    shared.closed = true;
    sharedSubscriptions.delete(shared.key);
    for (const listener of Array.from(shared.listeners)) {
      listener.closed = true;
      if (listener.timeoutId !== undefined) {
        clearTimeout(listener.timeoutId);
        listener.timeoutId = undefined;
      }
    }
    shared.listeners.clear();
    shared.subscription.close();
  };

  const createSharedSubscription = (
    key: string,
    options: NostrTransportSubscribeOptions,
  ) => {
    const shared: SharedSubscription = {
      key,
      subscription: undefined as unknown as NostrSubscription,
      listeners: new Set(),
      closed: false,
    };

    const subscription = subscribeToTransportEvents(
      transport,
      options,
      (packet) => {
        for (const listener of Array.from(shared.listeners)) {
          try {
            listener.onEvent(packet);
          } catch {
            // Listener callbacks are isolated so one consumer cannot block fan-out.
          } finally {
            if (listener.closeOnFirstEvent) {
              closeListener(shared, listener);
            }
          }
        }
      },
    );
    shared.subscription = subscription;
    sharedSubscriptions.set(key, shared);
    subscription.events$.subscribe({
      complete: () => {
        for (const listener of Array.from(shared.listeners)) {
          try {
            listener.onComplete?.();
          } catch {
            // Listener callbacks are isolated so one consumer cannot block cleanup.
          }
        }
        closeSharedSubscription(shared);
      },
    });
    if (shared.closed) {
      sharedSubscriptions.delete(key);
    }
    return shared;
  };

  const closeListener = (shared: SharedSubscription, listener: Listener) => {
    if (listener.closed) {
      return;
    }
    listener.closed = true;
    if (listener.timeoutId !== undefined) {
      clearTimeout(listener.timeoutId);
      listener.timeoutId = undefined;
    }
    if (shared.closed) {
      return;
    }
    shared.listeners.delete(listener);
    if (shared.listeners.size === 0) {
      closeSharedSubscription(shared);
    }
  };

  return {
    open({
      options,
      closeOnFirstEvent = false,
      closeAfterMs,
      onEvent,
      onComplete,
    }) {
      const sharedKey = sharedQueryKeyFor(options);
      const key = sharedKey ?? `request:${++requestSequence}`;
      const resolvedCloseAfterMs =
        closeAfterMs ??
        (options.mode === "forward" ? undefined : requestTimeoutMs);
      const shared = sharedKey
        ? (sharedSubscriptions.get(sharedKey) ??
          createSharedSubscription(sharedKey, options))
        : createSharedSubscription(key, options);
      const listener: Listener = {
        onEvent,
        onComplete,
        closeOnFirstEvent,
        closed: false,
      };
      if (resolvedCloseAfterMs !== undefined) {
        listener.timeoutId = setTimeout(
          () => closeListener(shared, listener),
          resolvedCloseAfterMs,
        );
      }
      shared.listeners.add(listener);
      if (shared.listeners.size === 1) {
        shared.subscription.emit(options.filters);
      }

      return {
        complete: () => {
          if (sharedKey) {
            closeListener(shared, listener);
            return;
          }
          shared.subscription.complete();
        },
        close: () => closeListener(shared, listener),
      };
    },

    dispose() {
      for (const shared of Array.from(sharedSubscriptions.values())) {
        closeSharedSubscription(shared);
      }
      sharedSubscriptions.clear();
    },
  };
};
