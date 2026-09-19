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
 * 置換可能イベントの最新版を write リレーから引く —— read リレーでは
 * 未伝播の自分の変更に気づかず差分を当て、自分で自分を消しかねない。
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
  const regularReplaceable =
    kind === 0 || kind === 3 || (kind >= 10_000 && kind < 20_000);
  const addressable = kind >= 30_000 && kind < 40_000;
  if (
    (!regularReplaceable && !addressable) ||
    (regularReplaceable && identifier !== undefined) ||
    (addressable && identifier === undefined)
  ) {
    // 接続を開く前に止める。索引できない問い合わせをリレーへ送ってから
    // undefined に見せると、「無い」と「呼び方が間違っている」が混ざる。
    throw new Error("fetchLatest: kind と identifier の組み合わせが不正です");
  }

  const writeRelays = routing.writeRelaysFor(pubkey);
  const urls = writeRelays.length > 0 ? writeRelays : [...fallbackRelays];

  const answered: RelayUrl[] = [];
  const open = new Map<RelayUrl, PooledSubscription>();
  await collect(
    pool,
    urls,
    [
      {
        kinds: [kind],
        authors: [pubkey],
        ...(identifier === undefined ? {} : { "#d": [identifier] }),
      },
    ],
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
  return store.latestReplaceable(kind, pubkey, identifier);
};
