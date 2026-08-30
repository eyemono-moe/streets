import { schnorr } from "@noble/curves/secp256k1.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { createRoot } from "solid-js";
import { describe, expect, it } from "vitest";
import { type NostrEvent, computeEventId } from "../../core/nostr/event";
import { EventStore } from "../../core/read/event-store";
import type { ProfileRequests } from "../../core/read/profile-requests";
import type { RelayUrl } from "../../core/relay/relay-connection";
import { parseProfileContent, useProfileData } from "./profile-data";

const keyFor = (seed: number): Uint8Array =>
  Uint8Array.from(
    Array.from({ length: 32 }, (_, index) => ((seed + index * 7) % 255) + 1),
  );

const profileEvent = (
  seed: number,
  content: string,
  createdAt: number,
): NostrEvent => {
  const secretKey = keyFor(seed);
  const unsigned = {
    pubkey: bytesToHex(schnorr.getPublicKey(secretKey)),
    created_at: createdAt,
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

const noProfileRequests = (): ProfileRequests => ({
  request: () => undefined,
  subscribe: () => () => undefined,
  lastBatchSize: 0,
  maxBatchSize: 0,
  dispose: () => undefined,
});

describe("parseProfileContent", () => {
  it("name / display_name / picture を取り出す", () => {
    // 捕まえる変異: NIP-24 の snake_case (`display_name`) を camelCase で
    // 読む。JSON のキーは snake_case なので、読み替えを外すと表示名が
    // 永久に undefined になる。
    const parsed = parseProfileContent(
      JSON.stringify({
        name: "alice",
        display_name: "Alice",
        picture: "https://example.com/a.png",
      }),
    );

    expect(parsed?.name).toBe("alice");
    expect(parsed?.displayName).toBe("Alice");
    expect(parsed?.picture).toBe("https://example.com/a.png");
  });

  it("JSON として壊れていれば undefined を返し、投げない", () => {
    // 捕まえる変異: try/catch を外す。kind:0 の content はリレー由来の
    // 任意文字列であり、投げるとカラム全体が落ちる。
    expect(() => parseProfileContent("{壊れている")).not.toThrow();
    expect(parseProfileContent("{壊れている")).toBeUndefined();
  });

  it("オブジェクトでない JSON は undefined", () => {
    // 捕まえる変異: typeof の判定を外す。`"文字列"` や `null` は
    // JSON.parse を通るが、その後の record 参照で落ちる。
    expect(parseProfileContent('"just a string"')).toBeUndefined();
    expect(parseProfileContent("null")).toBeUndefined();
  });

  it("about / banner / nip05 / website を取り出す", () => {
    // 捕まえる変異: 4 つのうちどれかを読まない (カードのその行が永久に出ない)
    const parsed = parseProfileContent(
      JSON.stringify({
        about: "自己紹介",
        banner: "https://example.com/banner.png",
        nip05: "alice@example.com",
        website: "https://example.com",
      }),
    );

    expect(parsed?.about).toBe("自己紹介");
    expect(parsed?.banner).toBe("https://example.com/banner.png");
    expect(parsed?.nip05).toBe("alice@example.com");
    expect(parsed?.website).toBe("https://example.com");
  });

  it("文字列でないフィールドは undefined", () => {
    // 捕まえる変異: typeof の判定を外して値をそのまま入れる。kind:0 は
    // リレー由来の任意の JSON であり、数値やオブジェクトが入っていると
    // <img src={{}}> のような描画へそのまま流れる。
    const parsed = parseProfileContent(
      JSON.stringify({
        about: 42,
        banner: { url: "x" },
        nip05: null,
        website: ["https://example.com"],
      }),
    );

    expect(parsed?.about).toBeUndefined();
    expect(parsed?.banner).toBeUndefined();
    expect(parsed?.nip05).toBeUndefined();
    expect(parsed?.website).toBeUndefined();
  });
});

describe("useProfileData", () => {
  it("マウント後の同一著者 kind:0 置換を表示へ反映する", async () => {
    // 捕まえる変異: EventStore.onReplaceableChanged の購読を外す。Writer の
    // 楽観挿入後、マウント済みプロフィールが古い kind:0 のまま残る。
    let dispose!: () => void;
    let profile!: ReturnType<typeof useProfileData>;
    let store!: EventStore;
    let oldProfile!: NostrEvent;
    createRoot((stop) => {
      dispose = stop;
      store = new EventStore();
      oldProfile = profileEvent(
        41,
        JSON.stringify({
          display_name: "以前の表示名",
          about: "以前の自己紹介",
        }),
        1_700_000_000,
      );
      store.put(oldProfile, "wss://relay.example/" as RelayUrl);
      profile = useProfileData(
        () => oldProfile.pubkey,
        store,
        noProfileRequests(),
      );
      return undefined;
    });

    await Promise.resolve();

    expect(profile()?.displayName).toBe("以前の表示名");

    const newProfile = profileEvent(
      41,
      JSON.stringify({ display_name: "新しい表示名", about: "新しい自己紹介" }),
      1_700_000_001,
    );
    store.put(newProfile, "wss://relay.example/" as RelayUrl);

    expect(profile()?.displayName).toBe("新しい表示名");
    expect(profile()?.about).toBe("新しい自己紹介");
    dispose();
  });
});
