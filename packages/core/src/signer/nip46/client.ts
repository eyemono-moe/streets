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
/**
 * 署名器の応答を待つ上限。署名器が止まっていると、この間ずっと保存や再読み込み
 * 後の復元が進まない。承認のページを出した（auth_url）ときは別に長く待つ。
 */
export const NIP46_RPC_TIMEOUT_MS = 10_000;
/**
 * 任意の問い合わせ（`switch_relays` など）を待つ上限。応えない署名器もあり、
 * 待ちすぎるとその間ログインが終わらない。
 */
export const NIP46_OPTIONAL_RPC_TIMEOUT_MS = 5_000;
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

type Pool = Pick<ConnectionPool, "publish" | "subscribe" | "allowLocalRelays">;
type Timer = ReturnType<typeof setTimeout>;
type Pending = {
  method: Nip46Method;
  event: NostrEvent;
  resolve: (result: string) => void;
  reject: (error: Error) => void;
  timer: Timer;
  /** いまのソケットで送ったリレー。ソケットが切れたら外し、繋ぎ直したら送り直す。 */
  sentOn: Set<RelayUrl>;
  /** 送ったが断られたリレー。全部に断られたら待たずに失敗させる。 */
  refusedBy: Set<RelayUrl>;
};

const SIGNER_LANE = { lane: "signer" } as const;

/**
 * 失敗したときの通り道の様子。同じ「時間切れ」でも、購読が届かなかったのか、
 * 届いたのに返事が来なかったのかで直し方が違う。
 */
export type Nip46ErrorDetails = {
  /** 止まった依頼。nostrconnect の承認待ちは `connect`。 */
  method?: string;
  /** 返事を受ける購読が届いていたリレーの数と、全体の数。 */
  liveRelays: number;
  relays: number;
  /** 購読が届いた後でソケットが切れた回数。 */
  reconnects: number;
  /** 最初に購読が届くまでにかかった時間。届かなかったら無い。 */
  firstLiveMs?: number;
};

export class Nip46RpcError extends Error {
  constructor(
    message: string,
    readonly details?: Nip46ErrorDetails,
  ) {
    super(message);
    this.name = "Nip46RpcError";
  }
}

/** 署名器が返事をして、そのうえで断った。届かなかった・時間切れとは分ける。 */
export class Nip46SignerRefusedError extends Nip46RpcError {
  constructor(message: string, details?: Nip46ErrorDetails) {
    super(message, details);
    this.name = "Nip46SignerRefusedError";
  }
}

/** 購読がリレーに届いたか・切れたかを数える。 */
export const createLiveTracker = (now: () => number) => {
  const startedAt = now();
  const live = new Set<RelayUrl>();
  let firstLiveAt: number | undefined;
  let reconnects = 0;
  return {
    live,
    onLive(relay: RelayUrl) {
      live.add(relay);
      firstLiveAt ??= now();
    },
    onLost(relay: RelayUrl) {
      if (live.delete(relay)) reconnects += 1;
    },
    /** 張り替えで閉じるときは、切れた回数に数えない。 */
    forget(relay: RelayUrl) {
      live.delete(relay);
    },
    details(relays: number, method?: string): Nip46ErrorDetails {
      return {
        ...(method === undefined ? {} : { method }),
        liveRelays: live.size,
        relays,
        reconnects,
        ...(firstLiveAt === undefined
          ? {}
          : { firstLiveMs: firstLiveAt - startedAt }),
      };
    },
  };
};

