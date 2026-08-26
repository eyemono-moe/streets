import { schnorr } from "@noble/curves/secp256k1.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { describe, expect, it } from "vitest";
import { type NostrEvent, computeEventId } from "../nostr/event";
import type { EventPersistence, PersistedEvent } from "./event-persistence";
import { EventStore } from "./event-store";
import { createFakeClock } from "./fake-clock";

// Task 1 と同じく、その場で署名して自己整合的なイベントを作る
const secretKey = Uint8Array.from({ length: 32 }, (_, i) => i + 1);
const pubkey = bytesToHex(schnorr.getPublicKey(secretKey));

const sign = (
  content = "hello nostr",
  overrides: {
    kind?: number;
    created_at?: number;
    tags?: string[][];
  } = {},
): NostrEvent => {
  const unsigned = {
    pubkey,
    created_at: overrides.created_at ?? 1_700_000_000,
    kind: overrides.kind ?? 1,
    tags: overrides.tags ?? [],
    content,
  };
  const id = computeEventId(unsigned);
  return {
    ...unsigned,
    id,
    sig: bytesToHex(schnorr.sign(hexToBytes(id), secretKey)),
  };
};

const validEvent = sign();

describe("EventStore", () => {
  it("検証にかかった時間と件数を積む", () => {
    // 捕まえる変異: verifyCount を検証の前ではなく `verified` が真のときだけ
    // 増やす。拒否されたイベントも schnorr のコストは払っているので、
    // 数えないと「検証にどれだけ費やしたか」が過小に出る。
    const store = new EventStore();
    const event = sign("verified");
    const forged = { ...sign("forged"), sig: "0".repeat(128) };

    expect(store.verifyCount).toBe(0);
    expect(store.put(event, "wss://relay/")).toBe("inserted");
    expect(store.put(forged, "wss://relay/")).toBe("rejected");
    expect(store.verifyCount).toBe(2);

    // 捕まえる変異: 重複経路でも計上する (重複は検証していないのに
    // 検証時間が水増しされ、初回描画の分解が狂う)
    expect(store.put(event, "wss://other/")).toBe("duplicate");
    expect(store.verifyCount).toBe(2);

    expect(store.verifyMs).toBeGreaterThan(0);
  });

  it("stores a valid event once and tracks every relay that saw it", () => {
    const store = new EventStore();

    expect(store.put(validEvent, "wss://a")).toBe("inserted");
    expect(store.put(validEvent, "wss://b")).toBe("duplicate");

    expect(store.get(validEvent.id)).toEqual(validEvent);
    expect(store.seenRelays(validEvent.id)).toEqual(["wss://a", "wss://b"]);
    expect(store.size).toBe(1);
  });

  it("does not record the same relay twice", () => {
    const store = new EventStore();

    store.put(validEvent, "wss://a");
    store.put(validEvent, "wss://a");

    expect(store.seenRelays(validEvent.id)).toEqual(["wss://a"]);
  });

  it("rejects events whose signature does not verify", () => {
    const store = new EventStore();
    const tampered = { ...validEvent, content: "tampered" };

    expect(store.put(tampered, "wss://a")).toBe("rejected");
    expect(store.size).toBe(0);
  });

  it("returns a copy of seenRelays to prevent external mutation", () => {
    const store = new EventStore();
    store.put(validEvent, "wss://a");

    const relays = store.seenRelays(validEvent.id);
    relays.push("wss://attacker.com");

    expect(store.seenRelays(validEvent.id)).toEqual(["wss://a"]);
  });

  it("does not credit a relay that sends a forged payload under a genuine id", () => {
    const store = new EventStore();
    store.put(validEvent, "wss://a");

    const forged = { ...validEvent, content: "forged" };

    expect(store.put(forged, "wss://attacker.com")).toBe("duplicate");
    expect(store.seenRelays(validEvent.id)).toEqual(["wss://a"]);
  });

  it("keeps the original genuine event after a forged duplicate delivery", () => {
    const store = new EventStore();
    store.put(validEvent, "wss://a");

    const forged = { ...validEvent, content: "forged" };
    store.put(forged, "wss://attacker.com");

    expect(store.get(validEvent.id)).toEqual(validEvent);
  });

  it("put は取得時刻を入れる", () => {
    // 捕まえる変異: fetchedAt を event.created_at にする。created_at は
    // 著者が書いた時刻であって取得時刻ではない —— 2 年前の kind:0 を
    // 今取得しても「2 年前に取得した」ことになり、常に stale と判定される
    const clock = createFakeClock();
    clock.advance(5_000);
    const store = new EventStore({ scheduler: clock });
    const event = sign("x");
    store.put(event, "wss://relay/");
    expect(store.fetchedAt(event.id)).toBe(5_000);
  });

  it("invalidate は取得時刻を 0 にする", () => {
    // 捕まえる変異: invalidate を no-op にする。fetchedAt を 0 に
    // 進める前に put しているだけだと、この変異があっても偶然 0 のままで
    // テストが気づかない —— 先に時計を進めて非ゼロにしてから invalidate し、
    // 0 に「戻った」ことを確かめる
    const clock = createFakeClock();
    clock.advance(5_000);
    const store = new EventStore({ scheduler: clock });
    const profile = sign("p", { kind: 0 });
    store.put(profile, "wss://relay/");
    expect(store.replaceableFetchedAt(0, profile.pubkey)).toBe(5_000);

    store.invalidate(0, profile.pubkey);

    // 捕まえる変異: invalidate がイベントごと消す。消すと「持っていない」に
    // なり、serveWhileRevalidating: true の kind で古い値を出せなくなる
    expect(store.replaceableFetchedAt(0, profile.pubkey)).toBe(0);
    // イベント自体は残る
    expect(store.latestReplaceable(0, profile.pubkey)).toBeDefined();
  });

  it("put は同一イベントの再配送でも取得時刻を更新する", () => {
    // 捕まえる変異: 重複経路で fetchedAt を更新しない (最初の put だけが
    // 効く)。置換可能イベント (kind:10002 など) を著者が一年変えなくても、
    // staleMs 経過ごとに再取得され、リレーが同一イベントを返しても
    // fetchedAt が初回のまま固定され、二度と「新鮮」に戻らなくなる
    const clock = createFakeClock();
    const store = new EventStore({ scheduler: clock });
    const event = sign("x");

    expect(store.put(event, "wss://a/")).toBe("inserted");
    expect(store.fetchedAt(event.id)).toBe(0);

    clock.advance(8_000);
    expect(store.put(event, "wss://b/")).toBe("duplicate");
    expect(store.fetchedAt(event.id)).toBe(8_000);
  });

  it("id 再検証に失敗する偽装済み重複配送は取得時刻を更新しない", () => {
    // 捕まえる変異: id 再計算のガードの外で restamp する。既知の id を騙る
    // だけの偽装ペイロードが、内容を検証されないまま鮮度だけを更新できて
    // しまう (put が返す schnorr 未検証の重複と同じ攻撃面)
    const clock = createFakeClock();
    const store = new EventStore({ scheduler: clock });
    const event = sign("x");
    store.put(event, "wss://a/");

    clock.advance(8_000);
    const forged = { ...event, content: "forged" };
    expect(store.put(forged, "wss://attacker.com")).toBe("duplicate");
    expect(store.fetchedAt(event.id)).toBe(0);
  });
});

