import {
  For,
  Show,
  createEffect,
  createMemo,
  createResource,
  createSignal,
  onCleanup,
} from "solid-js";
import { warmUpRouting } from "../../core/read/bootstrap";
import { EventStore } from "../../core/read/event-store";
import { RoutingTable } from "../../core/read/routing-table";
import type { NostrSource, SectionStatus } from "../../core/read/source";
import { SubscriptionManager } from "../../core/read/subscription-manager";
import type { RelayUrl } from "../../core/relay/relay-connection";
import { RelayInfoRegistry } from "../../core/relay/relay-info";
import { connectRelay } from "../../core/relay/websocket-relay-connection";
import { createSection } from "../../core/solid/create-section";
import { parseBudget } from "./parse-budget";

// リレー2 (ws://127.0.0.1:8081/) は Outbox ルーティングが著者 B の
// kind:10002 から自動で見つける。ここで直接参照する必要はない。
const RELAY_ONE: RelayUrl = "ws://127.0.0.1:8080/";
/** e2e/fixtures/seed-outbox.ts の outboxViewerPubkey と一致させること */
const DEFAULT_VIEWER =
  new URLSearchParams(window.location.search).get("pubkey") ?? "";
/**
 * `?budget=<n>` で ConnectionPool の maxConnections を上書きする
 * (e2e/connection-budget.spec.ts)。既定の 30 のまま架空リレーを大量に
 * 用意すると失敗する WebSocket を何十本も開くことになるため、E2E は
 * ここへ小さい値を注入して貪欲選択の「機構」だけを検証する — 既定値の
 * 30 そのものはユニットテストの主張であってこのデバッグルートの仕事ではない。
 */
// パースと不正値のフォールバックは parse-budget.ts (単体テスト済み)。
const BUDGET = parseBudget(
  new URLSearchParams(window.location.search).get("budget"),
);

