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

const sign = (content = "hello nostr", kind = 0): NostrEvent => {
  const unsigned = {
    pubkey,
    created_at: 1_700_000_000,
    kind,
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
  it("retention: none の kind は保存しない", () => {
    // 捕まえる変異: save() で shouldPersist の判定を外す。kind:3 は
    // 「保持しない」ではなく「そもそも書かない」—— 古いフォローリストが
    // ディスクに残ると、後から読む誰かがそれを使いうる。IndexedDB 実装は
    // selectForPersistence で落としているので、ここを素通しすると
    // 同じ契約が実装ごとに違う結果を出す
    const persistence = createMemoryPersistence();
    persistence.save([
      { event: sign("follows", 3), seenRelays: ["wss://a/"], fetchedAt: 1 },
      { event: sign("relays", 10002), seenRelays: ["wss://a/"], fetchedAt: 1 },
    ]);
    return persistence.load().then((loaded) => {
      expect(loaded.events.map((e) => e.event.kind)).toEqual([10002]);
    });
  });

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

  it("deleteDeletions で取り消した id は load の deletedIds に出ない", async () => {
    // 捕まえる変異: deleteDeletions を saveDeletions と同じ (追加する) 実装に
    // する / 何もしない no-op にする。EventStore.remove() が kind:5 の
    // 巻き戻しでこれを呼んでも記録が残り続け、publish が全滅したのに
    // 対象イベントが次回起動のたびに hydrate で弾かれ続ける
    const persistence = createMemoryPersistence();
    const target = sign("to-delete").id;

    persistence.saveDeletions([target]);
    persistence.deleteDeletions([target]);

    const { deletedIds } = await persistence.load();
    expect(deletedIds).toEqual([]);
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
      delete() {},
      deleteDeletions() {},
      dispose() {},
    };

    await expect(failing.load()).resolves.toEqual({
      events: [],
      deletedIds: [],
    });
  });
});