describe("EventStore.hydrate", () => {
  it("署名を検証せずに入れる", () => {
    // 捕まえる変異: hydrate の中で verifyEvent を呼ぶ。実測 0.498ms/件、
    // 9000 件超で 4.7 秒かかり、起動の初回描画をまるごと埋めてしまう
    const store = new EventStore();
    const forged = { ...sign("x"), sig: "0".repeat(128) };

    store.hydrate([
      { event: forged, seenRelays: ["wss://relay/"], fetchedAt: 1 },
    ]);

    expect(store.get(forged.id)).toEqual(forged);
  });

  it("verifyCount を増やさない", () => {
    // 捕まえる変異: hydrate の中で verifyEvent を呼ぶ (同じ経路を
    // カウンタ側から捕まえる —— こちらは verifyMs/verifyCount という
    // 表示値が水和で不当に膨らまないことの確認)
    const store = new EventStore();
    store.hydrate([{ event: validEvent, seenRelays: [], fetchedAt: 1 }]);

    expect(store.verifyCount).toBe(0);
  });

  it("fetchedAt は引数の値になる (現在時刻ではない)", () => {
    // 捕まえる変異: hydrate の中で fetchedAt に scheduler.now() を入れる。
    // 水和のたびに全件が新鮮になり、staleMs が永久に発火しなくなる ——
    // 時計を大きく進めてから水和し、「今」と引数の値が一致しないようにして
    // 混同できないようにする
    const clock = createFakeClock();
    clock.advance(999_000);
    const store = new EventStore({ scheduler: clock });

    store.hydrate([{ event: validEvent, seenRelays: [], fetchedAt: 42 }]);

    expect(store.fetchedAt(validEvent.id)).toBe(42);
  });

  it("既にある id を上書きしない", () => {
    // 捕まえる変異: 既存チェックを省いて無条件に上書きする。リレーから
    // 届いた新しい版を、後から走った水和が古い永続データで巻き戻してしまう
    const clock = createFakeClock();
    const store = new EventStore({ scheduler: clock });
    store.put(validEvent, "wss://a/");
    clock.advance(1_000);

    store.hydrate([
      {
        event: { ...validEvent, content: "stale copy from disk" },
        seenRelays: ["wss://stale/"],
        fetchedAt: 999,
      },
    ]);

    expect(store.get(validEvent.id)).toEqual(validEvent);
    expect(store.fetchedAt(validEvent.id)).toBe(0);
  });

  it("deletedIds に含まれる id は入れない", () => {
    // 捕まえる変異: 除外チェックを省く。ユーザーが消したはずの投稿が
    // 次回起動時に復活する (ADR-0019)
    const store = new EventStore();

    store.hydrate([{ event: validEvent, seenRelays: [], fetchedAt: 1 }], {
      deletedIds: [validEvent.id],
    });

    expect(store.get(validEvent.id)).toBeUndefined();
  });

  it("isNostrEvent を通らない形のものは入れない", () => {
    // 捕まえる変異: 形の検査を省く。永続層のデータが壊れている
    // (スキーマ変更・部分書き込み) 場合にそのまま store へ入ってしまう
    const store = new EventStore();
    const malformed = { ...validEvent, sig: "not-hex" } as NostrEvent;

    store.hydrate([{ event: malformed, seenRelays: [], fetchedAt: 1 }]);

    expect(store.size).toBe(0);
  });
});

