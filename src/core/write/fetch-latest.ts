import type { NostrEvent } from "../nostr/event";
import { collect } from "../read/collect";
import {
  type ConnectionPool,
  PUBLISH_TIMEOUT_MS,
  type PooledSubscription,
} from "../read/connection-pool";
import type { EventStore } from "../read/event-store";
import type { RoutingTable } from "../read/routing-table";
import type { RelayUrl } from "../relay/relay-connection";

/** 置換可能イベントの再取得が全リレーで失敗した。何も書いていない。 */
export class RefetchFailedError extends Error {
  readonly relays: RelayUrl[];
  constructor(relays: RelayUrl[]) {
    // Stryker disable next-line StringLiteral: 呼び出し側は instanceof
    // RefetchFailedError で分岐しており、メッセージ文言は判定に使わない。
    super(`no relay answered for the current version (${relays.length} tried)`);
    // Stryker disable next-line StringLiteral: 同上。name も分岐に使わない。
    this.name = "RefetchFailedError";
    this.relays = relays;
  }
}

export type FetchLatestOptions = {
  pool: ConnectionPool;
  routing: RoutingTable;
  store: EventStore;
  fallbackRelays: readonly RelayUrl[];
  timeoutMs?: number;
};

/**
 * 置換可能イベントの最新版を **write リレーから** 引く。
 *
 * read リレーから引いてはならない —— 自分が最後に書いた版がまだ
 * 伝播していない可能性があり、それに気づかず差分を当てると
 * **自分で自分の変更を消す**。publish 先と読み取り元を同じにすることで
 * これが起きない。
 */
export const fetchLatest = async (
  {
    pool,
    routing,
    store,
    fallbackRelays,
    // `connection-pool.ts` の PUBLISH_TIMEOUT_MS をそのまま既定値にする ——
    // 「リレー 1 本との往復にどれだけ待つか」を publish 側と揃えている値で、
    // ここに別の定数を作ると値がずれたときに気づけなくなる。
    timeoutMs = PUBLISH_TIMEOUT_MS,
  }: FetchLatestOptions,
  kind: number,
  identifier: string | undefined,
  pubkey: string,
): Promise<NostrEvent | undefined> => {
  if (identifier !== undefined) {
    // `latestReplaceable` の索引は `kind:pubkey` だけを鍵にしていて `d` を
    // 見ない。射程内の kind (0/3/10000/10002/10003) はすべて非アドレス可能
    // なので今は問題にならないが、kind:30078 を載せる時点で EventStore 側に
    // `d` を含む索引が要る。**黙って間違った版を返すより投げる。**
    throw new Error(
      "fetchLatest: identifier (d タグ) は未対応。EventStore の置換可能索引が d を見ていない",
    );
  }

  const writeRelays = routing.writeRelaysFor(pubkey);
  const urls = writeRelays.length > 0 ? writeRelays : [...fallbackRelays];

  const answered: RelayUrl[] = [];
  const open = new Map<RelayUrl, PooledSubscription>();
  await collect(
    pool,
    urls,
    [{ kinds: [kind], authors: [pubkey] }],
    store,
    timeoutMs,
    open,
    {
      // **EOSE だけを「応答した」と数える。** CLOSED はリレーがフィルタを
      // 拒否した場合を含み (bootstrap.ts が実際に踏んでいる)、不在の証明に
      // ならない。rejected (予算切れ) と timeout も同じ。
      onRelaySettled: (settle) => {
        if (settle.reason === "eose") answered.push(settle.url);
      },
    },
  );

  if (answered.length === 0) throw new RefetchFailedError(urls);
  return store.latestReplaceable(kind, pubkey);
};
