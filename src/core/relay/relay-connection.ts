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
  /**
   * ソケットが死んだことを通知する。**購読単位の `onClosed` とは別物。**
   * プールはこれが無いと「レート制限による個別 CLOSED」と「ソケットの死」を
   * 区別できず、死んだ接続を掴み続ける (ADR-0014)。
   *
   * 既に死んでいる接続に登録した場合はその場で呼ぶ。戻り値は購読解除。
   */
  onClose(listener: () => void): () => void;
}
