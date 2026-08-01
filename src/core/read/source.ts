import type { RelayFilter, RelayUrl } from "../relay/relay-connection";

export type NostrSource = {
  type: "nostr";
  filters: RelayFilter[];
  /** 指定した場合は Outbox ルーティングをバイパスする (ADR-0005) */
  relays?: RelayUrl[];
};

/** NIP-11。Nostr イベントですらない供給元 (ADR-0003) */
export type RelayInfoSource = {
  type: "relay-info";
  url: RelayUrl;
};

export type Source = NostrSource | RelayInfoSource;

export type Order = "created-at-desc" | "created-at-asc" | "thread-tree";

/**
 * セクション自身のリストについてのみ語る。
 * レンダラの遅延取得は含めない (ADR-0015)。
 */
export type SectionStatus = {
  phase: "initial" | "streaming" | "settled";
  incomplete?: {
    unreachableRelays: number;
    unroutableAuthors: number;
    uncoveredAuthors: number;
  };
};

/** ADR-0011 の性能予算 */
export const MAX_ITEMS_PER_SECTION = 500;