describe("EventStore.latestReplaceable", () => {
  it("returns undefined when nothing is stored for that author", () => {
    const store = new EventStore();
    expect(store.latestReplaceable(10002, "f".repeat(64))).toBeUndefined();
  });

  it("returns the version with the greatest created_at", () => {
    const store = new EventStore();
    const older = sign("older", { kind: 10002, created_at: 1_000 });
    const newer = sign("newer", { kind: 10002, created_at: 2_000 });

    store.put(newer, "wss://a");
    store.put(older, "wss://a");

    expect(store.latestReplaceable(10002, newer.pubkey)?.content).toBe("newer");
  });

  it("does not confuse kinds or authors", () => {
    const store = new EventStore();
    const relayList = sign("relays", { kind: 10002, created_at: 1_000 });
    store.put(relayList, "wss://a");

    expect(store.latestReplaceable(3, relayList.pubkey)).toBeUndefined();
    expect(store.latestReplaceable(10002, "0".repeat(64))).toBeUndefined();
  });

  // NIP-01: "In case of replaceable events with the same timestamp, the
  // event with the lowest id (first in lexical order) should be retained."
  // (nostr-protocol/nips 01.md:101)
  const findTiedPair = () => {
    const a = sign("tie-a", { kind: 10002, created_at: 1_000 });
    const b = sign("tie-b", { kind: 10002, created_at: 1_000 });
    return a.id < b.id ? { lower: a, higher: b } : { lower: b, higher: a };
  };

  it("keeps the lexicographically smaller id when created_at ties and it arrives second", () => {
    const store = new EventStore();
    const { lower, higher } = findTiedPair();

    store.put(higher, "wss://a");
    store.put(lower, "wss://a");

    expect(store.latestReplaceable(10002, lower.pubkey)?.id).toBe(lower.id);
  });

  it("keeps the lexicographically smaller id when created_at ties and it arrives first", () => {
    const store = new EventStore();
    const { lower, higher } = findTiedPair();

    store.put(lower, "wss://a");
    store.put(higher, "wss://a");

    expect(store.latestReplaceable(10002, lower.pubkey)?.id).toBe(lower.id);
  });

  // The signature-verification gate in put() runs before #indexReplaceable.
  // This is the single invariant protecting the routing table from
  // unverified relay input: a relay cannot force a routing-table update by
  // resending a bad-signature event with a newer created_at.
  it("leaves the replaceable index untouched when a newer-but-forged event is rejected", () => {
    const store = new EventStore();
    const genuine = sign("genuine relay list", {
      kind: 10002,
      created_at: 1_000,
    });
    store.put(genuine, "wss://a");

    const forged = {
      ...sign("attacker relay list", { kind: 10002, created_at: 2_000 }),
      sig: "00".repeat(64),
    };

    expect(store.put(forged, "wss://attacker.com")).toBe("rejected");
    expect(store.latestReplaceable(10002, genuine.pubkey)).toEqual(genuine);
  });

  it("prefers a strictly newer version even when the older one has the smaller id", () => {
    // Search for a content pair where the *older* event happens to have the
    // lexicographically smaller (or equal) id. This is the exact shape that
    // would fool a tie-break that compares ids before checking created_at:
    // such a bug would wrongly keep "older" here instead of replacing it.
    const findCase = () => {
      for (let i = 0; i < 100; i++) {
        const older = sign(`older-${i}`, { kind: 10002, created_at: 1_000 });
        const newer = sign(`newer-${i}`, { kind: 10002, created_at: 2_000 });
        if (older.id <= newer.id) return { older, newer };
      }
      throw new Error("could not find a matching id/created_at combination");
    };
    const store = new EventStore();
    const { older, newer } = findCase();

    store.put(older, "wss://a");
    store.put(newer, "wss://a");

    expect(store.latestReplaceable(10002, older.pubkey)?.content).toBe(
      newer.content,
    );
  });
});

