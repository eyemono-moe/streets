import type { RelayUrl } from "./relay-connection";

/**
 * - `unreachable`：ソケットが開かないまま閉じた
 * - `auth-required`：認証を求められ、認証できなかった
 * - `restricted`：使わせてもらえない（許可リストに無い・締め出されている）
 */
export type RelayFailureReason = "unreachable" | "auth-required" | "restricted";

export type RelayFailure = {
  url: RelayUrl;
  /** 最後に失敗した理由。 */
  reason: RelayFailureReason;
  /** リレーが添えた説明。断られたときだけある。 */
  detail?: string;
  count: number;
  /** ms。 */
  lastAt: number;
};

/** 接続が失敗を知らせる先。 */
export type RelayFailureRecorder = {
  opened(url: RelayUrl): void;
  /** 開く前にソケットが閉じた。 */
  unreachable(url: RelayUrl): void;
  /** CLOSED や OK false の理由。リレーそのものを使えない理由でなければ数えない。 */
  refused(url: RelayUrl, message: string): void;
};

export type RelayFailures = {
  recorder: RelayFailureRecorder;
  /** 新しく失敗したものから。 */
  list(): RelayFailure[];
  subscribe(listener: () => void): () => void;
};

/**
 * NIP-01 の機械が読める前置きのうち、リレーそのものを使えないと分かるものだけを拾う。
 * `rate-limited`・`invalid`・`duplicate` などは送ったものや間隔の問題で、
 * 繋がないリレーに足す理由にならない。
 */
const refusalOf = (
  message: string,
): { reason: RelayFailureReason; detail?: string } | undefined => {
  const match = /^([a-z-]+):\s*(.*)$/s.exec(message);
  if (!match) return undefined;
  const [, prefix, rest] = match;
  const reason: RelayFailureReason | undefined =
    prefix === "auth-required"
      ? "auth-required"
      : prefix === "restricted" || prefix === "blocked"
        ? "restricted"
        : undefined;
  if (!reason) return undefined;
  const detail = rest?.trim();
  return detail ? { reason, detail } : { reason };
};

/** このタブの中だけで持つ。端末に残すと、直ったリレーまでいつまでも並ぶ。 */
export const createRelayFailures = (
  now: () => number = Date.now,
): RelayFailures => {
  const failures = new Map<RelayUrl, RelayFailure>();
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const listener of [...listeners]) listener();
  };

  const record = (
    url: RelayUrl,
    reason: RelayFailureReason,
    detail?: string,
  ) => {
    const count = (failures.get(url)?.count ?? 0) + 1;
    failures.set(url, {
      url,
      reason,
      ...(detail !== undefined && { detail }),
      count,
      lastAt: now(),
    });
    notify();
  };

  return {
    recorder: {
      // 断られたリレーも開くことは開くので、繋がらなかった記録だけを消す。
      opened: (url) => {
        if (failures.get(url)?.reason !== "unreachable") return;
        failures.delete(url);
        notify();
      },
      unreachable: (url) => record(url, "unreachable"),
      refused: (url, message) => {
        const refusal = refusalOf(message);
        if (refusal) record(url, refusal.reason, refusal.detail);
      },
    },
    list: () => [...failures.values()].sort((a, b) => b.lastAt - a.lastAt),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
};
