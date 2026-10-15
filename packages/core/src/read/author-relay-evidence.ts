import type { RelayFilter, RelayUrl } from "../relay/relay-connection";

/** 同じ人について、別のリレーが返したのにこのリレーが返さなかった投稿がこの数に達したら外す。 */
export const MISSES_TO_DEMOTE = 2;

/** 1 本のリレーへ送った 1 回の REQ と、EOSE までに返ってきたもの。 */
type RelayRound = {
  /** 送ったフィルタに名指しした人。 */
  authors: ReadonlySet<string>;
  since: number | undefined;
  /** EOSE までに返ってきたイベント。id → 人と時刻。 */
  events: Map<string, { author: string; createdAt: number }>;
  done: boolean;
};

export type RelayMiss = { author: string; relay: RelayUrl; id: string };

const roundFor = (filters: readonly RelayFilter[]): RelayRound => {
  const authors = new Set<string>();
  let since: number | undefined;
  for (const filter of filters) {
    for (const author of filter.authors ?? []) authors.add(author);
    if (filter.since !== undefined) {
      since =
        since === undefined ? filter.since : Math.max(since, filter.since);
    }
  }
  return { authors, since, events: new Map(), done: false };
};

/**
 * このリレーが読み終えたと言える範囲のいちばん古い時刻。返したイベントのうち最も古いもの
 * より前は、`limit` で切られたか、リレーが自分の上限で切ったのかもしれず、持っていない
 * とは言えない。`limit` と返した件数で切られたかを判断しないのは、リレーが要求より小さい
 * 上限で黙って切ることがあるため。1 件も返さなかったなら、`since` から後の全部が範囲。
 */
const floorOf = (round: RelayRound): number => {
  let oldest = Number.POSITIVE_INFINITY;
  for (const { createdAt } of round.events.values()) {
    oldest = Math.min(oldest, createdAt);
  }
  const since = round.since ?? Number.NEGATIVE_INFINITY;
  return Number.isFinite(oldest) ? Math.max(oldest, since) : since;
};

/** `missing` が読み終えた範囲にあり、`other` が返したのに `missing` が返さなかった投稿。 */
const missesBetween = (
  missingUrl: RelayUrl,
  missing: RelayRound,
  other: RelayRound,
): RelayMiss[] => {
  const floor = floorOf(missing);
  const misses: RelayMiss[] = [];
  for (const [id, { author, createdAt }] of other.events) {
    if (!missing.authors.has(author)) continue;
    if (createdAt < floor) continue;
    if (missing.events.has(id)) continue;
    misses.push({ author, relay: missingUrl, id });
  }
  return misses;
};

/**
 * 1 つのセクションが同じ人を複数のリレーから読んだとき、その答えを突き合わせる。
 * EOSE までに届いたもの（過去の投稿）だけを比べる —— EOSE の後に流れてくる投稿は、
 * 届く速さがリレーごとに違うだけで、取りこぼしとは言えない。
 */
export class SectionRelayRounds {
  readonly #rounds = new Map<RelayUrl, RelayRound>();

  /** REQ を送った（送り直した）。前の回の答えは捨てる。 */
  sent(relay: RelayUrl, filters: readonly RelayFilter[]): void {
    this.#rounds.set(relay, roundFor(filters));
  }

  received(relay: RelayUrl, id: string, author: string, createdAt: number) {
    const round = this.#rounds.get(relay);
    if (!round || round.done) return;
    round.events.set(id, { author, createdAt });
  }

  /** このリレーが読み終えた。読み終えている他のリレーと突き合わせ、取りこぼしを返す。 */
  completed(relay: RelayUrl): RelayMiss[] {
    const round = this.#rounds.get(relay);
    if (!round || round.done) return [];
    round.done = true;
    const misses: RelayMiss[] = [];
    for (const [otherUrl, other] of this.#rounds) {
      if (otherUrl === relay || !other.done) continue;
      misses.push(...missesBetween(relay, round, other));
      misses.push(...missesBetween(otherUrl, other, round));
    }
    return misses;
  }

  closed(relay: RelayUrl): void {
    this.#rounds.delete(relay);
  }
}

/** 人とリレーの組ごとに取りこぼしを数え、続いた組を候補から外す。 */
export class AuthorRelayEvidence {
  readonly #missed = new Map<string, Map<RelayUrl, Set<string>>>();
  readonly #demoted = new Map<string, Set<RelayUrl>>();

  /** 取りこぼしを数える。新しく外した組があれば true。 */
  record(misses: readonly RelayMiss[]): boolean {
    let changed = false;
    for (const { author, relay, id } of misses) {
      if (this.#demoted.get(author)?.has(relay)) continue;
      let byRelay = this.#missed.get(author);
      if (!byRelay) {
        byRelay = new Map();
        this.#missed.set(author, byRelay);
      }
      let ids = byRelay.get(relay);
      if (!ids) {
        ids = new Set();
        byRelay.set(relay, ids);
      }
      ids.add(id);
      if (ids.size >= MISSES_TO_DEMOTE) {
        let demoted = this.#demoted.get(author);
        if (!demoted) {
          demoted = new Set();
          this.#demoted.set(author, demoted);
        }
        demoted.add(relay);
        byRelay.delete(relay);
        changed = true;
      }
    }
    return changed;
  }

  /**
   * その人が書き込みに使うと宣言したリレーから、外した組を除く。全部外れたら除かない
   * —— 読める先が 0 本になるより、取りこぼすリレーからでも読む方がよい。
   */
  usable(author: string, declared: readonly RelayUrl[]): readonly RelayUrl[] {
    const demoted = this.#demoted.get(author);
    if (!demoted || demoted.size === 0) return declared;
    const kept = declared.filter((url) => !demoted.has(url));
    return kept.length > 0 ? kept : declared;
  }

  /** 外した組。Devtools に出す。 */
  get demoted(): { author: string; relay: RelayUrl }[] {
    return [...this.#demoted].flatMap(([author, relays]) =>
      [...relays].map((relay) => ({ author, relay })),
    );
  }
}
