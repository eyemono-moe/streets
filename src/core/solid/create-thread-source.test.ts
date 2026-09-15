import { schnorr } from "@noble/curves/secp256k1.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { createRoot, createSignal } from "solid-js";
import { describe, expect, it } from "vitest";
import { type NostrEvent, computeEventId } from "../nostr/event";
import { EventStore } from "../read/event-store";
import type { RelayUrl } from "../relay/relay-connection";
import { createThreadSource } from "./create-thread-source";

// create-section.test.tsx と同じ手法: 種から 32 byte 鍵を作り schnorr で
// 実署名する (`EventStore.put` の検証を通すため)。
const keyFor = (seed: number) =>
  Uint8Array.from(
    Array.from({ length: 32 }, (_, i) => ((seed + i * 7) % 255) + 1),
  );

const signed = (seed: number, tags: string[][] = []): NostrEvent => {
  const sk = keyFor(seed);
  const unsigned = {
    pubkey: bytesToHex(schnorr.getPublicKey(sk)),
    created_at: 1_700_000_000,
    kind: 1,
    tags,
    content: `note ${seed}`,
  };
  const id = computeEventId(unsigned);
  return {
    ...unsigned,
    id,
    sig: bytesToHex(schnorr.sign(hexToBytes(id), sk)),
  };
};

describe("createThreadSource", () => {
  it("同じ根のまま 1 段進んでも source() の参照は変わらない", () => {
    // 捕まえる変異: relayHints/source が focusId() を直接追跡する。すると
    // 中身は同じでも参照が新しい配列を返し、`===` が「変わった」と誤判定
    // して source() が再計算され、createSection の購読が張り直る。
    const store = new EventStore();
    const root = signed(1);
    const mid = signed(2, [["e", root.id, "", "root"]]);
    const leaf = signed(3, [
      ["e", root.id, "", "root"],
      ["e", mid.id, "", "reply"],
    ]);
    store.put(root, "wss://relay/");
    store.put(mid, "wss://relay/");
    store.put(leaf, "wss://relay/");

    createRoot((dispose) => {
      const [focusId, setFocusId] = createSignal<string | undefined>(mid.id);
      const threadSource = createThreadSource({
        focusId,
        store,
        columnRelays: () => undefined,
        relaysOverride: undefined,
      });

      const first = threadSource.source();
      setFocusId(leaf.id); // 同じ根 (root) のまま 1 段進む
      const second = threadSource.source();

      expect(second).toBe(first);
      dispose();
    });
  });

  it("根が変わると source() の参照も変わる (対照)", () => {
    // 上のテストが「そもそも一切再計算しない実装」でも通ってしまわない
    // ようにする対照 —— 根が実際に変わるときは再計算されなければならない。
    const store = new EventStore();
    const rootA = signed(4);
    const rootB = signed(5);
    store.put(rootA, "wss://relay/");
    store.put(rootB, "wss://relay/");

    createRoot((dispose) => {
      const [focusId, setFocusId] = createSignal<string | undefined>(rootA.id);
      const threadSource = createThreadSource({
        focusId,
        store,
        columnRelays: () => undefined,
        relaysOverride: undefined,
      });

      const first = threadSource.source();
      setFocusId(rootB.id); // 別の根へ
      const second = threadSource.source();

      expect(second).not.toBe(first);
      dispose();
    });
  });

  it("カラムに明示リレーが無くヒントがあれば、ヒントを FALLBACK_RELAYS に足す (置き換えない)", () => {
    // 捕まえる変異: ヒントだけを relays に使う (fallback を含めない)。
    // ヒント 1 本だけで、本来 3 本の fallback 同報が narrow されてしまう。
    const store = new EventStore();
    const root = signed(6);
    const focus = signed(7, [["e", root.id, "wss://hinted-relay/", "root"]]);
    store.put(root, "wss://relay/");
    store.put(focus, "wss://relay/");

    createRoot((dispose) => {
      const [focusId] = createSignal<string | undefined>(focus.id);
      const threadSource = createThreadSource({
        focusId,
        store,
        columnRelays: () => undefined, // カラムは Outbox/followees ルート
        relaysOverride: undefined,
      });

      const relays = threadSource.source().relays as RelayUrl[] | undefined;
      expect(relays).toContain("wss://hinted-relay/");
      // FALLBACK_RELAYS の 3 本 (default-relays.ts) が締め出されていない
      // ことを直接主張する。
      expect(relays).toEqual(
        expect.arrayContaining([
          "wss://yabu.me/",
          "wss://nos.lol/",
          "wss://relay.damus.io/",
        ]),
      );
      dispose();
    });
  });

  it("カラムに明示リレーがあれば、ヒントはそこへ足すだけで fallback は混ざらない", () => {
    const store = new EventStore();
    const root = signed(8);
    const focus = signed(9, [["e", root.id, "wss://hinted-relay/", "root"]]);
    store.put(root, "wss://relay/");
    store.put(focus, "wss://relay/");

    createRoot((dispose) => {
      const [focusId] = createSignal<string | undefined>(focus.id);
      const threadSource = createThreadSource({
        focusId,
        store,
        columnRelays: () => ["wss://column-relay/"] as RelayUrl[],
        relaysOverride: undefined,
      });

      const relays = threadSource.source().relays;
      expect(relays).toEqual(
        expect.arrayContaining(["wss://column-relay/", "wss://hinted-relay/"]),
      );
      expect(relays).not.toContain("wss://yabu.me/");
      dispose();
    });
  });
});
