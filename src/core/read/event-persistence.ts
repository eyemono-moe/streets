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
  load(): Promise<{ events: PersistedEvent[]; deletionRequests: NostrEvent[] }>;
  save(entries: readonly PersistedEvent[]): void;
  /** 検証済み kind:5 のイベント本体を由来ごと保存する (ADR-0019)。 */
  saveDeletionRequest(event: NostrEvent): void;
  /**
   * 指定した id (通常のイベントの id) を永続層から取り除く。削除依頼用の
   * `saveDeletionRequest`/`deleteDeletionRequest` (どちらも `deletions` ストアを
   * 触る) とは**別物**であり、
   * 混同しないこと —— こちらは「この id のイベントレコードそのものを消す」。
   *
   * 呼ばれるのは `EventStore.remove()` からだけ。
   */
  delete(ids: readonly string[]): void;
  /**
   * `saveDeletionRequest` で記録した kind:5 を `deletions` ストアから取り除く ——
   * 「削除指示を出したこと自体を無かったことにする」。`delete` (通常の
   * イベントレコードを消す) とは**別物**であり、混同しないこと。
   *
   * 呼ばれるのは `EventStore.remove()` が kind:5 を巻き戻すときだけ。
   * ここを呼び忘れると、publish が全リレーで失敗して kind:5 を巻き戻しても
   * `deletions` の記録だけが残り、`hydrate` が次回起動のたびに対象 id を
   * 弾き続ける —— 「どのリレーにも届きませんでした」と表示されたのに、
   * 本人の投稿だけがローカルで消え続ける不整合になる。
   */
  deleteDeletionRequest(id: string): void;
  dispose(): void;
};

/**
 * テストと、永続化を望まない構成のための実装。IndexedDB と違って失敗し
 * 得ないので、`load()` が reject しない、という規約そのものはこちらでは
 * 検証できない (別に失敗を模す実装を要る)。
 *
 * `events`/`deletionRequests` を id をキーにした Map で持つのは、IndexedDB の
 * オブジェクトストアが id をキーに `put` する (同じ id への 2 度目の
 * `save` は上書きになる) のと同じ挙動をここでも再現するため —— 挙動が
 * 食い違うと、この実装で通ったテストが IndexedDB 実装では通らなくなる。
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
      // `shouldPersist` は IndexedDB 実装 (`selectForPersistence`) と同じ
      // `persistableScope` を通る。ここで素通しすると、書かないはずの kind が
      // この実装でだけ残り、同じテストが 2 つの実装で違う結果を出す。
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
