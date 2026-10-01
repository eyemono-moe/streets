import { POLL_RESPONSE_KIND } from "../nostr/poll";
import type { RelayUrl } from "../relay/relay-connection";
import type { SubscriptionManager } from "./subscription-manager";

export type PollRequests = {
  /**
   * その投票への回答を取りにいく。`relays` は投票が指すリレーで、空なら
   * いつものリレーへ問い合わせる。取っている途中の投票は重ねて取らない。
   */
  request(pollId: string, relays: readonly RelayUrl[]): void;
  /** 一度取り終えたか。「まだ誰も投票していない」と「集計中」を分けるため。 */
  isSettled(pollId: string): boolean;
  subscribe(listener: () => void): () => void;
  dispose(): void;
};

/**
 * 投票への回答（kind:1018）の取得。回答は投票が指すリレーに集まる決まり
 * （NIP-88）なので、著者やスレッドの経路とは別に、そのリレーへ問い合わせる。
 */
export const createPollRequests = (options: {
  manager: SubscriptionManager;
}): PollRequests => {
  const inFlight = new Set<string>();
  const settled = new Set<string>();
  const listeners = new Set<() => void>();
  let disposed = false;

  return {
    request(pollId, relays) {
      if (disposed || inFlight.has(pollId)) return;
      inFlight.add(pollId);
      void options.manager
        .fetchOnce(
          [{ kinds: [POLL_RESPONSE_KIND], "#e": [pollId] }],
          relays.length > 0 ? { relays: [...relays] } : undefined,
        )
        .then(() => {
          if (disposed) return;
          inFlight.delete(pollId);
          settled.add(pollId);
          for (const listener of listeners) listener();
        });
    },
    isSettled: (pollId) => settled.has(pollId),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      disposed = true;
      listeners.clear();
    },
  };
};
