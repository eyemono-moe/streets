import { schnorr } from "@noble/curves/secp256k1.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { describe, expect, it, vi } from "vite-plus/test";
import { type NostrEvent, computeEventId } from "../../nostr/event";
import type { RelaySubscriptionHandlers } from "../../relay/relay-connection";
import { conversationKey, decryptNip44, encryptNip44 } from "./nip44";
import {
  NOSTRCONNECT_TIMEOUT_MS,
  NostrConnectCancelledError,
  buildNostrConnectUri,
  loadNostrConnectAttempt,
  saveNostrConnectAttempt,
  startNostrConnect,
} from "./nostrconnect";

const keyFor = (byte: number): Uint8Array => new Uint8Array(32).fill(byte);
const SIGNER_SECRET = keyFor(2);
const SIGNER_PUBKEY = bytesToHex(schnorr.getPublicKey(SIGNER_SECRET));
const STRANGER_SECRET = keyFor(3);
const USER_PUBKEY = "c".repeat(64);
const RELAY = "wss://relay.example/";

const signAs = (
  secret: Uint8Array,
  clientPubkey: string,
  content: string,
): NostrEvent => {
  const unsigned = {
    pubkey: bytesToHex(schnorr.getPublicKey(secret)),
    created_at: 1,
    kind: 24_133,
    tags: [["p", clientPubkey]],
    content,
  };
  const id = computeEventId(unsigned);
  return {
    ...unsigned,
    id,
    sig: bytesToHex(schnorr.sign(hexToBytes(id), secret)),
  };
};

const setup = (options: { budget?: boolean } = {}) => {
  const listeners = new Set<RelaySubscriptionHandlers>();
  const closed = vi.fn();
  const sent: NostrEvent[] = [];
  const pool = {
    subscribe: vi.fn(
      (_url: string, _filters: unknown, next: RelaySubscriptionHandlers) => {
        if (options.budget === false) return undefined;
        listeners.add(next);
        next.onEose();
        return {
          close: () => {
            listeners.delete(next);
            closed();
          },
        };
      },
    ),
    publish: vi.fn(async (_url: string, event: NostrEvent) => {
      sent.push(event);
    }),
    allowLocalRelays: vi.fn(() => () => {}),
  };
  let fire: (() => void) | undefined;
  const attempt = startNostrConnect({
    pool,
    metadata: { name: "streets", url: "https://streets.example" },
    relays: [RELAY],
    setTimer: ((callback: () => void) => {
      fire = callback;
      return 0;
    }) as unknown as typeof setTimeout,
    clearTimer: (() => {}) as typeof clearTimeout,
  });
  const url = new URL(attempt.uri);
  const clientPubkey = url.hostname;
  const secret = url.searchParams.get("secret") ?? "";

  const reply = (
    from: Uint8Array,
    response: { id: string; result?: string; error?: string },
  ) => {
    const key = conversationKey(from, clientPubkey);
    const event = signAs(
      from,
      clientPubkey,
      encryptNip44(JSON.stringify(response), key),
    );
    for (const listener of [...listeners]) listener.onEvent(event);
  };
  /** 送られた要求に、署名器として答える。 */
  const answerRequests = async () => {
    const key = conversationKey(SIGNER_SECRET, clientPubkey);
    for (let seen = 0; seen < 2;) {
      await vi.waitFor(() => expect(sent.length).toBeGreaterThan(seen));
      const request = JSON.parse(decryptNip44(sent[seen].content, key));
      if (request.method === "get_public_key") {
        reply(SIGNER_SECRET, { id: request.id, result: USER_PUBKEY });
      } else {
        reply(SIGNER_SECRET, { id: request.id, error: "unsupported" });
      }
      seen += 1;
    }
  };
  return {
    attempt,
    pool,
    closed,
    secret,
    listeners,
    reply,
    answerRequests,
    timeout: () => fire?.(),
  };
};

describe("buildNostrConnectUri", () => {
  it("クライアントの公開鍵・リレー・secret・権限・名前を載せる", () => {
    const uri = new URL(
      buildNostrConnectUri({
        clientPubkey: "a".repeat(64),
        relays: ["wss://a.example/", "wss://b.example/"],
        secret: "s3cret",
        perms: "sign_event:1,nip44_encrypt",
        metadata: { name: "streets", url: "https://streets.example" },
      }),
    );
    expect(uri.protocol).toBe("nostrconnect:");
    expect(uri.hostname).toBe("a".repeat(64));
    expect(uri.searchParams.getAll("relay")).toEqual([
      "wss://a.example/",
      "wss://b.example/",
    ]);
    expect(uri.searchParams.get("secret")).toBe("s3cret");
    expect(uri.searchParams.get("perms")).toBe("sign_event:1,nip44_encrypt");
    expect(uri.searchParams.get("name")).toBe("streets");
    expect(uri.searchParams.get("url")).toBe("https://streets.example");
  });
});

