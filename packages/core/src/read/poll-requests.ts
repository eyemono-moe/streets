import { POLL_RESPONSE_KIND } from "../nostr/poll";
import type { RelayUrl } from "../relay/relay-connection";
import { createBatchedLookup } from "./batched-lookup";
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
  const settled = new Set<string>();
  const lookup = createBatchedLookup<{
    pollId: string;
    relays: readonly RelayUrl[];
  }>({
    manager: options.manager,
    windowMs: "immediate",
    keyOf: (poll) => poll.pollId,
    // 行き先が投票ごとに違うので束ねず、1 本ずつ取る。
    plan: ([poll]) => ({
      filters: [{ kinds: [POLL_RESPONSE_KIND], "#e": [poll.pollId] }],
      relays: poll.relays.length > 0 ? [...poll.relays] : undefined,
    }),
    onFetched: (polls) => {
      for (const poll of polls) settled.add(poll.pollId);
    },
  });

  return {
    request(pollId, relays) {
      if (lookup.isInflight(pollId)) return;
      lookup.enqueue({ pollId, relays });
    },
    isSettled: (pollId) => settled.has(pollId),
    subscribe: lookup.subscribe,
    dispose: lookup.dispose,
  };
};
