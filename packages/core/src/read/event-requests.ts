import type { RelayUrl } from "../relay/relay-connection";
import { normalizeRelayUrl } from "../relay/relay-url";
import {
  type FetchRequest,
  createBatchedFetch,
  fetchRequest,
} from "./batched-fetch";
import { BOOTSTRAP_INDEXERS } from "./default-relays";
import type { EventStore } from "./event-store";
import type { Scheduler } from "./scheduler";
import type { SubscriptionManager } from "./subscription-manager";

/** 参照しているタグが教える、そのイベントの在りか。 */
export type EventHint = { relay?: RelayUrl; author?: string };

export type EventRequests = {
  /**
   * この id のイベントを要求する (取得済みなら何もしない)。既定のリレーと
   * ヒントのリレーへ聞き、無ければ作者の書き込みリレーへ聞き直す。
   */
  request(id: string, hint?: EventHint): void;
  /**
   * `id` を要求済みでバッチも片付いたのに `store` に無い、を表す (未要求
   * なら `false`)。`fetchOnce` は必ず解決するので取得中と区別できる。
   */
  isUnresolved(id: string): boolean;
  /** store が捨てたので、「見つからなかった」と言わずに取り直す。 */
  forget(ids: Iterable<string>): void;
  /**
   * バッチが片付く (`fetchOnce` 解決) たびに呼ばれるが、どの id かは
   * 通知しない。呼び出し側は自分の id を `store`/`isUnresolved` から引き直す。
   */
  subscribe(listener: () => void): () => void;
  /**
   * 直近バッチの `ids` 件数と観測史上の最大。1 バッチ = 1 フィルタ全件分
   * なので、これで NIP-11 の `max_message_length` 超過 (超えるとリレーが
   * 拒否し `isUnresolved` が原因不明のまま一斉に立つ) に迫っていないか分かる。
   */
  readonly lastBatchSize: number;
  readonly maxBatchSize: number;
  dispose(): void;
};

export type CreateEventRequestsOptions = {
  store: EventStore;
  manager: SubscriptionManager;
  /** バッチ窓のタイマー注入口 (テスト用)。既定は実タイマーで、読み取り層は実タイマーを直接掴まない規約に合わせる。 */
  scheduler?: Scheduler;
  /** 書き込みリレーが分からない作者の kind:10002 を聞く先。既定は `BOOTSTRAP_INDEXERS`。 */
  indexers?: readonly RelayUrl[];
};

/**
 * まとめる窓の長さ (200ms)。カラムが一度に描画する数十件の `<EventView>` が
 * ほぼ同時期に `request()` を呼ぶので、それらを 1 本の REQ にまとめる。
 */
export const EVENT_BATCH_MS = 200;

/**
 * 1 回のまとめ取りで聞くヒントのリレーの本数。明示したリレーは接続の枠に
 * 関係なく開かれるので、リポストが並ぶカラムでヒントの数だけ開かない。
 * 溢れた分も、作者の書き込みリレーへの聞き直しで拾える。
 */
const HINT_RELAYS = 4;
/** 1 人あたり、書き込みリレーのうち何本へ聞くか (プロフィールと同じ)。 */
const AUTHOR_RELAYS = 2;
const RELAY_LIST_KIND = 10002;
const HEX_64 = /^[0-9a-f]{64}$/;

type Item = { id: string; relays: Set<RelayUrl>; author?: string };

const addTo = <K, V>(map: Map<K, V[]>, key: K, value: V) => {
  const bucket = map.get(key);
  if (bucket) bucket.push(value);
  else map.set(key, [value]);
};

const byRelay = (ids: Map<RelayUrl, string[]>): FetchRequest[] =>
  [...ids].map(([relay, group]) => ({
    filters: [{ ids: group }],
    relays: [relay],
  }));

/**
 * 1 回目の行き先。全部を既定のリレーへ聞き、ヒントのあるものはヒントのリレーへも
 * 聞く。ヒントは多く指されたリレーから `HINT_RELAYS` 本まで。
 */
export const planFirstEventRound = (
  items: readonly Item[],
): { requests: FetchRequest[]; asked: Map<string, Set<RelayUrl>> } => {
  const asked = new Map<string, Set<RelayUrl>>();
  const byHint = new Map<RelayUrl, string[]>();
  for (const item of items) {
    for (const relay of item.relays) addTo(byHint, relay, item.id);
  }
  const hinted = new Map(
    [...byHint].sort((a, b) => b[1].length - a[1].length).slice(0, HINT_RELAYS),
  );
  for (const [relay, ids] of hinted) {
    for (const id of ids) {
      const set = asked.get(id) ?? new Set();
      set.add(relay);
      asked.set(id, set);
    }
  }
  return {
    requests: [
      { filters: [{ ids: items.map((item) => item.id) }] },
      ...byRelay(hinted),
    ],
    asked,
  };
};

