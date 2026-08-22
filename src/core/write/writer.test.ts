import { schnorr } from "@noble/curves/secp256k1.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { describe, expect, it } from "vitest";
import { computeEventId } from "../nostr/event";
import type { NostrEvent } from "../nostr/event";
import { EventStore } from "../read/event-store";
import type { RelayUrl } from "../relay/relay-connection";
import { createFakeSigner } from "../signer/fake-signer";
import type { Signer } from "../signer/signer";
import { RefetchFailedError } from "./fetch-latest";
import type { PublishResult } from "./publisher";
import { WriteFailedError, createWriter } from "./writer";

const SK = Uint8Array.from(Array.from({ length: 32 }, (_, i) => i + 1));
const PUBKEY = bytesToHex(schnorr.getPublicKey(SK));

/**
 * `replace` のテスト用に「現在の版」を作る署名ヘルパー。
 * `fetch-latest.test.ts` と同じ形 —— seed から鍵を作って署名まで済ませる。
 */
const sign = (
  seed: number,
  fields: Omit<NostrEvent, "id" | "pubkey" | "sig">,
): NostrEvent => {
  const sk = Uint8Array.from(
    Array.from({ length: 32 }, (_, i) => ((seed + i * 7) % 255) + 1),
  );
  const unsigned = { ...fields, pubkey: bytesToHex(schnorr.getPublicKey(sk)) };
  const id = computeEventId(unsigned);
  return { ...unsigned, id, sig: bytesToHex(schnorr.sign(hexToBytes(id), sk)) };
};

/**
 * 呼び出し順を観察するための最小限の道具立て。`store`/`signer` を直に
 * 包んで呼び出しを記録し、`publisher` は結果を差し替えられるスタブに
 * する。順序テストが見たいのは「誰が呼ばれたか」ではなく「何番目に
 * 呼ばれたか」なので、記録先の配列は 1 本に共有する。
 */
const setup = (publishResult: PublishResult) => {
  const calls: string[] = [];
  const store = new EventStore();
  const originalPut = store.put.bind(store);
  store.put = (...args: Parameters<EventStore["put"]>) => {
    calls.push("put");
    return originalPut(...args);
  };
  const originalRemove = store.remove.bind(store);
  store.remove = (...args: Parameters<EventStore["remove"]>) => {
    calls.push("remove");
    return originalRemove(...args);
  };

  const fakeSigner = createFakeSigner(SK);
  const signer: Signer = {
    getPublicKey: fakeSigner.getPublicKey,
    signEvent: async (template) => {
      calls.push("sign");
      return fakeSigner.signEvent(template);
    },
  };

  const publisher = {
    publish: async (): Promise<PublishResult> => {
      calls.push("publish");
      return publishResult;
    },
  };

  const writer = createWriter({
    signer,
    store,
    publisher,
    pubkey: () => PUBKEY,
    now: () => 1_700_000_000,
    fetchLatest: async () => undefined,
  });

  return { writer, store, calls };
};

const ok: PublishResult = {
  accepted: ["wss://a.example" as RelayUrl],
  rejected: [],
};
const allFailed: PublishResult = {
  accepted: [],
  rejected: [{ relay: "wss://a.example" as RelayUrl, reason: "refused" }],
};

