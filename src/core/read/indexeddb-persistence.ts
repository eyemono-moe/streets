import { isNostrEvent } from "../nostr/event";
import { type CachePolicy, persistableScope, policyFor } from "./cache-policy";
import { type Scheduler, defaultScheduler } from "./connection-pool";
import type { EventPersistence, PersistedEvent } from "./event-persistence";
import { compareEvents } from "./sorted-events";

const DB_NAME = "streets.v1";
const DB_VERSION = 1;
const EVENTS_STORE = "events";
const DELETIONS_STORE = "deletions";
const REPLACEABLE_INDEX = "replaceableKey";

/**
 * 書き込みをまとめる窓 (`profile-requests.ts` の `PROFILE_BATCH_MS` と同じ形)。
 * 起動直後のバーストで数百件が流れるため、1 件 1 トランザクションでは
 * 書き込みが描画を圧迫する (spec 7 節)。
 */
const PERSIST_BATCH_MS = 1000;

/** オブジェクトストアに実際に書く形。主キーは `id` (event.id)。 */
type StoredEventRecord = {
  id: string;
  event: PersistedEvent["event"];
  seenRelays: PersistedEvent["seenRelays"];
  fetchedAt: number;
  /**
   * `latest-per-author` の対象だけが持つ `${kind}:${pubkey}`。ストアの主キーは
   * event id なので、この索引が無いと「同じ著者の前の版」を探すのに全件走査
   * するしかない。
   */
  replaceableKey?: string;
};

/** `selectForPersistence` が書くと決めたエントリ 1 件。 */
export type RetainedEntry = {
  entry: PersistedEvent;
  replaceableKey: string;
};

/**
 * `policyFor(kind).retention` に基づき、このバッチの中で実際に書くエントリを
 * 選ぶ純関数。IndexedDB に触れないので、実装を差し替えずにユニットテストで
 * 固定できる —— retention の意味を確かめるのに DB を起動する必要が無い。
 *
 * `none` は書かず、`latest-per-author` は同一 `(kind, pubkey)` のうち
 * `compareEvents` の全順序で先頭に来るほう 1 件だけを残す (`sorted-events.ts`
 * と同じ順序を使うのは、2 つのファイルが「どちらが新しいか」で食い違わない
 * ようにするため)。`capped` はこのスライスで対象の kind が無く、
 * 実装しない代わりに投げる —— 将来ポリシー側に `capped` が現れたとき、
 * ここが未実装のまま静かに `none` 相当の挙動をするより早く気づける。
 *
 * `persistableScope` を先頭で通すのは、`retention` だけを見るループが
 * `scope: "account"`/`"session"` を無視してそのまま共有 DB へ書いてしまう
 * 穴を塞ぐため —— `shouldPersist`（kind 経由の同じ関数）と入口を共有する
 * ことで、「書いてよいか」の規則が 2 箇所に別々に存在する状態を作らない。
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
  // 新鮮と誤判定させてしまう (spec 12 節) —— 0 にして必ず取り直させる。
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
   * `indexedDB` の注入口 (テスト用)。既定は `globalThis.indexedDB`。
   * jsdom/Node のテスト環境には無いので、そのまま使うと自然に
   * 「IndexedDB が使えない」経路を通る。
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
      // 移行コードを書かない方針 (ADR-0019 Consequences)。バージョンを上げる
      // 将来の変更が「一部だけ新しいスキーマ」の中途半端な状態を残さないよう、
      // 既存ストアを必ず全部消してから作り直す。
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

const readAllDeletionIds = (db: IDBDatabase): Promise<string[]> =>
  new Promise((resolve) => {
    try {
      const tx = db.transaction(DELETIONS_STORE, "readonly");
      const request = tx.objectStore(DELETIONS_STORE).getAllKeys();
      request.onsuccess = () => {
        resolve(
          (request.result ?? []).filter(
            (key): key is string => typeof key === "string",
          ),
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
  deletionIds: readonly string[],
): Promise<void> =>
  new Promise((resolve) => {
    let tx: IDBTransaction;
    try {
      tx = db.transaction([EVENTS_STORE, DELETIONS_STORE], "readwrite");
    } catch {
      resolve();
      return;
    }
    // 書き込みの失敗は黙って捨てる (spec 12 節の表) —— 次回の起動が
    // 遅くなるだけで、アプリを止める理由にはならない。
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
    tx.onabort = () => resolve();

    const eventsStore = tx.objectStore(EVENTS_STORE);
    const deletionsStore = tx.objectStore(DELETIONS_STORE);
    const replaceableIndex = eventsStore.index(REPLACEABLE_INDEX);

    for (const { entry, replaceableKey } of retained) {
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
        // 同じ id への再書き込み (restamp) は上書きでよいが、別 id の古い版が
        // 残っていると「著者ごと最新1件」(ADR-0019) が破れ、ストアが
        // 見た版すべてを溜め込み続けることになる。
        if (
          existing.id === entry.event.id ||
          compareEvents(entry.event, existing.event) < 0
        ) {
          cursor.delete();
          eventsStore.put(record);
        }
      };
    }

    for (const id of deletionIds) {
      deletionsStore.put({ id });
    }
  });

/**
 * IndexedDB 版の `EventPersistence` (ADR-0018)。スキーマは spec 12 節のとおり
 * `streets.v1` / `events` (key: id) / `deletions` (key: id) / version 1。
 *
 * `load()` は決して reject しない —— IndexedDB はプライベートブラウジング・
 * 容量超過・ブラウザ設定で普通に失敗し、その失敗はキャッシュが無いのと
 * 同じであって、アプリが起動しない理由にはならない (spec 7 節)。
 */
