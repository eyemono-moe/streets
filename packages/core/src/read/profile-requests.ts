import type { RelayUrl } from "../relay/relay-connection";
import type { RequestOptions } from "./address-requests";
import {
  type FetchRequest,
  createBatchedFetch,
  fetchRequest,
} from "./batched-fetch";
import { isStale, policyFor } from "./cache-policy";
import { BOOTSTRAP_INDEXERS } from "./default-relays";
import type { EventStore } from "./event-store";
import { type Scheduler, defaultScheduler } from "./scheduler";
import type { SubscriptionManager } from "./subscription-manager";

const PROFILE_KIND = 0;
const RELAY_LIST_KIND = 10002;
/** 1 人あたり、書き込みリレーのうち何本へ聞くか。 */
const AUTHOR_RELAYS = 2;
const HEX_64 = /^[0-9a-f]{64}$/;

export type ProfileRequests = {
  /**
   * この pubkey のプロフィールを要求する。取ってから古くなっていなければ何もしない。
   * `refresh` なら古さに関係なく取り直す。
   */
  request(pubkey: string, options?: RequestOptions): void;
  /**
   * バッチが 1 本片付く (= `fetchOnce` が解決する) たびに呼ばれる。どの
   * pubkey が解決したかは通知しない —— `<Profile>` は自分の pubkey を
   * `store` から引き直せば済む。ポーリングを持たないため push 形にしてある。
   */
  subscribe(listener: () => void): () => void;
  /**
   * 直近バッチの `authors` 件数と観測史上の最大。1 バッチ = 1 フィルタ全件分
   * なので、これで NIP-11 の `max_message_length` 超過に迫っていないか分かる。
   * 超えるとリレーが拒否し、プロフィールが 1 つも届かず原因も分からなくなる。
   */
  readonly lastBatchSize: number;
  readonly maxBatchSize: number;
  dispose(): void;
};

export type CreateProfileRequestsOptions = {
  store: EventStore;
  manager: SubscriptionManager;
  /**
   * バッチ窓のタイマー注入口 (テスト用)。既定は実タイマー —— 読み取り層は
   * どこであれ実タイマーを直接掴まない規約。
   */
  scheduler?: Scheduler;
  /** 書き込みリレーが分からない人の kind:10002 と kind:0 を聞く先。既定は `BOOTSTRAP_INDEXERS`。 */
  indexers?: readonly RelayUrl[];
};

/** `fetchOnce` に行き先を渡さない（既定のリレーへ聞く）ことを表す行き先。URL とは重ならない。 */
const DEFAULT_RELAYS = "default";

export type ProfileRound = {
  requests: FetchRequest[];
  /** 著者ごとに、これまでに聞いた行き先。聞き直しで同じ先へ重ねないために持ち回る。 */
  asked: Map<string, Set<RelayUrl>>;
};

export type PlanProfileRoundOptions = {
  /** その人の書き込みリレーのうち聞く先。分からない人は `undefined`。 */
  relaysFor: (pubkey: string) => readonly RelayUrl[] | undefined;
  indexers: readonly RelayUrl[];
};

const toRequests = (byRelayUrl: Map<RelayUrl, string[]>): FetchRequest[] =>
  [...byRelayUrl].map(([target, authors]) => ({
    filters: [{ kinds: [PROFILE_KIND], authors }],
    ...(target === DEFAULT_RELAYS ? {} : { relays: [target] }),
  }));

const addTo = (
  byRelayUrl: Map<RelayUrl, string[]>,
  target: RelayUrl,
  author: string,
) => {
  const bucket = byRelayUrl.get(target);
  if (bucket) bucket.push(author);
  else byRelayUrl.set(target, [author]);
};

/**
 * 1 回目の行き先。書き込みリレーが分かる人はそこへだけ聞く。分からない人は既定の
 * リレーへ聞き、インデクサへは kind:10002 と kind:0 をまとめて聞く —— kind:10002
 * が届けば、2 回目でその人の書き込みリレーへ聞き直せる。
 */
export const planFirstProfileRound = (
  authors: readonly string[],
  { relaysFor, indexers }: PlanProfileRoundOptions,
): ProfileRound => {
  const byRelayUrl = new Map<RelayUrl, string[]>();
  const asked = new Map<string, Set<RelayUrl>>();
  for (const author of authors) {
    const relays = relaysFor(author);
    if (relays === undefined) {
      addTo(byRelayUrl, DEFAULT_RELAYS, author);
      asked.set(author, new Set([DEFAULT_RELAYS, ...indexers]));
    } else {
      for (const relay of relays) addTo(byRelayUrl, relay, author);
      asked.set(author, new Set(relays));
    }
  }
  const requests = toRequests(byRelayUrl);
  const unrouted = byRelayUrl.get(DEFAULT_RELAYS);
  if (unrouted && indexers.length > 0) {
    requests.push({
      filters: [
        { kinds: [PROFILE_KIND, RELAY_LIST_KIND], authors: [...unrouted] },
      ],
      relays: [...indexers],
    });
  }
  return { requests, asked };
};

