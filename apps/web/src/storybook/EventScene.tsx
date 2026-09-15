import type { NostrEvent } from "@streets/core/nostr/event";
import type { EventRequests } from "@streets/core/read/event-requests";
import { EventStore } from "@streets/core/read/event-store";
import type { ProfileRequests } from "@streets/core/read/profile-requests";
import { type ParentComponent, onCleanup } from "solid-js";
import { ReadLayerProvider } from "../read-layer";

export type EventScene = {
  events: readonly NostrEvent[];
  /** 取りにいっても見つからなかった扱いにする id。ここにも events にも無い id は読み込み中のまま。 */
  missingIds?: readonly string[];
};

const inertProfiles = (): ProfileRequests => ({
  request() {},
  subscribe: () => () => {},
  lastBatchSize: 0,
  maxBatchSize: 0,
  dispose() {},
});

const eventRequestsFor = (missing: ReadonlySet<string>): EventRequests => {
  const listeners = new Set<() => void>();
  const requested = new Set<string>();
  return {
    request(id) {
      requested.add(id);
      if (!missing.has(id)) return;
      // 本番のコアレッサと同じく、要求の後で非同期に「バッチが片付いた」を知らせる。
      queueMicrotask(() => {
        for (const listener of listeners) listener();
      });
    },
    isUnresolved: (id) => requested.has(id) && missing.has(id),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    lastBatchSize: 0,
    maxBatchSize: 0,
    dispose() {
      listeners.clear();
    },
  };
};

/** ストーリーが並べたイベントだけを持つ読み取り層を渡す。リレーには繋がない。 */
export const EventSceneProvider: ParentComponent<{ scene: EventScene }> = (
  props,
) => {
  const store = new EventStore();
  for (const event of props.scene.events) {
    if (store.put(event, "wss://storybook.invalid/") === "rejected") {
      throw new Error(
        `ストーリーのイベントを検証できませんでした: ${event.id}`,
      );
    }
  }
  const events = eventRequestsFor(new Set(props.scene.missingIds));
  const profiles = inertProfiles();
  onCleanup(() => events.dispose());

  return (
    <ReadLayerProvider value={{ store, events, profiles }}>
      {props.children}
    </ReadLayerProvider>
  );
};