export const createIndexedDbPersistence = (
  options: CreateIndexedDbPersistenceOptions = {},
): EventPersistence => {
  const scheduler = options.scheduler ?? defaultScheduler;
  const idb = options.indexedDB ?? globalThis.indexedDB;

  let disposed = false;
  let pendingEvents: PersistedEvent[] = [];
  let pendingDeletionIds: string[] = [];
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
    const deletionsToWrite = pendingDeletionIds;
    pendingDeletionIds = [];
    if (eventsToWrite.length === 0 && deletionsToWrite.length === 0) return;

    // `getDb()` は `openDatabase()` の内側で失敗を吸収しているので今日は
    // reject しないが、`.then` だけだと将来そこが崩れたときに補足されない
    // rejection を作ってしまう。ここでも黙って捨てる終端にしておく。
    void getDb()
      .then(async (db) => {
        if (!db || disposed) return;
        try {
          const retained = selectForPersistence(eventsToWrite);
          await writeBatch(db, retained, deletionsToWrite);
        } catch {
          // 黙って捨てる (spec 12 節)。
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
      // ここに try/catch を重ねない —— `getDb()` / `readAllEvents()` /
      // `readAllDeletionIds()` はいずれも内部で失敗を吸収し尽くしていて
      // 例外を外に出さない。ここで包むと決して発火しない catch が残り、
      // 「本当にどこで失敗を止めているか」を追うときの手がかりを 1 つ増やす。
      const db = await getDb();
      if (!db) return { events: [], deletedIds: [] };
      const [events, deletedIds] = await Promise.all([
        readAllEvents(db),
        readAllDeletionIds(db),
      ]);
      return { events, deletedIds };
    },

    save(entries) {
      if (disposed) return;
      pendingEvents.push(...entries);
      scheduleFlush();
    },

    saveDeletions(ids) {
      if (disposed) return;
      pendingDeletionIds.push(...ids);
      scheduleFlush();
    },

    dispose() {
      disposed = true;
      if (timer !== null) {
        scheduler.clearTimeout(timer);
        timer = null;
      }
      pendingEvents = [];
      pendingDeletionIds = [];
      openedDb?.close();
    },
  };
};
