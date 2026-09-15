import {
  IDBFactory as FakeIDBFactory,
  IDBKeyRange as FakeIDBKeyRange,
} from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import type { NostrEvent } from "../nostr/event";
import type { CachePolicy } from "./cache-policy";
import type { PersistedEvent } from "./event-persistence";
import { type FakeClock, createFakeClock } from "./fake-clock";
import {
  createIndexedDbPersistence,
  selectForPersistence,
} from "./indexeddb-persistence";
import { compareEvents } from "./sorted-events";

let nextId = 0;

/** selectForPersistence は署名や id の形を見ないので短い文字列で足りる (isNostrEvent が要るのは readAllEvents 側のテストだけ)。 */
const makeEvent = (
  overrides: Pick<NostrEvent, "pubkey" | "kind" | "created_at"> &
    Partial<NostrEvent>,
): NostrEvent => ({
  id: overrides.id ?? `id-${nextId++}`,
  tags: [],
  content: "",
  sig: "sig",
  ...overrides,
});

const persistedEvent = (event: NostrEvent): PersistedEvent => ({
  event,
  seenRelays: [],
  fetchedAt: 0,
});

/** flush() 内の getDb().then(...) を待つ。実タイマーのマクロタスク境界まで待てば、FakeClock を進めなくても先のマイクロタスクは片付く。 */
const waitForAsyncWork = () =>
  new Promise<void>((resolve) => setTimeout(resolve, 0));

describe("selectForPersistence", () => {
  const latestPerAuthor: CachePolicy = {
    staleMs: 0,
    serveWhileRevalidating: false,
    retention: { type: "latest-per-author" },
    scope: "public",
  };
  const none: CachePolicy = {
    staleMs: 0,
    serveWhileRevalidating: false,
    retention: { type: "none" },
    scope: "public",
  };

  it("retention: none の kind は書かれない", () => {
    // 捕まえる変異: none の分岐で continue せず winners に加える (書いてはいけない kind が永続化される)。
    const entry = persistedEvent(
      makeEvent({ pubkey: "p1", kind: 3, created_at: 1 }),
    );
    expect(selectForPersistence([entry], () => none)).toEqual([]);
  });

  it("latest-per-author は created_at が大きいほうを残す (到着順に依存しない)", () => {
    // 捕まえる変異: created_at を比較せず「後から来た方で上書き」にする (entries の並び順で結果が変わってしまう)。
    const older = persistedEvent(
      makeEvent({ id: "old", pubkey: "p1", kind: 0, created_at: 100 }),
    );
    const newer = persistedEvent(
      makeEvent({ id: "new", pubkey: "p1", kind: 0, created_at: 200 }),
    );

    const oldFirst = selectForPersistence(
      [older, newer],
      () => latestPerAuthor,
    );
    const newFirst = selectForPersistence(
      [newer, older],
      () => latestPerAuthor,
    );

    expect(oldFirst).toEqual([{ entry: newer, replaceableKey: "0:p1" }]);
    expect(newFirst).toEqual([{ entry: newer, replaceableKey: "0:p1" }]);
  });

  it("created_at 同値のときは sorted-events.ts の compareEvents と同じ全順序で決まる", () => {
    // 捕まえる変異: 同値のとき機械的に配列の前後を勝たせる (compareEvents を呼ばない)。
    // sorted-events.ts と食い違う勝者を選ぶと、保存された版とメモリ上の版が別々の全順序で決まる。
    const a = persistedEvent(
      makeEvent({ id: "aaa", pubkey: "p1", kind: 0, created_at: 100 }),
    );
    const b = persistedEvent(
      makeEvent({ id: "bbb", pubkey: "p1", kind: 0, created_at: 100 }),
    );
    const expectedWinnerId =
      compareEvents(a.event, b.event) < 0 ? a.event.id : b.event.id;

    const abOrder = selectForPersistence([a, b], () => latestPerAuthor);
    const baOrder = selectForPersistence([b, a], () => latestPerAuthor);

    expect(abOrder[0]?.entry.event.id).toBe(expectedWinnerId);
    expect(baOrder[0]?.entry.event.id).toBe(expectedWinnerId);
  });

  it("異なる (kind, pubkey) の組は互いに影響しない", () => {
    // 捕まえる変異: 勝者の集約鍵に kind を含めず pubkey だけにする (別 kind 同士が誤って競合し一方が消える)。
    const kind0 = persistedEvent(
      makeEvent({ id: "e1", pubkey: "p1", kind: 0, created_at: 1 }),
    );
    const kind10002 = persistedEvent(
      makeEvent({ id: "e2", pubkey: "p1", kind: 10002, created_at: 1 }),
    );

    const result = selectForPersistence(
      [kind0, kind10002],
      () => latestPerAuthor,
    );

    expect(result).toHaveLength(2);
  });

  it("scope が public でない kind は retention があっても書かれない", () => {
    // 捕まえる変異: scope を見ず retention だけで決める (account/session の kind が本番の共有 DB へ書かれる)。
    for (const scope of ["account", "session"] as const) {
      const nonPublic: CachePolicy = {
        staleMs: 0,
        serveWhileRevalidating: false,
        retention: { type: "latest-per-author" },
        scope,
      };
      const entry = persistedEvent(
        makeEvent({ pubkey: "p1", kind: 0, created_at: 1 }),
      );
      expect(selectForPersistence([entry], () => nonPublic)).toEqual([]);
    }
  });

  it("retention: capped はこのスライスで未実装のため例外を投げる", () => {
    // 捕まえる変異: capped の分岐で何もせず抜ける (無言で捨てると、capped が現れても誰も気づけない)。
    const entry = persistedEvent(
      makeEvent({ pubkey: "p1", kind: 999, created_at: 1 }),
    );
    expect(() =>
      selectForPersistence([entry], () => ({
        staleMs: 0,
        serveWhileRevalidating: false,
        retention: { type: "capped", max: 10 },
        scope: "public",
      })),
    ).toThrow();
  });
});

