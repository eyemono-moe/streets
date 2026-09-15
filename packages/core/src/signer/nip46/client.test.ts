import { schnorr } from "@noble/curves/secp256k1.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { describe, expect, it, vi } from "vitest";
import { type NostrEvent, computeEventId } from "../../nostr/event";
import type { RelaySubscriptionHandlers } from "../../relay/relay-connection";
import { Nip46RpcError, createNip46Client } from "./client";
import { conversationKey, decryptNip44, encryptNip44 } from "./nip44";

const keyFor = (byte: number): Uint8Array => new Uint8Array(32).fill(byte);
const CLIENT_SECRET = keyFor(1);
const REMOTE_SECRET = keyFor(2);
const REMOTE_PUBKEY = bytesToHex(schnorr.getPublicKey(REMOTE_SECRET));
const CLIENT_PUBKEY = bytesToHex(schnorr.getPublicKey(CLIENT_SECRET));

const signResponse = (content: string): NostrEvent => {
  const unsigned = {
    pubkey: REMOTE_PUBKEY,
    created_at: 1,
    kind: 24_133,
    tags: [["p", CLIENT_PUBKEY]],
    content,
  };
  const id = computeEventId(unsigned);
  return {
    ...unsigned,
    id,
    sig: bytesToHex(schnorr.sign(hexToBytes(id), REMOTE_SECRET)),
  };
};

const setup = (hooks?: Parameters<typeof createNip46Client>[0]["hooks"]) => {
  let handlers: RelaySubscriptionHandlers | undefined;
  let sent: NostrEvent | undefined;
  const pool = {
    subscribe: vi.fn(
      (_url: string, _filters: unknown, next: RelaySubscriptionHandlers) => {
        handlers = next;
        return { close: vi.fn() };
      },
    ),
    publish: vi.fn(async (_url: string, event: NostrEvent) => {
      sent = event;
    }),
  };
  const client = createNip46Client({
    pool,
    clientSecret: CLIENT_SECRET,
    remoteSignerPubkey: REMOTE_PUBKEY,
    relays: ["wss://relay.example/"],
    now: () => 1_000,
    hooks,
  });
  return {
    client,
    pool,
    respond(response: { id: string; result?: string; error?: string }) {
      const key = conversationKey(REMOTE_SECRET, CLIENT_PUBKEY);
      handlers?.onEvent(
        signResponse(encryptNip44(JSON.stringify(response), key)),
      );
    },
    request(): { id: string; method: string; params: string[] } {
      if (!sent) throw new Error("request was not published");
      const key = conversationKey(REMOTE_SECRET, CLIENT_PUBKEY);
      return JSON.parse(decryptNip44(sent.content, key));
    },
    event: () => sent,
  };
};

describe("Nip46Client", () => {
  it("購読を張ってから暗号化・署名した要求を送る", async () => {
    const base = setup();
    const pending = base.client.request("ping");
    const request = base.request();
    expect(base.pool.subscribe).toHaveBeenCalledBefore(base.pool.publish);
    expect(request).toMatchObject({ method: "ping", params: [] });
    expect(base.event()).toMatchObject({
      pubkey: CLIENT_PUBKEY,
      kind: 24_133,
      tags: [["p", REMOTE_PUBKEY]],
    });
    base.respond({ id: request.id, result: "pong" });
    await expect(pending).resolves.toBe("pong");
  });

  it("別idの応答ではpendingを解決しない", async () => {
    vi.useFakeTimers();
    const base = setup();
    const pending = base.client.request("ping");
    base.respond({ id: "not-the-request", result: "pong" });
    const rejected = expect(pending).rejects.toBeInstanceOf(Nip46RpcError);
    await vi.advanceTimersByTimeAsync(30_000);
    await rejected;
    vi.useRealTimers();
  });

  it("署名が壊れた外側イベントを復号しない", async () => {
    vi.useFakeTimers();
    const base = setup();
    const pending = base.client.request("ping");
    const request = base.request();
    const key = conversationKey(REMOTE_SECRET, CLIENT_PUBKEY);
    const forged = signResponse(
      encryptNip44(JSON.stringify({ id: request.id, result: "pong" }), key),
    );
    forged.sig = "0".repeat(128);
    const handler = base.pool.subscribe.mock.calls[0]?.[2];
    handler.onEvent(forged);
    const rejected = expect(pending).rejects.toBeInstanceOf(Nip46RpcError);
    await vi.advanceTimersByTimeAsync(30_000);
    // 捕まえる変異: verifyEvent(event) のガードを削除して復号する。
    await rejected;
    vi.useRealTimers();
  });

  it("relay切替は新しい購読が取れた後で古い購読を閉じる", () => {
    const base = setup();
    const oldHandle = base.pool.subscribe.mock.results[0]?.value;
    expect(base.client.switchRelays(["wss://next.example/"])).toBe(true);
    expect(base.pool.subscribe).toHaveBeenCalledTimes(2);
    expect(oldHandle.close).toHaveBeenCalledTimes(1);
  });

  it("auth_urlを通知した後も同じidの終端応答を待つ", async () => {
    const onAuthUrl = vi.fn();
    const base = setup({ onAuthUrl });
    const pending = base.client.request("sign_event", ["{}"]);
    const request = base.request();
    base.respond({
      id: request.id,
      result: "auth_url",
      error: "https://signer.example/approve",
    });
    expect(onAuthUrl).toHaveBeenCalledWith(
      new URL("https://signer.example/approve"),
      request.id,
    );
    base.respond({ id: request.id, result: "signed" });
    await expect(pending).resolves.toBe("signed");
    expect(onAuthUrl).toHaveBeenLastCalledWith(undefined, request.id);
  });

  it("closeでpendingを失敗させる", async () => {
    const base = setup();
    const pending = base.client.request("ping");
    base.client.close();
    await expect(pending).rejects.toThrow("closed");
  });
});
