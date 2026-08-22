import { schnorr } from "@noble/curves/secp256k1.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { describe, expect, it } from "vitest";
import { EventStore } from "../read/event-store";
import type { RelayUrl } from "../relay/relay-connection";
import { createFakeSigner } from "../signer/fake-signer";
import type { Signer } from "../signer/signer";
import type { PublishResult } from "./publisher";
import { WriteFailedError, createWriter } from "./writer";

const SK = Uint8Array.from(Array.from({ length: 32 }, (_, i) => i + 1));
const PUBKEY = bytesToHex(schnorr.getPublicKey(SK));

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
});
