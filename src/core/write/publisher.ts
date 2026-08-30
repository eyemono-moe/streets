import type { NostrEvent } from "../nostr/event";
import type { ConnectionPool } from "../read/connection-pool";
import type { RoutingTable } from "../read/routing-table";
import type { RelayUrl } from "../relay/relay-connection";

/**
 * 1 回の publish の結果。どのリレーが受け取り、どのリレーが (なぜ) 拒否
 * したかを両方見せる — ADR-0011 の「黙って欠落させてはならない」を publish
 * 経路でも守るための形。UI (仕様 6 節の受け入れ確認 4) はこれをそのまま
 * 表示すればよい。
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
    options?: { additionalRelays?: readonly RelayUrl[] },
  ): Promise<PublishResult>;
};

/**
 * 署名済みイベントを、自分の write リレー全部へ送る (ADR-0016 の Outbox
 * モデル)。**このモジュールは署名しない** — `signEvent()` は呼び出し側
 * (投稿フォーム) の責務であり、ここが受け取るのは既に署名済みの
 * `NostrEvent` だけ (仕様 6 節: 署名 → EventStore 挿入 → publish の順序を
 * 守るのは呼び出し側の仕事)。
 *
 * 送信先は `event.pubkey` (= 署名した本人) の write リレー。1 本も分から
 * なければ `fallbackRelays` へ送る —— 空配列へ送って黙って何もしない、と
 * いう劣化は許されない (ADR-0011)。
 *
 * 実際にソケットを開く・予算を強制するのは `ConnectionPool.publish()` に
 * 一本化されている — ここは「どこへ送るか」だけを決め、
 * 「どうやって送るか」はプールに委ねる。
 *
 * 各リレーへの publish は独立に試みる (`Promise.allSettled`) —— 1 本の
 * 失敗が他の成功を握り潰さない。全部失敗すれば `accepted` は空で
 * `rejected` に全リレーが載る。失敗を握り潰して `accepted` に混ぜること
 * はしない (ADR-0011)。
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

      const settled = await Promise.allSettled(
        publishTargets.map((relay) => pool.publish(relay, event)),
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
