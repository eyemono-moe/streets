import { type JSX, type ParentComponent, Show, createMemo } from "solid-js";
import { type MuteEntry, matchingMutes } from "../core/moderation/mute-list";
import type { NostrEvent } from "../core/nostr/event";
import type { EventRequests } from "../core/read/event-requests";
import { EventStore } from "../core/read/event-store";
import type { ProfileRequests } from "../core/read/profile-requests";
import type { ReactionRequests } from "../core/read/reaction-requests";
import {
  type RenderContextValue,
  RenderProvider,
} from "../core/view/render-context";
import { type MuteList, MuteListProvider } from "../routes/v1/mute-list";
import { defaultRenderers } from "../routes/v1/renderers";
import { ThreadNavProvider } from "../routes/v1/thread-nav";

export type EventScene = {
  events: readonly NostrEvent[];
  viewerPubkey?: string;
  unresolvedEventIds?: readonly string[];
  mutes?: readonly MuteEntry[];
};

const inertRequests = (): ProfileRequests & ReactionRequests => ({
  request() {},
  subscribe() {
    return () => {};
  },
  lastBatchSize: 0,
  maxBatchSize: 0,
  dispose() {},
});

const eventRequestsFor = (
  unresolvedIds: ReadonlySet<string>,
): EventRequests => {
  const listeners = new Set<() => void>();
  const requested = new Set<string>();
  let notifyQueued = false;

  const queueNotify = () => {
    if (notifyQueued) return;
    notifyQueued = true;
    queueMicrotask(() => {
      notifyQueued = false;
      for (const listener of listeners) listener();
    });
  };

  return {
    request(id) {
      requested.add(id);
      if (unresolvedIds.has(id)) queueNotify();
    },
    isUnresolved(id) {
      return requested.has(id) && unresolvedIds.has(id);
    },
    subscribe(listener) {
      listeners.add(listener);
      if ([...requested].some((id) => unresolvedIds.has(id))) queueNotify();
      return () => listeners.delete(listener);
    },
    lastBatchSize: 0,
    maxBatchSize: 0,
    dispose() {
      listeners.clear();
      requested.clear();
    },
  };
};

const muteListFor = (entries: readonly MuteEntry[]): MuteList => ({
  state: () => ({
    phase: "ready",
    entries,
    privatePart: "ready",
  }),
  saving: () => false,
  error: () => undefined,
  async refresh() {},
  matches(event) {
    return matchingMutes(entries, event);
  },
  async add() {},
  async remove() {},
  async move() {},
});

const contextFor = (scene: EventScene): RenderContextValue => {
  const store = new EventStore();
  for (const event of scene.events) {
    const result = store.put(event, "wss://storybook.invalid/");
    if (result === "rejected") {
      throw new Error(`Story のイベントを検証できませんでした: ${event.id}`);
    }
  }
  return {
    store,
    events: eventRequestsFor(new Set(scene.unresolvedEventIds ?? [])),
    profiles: inertRequests(),
    reactions: inertRequests(),
    viewerPubkey: scene.viewerPubkey,
    renderers: defaultRenderers,
  };
};

/**
 * Story が宣言したイベント列を、本番と同じ描画 context へ変換する。
 * Store・requests・renderer 登録はここに閉じ、Story 側へ配線を漏らさない。
 */
export const EventSceneProvider: ParentComponent<{ scene: EventScene }> = (
  props,
): JSX.Element => {
  const context = createMemo(() => contextFor(props.scene));
  const muteList = createMemo(() =>
    props.scene.mutes ? muteListFor(props.scene.mutes) : undefined,
  );

  return (
    <RenderProvider value={context()}>
      <ThreadNavProvider open={() => {}}>
        <Show when={muteList()} fallback={props.children}>
          {(list) => (
            <MuteListProvider value={list()}>{props.children}</MuteListProvider>
          )}
        </Show>
      </ThreadNavProvider>
    </RenderProvider>
  );
};
