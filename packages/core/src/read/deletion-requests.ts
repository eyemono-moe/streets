import type { NostrEvent } from "../nostr/event";
import type { RelayFilter, RelayUrl } from "../relay/relay-connection";
import { createBatchedFetch, fetchRequest } from "./batched-fetch";
import type { EventStore } from "./event-store";
import type { Scheduler } from "./scheduler";
import { relaysSeenOn } from "./seen-relays";
import type { SubscriptionManager } from "./subscription-manager";

const DELETION_KIND = 5;
const HEX_64 = /^[0-9a-f]{64}$/;

export type DeletionRequests = {
  /**
   * この投稿に向けた削除依頼（kind:5）を、投稿を取ったリレーから取りにいく。
   * 要求済みなら何もしない。届いた削除依頼は EventStore が当て、表示から外す。
   */
  request(event: NostrEvent): void;
  /** store が投稿を捨てたので、次に描かれたら取り直す。 */
  forget(ids: Iterable<string>): void;
  dispose(): void;
};

export type CreateDeletionRequestsOptions = {
  store: Pick<EventStore, "seenRelays">;
  manager: SubscriptionManager;
  scheduler?: Scheduler;
};

/** `engagement-requests.ts` と同じ窓。同時に描かれた投稿をまとめて取る。 */
const DELETION_BATCH_MS = 200;

const isAddressableKind = (kind: number): boolean =>
  kind >= 30_000 && kind < 40_000;

const coordinate = (event: NostrEvent): string =>
  `${event.kind}:${event.pubkey}:${event.tags.find((tag) => tag[0] === "d")?.[1] ?? ""}`;

/**
 * ふつうのカラムは kind:5 を求めないので、描いた投稿ごとに削除依頼を取りにいく。
 * kind:5 をすべて購読すると帯域が際限なく伸びるため、描いた投稿の id・座標と著者で
 * 絞る。投稿の行き先は投稿ごとに違うので 1 本の REQ には束ねず、投稿を取ったリレー
 * ごとに 1 本ずつ送る。削除依頼は投稿と同じリレーへ送られるのがふつうなので、
 * ほかのリレーは見ない。
 */
export const createDeletionRequests = (
  options: CreateDeletionRequestsOptions,
): DeletionRequests => {
  // 削除依頼が無い投稿は store に跡が残らず、取りにいったかを言い当てられない。
  const requested = new Set<string>();
  const batch = createBatchedFetch<NostrEvent>({
    manager: options.manager,
    scheduler: options.scheduler,
    batchWindowMs: DELETION_BATCH_MS,
    keyOf: (event) => event.id,
    fetch: async (events) => {
      // 取ったリレーが分からない投稿（自分で書いたばかりで `local` の印しか無いものなど）は既定のリレーへ。
      const byRelay = new Map<RelayUrl | undefined, NostrEvent[]>();
      for (const event of events) {
        const relays = relaysSeenOn(options.store, event.id);
        for (const relay of relays.length > 0 ? relays : [undefined]) {
          const group = byRelay.get(relay) ?? [];
          group.push(event);
          byRelay.set(relay, group);
        }
      }
      await Promise.all(
        [...byRelay].map(([relay, group]) =>
          fetchRequest(options.manager, {
            filters: deletionFilters(group),
            ...(relay === undefined ? {} : { relays: [relay] }),
          }),
        ),
      );
    },
  });

  return {
    request(event) {
      if (batch.disposed || event.kind === DELETION_KIND) return;
      // 書きかけのプレビューは、まだ id を持たない。
      if (!HEX_64.test(event.id) || requested.has(event.id)) return;
      requested.add(event.id);
      batch.enqueue(event);
    },
    forget(ids) {
      for (const id of ids) requested.delete(id);
    },
    dispose() {
      requested.clear();
      batch.dispose();
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
