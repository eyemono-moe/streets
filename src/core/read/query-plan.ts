import type { RelayFilter, RelayUrl } from "../relay/relay-connection";

export type QueryPlan = {
  /** リレーごとに送るフィルタ。同じリレー向けのものはまとめられている */
  perRelay: Map<RelayUrl, RelayFilter[]>;
  /** write relay が分からず fallback に回した著者 (重複なし) */
  unroutableAuthors: string[];
};

export type PlanQueryOptions = {
  filters: RelayFilter[];
  writeRelaysFor: (pubkey: string) => RelayUrl[];
  fallbackRelays: readonly RelayUrl[];
};

/**
 * 1 つの論理クエリを「リレーごとに担当著者の異なる N 本の実クエリ」へ分割する
 * (ADR-0005)。EventStore も RoutingTable も知らない純粋関数。
 *
 * 著者を指定していないフィルタはルーティングのしようがないので fallback へ送る。
 * これは「ルーティングできなかった著者」ではないので unroutableAuthors には
 * 数えない — 数えると incomplete が常時点灯して意味を失う。
 */
export const planQuery = ({
  filters,
  writeRelaysFor,
  fallbackRelays,
}: PlanQueryOptions): QueryPlan => {
  const perRelay = new Map<RelayUrl, RelayFilter[]>();
  const unroutable = new Set<string>();

  const add = (relay: RelayUrl, filter: RelayFilter) => {
    const existing = perRelay.get(relay);
    if (existing) existing.push(filter);
    else perRelay.set(relay, [filter]);
  };

  for (const filter of filters) {
    const authors = filter.authors;

    if (!authors || authors.length === 0) {
      for (const relay of fallbackRelays) add(relay, filter);
      continue;
    }

    // リレー → そのリレーが担当する著者
    const byRelay = new Map<RelayUrl, string[]>();
    for (const author of authors) {
      const relays = writeRelaysFor(author);
      if (relays.length === 0) {
        unroutable.add(author);
        for (const relay of fallbackRelays) {
          const bucket = byRelay.get(relay);
          if (bucket) bucket.push(author);
          else byRelay.set(relay, [author]);
        }
        continue;
      }
      for (const relay of relays) {
        const bucket = byRelay.get(relay);
        if (bucket) bucket.push(author);
        else byRelay.set(relay, [author]);
      }
    }

    for (const [relay, relayAuthors] of byRelay) {
      add(relay, { ...filter, authors: relayAuthors });
    }
  }

  return { perRelay, unroutableAuthors: [...unroutable] };
};
