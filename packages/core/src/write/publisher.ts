import type { NostrEvent } from "../nostr/event";
import type { ConnectionPool } from "../read/connection-pool";
import type { RoutingTable } from "../read/routing-table";
import type { RelayUrl } from "../relay/relay-connection";
import {
  type RelayProgress,
  pendingRelays,
  settleRelay,
} from "./write-progress";

/**
 * 1 回の publish の結果。受理・拒否 (理由付き) を両方見せ、黙って
 * 欠落させない。UI はこのまま表示すればよい。
 */
export type PublishResult = {
  accepted: RelayUrl[];
  rejected: { relay: RelayUrl; reason: string }[];
};

export type CreatePublisherOptions = {
  pool: ConnectionPool;
  routing: RoutingTable;
  /** 自分の write リレーが 1 本も分からないときの送信先。 */
  fallbackRelays: readonly RelayUrl[];
};

export type Publisher = {
  /** 現時点のルーティングから、その著者の publish 先を解決する。 */
  targets(pubkey: string): RelayUrl[];
  publish(
    event: NostrEvent,
    options?: {
      additionalRelays?: readonly RelayUrl[];
      /**
       * 送り先が決まったとき（全部待ち）と、1 本の結果が出るたびに呼ぶ。
       * 戻り値の Promise は全部の結果が出るまで待つので、先に「どこかには
       * 届いた」を知りたい画面はこちらを見る。
       */
      onProgress?: (relays: RelayProgress[]) => void;
    },
  ): Promise<PublishResult>;
};

/**
 * 署名済みイベントを自分の write リレー全部へ送る (Outbox モデル)。
 * このモジュールは署名しない —— signEvent() は呼び出し側の責務で、
 * 署名 → EventStore 挿入 → publish の順序を守るのも呼び出し側の仕事。
 *
 * 送信先は `event.pubkey` の write リレー。1 本も分からなければ
 * `fallbackRelays` へ送る (空配列へ黙って何もしない劣化は許さない)。
 *
 * ソケットを開く・予算を強制するのは `ConnectionPool.publish()` に一本化し、
 * ここは送信先だけを決める。各リレーへの publish は独立に試みる
 * (`Promise.allSettled`) ので、1 本の失敗が他の成功を握り潰さない。
 */
export const createPublisher = ({
  pool,
  routing,
  fallbackRelays,
}: CreatePublisherOptions): Publisher => {
  const targets = (pubkey: string): RelayUrl[] => {
    const writeRelays = routing.writeRelaysFor(pubkey);
    return [...(writeRelays.length > 0 ? writeRelays : fallbackRelays)];
  };

  return {
    targets,
    async publish(event, options): Promise<PublishResult> {
      const writeRelays = routing.writeRelaysFor(event.pubkey);
      const currentTargets =
        writeRelays.length > 0 ? writeRelays : fallbackRelays;
      const publishTargets = [
        ...new Set([...currentTargets, ...(options?.additionalRelays ?? [])]),
      ];

      let progress = pendingRelays(publishTargets);
      options?.onProgress?.(progress);
      const settled = await Promise.allSettled(
        publishTargets.map((relay) =>
          pool.publish(relay, event).then(
            () => {
              progress = settleRelay(progress, relay, { accepted: true });
              options?.onProgress?.(progress);
            },
            (reason: unknown) => {
              progress = settleRelay(progress, relay, {
                accepted: false,
                reason:
                  reason instanceof Error ? reason.message : String(reason),
              });
              options?.onProgress?.(progress);
              throw reason;
            },
          ),
        ),
      );

      const accepted: RelayUrl[] = [];
      const rejected: { relay: RelayUrl; reason: string }[] = [];

      settled.forEach((outcome, index) => {
        const relay = publishTargets[index];
        if (outcome.status === "fulfilled") {
          accepted.push(relay);
        } else {
          rejected.push({
            relay,
            reason:
              outcome.reason instanceof Error
                ? outcome.reason.message
                : String(outcome.reason),
          });
        }
      });

      return { accepted, rejected };
    },
  };
};
