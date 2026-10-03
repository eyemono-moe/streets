import type { NostrEvent } from "@streets/core/nostr/event";
import { FakeRelayConnection } from "@streets/core/relay/fake-relay-connection";
import { createFakeSigner } from "@streets/core/signer/fake-signer";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { fetchEntity, queryNewest } from "./entity-fetch";

const signer = createFakeSigner(new Uint8Array(32).fill(7));
const sign = (kind: number, content: string, createdAt = 100) =>
  signer.signEvent({
    kind,
    pubkey: "",
    content,
    tags: [],
    created_at: createdAt,
  });

/** 開いたリレーを覚えておき、テストから中身を流す。 */
const relays = () => {
  const opened = new Map<string, FakeRelayConnection>();
  return {
    opened,
    connect: (url: string) => {
      const connection = new FakeRelayConnection(url);
      opened.set(url, connection);
      return connection;
    },
  };
};

afterEach(() => {
  vi.useRealTimers();
});

describe("queryNewest", () => {
  it("全部のリレーが返し終えたら、いちばん新しいものを返す", async () => {
    const older = await sign(0, "{}", 100);
    const newer = await sign(0, "{}", 200);
    const { opened, connect } = relays();
    const result = queryNewest(
      connect,
      ["wss://a.example/", "wss://b.example/"],
      { kinds: [0], authors: [older.pubkey] },
      1_000,
    );
    const [a, b] = [...opened.values()];
    a?.emitEvent(0, newer);
    a?.emitEose(0);
    b?.emitEvent(0, older);
    b?.emitEose(0);
    expect(await result).toEqual(newer);
  });

  it("署名の合わないものと、条件に合わないものは捨てる", async () => {
    const real = await sign(1, "本物");
    const forged: NostrEvent = { ...real, content: "書き換えた本文" };
    const other = await sign(1, "別の投稿");
    const { opened, connect } = relays();
    const result = queryNewest(
      connect,
      ["wss://a.example/"],
      { ids: [real.id] },
      1_000,
    );
    const relay = [...opened.values()][0];
    // 捕まえる変異: 署名を確かめない（ほかの人の名前で作った本文がカードに出る）
    relay?.emitEvent(0, forged);
    relay?.emitEvent(0, other);
    relay?.emitEose(0);
    expect(await result).toBeUndefined();
  });

  it("id で指したものは、届いたらほかのリレーを待たない", async () => {
    const note = await sign(1, "本文");
    const { opened, connect } = relays();
    const result = queryNewest(
      connect,
      ["wss://a.example/", "wss://b.example/"],
      { ids: [note.id] },
      60_000,
    );
    [...opened.values()][0]?.emitEvent(0, note);
    expect(await result).toEqual(note);
    // 捕まえる変異: 返した後も接続を開いたままにする
    expect([...opened.values()].every((relay) => relay.closed)).toBe(true);
  });

  it("返事の無いリレーは時間で切り上げる", async () => {
    vi.useFakeTimers();
    const { connect } = relays();
    const result = queryNewest(
      connect,
      ["wss://a.example/"],
      { ids: ["x"] },
      500,
    );
    await vi.advanceTimersByTimeAsync(500);
    expect(await result).toBeUndefined();
  });
});

describe("fetchEntity", () => {
  it("投稿を引いてから、書き手のプロフィールを引く", async () => {
    const note = await sign(1, "本文");
    const profile = await sign(0, JSON.stringify({ name: "alice" }));
    const { opened, connect } = relays();
    const result = fetchEntity({ kind: "note", id: note.id }, connect, 1_000);
    [...opened.values()][0]?.emitEvent(0, note);
    await vi.waitFor(() => {
      expect(
        [...opened.values()].some(
          (relay) => relay.subscriptions[0]?.filters[0]?.kinds?.[0] === 0,
        ),
      ).toBe(true);
    });
    for (const relay of opened.values()) {
      if (relay.subscriptions[0]?.filters[0]?.kinds?.[0] !== 0) continue;
      relay.emitEvent(0, profile);
      relay.emitEose(0);
    }
    expect(await result).toEqual({ event: note, profile });
  });

  it("一度に開くリレーは 6 本を超えない", async () => {
    const { opened, connect } = relays();
    const relaysHint = Array.from(
      { length: 8 },
      (_, index) => `wss://hint${index}.example/`,
    );
    void fetchEntity(
      {
        kind: "naddr",
        identifier: "a",
        pubkey: "b".repeat(64),
        eventKind: 30_023,
        relays: relaysHint,
      },
      connect,
      1_000,
    );
    // Workers は同時に開ける外への接続が 6 本まで
    expect(opened.size).toBeLessThanOrEqual(6);
  });
});
