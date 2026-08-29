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
import type { PublishResult, Publisher } from "./publisher";
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
    targets: () => [] as RelayUrl[],
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

const stubPublisher = (
  publish: Publisher["publish"],
  targets: RelayUrl[] = [],
): Publisher => ({ publish, targets: () => [...targets] });

describe("publish", () => {
  it("署名 → 楽観挿入 → publish の順に進む", async () => {
    // 捕まえる変異: put を publish の後に動かす。そうすると楽観挿入が
    // リレーの応答を待つことになり、ADR-0011 の 100ms 予算が崩れる。
    const { writer, calls } = setup(ok);
    await writer.publish({ kind: 1, tags: [], content: "hi" });
    expect(calls).toEqual(["sign", "put", "publish"]);
  });

  it("now を渡さなければ現在時刻を秒で使う", async () => {
    // 捕まえる変異: 既定値を () => undefined にする、または
    // Date.now() をミリ秒のまま使う (created_at が現在の 1000 倍になる)。
    const store = new EventStore();
    const writer = createWriter({
      signer: createFakeSigner(SK),
      store,
      publisher: stubPublisher(async () => ok),
      pubkey: () => PUBKEY,
      fetchLatest: async () => undefined,
    });
    const before = Math.floor(Date.now() / 1000);
    const result = await writer.publish({ kind: 1, tags: [], content: "hi" });
    const after = Math.floor(Date.now() / 1000);
    expect(result.event.created_at).toBeGreaterThanOrEqual(before);
    expect(result.event.created_at).toBeLessThanOrEqual(after);
  });

  it("追加送信先を指定しなければ空配列を Publisher へ渡す", async () => {
    // 捕まえる変異: additionalRelays の既定値に実在しない送信先を
    // 入れ、通常投稿まで不要なリレーへ送る。
    let additional: readonly RelayUrl[] | undefined;
    const writer = createWriter({
      signer: createFakeSigner(SK),
      store: new EventStore(),
      publisher: {
        targets: () => [],
        publish: async (_event, options) => {
          additional = options?.additionalRelays;
          return ok;
        },
      },
      pubkey: () => PUBKEY,
      now: () => 1_700_000_000,
      fetchLatest: async () => undefined,
    });

    await writer.publish({ kind: 1, tags: [], content: "hi" });

    expect(additional).toEqual([]);
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
      publisher: stubPublisher(async () => {
        calls.push("publish");
        return ok;
      }),
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

  it("onOptimisticInsert に渡る startedAt は store.put() より前の時刻", async () => {
    // 捕まえる変異: 開始時刻をフックの中 (= store.put() の後) で取る。
    // store.put() は毎回 schnorr 検証を走らせる (event-store.ts の
    // verifyEvent) ので、put() の後で計測を始めると検証コストが
    // ADR-0011 の予算の実測から漏れる。put() に観測可能な時間を
    // 使わせて (busy-wait)、開始時刻がその手前で取られていることを
    // 実測で確かめる —— 呼び出し順だけを見る上のテストでは、開始時刻を
    // 取る位置をフックの中へ動かしても呼び出し順は変わらないため
    // 捕まえられない。
    const store = new EventStore();
    const originalPut = store.put.bind(store);
    let putStartedAt = -1;
    let putFinishedAt = -1;
    store.put = (...args: Parameters<EventStore["put"]>) => {
      putStartedAt = performance.now();
      while (performance.now() - putStartedAt < 5) {
        // 意図的な busy-wait: put() に観測可能な時間を消費させる
      }
      const result = originalPut(...args);
      putFinishedAt = performance.now();
      return result;
    };

    const writer = createWriter({
      signer: createFakeSigner(SK),
      store,
      publisher: stubPublisher(async () => ok),
      pubkey: () => PUBKEY,
      now: () => 1_700_000_000,
      fetchLatest: async () => undefined,
    });

    let startedAt = -1;
    await writer.publish(
      { kind: 1, tags: [], content: "hi" },
      {
        onOptimisticInsert: (_event, s) => {
          startedAt = s;
        },
      },
    );

    expect(putStartedAt).toBeGreaterThan(0);
    expect(startedAt).toBeGreaterThan(0);
    // put() の busy-wait より前に取られていなければ、この不等式は
    // (5ms 分) 成立しない。
    expect(startedAt).toBeLessThanOrEqual(putStartedAt);
    expect(startedAt).toBeLessThan(putFinishedAt - 4);
  });

  it("hooks はあっても onOptimisticInsert が無ければそのまま進む", async () => {
    // 捕まえる変異: 内側の ?. を外して hooks?.onOptimisticInsert(...) にする。
    // hooks オブジェクト自体は渡すが onOptimisticInsert を渡さない
    // 呼び出し側で "not a function" として落ちる。
    const { writer } = setup(ok);
    await expect(
      writer.publish({ kind: 1, tags: [], content: "hi" }, {}),
    ).resolves.toBeDefined();
  });

  it("store.put が rejected を返す署名は挿入扱いにせず例外を投げる", async () => {
    // 捕まえる変異: store.put() の戻り値を無視してそのまま onOptimisticInsert/
    // publish へ進む (verify-optimistic-insert.ts を経由しない)。`signEvent`
    // が返す `NostrEvent` は拡張機能の応答を無検証キャストしただけの値
    // (`nip07-signer.ts` 参照) —— ここでは sig を壊した signer でそれを模す。
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
      publisher: stubPublisher(async () => {
        calls.push("publish");
        return ok;
      }),
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

  it("duplicate な put が全滅しても、先に成功していたイベントは remove しない", async () => {
    // 捕まえる変異: putResult を見ずに無条件で remove する。同じ本文を
    // 同じ秒に 2 回投稿すると id が衝突する (event id は署名を含まない
    // ハッシュ) —— 2 回目の store.put() は "duplicate" になり、これは
    // 「1 回目の呼び出しが既に挿入済み」という意味でしかない。2 回目が
    // 全滅したときに無条件で remove すると、1 回目の成功で既にリレーへ
    // 届いていたイベントまで一緒に消えてしまう。
    const store = new EventStore();
    const removedIds: string[] = [];
    const originalRemove = store.remove.bind(store);
    store.remove = (...args: Parameters<EventStore["remove"]>) => {
      removedIds.push(args[0]);
      return originalRemove(...args);
    };

    const signer = createFakeSigner(SK);
    const draft = { kind: 1, tags: [], content: "hi" };

    // 1 回目: 成功する
    const firstWriter = createWriter({
      signer,
      store,
      publisher: stubPublisher(async () => ok),
      pubkey: () => PUBKEY,
      now: () => 1_700_000_000,
      fetchLatest: async () => undefined,
    });
    const first = await firstWriter.publish(draft);
    expect(store.get(first.event.id)).toBeDefined();

    // 2 回目: 同じ signer・同じ draft・同じ now() なので同じ id になり、
    // store.put() は "duplicate" を返す。publish は全滅させる。
    const secondWriter = createWriter({
      signer,
      store,
      publisher: stubPublisher(async () => allFailed),
      pubkey: () => PUBKEY,
      now: () => 1_700_000_000,
      fetchLatest: async () => undefined,
    });

    let secondPutResult: "inserted" | "duplicate" | undefined;
    await expect(
      secondWriter.publish(draft, {
        onOptimisticInsert: (_event, _startedAt, putResult) => {
          secondPutResult = putResult;
        },
      }),
    ).rejects.toBeInstanceOf(WriteFailedError);

    expect(secondPutResult).toBe("duplicate");
    expect(removedIds).toEqual([]);
    // 1 回目のイベントは消えずに残っている
    expect(store.get(first.event.id)).toBeDefined();
  });
});

describe("replace", () => {
  it("非同期 replacement の完了を待ってから署名する", async () => {
    // 捕まえる変異: mutate の Promise を await せず、そのまま draft として署名する。
    const calls: string[] = [];
    const fake = createFakeSigner(SK);
    const writer = createWriter({
      signer: {
        getPublicKey: fake.getPublicKey,
        signEvent: async (template) => {
          calls.push(`sign:${template.content}`);
          return fake.signEvent(template);
        },
      },
      store: new EventStore(),
      publisher: stubPublisher(async () => ok),
      pubkey: () => PUBKEY,
      now: () => 1_700_000_000,
      fetchLatest: async () => undefined,
    });

    await writer.replace(10_000, undefined, async () => {
      calls.push("decrypt");
      await Promise.resolve();
      calls.push("encrypt");
      return { kind: 10_000, tags: [], content: "cipher" };
    });

    expect(calls).toEqual(["decrypt", "encrypt", "sign:cipher"]);
  });

  it("addressable event の d を identifier からちょうど 1 個付ける", async () => {
    const { writer } = setup(ok);

    const result = await writer.replace(30078, "streets/deck", () => ({
      kind: 30078,
      tags: [
        ["d", "stale"],
        ["d", "duplicate"],
        ["alt", "deck"],
      ],
      content: "cipher",
    }));

    // 捕まえる変異: identifier を tags へ反映しない、または mutation の
    // 古い d を残す。同じ event が複数 address を名乗る。
    expect(result.event.tags).toEqual([
      ["d", "streets/deck"],
      ["alt", "deck"],
    ]);
    expect(result.event.tags.filter((tag) => tag[0] === "d")).toHaveLength(1);
  });
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
      publisher: stubPublisher(async () => {
        calls.push("publish");
        return ok;
      }),
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

  it("楽観挿入前の publish 先を追加先として保持する", async () => {
    // 捕まえる変異: store.put 後に解決した送信先だけへ publish する。
    // kind:10002 の変更で外した旧 write リレーに旧版が残る。
    const additional: (readonly RelayUrl[])[] = [];
    const writer = createWriter({
      signer: createFakeSigner(SK),
      store: new EventStore(),
      publisher: {
        targets: () => ["wss://old/"],
        publish: async (_event, options) => {
          additional.push(options?.additionalRelays ?? []);
          return ok;
        },
      },
      pubkey: () => PUBKEY,
      now: () => 1_700_000_000,
      fetchLatest: async () => undefined,
    });

    await writer.replace(10002, undefined, () => ({
      kind: 10002,
      tags: [["r", "wss://new/", "write"]],
      content: "",
    }));

    expect(additional).toEqual([["wss://old/"]]);
  });

  it("部分失敗した旧 publish 先を次回の replace でも再試行する", async () => {
    // 捕まえる変異: 部分成功時の rejected を保持しない。kind:10002 の
    // 楽観挿入後は旧リレーが routing から消え、次回は二度と送られない。
    const additional: (readonly RelayUrl[])[] = [];
    let targetCall = 0;
    let publishCall = 0;
    const writer = createWriter({
      signer: createFakeSigner(SK),
      store: new EventStore(),
      publisher: {
        targets: () => (targetCall++ === 0 ? ["wss://old/"] : ["wss://new/"]),
        publish: async (_event, options) => {
          additional.push(options?.additionalRelays ?? []);
          publishCall += 1;
          return publishCall === 1
            ? {
                accepted: ["wss://new/"],
                rejected: [
                  { relay: "wss://old/", reason: "temporarily unavailable" },
                  {
                    relay: "wss://unrelated/",
                    reason: "not a previous target",
                  },
                ],
              }
            : ok;
        },
      },
      pubkey: () => PUBKEY,
      now: () => 1_700_000_000,
      fetchLatest: async () => undefined,
    });
    const mutate = () => ({
      kind: 10002,
      tags: [["r", "wss://new/", "write"]],
      content: "",
    });

    await writer.replace(10002, undefined, mutate);
    await writer.replace(10002, undefined, mutate);
    await writer.replace(10002, undefined, mutate);

    expect(additional).toEqual([
      ["wss://old/"],
      ["wss://new/", "wss://old/"],
      ["wss://new/"],
    ]);
  });

  it("全滅した旧 publish 先も次回の replace で再試行する", async () => {
    // 捕まえる変異: WriteFailedError で投げる経路で、失敗した
    // 旧送信先を保持しない。次回の保存が新リレーだけに送られる。
    const additional: (readonly RelayUrl[])[] = [];
    let targetCall = 0;
    let publishCall = 0;
    const writer = createWriter({
      signer: createFakeSigner(SK),
      store: new EventStore(),
      publisher: {
        targets: () => (targetCall++ === 0 ? ["wss://old/"] : ["wss://new/"]),
        publish: async (_event, options) => {
          additional.push(options?.additionalRelays ?? []);
          publishCall += 1;
          return publishCall === 1
            ? {
                accepted: [],
                rejected: [
                  { relay: "wss://old/", reason: "temporarily unavailable" },
                  {
                    relay: "wss://unrelated/",
                    reason: "not a previous target",
                  },
                ],
              }
            : ok;
        },
      },
      pubkey: () => PUBKEY,
      now: () => 1_700_000_000,
      fetchLatest: async () => undefined,
    });
    const mutate = () => ({ kind: 10002, tags: [], content: "" });

    await expect(writer.replace(10002, undefined, mutate)).rejects.toThrow(
      WriteFailedError,
    );
    await writer.replace(10002, undefined, mutate);

    expect(additional).toEqual([["wss://old/"], ["wss://new/", "wss://old/"]]);
  });

  it("WriteFailedError 以外の例外をそのまま伝播する", async () => {
    // 捕まえる変異: すべての例外を WriteFailedError とみなし、
    // `rejected` を読もうとして元の署名エラーを握り潰す。
    const cause = new Error("signing denied");
    const writer = createWriter({
      signer: {
        getPublicKey: async () => PUBKEY,
        signEvent: async () => {
          throw cause;
        },
      },
      store: new EventStore(),
      publisher: stubPublisher(async () => ok, ["wss://old/"]),
      pubkey: () => PUBKEY,
      now: () => 1_700_000_000,
      fetchLatest: async () => undefined,
    });

    await expect(
      writer.replace(10002, undefined, () => ({
        kind: 10002,
        tags: [],
        content: "",
      })),
    ).rejects.toBe(cause);
  });

  it("保留した旧 publish 先を別 kind の replace へ混ぜない", async () => {
    // 捕まえる変異: 置換対象のキーを空にし、ある kind の失敗先を
    // 無関係な置換可能イベントの送信先にも混ぜる。
    const additional: (readonly RelayUrl[])[] = [];
    let targetCall = 0;
    let publishCall = 0;
    const writer = createWriter({
      signer: createFakeSigner(SK),
      store: new EventStore(),
      publisher: {
        targets: () =>
          targetCall++ === 0 ? ["wss://old/"] : ["wss://current/"],
        publish: async (_event, options) => {
          additional.push(options?.additionalRelays ?? []);
          publishCall += 1;
          return publishCall === 1
            ? {
                accepted: ["wss://current/"],
                rejected: [{ relay: "wss://old/", reason: "partial" }],
              }
            : ok;
        },
      },
      pubkey: () => PUBKEY,
      now: () => 1_700_000_000,
      fetchLatest: async () => undefined,
    });

    await writer.replace(10002, undefined, () => ({
      kind: 10002,
      tags: [],
      content: "",
    }));
    await writer.replace(3, undefined, () => ({
      kind: 3,
      tags: [],
      content: "",
    }));

    expect(additional).toEqual([["wss://old/"], ["wss://current/"]]);
  });
});
