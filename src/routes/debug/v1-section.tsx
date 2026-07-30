import { For, Show, createMemo, createResource, createSignal } from "solid-js";
import { EventStore } from "../../core/read/event-store";
import type { NostrSource } from "../../core/read/source";
import type { RelayUrl } from "../../core/relay/relay-connection";
import { RelayInfoRegistry } from "../../core/relay/relay-info";
import { connectRelay } from "../../core/relay/websocket-relay-connection";
import { createSection } from "../../core/solid/create-section";

const DEFAULT_RELAY: RelayUrl = "ws://127.0.0.1:8080";

const V1SectionDebug = () => {
  const [relayUrl] = createSignal<RelayUrl>(DEFAULT_RELAY);
  const store = new EventStore();
  const registry = new RelayInfoRegistry();

  // NIP-11 セクション: Nostr イベントですらない供給元 (ADR-0003)
  const [relayInfo] = createResource(relayUrl, (url) => registry.get(url));

  const source = createMemo<NostrSource>(() => ({
    type: "nostr",
    filters: [{ kinds: [1], limit: 500 }],
    relays: [relayUrl()],
  }));

  const section = createSection({ source, store, openRelay: connectRelay });

  return (
    <div style={{ padding: "16px", "font-family": "monospace" }}>
      <h1>/debug/v1-section</h1>

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
              <li data-testid="relay-max-limit">
                max_limit: {info().limitation?.max_limit ?? "-"}
              </li>
            </ul>
          )}
        </Show>
      </section>

      <section>
        <h2>nostr section</h2>
        <p data-testid="phase">phase: {section.status().phase}</p>
        <p data-testid="unreachable">
          unreachableRelays:{" "}
          {section.status().incomplete?.unreachableRelays ?? 0}
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
