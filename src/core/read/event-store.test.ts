import { schnorr } from "@noble/curves/secp256k1.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { describe, expect, it } from "vitest";
import { type NostrEvent, computeEventId } from "../nostr/event";
import type { EventPersistence, PersistedEvent } from "./event-persistence";
import { EventStore } from "./event-store";
import { createFakeClock } from "./fake-clock";

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

const otherSecretKey = Uint8Array.from({ length: 32 }, (_, i) => 32 - i);

const signAs = (
  key: Uint8Array,
  content: string,
  overrides: {
    kind?: number;
    created_at?: number;
    tags?: string[][];
  } = {},
): NostrEvent => {
  const unsigned = {
    pubkey: bytesToHex(schnorr.getPublicKey(key)),
    created_at: overrides.created_at ?? 1_700_000_000,
    kind: overrides.kind ?? 1,
    tags: overrides.tags ?? [],
    content,
  };
  const id = computeEventId(unsigned);
  return {
    ...unsigned,
    id,
    sig: bytesToHex(schnorr.sign(hexToBytes(id), key)),
  };
};

const validEvent = sign();

describe("EventStore", () => {
  it("insert と remove を購読者へ通知し、duplicate は通知しない", () => {
    const store = new EventStore();
    const changes: string[] = [];
    const unsubscribe = store.subscribe((change) => {
      changes.push(`${change.type}:${change.event.content}`);
    });
    const event = sign("observable");

    store.put(event, "wss://one/");
    store.put(event, "wss://two/");
    store.remove(event.id);
    unsubscribe();
    store.put(sign("after unsubscribe"), "wss://one/");

    // 捕まえる変異: remove の通知を落とす (Writer の全滅巻き戻し後も強調表示が残り続ける)。
    expect(changes).toEqual(["insert:observable", "remove:observable"]);
  });

  it("検証にかかった時間と件数を積む", () => {
    // 捕まえる変異: verifyCount を verified 時だけ増やす。拒否イベントも
    // schnorr のコストは払うため、数えないと検証時間が過小に出る。
    const store = new EventStore();
    const event = sign("verified");
    const forged = { ...sign("forged"), sig: "0".repeat(128) };

    expect(store.verifyCount).toBe(0);
    expect(store.put(event, "wss://relay/")).toBe("inserted");
    expect(store.put(forged, "wss://relay/")).toBe("rejected");
    expect(store.verifyCount).toBe(2);

    // 捕まえる変異: 重複経路でも計上する (未検証なのに検証時間が水増しされる)。
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
    // 捕まえる変異: fetchedAt を event.created_at にする。created_at は著者が
    // 書いた時刻なので、2 年前の kind:0 を今取得しても常に stale と判定される。
    const clock = createFakeClock();
    clock.advance(5_000);
    const store = new EventStore({ scheduler: clock });
    const event = sign("x");
    store.put(event, "wss://relay/");
    expect(store.fetchedAt(event.id)).toBe(5_000);
  });

  it("invalidate は取得時刻を 0 にする", () => {
    // 捕まえる変異: invalidate を no-op にする。0 に進める前に put すると
    // 偶然 0 のままで気づけないため、先に時計を進め非ゼロにしてから確かめる。
    const clock = createFakeClock();
    clock.advance(5_000);
    const store = new EventStore({ scheduler: clock });
    const profile = sign("p", { kind: 0 });
    store.put(profile, "wss://relay/");
    expect(store.replaceableFetchedAt(0, profile.pubkey)).toBe(5_000);

    store.invalidate(0, profile.pubkey);

    // 捕まえる変異: invalidate がイベントごと消す (serveWhileRevalidating で古い値を出せなくなる)。
    expect(store.replaceableFetchedAt(0, profile.pubkey)).toBe(0);
    // イベント自体は残る
    expect(store.latestReplaceable(0, profile.pubkey)).toBeDefined();
  });

  it("put は同一イベントの再配送でも取得時刻を更新する", () => {
    // 捕まえる変異: 重複経路で fetchedAt を更新しない。著者が変えていない
    // kind:10002 でも staleMs ごとに再取得されるが、fetchedAt が初回のまま固定され二度と新鮮に戻らない。
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
    // 捕まえる変異: id 再計算のガード外で restamp する。既知の id を騙るだけの
    // 偽装ペイロードが、内容未検証のまま鮮度だけ更新できてしまう。
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

describe("EventStore の NIP-09 可視性", () => {
  it("同じ著者のe対象を隠し、削除依頼の巻き戻しで戻す", () => {
    const store = new EventStore();
    const changes: string[] = [];
    const target = sign("target");
    const deletion = sign("delete", {
      kind: 5,
      tags: [["e", target.id]],
    });
    store.subscribe((change) => changes.push(change.type));

    expect(store.put(target, "wss://one/")).toBe("inserted");
    expect(store.put(deletion, "wss://one/")).toBe("inserted");

    // 捕まえる変異: kind:5を保存するだけで、既にある対象をhideしない。
    expect(store.get(target.id)).toBeUndefined();
    expect(store.isHidden(target.id)).toBe(true);
    expect(changes).toEqual(["insert", "insert", "hide"]);

    store.remove(deletion.id);

    // 捕まえる変異: 削除依頼を巻き戻しても対象をshowしない。
    expect(store.get(target.id)).toEqual(target);
    expect(store.isHidden(target.id)).toBe(false);
    expect(changes).toEqual(["insert", "insert", "hide", "remove", "show"]);
  });

  it("対象より先に届いた削除依頼を著者込みで照合する", () => {
    const store = new EventStore();
    const target = sign("late target");
    const validDeletion = sign("valid", {
      kind: 5,
      tags: [["e", target.id]],
    });
    const forgedDeletion = signAs(otherSecretKey, "forged", {
      kind: 5,
      tags: [["e", target.id]],
    });

    store.put(forgedDeletion, "wss://one/");
    store.put(validDeletion, "wss://one/");

    // 捕まえる変異: 後着対象を通常のinsertとして公開索引へ入れる。
    expect(store.put(target, "wss://one/")).toBe("hidden");
    expect(store.get(target.id)).toBeUndefined();
  });

  it("別著者の削除依頼だけなら対象を隠さない", () => {
    const store = new EventStore();
    const target = sign("not yours");
    const forgedDeletion = signAs(otherSecretKey, "forged", {
      kind: 5,
      tags: [["e", target.id]],
    });

    store.put(forgedDeletion, "wss://one/");

    // 捕まえる変異: 削除依頼者と対象著者を比較せずtarget idだけで隠す。
    expect(store.put(target, "wss://one/")).toBe("inserted");
    expect(store.get(target.id)).toEqual(target);
  });

  it("同じ対象の削除依頼が残る間は一件を巻き戻しても表示しない", () => {
    const store = new EventStore();
    const target = sign("twice");
    const first = sign("first", {
      kind: 5,
      created_at: 1_700_000_001,
      tags: [["e", target.id]],
    });
    const second = sign("second", {
      kind: 5,
      created_at: 1_700_000_002,
      tags: [["e", target.id]],
    });
    store.put(target, "wss://one/");
    store.put(first, "wss://one/");
    store.put(second, "wss://one/");

    store.remove(first.id);

    // 捕まえる変異: target idだけのSetで由来を失い、一件のremoveで解除する。
    expect(store.get(target.id)).toBeUndefined();
    store.remove(second.id);
    expect(store.get(target.id)).toEqual(target);
  });

  it("削除依頼を指す削除依頼には効果が無い", () => {
    const store = new EventStore();
    const first = sign("first deletion", { kind: 5 });
    const second = sign("delete deletion", {
      kind: 5,
      tags: [["e", first.id]],
    });
    store.put(first, "wss://one/");

    store.put(second, "wss://one/");

    // 捕まえる変異: kind:5も通常対象と同じくhideする。
    expect(store.get(first.id)).toEqual(first);
  });

  it("a対象は削除依頼時刻以前の版だけを隠す", () => {
    const store = new EventStore();
    const identifier = "article:with:colon";
    const older = sign("older", {
      kind: 30_023,
      created_at: 100,
      tags: [["d", identifier]],
    });
    const newer = sign("newer", {
      kind: 30_023,
      created_at: 102,
      tags: [["d", identifier]],
    });
    const deletion = sign("delete old versions", {
      kind: 5,
      created_at: 101,
      tags: [["a", `30023:${pubkey}:${identifier}`]],
    });
    store.put(older, "wss://one/");
    store.put(newer, "wss://one/");

    store.put(deletion, "wss://one/");

    // 捕まえる変異: a対象のcreated_at上限を見ず、新しい再公開版も隠す。
    expect(store.get(older.id)).toBeUndefined();
    expect(store.get(newer.id)).toEqual(newer);
    expect(store.latestReplaceable(30_023, pubkey, identifier)).toEqual(newer);
  });

  it("a座標のkindは正規の10進整数表記だけを受け付ける", () => {
    // 捕まえる変異: kind 文字列を Number() だけで解析する (hex/指数/先頭ゼロ表記が化け、無関係な削除依頼で隠れる)。
    for (const [index, rawKind] of [
      "0x7547",
      "3.0023e4",
      "30023 ",
      "030023",
    ].entries()) {
      const store = new EventStore();
      const identifier = `strict-kind-${index}`;
      const target = sign(`target-${index}`, {
        kind: 30_023,
        created_at: 100,
        tags: [["d", identifier]],
      });
      const deletion = sign(`deletion-${index}`, {
        kind: 5,
        created_at: 101,
        tags: [["a", `${rawKind}:${pubkey}:${identifier}`]],
      });
      store.put(target, "wss://one/");

      store.put(deletion, "wss://one/");

      expect(store.get(target.id), rawKind).toEqual(target);
    }
  });
});

describe("EventStore.hydrate", () => {
  it("署名を検証せずに入れる", () => {
    // 捕まえる変異: hydrate 内で verifyEvent を呼ぶ (実測 0.498ms/件、9000件超で4.7秒かかり初回描画を埋める)。
    const store = new EventStore();
    const forged = { ...sign("x"), sig: "0".repeat(128) };

    store.hydrate([
      { event: forged, seenRelays: ["wss://relay/"], fetchedAt: 1 },
    ]);

    expect(store.get(forged.id)).toEqual(forged);
  });

  it("verifyCount を増やさない", () => {
    // 捕まえる変異: hydrate 内で verifyEvent を呼ぶ (verifyMs/verifyCount が水和で不当に膨らまないことの確認)。
    const store = new EventStore();
    store.hydrate([{ event: validEvent, seenRelays: [], fetchedAt: 1 }]);

    expect(store.verifyCount).toBe(0);
  });

  it("fetchedAt は引数の値になる (現在時刻ではない)", () => {
    // 捕まえる変異: hydrate 内で fetchedAt に scheduler.now() を入れる (staleMs が
    // 永久に発火しなくなる)。時計を大きく進めてから水和し「今」と混同できないようにする。
    const clock = createFakeClock();
    clock.advance(999_000);
    const store = new EventStore({ scheduler: clock });

    store.hydrate([{ event: validEvent, seenRelays: [], fetchedAt: 42 }]);

    expect(store.fetchedAt(validEvent.id)).toBe(42);
  });

  it("既にある id を上書きしない", () => {
    // 捕まえる変異: 既存チェックを省き無条件上書き (後から走る水和が新しい版を古い永続データで巻き戻す)。
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

  it("永続化した削除依頼に含まれる id は非表示で水和する", () => {
    // 捕まえる変異: 除外チェックを省く (消したはずの投稿が次回起動時に復活する)。
    const store = new EventStore();

    const deletion = sign("delete cached", {
      kind: 5,
      tags: [["e", validEvent.id]],
    });

    store.hydrate([{ event: validEvent, seenRelays: [], fetchedAt: 1 }], {
      deletionRequests: [deletion],
    });

    expect(store.get(validEvent.id)).toBeUndefined();
    expect(store.isHidden(validEvent.id)).toBe(true);
  });

  it("isNostrEvent を通らない形のものは入れない", () => {
    // 捕まえる変異: 形の検査を省く (永続層データがスキーマ変更等で壊れていてもそのまま入る)。
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

  it("addressable event の最新版を d ごとに分ける", () => {
    const store = new EventStore();
    const deckOld = sign("deck-old", {
      kind: 30078,
      created_at: 1_000,
      tags: [["d", "streets/deck"]],
    });
    const deckNew = sign("deck-new", {
      kind: 30078,
      created_at: 2_000,
      tags: [["d", "streets/deck"]],
    });
    const settings = sign("settings", {
      kind: 30078,
      created_at: 3_000,
      tags: [["d", "streets/settings"]],
    });

    store.put(deckNew, "wss://relay/");
    store.put(deckOld, "wss://relay/");
    store.put(settings, "wss://relay/");

    // 捕まえる変異: addressable key から identifier を落とす (同じ kind/pubkey の settings が deck を上書きする)。
    expect(
      store.latestReplaceable(30078, deckNew.pubkey, "streets/deck")?.id,
    ).toBe(deckNew.id);
    expect(
      store.latestReplaceable(30078, settings.pubkey, "streets/settings")?.id,
    ).toBe(settings.id);
  });

  it("addressable event の最新版を remove すると同じ d の直前版へ戻す", () => {
    const store = new EventStore();
    const older = sign("address-old", {
      kind: 30078,
      created_at: 1_000,
      tags: [["d", "streets/deck"]],
    });
    const newer = sign("address-new", {
      kind: 30078,
      created_at: 2_000,
      tags: [["d", "streets/deck"]],
    });
    store.put(older, "wss://relay/");
    store.put(newer, "wss://relay/");

    store.remove(newer.id);

    // 捕まえる変異: remove 後の再索引を通常の replaceable だけにする。
    expect(
      store.latestReplaceable(30078, older.pubkey, "streets/deck")?.id,
    ).toBe(older.id);
  });

  it("addressable event の変更通知へ identifier を含める", () => {
    const store = new EventStore();
    const changes: { kind: number; pubkey: string; identifier?: string }[] = [];
    store.onReplaceableChanged((change) => changes.push(change));
    const event = sign("address-notify", {
      kind: 30078,
      tags: [["d", "streets/deck"]],
    });

    store.put(event, "wss://relay/");

    // 捕まえる変異: 通知だけ identifier を落とす (別 document の更新を自分の remote 変更と誤認する)。
    expect(changes).toEqual([
      {
        kind: 30078,
        pubkey: event.pubkey,
        identifier: "streets/deck",
      },
    ]);
  });

  it("kind と identifier の不正な組み合わせを黙って未取得にしない", () => {
    const store = new EventStore();

    // 捕まえる変異: identifier 無しを空文字へ倒す (指定忘れが新規版で上書きされてしまう)。
    expect(() => store.latestReplaceable(30078, pubkey)).toThrow(/identifier/);
    expect(() => store.latestReplaceable(10002, pubkey, "d")).toThrow(
      /identifier/,
    );
    expect(() => store.latestReplaceable(1, pubkey)).toThrow(/置換可能/);
  });
});

describe("EventStore と EventPersistence の配線", () => {
  const createRecordingPersistence = (): EventPersistence & {
    saved: PersistedEvent[];
    deletionRequests: NostrEvent[];
  } => {
    const saved: PersistedEvent[] = [];
    const deletionRequests: NostrEvent[] = [];
    return {
      saved,
      deletionRequests,
      async load() {
        return { events: [], deletionRequests: [] };
      },
      save(entries) {
        saved.push(...entries);
      },
      saveDeletionRequest(event) {
        deletionRequests.push(event);
      },
      delete() {},
      deleteDeletionRequest(id) {
        const index = deletionRequests.findIndex((event) => event.id === id);
        if (index !== -1) deletionRequests.splice(index, 1);
      },
      dispose() {},
    };
  };

  it("新規挿入のたびに persistence.save() へ転送する", () => {
    // 捕まえる変異: #persist の呼び出しを省く。「kind:10002 を保存すれば永続化
    // も自動」という前提が崩れ、リレーリストが書かれず次回起動が常にキャッシュ無しになる。
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
    // 捕まえる変異: 新規挿入時だけ転送し restamp では転送しない。永続層の
    // fetchedAt が初回のまま固定され、その著者だけ次回起動のたびに stale 誤判定されてしまう。
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
    // 捕まえる変異: verifyEvent の結果を見ずに転送する。hydrate は署名を検証
    // しないため、署名検証落ちのペイロードが永続化されると次回起動で偽装イベントが画面に出る。
    const persistence = createRecordingPersistence();
    const store = new EventStore({ persistence });
    const tampered = { ...sign("x"), content: "tampered" };

    expect(store.put(tampered, "wss://a/")).toBe("rejected");

    expect(persistence.saved).toEqual([]);
  });

  it("kind:5 自身を削除依頼として永続層へ渡す", () => {
    // 捕まえる変異: kind:5 を他と同じ扱いにして専用保存を呼ばない (削除依頼が残らず次回起動で対象が復活する)。
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

    expect(persistence.deletionRequests).toEqual([deletion]);
  });

  it("kind:5 を remove() で巻き戻すと専用保存した依頼も取り消す", () => {
    // 捕まえる変異: remove() が deleteDeletionRequest を呼ばない (publish 全滅の依頼が残り対象を隠し続ける)。
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
    expect(persistence.deletionRequests).toEqual([deletion]);

    store.remove(deletion.id);

    expect(persistence.deletionRequests).toEqual([]);
  });

  it("persistence を渡さない store は put() で例外を投げない", () => {
    // 捕まえる変異: #persistence?.save(...) を無条件呼び出しにする。persistence
    // 無しで EventStore を作る大半のテストで例外が飛び put() が使えなくなる。
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
    // 捕まえる変異: 全タグを索引する (imeta のような長いタグまで索引しメモリが無駄になる)。
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
    // 捕まえる変異: id で潰さない (複数リレーから届くと倍になる) / 値を Set にしない。
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
    // 捕まえる変異: put にだけ索引を足す (リロード直後だけ引けない再現しにくい壊れ方になる)。
    const store = new EventStore();
    const event = sign("hydrated", { tags: [["e", "abc123"]] });

    store.hydrate([{ event, seenRelays: ["wss://relay/"], fetchedAt: 1 }]);

    const results = store.eventsByTag("e", "abc123");
    expect(results).toEqual([event]);
  });

  it("未知のタグ名で引くと空配列", () => {
    // 捕まえる変異: undefined を返す (呼び出し側が毎回 ?? [] を書くことになる)。
    const store = new EventStore();
    const event = sign("test", { tags: [["e", "abc123"]] });
    store.put(event, "wss://relay/");

    const results = store.eventsByTag("unknown", "value");
    expect(results).toEqual([]);
  });
});

describe("remove", () => {
  it("索引から完全に外す", () => {
    // 捕まえる変異: #events からだけ消して #byTag を放置する。eventsByTag は
    // #events に無い id を黙って落とすため、remove 直後の問い合わせだけでは
    // 気づけない —— hydrate で同じ id・別タグを入れ直し、古いタグ下に
    // 誤って現れないことまで確かめる。
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
    // 捕まえる変異: #replaceable のエントリを消すだけで張り直さない (フォローリストの巻き戻しで既存フォローが消えて見える)。
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
    // 捕まえる変異: persistence.delete を呼ばない (publish 失敗イベントが IndexedDB に残り次回起動で戻ってくる)。
    const deleted: string[][] = [];
    const store = new EventStore({
      persistence: {
        load: async () => ({ events: [], deletionRequests: [] }),
        save: () => {},
        saveDeletionRequest: () => {},
        delete: (ids) => deleted.push([...ids]),
        deleteDeletionRequest: () => {},
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
    // 捕まえる変異: 置換可能イベントを put するたびに通知する (旧版や重複配送でも Outbox の再計画が繰り返される)。
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
    // 捕まえる変異: remove では通知しない (publish 全滅の巻き戻し後もカラムが失敗した draft の read リレーを見続ける)。
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
