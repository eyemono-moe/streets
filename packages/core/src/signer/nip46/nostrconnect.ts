import { schnorr, secp256k1 } from "@noble/curves/secp256k1.js";
import { bytesToHex, hexToBytes, randomBytes } from "@noble/hashes/utils.js";
import * as v from "valibot";
import { type NostrEvent, verifyEvent } from "../../nostr/event";
import type {
  ConnectionPool,
  PooledSubscription,
} from "../../read/connection-pool";
import type { RelayUrl } from "../../relay/relay-connection";
import { normalizeRelayUrl } from "../../relay/relay-url";
import { MAX_NIP46_RELAYS } from "./bunker-uri";
import {
  NIP46_KIND,
  type Nip46Client,
  type Nip46ClientHooks,
  Nip46RpcError,
  createLiveTracker,
  createNip46Client,
  parseResponse,
} from "./client";
import { conversationKey, decryptNip44 } from "./nip44";
import { type Nip46Session, finishSession } from "./session";
import { NIP46_REQUIRED_PERMISSIONS } from "./session-storage";

/**
 * 署名器からの応答を待つリレー。署名器は URI に書いたリレーへ応答するので、
 * どちらかが落ちていても繋がるよう、よく使われるリレーを 2 本置く。
 */
export const NOSTRCONNECT_RELAYS: readonly RelayUrl[] = [
  "wss://nos.lol/",
  "wss://relay.primal.net/",
];

/** 別の端末で QR を読み、署名器で承認するまでの猶予。 */
export const NOSTRCONNECT_TIMEOUT_MS = 10 * 60_000;

export type ClientMetadata = { name: string; url: string };

/**
 * 待っている 1 回分を、読み込み直しても同じ URI で待ち続けるための保存の形。
 * スマホで同じ端末の署名アプリへ切り替えると、戻ったときにページが読み込み
 * 直されることがあり、作り直すと承認した署名器と繋がらない。
 */
export const NOSTRCONNECT_ATTEMPT_STORAGE_KEY =
  "streets.v1.nostrconnect-attempt";

const hex64 = v.pipe(v.string(), v.regex(/^[0-9a-f]{64}$/));
const attemptSchema = v.strictObject({
  clientSecret: hex64,
  secret: v.pipe(v.string(), v.regex(/^[0-9a-f]{32}$/)),
  relays: v.pipe(
    v.array(v.string()),
    v.minLength(1),
    v.maxLength(MAX_NIP46_RELAYS),
  ),
  startedAt: v.number(),
});

export type StoredNostrConnectAttempt = v.InferOutput<typeof attemptSchema>;

/** 壊れている・時間切れのものは読まない。 */
export const loadNostrConnectAttempt = (
  raw: string | null,
  now: number,
  timeoutMs = NOSTRCONNECT_TIMEOUT_MS,
): StoredNostrConnectAttempt | undefined => {
  if (raw === null) return undefined;
  try {
    const parsed = v.parse(attemptSchema, JSON.parse(raw));
    if (parsed.startedAt > now || now - parsed.startedAt >= timeoutMs) {
      return undefined;
    }
    const relays = parsed.relays.map(normalizeRelayUrl);
    if (relays.some((relay) => relay === undefined)) return undefined;
    return { ...parsed, relays: relays as string[] };
  } catch {
    return undefined;
  }
};

export const saveNostrConnectAttempt = (
  attempt: StoredNostrConnectAttempt,
): string => JSON.stringify(v.parse(attemptSchema, attempt));

export const buildNostrConnectUri = (options: {
  clientPubkey: string;
  relays: readonly RelayUrl[];
  secret: string;
  perms: string;
  metadata: ClientMetadata;
}): string => {
  const params = new URLSearchParams();
  for (const relay of options.relays) params.append("relay", relay);
  params.set("secret", options.secret);
  params.set("perms", options.perms);
  params.set("name", options.metadata.name);
  params.set("url", options.metadata.url);
  return `nostrconnect://${options.clientPubkey}?${params}`;
};

export class NostrConnectCancelledError extends Error {
  constructor() {
    super("nostrconnect was cancelled");
    this.name = "NostrConnectCancelledError";
  }
}

export type NostrConnectAttempt = {
  /** 署名器へ渡す文字列。QR にもこれを載せる。 */
  uri: string;
  /** 読み込み直したときに同じ試みを続けるための値。秘密を含む。 */
  stored: StoredNostrConnectAttempt;
  /** 署名器が承認すると解決する。取り消し・時間切れ・接続の失敗で拒否される。 */
  session: Promise<Nip46Session>;
  /** 待つのをやめて購読を閉じる。session が解決した後に呼んでも何もしない。 */
  cancel(): void;
};

type Pool = Pick<ConnectionPool, "publish" | "subscribe" | "allowLocalRelays">;

