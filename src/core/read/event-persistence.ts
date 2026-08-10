import type { NostrEvent } from "../nostr/event";
import type { RelayUrl } from "../relay/relay-connection";
import { shouldPersist } from "./cache-policy";

export type PersistedEvent = {
  event: NostrEvent;
  seenRelays: RelayUrl[];
  fetchedAt: number;
};

/**
 * IndexedDB とインメモリの 2 実装が共有する seam (ADR-0018)。
 * インメモリ側はテストを IndexedDB なしで走らせるための仮の代役ではなく、
 * それ自体が実在の実装 —— jsdom には IndexedDB が無い。
 */
export type EventPersistence = {
  /**
   * 起動時に 1 回だけ呼ばれる想定。**reject しない** —— IndexedDB は
   * プライベートブラウジング・容量超過・ブラウザ設定で普通に失敗し、
   * その失敗はキャッシュが無いのと同じであって、アプリが起動しない理由には
   * ならない。失敗した実装は空の結果を返す。
   */
  load(): Promise<{ events: PersistedEvent[]; deletedIds: readonly string[] }>;
  save(entries: readonly PersistedEvent[]): void;
  /** `kind:5` が指した対象 id。保持期間の対象にしない (ADR-0019)。 */
  saveDeletions(ids: readonly string[]): void;
  dispose(): void;
};

/**
 * テストと、永続化を望まない構成のための実装。IndexedDB と違って失敗し
 * 得ないので、`load()` が reject しない、という規約そのものはこちらでは
 * 検証できない (別に失敗を模す実装を要る)。
 *
 * `events`/`deletedIds` を id をキーにした Map/Set で持つのは、IndexedDB の
 * オブジェクトストアが id をキーに `put` する (同じ id への 2 度目の
 * `save` は上書きになる) のと同じ挙動をここでも再現するため —— 挙動が
 * 食い違うと、この実装で通ったテストが IndexedDB 実装では通らなくなる。
 */
export const createMemoryPersistence = (): EventPersistence => {
  const events = new Map<string, PersistedEvent>();
  const deletedIds = new Set<string>();
  let disposed = false;

  return {
    async load() {
      return { events: [...events.values()], deletedIds: [...deletedIds] };
    },

    save(entries) {
      if (disposed) return;
      // 書かない kind を落とすのは IndexedDB 実装と同じ責務。ここで
      // 素通しすると、`retention: none` の kind がこの実装でだけ残り、
      // 同じテストが 2 つの実装で違う結果を出す。
      for (const entry of entries) {
        if (!shouldPersist(entry.event.kind)) continue;
        events.set(entry.event.id, entry);
      }
    },

    saveDeletions(ids) {
      if (disposed) return;
      for (const id of ids) deletedIds.add(id);
    },

    dispose() {
      disposed = true;
    },
  };
};
