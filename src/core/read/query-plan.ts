import type { RelayFilter, RelayUrl } from "../relay/relay-connection";

export type QueryPlan = {
  /** リレーごとに送るフィルタ。同じリレー向けのものはまとめられている */
  perRelay: Map<RelayUrl, RelayFilter[]>;
  /** write relay が分からず fallback に回した著者 (重複なし) */
  unroutableAuthors: string[];
  /**
   * 宣言はあるが、どこへも送られなかった著者 (重複なし)。予算切れと
   * 「宣言リレーが全部 degraded」の両方がここに来る。
   */
  uncoveredAuthors: string[];
};

export type PlanQueryOptions = {
  filters: RelayFilter[];
  /**
   * 著者 → 購読するリレー。**宣言があった著者だけ**が入る。空配列になるのは
   * 予算切れか、宣言リレーが全部 degraded だった場合 (`selectRelays` 参照)。
   */
  assignment: ReadonlyMap<string, readonly RelayUrl[]>;
  fallbackRelays: readonly RelayUrl[];
};

/**
 * 1 つの論理クエリを「リレーごとに担当著者の異なる N 本の実クエリ」へ分割する
 * (ADR-0005)。EventStore も RoutingTable も知らない純粋関数。
 *
 * 著者を指定していないフィルタはルーティングのしようがないので fallback へ送る。
 * これは「ルーティングできなかった著者」ではないので unroutableAuthors には
 * 数えない — 数えると incomplete が常時点灯して意味を失う。
 *
 * **重要：各リレー向けのフィルタは浅いコピーであり、ネストされた配列（kinds、#e など）
 * は呼び元や下流のコードで変更してはいけない。** 複数リレーが同じ配列インスタンスを
 * 参照しており、一つのリレーを変更すると他のリレーに影響する。
 */
export const planQuery = ({
  filters,
  assignment,
  fallbackRelays,
}: PlanQueryOptions): QueryPlan => {
  const perRelay = new Map<RelayUrl, RelayFilter[]>();
  const unroutable = new Set<string>();
  const uncovered = new Set<string>();

  const add = (relay: RelayUrl, filter: RelayFilter) => {
    const existing = perRelay.get(relay);
    if (existing) existing.push(filter);
    else perRelay.set(relay, [filter]);
  };

  for (const filter of filters) {
    const authors = filter.authors;

    if (!authors) {
      // authors 未指定 = 「誰でもいい」。正当な「どの著者でも」クエリなので
      // 従来どおり fallback へ同報する。
      for (const relay of fallbackRelays) add(relay, { ...filter });
      continue;
    }

    if (authors.length === 0) {
      // authors: [] は明示的に「誰にもマッチしない」クエリ。fallback の
      // 全リレーへ同報しても意味のある結果は絶対に返らず、無駄な接続を
      // 開くだけなので、このフィルタ自体を送らない。
      continue;
    }

    // リレー → そのリレーが担当する著者
    const byRelay = new Map<RelayUrl, string[]>();
    for (const author of authors) {
      const assigned = assignment.get(author);

      if (assigned === undefined) {
        // kind:10002 が引けていない。暫定的に fallback へ回す (ADR-0016)
        unroutable.add(author);
        for (const relay of fallbackRelays) {
          const bucket = byRelay.get(relay);
          if (bucket) bucket.push(author);
          else byRelay.set(relay, [author]);
        }
        continue;
      }

      if (assigned.length === 0) {
        // 予算で落ちた。fallback へ回すと予算を守った意味が無くなるので
        // どこへも送らず、欠落として報告する (ADR-0011)
        uncovered.add(author);
        continue;
      }

      for (const relay of assigned) {
        const bucket = byRelay.get(relay);
        if (bucket) bucket.push(author);
        else byRelay.set(relay, [author]);
      }
    }

    for (const [relay, relayAuthors] of byRelay) {
      add(relay, { ...filter, authors: relayAuthors });
    }
  }

  return {
    perRelay,
    unroutableAuthors: [...unroutable],
    uncoveredAuthors: [...uncovered],
  };
};