/**
 * 1 回目で見つからなかった人の聞き直し。まだ聞いていない書き込みリレー（1 回目の後に
 * kind:10002 が届いた人など）があればそこへ、無ければ既定のリレーへ聞く。書き込み
 * リレーが kind:0 を持っていない人や、接続の枠が足りず開けなかった人は後者になる。
 */
export const planProfileRetry = (
  missing: readonly string[],
  asked: ReadonlyMap<string, ReadonlySet<RelayUrl>>,
  { relaysFor }: Pick<PlanProfileRoundOptions, "relaysFor">,
): FetchRequest[] => {
  const byRelayUrl = new Map<RelayUrl, string[]>();
  for (const author of missing) {
    const done = asked.get(author) ?? new Set<RelayUrl>();
    const fresh = (relaysFor(author) ?? []).filter((url) => !done.has(url));
    if (fresh.length > 0) {
      for (const relay of fresh) addTo(byRelayUrl, relay, author);
    } else if (!done.has(DEFAULT_RELAYS)) {
      addTo(byRelayUrl, DEFAULT_RELAYS, author);
    }
  }
  return toRequests(byRelayUrl);
};

/**
 * まとめる窓の長さ。`NOTIFY_BATCH_MS` (16ms) とは目的が違うので揃えない ——
 * 短すぎると窓の開閉がイベント数に逆戻りし、長すぎると体感が遅れるため
 * 200ms でバランスを取る。
 */
const PROFILE_BATCH_MS = 200;

/**
 * プロフィール要求のコアレッサ。`<Profile>` はマウントごとに 1 件ずつ
 * `request(x)` を呼ぶ —— カラム単位で著者集合を購読する設計は採らない
 * (`items` が変わるたびに派生集合の識別子が変わり、購読を張り直すため)。
 */
export const createProfileRequests = (
  options: CreateProfileRequestsOptions,
): ProfileRequests => {
  const scheduler = options.scheduler ?? defaultScheduler;
  const { manager, store } = options;
  const indexers = options.indexers ?? BOOTSTRAP_INDEXERS;
  const relaysFor = (pubkey: string) =>
    manager.relaysForAuthor(pubkey, AUTHOR_RELAYS);
  const fetchAll = (requests: FetchRequest[]) =>
    Promise.all(requests.map((request) => fetchRequest(manager, request)));

  const fetchProfiles = async (authors: string[]): Promise<void> => {
    // direct は「繋いだリレーだけを読む」設定なので、インデクサにも書き込みリレーにも聞かない。
    if (manager.readRouting.mode === "direct") {
      await fetchRequest(manager, {
        filters: [{ kinds: [PROFILE_KIND], authors }],
      });
      return;
    }
    const first = planFirstProfileRound(authors, { relaysFor, indexers });
    await fetchAll(first.requests);
    const missing = authors.filter(
      (author) => !store.latestReplaceable(PROFILE_KIND, author),
    );
    if (missing.length === 0) return;
    await fetchAll(planProfileRetry(missing, first.asked, { relaysFor }));
  };

  const batch = createBatchedFetch<string>({
    manager,
    scheduler,
    batchWindowMs: PROFILE_BATCH_MS,
    keyOf: (pubkey) => pubkey,
    fetch: fetchProfiles,
    markFetched: (authors) => {
      for (const author of authors) {
        options.store.markReplaceableFetched(PROFILE_KIND, author);
      }
    },
  });

  return {
    request(pubkey, requestOptions) {
      // 公開鍵でない値を著者に入れると、リレーは束ねたほかの人の分ごと断る。
      if (!HEX_64.test(pubkey)) return;
      // 既に新鮮なら要求しない。`fetchedAt` が無い (未取得) なら isStale を呼ぶまでもなく要求する。
      const fetchedAt = options.store.replaceableFetchedAt(
        PROFILE_KIND,
        pubkey,
      );
      if (
        !requestOptions?.refresh &&
        fetchedAt !== undefined &&
        !isStale(policyFor(PROFILE_KIND), fetchedAt, scheduler.now())
      ) {
        return;
      }
      // 取りにいっている最中なら重ねない。返事を待つ間は取った時刻がまだ更新されない。
      if (batch.isInflight(pubkey)) return;
      batch.enqueue(pubkey);
    },
    subscribe: batch.subscribe,
    get lastBatchSize() {
      return batch.lastBatchSize;
    },
    get maxBatchSize() {
      return batch.maxBatchSize;
    },
    dispose: batch.dispose,
  };
};
