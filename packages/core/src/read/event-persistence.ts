import type { NostrEvent } from "../nostr/event";
import type { RelayUrl } from "../relay/relay-connection";
import { shouldPersist } from "./cache-policy";

export type PersistedEvent = {
  event: NostrEvent;
  seenRelays: RelayUrl[];
  fetchedAt: number;
};

/**
 * IndexedDB とインメモリの 2 実装が共有する seam。インメモリ側はテスト用の
 * 代役ではなく実在の実装 —— jsdom には IndexedDB が無い。
 */
export type EventPersistence = {
  /**
   * 起動時に 1 回だけ呼ばれる想定。**reject しない** —— IndexedDB の失敗は
   * キャッシュが無いのと同じで、起動を止めない。失敗時は空の結果を返す。
   */
  load(): Promise<{ events: PersistedEvent[]; deletionRequests: NostrEvent[] }>;
  save(entries: readonly PersistedEvent[]): void;
  /** 検証済み kind:5 のイベント本体を由来ごと保存する。 */
  saveDeletionRequest(event: NostrEvent): void;
  /**
   * 指定した id のイベントレコードを消す (削除依頼用の `save/deleteDeletionRequest`
   * とは別物)。呼ばれるのは `EventStore.remove()` からだけ。
   */
  delete(ids: readonly string[]): void;
  /**
   * `saveDeletionRequest` で記録した kind:5 を取り除く。`EventStore.remove()`
   * が kind:5 を巻き戻すときだけ呼ばれ、忘れると自分の投稿だけ消え続ける。
   */
  deleteDeletionRequest(id: string): void;
  dispose(): void;
};

/**
 * テストと永続化不要な構成向けの実装。id キーの Map で持つのは IndexedDB
 * の `put` 上書き挙動を再現するため —— 挙動が違うとテストが実装間で割れる。
 */
export const createMemoryPersistence = (): EventPersistence => {
  const events = new Map<string, PersistedEvent>();
  const deletionRequests = new Map<string, NostrEvent>();
  let disposed = false;

  return {
    async load() {
      return {
        events: [...events.values()],
        deletionRequests: [...deletionRequests.values()],
      };
    },

    save(entries) {
      if (disposed) return;
      // `shouldPersist` で IndexedDB 実装と同じ `persistableScope` を通す
      // —— 書かないはずの kind がこの実装でだけ残ると、テストが実装間で割れる。
      for (const entry of entries) {
        if (!shouldPersist(entry.event.kind)) continue;
        events.set(entry.event.id, entry);
      }
    },

    saveDeletionRequest(event) {
      if (disposed) return;
      deletionRequests.set(event.id, event);
    },

    delete(ids) {
      if (disposed) return;
      for (const id of ids) events.delete(id);
    },

    deleteDeletionRequest(id) {
      if (disposed) return;
      deletionRequests.delete(id);
    },

    dispose() {
      disposed = true;
    },
  };
};