describe("createIndexedDbPersistence — load() は reject しない", () => {
  it("indexedDB が無い環境では空を返す", async () => {
    // 捕まえる変異: openDatabase() の try/catch を外す (idb が undefined のまま呼び
    // TypeError が load() まで伝播して reject する)。indexedDB は環境依存を避け明示的に undefined を注入する。
    const persistence = createIndexedDbPersistence({ indexedDB: undefined });
    await expect(persistence.load()).resolves.toEqual({
      events: [],
      deletionRequests: [],
    });
  });

  it("open() が同期的に投げても空を返す", async () => {
    // 捕まえる変異: openDatabase() の try/catch を外す (プライベートブラウジングでは open() がこの形で同期的に失敗する)。
    const throwingIdb: IDBFactory = {
      open: () => {
        throw new Error("simulated: private browsing blocks IndexedDB");
      },
    } as unknown as IDBFactory;

    const persistence = createIndexedDbPersistence({
      indexedDB: throwingIdb,
    });
    await expect(persistence.load()).resolves.toEqual({
      events: [],
      deletionRequests: [],
    });
  });

  it("open() が非同期にエラーになっても空を返す", async () => {
    // 捕まえる変異: openDatabase() の request.onerror ハンドラを外す (load() が永久に解決しなくなる)。
    const failingRequest = {} as IDBOpenDBRequest;
    const failingIdb: IDBFactory = {
      open: () => {
        queueMicrotask(() => failingRequest.onerror?.(new Event("error")));
        return failingRequest;
      },
    } as unknown as IDBFactory;

    const persistence = createIndexedDbPersistence({ indexedDB: failingIdb });
    await expect(persistence.load()).resolves.toEqual({
      events: [],
      deletionRequests: [],
    });
  });
});

