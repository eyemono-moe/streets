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

export type FakeRelayConnectionOptions = {
  /** false にすると `open()` を呼ぶまで onOpen が発火しない。既定 true */
  autoOpen?: boolean;
};

/** テスト用の RelayConnection。emitEvent/emitEose/emitClosed で任意のタイミングを再現する。 */
export class FakeRelayConnection implements RelayConnection {
  readonly subscriptions: FakeSubscription[] = [];
  readonly published: NostrEvent[] = [];
  readonly #openListeners = new Set<() => void>();
  readonly #closeListeners = new Set<() => void>();
  #opened: boolean;
  closed = false;

  constructor(
    readonly url: RelayUrl,
    options?: FakeRelayConnectionOptions,
  ) {
    this.#opened = options?.autoOpen ?? true;
  }

  subscribe(
    filters: RelayFilter[],
    handlers: RelaySubscriptionHandlers,
  ): RelaySubscription {
    if (this.closed) {
      // 呼び出し元が来ない onEose/onClosed を待たないよう、即座に onClosed を通知する。
      handlers.onClosed("socket closed");
      return { close: () => {} };
    }

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

  /** 遅れて開いたことにする (autoOpen: false のときだけ意味がある) */
  open(): void {
    if (this.#opened || this.closed) return;
    this.#opened = true;
    for (const listener of [...this.#openListeners]) listener();
  }

  onOpen(listener: () => void): () => void {
    if (this.#opened) {
      listener();
      return () => {};
    }
    if (this.closed) return () => {};
    this.#openListeners.add(listener);
    return () => {
      this.#openListeners.delete(listener);
    };
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
    this.#openListeners.clear();
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
