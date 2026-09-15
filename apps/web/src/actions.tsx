import {
  addBookmark,
  removeBookmark,
} from "@streets/core/nostr/build/bookmark";
import { buildReply } from "@streets/core/nostr/build/note";
import {
  type ReactionInput,
  buildReaction,
} from "@streets/core/nostr/build/reaction";
import { buildRepost } from "@streets/core/nostr/build/repost";
import type { NostrEvent } from "@streets/core/nostr/event";
import { FALLBACK_RELAYS } from "@streets/core/read/default-relays";
import type { ReadLayer } from "@streets/core/read/read-layer";
import { normalizeRelayUrl } from "@streets/core/relay/relay-url";
import type { Signer } from "@streets/core/signer/signer";
import { SignerUnavailableError } from "@streets/core/signer/signer";
import {
  RefetchFailedError,
  fetchLatest,
} from "@streets/core/write/fetch-latest";
import { createPublisher } from "@streets/core/write/publisher";
import { WriteFailedError, createWriter } from "@streets/core/write/writer";
import {
  type ParentComponent,
  createContext,
  createSignal,
  onCleanup,
  useContext,
} from "solid-js";

const BOOKMARK_KIND = 10003;

export type EventActions = {
  viewer: string;
  reply(target: NostrEvent, content: string): Promise<void>;
  repost(target: NostrEvent): Promise<void>;
  react(target: NostrEvent, input: ReactionInput): Promise<void>;
  /** 自分のブックマーク（kind:10003）に入っているか。一覧が届くと変わる。 */
  bookmarked(id: string): boolean;
  setBookmark(target: NostrEvent, on: boolean): Promise<void>;
};

export const createEventActions = (options: {
  readLayer: Pick<ReadLayer, "store" | "routing" | "manager">;
  signer: Signer;
  viewer: string;
}): EventActions => {
  const { store, routing, manager } = options.readLayer;
  const target = {
    pool: manager.pool,
    routing,
    store,
    fallbackRelays: FALLBACK_RELAYS,
  };
  const writer = createWriter({
    signer: options.signer,
    store,
    publisher: createPublisher(target),
    pubkey: () => options.viewer,
    fetchLatest: (kind, identifier, pubkey) =>
      fetchLatest(target, kind, identifier, pubkey),
  });

  const relayHintFor = (id: string) =>
    store
      .seenRelays(id)
      .map(normalizeRelayUrl)
      .find((relay) => relay !== undefined);

  const [bookmarks, setBookmarks] = createSignal(
    store.latestReplaceable(BOOKMARK_KIND, options.viewer),
  );
  onCleanup(
    store.onReplaceableChanged((change) => {
      if (change.kind !== BOOKMARK_KIND || change.pubkey !== options.viewer) {
        return;
      }
      setBookmarks(store.latestReplaceable(BOOKMARK_KIND, options.viewer));
    }),
  );
  // 押す前から付いているかを出すため、ログイン時に一度だけ引いておく。届かなくても押せば replace が引き直す。
  void fetchLatest(target, BOOKMARK_KIND, undefined, options.viewer).catch(
    () => {},
  );

  return {
    viewer: options.viewer,
    async reply(event, content) {
      await writer.publish(
        buildReply(event, content, { relayHint: relayHintFor(event.id) }),
      );
    },
    async repost(event) {
      const draft = buildRepost(event, { relayHint: relayHintFor(event.id) });
      if (!draft) throw new Error("この投稿はリポストできません");
      await writer.publish(draft);
    },
    async react(event, input) {
      await writer.publish(buildReaction(event, input));
    },
    bookmarked: (id) =>
      bookmarks()?.tags.some((tag) => tag[0] === "e" && tag[1] === id) ?? false,
    async setBookmark(event, on) {
      const mutation = (on ? addBookmark : removeBookmark)({
        type: "note",
        value: event.id,
      });
      await writer.replace(BOOKMARK_KIND, undefined, mutation);
    },
  };
};

export const actionErrorMessage = (error: unknown): string => {
  if (error instanceof WriteFailedError) {
    return `どのリレーにも届きませんでした（${error.rejected.length} 本が拒否）`;
  }
  if (error instanceof RefetchFailedError) {
    return "今のブックマークを取得できませんでした。時間をおいて再試行してください";
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

/** ログインしていない場所（Storybook の一部など）では undefined。操作を出さない。 */
export const useEventActions = (): EventActions | undefined =>
  useContext(EventActionsContext);