/**
 * 聞き直しの行き先。作者の書き込みリレーのうち、1 回目で聞いていないものへ聞く。
 * 作者の書き込みリレーが分からないものは何も返さない (先に kind:10002 を取る)。
 */
export const planEventRetry = (
  missing: readonly Item[],
  asked: ReadonlyMap<string, ReadonlySet<RelayUrl>>,
  relaysFor: (pubkey: string) => readonly RelayUrl[] | undefined,
): FetchRequest[] => {
  const ids = new Map<RelayUrl, string[]>();
  for (const item of missing) {
    if (item.author === undefined) continue;
    const done = asked.get(item.id);
    for (const relay of relaysFor(item.author) ?? []) {
      if (!done?.has(relay)) addTo(ids, relay, item.id);
    }
  }
  return byRelay(ids);
};

/**
 * 関連イベント (返信元・引用先・リポスト対象) 要求のコアレッサ。
 * `isUnresolved` があるのは、返信元などは「読み込み中」と「見つからない
 * (削除・未着)」を画面で描き分ける必要があるため。
 */
export const createEventRequests = (
  options: CreateEventRequestsOptions,
): EventRequests => {
  const { manager, store } = options;
  const indexers = options.indexers ?? BOOTSTRAP_INDEXERS;
  /**
   * 要求済みでバッチが片付いた id。ここにあって store に無ければ
   * 「見つからなかった」と言い切れる。`request()` は再要求時にここから
   * 削除する —— スクロールアウト後の再マウントで同じ id が再要求されたとき、
   * 落とさないと前回の「見つからなかった」を返し続ける。
   */
  const settled = new Set<string>();
  /** 窓の中で同じ id が別のヒントで要求されたら、ヒントを足し合わせる。 */
  const pending = new Map<string, Item>();
  const relaysFor = (pubkey: string) =>
    manager.relaysForAuthor(pubkey, AUTHOR_RELAYS);
  const fetchAll = (requests: FetchRequest[]) =>
    Promise.all(requests.map((request) => fetchRequest(manager, request)));

  const fetchEvents = async (ids: string[]): Promise<void> => {
    const items = ids.flatMap((id) => {
      const item = pending.get(id);
      pending.delete(id);
      return item ? [item] : [];
    });
    // direct は「繋いだリレーだけを読む」設定なので、ヒントにも書き込みリレーにも聞かない。
    if (manager.readRouting.mode === "direct") {
      return fetchRequest(manager, { filters: [{ ids }] });
    }
    const first = planFirstEventRound(items);
    await fetchAll(first.requests);
    const missing = items.filter(
      (item) => item.author !== undefined && !store.get(item.id),
    );
    if (missing.length === 0) return;
    const unknown = [
      ...new Set(
        missing.flatMap((item) =>
          item.author !== undefined &&
          relaysFor(item.author) === undefined &&
          store.replaceableFetchedAt(RELAY_LIST_KIND, item.author) === undefined
            ? [item.author]
            : [],
        ),
      ),
    ];
    if (unknown.length > 0 && indexers.length > 0) {
      await fetchRequest(manager, {
        filters: [{ kinds: [RELAY_LIST_KIND], authors: unknown }],
        relays: [...indexers],
      });
      for (const author of unknown) {
        store.markReplaceableFetched(RELAY_LIST_KIND, author);
      }
    }
    await fetchAll(planEventRetry(missing, first.asked, relaysFor));
  };

  const batch = createBatchedFetch<string>({
    manager,
    scheduler: options.scheduler,
    batchWindowMs: EVENT_BATCH_MS,
    keyOf: (id) => id,
    fetch: fetchEvents,
    markFetched: (ids) => {
      for (const id of ids) settled.add(id);
    },
  });

  return {
    request(id, hint) {
      if (batch.disposed) return;
      // 既に EventStore にあるなら要求しない (無駄な REQ を作らない)。
      if (store.get(id)) return;
      settled.delete(id);
      const item = pending.get(id) ?? { id, relays: new Set() };
      const relay = hint?.relay && normalizeRelayUrl(hint.relay);
      // ローカルネットワークや、利用者が止めたリレーは、ヒントにあっても繋がない。
      if (relay && !manager.pool.isBlocked(relay)) item.relays.add(relay);
      if (hint?.author && HEX_64.test(hint.author)) item.author ??= hint.author;
      pending.set(id, item);
      batch.enqueue(id);
    },

    isUnresolved(id) {
      // store にあるなら解決済み。settled に入っていても、後から別経路
      // (カラムの購読など) で届いていることがある。
      return settled.has(id) && !store.get(id);
    },

    forget(ids) {
      for (const id of ids) settled.delete(id);
    },

    subscribe: batch.subscribe,
    get lastBatchSize() {
      return batch.lastBatchSize;
    },
    get maxBatchSize() {
      return batch.maxBatchSize;
    },
    dispose() {
      pending.clear();
      batch.dispose();
    },
  };
};
