import type { NostrEvent } from "../nostr/event";
import type {
  RelayConnection,
  RelayFilter,
  RelaySubscription,
  RelaySubscriptionHandlers,
  RelayUrl,
} from "./relay-connection";

export type WebSocketLike = {
  readyState: number;
  send(data: string): void;
  close(): void;
  onopen: (() => void) | null;
  onmessage: ((event: { data: string }) => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
};

const OPEN = 1;
const CLOSING = 2;

type PendingPublish = {
  resolve: () => void;
  reject: (error: Error) => void;
};

/**
 * NIP-01 を話す 1 リレー専用の接続 (ADR-0014, ADR-0020)。
 * Nostr ライブラリには依存しない。
 */
export class WebSocketRelayConnection implements RelayConnection {
  readonly #socket: WebSocketLike;
  readonly #handlers = new Map<string, RelaySubscriptionHandlers>();
  readonly #publishes = new Map<string, PendingPublish[]>();
  readonly #outbox: string[] = [];
  readonly #openListeners = new Set<() => void>();
  readonly #closeListeners = new Set<() => void>();
  #nextSubId = 0;
  #opened = false;
  #closed = false;

  constructor(
    readonly url: RelayUrl,
    socket: WebSocketLike,
  ) {
    this.#socket = socket;

    socket.onopen = () => {
      if (this.#opened) return;
      const queued = this.#outbox.splice(0);
      for (const message of queued) socket.send(message);
      // キューを流し終えてから通知する — listener から publish された
      // メッセージが、既に取り出し済みのキューの後ろに紛れないように。
      this.#opened = true;
      for (const listener of [...this.#openListeners]) listener();
    };

    socket.onmessage = (event) => this.#onMessage(event.data);

    const fail = () => {
      if (this.#closed) return;
      this.#closed = true;
      for (const handlers of this.#handlers.values())
        handlers.onClosed("socket closed");
      this.#handlers.clear();
      for (const pending of this.#publishes.values())
        for (const { reject } of pending) reject(new Error("socket closed"));
      this.#publishes.clear();
      this.#outbox.length = 0;
      this.#openListeners.clear();
      for (const listener of this.#closeListeners) listener();
      this.#closeListeners.clear();
    };
    socket.onclose = fail;
    socket.onerror = fail;
  }

  subscribe(
    filters: RelayFilter[],
    handlers: RelaySubscriptionHandlers,
  ): RelaySubscription {
    if (this.#isClosed()) {
      // ソケットが既に閉じている(またはクローズ中の)場合は即座に閉じたことを
      // 通知する。そうしないと呼び出し元は二度と来ない onEose/onClosed を待ち続ける。
      handlers.onClosed("socket closed");
      return { close: () => {} };
    }

    const subId = `s${this.#nextSubId++}`;
    this.#handlers.set(subId, handlers);
    this.#send(JSON.stringify(["REQ", subId, ...filters]));

    return {
      close: () => {
        if (!this.#handlers.delete(subId)) return;
        this.#send(JSON.stringify(["CLOSE", subId]));
      },
    };
  }

  publish(event: NostrEvent): Promise<void> {
    if (this.#isClosed()) {
      return Promise.reject(new Error("socket closed"));
    }

    return new Promise((resolve, reject) => {
      const pending = this.#publishes.get(event.id);
      if (pending) {
        // 同じ id のイベントが同時に publish された場合、
        // 先に登録された Promise を上書きして迷子にしないよう配列で保持する。
        pending.push({ resolve, reject });
      } else {
        this.#publishes.set(event.id, [{ resolve, reject }]);
      }
      this.#send(JSON.stringify(["EVENT", event]));
    });
  }

  close(): void {
    this.#socket.close();
  }

  onOpen(listener: () => void): () => void {
    if (this.#opened) {
      listener();
      return () => {};
    }
    if (this.#isClosed()) return () => {};
    this.#openListeners.add(listener);
    return () => {
      this.#openListeners.delete(listener);
    };
  }

  onClose(listener: () => void): () => void {
    if (this.#isClosed()) {
      listener();
      return () => {};
    }
    this.#closeListeners.add(listener);
    return () => {
      this.#closeListeners.delete(listener);
    };
  }

  #send(message: string): void {
    if (this.#socket.readyState === OPEN) this.#socket.send(message);
    else this.#outbox.push(message);
  }

  /**
   * `onclose`/`onerror` はソケットが実際に閉じてからしか発火しないが、
   * `readyState` は `.close()` 呼び出しと同時に CLOSING (2) 以上へ
   * 同期的に切り替わる。そのギャップの間に登録された subscribe/publish が
   * 二度と来ない onopen を待ち続けないよう、readyState も直接見る。
   */
  #isClosed(): boolean {
    return this.#closed || this.#socket.readyState >= CLOSING;
  }

  #onMessage(raw: string): void {
    let message: unknown;
    try {
      message = JSON.parse(raw);
    } catch {
      return; // 壊れたメッセージは黙って捨てる
    }
    if (!Array.isArray(message) || typeof message[0] !== "string") return;

    switch (message[0]) {
      case "EVENT": {
        const [, subId, event] = message;
        if (
          typeof subId !== "string" ||
          typeof event !== "object" ||
          event === null
        )
          return;
        this.#handlers.get(subId)?.onEvent(event as NostrEvent);
        return;
      }
      case "EOSE": {
        const [, subId] = message;
        if (typeof subId !== "string") return;
        this.#handlers.get(subId)?.onEose();
        return;
      }
      case "CLOSED": {
        const [, subId, reason] = message;
        if (typeof subId !== "string") return;
        const handlers = this.#handlers.get(subId);
        this.#handlers.delete(subId);
        handlers?.onClosed(typeof reason === "string" ? reason : "closed");
        return;
      }
      case "OK": {
        const [, eventId, ok, reason] = message;
        if (typeof eventId !== "string") return;
        const pending = this.#publishes.get(eventId);
        if (!pending) return;
        this.#publishes.delete(eventId);
        for (const { resolve, reject } of pending) {
          // ok は仕様上 boolean。真偽値以外の値(壊れたリレー応答)は
          // 成功として扱わない。
          if (ok === true) {
            resolve();
          } else {
            reject(new Error(typeof reason === "string" ? reason : "rejected"));
          }
        }
        return;
      }
      default:
        // NOTICE / AUTH などはこの計画では扱わない
        return;
    }
  }
}

export const connectRelay = (url: RelayUrl): RelayConnection =>
  new WebSocketRelayConnection(url, new WebSocket(url) as WebSocketLike);
