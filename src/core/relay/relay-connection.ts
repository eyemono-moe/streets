import type { NostrEvent } from "../nostr/event";

export type RelayUrl = string;

export type RelayFilter = {
  ids?: string[];
  authors?: string[];
  kinds?: number[];
  since?: number;
  until?: number;
  limit?: number;
  search?: string;
} & {
  [tag: `#${string}`]: string[] | undefined;
};

export type RelaySubscriptionHandlers = {
  onEvent: (event: NostrEvent) => void;
  onEose: () => void;
  onClosed: (reason: string) => void;
};

export interface RelaySubscription {
  close(): void;
}

/**
 * 1つのリレーとだけ話す。複数リレーへの同報も、
 * どのリレーを選ぶかの判断も含まない (ADR-0014)。
 */
export interface RelayConnection {
  readonly url: RelayUrl;
  subscribe(
    filters: RelayFilter[],
    handlers: RelaySubscriptionHandlers,
  ): RelaySubscription;
  publish(event: NostrEvent): Promise<void>;
  close(): void;
}
