import { schnorr } from "@noble/curves/secp256k1.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { describe, expect, it } from "vite-plus/test";
import { type NostrEvent, computeEventId } from "../nostr/event";
import type { RelayUrl } from "../relay/relay-connection";
import { authorRelays, broadcast, canBroadcast } from "./broadcast";
import type { RelayProgress } from "./write-progress";
import { WriteFailedError } from "./writer";

const sign = (kind: number): NostrEvent => {
  const sk = Uint8Array.from({ length: 32 }, (_, i) => i + 1);
  const unsigned = {
    kind,
    created_at: 1_700_000_000,
    tags: [],
    content: "hello",
    pubkey: bytesToHex(schnorr.getPublicKey(sk)),
  };
  const id = computeEventId(unsigned);
  return { ...unsigned, id, sig: bytesToHex(schnorr.sign(hexToBytes(id), sk)) };
};

const A = "wss://a.example/" as RelayUrl;
const B = "wss://b.example/" as RelayUrl;

/** `failing` に入れた URL だけ断る。同時に開いた数の最大も数える。 */
const fakePool = (failing: RelayUrl[] = []) => {
  const sent: RelayUrl[] = [];
  let open = 0;
  let peak = 0;
  return {
    sent,
    peak: () => peak,
    publish: async (relay: RelayUrl) => {
      open += 1;
      peak = Math.max(peak, open);
      await Promise.resolve();
      open -= 1;
      if (failing.includes(relay)) throw new Error("blocked");
      sent.push(relay);
    },
  };
};

describe("broadcast", () => {
  it("署名し直さず、選んだリレーへ 1 回ずつ送る", async () => {
    const pool = fakePool();
    const result = await broadcast(pool, sign(1), [A, B, A]);
    expect(pool.sent).toEqual([A, B]);
    expect(result).toEqual({ accepted: [A, B], rejected: [] });
  });

  it("リレーごとの結果を進み具合として渡す", async () => {
    const seen: RelayProgress[][] = [];
    await broadcast(fakePool([B]), sign(1), [A, B], (relays) =>
      seen.push(relays),
    );
    expect(seen[0]?.map((entry) => entry.state)).toEqual([
      "pending",
      "pending",
    ]);
    expect(seen.at(-1)).toEqual([
      { relay: A, state: "accepted" },
      { relay: B, state: "rejected", reason: "blocked" },
    ]);
  });

  it("送り先が多くても、一度に開くのは数本に留める", async () => {
    const pool = fakePool();
    const many = Array.from(
      { length: 20 },
      (_, i) => `wss://r${i}.example/` as RelayUrl,
    );
    await broadcast(pool, sign(1), many);
    expect(pool.sent).toHaveLength(20);
    expect(pool.peak()).toBeLessThanOrEqual(4);
  });

  it("1 本も受け取らなければ失敗にする", async () => {
    await expect(broadcast(fakePool([A]), sign(1), [A])).rejects.toBeInstanceOf(
      WriteFailedError,
    );
  });

  it("署名が合わないイベントは送らない", async () => {
    const pool = fakePool();
    const tampered = { ...sign(1), content: "changed" };
    await expect(broadcast(pool, tampered, [A])).rejects.toThrow();
    expect(pool.sent).toEqual([]);
  });

  it("暗号化されたイベントは送り直さない", async () => {
    expect(canBroadcast(sign(4))).toBe(false);
    expect(canBroadcast(sign(1059))).toBe(false);
    expect(canBroadcast(sign(1))).toBe(true);
    await expect(broadcast(fakePool(), sign(4), [A])).rejects.toThrow();
  });
});

describe("authorRelays", () => {
  const AUTHOR = "a".repeat(64);
  const REPLIED = "b".repeat(64);
  const C = "wss://c.example/" as RelayUrl;
  const routing = (
    write: Record<string, RelayUrl[]>,
    read: Record<string, RelayUrl[]>,
  ) => ({
    writeRelaysFor: (pubkey: string) => write[pubkey] ?? [],
    readRelaysFor: (pubkey: string) => read[pubkey] ?? [],
  });

  it("投稿した人の書き込みリレーと、返信先の読み込みリレーを返す", () => {
    const event = { kind: 1, pubkey: AUTHOR, tags: [["p", REPLIED]] };
    expect(
      authorRelays(
        event,
        routing({ [AUTHOR]: [A] }, { [AUTHOR]: [B], [REPLIED]: [A, C] }),
      ),
    ).toEqual([A, C]);
  });

  it("投稿した人の書き込み先が分からなければ空にする", () => {
    const event = { kind: 1, pubkey: AUTHOR, tags: [["p", REPLIED]] };
    expect(authorRelays(event, routing({}, { [REPLIED]: [C] }))).toEqual([]);
  });
});
