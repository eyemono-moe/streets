import type { RelayFilter, RelayUrl } from "./relay-connection";

export type TrafficCount = { count: number; bytes: number };

/** 同じ形のフィルタで送った REQ と、それで受け取ったイベント。 */
export type ShapeTraffic = {
  reqs: number;
  events: TrafficCount;
  duplicates: TrafficCount;
};

/** 1 つのリレーとのやりとりの累計。繋ぎ直しても同じ URL なら足し続ける。 */
export type RelayTrafficStats = {
  url: RelayUrl;
  /** ソケットを作った回数。開かずに閉じたものも数える。 */
  attempts: number;
  /** ソケットが開いた回数。 */
  connects: number;
  /** 開いていた時間の合計（ms）。いま開いている分も含む。 */
  connectedMs: number;
  open: boolean;
  /** 送ったメッセージ。キーは REQ・CLOSE・EVENT・AUTH。 */
  sent: Record<string, TrafficCount>;
  /** 受け取ったメッセージ。キーは EVENT・EOSE・CLOSED・OK・NOTICE・AUTH など。 */
  received: Record<string, TrafficCount>;
  /** 受け取ったイベントの kind ごとの内訳。 */
  kinds: Record<number, TrafficCount>;
  /** どこかのリレーから前に受け取ったのと同じ id のイベント。 */
  duplicates: TrafficCount;
  /** フィルタの形（`filterShape`）ごとの内訳。どの取得が重いかを見るため。 */
  shapes: Record<string, ShapeTraffic>;
  /** いま開いている購読と、その最大。 */
  subscriptions: number;
  peakSubscriptions: number;
  /** 同時購読の上限に空きが無くて、待ち行列に積んだ REQ の数。 */
  queuedReqs: number;
  /** CLOSED の理由ごとの件数。 */
  closedReasons: Record<string, number>;
  /** 最近の NOTICE。 */
  notices: string[];
};

/** 接続が自分のやりとりを知らせる先。 */
export type RelayTrafficRecorder = {
  attempted(url: RelayUrl): void;
  opened(url: RelayUrl): void;
  socketClosed(url: RelayUrl): void;
  sent(url: RelayUrl, type: string, bytes: number): void;
  /** REQ を送った。`shape` は `filterShape` で作る。 */
  requested(url: RelayUrl, shape: string): void;
  received(url: RelayUrl, type: string, bytes: number): void;
  event(
    url: RelayUrl,
    shape: string | undefined,
    id: string,
    kind: number,
    bytes: number,
  ): void;
  subscriptions(url: RelayUrl, open: number): void;
  closed(url: RelayUrl, reason: string): void;
  /** 上限に空きが無くて、REQ を送らず待ち行列に積んだ。 */
  queued(url: RelayUrl): void;
  notice(url: RelayUrl, message: string): void;
};

export type RelayTraffic = {
  recorder: RelayTrafficRecorder;
  /** 測り始めてからの経過（ms）。 */
  elapsedMs(): number;
  snapshot(): RelayTrafficStats[];
  /** 数え直す。いま開いている接続と購読は、開いたまま数え始める。 */
  reset(): void;
};

const NOTICE_LIMIT = 5;

/**
 * 重複を見分けるために覚えておく id の数。本番でもずっと数えるので、開いている間
 * 増え続けないよう、この数ごとに古い世代を捨てる。2 世代を見るので、直前に受け取った
 * この数の分は必ず見分けられる。
 */
export const SEEN_IDS_LIMIT = 50_000;

/**
 * フィルタの形。値は捨て、kind と使ったキー、配列なら 1 件か複数かだけを残す
 * （`kinds:3 #p(1)` など）。値まで残すと、人ごとに別の形になって束ねられない。
 */
