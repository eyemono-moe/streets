import { type ParentComponent, createContext, useContext } from "solid-js";
import { buildReply } from "../../core/nostr/build/note";
import { buildReaction } from "../../core/nostr/build/reaction";
import { buildRepost } from "../../core/nostr/build/repost";
import type { NostrEvent } from "../../core/nostr/event";
import type { EventStore } from "../../core/read/event-store";
import { normalizeRelayUrl } from "../../core/relay/relay-url";
import { SignerUnavailableError } from "../../core/signer/signer";
import { WriteFailedError } from "../../core/write/writer";
import type { ProjectedWriter } from "./projected-writer";

export type EventActions = {
  reply(target: NostrEvent, content: string): Promise<void>;
  repost(target: NostrEvent): Promise<void>;
  like(target: NostrEvent): Promise<void>;
};

const relayHintFor = (store: Pick<EventStore, "seenRelays">, eventId: string) =>
  store
    .seenRelays(eventId)
    .map(normalizeRelayUrl)
    .find((relay) => relay !== undefined);

/**
 * UI からは target と本文だけを受け、NIP ごとの builder、リレーヒント、
 * 楽観表示付き Writer を内側に隠す。RenderContext に書き込み依存を混ぜない。
 */
export const createEventActions = (options: {
  writer: Pick<ProjectedWriter, "publish">;
  store: Pick<EventStore, "seenRelays">;
}): EventActions => ({
  async reply(target, content) {
    await options.writer.publish(
      buildReply(target, content, {
        relayHint: relayHintFor(options.store, target.id),
      }),
    );
  },
  async repost(target) {
    const draft = buildRepost(target, {
      relayHint: relayHintFor(options.store, target.id),
    });
    if (!draft) throw new Error("このイベントはリポストできません");
    await options.writer.publish(draft);
  },
  async like(target) {
    await options.writer.publish(buildReaction(target, { type: "like" }));
  },
});

export const eventActionErrorMessage = (error: unknown): string => {
  if (error instanceof WriteFailedError) {
    return `どのリレーにも届きませんでした（${error.rejected.length}本が拒否）`;
  }
  if (error instanceof SignerUnavailableError) {
    return "署名器を利用できません。ログインし直してください";
  }
  return `送信に失敗しました: ${error instanceof Error ? error.message : String(error)}`;
};

const EventActionsContext = createContext<EventActions>();

export const EventActionsProvider: ParentComponent<{ value: EventActions }> = (
  props,
) => (
  <EventActionsContext.Provider value={props.value}>
    {props.children}
  </EventActionsContext.Provider>
);

export const useOptionalEventActions = (): EventActions | undefined =>
  useContext(EventActionsContext);
