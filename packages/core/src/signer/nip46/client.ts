import { schnorr } from "@noble/curves/secp256k1.js";
import { bytesToHex, hexToBytes, randomBytes } from "@noble/hashes/utils.js";
import {
  type NostrEvent,
  computeEventId,
  verifyEvent,
} from "../../nostr/event";
import type {
  ConnectionPool,
  PooledSubscription,
} from "../../read/connection-pool";
import type { RelayUrl } from "../../relay/relay-connection";
import { conversationKey, decryptNip44, encryptNip44 } from "./nip44";

export const NIP46_KIND = 24_133;
export const NIP46_RPC_TIMEOUT_MS = 30_000;
export const NIP46_AUTH_TIMEOUT_MS = 120_000;

export type Nip46Method =
  | "connect"
  | "get_public_key"
  | "logout"
  | "ping"
  | "nip04_decrypt"
  | "nip44_decrypt"
  | "nip44_encrypt"
  | "sign_event"
  | "switch_relays";

export type Nip46ClientHooks = {
  onAuthUrl?: (url: URL | undefined, requestId: string) => void;
};

type Pool = Pick<ConnectionPool, "publish" | "subscribe">;
type Timer = ReturnType<typeof setTimeout>;
type Pending = {
  resolve: (result: string) => void;
  reject: (error: Error) => void;
  timer: Timer;
};

export class Nip46RpcError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Nip46RpcError";
  }
}

export type Nip46Client = {
  readonly clientPubkey: string;
  request(method: Nip46Method, params?: string[]): Promise<string>;
  switchRelays(relays: readonly RelayUrl[]): boolean;
  close(): void;
};

const createRequestId = (): string => bytesToHex(randomBytes(16));

const signClientEvent = (
  clientSecret: Uint8Array,
  clientPubkey: string,
  remoteSignerPubkey: string,
  content: string,
  now: () => number,
): NostrEvent => {
  const unsigned = {
    pubkey: clientPubkey,
    created_at: Math.floor(now() / 1_000),
    kind: NIP46_KIND,
    tags: [["p", remoteSignerPubkey]],
    content,
  };
  const id = computeEventId(unsigned);
  return {
    ...unsigned,
    id,
    sig: bytesToHex(schnorr.sign(hexToBytes(id), clientSecret)),
  };
};

const parseResponse = (
  plaintext: string,
): { id: string; result?: string; error?: string } | undefined => {
  try {
    const value: unknown = JSON.parse(plaintext);
    if (typeof value !== "object" || value === null) return undefined;
    const response = value as Record<string, unknown>;
    if (typeof response.id !== "string") return undefined;
    if (response.result !== undefined && typeof response.result !== "string") {
      return undefined;
    }
    if (response.error !== undefined && typeof response.error !== "string") {
      return undefined;
    }
    return {
      id: response.id,
      ...(response.result === undefined ? {} : { result: response.result }),
      ...(response.error === undefined ? {} : { error: response.error }),
    };
  } catch {
    return undefined;
  }
};

