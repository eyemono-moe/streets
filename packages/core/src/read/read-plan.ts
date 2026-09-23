import type { RelayFilter, RelayUrl } from "../relay/relay-connection";
import type { ReadRouting } from "./read-routing";

type ReadRoutingMode = ReadRouting["mode"];

/** 読み取りに使うことにしたリレー 1 本と、使う理由。 */
export type ReadPlanRelay = {
  url: RelayUrl;
  /** このリレーから投稿を読むことにした人の数（書き込みリレーとして選ばれた分）。 */
  authors: number;
  /** リレーの設定が分からない人や、人を決めない読み取りのために読む既定のリレー。 */
  fallback: boolean;
  /** カラムや通知が名指ししたリレー。 */
  explicit: boolean;
};

/**
 * 全カラムの購読をまとめた接続計画。設定の画面に「実際にどこを読んでいるか」を
 * 見せるためのもので、購読そのものはこれを見ない。
 */
export type ReadPlan = {
  mode: ReadRoutingMode;
  /** 読む人の多い順。 */
  relays: ReadPlanRelay[];
  /** リレーの設定がまだ見つかっていないので、既定のリレーから読んでいる人。 */
  unroutableAuthors: number;
  /** 接続の上限や、宣言したリレーに繋がらないことで、どこからも読めていない人。 */
  uncoveredAuthors: number;
};

export type SectionPlanInput = {
  explicit: boolean;
  perRelay: ReadonlyMap<RelayUrl, readonly RelayFilter[]>;
  unroutableAuthors: readonly string[];
  uncoveredAuthors: readonly string[];
};

export const EMPTY_READ_PLAN: ReadPlan = {
  mode: "outbox",
  relays: [],
  unroutableAuthors: 0,
  uncoveredAuthors: 0,
};

/**
 * セクションごとの割り当てを、リレーごとの理由へ畳む。同じ人を複数のカラムが
 * 読んでいても 1 人と数える。
 */
export const summarizeReadPlan = (input: {
  mode: ReadRoutingMode;
  fallbackRelays: readonly RelayUrl[];
  sections: readonly SectionPlanInput[];
}): ReadPlan => {
  const fallbackSet = new Set(input.fallbackRelays);
  const rows = new Map<
    RelayUrl,
    { authors: Set<string>; fallback: boolean; explicit: boolean }
  >();
  const row = (url: RelayUrl) => {
    let current = rows.get(url);
    if (!current) {
      current = { authors: new Set(), fallback: false, explicit: false };
      rows.set(url, current);
    }
    return current;
  };
  const unroutable = new Set<string>();
  const uncovered = new Set<string>();

  for (const section of input.sections) {
    for (const author of section.unroutableAuthors) unroutable.add(author);
    for (const author of section.uncoveredAuthors) uncovered.add(author);
    const sectionUnroutable = new Set(section.unroutableAuthors);

    for (const [url, filters] of section.perRelay) {
      const current = row(url);
      if (section.explicit) {
        current.explicit = true;
        continue;
      }
      for (const filter of filters) {
        if (filter.authors === undefined) {
          // 人を決めない読み取りは、既定（direct なら読み込み）のリレーへ行く。
          if (input.mode === "outbox") current.fallback = true;
          continue;
        }
        for (const author of filter.authors) {
          if (input.mode === "outbox" && sectionUnroutable.has(author)) {
            if (fallbackSet.has(url)) current.fallback = true;
            continue;
          }
          current.authors.add(author);
        }
      }
    }
  }

  const relays = [...rows]
    .map(([url, current]) => ({
      url,
      authors: current.authors.size,
      fallback: current.fallback,
      explicit: current.explicit,
    }))
    .sort((a, b) => b.authors - a.authors || a.url.localeCompare(b.url));

  return {
    mode: input.mode,
    relays,
    unroutableAuthors: unroutable.size,
    uncoveredAuthors: uncovered.size,
  };
};

export const readPlanEqual = (a: ReadPlan, b: ReadPlan): boolean =>
  JSON.stringify(a) === JSON.stringify(b);
