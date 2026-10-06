import { buildRelayAuth, isAuthRequired } from "../nostr/build/relay-auth";
import type { NostrEvent } from "../nostr/event";
import type { Signer } from "../signer/signer";
import type {
  RelayConnection,
  RelayFilter,
  RelaySubscription,
  RelaySubscriptionHandlers,
  RelayUrl,
} from "./relay-connection";
import {
  type RelayTrafficRecorder,
  filterShape,
  utf8Length,
} from "./relay-traffic";

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

type OpenSubscription = {
  filters: RelayFilter[];
  handlers: RelaySubscriptionHandlers;
  /** 認証して送り直したか。送り直しても断られたら、それ以上は試さない。 */
  retried: boolean;
  /** やりとりを数えるときだけ作る、フィルタの形。 */
  shape: string | undefined;
};

type InFlightPublish = {
  event: NostrEvent;
  waiters: PendingPublish[];
  retried: boolean;
};

export type RelayConnectionOptions = {
  /**
   * NIP-42 の認証に使う署名器。関数で受けるのは、接続を作る時点では
   * ログインがまだ済んでいない（署名器が決まっていない）ことがあるため。
   */
  signer?: () => Pick<Signer, "getPublicKey" | "signEvent"> | undefined;
  /** 秒。テストが `created_at` を決めるために注入する。 */
  now?: () => number;
  /** やりとりを数える先。Devtools で測るときだけ渡す。 */
  traffic?: RelayTrafficRecorder;
};

/**
 * NIP-01 を話す 1 リレー専用の接続。Nostr ライブラリには依存しない。
 */
export class WebSocketRelayConnection implements RelayConnection {
  readonly #socket: WebSocketLike;
  readonly #subscriptions = new Map<string, OpenSubscription>();
  readonly #publishes = new Map<string, InFlightPublish>();
  /** 送った認証イベントの id → その `OK` を待つ先。 */
  readonly #authOks = new Map<string, (ok: boolean) => void>();
  readonly #auth: RelayConnectionOptions;
  /** リレーから最後に届いた challenge。次の challenge が届くまで有効 (NIP-42)。 */
  #challenge: string | undefined;
  /**
   * いまの challenge での認証の結果。同じ challenge で何度も署名を頼まない
   * よう、失敗も含めて覚える。新しい challenge が届いたら捨てる。
   */
  #authResult: Promise<boolean> | undefined;
  #authAttempted = false;
  readonly #outbox: string[] = [];
  readonly #openListeners = new Set<() => void>();
  readonly #closeListeners = new Set<() => void>();
  #nextSubId = 0;
  #opened = false;
  #closed = false;

