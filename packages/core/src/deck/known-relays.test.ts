import { describe, expect, it } from "vite-plus/test";
import type { NostrSource } from "../read/source";
import type { RelayUrl } from "../relay/relay-connection";
import type { ColumnDef } from "./deck";
import { addKnownRelays, withKnownRelays } from "./known-relays";

const column = (knownRelays?: string[]): ColumnDef => ({
  id: "thread:x",
  title: "スレッド",
  source: { kind: "thread", focus: "a".repeat(64) },
  ...(knownRelays ? { knownRelays } : {}),
});

const source: NostrSource = { type: "nostr", filters: [{ ids: ["x"] }] };

describe("withKnownRelays", () => {
  it("形をそろえ、重ねず、リレーでない印は落とす", () => {
    expect(
      withKnownRelays(column(["wss://a.example/"]), [
        "wss://a.example",
        "wss://b.example",
        "local",
      ]).knownRelays,
    ).toEqual(["wss://a.example/", "wss://b.example/"]);
  });

  it("覚えるものが無ければ、欄を足さない", () => {
    // 捕まえる変異: 空の配列を保存する（デッキの保存が無駄に膨らむ）
    expect(withKnownRelays(column(), [])).not.toHaveProperty("knownRelays");
  });
});

describe("addKnownRelays", () => {
  it("覚えているリレーを、行き先に足す", () => {
    expect(
      addKnownRelays(
        { ...source, extraRelays: ["wss://hint.example/" as RelayUrl] },
        column(["wss://search.example/"]),
      ),
    ).toEqual({
      ...source,
      extraRelays: ["wss://hint.example/", "wss://search.example/"],
    });
  });

  it("行き先を決めている取得には足さない", () => {
    const explicit: NostrSource = {
      ...source,
      relays: ["wss://only.example/" as RelayUrl],
    };
    // 捕まえる変異: 「そこだけ」を読む取得に、ほかのリレーを混ぜる
    expect(addKnownRelays(explicit, column(["wss://search.example/"]))).toBe(
      explicit,
    );
  });

  it("まだ張らない取得は、張らないまま", () => {
    // 捕まえる変異: `undefined` を空の取得に変えて、張ってしまう
    expect(
      addKnownRelays(undefined, column(["wss://search.example/"])),
    ).toBeUndefined();
  });
});
