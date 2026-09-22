import type { NostrEvent } from "../nostr/event";
import type { RelayListEntry } from "../read/relay-list";
import type { RelayUrl } from "../relay/relay-connection";
import { normalizeRelayUrl } from "../relay/relay-url";

/** NIP-66 のリレーの計測結果（kind:30166）。 */
export const RELAY_DISCOVERY_KIND = 30166;

/**
 * NIP-66 の計測結果が置かれているリレー。計測する側（モニター）が公開する
 * 場所で、著者を決めない問い合わせなので Outbox では行き先を決められない。
 * このリストは半年で腐る前提で扱うこと。
 */
export const RELAY_MONITOR_RELAYS: readonly RelayUrl[] = [
  "wss://relay.nostr.watch/",
  "wss://relaypag.es/",
];

/** 計測結果を問い合わせる候補の数。ページを開くたびに 1 回だけ、この数の `#d` で聞く。 */
export const RECOMMENDATION_CANDIDATES = 30;

/**
 * Streets がリレーに頼る NIP。投稿の読み書き（1）、削除（9）、
 * リレーが自分について答える（11）。
 */
export const STREETS_RELAY_NIPS: readonly number[] = [1, 9, 11];

export type RelayDiscovery = {
  url: RelayUrl;
  /** 接続するまでの時間（ms）。 */
  rttOpen?: number;
  /** 読み取りに答えるまでの時間（ms）。 */
  rttRead?: number;
  /** 対応していると計測された NIP。空なら分からない。 */
  nips: number[];
  /** 書き込みに支払いが要る。 */
  payment?: boolean;
  /** 読み書きの前に認証（NIP-42）が要る。 */
  auth?: boolean;
  measuredAt: number;
};

