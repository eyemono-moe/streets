import type { RelayUrl } from "./relay-connection";

export type TrafficCount = { count: number; bytes: number };

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
  /** いま開いている購読と、その最大。 */
  subscriptions: number;
  peakSubscriptions: number;
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
  received(url: RelayUrl, type: string, bytes: number): void;
  event(url: RelayUrl, id: string, kind: number, bytes: number): void;
  subscriptions(url: RelayUrl, open: number): void;
  closed(url: RelayUrl, reason: string): void;
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
  let startedAt = now();

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
    subscriptions: 0,
    peakSubscriptions: 0,
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
    received(url, type, bytes) {
      add(entry(url).received, type, bytes);
    },
    event(url, id, kind, bytes) {
      const target = entry(url);
      add(target.kinds, kind, bytes);
      if (seenIds.has(id)) {
        target.duplicates.count += 1;
        target.duplicates.bytes += bytes;
      } else seenIds.add(id);
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
      startedAt = at;
    },
  };
};