describe("createIndexedDbPersistence — 書き込みの窓", () => {
  it("save を連続で呼んでもタイマーは 1 本にまとまる", () => {
    // 捕まえる変異: scheduleFlush の if (timer === null) ガードを外す (PERSIST_BATCH_MS の窓が意味を持たなくなる)。
    const clock = createFakeClock();
    const persistence = createIndexedDbPersistence({
      scheduler: clock,
      indexedDB: undefined,
    });

    persistence.save([
      persistedEvent(makeEvent({ pubkey: "p1", kind: 0, created_at: 1 })),
    ]);
    expect(clock.pendingCount).toBe(1);

    persistence.save([
      persistedEvent(makeEvent({ pubkey: "p2", kind: 0, created_at: 1 })),
    ]);
    expect(clock.pendingCount).toBe(1);
  });

  it("dispose は張ったタイマーを解除する", () => {
    // 捕まえる変異: dispose() が clearTimeout を呼ばない (dispose 後にも flush が走ってしまう)。
    const clock = createFakeClock();
    const persistence = createIndexedDbPersistence({
      scheduler: clock,
      indexedDB: undefined,
    });

    persistence.save([
      persistedEvent(makeEvent({ pubkey: "p1", kind: 0, created_at: 1 })),
    ]);
    expect(clock.pendingCount).toBe(1);

    persistence.dispose();
    expect(clock.pendingCount).toBe(0);
  });

  it("dispose 後の save はタイマーを張らない", () => {
    // 捕まえる変異: `save()` の `if (disposed) return;` ガードを外す
    const clock = createFakeClock();
    const persistence = createIndexedDbPersistence({
      scheduler: clock,
      indexedDB: undefined,
    });

    persistence.dispose();
    persistence.save([
      persistedEvent(makeEvent({ pubkey: "p1", kind: 0, created_at: 1 })),
    ]);
    persistence.saveDeletionRequest(
      makeEvent({ id: "late", pubkey: "p1", kind: 5, created_at: 1 }),
    );

    expect(clock.pendingCount).toBe(0);
  });

  it("同じインスタンスでは open() を複数回試みない", async () => {
    // 捕まえる変異: dbPromise のメモ化を外し flush のたび idb.open() を呼び直す (失敗環境でバッチごとに同じ失敗を繰り返す)。
    let openCalls = 0;
    const idb: IDBFactory = {
      open: () => {
        openCalls++;
        throw new Error("simulated failure");
      },
    } as unknown as IDBFactory;
    const clock = createFakeClock();
    const persistence = createIndexedDbPersistence({
      scheduler: clock,
      indexedDB: idb,
    });

    persistence.save([
      persistedEvent(makeEvent({ pubkey: "p1", kind: 0, created_at: 1 })),
    ]);
    clock.advance(1000);
    await waitForAsyncWork();

    persistence.save([
      persistedEvent(makeEvent({ pubkey: "p2", kind: 0, created_at: 1 })),
    ]);
    clock.advance(1000);
    await waitForAsyncWork();

    expect(openCalls).toBe(1);
  });
});

// writeBatch は注入されていない生の IDBKeyRange を直接参照するが jsdom/Node には
// 元々存在しないため、実ストレージを検証する以下のテストのためにここでだけグローバルへ補う。
if (typeof globalThis.IDBKeyRange === "undefined") {
  globalThis.IDBKeyRange = FakeIDBKeyRange as unknown as typeof IDBKeyRange;
}

