import { type NostrEvent, isNostrEvent } from "../nostr/event";
import { type CachePolicy, persistableScope, policyFor } from "./cache-policy";
import { type Scheduler, defaultScheduler } from "./connection-pool";
import type { EventPersistence, PersistedEvent } from "./event-persistence";
import { compareEvents } from "./sorted-events";

const DB_NAME = "streets.v1";
const DB_VERSION = 2;
const EVENTS_STORE = "events";
const DELETIONS_STORE = "deletions";
const REPLACEABLE_INDEX = "replaceableKey";

/**
 * 書き込みをまとめる窓。起動直後のバーストで数百件が流れるため、1 件 1
 * トランザクションでは書き込みが描画を圧迫する。
 */
const PERSIST_BATCH_MS = 1000;

/** オブジェクトストアに実際に書く形。主キーは `id` (event.id)。 */
type StoredEventRecord = {
  id: string;
  event: PersistedEvent["event"];
  seenRelays: PersistedEvent["seenRelays"];
  fetchedAt: number;
  /**
   * `latest-per-author` の対象だけが持つ `${kind}:${pubkey}`。無いと
   * 「同じ著者の前の版」を探すのに全件走査するしかない。
   */
  replaceableKey?: string;
};

/** `selectForPersistence` が書くと決めたエントリ 1 件。 */
export type RetainedEntry = {
  entry: PersistedEvent;
  replaceableKey: string;
};

/**
 * `policyFor(kind).retention` に基づき書くエントリを選ぶ純関数。
 * `latest-per-author` は `compareEvents` で先頭 1 件だけ残す。`capped` は
 * 未実装として投げ、`persistableScope` は `shouldPersist` と入口を共有する。
 */
export const selectForPersistence = (
  entries: readonly PersistedEvent[],
  lookupPolicy: (kind: number) => CachePolicy = policyFor,
): RetainedEntry[] => {
  const winners = new Map<string, RetainedEntry>();

  for (const entry of entries) {
    const policy = lookupPolicy(entry.event.kind);
    if (!persistableScope(policy)) continue;
    switch (policy.retention.type) {
      case "none":
        // persistableScope が retention.type !== "none" を含むので
        // ここには実際には来ない。型の網羅性のためだけに残す。
        continue;
      case "capped":
        throw new Error(
          "retention: capped はこのスライスで対象 kind が無く未実装",
        );
      case "latest-per-author": {
        const key = `${entry.event.kind}:${entry.event.pubkey}`;
        const current = winners.get(key);
        if (!current || compareEvents(entry.event, current.entry.event) < 0) {
          winners.set(key, { entry, replaceableKey: key });
        }
        break;
      }
    }
  }

  return [...winners.values()];
};

/** 永続層のレコードは壊れていることがある。形を確かめて `PersistedEvent` に戻す。 */
const toPersistedEvent = (record: StoredEventRecord): PersistedEvent[] => {
  if (!isNostrEvent(record.event)) return [];
  // fetchedAt が壊れている/無いものを現在時刻で埋めると、実際には古い値を
  // 新鮮と誤判定させてしまう —— 0 にして必ず取り直させる。
  const fetchedAt =
    typeof record.fetchedAt === "number" && Number.isFinite(record.fetchedAt)
      ? record.fetchedAt
      : 0;
  const seenRelays = Array.isArray(record.seenRelays) ? record.seenRelays : [];
  return [{ event: record.event, seenRelays, fetchedAt }];
};

export type CreateIndexedDbPersistenceOptions = {
  /** バッチ窓のタイマー注入口 (テスト用)。既定は実タイマー。 */
  scheduler?: Scheduler;
  /**
   * `indexedDB` の注入口 (テスト用)。既定は `globalThis.indexedDB` ——
   * jsdom/Node には無いので、自然に「使えない」経路を通る。
   */
  indexedDB?: IDBFactory;
};