export const filterShape = (filters: readonly RelayFilter[]): string =>
  filters
    .map((filter) =>
      Object.entries(filter)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => {
          if (key === "kinds" && filter.kinds)
            return `kinds:${[...filter.kinds].sort((a, b) => a - b).join(",")}`;
          if (Array.isArray(value))
            return `${key}(${value.length === 1 ? "1" : "n"})`;
          return key;
        })
        .sort((a, b) =>
          a.startsWith("kinds:")
            ? -1
            : b.startsWith("kinds:")
              ? 1
              : a < b
                ? -1
                : 1,
        )
        .join(" "),
    )
    .join(" | ");

/**
 * WebSocket が展開した後の文字列の UTF-8 での大きさ。圧縮
 * （permessage-deflate）された回線上の量はブラウザから取れない。
 */
export const utf8Length = (text: string): number => {
  let bytes = 0;
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code < 0xdc00 && index + 1 < text.length) {
      bytes += 4;
      index++;
    } else bytes += 3;
  }
  return bytes;
};

const add = (
  counts: Record<string | number, TrafficCount>,
  key: string | number,
  bytes: number,
) => {
  const count = counts[key];
  if (count) {
    count.count += 1;
    count.bytes += bytes;
  } else counts[key] = { count: 1, bytes };
};

type Entry = Omit<RelayTrafficStats, "connectedMs" | "open"> & {
  closedMs: number;
  openSince: number | undefined;
};

export const createRelayTraffic = (
  now: () => number = () => performance.now(),
): RelayTraffic => {
  let entries = new Map<RelayUrl, Entry>();
  let seenIds = new Set<string>();
  let olderIds = new Set<string>();
  let startedAt = now();
  const seen = (id: string): boolean => {
    if (seenIds.has(id) || olderIds.has(id)) return true;
    seenIds.add(id);
    if (seenIds.size >= SEEN_IDS_LIMIT) {
      olderIds = seenIds;
      seenIds = new Set();
    }
    return false;
  };

  const fresh = (url: RelayUrl): Entry => ({
    url,
    attempts: 0,
    connects: 0,
    closedMs: 0,
    openSince: undefined,
    sent: {},
    received: {},
    kinds: {},
    duplicates: { count: 0, bytes: 0 },
    shapes: {},
    subscriptions: 0,
    peakSubscriptions: 0,
    queuedReqs: 0,
    closedReasons: {},
    notices: [],
  });

  const entry = (url: RelayUrl): Entry => {
    const existing = entries.get(url);
    if (existing) return existing;
    const created = fresh(url);
    entries.set(url, created);
    return created;
  };

  const shapeOf = (target: Entry, shape: string): ShapeTraffic => {
    const existing = target.shapes[shape];
    if (existing) return existing;
    const created: ShapeTraffic = {
      reqs: 0,
      events: { count: 0, bytes: 0 },
      duplicates: { count: 0, bytes: 0 },
    };
    target.shapes[shape] = created;
    return created;
  };

  const recorder: RelayTrafficRecorder = {
    attempted(url) {
      entry(url).attempts += 1;
    },
    opened(url) {
      const target = entry(url);
      target.connects += 1;
      target.openSince = now();
    },
    socketClosed(url) {
      const target = entry(url);
      if (target.openSince !== undefined) {
        target.closedMs += now() - target.openSince;
        target.openSince = undefined;
      }
      target.subscriptions = 0;
    },
    sent(url, type, bytes) {
      add(entry(url).sent, type, bytes);
    },
    requested(url, shape) {
      shapeOf(entry(url), shape).reqs += 1;
    },
    received(url, type, bytes) {
      add(entry(url).received, type, bytes);
    },
    event(url, shape, id, kind, bytes) {
      const target = entry(url);
      add(target.kinds, kind, bytes);
      const byShape = shapeOf(target, shape ?? "(unknown)");
      byShape.events.count += 1;
      byShape.events.bytes += bytes;
      if (seen(id)) {
        target.duplicates.count += 1;
        target.duplicates.bytes += bytes;
        byShape.duplicates.count += 1;
        byShape.duplicates.bytes += bytes;
      }
    },
    subscriptions(url, open) {
      const target = entry(url);
      target.subscriptions = open;
      if (open > target.peakSubscriptions) target.peakSubscriptions = open;
    },
    closed(url, reason) {
      const reasons = entry(url).closedReasons;
      reasons[reason] = (reasons[reason] ?? 0) + 1;
    },
    queued(url) {
      entry(url).queuedReqs += 1;
    },
    notice(url, message) {
      const notices = entry(url).notices;
      notices.push(message);
      if (notices.length > NOTICE_LIMIT) notices.shift();
    },
  };

  return {
    recorder,
    elapsedMs: () => now() - startedAt,
    snapshot() {
      const at = now();
      return [...entries.values()].map(
        ({ closedMs, openSince, ...rest }): RelayTrafficStats => ({
          ...structuredClone(rest),
          connectedMs:
            closedMs + (openSince === undefined ? 0 : at - openSince),
          open: openSince !== undefined,
        }),
      );
    },
    reset() {
      const at = now();
      const previous = entries;
      entries = new Map();
      for (const old of previous.values()) {
        if (old.openSince === undefined) continue;
        const kept = fresh(old.url);
        kept.openSince = at;
        kept.subscriptions = old.subscriptions;
        kept.peakSubscriptions = old.subscriptions;
        entries.set(old.url, kept);
      }
      seenIds = new Set();
      olderIds = new Set();
      startedAt = at;
    },
  };
};

