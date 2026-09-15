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

/** 1 つのリレーとだけ話す。複数リレーへの同報や、どのリレーを選ぶかの判断は含まない。 */
export interface RelayConnection {
  readonly url: RelayUrl;
  subscribe(
    filters: RelayFilter[],
    handlers: RelaySubscriptionHandlers,
  ): RelaySubscription;
  publish(event: NostrEvent): Promise<void>;
  close(): void;
  /**
   * ソケットが実際に開いたことを通知する（`onClose` と対称、既に開いていれば
   * その場で呼ぶ）。接続生成は未接続のまま返るので、無いと到達不能リレーの再接続バックオフが伸びない。
   */
  onOpen(listener: () => void): () => void;
  /**
   * ソケットが死んだことを通知する（購読単位の `onClosed` とは別物、既に死んで
   * いれば即座に呼ぶ）。無いと「個別 CLOSED」と「ソケットの死」を区別できず死んだ接続を掴み続ける。
   */
  onClose(listener: () => void): () => void;
}