describe("startNostrConnect", () => {
  it("secret を返した署名器と繋ぎ、ユーザーの公開鍵を聞いて session を作る", async () => {
    const base = setup();
    base.reply(SIGNER_SECRET, { id: "x", result: base.secret });
    await base.answerRequests();
    const session = await base.attempt.session;
    expect(session.userPubkey).toBe(USER_PUBKEY);
    expect(session.stored.remoteSignerPubkey).toBe(SIGNER_PUBKEY);
    expect(session.stored.relays).toEqual([RELAY]);
    session.client.close();
  });

  it("secret を返さない応答では繋がない", async () => {
    // 捕まえる変異: secret の照合を外す（URI を盗み見た第三者が署名器になりすませる）
    const base = setup();
    base.reply(STRANGER_SECRET, { id: "x", result: "ack" });
    base.reply(STRANGER_SECRET, { id: "x", result: "wrong" });
    expect(base.pool.publish).not.toHaveBeenCalled();
    base.attempt.cancel();
    await expect(base.attempt.session).rejects.toBeInstanceOf(
      NostrConnectCancelledError,
    );
  });

  it("取り消すと待つのをやめ、購読を閉じる", async () => {
    const base = setup();
    base.attempt.cancel();
    await expect(base.attempt.session).rejects.toBeInstanceOf(
      NostrConnectCancelledError,
    );
    expect(base.listeners.size).toBe(0);
  });

  it("時間内に繋がらなければ失敗し、購読を閉じる", async () => {
    const base = setup();
    base.timeout();
    await expect(base.attempt.session).rejects.toThrow(/did not connect/);
    expect(base.listeners.size).toBe(0);
  });

  it("承認待ちの時間切れは、承認待ちで止まったと分かるようにする", async () => {
    const base = setup();
    base.timeout();
    await expect(base.attempt.session).rejects.toMatchObject({
      details: { method: "connect", liveRelays: 1, relays: 1 },
    });
  });

  it("承認された直後に取り消したら、session を作らない", async () => {
    const base = setup();
    base.reply(SIGNER_SECRET, { id: "x", result: base.secret });
    base.attempt.cancel();
    await expect(base.attempt.session).rejects.toBeInstanceOf(
      NostrConnectCancelledError,
    );
    expect(base.pool.publish).not.toHaveBeenCalled();
  });

  it("購読を張れなければすぐ失敗する", async () => {
    const base = setup({ budget: false });
    await expect(base.attempt.session).rejects.toThrow(/budget/);
  });
});

describe("nostrconnect の試みを続ける", () => {
  const quietPool = () => ({
    subscribe: vi.fn(() => ({ close: () => {} })),
    publish: vi.fn(async () => {}),
    allowLocalRelays: vi.fn(() => () => {}),
  });
  const start = (
    resume?: Parameters<typeof startNostrConnect>[0]["resume"],
    now = 0,
  ) => {
    const delays: number[] = [];
    const attempt = startNostrConnect({
      pool: quietPool(),
      metadata: { name: "streets", url: "https://streets.example" },
      relays: [RELAY],
      resume,
      now: () => now,
      setTimer: ((_callback: () => void, delay: number) => {
        delays.push(delay);
        return 0;
      }) as unknown as typeof setTimeout,
      clearTimer: (() => {}) as typeof clearTimeout,
    });
    attempt.session.catch(() => {});
    return { attempt, delays };
  };

  it("保存した試みから始めると、同じ URI で待つ", () => {
    // 捕まえる変異: 読み込み直すたびに鍵と secret を作り直す（承認した署名器と繋がらない）
    const first = start(undefined, 1_000);
    const resumed = start(first.attempt.stored, 61_000);
    expect(resumed.attempt.uri).toBe(first.attempt.uri);
    first.attempt.cancel();
    resumed.attempt.cancel();
  });

  it("続けた試みは、最初に始めたときから数えて時間切れにする", () => {
    const first = start(undefined, 0);
    const resumed = start(first.attempt.stored, 240_000);
    expect(resumed.delays).toEqual([NOSTRCONNECT_TIMEOUT_MS - 240_000]);
    first.attempt.cancel();
    resumed.attempt.cancel();
  });

  it("保存した形を読み戻せる", () => {
    const { attempt } = start(undefined, 0);
    expect(
      loadNostrConnectAttempt(saveNostrConnectAttempt(attempt.stored), 1_000),
    ).toEqual(attempt.stored);
    attempt.cancel();
  });

  it("時間切れ・壊れた保存は読まない", () => {
    const { attempt } = start(undefined, 0);
    const raw = saveNostrConnectAttempt(attempt.stored);
    expect(
      loadNostrConnectAttempt(raw, NOSTRCONNECT_TIMEOUT_MS),
    ).toBeUndefined();
    expect(loadNostrConnectAttempt("not json", 0)).toBeUndefined();
    expect(
      loadNostrConnectAttempt(
        JSON.stringify({ ...attempt.stored, clientSecret: "x" }),
        0,
      ),
    ).toBeUndefined();
    attempt.cancel();
  });
});