/**
 * 署名器の側から接続を受ける（`nostrconnect://`）。bunker の URI と違い、
 * 署名器の公開鍵は応答が届くまで分からないので、自分宛ての応答を誰からでも
 * 受け、URI に載せた secret を返したものだけを署名器とみなす。
 */
export const startNostrConnect = (options: {
  pool: Pool;
  metadata: ClientMetadata;
  relays?: readonly RelayUrl[];
  /** 前に始めた試みを、同じ鍵・secret・リレーで待ち続ける。 */
  resume?: StoredNostrConnectAttempt;
  hooks?: Nip46ClientHooks;
  timeoutMs?: number;
  now?: () => number;
  setTimer?: typeof setTimeout;
  clearTimer?: typeof clearTimeout;
}): NostrConnectAttempt => {
  const { resume } = options;
  const relays = resume
    ? [...resume.relays]
    : [...(options.relays ?? NOSTRCONNECT_RELAYS)];
  const setTimer = options.setTimer ?? setTimeout;
  const clearTimer = options.clearTimer ?? clearTimeout;
  const now = options.now ?? Date.now;
  const clientSecret = resume
    ? hexToBytes(resume.clientSecret)
    : secp256k1.utils.randomSecretKey();
  const clientPubkey = bytesToHex(schnorr.getPublicKey(clientSecret));
  const secret = resume?.secret ?? bytesToHex(randomBytes(16));
  const stored: StoredNostrConnectAttempt = {
    clientSecret: bytesToHex(clientSecret),
    secret,
    relays,
    startedAt: resume?.startedAt ?? now(),
  };
  const timeoutMs = Math.max(
    0,
    (options.timeoutMs ?? NOSTRCONNECT_TIMEOUT_MS) - (now() - stored.startedAt),
  );
  const uri = buildNostrConnectUri({
    clientPubkey,
    relays,
    secret,
    perms: NIP46_REQUIRED_PERMISSIONS,
    metadata: options.metadata,
  });

  let waiting: PooledSubscription[] = [];
  const tracker = createLiveTracker(now);
  let finishing: Nip46Client | undefined;
  let settled = false;
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let reject: (error: Error) => void = () => {};
  let resolve: (remoteSignerPubkey: string) => void = () => {};

  const stopWaiting = () => {
    settled = true;
    if (timer !== undefined) clearTimer(timer);
    for (const handle of waiting) handle.close();
    waiting = [];
  };

  const onEvent = (event: NostrEvent) => {
    if (
      settled ||
      !verifyEvent(event) ||
      event.kind !== NIP46_KIND ||
      !event.tags.some((tag) => tag[0] === "p" && tag[1] === clientPubkey)
    ) {
      return;
    }
    let response: ReturnType<typeof parseResponse>;
    try {
      response = parseResponse(
        decryptNip44(
          event.content,
          conversationKey(clientSecret, event.pubkey),
        ),
      );
    } catch {
      return;
    }
    // secret を返さない応答は、URI を盗み見た第三者のなりすましかもしれない。
    if (response?.result !== secret) return;
    stopWaiting();
    resolve(event.pubkey);
  };

  const remoteSigner = new Promise<string>((ok, ng) => {
    resolve = ok;
    reject = ng;
  });

  for (const relay of relays) {
    const handle = options.pool.subscribe(
      relay,
      [{ kinds: [NIP46_KIND], "#p": [clientPubkey] }],
      {
        onEvent,
        onEose: () => tracker.onLive(relay),
        onClosed: () => tracker.onLost(relay),
      },
      { lane: "signer" },
    );
    if (handle) waiting.push(handle);
  }
  if (waiting.length === 0) {
    stopWaiting();
    reject(new Nip46RpcError("connection budget exhausted for remote signer"));
  } else {
    timer = setTimer(() => {
      if (settled) return;
      stopWaiting();
      reject(
        new Nip46RpcError(
          "remote signer did not connect in time",
          tracker.details(relays.length, "connect"),
        ),
      );
    }, timeoutMs);
  }

  const session = remoteSigner.then(async (remoteSignerPubkey) => {
    if (cancelled) throw new NostrConnectCancelledError();
    const client = createNip46Client({
      pool: options.pool,
      clientSecret,
      remoteSignerPubkey,
      relays,
      hooks: options.hooks,
    });
    finishing = client;
    try {
      return await finishSession(
        client,
        clientSecret,
        remoteSignerPubkey,
        relays,
      );
    } catch (error) {
      client.close();
      throw error;
    } finally {
      finishing = undefined;
    }
  });

  return {
    uri,
    stored,
    session,
    cancel() {
      cancelled = true;
      if (settled) {
        // 承認の後、公開鍵を聞いている途中。閉じれば session は拒否される。
        finishing?.close();
        return;
      }
      stopWaiting();
      reject(new NostrConnectCancelledError());
    },
  };
};
