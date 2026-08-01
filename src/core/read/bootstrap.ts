import type { NostrEvent } from "../nostr/event";
import type {
  RelayConnection,
  RelayFilter,
  RelaySubscription,
  RelayUrl,
} from "../relay/relay-connection";
import { BOOTSTRAP_INDEXERS } from "./default-relays";
import type { EventStore } from "./event-store";

const FOLLOW_LIST_KIND = 3;
const RELAY_LIST_KIND = 10002;
const DEFAULT_TIMEOUT_MS = 10_000;

export type WarmUpResult = {
  /** フォローリストに載っていた pubkey */
  followees: string[];
  /** kind:10002 が引けた人数 */
  routed: number;
  /** 引けなかった人数 */
  unroutable: number;
};

export type WarmUpOptions = {
  pubkey: string;
  store: EventStore;
  connect: (url: RelayUrl) => RelayConnection;
  indexers?: readonly RelayUrl[];
  /**
   * ① フォローリスト取得、② kind:10002 一括取得の各フェーズにそれぞれ
   * この上限をフルで与える。2 フェーズとも最悪ケースまでかかると、
   * warmUpRouting() 全体の最悪所要時間はこの値の **2 倍** になる。
   */
  timeoutMs?: number;
};

/**
 * 複数のインデクサへ同じフィルタを投げ、全接続が片付く (EOSE か CLOSED を
 * 報告する) かタイムアウトするまで待つ。届いたイベントは EventStore に
 * 入れるだけで、呼び出し元へは返さない — 呼び出し元は store 経由で読む。
 *
 * 1 接続につき「片付いた」判定は 1 回だけしか数えない。EOSE の後に CLOSED
 * が届く (あるいはその逆) リレーが実在し、素直にカウントダウンするだけだと
 * 同じ接続で 2 回減算されて、他の接続の応答を待たずに終わってしまう。
 *
 * 片付いた接続はその場で購読を閉じる。全部の片付きを待ってからまとめて
 * 閉じると、先に応答した速いリレーの購読が、遅いリレーのぶんだけ
 * (最悪 timeoutMs いっぱい) 無駄に開いたままになる。タイムアウトで
 * finish() した場合は、まだ片付いていない接続の購読をそこで閉じる。
 *
 * ここは Outbox ルーティングを使わない専用経路 (ADR-0016)。
 */
const collect = (
  connections: RelayConnection[],
  filters: RelayFilter[],
  store: EventStore,
  timeoutMs: number,
): Promise<void> =>
  new Promise((resolve) => {
    let pending = connections.length;
    let done = false;
    const settled = new Set<RelayConnection>();
    const subscriptions = new Map<RelayConnection, RelaySubscription>();

    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      for (const subscription of subscriptions.values()) subscription.close();
      resolve();
    };
    const timer = setTimeout(finish, timeoutMs);

    if (connections.length === 0) {
      finish();
      return;
    }

    const settleOnce = (connection: RelayConnection) => {
      if (settled.has(connection)) return;
      settled.add(connection);
      // ここで閉じておけば finish() 側で二重に閉じても安全 (RelaySubscription
      // の close は冪等である前提、実装は WebSocketRelayConnection/
      // FakeRelayConnection とも満たす)。
      subscriptions.get(connection)?.close();
      pending -= 1;
      if (pending <= 0) finish();
    };

    for (const connection of connections) {
      const subscription = connection.subscribe(filters, {
        // 信頼境界: インデクサが要求した filters と無関係な kind/著者のイベント
        // を寄越しても、ここではフィルタと突き合わせて確認しない。store.put()
        // 側の schnorr 署名検証と、EventStore.#indexReplaceable の created_at
        // 最大値ルール (ADR-0016) がある限り、悪意あるインデクサが差し込めるのは
        // 「本人が実際に署名した、かつ最新版ではない」イベントに限られる —
        // ルーティング表を乗っ取ることはできない。影響範囲はこの境界で抑えられる。
        onEvent: (event: NostrEvent) => {
          store.put(event, connection.url);
        },
        onEose: () => settleOnce(connection),
        onClosed: () => settleOnce(connection),
      });
      // subscribe() が同期的に onClosed を呼ぶ実装がある
      // (WebSocketRelayConnection はソケットが既に閉じていると同期で
      // onClosed する)。その場合 settleOnce はまだ地図に載っていない
      // this connection を閉じられず、単一接続なら finish() もこの時点で
      // 既に走り切ってしまっている (done=true) ので、もう誰も subscriptions
      // を見に来ない。ここで拾って即座に閉じ、迷子にしない。
      if (done) subscription.close();
      else subscriptions.set(connection, subscription);
    }
  });

export const warmUpRouting = async ({
  pubkey,
  store,
  connect,
  indexers = BOOTSTRAP_INDEXERS,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: WarmUpOptions): Promise<WarmUpResult> => {
  const connections: RelayConnection[] = [];

  try {
    // インデクサは複数あるのが前提 (ADR-0016)。1 本が落ちていても
    // 残りで続行する — connect() が同期的に投げてもここで吸収する。
    for (const url of indexers) {
      try {
        connections.push(connect(url));
      } catch {
        // このインデクサは諦め、残りで続ける。
      }
    }

    // ① フォローリスト
    await collect(
      connections,
      [{ kinds: [FOLLOW_LIST_KIND], authors: [pubkey], limit: 1 }],
      store,
      timeoutMs,
    );

    const followList = store.latestReplaceable(FOLLOW_LIST_KIND, pubkey);
    const followees = followList
      ? [
          ...new Set(
            followList.tags
              .filter((tag) => tag[0] === "p" && typeof tag[1] === "string")
              .map((tag) => tag[1]),
          ),
        ]
      : [];

    if (followees.length === 0) {
      return { followees, routed: 0, unroutable: 0 };
    }

    // ② 全員分の kind:10002 を 1 クエリで (ADR-0016)
    await collect(
      connections,
      [{ kinds: [RELAY_LIST_KIND], authors: followees }],
      store,
      timeoutMs,
    );

    let routed = 0;
    for (const followee of followees) {
      if (store.latestReplaceable(RELAY_LIST_KIND, followee)) routed += 1;
    }

    return { followees, routed, unroutable: followees.length - routed };
  } finally {
    for (const connection of connections) connection.close();
  }
};
