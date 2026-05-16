import { subscribeToTransportEvents } from "../transport/rx-nostr-transport";
import type {
  NostrSubscription,
  NostrTransport,
  NostrTransportEventPacket,
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

export const createQueryRegistry = ({
  transport,
  requestTimeoutMs = 10_000,
}: QueryRegistryDependencies): QueryRegistry => {
  const activeHandles = new Set<QueryRegistryHandle>();

  const trackSubscription = (
    subscription: NostrSubscription,
    { closeAfterMs }: { closeAfterMs?: number } = {},
  ): QueryRegistryHandle => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const handle: QueryRegistryHandle = {
      complete: () => subscription.complete(),
      close: () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = undefined;
        }
        if (activeHandles.delete(handle)) {
          subscription.close();
        }
      },
    };

    activeHandles.add(handle);
    if (closeAfterMs !== undefined) {
      timeoutId = setTimeout(handle.close, closeAfterMs);
    }

    return handle;
  };

  return {
    open({
      options,
      closeOnFirstEvent = false,
      closeAfterMs,
      onEvent,
      onComplete,
    }) {
      const handleRef: { current?: QueryRegistryHandle } = {};
      const subscription = subscribeToTransportEvents(
        transport,
        options,
        (packet) => {
          onEvent(packet);
          if (closeOnFirstEvent) {
            handleRef.current?.close();
          }
        },
      );
      subscription.events$.subscribe({ complete: onComplete });
      const handle = trackSubscription(subscription, {
        closeAfterMs:
          closeAfterMs ??
          (options.mode === "forward" ? undefined : requestTimeoutMs),
      });
      handleRef.current = handle;
      subscription.emit(options.filters);
      return handle;
    },

    dispose() {
      for (const handle of Array.from(activeHandles)) {
        handle.close();
      }
      activeHandles.clear();
    },
  };
};