describe("EventStore と EventPersistence の配線", () => {
  const createRecordingPersistence = (): EventPersistence & {
    saved: PersistedEvent[];
    deletedIds: string[];
  } => {
    const saved: PersistedEvent[] = [];
    const deletedIds: string[] = [];
    return {
      saved,
      deletedIds,
      async load() {
        return { events: [], deletedIds: [] };
      },
      save(entries) {
        saved.push(...entries);
      },
      saveDeletions(ids) {
        deletedIds.push(...ids);
      },
      delete() {},
      deleteDeletions(ids) {
        for (const id of ids) {
          const index = deletedIds.indexOf(id);
          if (index !== -1) deletedIds.splice(index, 1);
        }
      },
      dispose() {},
    };
  };

  it("新規挿入のたびに persistence.save() へ転送する", () => {
    // 捕まえる変異: #persist の呼び出しを省く。routing-table.ts が前提に
    // している「kind:10002 を普通のイベントとして保存すれば永続化は自動的に
    // 得られる」が成立せず、warmUpRouting が取ってきたリレーリストが
    // IndexedDB へ一切書かれないまま、次回起動が常にキャッシュ無しになる
    const clock = createFakeClock();
    const persistence = createRecordingPersistence();
    const store = new EventStore({ scheduler: clock, persistence });
    const event = sign("x", { kind: 10002 });

    store.put(event, "wss://a/");

    expect(persistence.saved).toEqual([
      { event, seenRelays: ["wss://a/"], fetchedAt: 0 },
    ]);
  });

  it("同一イベントの再配送 (restamp) でも persistence.save() へ転送する", () => {
    // 捕まえる変異: 新規挿入のときだけ転送し、restamp では転送しない。
    // 著者が変えていない kind:10002 を再取得しても永続層の fetchedAt が
    // 初回取得時刻のまま固定され、次回起動のたびに (実際には新鮮なはずの)
    // その著者だけ stale と誤判定されて取り直しが止まらなくなる
    const clock = createFakeClock();
    const persistence = createRecordingPersistence();
    const store = new EventStore({ scheduler: clock, persistence });
    const event = sign("x", { kind: 10002 });

    store.put(event, "wss://a/");
    clock.advance(9_000);
    store.put(event, "wss://b/");

    expect(persistence.saved.at(-1)).toEqual({
      event,
      seenRelays: ["wss://a/", "wss://b/"],
      fetchedAt: 9_000,
    });
  });

  it("拒否されたイベントは persistence.save() へ渡さない", () => {
    // 捕まえる変異: verifyEvent の結果を見ずに転送する。署名検証に落ちた
    // ペイロードを永続層に書くと、次回起動でそのまま hydrate され
    // (hydrate は署名を検証しない、spec 8 節)、偽装イベントが画面に出る
    const persistence = createRecordingPersistence();
    const store = new EventStore({ persistence });
    const tampered = { ...sign("x"), content: "tampered" };

    expect(store.put(tampered, "wss://a/")).toBe("rejected");

    expect(persistence.saved).toEqual([]);
  });

  it("kind:5 の e タグ対象を saveDeletions へ渡す", () => {
    // 捕まえる変異: kind:5 を他のイベントと同じ扱いにして saveDeletions を
    // 呼ばない。削除指示そのものが永続化されず、次回起動で消したはずの
    // 投稿が復活する余地を残す (このスライスでは対象本体をまだ永続化しない
    // ので実害は無いが、機構としては固定しておく必要がある —— spec 10 節)
    const persistence = createRecordingPersistence();
    const store = new EventStore({ persistence });
    const targetA = "a".repeat(64);
    const targetB = "b".repeat(64);
    const deletion = sign("", {
      kind: 5,
      tags: [
        ["e", targetA],
        ["e", targetB],
        ["p", "c".repeat(64)],
      ],
    });

    store.put(deletion, "wss://a/");

    expect(persistence.deletedIds).toEqual([targetA, targetB]);
  });

  it("kind:5 を remove() で巻き戻すと saveDeletions した対象も取り消す", () => {
    // 捕まえる変異: remove() が persistence.deleteDeletions を呼ばない
    // (呼ばずに persistence.delete だけ呼ぶ)。publish が全リレーで失敗して
    // Writer が kind:5 を巻き戻しても deletions レコードだけ残り、
    // hydrate が次回起動のたびに対象 id を弾き続ける —— 「どのリレーにも
    // 届きませんでした」と表示されたのに、本人の投稿だけがローカルでは
    // 消えたままになる不整合を招く
    const persistence = createRecordingPersistence();
    const store = new EventStore({ persistence });
    const targetA = "a".repeat(64);
    const targetB = "b".repeat(64);
    const deletion = sign("", {
      kind: 5,
      tags: [
        ["e", targetA],
        ["e", targetB],
      ],
    });

    store.put(deletion, "wss://a/");
    expect(persistence.deletedIds).toEqual([targetA, targetB]);

    store.remove(deletion.id);

    expect(persistence.deletedIds).toEqual([]);
  });

  it("persistence を渡さない store は put() で例外を投げない", () => {
    // 捕まえる変異: #persistence?.save(...) のオプショナル呼び出しを
    // 無条件呼び出しにする。デバッグルート・大半のユニットテストは
    // persistence 無しで EventStore を作っており、そこで例外が飛ぶと
    // put() 自体が使えなくなる
    const store = new EventStore();
    expect(() => store.put(sign("x"), "wss://a/")).not.toThrow();
  });
});

