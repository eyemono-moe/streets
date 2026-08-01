import type { NostrEvent } from "../nostr/event";
import type {
  RelayConnection,
  RelayFilter,
  RelaySubscription,
  RelaySubscriptionHandlers,
  RelayUrl,
} from "./relay-connection";

type FakeSubscription = {
  filters: RelayFilter[];
  handlers: RelaySubscriptionHandlers;
  closed: boolean;
};

/**
 * テスト用の RelayConnection。
 * emitEvent / emitEose / emitClosed で任意のタイミングを再現する。
 */
export class FakeRelayConnection implements RelayConnection {
  readonly subscriptions: FakeSubscription[] = [];
  readonly published: NostrEvent[] = [];
  readonly #closeListeners = new Set<() => void>();
  closed = false;

  constructor(readonly url: RelayUrl) {}

  subscribe(
    filters: RelayFilter[],
    handlers: RelaySubscriptionHandlers,
  ): RelaySubscription {
    const index = this.subscriptions.length;
    this.subscriptions.push({ filters, handlers, closed: false });
    return {
      close: () => {
        this.subscriptions[index].closed = true;
      },
    };
  }

  async publish(event: NostrEvent): Promise<void> {
    this.published.push(event);
  }

  close(): void {
    this.#doClose();
  }

  #doClose(): void {
    if (this.closed) return;
    this.closed = true;
    for (const sub of this.subscriptions) {
      if (sub.closed) continue;
      sub.closed = true;
      sub.handlers.onClosed("socket closed");
    }
    for (const listener of this.#closeListeners) listener();
    this.#closeListeners.clear();
  }

  emitEvent(subIndex: number, event: NostrEvent): void {
    const sub = this.subscriptions[subIndex];
    if (!sub || sub.closed) return;
    sub.handlers.onEvent(event);
  }

  emitEose(subIndex: number): void {
    const sub = this.subscriptions[subIndex];
    if (!sub || sub.closed) return;
    sub.handlers.onEose();
  }

  emitClosed(subIndex: number, reason: string): void {
    const sub = this.subscriptions[subIndex];
    if (!sub || sub.closed) return;
    sub.closed = true;
    sub.handlers.onClosed(reason);
  }

  onClose(listener: () => void): () => void {
    if (this.closed) {
      listener();
      return () => {};
    }
    this.#closeListeners.add(listener);
    return () => {
      this.#closeListeners.delete(listener);
    };
  }

  die(): void {
    this.#doClose();
  }
}