const numberTag = (event: NostrEvent, name: string): number | undefined => {
  const value = event.tags.find((tag) => tag[0] === name)?.[1];
  if (value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
};

const requirement = (event: NostrEvent, name: string): boolean | undefined => {
  for (const tag of event.tags) {
    if (tag[0] !== "R") continue;
    if (tag[1] === name) return true;
    if (tag[1] === `!${name}`) return false;
  }
  return undefined;
};

/** kind:30166 を読む。`d` がリレーの URL として読めなければ捨てる。 */
export const parseRelayDiscovery = (
  event: NostrEvent,
): RelayDiscovery | undefined => {
  if (event.kind !== RELAY_DISCOVERY_KIND) return undefined;
  const d = event.tags.find((tag) => tag[0] === "d")?.[1];
  const url = d ? normalizeRelayUrl(d) : undefined;
  if (!url) return undefined;
  const nips = [
    ...new Set(
      event.tags
        .filter((tag) => tag[0] === "N")
        .map((tag) => Number(tag[1]))
        .filter((nip) => Number.isInteger(nip) && nip >= 0),
    ),
  ].sort((a, b) => a - b);
  return {
    url,
    rttOpen: numberTag(event, "rtt-open"),
    rttRead: numberTag(event, "rtt-read"),
    nips,
    payment: requirement(event, "payment"),
    auth: requirement(event, "auth"),
    measuredAt: event.created_at,
  };
};

/**
 * 同じリレーについての計測を 1 つにする。いちばん新しい計測を使う ——
 * 古い計測では落ちていたリレーが直っていることがある。
 */
export const latestDiscoveries = (
  events: readonly NostrEvent[],
): Map<RelayUrl, RelayDiscovery> => {
  const byUrl = new Map<RelayUrl, RelayDiscovery>();
  for (const event of events) {
    const discovery = parseRelayDiscovery(event);
    if (!discovery) continue;
    const current = byUrl.get(discovery.url);
    if (!current || current.measuredAt < discovery.measuredAt) {
      byUrl.set(discovery.url, discovery);
    }
  }
  return byUrl;
};

/**
 * `#d` は計測する側が書いた形のまま比べられるので、末尾の `/` があるものと
 * 無いものの両方で聞く。
 */
export const discoveryFilter = (urls: readonly RelayUrl[]) => ({
  kinds: [RELAY_DISCOVERY_KIND],
  "#d": [...new Set(urls.flatMap((url) => [url, url.replace(/\/$/, "")]))],
});

/** フォロー中の人それぞれの一覧から、リレーごとに使っている人数を数える。 */
export const countFolloweeRelays = (
  lists: readonly (readonly RelayListEntry[])[],
): Map<RelayUrl, number> => {
  const users = new Map<RelayUrl, number>();
  for (const entries of lists) {
    for (const url of new Set(entries.map((entry) => entry.url))) {
      users.set(url, (users.get(url) ?? 0) + 1);
    }
  }
  return users;
};

/** おすすめ度の内訳。画面はこれを根拠として並べる。 */
export type RecommendationReason =
  | { type: "users"; users: number; followees: number; points: number }
  | { type: "latency"; ms: number; points: number }
  | { type: "nips"; missing: number[]; points: number }
  | { type: "payment"; points: number }
  | { type: "auth"; points: number };

export type RelayRecommendation = {
  url: RelayUrl;
  /** 0〜100。 */
  score: number;
  users: number;
  /** 計測があれば。 */
  discovery?: RelayDiscovery;
  reasons: RecommendationReason[];
  /** 自分の一覧に既にある。 */
  added: boolean;
};

/**
 * 点数の付け方。フォロー中の人が使っていることを主にする —— そこにあれば、
 * その人たちの投稿を読め、自分の投稿もその人たちに届きやすい。
 *
 * - 使っている人：フォロー中の人の半分が使っていれば満点の 60 点、比例
 * - 速さ：300ms 以内 +20、1 秒以内 +10、3 秒を超えると −10（計測なしは 0）
 * - 対応機能：Streets が頼る NIP を全部名乗れば +10（名乗りが無ければ 0）
 * - 支払いが要る −40、認証が要る −10
 */
export const scoreRelay = (input: {
  users: number;
  followees: number;
  discovery?: RelayDiscovery;
}): { score: number; reasons: RecommendationReason[] } => {
  const reasons: RecommendationReason[] = [];
  const share = input.followees > 0 ? input.users / input.followees : 0;
  reasons.push({
    type: "users",
    users: input.users,
    followees: input.followees,
    points: Math.round(60 * Math.min(1, share / 0.5)),
  });

  const discovery = input.discovery;
  const ms = discovery?.rttRead ?? discovery?.rttOpen;
  if (ms !== undefined) {
    reasons.push({
      type: "latency",
      ms,
      points: ms <= 300 ? 20 : ms <= 1000 ? 10 : ms <= 3000 ? 0 : -10,
    });
  }
  if (discovery && discovery.nips.length > 0) {
    const missing = STREETS_RELAY_NIPS.filter(
      (nip) => !discovery.nips.includes(nip),
    );
    reasons.push({ type: "nips", missing, points: missing.length ? 0 : 10 });
  }
  if (discovery?.payment) reasons.push({ type: "payment", points: -40 });
  if (discovery?.auth) reasons.push({ type: "auth", points: -10 });

  const total = reasons.reduce((sum, reason) => sum + reason.points, 0);
  return { score: Math.max(0, Math.min(100, total)), reasons };
};

/**
 * 使っている人の多い順に候補を切り出す。計測を問い合わせる前に数を絞るため
 * （`#d` を何百も並べない）。
 */
export const topCandidates = (
  users: ReadonlyMap<RelayUrl, number>,
  limit = RECOMMENDATION_CANDIDATES,
): RelayUrl[] =>
  [...users]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([url]) => url);

export type RecommendationSort = "score" | "users" | "latency";

const latencyOf = (item: RelayRecommendation) =>
  item.discovery?.rttRead ??
  item.discovery?.rttOpen ??
  Number.POSITIVE_INFINITY;

/** 候補に点数を付けて並べる。 */
export const recommendRelays = (input: {
  candidates: readonly RelayUrl[];
  users: ReadonlyMap<RelayUrl, number>;
  followees: number;
  discoveries: ReadonlyMap<RelayUrl, RelayDiscovery>;
  own: readonly RelayListEntry[];
  sort?: RecommendationSort;
}): RelayRecommendation[] => {
  const ownUrls = new Set(input.own.map((entry) => entry.url));
  const items = input.candidates.map((url) => {
    const discovery = input.discoveries.get(url);
    const users = input.users.get(url) ?? 0;
    const { score, reasons } = scoreRelay({
      users,
      followees: input.followees,
      discovery,
    });
    return {
      url,
      score,
      users,
      ...(discovery ? { discovery } : {}),
      reasons,
      added: ownUrls.has(url),
    };
  });
  const sort = input.sort ?? "score";
  return items.sort(
    (a, b) =>
      (sort === "users"
        ? b.users - a.users
        : sort === "latency"
          ? latencyOf(a) - latencyOf(b)
          : b.score - a.score) ||
      b.score - a.score ||
      a.url.localeCompare(b.url),
  );
};
