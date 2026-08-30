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
   * ソケットが**実際に開いた**ことを通知する。`onClose` と対称。
   *
   * 接続の生成 (`new WebSocket(url)`) は即座に返り、その時点では開いて
   * いない。プールはこの通知が無いと「ソケットを作れた」と「繋がった」を
   * 区別できず、恒久的に到達不能なリレーに対しても再接続の指数バック
   * オフが 2⁰ から一度も伸びない (ADR-0021 との食い違い、2026-08-05 に
   * 実地観測)。
   *
   * 既に開いている接続に登録した場合はその場で呼ぶ (`onClose` と同じ
   * 規約)。一度も開かないまま死んだ接続に登録しても呼ばれない。
   * 戻り値は購読解除。
   */
  onOpen(listener: () => void): () => void;
  /**
   * ソケットが死んだことを通知する。**購読単位の `onClosed` とは別物。**
   * プールはこれが無いと「レート制限による個別 CLOSED」と「ソケットの死」を
   * 区別できず、死んだ接続を掴み続ける (ADR-0014)。
   *
   * 既に死んでいる接続に登録した場合はその場で呼ぶ。戻り値は購読解除。
   */
  onClose(listener: () => void): () => void;
}