const sumCounts = (counts: Record<string | number, TrafficCount>) => {
  let count = 0;
  let bytes = 0;
  for (const value of Object.values(counts)) {
    count += value.count;
    bytes += value.bytes;
  }
  return { count, bytes };
};

/** 統計の画面に出す、1 つのリレーとのやりとり。 */
export type RelayTrafficSummary = {
  url: RelayUrl;
  open: boolean;
  /** 受け取った量（バイト）。 */
  received: number;
  /** そのうちイベントの分。 */
  receivedEvents: number;
  sent: number;
  /** 受け取ったイベントの数。 */
  events: number;
  /** 別のリレーから先に受け取っていたイベントの数。 */
  duplicates: number;
  connectedMs: number;
  /** 切れてからつなぎ直した回数。 */
  reconnects: number;
  subscriptions: number;
  peakSubscriptions: number;
  queuedReqs: number;
  /** kind ごとのイベント。多い順。 */
  kinds: { kind: number; count: number; bytes: number }[];
};

export type TrafficSummary = {
  received: number;
  sent: number;
  events: number;
  duplicates: number;
  /** 受け取った量の多い順。 */
  relays: RelayTrafficSummary[];
};

/** `snapshot()` を、統計の画面に出す形へまとめる。 */
export const summarizeTraffic = (
  stats: readonly RelayTrafficStats[],
): TrafficSummary => {
  const relays = stats
    .map((relay): RelayTrafficSummary => {
      const events = relay.received.EVENT ?? { count: 0, bytes: 0 };
      return {
        url: relay.url,
        open: relay.open,
        received: sumCounts(relay.received).bytes,
        receivedEvents: events.bytes,
        sent: sumCounts(relay.sent).bytes,
        events: events.count,
        duplicates: relay.duplicates.count,
        connectedMs: relay.connectedMs,
        reconnects: Math.max(0, relay.connects - 1),
        subscriptions: relay.subscriptions,
        peakSubscriptions: relay.peakSubscriptions,
        queuedReqs: relay.queuedReqs,
        kinds: Object.entries(relay.kinds)
          .map(([kind, count]) => ({ kind: Number(kind), ...count }))
          .sort((a, b) => b.count - a.count || a.kind - b.kind),
      };
    })
    .sort((a, b) => b.received - a.received || a.url.localeCompare(b.url));
  let received = 0;
  let sent = 0;
  let events = 0;
  let duplicates = 0;
  for (const relay of relays) {
    received += relay.received;
    sent += relay.sent;
    events += relay.events;
    duplicates += relay.duplicates;
  }
  return { received, sent, events, duplicates, relays };
};