  constructor(
    readonly url: RelayUrl,
    socket: WebSocketLike,
    auth: RelayConnectionOptions = {},
  ) {
    this.#socket = socket;
    this.#auth = auth;
    auth.traffic?.attempted(url);

    socket.onopen = () => {
      if (this.#opened) return;
      const queued = this.#outbox.splice(0);
      for (const message of queued) socket.send(message);
      // publish されたメッセージが既に取り出し済みのキューの後ろに紛れないよう、流し終えてから通知する。
      this.#opened = true;
      this.#auth.traffic?.opened(url);
      for (const listener of [...this.#openListeners]) listener();
    };

    socket.onmessage = (event) => this.#onMessage(event.data);

    const fail = () => {
      if (this.#closed) return;
      this.#closed = true;
      this.#auth.traffic?.socketClosed(url);
      for (const { handlers } of this.#subscriptions.values())
        handlers.onClosed("socket closed");
      this.#subscriptions.clear();
      for (const { waiters } of this.#publishes.values())
        for (const { reject } of waiters) reject(new Error("socket closed"));
      this.#publishes.clear();
      for (const settle of this.#authOks.values()) settle(false);
      this.#authOks.clear();
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
      // 呼び出し元が来ない onEose/onClosed を待たないよう、閉じている (またはクローズ中の) 場合は即座に onClosed を通知する。
      handlers.onClosed("socket closed");
      return { close: () => {} };
    }

    const subId = `s${this.#nextSubId++}`;
    const shape = this.#auth.traffic ? filterShape(filters) : undefined;
    this.#subscriptions.set(subId, {
      filters,
      handlers,
      retried: false,
      shape,
    });
    this.#countSubscriptions();
    if (shape !== undefined) this.#auth.traffic?.requested(this.url, shape);
    this.#send("REQ", JSON.stringify(["REQ", subId, ...filters]));

    return {
      close: () => {
        if (!this.#subscriptions.delete(subId)) return;
        this.#countSubscriptions();
        this.#send("CLOSE", JSON.stringify(["CLOSE", subId]));
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
        // 同じ id のイベントが同時に publish されても先の Promise を上書きして迷子にしないよう、配列で保持する。
        pending.waiters.push({ resolve, reject });
      } else {
        this.#publishes.set(event.id, {
          event,
          waiters: [{ resolve, reject }],
          retried: false,
        });
      }
      this.#send("EVENT", JSON.stringify(["EVENT", event]));
    });
  }

  close(): void {
    this.#socket.close();
  }

  get authAttempted(): boolean {
    return this.#authAttempted;
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

  #send(type: string, message: string): void {
    this.#auth.traffic?.sent(this.url, type, utf8Length(message));
    if (this.#socket.readyState === OPEN) this.#socket.send(message);
    else this.#outbox.push(message);
  }

  /**
   * `onclose`/`onerror` は実際に閉じてからしか発火しないが `readyState` は
   * `.close()` と同時に CLOSING (2) 以上へ同期的に変わるので、そのギャップで
   * 登録された subscribe/publish が来ない onopen を待たないよう readyState も見る。
   */
  #isClosed(): boolean {
    return this.#closed || this.#socket.readyState >= CLOSING;
  }

  /**
   * 断られてから認証する（NIP-42 はいつ認証するかを決めていない）。先に
   * 認証すると、認証の要らないリレーにまで誰が読んでいるかを明かすため。
   * 署名器が無い・署名を断られた・リレーが受け付けなかったは、どれも false。
   */
  #authenticate(): Promise<boolean> {
    const challenge = this.#challenge;
    const signer = this.#auth.signer?.();
    if (challenge === undefined || !signer) return Promise.resolve(false);
    if (this.#authResult) return this.#authResult;

    this.#authAttempted = true;
    const now = this.#auth.now ?? (() => Math.floor(Date.now() / 1000));
    const result = (async () => {
      try {
        const pubkey = await signer.getPublicKey();
        const signed = await signer.signEvent({
          ...buildRelayAuth(this.url, challenge),
          pubkey,
          created_at: now(),
        });
        if (this.#isClosed()) return false;
        return await new Promise<boolean>((resolve) => {
          this.#authOks.set(signed.id, resolve);
          this.#send("AUTH", JSON.stringify(["AUTH", signed]));
        });
      } catch {
        return false;
      }
    })();
    this.#authResult = result;
    return result;
  }

  #countSubscriptions(): void {
    this.#auth.traffic?.subscriptions(this.url, this.#subscriptions.size);
  }

  #onMessage(raw: string): void {
    const traffic = this.#auth.traffic;
    const bytes = traffic ? utf8Length(raw) : 0;
    let message: unknown;
    try {
      message = JSON.parse(raw);
    } catch {
      traffic?.received(this.url, "invalid", bytes);
      return;
    }
    if (!Array.isArray(message) || typeof message[0] !== "string") {
      traffic?.received(this.url, "invalid", bytes);
      return;
    }
    traffic?.received(this.url, message[0], bytes);

    switch (message[0]) {
      case "EVENT": {
        const [, subId, event] = message;
        if (
          typeof subId !== "string" ||
          typeof event !== "object" ||
          event === null
        )
          return;
        const subscription = this.#subscriptions.get(subId);
        const { id, kind } = event as Partial<NostrEvent>;
        if (typeof id === "string" && typeof kind === "number")
          traffic?.event(this.url, subscription?.shape, id, kind, bytes);
        subscription?.handlers.onEvent(event as NostrEvent);
        return;
      }
      case "EOSE": {
        const [, subId] = message;
        if (typeof subId !== "string") return;
        this.#subscriptions.get(subId)?.handlers.onEose();
        return;
      }
      case "CLOSED": {
        const [, subId, reason] = message;
        if (typeof subId !== "string") return;
        const subscription = this.#subscriptions.get(subId);
        if (!subscription) return;
        const text = typeof reason === "string" ? reason : "closed";
        traffic?.closed(this.url, text);
        if (isAuthRequired(text) && !subscription.retried) {
          subscription.retried = true;
          void this.#authenticate().then((ok) => {
            // 待つ間に呼び出し元が閉じたなら、張り直さない。
            if (this.#subscriptions.get(subId) !== subscription) return;
            if (ok) {
              this.#send(
                "REQ",
                JSON.stringify(["REQ", subId, ...subscription.filters]),
              );
            } else {
              this.#subscriptions.delete(subId);
              this.#countSubscriptions();
              subscription.handlers.onClosed(text);
            }
          });
          return;
        }
        this.#subscriptions.delete(subId);
        this.#countSubscriptions();
        subscription.handlers.onClosed(text);
        return;
      }
      case "OK": {
        const [, eventId, ok, reason] = message;
        if (typeof eventId !== "string") return;
        const settleAuth = this.#authOks.get(eventId);
        if (settleAuth) {
          this.#authOks.delete(eventId);
          settleAuth(ok === true);
          return;
        }
        const pending = this.#publishes.get(eventId);
        if (!pending) return;
        const text = typeof reason === "string" ? reason : "rejected";
        if (ok !== true && isAuthRequired(text) && !pending.retried) {
          pending.retried = true;
          void this.#authenticate().then((authed) => {
            // ソケットが閉じていれば、待っていた分は fail が reject 済み。
            if (this.#publishes.get(eventId) !== pending) return;
            if (authed) {
              this.#send("EVENT", JSON.stringify(["EVENT", pending.event]));
            } else {
              this.#publishes.delete(eventId);
              for (const { reject } of pending.waiters) reject(new Error(text));
            }
          });
          return;
        }
        this.#publishes.delete(eventId);
        for (const { resolve, reject } of pending.waiters) {
          // ok は仕様上 boolean。真偽値以外 (壊れたリレー応答) は成功として扱わない。
          if (ok === true) {
            resolve();
          } else {
            reject(new Error(text));
          }
        }
        return;
      }
      case "AUTH": {
        const [, challenge] = message;
        if (typeof challenge !== "string" || challenge === this.#challenge)
          return;
        this.#challenge = challenge;
        this.#authResult = undefined;
        return;
      }
      case "NOTICE": {
        const [, text] = message;
        if (typeof text === "string") traffic?.notice(this.url, text);
        return;
      }
      default:
        return;
    }
  }
}

export const connectRelay = (
  url: RelayUrl,
  options?: RelayConnectionOptions,
): RelayConnection =>
  new WebSocketRelayConnection(
    url,
    new WebSocket(url) as WebSocketLike,
    options,
  );