const V1SectionDebug = () => {
  const [viewer, setViewer] = createSignal(DEFAULT_VIEWER);
  const store = new EventStore();
  const routing = new RoutingTable(store);
  const registry = new RelayInfoRegistry();
  // 接続と購読は manager が所有する (ADR-0023)。このデバッグルートは
  // 1 画面につき 1 manager で十分 (30 接続上限やマージは後続の計画)。
  const manager = new SubscriptionManager({
    store,
    routing,
    connect: connectRelay,
    // ローカル検証ではインターネット上の既定リレーへ出ない
    fallbackRelays: [RELAY_ONE],
    // 未指定なら SubscriptionManager 自身の既定 (MAX_CONNECTIONS) が効く
    maxConnections: BUDGET,
  });

  // manager.connectionCount / peakConnectionCount (= pool.size / pool.peakSize)
  // はシグナルではないので JSX に直接置いても更新されない。
  //
  // ADR-0011 が予算しているのは「同時に何本まで開いたか」であって「今何本
  // 開いているか」ではない。到達不能な架空リレーへの接続はミリ秒単位で
  // 失敗して枠を返してしまうため、settled になった時点で connectionCount を
  // 読んでも予算超過はもう跡形もなく消えている — peakConnectionCount
  // (ConnectionPool の高水位マーク、単調増加) だけが実際に検証できる
  // (Task 12 fix round 1)。
  const [connections, setConnections] = createSignal(manager.connectionCount);
  const [peakConnections, setPeakConnections] = createSignal(
    manager.peakConnectionCount,
  );
  const syncConnectionSignals = () => {
    setConnections(manager.connectionCount);
    setPeakConnections(manager.peakConnectionCount);
  };

  // NIP-11 セクション: Nostr イベントですらない供給元 (ADR-0003)
  const [relayInfo] = createResource(
    () => RELAY_ONE,
    (url) => registry.get(url),
  );

  // viewer が空文字の間は走らせない。createResource は空文字列も truthy な
  // ソース値として扱いフェッチャーを呼んでしまうため、フェッチャー内で
  // 弾いて未入力時に無駄な warmUpRouting を走らせない。
  const [warmUp] = createResource(viewer, async (pubkey) => {
    if (!/^[0-9a-f]{64}$/.test(pubkey)) return undefined;
    return warmUpRouting({
      pubkey,
      store,
      // マネージャと同じ ConnectionPool を使う (Task 11)。別系統の connect()
      // をここへ渡すと、ウォームアップの接続がプールの 30 接続予算の外側で
      // 開くことになり ADR-0011 が意味を失う。
      pool: manager.pool,
      // ローカル検証ではインターネット上の既定インデクサへ出ない
      indexers: [RELAY_ONE],
    });
  });

  const source = createMemo<NostrSource>(() => {
    const followees = warmUp()?.followees ?? [];
    return {
      type: "nostr",
      // ルーティング表に任せる。relays は指定しない (Outbox)
      filters: followees.length > 0 ? [{ kinds: [1], authors: followees }] : [],
    };
  });

  const section = createSection({ source, store, manager });

  // section.status() は「今張っているリレーが片付いたか」しか知らない。
  // warmUpRouting がまだフォロー数を確定させていない間は source が
  // filters: [] を返し、0 リレー分の購読は購読対象が無いぶん瞬時に
  // vacuously 「settled」になってしまう — これはウォームアップ待ちであって
  // 本当の完了ではない。表示上はウォームアップが終わるまで initial に
  // 留めておく。
  const status = createMemo<SectionStatus>(() =>
    warmUp.loading ? { phase: "initial" } : section.status(),
  );

  // status() は SectionReader が接続の生死・EOSE・張り直しのたびに新しい
  // 通知を出す (onPlanChanged / onRelayComplete / onRelayUnreachable) —
  // つまり pool の接続数が変わりうる瞬間と同期している。ここへ写すことで
  // 1 秒間隔の setInterval では取り逃す速い settle (ローカルの
  // ECONNREFUSED は on-open/close がミリ秒単位で返る) でも確実に最新の
  // 高水位マークを拾える (Task 12 fix round 1: 30 接続予算 → 4 に絞った
  // ローカル e2e では、settled までが 1 秒未満で終わることがあり、
  // setInterval だけだと peakConnectionCount がシグナルへ一度も写らない
  // まま初期値 (0) を表示し続けてしまっていた)。
  //
  // setInterval は SectionReader の通知を経由しない変化 (今のところ無いが、
  // 将来 pool 側だけで完結する変化が増えても表示が固まらないための保険)
  // 用に残す。デバッグルート専用の割り切りであり、読み取り層には持ち込まない。
  createEffect(() => {
    status();
    syncConnectionSignals();
  });
  const connectionsInterval = setInterval(syncConnectionSignals, 1_000);
  onCleanup(() => clearInterval(connectionsInterval));

  const routes = createMemo(() =>
    (warmUp()?.followees ?? []).map((pubkey) => ({
      pubkey,
      relays: routing.writeRelaysFor(pubkey),
    })),
  );

  return (
    <div style={{ padding: "16px", "font-family": "monospace" }}>
      <h1>/debug/v1-section</h1>

      <section>
        <h2>viewer</h2>
        <input
          data-testid="viewer-input"
          style={{ width: "42rem" }}
          value={viewer()}
          onInput={(e) => setViewer(e.currentTarget.value.trim())}
          placeholder="hex pubkey (64 chars)"
        />
        <p data-testid="warmup">
          followees: {warmUp()?.followees.length ?? 0} / routed:{" "}
          {warmUp()?.routed ?? 0} / unroutable: {warmUp()?.unroutable ?? 0}
        </p>
      </section>

      <section>
        <h2>routing table</h2>
        <ul data-testid="routes">
          <For each={routes()}>
            {(route) => (
              <li data-testid="route">
                {route.pubkey.slice(0, 8)} →{" "}
                {route.relays.join(",") || "(none)"}
              </li>
            )}
          </For>
        </ul>
      </section>

      <section data-testid="relay-info">
        <h2>relay-info section (NIP-11)</h2>
        <Show
          when={relayInfo()}
          fallback={<p data-testid="relay-info-missing">no relay info</p>}
        >
          {(info) => (
            <ul>
              <li data-testid="relay-name">name: {info().name ?? "-"}</li>
              <li data-testid="relay-nips">
                supported_nips: {(info().supported_nips ?? []).join(",")}
              </li>
            </ul>
          )}
        </Show>
      </section>

      <section>
        <h2>nostr section (routed)</h2>
        <p data-testid="phase">phase: {status().phase}</p>
        <p data-testid="unreachable">
          unreachableRelays: {status().incomplete?.unreachableRelays ?? 0}
        </p>
        <p data-testid="unroutable">
          unroutableAuthors: {status().incomplete?.unroutableAuthors ?? 0}
        </p>
        <p data-testid="uncovered">
          uncoveredAuthors: {status().incomplete?.uncoveredAuthors ?? 0}
        </p>
        <p data-testid="connections">connections: {connections()}</p>
        <p data-testid="peak-connections">
          peakConnections: {peakConnections()}
        </p>
        <p data-testid="count">items: {section.items().length}</p>
        <ul data-testid="items">
          <For each={section.items()}>
            {(event) => (
              <li data-testid="item">
                {event.created_at} / {event.content}
              </li>
            )}
          </For>
        </ul>
      </section>
    </div>
  );
};

export default V1SectionDebug;