describe("publish", () => {
  it("署名 → 楽観挿入 → publish の順に進む", async () => {
    // 捕まえる変異: put を publish の後に動かす。そうすると楽観挿入が
    // リレーの応答を待つことになり、ADR-0011 の 100ms 予算が崩れる。
    const { writer, calls } = setup(ok);
    await writer.publish({ kind: 1, tags: [], content: "hi" });
    expect(calls).toEqual(["sign", "put", "publish"]);
  });

  it("pubkey と created_at を押す", async () => {
    // 捕まえる変異: created_at を押さず undefined のまま署名へ渡す
    const { writer } = setup(ok);
    const result = await writer.publish({ kind: 1, tags: [], content: "hi" });
    expect(result.event.pubkey).toBe(PUBKEY);
    expect(result.event.created_at).toBe(1_700_000_000);
  });

  it("署名が拒否されたら挿入も publish もしない", async () => {
    // 捕まえる変異: signEvent を try の外へ出す (= 例外の後も put が走る)
    const { store, calls } = setup(ok);
    const rejectingSigner: Signer = {
      getPublicKey: async () => PUBKEY,
      signEvent: async () => {
        throw new Error("user rejected");
      },
    };
    const writer = createWriter({
      signer: rejectingSigner,
      store,
      publisher: {
        publish: async () => {
          calls.push("publish");
          return ok;
        },
      },
      pubkey: () => PUBKEY,
      now: () => 1_700_000_000,
      fetchLatest: async () => undefined,
    });

    await expect(
      writer.publish({ kind: 1, tags: [], content: "hi" }),
    ).rejects.toThrow("user rejected");
    expect(store.size).toBe(0);
    expect(calls).not.toContain("publish");
  });

  it("accepted が空なら巻き戻して WriteFailedError を投げる", async () => {
    // 捕まえる変異: 巻き戻さずに WriteResult を返す
    const { writer, store, calls } = setup(allFailed);
    await expect(
      writer.publish({ kind: 1, tags: [], content: "hi" }),
    ).rejects.toBeInstanceOf(WriteFailedError);
    expect(store.size).toBe(0);
    expect(calls).toEqual(["sign", "put", "publish", "remove"]);
  });

  it("1 本でも accepted なら残す", async () => {
    // 捕まえる変異: rejected が 1 件でもあれば巻き戻す
    const partial: PublishResult = {
      accepted: ["wss://a.example" as RelayUrl],
      rejected: [{ relay: "wss://b.example" as RelayUrl, reason: "refused" }],
    };
    const { writer, store } = setup(partial);
    const result = await writer.publish({ kind: 1, tags: [], content: "hi" });
    expect(store.get(result.event.id)).toBeDefined();
    expect(result.rejected).toHaveLength(1);
  });

  it("onOptimisticInsert は put の直後・publish の前に同期的に呼ばれる", async () => {
    // 捕まえる変異: await の後に呼ぶ。ADR-0011 の optimisticInsertMs は
    // signEvent を含めないことが本質なので、publish の後に呼ぶと
    // 計測しているものが変わってしまう。
    const { writer, calls } = setup(ok);
    await writer.publish(
      { kind: 1, tags: [], content: "hi" },
      { onOptimisticInsert: () => calls.push("hook") },
    );
    expect(calls).toEqual(["sign", "put", "hook", "publish"]);
  });

  it("store.put が rejected を返す署名は挿入扱いにせず例外を投げる", async () => {
    // 捕まえる変異: store.put() の戻り値を無視してそのまま onOptimisticInsert/
    // publish へ進む (verify-optimistic-insert.ts を経由しない、final review
    // Important 5 が指摘した元のバグ)。`signEvent` が返す `NostrEvent` は
    // 拡張機能の応答を無検証キャストしただけの値 (`nip07-signer.ts` 参照) ——
    // ここでは sig を壊した signer でそれを模す。
    const store = new EventStore();
    const calls: string[] = [];
    const brokenSigner: Signer = {
      getPublicKey: async () => PUBKEY,
      signEvent: async (template) => {
        calls.push("sign");
        const signed = await createFakeSigner(SK).signEvent(template);
        return { ...signed, sig: "0".repeat(128) };
      },
    };
    const writer = createWriter({
      signer: brokenSigner,
      store,
      publisher: {
        publish: async () => {
          calls.push("publish");
          return ok;
        },
      },
      pubkey: () => PUBKEY,
      now: () => 1_700_000_000,
      fetchLatest: async () => undefined,
    });

    await expect(
      writer.publish({ kind: 1, tags: [], content: "hi" }),
    ).rejects.toThrow();
    expect(store.size).toBe(0);
    expect(calls).toEqual(["sign"]);
  });
});

