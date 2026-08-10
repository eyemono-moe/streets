import { schnorr } from "@noble/curves/secp256k1.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { describe, expect, it } from "vitest";
import { type NostrEvent, computeEventId } from "../nostr/event";
import {
  type EventPersistence,
  type PersistedEvent,
  createMemoryPersistence,
} from "./event-persistence";

const secretKey = Uint8Array.from({ length: 32 }, (_, i) => i + 1);
const pubkey = bytesToHex(schnorr.getPublicKey(secretKey));

const sign = (content = "hello nostr"): NostrEvent => {
  const unsigned = {
    pubkey,
    created_at: 1_700_000_000,
    kind: 0,
    tags: [],
    content,
  };
  const id = computeEventId(unsigned);
  return {
    ...unsigned,
    id,
    sig: bytesToHex(schnorr.sign(hexToBytes(id), secretKey)),
  };
};

describe("createMemoryPersistence", () => {
  it("save した内容が fetchedAt も含めて load で戻る", async () => {
    // 捕まえる変異: fetchedAt を保存しない (0 や現在時刻で代替する)。
    // 水和後にどれだけ古いかが分からなくなり、staleMs の判定が壊れる
    const persistence = createMemoryPersistence();
    const entry: PersistedEvent = {
      event: sign("a"),
      seenRelays: ["wss://relay/"],
      fetchedAt: 12_345,
    };

    persistence.save([entry]);

    const { events } = await persistence.load();
    expect(events).toEqual([entry]);
  });

  it("saveDeletions した id が load の deletedIds に出る", async () => {
    // 捕まえる変異: 削除指示を保存しない。次回起動時に削除済みの投稿が
    // hydrate 経由で復活する (spec 10 節)
    const persistence = createMemoryPersistence();
    const target = sign("to-delete").id;

    persistence.saveDeletions([target]);

    const { deletedIds } = await persistence.load();
    expect(deletedIds).toEqual([target]);
  });

  it("dispose 後の save は無視される", async () => {
    // 捕まえる変異: dispose() のガードを省く。dispose 後に走った
    // 書き込みがそのまま反映されてしまう
    const persistence = createMemoryPersistence();
    persistence.dispose();

    persistence.save([{ event: sign("late"), seenRelays: [], fetchedAt: 1 }]);
    persistence.saveDeletions(["late-deletion"]);

    const { events, deletedIds } = await persistence.load();
    expect(events).toEqual([]);
    expect(deletedIds).toEqual([]);
  });
});

describe("EventPersistence.load() の規約", () => {
  it("load が内部で失敗しても reject せず空を返す", async () => {
    // 捕まえる変異: この模擬実装の load() が内部の例外を吸収せずそのまま
    // 投げる (try/catch を外す)。インメモリ実装はそもそも失敗しないので、
    // 「load() は reject しない」という規約は失敗を模す実装でしか固定できない
    // —— IndexedDB はプライベートブラウジング・容量超過で普通に失敗する
    const failing: EventPersistence = {
      async load() {
        try {
          throw new Error("simulated IndexedDB failure");
        } catch {
          return { events: [], deletedIds: [] };
        }
      },
      save() {},
      saveDeletions() {},
      dispose() {},
    };

    await expect(failing.load()).resolves.toEqual({
      events: [],
      deletedIds: [],
    });
  });
});
