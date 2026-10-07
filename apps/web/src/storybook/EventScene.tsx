import type { MuteEntry } from "@streets/core/moderation/mute-list";
import {
  createMuteMatcher,
  mutedPeople,
} from "@streets/core/moderation/mute-match";
import {
  type EventAddress,
  formatEventAddress,
} from "@streets/core/nostr/address";
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
  buildReplyTo,
} from "@streets/core/nostr/build/note";
import { buildReaction } from "@streets/core/nostr/build/reaction";
import { buildRepost } from "@streets/core/nostr/build/repost";
import { buildUserStatus } from "@streets/core/nostr/build/user-status";
import { favoriteChannels } from "@streets/core/nostr/channel";
import type { NostrEvent } from "@streets/core/nostr/event";
import { followeesFrom } from "@streets/core/nostr/follow-list";
import type { Nip05Lookup } from "@streets/core/nostr/nip05";
import {
  PINNED_NOTES_KIND,
  pinNote,
  pinnedNoteIds,
  unpinNote,
} from "@streets/core/nostr/pinned-notes";
import { buildPollResponse, parsePoll } from "@streets/core/nostr/poll";
import type { AddressRequests } from "@streets/core/read/address-requests";
import type { EngagementRequests } from "@streets/core/read/engagement-requests";
import type { EventRequests } from "@streets/core/read/event-requests";
import { EventStore } from "@streets/core/read/event-store";
import { createReadLookups } from "@streets/core/read/lookups";
import type { PollRequests } from "@streets/core/read/poll-requests";
import type { ProfileRequests } from "@streets/core/read/profile-requests";
import type { RelayUrl } from "@streets/core/relay/relay-connection";
import { WriteFailedError } from "@streets/core/write/writer";
import { useQueryClient } from "@tanstack/solid-query";
import {
  type JSX,
  type ParentComponent,
  Show,
  createSignal,
  onCleanup,
} from "solid-js";
import { type EventActions, EventActionsProvider } from "../actions";
import { ActionsMediator } from "../actions-mediator";
import { type LinkCard, linkCardQueryKey } from "../note/link-card";
import { ReadLayerProvider } from "../read-layer";
import { MuteContext } from "../settings/MuteMediator";
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
  /** ミュートの一覧。省くとミュートの段を置かず、何も隠さない。 */
  mutes?: readonly MuteEntry[];
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
  const [pins, setPins] = createSignal(
    store.latestReplaceable(PINNED_NOTES_KIND, viewer.pubkey),
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
      send(() => viewer.event(buildReplyTo(target, content))),
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
    setStatus: (input) => send(() => viewer.event(buildUserStatus(input))),
    repost: (target) =>
      send(() => {
        const draft = buildRepost(target);
        if (!draft) throw new Error("この投稿はリポストできません");
        return viewer.event(draft);
      }),
    react: (target, input) =>
      send(() => viewer.event(buildReaction(target, input))),
    vote: (target, choices) =>
      send(() => {
        const poll = parsePoll(target);
        if (!poll) throw new Error("この投稿には投票できません");
        return viewer.event(buildPollResponse(poll, choices));
      }),
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
    broadcastTargets: () => ({
      mine: [STORY_RELAY],
      author: [STORY_RELAY],
    }),
    broadcast: async () => {
      await new Promise((resolve) => setTimeout(resolve, SEND_DELAY_MS));
      if (failWrites) {
        throw new WriteFailedError([{ relay: STORY_RELAY, reason: "blocked" }]);
      }
    },
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
    pinned: (id) => pinnedNoteIds(pins()).includes(id),
    setPinned: (target, on) =>
      send(() => {
        const next = viewer.event(
          (on ? pinNote : unpinNote)(target.id)(pins()),
        );
        setPins(next);
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

/** 並べていない住所は、要求の後で見つからなかったことにする。 */
const addressRequestsFor = (store: EventStore): AddressRequests => {
  const listeners = new Set<() => void>();
  const requested = new Set<string>();
  const stored = (address: EventAddress) =>
    store.latestReplaceable(address.kind, address.pubkey, address.identifier);
  return {
    request(address) {
      requested.add(formatEventAddress(address));
      queueMicrotask(() => {
        for (const listener of listeners) listener();
      });
    },
    isUnresolved: (address) =>
      requested.has(formatEventAddress(address)) && !stored(address),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      listeners.clear();
    },
  };
};

/** 投票への回答は、並べたものだけを取り終えたことにする。 */
const settledPolls = (): PollRequests => {
  const listeners = new Set<() => void>();
  const settled = new Set<string>();
  return {
    request(id) {
      queueMicrotask(() => {
        settled.add(id);
        for (const listener of listeners) listener();
      });
    },
    isSettled: (id) => settled.has(id),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
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
  const addresses = addressRequestsFor(store);
  onCleanup(() => {
    events.dispose();
    addresses.dispose();
  });
  const lookups = createReadLookups({
    store,
    events,
    addresses,
    profiles: inertRequests(),
    engagements: inertRequests(),
    polls: settledPolls(),
    // 手元の一覧だけで答える。取りにいかない。
    followLists: { request() {}, dispose() {} },
  });

  // 中身は Provider の中で読む。外で読むと、ミュートの段が見えないまま作られる。
  const withMutes = (children: () => JSX.Element) => (
    <Show when={props.scene.mutes} fallback={children()}>
      {(entries) => {
        const hides = createMuteMatcher(entries(), props.scene.viewer?.pubkey);
        const people = mutedPeople(entries(), props.scene.viewer?.pubkey);
        return (
          <MuteContext.Provider
            value={{
              entries: () => [...entries()],
              loading: () => false,
              privatePart: () => "ready",
              hides,
              mutesPerson: (pubkey) => people.has(pubkey),
            }}
          >
            {children()}
          </MuteContext.Provider>
        );
      }}
    </Show>
  );

  return (
    <ReadLayerProvider value={{ store, lookups }}>
      <Show
        when={props.scene.viewer}
        fallback={withMutes(() => props.children)}
      >
        {(viewer) => {
          const actions = storyActions(
            store,
            viewer(),
            props.scene.failWrites ?? false,
          );
          return (
            <EventActionsProvider value={actions}>
              <ActionsMediator actions={actions}>
                {withMutes(() => props.children)}
              </ActionsMediator>
            </EventActionsProvider>
          );
        }}
      </Show>
    </ReadLayerProvider>
  );
};
