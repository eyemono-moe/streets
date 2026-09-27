import {
  addBookmark,
  removeBookmark,
} from "@streets/core/nostr/build/bookmark";
import {
  addFavoriteChannel,
  buildChannelCreate,
  buildChannelMessage,
  buildChannelMetadata,
  buildHideMessage,
  buildMuteUser,
  removeFavoriteChannel,
} from "@streets/core/nostr/build/channel";
import { addFollow, removeFollow } from "@streets/core/nostr/build/follow";
import {
  buildNote,
  buildQuote,
  buildReply,
} from "@streets/core/nostr/build/note";
import { buildReaction } from "@streets/core/nostr/build/reaction";
import { buildRepost } from "@streets/core/nostr/build/repost";
import { favoriteChannels } from "@streets/core/nostr/channel";
import type { NostrEvent } from "@streets/core/nostr/event";
import { followeesFrom } from "@streets/core/nostr/follow-list";
import type { Nip05Lookup } from "@streets/core/nostr/nip05";
import type { EngagementRequests } from "@streets/core/read/engagement-requests";
import type { EventRequests } from "@streets/core/read/event-requests";
import { EventStore } from "@streets/core/read/event-store";
import type { ProfileRequests } from "@streets/core/read/profile-requests";
import type { RelayUrl } from "@streets/core/relay/relay-connection";
import { WriteFailedError } from "@streets/core/write/writer";
import { useQueryClient } from "@tanstack/solid-query";
import { type ParentComponent, Show, createSignal, onCleanup } from "solid-js";
import { type EventActions, EventActionsProvider } from "../actions";
import { ActionsMediator } from "../actions-mediator";
import { type LinkCard, linkCardQueryKey } from "../note/link-card";
import { ReadLayerProvider } from "../read-layer";
import { useStoryNip05 } from "./nip05";
import type { StoryAuthor } from "./story-events";

export type EventScene = {
  events: readonly NostrEvent[];
  /** 取りにいっても見つからなかった扱いにする id。ここにも events にも無い id は読み込み中のまま。 */
  missingIds?: readonly string[];
  /** ログイン中の人。指定すると操作を出し、押した結果を署名してシーンの store へ入れる。 */
  viewer?: StoryAuthor;
  /** 書き込みを全リレーに拒否された扱いにする。 */
  failWrites?: boolean;
  /**
   * リンクのカードの答え。取得口へは取りに行かず、この答えを使う。`null` は
   * 取れなかった扱い。ここに無い URL は、Storybook では取れずにカードが出ない。
   */
  linkCards?: Record<string, LinkCard | null>;
  /** NIP-05 の答え。ここに無い宛先は、Storybook からドメインへ聞きに行ってしまう。 */
  nip05?: Record<string, Nip05Lookup>;
};

const STORY_RELAY = "wss://storybook.invalid/" as RelayUrl;
// 送信中の見た目を確かめられるだけの間を置く。
const SEND_DELAY_MS = 600;

const storyActions = (
  store: EventStore,
  viewer: StoryAuthor,
  failWrites: boolean,
): EventActions => {
  const send = async (event: () => NostrEvent) => {
    await new Promise((resolve) => setTimeout(resolve, SEND_DELAY_MS));
    if (failWrites) {
      throw new WriteFailedError([{ relay: STORY_RELAY, reason: "blocked" }]);
    }
    store.put(event(), STORY_RELAY);
  };
  const [bookmarks, setBookmarks] = createSignal(
    store.latestReplaceable(10003, viewer.pubkey),
  );
  const [follows, setFollows] = createSignal(
    store.latestReplaceable(3, viewer.pubkey),
  );
  const [publicChats, setPublicChats] = createSignal(
    store.latestReplaceable(10005, viewer.pubkey),
  );
  const bookmarkIds = () =>
    bookmarks()
      ?.tags.filter((tag) => tag[0] === "e" && tag[1])
      .map((tag) => tag[1] as string) ?? [];
  return {
    viewer: viewer.pubkey,
    bookmarkIds,
    post: (content) => send(() => viewer.event(buildNote(content))),
    reply: (target, content) =>
      send(() => viewer.event(buildReply(target, content))),
    quote: (target, content) =>
      send(() => viewer.event(buildQuote(target, content))),
    channelMessage: (channel, content, options) =>
      send(() =>
        viewer.event(
          buildChannelMessage(channel.id, content, {
            replyTo: options?.replyTo,
          }),
        ),
      ),
    repost: (target) =>
      send(() => {
        const draft = buildRepost(target);
        if (!draft) throw new Error("この投稿はリポストできません");
        return viewer.event(draft);
      }),
    react: (target, input) =>
      send(() => viewer.event(buildReaction(target, input))),
    createChannel: async (input) => {
      const event = viewer.event(buildChannelCreate(input));
      await send(() => event);
      return event.id;
    },
    editChannel: (channelId, input) =>
      send(() => viewer.event(buildChannelMetadata(channelId, input))),
    muteInChat: (kind, target, reason) =>
      send(() =>
        viewer.event(
          kind === "message"
            ? buildHideMessage(target.messageId, reason)
            : buildMuteUser(target.pubkey, reason),
        ),
      ),
    favoriteChannelIds: () => favoriteChannels(publicChats()),
    setFavoriteChannel: (id, on) =>
      send(() => {
        const next = viewer.event(
          (on ? addFavoriteChannel(id) : removeFavoriteChannel(id))(
            publicChats(),
          ),
        );
        setPublicChats(next);
        return next;
      }),
    followeeIds: () => followeesFrom(follows()),
    following: (pubkey) => followeesFrom(follows()).includes(pubkey),
    setFollow: (pubkey, on) =>
      send(() => {
        const next = viewer.event(
          (on ? addFollow(pubkey) : removeFollow(pubkey))(follows()),
        );
        setFollows(next);
        return next;
      }),
    bookmarked: (id) => bookmarkIds().includes(id),
    setBookmark: (target, on) =>
      send(() => {
        const mutation = on ? addBookmark : removeBookmark;
        const next = viewer.event(
          mutation({ type: "note", value: target.id })(bookmarks()),
        );
        setBookmarks(next);
        return next;
      }),
  };
};

const inertRequests = (): ProfileRequests & EngagementRequests => ({
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
    if (store.put(event, STORY_RELAY) === "rejected") {
      throw new Error(
        `ストーリーのイベントを検証できませんでした: ${event.id}`,
      );
    }
  }
  const queryClient = useQueryClient();
  for (const [url, card] of Object.entries(props.scene.linkCards ?? {})) {
    queryClient.setQueryData(linkCardQueryKey(url), card);
  }
  useStoryNip05(props.scene.nip05 ?? {});
  const events = eventRequestsFor(new Set(props.scene.missingIds));
  const profiles = inertRequests();
  const engagements = inertRequests();
  onCleanup(() => events.dispose());

  return (
    <ReadLayerProvider
      value={{
        store,
        events,
        profiles,
        engagements,
      }}
    >
      <Show when={props.scene.viewer} fallback={props.children}>
        {(viewer) => {
          const actions = storyActions(
            store,
            viewer(),
            props.scene.failWrites ?? false,
          );
          return (
            <EventActionsProvider value={actions}>
              <ActionsMediator actions={actions}>
                {props.children}
              </ActionsMediator>
            </EventActionsProvider>
          );
        }}
      </Show>
    </ReadLayerProvider>
  );
};