describe("EventStore.eventsByTag", () => {
  it("e タグの値で引ける", () => {
    // 捕まえる変異: 索引を作らない
    const store = new EventStore();
    const event = sign("reply", { tags: [["e", "abc123"]] });
    store.put(event, "wss://relay/");

    const results = store.eventsByTag("e", "abc123");
    expect(results).toEqual([event]);
  });

  it("同じタグ値を持つイベントが複数あればすべて返る", () => {
    // 捕まえる変異: 1 件で上書きする (Map の値を Set にしない)
    const store = new EventStore();
    const event1 = sign("reply1", {
      created_at: 1000,
      tags: [["e", "abc123"]],
    });
    const event2 = sign("reply2", {
      created_at: 2000,
      tags: [["e", "abc123"]],
    });

    store.put(event1, "wss://relay1/");
    store.put(event2, "wss://relay2/");

    const results = store.eventsByTag("e", "abc123");
    expect(results).toHaveLength(2);
    expect(results).toContainEqual(event1);
    expect(results).toContainEqual(event2);
  });

  it("複数文字のタグは索引しない", () => {
    // 捕まえる変異: 全タグを索引する
    // (imeta のような長いタグまで索引するとメモリが無駄に増える)
    const store = new EventStore();
    const event = sign("with metadata", {
      tags: [
        ["e", "abc123"],
        ["imeta", "url https://example.com/image.png"],
      ],
    });
    store.put(event, "wss://relay/");

    expect(store.eventsByTag("e", "abc123")).toEqual([event]);
    expect(
      store.eventsByTag("imeta", "url https://example.com/image.png"),
    ).toEqual([]);
  });

  it("同じイベントを 2 度 put しても、同じタグを 2 つ持っていても重複しない", () => {
    // 捕まえる変異: id で潰さない (複数リレーから同じイベントが届くのは普通で、
    // 数が倍になる) / 索引の値を Set にしない
    const store = new EventStore();
    const event = sign("shared", {
      tags: [
        ["e", "abc123"],
        ["e", "abc123"],
      ],
    });

    store.put(event, "wss://relay1/");
    store.put(event, "wss://relay2/");

    const results = store.eventsByTag("e", "abc123");
    expect(results).toEqual([event]);
  });

  it("水和したイベントも索引される", () => {
    // 捕まえる変異: put にだけ索引を足す
    // (リロード直後だけ引けない、という再現しにくい壊れ方になる)
    const store = new EventStore();
    const event = sign("hydrated", { tags: [["e", "abc123"]] });

    store.hydrate([{ event, seenRelays: ["wss://relay/"], fetchedAt: 1 }]);

    const results = store.eventsByTag("e", "abc123");
    expect(results).toEqual([event]);
  });

  it("未知のタグ名で引くと空配列", () => {
    // 捕まえる変異: undefined を返す
    // (呼び出し側が毎回 ?? [] を書くことになる)
    const store = new EventStore();
    const event = sign("test", { tags: [["e", "abc123"]] });
    store.put(event, "wss://relay/");

    const results = store.eventsByTag("unknown", "value");
    expect(results).toEqual([]);
  });
});

