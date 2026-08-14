import { describe, expect, it } from "vitest";
import type { NostrEvent } from "../nostr/event";
import type { CachePolicy } from "./cache-policy";
import type { PersistedEvent } from "./event-persistence";
import { createFakeClock } from "./fake-clock";
import {
  createIndexedDbPersistence,
  selectForPersistence,
} from "./indexeddb-persistence";
import { compareEvents } from "./sorted-events";

let nextId = 0;

/**
 * `selectForPersistence` は署名や id の形を見ないので、テストはハッシュらしい
 * 値を作らず短い文字列で足りる (`isNostrEvent` を通す必要があるのは
 * `readAllEvents` 側のテストだけ)。
 */
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

/** 待っているのは flush() 内の `getDb().then(...)` の解決。実タイマーの
 * マクロタスク境界まで待てば、注入した FakeClock を進めなくても
 * 先に積まれたマイクロタスクは必ず片付いている。 */
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
    // 捕まえる変異: none の分岐で continue せず winners に加えてしまう
    // (フォローリストなど、書いてはいけない kind が永続化されてしまう)
    const entry = persistedEvent(
      makeEvent({ pubkey: "p1", kind: 3, created_at: 1 }),
    );
    expect(selectForPersistence([entry], () => none)).toEqual([]);
  });

  it("latest-per-author は created_at が大きいほうを残す (到着順に依存しない)", () => {
    // 捕まえる変異: created_at を比較せず「後から来たほうで上書き」にする
    // (compareEvents を使わない実装は、entries の並び順が変わると結果も
    // 変わってしまう)
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
    // 捕まえる変異: 同値のとき常に配列の後ろ (または前) を機械的に勝たせる
    // (compareEvents を呼ばずに決める)。sorted-events.ts と食い違う勝者を
    // 選ぶと、同じ2つのイベントについて「保存された版」と「メモリ上でSortedEvents
    // が保持する版」が別々の全順序で決まる
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
    // 捕まえる変異: 勝者を集約する鍵に kind を含めず pubkey だけにする
    // (別 kind の置換可能イベント同士が誤って競合し、一方が消える)
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
    // 捕まえる変異: selectForPersistence が scope を見ず retention だけで
    // 決める (= このスライスが防ごうとした穴そのもの。account/session を
    // 名乗った kind が本番の共有 DB へ書かれる)
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
    // 捕まえる変異: capped の分岐で何もせず抜ける (無言で捨てるのは「実装
    // しない」の意図と違う —— ポリシー側に capped が現れても誰も気づけない)
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
    // 捕まえる変異: `openDatabase()` の try/catch を外す (`idb` が undefined
    // のまま `idb.open` を呼びに行き、プロパティアクセスの TypeError が
    // `load()` まで伝播して reject する)。`load()` 自身は内部の各関数が
    // 失敗を吸収し切る前提で素通しにしている (二重に catch すると、片方が
    // 発火しない死んだコードになる) —— reject しない契約はこの層が守る。
    // jsdom/Node のテスト環境には元々 indexedDB が無いが、ここでは環境依存に
    // せず明示的に注入して固定する
    const persistence = createIndexedDbPersistence({ indexedDB: undefined });
    await expect(persistence.load()).resolves.toEqual({
      events: [],
      deletedIds: [],
    });
  });

  it("open() が同期的に投げても空を返す", async () => {
    // 捕まえる変異: `openDatabase()` の try/catch を外す (open() の同期例外が
    // そのまま `load()` まで伝播し reject する)。プライベートブラウジングの
    // 実装は open() がこの形で同期的に失敗する
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
      deletedIds: [],
    });
  });

  it("open() が非同期にエラーになっても空を返す", async () => {
    // 捕まえる変異: `openDatabase()` の `request.onerror` ハンドラを外す
    // (request が永久に pending のままで load() が解決しなくなる)
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
      deletedIds: [],
    });
  });
});

describe("createIndexedDbPersistence — 書き込みの窓", () => {
  it("save を連続で呼んでもタイマーは 1 本にまとまる", () => {
    // 捕まえる変異: `scheduleFlush` の `if (timer === null)` ガードを外す
    // (save() のたびに新しいタイマーを張り、PERSIST_BATCH_MS の窓が意味を
    // 持たなくなる)
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
    // 捕まえる変異: dispose() が `clearTimeout` を呼ばない (save() から
    // PERSIST_BATCH_MS 後、dispose 後にもかかわらず flush が走ってしまう)
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
    persistence.saveDeletions(["late"]);

    expect(clock.pendingCount).toBe(0);
  });

  it("同じインスタンスでは open() を複数回試みない", async () => {
    // 捕まえる変異: `dbPromise` のメモ化を外し、flush のたびに `idb.open()`
    // を呼び直す (失敗し続ける環境で、バッチのたびに同じ失敗を繰り返す)
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
