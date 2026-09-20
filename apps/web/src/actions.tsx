import {
  addBookmark,
  removeBookmark,
} from "@streets/core/nostr/build/bookmark";
import { addFollow, removeFollow } from "@streets/core/nostr/build/follow";
import {
  buildNote,
  buildQuote,
  buildReply,
} from "@streets/core/nostr/build/note";
import {
  type ReactionInput,
  buildReaction,
} from "@streets/core/nostr/build/reaction";
import { buildRepost } from "@streets/core/nostr/build/repost";
import type { NostrEvent } from "@streets/core/nostr/event";
import { followeesFrom } from "@streets/core/nostr/follow-list";
import { FALLBACK_RELAYS } from "@streets/core/read/default-relays";
import type { ReadLayer } from "@streets/core/read/read-layer";
import { normalizeRelayUrl } from "@streets/core/relay/relay-url";
import type { Signer } from "@streets/core/signer/signer";
import { fetchLatest } from "@streets/core/write/fetch-latest";
import { createPublisher } from "@streets/core/write/publisher";
import { type Writer, createWriter } from "@streets/core/write/writer";
import {
  type Accessor,
  type ParentComponent,
  createContext,
  createSignal,
  onCleanup,
  useContext,
} from "solid-js";
import { trackWrites } from "./write-progress";

const BOOKMARK_KIND = 10003;
const FOLLOW_KIND = 3;
const RELAY_LIST_KIND = 10002;
const MUTE_KIND = 10000;
const PROFILE_KIND = 0;

export type EventActions = {
  viewer: string;
  /** ブックマークしたノートの id。ブックマークのカラムが購読に使う。 */
  bookmarkIds(): readonly string[];
  post(content: string): Promise<void>;
  reply(target: NostrEvent, content: string): Promise<void>;
  quote(target: NostrEvent, content: string): Promise<void>;
  repost(target: NostrEvent): Promise<void>;
  react(target: NostrEvent, input: ReactionInput): Promise<void>;
  /** 自分のブックマーク（kind:10003）に入っているか。一覧が届くと変わる。 */
  bookmarked(id: string): boolean;
  setBookmark(target: NostrEvent, on: boolean): Promise<void>;
  /** 自分がフォローしている人（kind:3）。カラムの購読にも使う。 */
  followeeIds(): readonly string[];
  following(pubkey: string): boolean;
  setFollow(pubkey: string, on: boolean): Promise<void>;
};

export type WriteStack = {
  actions: EventActions;
  /** NIP-78 の文書（デッキなど）とリレーの設定が置換に使う。 */
  writer: Pick<Writer, "replace">;
  /** 自分のリレーの一覧（kind:10002）。 */
  relayList: Accessor<NostrEvent | undefined>;
  /** リレーの一覧を一度取りに行き終えたか。まだなら「無い」とは言えない。 */
  relayListSettled: Accessor<boolean>;
  /** 自分のミュートの一覧（kind:10000）。非公開の項目は暗号化されたまま。 */
  muteList: Accessor<NostrEvent | undefined>;
  muteListSettled: Accessor<boolean>;
  /** 自分のプロフィール（kind:0）。 */
  profile: Accessor<NostrEvent | undefined>;
  fetchLatest(
    kind: number,
    identifier: string | undefined,
    pubkey: string,
  ): Promise<NostrEvent | undefined>;
};

export const createWriteStack = (options: {
  readLayer: Pick<ReadLayer, "store" | "routing" | "manager">;
  signer: Signer;
  viewer: string;
}): WriteStack => {
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

  // 何を書いたかを添えて、進み具合をトーストに出す（設定で切れる）。
  const tracked = (label: string) => trackWrites(writer, label);

  const relayHintFor = (id: string) =>
    store
      .seenRelays(id)
      .map(normalizeRelayUrl)
      .find((relay) => relay !== undefined);

  /** 自分の置換可能イベントを追う。届くたびに画面へ反映し、押す前から状態を出す。 */
  const mine = (kind: number) => {
    const [event, setEvent] = createSignal(
      store.latestReplaceable(kind, options.viewer),
    );
    const [settled, setSettled] = createSignal(event() !== undefined);
    onCleanup(
      store.onReplaceableChanged((change) => {
        if (change.kind !== kind || change.pubkey !== options.viewer) return;
        setEvent(store.latestReplaceable(kind, options.viewer));
      }),
    );
    // ログイン時に一度だけ引いておく。届かなくても、押せば replace が引き直す。
    void fetchLatest(target, kind, undefined, options.viewer)
      .catch(() => {})
      .finally(() => setSettled(true));
    return { event, settled };
  };

  const bookmarks = mine(BOOKMARK_KIND).event;
  const follows = mine(FOLLOW_KIND).event;
  const relayList = mine(RELAY_LIST_KIND);
  const muteList = mine(MUTE_KIND);
  const profile = mine(PROFILE_KIND);

  const bookmarkIds = () =>
    bookmarks()
      ?.tags.filter((tag) => tag[0] === "e" && tag[1])
      .map((tag) => tag[1] as string) ?? [];
  const followeeIds = () => followeesFrom(follows());

  const actions: EventActions = {
    viewer: options.viewer,
    bookmarkIds,
    async post(content) {
      await tracked("投稿").publish(buildNote(content));
    },
    async reply(event, content) {
      await tracked("返信").publish(
        buildReply(event, content, { relayHint: relayHintFor(event.id) }),
      );
    },
    async quote(event, content) {
      await tracked("引用").publish(
        buildQuote(event, content, { relayHint: relayHintFor(event.id) }),
      );
    },
    async repost(event) {
      const draft = buildRepost(event, { relayHint: relayHintFor(event.id) });
      if (!draft) throw new Error("この投稿はリポストできません");
      await tracked("リポスト").publish(draft);
    },
    async react(event, input) {
      await tracked("リアクション").publish(
        buildReaction(event, input, { relayHint: relayHintFor(event.id) }),
      );
    },
    bookmarked: (id) => bookmarkIds().includes(id),
    async setBookmark(event, on) {
      const mutation = (on ? addBookmark : removeBookmark)({
        type: "note",
        value: event.id,
      });
      await tracked("ブックマーク").replace(BOOKMARK_KIND, undefined, mutation);
    },
    followeeIds,
    following: (pubkey) => followeeIds().includes(pubkey),
    async setFollow(pubkey, on) {
      // 自分をフォローする操作は出さない。押せてしまうと kind:3 に自分が混ざる。
      if (pubkey === options.viewer) return;
      await tracked("フォロー").replace(
        FOLLOW_KIND,
        undefined,
        on ? addFollow(pubkey) : removeFollow(pubkey),
      );
    },
  };

  return {
    actions,
    writer,
    relayList: relayList.event,
    relayListSettled: relayList.settled,
    muteList: muteList.event,
    muteListSettled: muteList.settled,
    profile: profile.event,
    fetchLatest: (kind, identifier, pubkey) =>
      fetchLatest(target, kind, identifier, pubkey),
  };
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