describe("remove", () => {
  it("索引から完全に外す", () => {
    // 捕まえる変異: #events からだけ消して #byTag を放置する。
    // eventsByTag は #events に無い id を結果から黙って落とすため、
    // 単に remove 直後に問い合わせるだけでは、放置された #byTag の
    // エントリが残っていても気づけない —— hydrate (id 検証をしない) で
    // 同じ id・別タグのイベントを入れ直し、放置された古いタグ値の下に
    // そのイベントが誤って現れないことまで確かめる。
    const store = new EventStore();
    const event = sign("hi", { kind: 1, tags: [["e", "abc"]] });
    store.put(event, "wss://a.example");

    expect(store.remove(event.id)).toBe(true);
    expect(store.get(event.id)).toBeUndefined();
    expect(store.eventsByTag("e", "abc")).toEqual([]);
    expect(store.size).toBe(0);

    const impostor = { ...event, tags: [["e", "xyz"]] };
    store.hydrate([{ event: impostor, seenRelays: [], fetchedAt: 0 }]);
    expect(store.eventsByTag("e", "abc")).toEqual([]);
  });

  it("知らない id は false を返し、何も壊さない", () => {
    // 捕まえる変異: 存在しない id で例外を投げる
    const store = new EventStore();
    const event = sign("hi", { kind: 1, tags: [] });
    store.put(event, "wss://a.example");

    expect(store.remove("0".repeat(64))).toBe(false);
    expect(store.get(event.id)).toBe(event);
  });

  it("置換可能イベントを消すと、直前の版が再び最新になる", () => {
    // 捕まえる変異: #replaceable のエントリを消すだけで張り直さない。
    // これを見逃すと、フォローリストの巻き戻しで既存のフォローが
    // 丸ごと消えたように見える。
    const store = new EventStore();
    const older = sign("", {
      kind: 3,
      created_at: 1_700_000_000,
      tags: [["p", "aa"]],
    });
    const newer = sign("", {
      kind: 3,
      created_at: 1_700_000_100,
      tags: [
        ["p", "aa"],
        ["p", "bb"],
      ],
    });
    store.put(older, "wss://a.example");
    store.put(newer, "wss://a.example");
    expect(store.latestReplaceable(3, newer.pubkey)).toBe(newer);

    store.remove(newer.id);

    expect(store.latestReplaceable(3, older.pubkey)).toBe(older);
  });

  it("永続層へ削除を転送する", () => {
    // 捕まえる変異: persistence.delete を呼ばない。呼ばないと publish に
    // 失敗したイベントが IndexedDB に残り、次回起動の水和で戻ってくる。
    const deleted: string[][] = [];
    const store = new EventStore({
      persistence: {
        load: async () => ({ events: [], deletedIds: [] }),
        save: () => {},
        saveDeletions: () => {},
        delete: (ids) => deleted.push([...ids]),
        deleteDeletions: () => {},
        dispose: () => {},
      },
    });
    const event = sign("hi", { kind: 1, tags: [] });
    store.put(event, "wss://a.example");

    store.remove(event.id);

    expect(deleted).toEqual([[event.id]]);
  });
});

