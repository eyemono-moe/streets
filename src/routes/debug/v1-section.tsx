import { For, Show, createMemo, createResource, createSignal } from "solid-js";
import { warmUpRouting } from "../../core/read/bootstrap";
import { EventStore } from "../../core/read/event-store";
import { RoutingTable } from "../../core/read/routing-table";
import type { NostrSource, SectionStatus } from "../../core/read/source";
import { SubscriptionManager } from "../../core/read/subscription-manager";
import type { RelayUrl } from "../../core/relay/relay-connection";
import { RelayInfoRegistry } from "../../core/relay/relay-info";
import { connectRelay } from "../../core/relay/websocket-relay-connection";
import { createSection } from "../../core/solid/create-section";

// リレー2 (ws://127.0.0.1:8081/) は Outbox ルーティングが著者 B の
// kind:10002 から自動で見つける。ここで直接参照する必要はない。
const RELAY_ONE: RelayUrl = "ws://127.0.0.1:8080/";
/** e2e/fixtures/seed-outbox.ts の outboxViewerPubkey と一致させること */
const DEFAULT_VIEWER =
  new URLSearchParams(window.location.search).get("pubkey") ?? "";

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
  });

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
      connect: connectRelay,
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