describe("createIndexedDbPersistence — delete() は IndexedDB から実際に消す", () => {
  /**
   * readAllEvents は isNostrEvent 検証済みの record しか返さないため hex 形の
   * event を kind:0 (永続化対象) で使う — 他 kind は弾かれ delete() を確認できない。
   */
  const realEvent = (id: string, pubkey: string): NostrEvent => ({
    id,
    pubkey,
    kind: 0,
    created_at: 1,
    tags: [],
    content: "",
    sig: "0".repeat(128),
  });
  const eventA = persistedEvent(realEvent("a".repeat(64), "1".repeat(64)));
  const eventB = persistedEvent(realEvent("b".repeat(64), "2".repeat(64)));

  /**
   * fake-indexeddb は setImmediate で継続処理するため、cursor 検索→put のような
   * 複数ホップは setTimeout(0) 1 回では完了を保証できず、check フェーズを複数回回す。
   */
  const settle = async (): Promise<void> => {
    for (let i = 0; i < 20; i++) {
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
  };

  /** テストごとに新しい FakeIDBFactory を注入する —— DB_NAME は固定なので使い回すと状態が漏れる。 */
  const setup = (): {
    persistence: ReturnType<typeof createIndexedDbPersistence>;
    scheduler: FakeClock;
    flush: () => Promise<void>;
  } => {
    const scheduler = createFakeClock();
    const persistence = createIndexedDbPersistence({
      scheduler,
      indexedDB: new FakeIDBFactory(),
    });
    const flush = async (): Promise<void> => {
      scheduler.advance(1000);
      await settle();
    };
    return { persistence, scheduler, flush };
  };

  it("delete した id は load で戻ってこない", async () => {
    // 捕まえる変異: delete を no-op のままにする (publish 失敗で巻き戻したイベントが次回起動の水和で戻ってくる)。
    const { persistence, flush } = setup();
    persistence.save([eventA, eventB]);
    await flush();

    persistence.delete([eventA.event.id]);
    await flush();

    const { events } = await persistence.load();
    expect(events.map((e) => e.event.id)).toEqual([eventB.event.id]);
  });

  it("同じ flush の中で save した直後の id も消える", async () => {
    // 捕まえる変異: writeBatch の removalSet フィルタを外す。cursor 越しの put は
    // 非同期にしか確定せず、先に no-op 処理された delete() を後から put が上書きして残ってしまう。
    const { persistence, flush } = setup();
    persistence.save([eventA]);
    persistence.delete([eventA.event.id]);
    await flush();

    const { events } = await persistence.load();
    expect(events).toEqual([]);
  });

  it("同じ flush の delete より後に再保存した id は残す", async () => {
    // 捕まえる変異: 同一バッチで呼び出し順を見ず常に delete を勝たせる (巻き戻し直後の再受信も次回起動で消える)。
    const { persistence, flush } = setup();
    persistence.save([eventA]);
    persistence.delete([eventA.event.id]);
    persistence.save([eventA]);
    await flush();

    const { events } = await persistence.load();
    expect(events).toEqual([eventA]);
  });

  it("deleteDeletionRequest で取り消した id は load に戻ってこない", async () => {
    // 捕まえる変異: deleteDeletionRequest を no-op のままにする (publish 全滅後も対象が hydrate で弾かれ続ける)。
    const { persistence, flush } = setup();
    const target = "d".repeat(64);
    const request = makeEvent({
      id: target,
      pubkey: "d".repeat(64),
      kind: 5,
      created_at: 1,
    });
    persistence.saveDeletionRequest(request);
    await flush();

    persistence.deleteDeletionRequest(target);
    await flush();

    const { deletionRequests } = await persistence.load();
    expect(deletionRequests).toEqual([]);
  });

  it("同じ flush の中で保存した直後の削除依頼も個別削除で消える", async () => {
    // 捕まえる変異: 同じ flush 内で保存と巻き戻しが両方積まれたとき deletionRemovalSet
    // フィルタを外す。「巻き戻しを勝たせる」契約が崩れ、発行順を偶然守るだけの状態になる。
    const { persistence, flush } = setup();
    const target = "e".repeat(64);
    const request = makeEvent({
      id: target,
      pubkey: "e".repeat(64),
      kind: 5,
      created_at: 1,
    });
    persistence.saveDeletionRequest(request);
    persistence.deleteDeletionRequest(target);
    await flush();

    const { deletionRequests } = await persistence.load();
    expect(deletionRequests).toEqual([]);
  });

  it("同じ flush の巻き戻しより後に再受信した削除依頼は残す", async () => {
    // 捕まえる変異: deletionRemovalIds をバッチ末尾まで残し後着の save も巻き込んで消す (Store と次回水和が食い違う)。
    const { persistence, flush } = setup();
    const id = "f".repeat(64);
    const request = makeEvent({
      id,
      pubkey: "f".repeat(64),
      sig: "0".repeat(128),
      kind: 5,
      created_at: 1,
    });
    persistence.saveDeletionRequest(request);
    persistence.deleteDeletionRequest(id);
    persistence.saveDeletionRequest(request);
    await flush();

    const { deletionRequests } = await persistence.load();
    expect(deletionRequests).toEqual([request]);
  });
});