describe("onReplaceableChanged", () => {
  it("最新版が変わったときだけ通知する", () => {
    // 捕まえる変異: 置換可能イベントを put するたびに通知する。
    // 旧版や同じイベントの再配送まで再計画の契機にすると、リレーからの
    // 重複配送だけで Outbox の再計画が繰り返される。
    const store = new EventStore();
    const changes: { kind: number; pubkey: string }[] = [];
    store.onReplaceableChanged((change) => changes.push(change));
    const newer = sign("new", { kind: 10002, created_at: 200 });
    const older = sign("old", { kind: 10002, created_at: 100 });

    store.put(newer, "wss://one/");
    store.put(newer, "wss://two/");
    store.put(older, "wss://one/");

    expect(changes).toEqual([{ kind: 10002, pubkey }]);
  });

  it("最新版の巻き戻しを通知し、解除後は通知しない", () => {
    // 捕まえる変異: remove では通知しない。Writer の publish 全滅で
    // kind:10002 を巻き戻したとき、通知カラムが失敗した draft の read
    // リレーを見続ける。
    const store = new EventStore();
    const changes: { kind: number; pubkey: string }[] = [];
    const off = store.onReplaceableChanged((change) => changes.push(change));
    const older = sign("old", { kind: 10002, created_at: 100 });
    const newer = sign("new", { kind: 10002, created_at: 200 });
    store.put(older, "wss://one/");
    store.put(newer, "wss://one/");
    changes.length = 0;

    store.remove(newer.id);
    off();
    store.remove(older.id);

    expect(changes).toEqual([{ kind: 10002, pubkey }]);
    expect(store.latestReplaceable(10002, pubkey)).toBeUndefined();
  });

  it("水和で最新版が入った場合も通知する", () => {
    // 捕まえる変異: put 経路だけ通知し hydrate を通知しない。
    const store = new EventStore();
    const changes: { kind: number; pubkey: string }[] = [];
    store.onReplaceableChanged((change) => changes.push(change));
    const event = sign("hydrated", { kind: 10002 });

    store.hydrate([{ event, seenRelays: ["wss://one/"], fetchedAt: 1 }]);

    expect(changes).toEqual([{ kind: 10002, pubkey }]);
  });
});
