import { schnorr } from "@noble/curves/secp256k1.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { createRoot, createSignal } from "solid-js";
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
  kind = 0,
): NostrEvent => {
  const secretKey = keyFor(seed);
  const unsigned = {
    pubkey: bytesToHex(schnorr.getPublicKey(secretKey)),
    created_at: createdAt,
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

const noProfileRequests = (): ProfileRequests => ({
  request: () => undefined,
  subscribe: () => () => undefined,
  lastBatchSize: 0,
  maxBatchSize: 0,
  dispose: () => undefined,
});

describe("parseProfileContent", () => {
  it("name / display_name / picture を取り出す", () => {
    // 捕まえる変異: `display_name` を camelCase で読む (読み替えを外すと
    // 表示名が永久に undefined になる)。
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
    // 捕まえる変異: try/catch を外す (投げるとカラム全体が落ちる)。
    expect(() => parseProfileContent("{壊れている")).not.toThrow();
    expect(parseProfileContent("{壊れている")).toBeUndefined();
  });

  it("オブジェクトでない JSON は undefined", () => {
    // 捕まえる変異: typeof の判定を外す (record 参照で落ちる)。
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
    // 捕まえる変異: typeof の判定を外す (`<img src={{}}>` のような描画に
    // そのまま流れる)。
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
    // 捕まえる変異: `onReplaceableChanged` の購読を外す (楽観挿入後も
    // 古い kind:0 のまま残る)。
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

  it("kind:0 の削除後は表示を空に戻す", async () => {
    // 捕まえる変異: check() が event 不在で setProfile(undefined) しない
    // (楽観挿入を巻き戻しても表示だけが残る)。
    let dispose!: () => void;
    let profile!: ReturnType<typeof useProfileData>;
    const store = new EventStore();
    const event = profileEvent(
      42,
      JSON.stringify({ display_name: "一時的な表示名" }),
      1_700_000_000,
    );
    createRoot((stop) => {
      dispose = stop;
      profile = useProfileData(() => event.pubkey, store, noProfileRequests());
      return undefined;
    });

    await Promise.resolve();
    store.put(event, "wss://relay.example/" as RelayUrl);
    expect(profile()?.displayName).toBe("一時的な表示名");

    store.remove(event.id);
    expect(profile()).toBeUndefined();
    dispose();
  });

  it("pubkey切替とdispose後は対象外のkind:0更新を反映しない", async () => {
    // 捕まえる変異: effect cleanup から購読解除を外す (切替/dispose前の
    // 更新が現在/破棄済みのプロフィールを上書きする)。
    let dispose!: () => void;
    let profile!: ReturnType<typeof useProfileData>;
    const store = new EventStore();
    const first = profileEvent(
      43,
      JSON.stringify({ display_name: "最初の表示名" }),
      1_700_000_000,
    );
    const second = profileEvent(
      44,
      JSON.stringify({ display_name: "次の表示名" }),
      1_700_000_000,
    );
    const [pubkey, setPubkey] = createSignal(first.pubkey);
    createRoot((stop) => {
      dispose = stop;
      profile = useProfileData(pubkey, store, noProfileRequests());
      return undefined;
    });

    await Promise.resolve();
    store.put(first, "wss://relay.example/" as RelayUrl);
    expect(profile()?.displayName).toBe("最初の表示名");

    setPubkey(second.pubkey);
    await Promise.resolve();
    expect(profile()).toBeUndefined();

    const updatedFirst = profileEvent(
      43,
      JSON.stringify({ display_name: "古い表示名の更新" }),
      1_700_000_001,
    );
    store.put(updatedFirst, "wss://relay.example/" as RelayUrl);
    expect(profile()).toBeUndefined();

    store.put(second, "wss://relay.example/" as RelayUrl);
    expect(profile()?.displayName).toBe("次の表示名");

    // 捕まえる変異: kind 判定を外す (同じ pubkey の kind:3 到着でも
    // kind:0 を読み直してしまう)。
    const displayedProfile = profile();
    const contacts = profileEvent(44, "", 1_700_000_001, 3);
    store.put(contacts, "wss://relay.example/" as RelayUrl);
    expect(profile()).toBe(displayedProfile);

    dispose();
    const updatedSecond = profileEvent(
      44,
      JSON.stringify({ display_name: "破棄後の表示名" }),
      1_700_000_001,
    );
    store.put(updatedSecond, "wss://relay.example/" as RelayUrl);
    expect(profile()?.displayName).toBe("次の表示名");
  });
});