const openDatabase = (idb: IDBFactory): Promise<IDBDatabase | null> =>
  new Promise((resolve) => {
    let request: IDBOpenDBRequest;
    try {
      request = idb.open(DB_NAME, DB_VERSION);
    } catch {
      // プライベートブラウジングなど、open() 自体が同期的に投げる実装がある。
      resolve(null);
      return;
    }

    request.onupgradeneeded = () => {
      const db = request.result;
      // 移行コードを書かない方針。バージョンを上げる将来の変更が「一部だけ
      // 新しいスキーマ」を残さないよう、既存ストアを全部消してから作り直す。
      for (const name of Array.from(db.objectStoreNames)) {
        db.deleteObjectStore(name);
      }
      const events = db.createObjectStore(EVENTS_STORE, { keyPath: "id" });
      events.createIndex(REPLACEABLE_INDEX, "replaceableKey", {
        unique: false,
      });
      db.createObjectStore(DELETIONS_STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    // 他のタブが旧バージョンを握ったままだと upgrade が進まない。ここで
    // 待ち続けると load() が無期限に解決しなくなるので、失敗として扱う。
    request.onblocked = () => resolve(null);
  });

const readAllEvents = (db: IDBDatabase): Promise<PersistedEvent[]> =>
  new Promise((resolve) => {
    try {
      const tx = db.transaction(EVENTS_STORE, "readonly");
      const request = tx.objectStore(EVENTS_STORE).getAll();
      request.onsuccess = () => {
        const records = (request.result ?? []) as StoredEventRecord[];
        resolve(records.flatMap(toPersistedEvent));
      };
      request.onerror = () => resolve([]);
      tx.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });

const readAllDeletionRequests = (db: IDBDatabase): Promise<NostrEvent[]> =>
  new Promise((resolve) => {
    try {
      const tx = db.transaction(DELETIONS_STORE, "readonly");
      const request = tx.objectStore(DELETIONS_STORE).getAll();
      request.onsuccess = () => {
        resolve(
          (request.result ?? []).flatMap((record: unknown) => {
            if (!record || typeof record !== "object") return [];
            const event = (record as { event?: unknown }).event;
            return isNostrEvent(event) ? [event] : [];
          }),
        );
      };
      request.onerror = () => resolve([]);
      tx.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });

const writeBatch = (
  db: IDBDatabase,
  retained: readonly RetainedEntry[],
  deletionRequests: readonly NostrEvent[],
  removalIds: readonly string[],
  deletionRemovalIds: readonly string[],
): Promise<void> =>
  new Promise((resolve) => {
    let tx: IDBTransaction;
    try {
      tx = db.transaction([EVENTS_STORE, DELETIONS_STORE], "readwrite");
    } catch {
      resolve();
      return;
    }
    // 書き込みの失敗は黙って捨てる —— 次回の起動が
    // 遅くなるだけで、アプリを止める理由にはならない。
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
    tx.onabort = () => resolve();

    const eventsStore = tx.objectStore(EVENTS_STORE);
    const deletionsStore = tx.objectStore(DELETIONS_STORE);
    const replaceableIndex = eventsStore.index(REPLACEABLE_INDEX);

    // 「保存」と「巻き戻し (delete)」が同じ id に来たら delete を勝たせる。
    // put() は cursor 経由で非同期に確定するため、単に delete のループを
    // 後に置くだけでは足りない (delete が先に no-op として処理され、後から
    // 確定する put() に上書きされる) —— retained から該当 id を先に除く。
    const removalSet = new Set(removalIds);
    for (const { entry, replaceableKey } of retained) {
      if (removalSet.has(entry.event.id)) continue;
      const cursorRequest = replaceableIndex.openCursor(
        IDBKeyRange.only(replaceableKey),
      );
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        const record: StoredEventRecord = {
          id: entry.event.id,
          event: entry.event,
          seenRelays: entry.seenRelays,
          fetchedAt: entry.fetchedAt,
          replaceableKey,
        };
        if (!cursor) {
          eventsStore.put(record);
          return;
        }
        const existing = cursor.value as StoredEventRecord;
        // 同じ id への再書き込み (restamp) は上書きでよいが、別 id の古い版
        // が残ると「著者ごと最新 1 件」が破れ、版が溜まり続ける。
        if (
          existing.id === entry.event.id ||
          compareEvents(entry.event, existing.event) < 0
        ) {
          cursor.delete();
          eventsStore.put(record);
        }
      };
    }

    // deletionRemovalIds に挙がる id は書かない —— events 側と同じ理由で、
    // 先に除いておけば put/delete の発行順に依存しない。
    const deletionRemovalSet = new Set(deletionRemovalIds);
    for (const event of deletionRequests) {
      const id = event.id;
      if (deletionRemovalSet.has(id)) continue;
      deletionsStore.put({ id, event });
    }

    for (const id of removalIds) {
      eventsStore.delete(id);
    }

    for (const id of deletionRemovalIds) {
      deletionsStore.delete(id);
    }
  });

/**
 * IndexedDB 版の `EventPersistence`。`load()` は決して reject しない ——
 * 失敗はキャッシュが無いのと同じで起動を止めない。
 */
export const createIndexedDbPersistence = (
  options: CreateIndexedDbPersistenceOptions = {},
): EventPersistence => {
  const scheduler = options.scheduler ?? defaultScheduler;
  const idb = options.indexedDB ?? globalThis.indexedDB;

  let disposed = false;
  let pendingEvents: PersistedEvent[] = [];
  let pendingDeletionRequests: NostrEvent[] = [];
  let pendingRemovalIds: string[] = [];
  let pendingDeletionRemovalIds: string[] = [];
  let timer: ReturnType<Scheduler["setTimeout"]> | null = null;

  // open() は一度だけ試す。save() のたびに開き直すと、失敗が続く環境で
  // 毎回同じ失敗を繰り返すだけになる。
  let dbPromise: Promise<IDBDatabase | null> | null = null;
  let openedDb: IDBDatabase | null = null;
  const getDb = (): Promise<IDBDatabase | null> => {
    if (!dbPromise) {
      dbPromise = openDatabase(idb).then((db) => {
        openedDb = db;
        return db;
      });
    }
    return dbPromise;
  };

  const flush = (): void => {
    timer = null;
    if (disposed) return;
    const eventsToWrite = pendingEvents;
    pendingEvents = [];
    const deletionsToWrite = pendingDeletionRequests;
    pendingDeletionRequests = [];
    const removalsToWrite = pendingRemovalIds;
    pendingRemovalIds = [];
    const deletionRemovalsToWrite = pendingDeletionRemovalIds;
    pendingDeletionRemovalIds = [];
    if (
      eventsToWrite.length === 0 &&
      deletionsToWrite.length === 0 &&
      removalsToWrite.length === 0 &&
      deletionRemovalsToWrite.length === 0
    )
      return;

    // getDb() は openDatabase() 内で失敗を吸収するので今日は reject しないが、
    // 将来そこが崩れた時のため、ここでも黙って捨てる終端にしておく。
    void getDb()
      .then(async (db) => {
        if (!db || disposed) return;
        try {
          const retained = selectForPersistence(eventsToWrite);
          await writeBatch(
            db,
            retained,
            deletionsToWrite,
            removalsToWrite,
            deletionRemovalsToWrite,
          );
        } catch {
          // 黙って捨てる。
        }
      })
      .catch(() => {});
  };

  const scheduleFlush = (): void => {
    if (timer === null) {
      timer = scheduler.setTimeout(flush, PERSIST_BATCH_MS);
    }
  };

  return {
    async load() {
      // try/catch を重ねない —— 下の 3 つは内部で失敗を吸収し尽くしていて
      // 例外を出さない。ここで包むと決して発火しない catch が手がかりを増やす。
      const db = await getDb();
      if (!db) return { events: [], deletionRequests: [] };
      const [events, deletionRequests] = await Promise.all([
        readAllEvents(db),
        readAllDeletionRequests(db),
      ]);
      return { events, deletionRequests };
    },

    save(entries) {
      if (disposed) return;
      const ids = new Set(entries.map(({ event }) => event.id));
      pendingEvents = pendingEvents.filter(({ event }) => !ids.has(event.id));
      pendingRemovalIds = pendingRemovalIds.filter((id) => !ids.has(id));
      pendingEvents.push(...entries);
      scheduleFlush();
    },

    saveDeletionRequest(event) {
      if (disposed) return;
      pendingDeletionRequests = pendingDeletionRequests.filter(
        ({ id }) => id !== event.id,
      );
      pendingDeletionRemovalIds = pendingDeletionRemovalIds.filter(
        (id) => id !== event.id,
      );
      pendingDeletionRequests.push(event);
      scheduleFlush();
    },

    delete(ids) {
      if (disposed) return;
      const idSet = new Set(ids);
      pendingEvents = pendingEvents.filter(({ event }) => !idSet.has(event.id));
      pendingRemovalIds = pendingRemovalIds.filter((id) => !idSet.has(id));
      pendingRemovalIds.push(...ids);
      scheduleFlush();
    },

    deleteDeletionRequest(id) {
      if (disposed) return;
      pendingDeletionRequests = pendingDeletionRequests.filter(
        (event) => event.id !== id,
      );
      pendingDeletionRemovalIds = pendingDeletionRemovalIds.filter(
        (pendingId) => pendingId !== id,
      );
      pendingDeletionRemovalIds.push(id);
      scheduleFlush();
    },

    dispose() {
      disposed = true;
      if (timer !== null) {
        scheduler.clearTimeout(timer);
        timer = null;
      }
      pendingEvents = [];
      pendingDeletionRequests = [];
      pendingRemovalIds = [];
      pendingDeletionRemovalIds = [];
      openedDb?.close();
    },
  };
};