export type Nip46Client = {
  readonly clientPubkey: string;
  request(
    method: Nip46Method,
    params?: string[],
    options?: { timeoutMs?: number },
  ): Promise<string>;
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

export const parseResponse = (
  plaintext: string,
): { id: string; result?: string; error?: string } | undefined => {
  try {
    const value: unknown = JSON.parse(plaintext);
    if (typeof value !== "object" || value === null) return undefined;
    const response = value as Record<string, unknown>;
    if (typeof response.id !== "string") return undefined;
    // `switch_relays` は「変えるものが無い」を null で返す（NIP-46）。捨てると
    // 応答が無かったことになり、時間切れまで待たされる。JSON の null として渡す。
    if (response.result === null) response.result = "null";
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
  /**
   * 返事を受ける購読がリレーに届いた（EOSE を受けた）リレー。返事は保存されない
   * イベントなので、購読が届く前に依頼を送ると返事を取りこぼす。
   */
  const tracker = createLiveTracker(now);
  const { live } = tracker;
  const fail = (message: string, method?: Nip46Method) =>
    new Nip46RpcError(message, tracker.details(currentRelays.length, method));
  // 署名器のリレーはユーザーが指定したものなので、手元の署名器へも繋ぐ。
  let releaseLocal = options.pool.allowLocalRelays(currentRelays);
  let closed = false;

  const settleTimeout = (id: string, timeoutMs: number): Timer =>
    setTimer(() => {
      const request = pending.get(id);
      if (!request) return;
      pending.delete(id);
      request.reject(fail("remote signer response timed out", request.method));
    }, timeoutMs);

  const send = (id: string, request: Pending, relay: RelayUrl) => {
    request.sentOn.add(relay);
    options.pool.publish(relay, request.event, SIGNER_LANE).catch(() => {
      if (pending.get(id) !== request || !request.sentOn.has(relay)) return;
      request.refusedBy.add(relay);
      if (!currentRelays.every((url) => request.refusedBy.has(url))) return;
      pending.delete(id);
      clearTimer(request.timer);
      request.reject(
        fail("request could not be sent to any relay", request.method),
      );
    });
  };

  const onLive = (relay: RelayUrl) => {
    if (closed || !currentRelays.includes(relay)) return;
    tracker.onLive(relay);
    for (const [id, request] of pending) {
      if (!request.sentOn.has(relay)) send(id, request, relay);
    }
  };

  const onLost = (relay: RelayUrl, replaced = false) => {
    if (replaced) tracker.forget(relay);
    else tracker.onLost(relay);
    for (const request of pending.values()) {
      request.sentOn.delete(relay);
      request.refusedBy.delete(relay);
    }
  };

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
          fail("remote signer returned an invalid auth URL", request.method),
        );
        return;
      }
      if (url.protocol !== "https:") {
        pending.delete(response.id);
        clearTimer(request.timer);
        request.reject(
          fail("remote signer returned an invalid auth URL", request.method),
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
      request.reject(
        new Nip46SignerRefusedError(
          response.error,
          tracker.details(currentRelays.length, request.method),
        ),
      );
    } else if (response.result !== undefined) {
      request.resolve(response.result);
    } else {
      request.reject(fail("remote signer returned no result", request.method));
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
        {
          onEvent,
          // 繋ぎ直すたびに購読が張り直され、EOSE もまた届く。
          onEose: () => onLive(relay),
          onClosed: () => onLost(relay),
        },
        SIGNER_LANE,
      );
      if (handle) handles.push(handle);
    }
    return handles;
  };

  subscriptions = subscribe(currentRelays);
  if (subscriptions.length === 0) {
    releaseLocal();
    throw new Nip46RpcError("connection budget exhausted for remote signer");
  }

  return {
    clientPubkey,
    request(method, params = [], requestOptions = {}) {
      if (closed) {
        return Promise.reject(fail("NIP-46 client is closed", method));
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
        const timer = settleTimeout(
          id,
          requestOptions.timeoutMs ?? NIP46_RPC_TIMEOUT_MS,
        );
        const request: Pending = {
          method,
          event,
          resolve,
          reject,
          timer,
          sentOn: new Set(),
          refusedBy: new Set(),
        };
        pending.set(id, request);
        // 購読がまだ届いていないリレーへは、届いたとき（onLive）に送る。
        for (const relay of currentRelays) {
          if (live.has(relay)) send(id, request, relay);
        }
      });
    },
    switchRelays(relays) {
      if (closed) return false;
      const releaseNext = options.pool.allowLocalRelays(relays);
      const previousRelays = currentRelays;
      const wasLive = [...live];
      // 古い購読を閉じるので、同じリレーでも新しい購読の EOSE を待ってから送る。
      for (const relay of previousRelays) onLost(relay, true);
      currentRelays = [...relays];
      const next = subscribe(relays);
      if (next.length === 0) {
        currentRelays = previousRelays;
        for (const relay of wasLive) onLive(relay);
        releaseNext();
        return false;
      }
      const previous = subscriptions;
      subscriptions = next;
      for (const handle of previous) handle.close();
      releaseLocal();
      releaseLocal = releaseNext;
      return true;
    },
    close() {
      if (closed) return;
      closed = true;
      for (const handle of subscriptions) handle.close();
      subscriptions = [];
      releaseLocal();
      for (const [id, request] of pending) {
        clearTimer(request.timer);
        request.reject(fail("NIP-46 client was closed", request.method));
        pending.delete(id);
      }
    },
  };
};