export const createNip46Client = (options: {
  pool: Pool;
  clientSecret: Uint8Array;
  remoteSignerPubkey: string;
  relays: readonly RelayUrl[];
  hooks?: Nip46ClientHooks;
  now?: () => number;
  setTimer?: typeof setTimeout;
  clearTimer?: typeof clearTimeout;
}): Nip46Client => {
  const clientPubkey = bytesToHex(schnorr.getPublicKey(options.clientSecret));
  const key = conversationKey(options.clientSecret, options.remoteSignerPubkey);
  const now = options.now ?? Date.now;
  const setTimer = options.setTimer ?? setTimeout;
  const clearTimer = options.clearTimer ?? clearTimeout;
  const pending = new Map<string, Pending>();
  let currentRelays = [...options.relays];
  let subscriptions: PooledSubscription[] = [];
  let closed = false;

  const settleTimeout = (id: string, timeoutMs: number): Timer =>
    setTimer(() => {
      const request = pending.get(id);
      if (!request) return;
      pending.delete(id);
      request.reject(new Nip46RpcError("remote signer response timed out"));
    }, timeoutMs);

  const onEvent = (event: NostrEvent) => {
    // NIP-44 は外側の署名検証後にだけ復号する (NIP-44 MUST)。
    if (
      !verifyEvent(event) ||
      event.kind !== NIP46_KIND ||
      event.pubkey !== options.remoteSignerPubkey ||
      !event.tags.some((tag) => tag[0] === "p" && tag[1] === clientPubkey)
    ) {
      return;
    }
    let response: ReturnType<typeof parseResponse>;
    try {
      response = parseResponse(decryptNip44(event.content, key));
    } catch {
      return;
    }
    if (!response) return;
    const request = pending.get(response.id);
    if (!request) return;

    if (response.result === "auth_url") {
      let url: URL;
      try {
        url = new URL(response.error ?? "");
      } catch {
        pending.delete(response.id);
        clearTimer(request.timer);
        request.reject(
          new Nip46RpcError("remote signer returned an invalid auth URL"),
        );
        return;
      }
      if (url.protocol !== "https:") {
        pending.delete(response.id);
        clearTimer(request.timer);
        request.reject(
          new Nip46RpcError("remote signer returned an invalid auth URL"),
        );
        return;
      }
      clearTimer(request.timer);
      request.timer = settleTimeout(response.id, NIP46_AUTH_TIMEOUT_MS);
      options.hooks?.onAuthUrl?.(url, response.id);
      return;
    }

    pending.delete(response.id);
    clearTimer(request.timer);
    options.hooks?.onAuthUrl?.(undefined, response.id);
    if (response.error) {
      request.reject(new Nip46RpcError(response.error));
    } else if (response.result !== undefined) {
      request.resolve(response.result);
    } else {
      request.reject(new Nip46RpcError("remote signer returned no result"));
    }
  };

  const subscribe = (relays: readonly RelayUrl[]): PooledSubscription[] => {
    const handles: PooledSubscription[] = [];
    for (const relay of relays) {
      const handle = options.pool.subscribe(
        relay,
        [
          {
            kinds: [NIP46_KIND],
            authors: [options.remoteSignerPubkey],
            "#p": [clientPubkey],
          },
        ],
        { onEvent, onEose: () => {}, onClosed: () => {} },
      );
      if (handle) handles.push(handle);
    }
    return handles;
  };

  subscriptions = subscribe(currentRelays);
  if (subscriptions.length === 0) {
    throw new Nip46RpcError("connection budget exhausted for remote signer");
  }

  return {
    clientPubkey,
    request(method, params = []) {
      if (closed) {
        return Promise.reject(new Nip46RpcError("NIP-46 client is closed"));
      }
      const id = createRequestId();
      const content = encryptNip44(JSON.stringify({ id, method, params }), key);
      const event = signClientEvent(
        options.clientSecret,
        clientPubkey,
        options.remoteSignerPubkey,
        content,
        now,
      );

      return new Promise<string>((resolve, reject) => {
        const timer = settleTimeout(id, NIP46_RPC_TIMEOUT_MS);
        pending.set(id, { resolve, reject, timer });
        const attempts = currentRelays.map((relay) =>
          options.pool.publish(relay, event),
        );
        void Promise.allSettled(attempts).then((results) => {
          if (results.some((result) => result.status === "fulfilled")) return;
          const request = pending.get(id);
          if (!request) return;
          pending.delete(id);
          clearTimer(request.timer);
          request.reject(
            new Nip46RpcError("request could not be sent to any relay"),
          );
        });
      });
    },
    switchRelays(relays) {
      if (closed) return false;
      const next = subscribe(relays);
      if (next.length === 0) return false;
      const previous = subscriptions;
      subscriptions = next;
      currentRelays = [...relays];
      for (const handle of previous) handle.close();
      return true;
    },
    close() {
      if (closed) return;
      closed = true;
      for (const handle of subscriptions) handle.close();
      subscriptions = [];
      for (const [id, request] of pending) {
        clearTimer(request.timer);
        request.reject(new Nip46RpcError("NIP-46 client was closed"));
        pending.delete(id);
      }
    },
  };
};
