import type { NostrEvent } from "../nostr/event";
import type { RelayFilter, RelayUrl } from "../relay/relay-connection";
import { type Scheduler, defaultScheduler } from "./connection-pool";
import type { EventStore } from "./event-store";
import type { SubscriptionManager } from "./subscription-manager";

const DELETION_KIND = 5;
const HEX_64 = /^[0-9a-f]{64}$/;

export type DeletionRequests = {
  /**
   * この投稿に向けた削除依頼（kind:5）を、投稿を取ったリレーから取りにいく。
   * 要求済みなら何もしない。届いた削除依頼は EventStore が当て、表示から外す。
   */
  request(event: NostrEvent): void;
  dispose(): void;
};

export type CreateDeletionRequestsOptions = {
  store: Pick<EventStore, "seenRelays">;
  manager: Pick<SubscriptionManager, "fetchOnce">;
  scheduler?: Scheduler;
};

/** `engagement-requests.ts` と同じ窓。同時に描かれた投稿をまとめて 1 回で取る。 */
const DELETION_BATCH_MS = 200;

const isAddressableKind = (kind: number): boolean =>
  kind >= 30_000 && kind < 40_000;

const coordinate = (event: NostrEvent): string =>
  `${event.kind}:${event.pubkey}:${event.tags.find((tag) => tag[0] === "d")?.[1] ?? ""}`;

/**
 * ふつうのカラムは kind:5 を求めないので、表示した投稿ごとに削除依頼を取りにいく。
 * kind:5 をすべて購読すると帯域が際限なく伸びるため、描いた投稿の id・座標と著者で
 * 絞り、投稿を取ったリレーごとに 1 本の REQ へまとめる。削除依頼は投稿と同じリレーへ
 * 送られるのがふつうなので、ほかのリレーは見ない。
 */
export const createDeletionRequests = (
  options: CreateDeletionRequestsOptions,
): DeletionRequests => {
  const scheduler = options.scheduler ?? defaultScheduler;
  let pending: NostrEvent[] = [];
  // 刈り込まない。削除依頼が無い投稿は store に跡が残らず、取りにいったかを言い当てられない。
  let requested = new Set<string>();
  let timer: ReturnType<Scheduler["setTimeout"]> | null = null;
  let disposed = false;

  const flush = (): void => {
    timer = null;
    const events = pending;
    pending = [];

    // 取ったリレーが分からない投稿（自分で書いたばかりのものなど）は既定のリレーへ。
    const byRelay = new Map<RelayUrl | undefined, NostrEvent[]>();
    for (const event of events) {
      const relays = options.store.seenRelays(event.id);
      for (const relay of relays.length > 0 ? relays : [undefined]) {
        const group = byRelay.get(relay) ?? [];
        group.push(event);
        byRelay.set(relay, group);
      }
    }

    for (const [relay, group] of byRelay) {
      void options.manager.fetchOnce(
        deletionFilters(group),
        relay === undefined ? undefined : { relays: [relay] },
      );
    }
  };

  return {
    request(event) {
      if (disposed || event.kind === DELETION_KIND) return;
      // 書きかけのプレビューは、まだ id を持たない。
      if (!HEX_64.test(event.id)) return;
      if (requested.has(event.id)) return;
      requested.add(event.id);
      pending.push(event);
      if (timer === null) {
        timer = scheduler.setTimeout(flush, DELETION_BATCH_MS);
      }
    },

    dispose() {
      disposed = true;
      if (timer !== null) {
        scheduler.clearTimeout(timer);
        timer = null;
      }
      pending = [];
      requested = new Set();
    },
  };
};

/** 著者でも絞る。削除依頼は著者のものしか効かないので、ほかの人の kind:5 は運ばせない。 */
const deletionFilters = (events: readonly NostrEvent[]): RelayFilter[] => {
  const filters: RelayFilter[] = [
    {
      kinds: [DELETION_KIND],
      authors: [...new Set(events.map((event) => event.pubkey))],
      "#e": events.map((event) => event.id),
    },
  ];
  const addressable = events.filter((event) => isAddressableKind(event.kind));
  if (addressable.length > 0) {
    filters.push({
      kinds: [DELETION_KIND],
      authors: [...new Set(addressable.map((event) => event.pubkey))],
      "#a": [...new Set(addressable.map(coordinate))],
    });
  }
  return filters;
};