describe("replace", () => {
  const setupReplace = (
    current: NostrEvent | undefined,
    options?: { refetchThrows?: Error },
  ) => {
    const calls: string[] = [];
    const store = new EventStore();
    const signer = createFakeSigner(SK);
    const originalSign = signer.signEvent;
    signer.signEvent = async (t) => {
      calls.push("sign");
      return originalSign(t);
    };
    const writer = createWriter({
      signer,
      store,
      publisher: {
        publish: async () => {
          calls.push("publish");
          return ok;
        },
      },
      pubkey: () => PUBKEY,
      now: () => 1_700_000_000,
      fetchLatest: async () => {
        calls.push("fetch");
        if (options?.refetchThrows) throw options.refetchThrows;
        return current;
      },
    });
    return { writer, store, calls };
  };

  it("再取得 → mutate → 署名 の順に進む", async () => {
    // 捕まえる変異: store の値で mutate する (再取得を待たない)。
    // 古いコピーに差分を当てると他端末の変更を消す。
    const { writer, calls } = setupReplace(undefined);
    await writer.replace(3, undefined, () => ({
      kind: 3,
      tags: [],
      content: "",
    }));
    expect(calls).toEqual(["fetch", "sign", "publish"]);
  });

  it("mutate は再取得した版を受け取る", async () => {
    // 捕まえる変異: mutate に undefined を渡す
    const current = sign(1, {
      kind: 3,
      created_at: 1_600_000_000,
      tags: [["p", "aa"]],
      content: "",
    });
    const { writer } = setupReplace(current);
    const seen: (NostrEvent | undefined)[] = [];
    await writer.replace(3, undefined, (c) => {
      seen.push(c);
      return { kind: 3, tags: c?.tags ?? [], content: "" };
    });
    expect(seen).toEqual([current]);
  });

  it("再取得が失敗したら何も書かない", async () => {
    // 捕まえる変異: current = undefined で続行する。既存のフォローリストを
    // 1 件だけのリストで丸ごと上書きする巻き戻せない破壊になる。
    const { writer, store, calls } = setupReplace(undefined, {
      refetchThrows: new RefetchFailedError([]),
    });
    await expect(
      writer.replace(3, undefined, () => ({ kind: 3, tags: [], content: "" })),
    ).rejects.toBeInstanceOf(RefetchFailedError);
    expect(calls).toEqual(["fetch"]);
    expect(store.size).toBe(0);
  });

  it("created_at が現在の版以下なら +1 に繰り上げる", async () => {
    // 捕まえる変異: 常に now() を使う。リレーは created_at で新旧を決める
    // ので、同一秒内の 2 回目の更新が黙って捨てられる。
    const current = sign(1, {
      kind: 3,
      created_at: 1_700_000_000, // now() と同値
      tags: [],
      content: "",
    });
    const { writer } = setupReplace(current);
    const result = await writer.replace(3, undefined, () => ({
      kind: 3,
      tags: [],
      content: "",
    }));
    expect(result.event.created_at).toBe(1_700_000_001);
  });

  it("現在の版より新しければ now() をそのまま使う", async () => {
    // 捕まえる変異: 無条件に +1 する
    const current = sign(1, {
      kind: 3,
      created_at: 1_600_000_000,
      tags: [],
      content: "",
    });
    const { writer } = setupReplace(current);
    const result = await writer.replace(3, undefined, () => ({
      kind: 3,
      tags: [],
      content: "",
    }));
    expect(result.event.created_at).toBe(1_700_000_000);
  });

  it("再取得した版を replaced に載せる", async () => {
    // 捕まえる変異: replaced を落とす。UI が競合を警告する材料が無くなる。
    const current = sign(1, {
      kind: 3,
      created_at: 1_600_000_000,
      tags: [],
      content: "",
    });
    const { writer } = setupReplace(current);
    const result = await writer.replace(3, undefined, () => ({
      kind: 3,
      tags: [],
      content: "",
    }));
    expect(result.replaced).toBe(current);
  });
});
