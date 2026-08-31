import type { RelayFilter, RelayUrl } from "../relay/relay-connection";

export type NostrSource = {
  type: "nostr";
  filters: RelayFilter[];
  /** 指定した場合は Outbox ルーティングをバイパスする */
  relays?: RelayUrl[];
};

/** NIP-11。Nostr イベントですらない供給元 */
export type RelayInfoSource = {
  type: "relay-info";
  url: RelayUrl;
};

export type Source = NostrSource | RelayInfoSource;

export type Order = "created-at-desc" | "created-at-asc";

/**
 * セクション自身のリストについてのみ語る。
 * レンダラの遅延取得は含めない。
 */
export type SectionStatus = {
  phase: "initial" | "streaming" | "settled";
  incomplete?: {
    unreachableRelays: number;
    unroutableAuthors: number;
    uncoveredAuthors: number;
  };
};

/** 性能予算 */
export const MAX_ITEMS_PER_SECTION = 200;
