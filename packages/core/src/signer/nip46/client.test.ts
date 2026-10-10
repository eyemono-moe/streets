import { schnorr } from "@noble/curves/secp256k1.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { describe, expect, it, vi } from "vite-plus/test";
import { type NostrEvent, computeEventId } from "../../nostr/event";
import type { RelaySubscriptionHandlers } from "../../relay/relay-connection";
import {
  NIP46_RPC_TIMEOUT_MS,
  Nip46RpcError,
  createNip46Client,
} from "./client";
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

const setup = (
  hooks?: Parameters<typeof createNip46Client>[0]["hooks"],
  options: { live?: boolean; refuse?: boolean } = {},
) => {
  let handlers: RelaySubscriptionHandlers | undefined;
  let sent: NostrEvent | undefined;
  const pool = {
    subscribe: vi.fn(
      (
        _url: string,
        _filters: unknown,
        next: RelaySubscriptionHandlers,
        _options?: unknown,
      ) => {
        handlers = next;
        if (options.live !== false) next.onEose();
        return { close: vi.fn() };
      },
    ),
    publish: vi.fn(
      async (_url: string, event: NostrEvent, _options?: unknown) => {
        if (options.refuse) throw new Error("blocked: kind not allowed");
        sent = event;
      },
    ),
    allowLocalRelays: vi.fn((_urls: readonly string[]) => vi.fn()),
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
    handlers: () => handlers,
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
    await vi.advanceTimersByTimeAsync(NIP46_RPC_TIMEOUT_MS);
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
    await vi.advanceTimersByTimeAsync(NIP46_RPC_TIMEOUT_MS);
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

  it("署名器のリレーは手元のものでも繋げるようにし、切り替えや終了で取り下げる", () => {
    const base = setup();
    const releaseOf = (call: number) =>
      base.pool.allowLocalRelays.mock.results[call]?.value as () => void;
    expect(base.pool.allowLocalRelays).toHaveBeenLastCalledWith([
      "wss://relay.example/",
    ]);

    base.client.switchRelays(["ws://localhost:7777/"]);
    expect(base.pool.allowLocalRelays).toHaveBeenLastCalledWith([
      "ws://localhost:7777/",
    ]);
    expect(releaseOf(0)).toHaveBeenCalledTimes(1);
    expect(releaseOf(1)).not.toHaveBeenCalled();

    base.client.close();
    expect(releaseOf(1)).toHaveBeenCalledTimes(1);
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

  it("result が null の応答を、応答として受け取る", async () => {
    // Primal は switch_relays に result: null で応える（NIP-46 の「変更なし」）。
    // 捕まえる変異: null を不正な応答として捨てる（30 秒の時間切れまでログインが終わらない）
    const base = setup();
    const pending = base.client.request("switch_relays");
    base.respond({ id: base.request().id, result: null as unknown as string });
    await expect(pending).resolves.toBe("null");
  });

  it("待つ上限を問い合わせごとに変えられる", async () => {
    vi.useFakeTimers();
    const base = setup();
    const pending = base.client.request("switch_relays", [], {
      timeoutMs: 5_000,
    });
    const rejected = expect(pending).rejects.toThrow("timed out");
    await vi.advanceTimersByTimeAsync(5_000);
    await rejected;
    vi.useRealTimers();
  });

  it("closeでpendingを失敗させる", async () => {
    const base = setup();
    const pending = base.client.request("ping");
    base.client.close();
    await expect(pending).rejects.toThrow("closed");
  });

  it("返事を受ける購読がリレーに届くまで、依頼を送らない", async () => {
    // 捕まえる変異: 購読の EOSE を待たずに publish する（購読がリレーの枠待ちの間に返事を取りこぼす）
    const base = setup(undefined, { live: false });
    const pending = base.client.request("ping");
    expect(base.pool.publish).not.toHaveBeenCalled();
    base.handlers()?.onEose();
    expect(base.pool.publish).toHaveBeenCalledTimes(1);
    base.respond({ id: base.request().id, result: "pong" });
    await expect(pending).resolves.toBe("pong");
  });

  it("ソケットが切れて繋ぎ直したら、返事を待っている依頼を送り直す", async () => {
    const base = setup();
    const pending = base.client.request("ping");
    const first = base.event();
    base.handlers()?.onClosed("socket closed");
    base.handlers()?.onEose();
    expect(base.pool.publish).toHaveBeenCalledTimes(2);
    expect(base.event()).toBe(first);
    base.respond({ id: base.request().id, result: "pong" });
    await expect(pending).resolves.toBe("pong");
  });

  it("繋がったままのリレーへは、同じ依頼を二度送らない", () => {
    const base = setup();
    void base.client.request("ping").catch(() => {});
    base.handlers()?.onEose();
    expect(base.pool.publish).toHaveBeenCalledTimes(1);
    base.client.close();
  });

  it("どのリレーにも依頼を断られたら、時間切れを待たずに失敗させる", async () => {
    const base = setup(undefined, { refuse: true });
    await expect(base.client.request("ping")).rejects.toThrow(
      "could not be sent to any relay",
    );
  });

  it("依頼と購読を、読み取りと別の署名器の経路に通す", () => {
    const base = setup();
    void base.client.request("ping").catch(() => {});
    expect(base.pool.subscribe.mock.calls[0]?.[3]).toEqual({ lane: "signer" });
    expect(base.pool.publish.mock.calls[0]?.[2]).toEqual({ lane: "signer" });
    base.client.close();
  });

  it("時間切れの失敗に、止まった依頼と購読の様子を載せる", async () => {
    // 捕まえる変異: 失敗に通り道の様子を載せない（購読が届かなかったのか、返事が来なかったのか切り分けられない）
    vi.useFakeTimers();
    const base = setup();
    const pending = base.client.request("get_public_key");
    base.handlers()?.onClosed("socket closed");
    base.handlers()?.onEose();
    const rejected = pending.catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(NIP46_RPC_TIMEOUT_MS);
    const error = await rejected;
    expect(error).toBeInstanceOf(Nip46RpcError);
    expect((error as Nip46RpcError).details).toMatchObject({
      method: "get_public_key",
      liveRelays: 1,
      relays: 1,
      reconnects: 1,
    });
    vi.useRealTimers();
  });

  it("購読が一度も届かずに時間切れになったら、届くまでの時間を載せない", async () => {
    vi.useFakeTimers();
    const base = setup(undefined, { live: false });
    const rejected = base.client
      .request("ping")
      .catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(NIP46_RPC_TIMEOUT_MS);
    const { details } = (await rejected) as Nip46RpcError;
    expect(details?.liveRelays).toBe(0);
    expect(details?.firstLiveMs).toBeUndefined();
    vi.useRealTimers();
  });
});
