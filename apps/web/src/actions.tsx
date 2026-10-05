import type { BlobDescriptor } from "@streets/core/media/blossom";
import {
  addBookmark,
  removeBookmark,
} from "@streets/core/nostr/build/bookmark";
import {
  type ChannelMetadataInput,
  addFavoriteChannel,
  buildChannelCreate,
  buildChannelMessage,
  buildChannelMetadata,
  buildHideMessage,
  buildMuteUser,
  removeFavoriteChannel,
} from "@streets/core/nostr/build/channel";
import { withClientTag } from "@streets/core/nostr/build/client-tag";
import { withContentWarning } from "@streets/core/nostr/build/content-warning";
import { addFollow, removeFollow } from "@streets/core/nostr/build/follow";
import { withMedia } from "@streets/core/nostr/build/media";
import {
  buildNote,
  buildQuote,
  buildReplyTo,
} from "@streets/core/nostr/build/note";
import {
  type ReactionInput,
  buildReaction,
} from "@streets/core/nostr/build/reaction";
import {
  type EmojiLookup,
  withReferences,
} from "@streets/core/nostr/build/references";
import { buildRepost } from "@streets/core/nostr/build/repost";
import {
  type UserStatusInput,
  buildUserStatus,
} from "@streets/core/nostr/build/user-status";
import {
  CHANNEL_MESSAGE_KIND,
  PUBLIC_CHATS_KIND,
  favoriteChannels,
} from "@streets/core/nostr/channel";
import type { NostrEvent } from "@streets/core/nostr/event";
import { followeesFrom } from "@streets/core/nostr/follow-list";
import {
  PINNED_NOTES_KIND,
  pinNote,
  pinnedNoteIds,
  unpinNote,
} from "@streets/core/nostr/pinned-notes";
import { buildPollResponse, parsePoll } from "@streets/core/nostr/poll";
import { FALLBACK_RELAYS } from "@streets/core/read/default-relays";
import type { ReadLayer } from "@streets/core/read/read-layer";
import { relaysSeenOn } from "@streets/core/read/seen-relays";
import type { RelayUrl } from "@streets/core/relay/relay-connection";
import {
  BLOCKED_RELAY_LIST_KIND,
  type DecodedBlockedRelayList,
  decodeBlockedRelayList,
} from "@streets/core/settings/blocked-relay-list";
import type { Signer } from "@streets/core/signer/signer";
import { authorRelays, broadcast } from "@streets/core/write/broadcast";
import { fetchLatest } from "@streets/core/write/fetch-latest";
import { createPublisher } from "@streets/core/write/publisher";
import { type Writer, createWriter } from "@streets/core/write/writer";
import {
  type Accessor,
  type ParentComponent,
  createContext,
  createResource,
  createSignal,
  onCleanup,
  useContext,
} from "solid-js";
import { trackSends, trackWrites } from "./write-progress";

const BOOKMARK_KIND = 10003;
const FOLLOW_KIND = 3;
const RELAY_LIST_KIND = 10002;
const MUTE_KIND = 10000;
const PROFILE_KIND = 0;
const BLOSSOM_SERVERS_KIND = 10063;
const SEARCH_RELAY_LIST_KIND = 10007;
const EMOJI_LIST_KIND = 10030;

export type EventActions = {
  viewer: string;
  /** ブックマークしたノートの id。ブックマークのカラムが購読に使う。 */
  bookmarkIds(): readonly string[];
  /**
   * `emoji` は、本文の `:shortcode:` に `emoji` タグを付けるために引く先。
   * `contentWarning` は閲覧注意の理由（`undefined` は付けない、空文字は理由なし）。
   */
  post(
    content: string,
    media?: readonly BlobDescriptor[],
    emoji?: EmojiLookup,
    contentWarning?: string,
  ): Promise<void>;
  reply(
    target: NostrEvent,
    content: string,
    media?: readonly BlobDescriptor[],
    emoji?: EmojiLookup,
    contentWarning?: string,
  ): Promise<void>;
  quote(
    target: NostrEvent,
    content: string,
    media?: readonly BlobDescriptor[],
    emoji?: EmojiLookup,
    contentWarning?: string,
  ): Promise<void>;
  /**
   * チャンネルで発言する。`relays` はそのチャンネルを読むリレーで、自分の write
   * リレーに加えてそこへも送る（チャンネルの発言は著者でなくチャンネルで読まれる）。
   */
  channelMessage(
    channel: { id: string; relays: readonly RelayUrl[] },
    content: string,
    options?: {
      replyTo?: NostrEvent;
      media?: readonly BlobDescriptor[];
      emoji?: EmojiLookup;
    },
  ): Promise<void>;
  repost(target: NostrEvent): Promise<void>;
  /** 自分のいまの状態（NIP-38 の general）を置き換える。本文を空にすると消える。 */
  setStatus(input: UserStatusInput): Promise<void>;
  /** 投票（kind:1068）に答える。回答は、自分の write リレーと投票が指すリレーへ送る。 */
  vote(target: NostrEvent, choices: readonly string[]): Promise<void>;
  react(target: NostrEvent, input: ReactionInput): Promise<void>;
  /** 自分のブックマーク（kind:10003）に入っているか。一覧が届くと変わる。 */
  bookmarked(id: string): boolean;
  setBookmark(target: NostrEvent, on: boolean): Promise<void>;
  /** 自分のピン留め（kind:10001）に入っているか。 */
  pinned(id: string): boolean;
  setPinned(target: NostrEvent, on: boolean): Promise<void>;
  /** 自分がフォローしている人（kind:3）。カラムの購読にも使う。 */
  /**
   * チャンネルを作る（kind:40）。チャンネルのリレーへも送る。作ったチャンネルの
   * id を返す。
   */
  createChannel(input: ChannelMetadataInput): Promise<string>;
  /** チャンネルの情報を直す（kind:41）。作った人のものだけが採られる。 */
  editChannel(channelId: string, input: ChannelMetadataInput): Promise<void>;
  /**
   * チャット内でミュートする。`message` はその発言（kind:43）、`user` はその人
   * （kind:44）。チャンネルのリレーへも送る —— ほかの人の画面でも畳まれるように。
   */
  muteInChat(
    kind: "message" | "user",
    target: { messageId: string; pubkey: string },
    reason: string,
    relays: readonly RelayUrl[],
  ): Promise<void>;
  /** お気に入りのチャンネル（kind:10005 の公開の項目）。 */
  favoriteChannelIds(): readonly string[];
  setFavoriteChannel(id: string, on: boolean): Promise<void>;
  followeeIds(): readonly string[];
  following(pubkey: string): boolean;
  setFollow(pubkey: string, on: boolean): Promise<void>;
  /**
   * 見かけたイベントの送り直し先の候補。`mine` は自分の書き込みリレー、`author` は
   * 投稿した人の書き込みリレーと、返信先などの読み込みリレー。
   */
  broadcastTargets(target: NostrEvent): {
    mine: readonly RelayUrl[];
    author: readonly RelayUrl[];
  };
  /** 署名済みのイベントを、そのまま `relays` へ送り直す。 */
  broadcast(target: NostrEvent, relays: readonly RelayUrl[]): Promise<void>;
};

export type WriteStack = {
  actions: EventActions;
  /** 段ごとの書き込み（デッキ・リレーの設定の置換、リストの削除など）に使う。 */
  writer: Pick<Writer, "replace" | "publish">;
  /** 自分のリレーの一覧（kind:10002）。 */
  relayList: Accessor<NostrEvent | undefined>;
  /** リレーの一覧を一度取りに行き終えたか。まだなら「無い」とは言えない。 */
  relayListSettled: Accessor<boolean>;
  /** 自分のミュートの一覧（kind:10000）。非公開の項目は暗号化されたまま。 */
  muteList: Accessor<NostrEvent | undefined>;
  muteListSettled: Accessor<boolean>;
  /** 自分のプロフィール（kind:0）。 */
  profile: Accessor<NostrEvent | undefined>;
  /** 自分の画像のアップロード先（kind:10063。Blossom）。 */
  blossomServers: Accessor<NostrEvent | undefined>;
  searchRelays: Accessor<NostrEvent | undefined>;
  /**
   * 自分の繋がないリレー（kind:10006）を、非公開の項目まで復号したもの。
   * `from` は読んだ版で、一覧がまだ届いていなければ undefined。復号を 1 か所に
   * まとめるのは、拡張機能の署名器が復号のたびに確認を出すことがあるため。
   */
  blockedRelays: Accessor<
    (DecodedBlockedRelayList & { from: NostrEvent | undefined }) | undefined
  >;
  /** 自分の絵文字の一覧（kind:10030）。ピッカーに出すもの。 */
  emojiList: Accessor<NostrEvent | undefined>;
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
  /** 行き先が分からないときに送る先。開発時の `?relays=` で差し替える。 */
  fallbackRelays?: readonly RelayUrl[];
  /** 投稿に client タグを付けるか。送るたびに読む。 */
  clientTag?: () => boolean;
  /** 引用した先の作者に `p` を付けて知らせるか。送るたびに読む。無ければ知らせる。 */
  notifyQuoted?: () => boolean;
}): WriteStack => {
  const { store, routing, manager } = options.readLayer;
  const target = {
    pool: manager.pool,
    routing,
    store,
    fallbackRelays: options.fallbackRelays ?? FALLBACK_RELAYS,
  };
  const base = createWriter({
    signer: options.signer,
    store,
    publisher: createPublisher(target),
    pubkey: () => options.viewer,
    fetchLatest: (kind, identifier, pubkey) =>
      fetchLatest(target, kind, identifier, pubkey),
  });
  // 付けるかは送る直前に決める。付ける kind は withClientTag が選ぶ。
  const writer: Writer = {
    ...base,
    publish: (draft, hooks, publishOptions) =>
      base.publish(
        options.clientTag?.() ? withClientTag(draft) : draft,
        hooks,
        publishOptions,
      ),
  };

  // 何を書いたかを添えて、進み具合をトーストに出す（設定で切れる）。
  const tracked = (label: string) => trackWrites(writer, label);

  // 本文から足すタグの決め方。設定は送るたびに読む。
  const references = (emoji: EmojiLookup | undefined) => ({
    emoji,
    notifyQuoted: options.notifyQuoted?.() ?? true,
  });

  const seenRelays = (id: string) => relaysSeenOn(store, id);
  const relayHintFor = (id: string) => seenRelays(id)[0];

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
  const pins = mine(PINNED_NOTES_KIND).event;
  const publicChats = mine(PUBLIC_CHATS_KIND).event;
  const follows = mine(FOLLOW_KIND).event;
  const relayList = mine(RELAY_LIST_KIND);
  const muteList = mine(MUTE_KIND);
  const profile = mine(PROFILE_KIND);
  const blossomServers = mine(BLOSSOM_SERVERS_KIND);
  const searchRelays = mine(SEARCH_RELAY_LIST_KIND);
  const blockedRelayList = mine(BLOCKED_RELAY_LIST_KIND);
  // source を包むのは、一覧がまだ無い（undefined）ときも「無い」として読むため。
  const [blockedRelays] = createResource(
    () => ({ event: blockedRelayList.event() }),
    async ({ event }) => ({
      ...(await decodeBlockedRelayList(event, options.signer, options.viewer)),
      from: event,
    }),
  );
  const emojiList = mine(EMOJI_LIST_KIND);

  const bookmarkIds = () =>
    bookmarks()
      ?.tags.filter((tag) => tag[0] === "e" && tag[1])
      .map((tag) => tag[1] as string) ?? [];
  const followeeIds = () => followeesFrom(follows());

  const actions: EventActions = {
    viewer: options.viewer,
    bookmarkIds,
    async post(content, media, emoji, contentWarning) {
      await tracked("投稿").publish(
        withContentWarning(
          withMedia(
            withReferences(buildNote(content), references(emoji)),
            media ?? [],
          ),
          contentWarning,
        ),
      );
    },
    async reply(event, content, media, emoji, contentWarning) {
      await tracked("返信").publish(
        withContentWarning(
          withMedia(
            withReferences(
              buildReplyTo(event, content, {
                relayHint: relayHintFor(event.id),
              }),
              references(emoji),
            ),
            media ?? [],
          ),
          contentWarning,
        ),
      );
    },
    async quote(event, content, media, emoji, contentWarning) {
      await tracked("引用").publish(
        withContentWarning(
          withMedia(
            withReferences(
              buildQuote(event, content, { relayHint: relayHintFor(event.id) }),
              references(emoji),
            ),
            media ?? [],
          ),
          contentWarning,
        ),
      );
    },
    async channelMessage(channel, content, options) {
      await tracked("チャンネルでの発言").publish(
        withMedia(
          withReferences(
            buildChannelMessage(channel.id, content, {
              relayHint: channel.relays[0],
              replyTo: options?.replyTo,
            }),
            references(options?.emoji),
          ),
          options?.media ?? [],
        ),
        undefined,
        { relays: channel.relays },
      );
    },
    async setStatus(input) {
      await tracked("ステータス").publish(buildUserStatus(input));
    },
    async repost(event) {
      const draft = buildRepost(event, { relayHint: relayHintFor(event.id) });
      if (!draft) throw new Error("この投稿はリポストできません");
      await tracked("リポスト").publish(draft);
    },
    async vote(event, choices) {
      const poll = parsePoll(event);
      if (!poll) throw new Error("この投稿には投票できません");
      await tracked("投票").publish(
        buildPollResponse(poll, choices),
        undefined,
        poll.relays.length > 0 ? { relays: poll.relays } : undefined,
      );
    },
    async react(event, input) {
      await tracked("リアクション").publish(
        buildReaction(event, input, { relayHint: relayHintFor(event.id) }),
        undefined,
        // チャンネルの発言は、書き手ではなくチャンネルのリレーで読まれる。
        // 自分の write リレーだけに送ると、チャンネルにいる人にリアクションが見えない。
        event.kind === CHANNEL_MESSAGE_KIND
          ? { relays: seenRelays(event.id) }
          : undefined,
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
    pinned: (id) => pinnedNoteIds(pins()).includes(id),
    async setPinned(event, on) {
      await tracked("ピン留め").replace(
        PINNED_NOTES_KIND,
        undefined,
        (on ? pinNote : unpinNote)(event.id),
      );
    },
    async createChannel(input) {
      const result = await tracked("チャンネルを作る").publish(
        buildChannelCreate(input),
        undefined,
        { relays: input.relays },
      );
      return result.event.id;
    },
    async editChannel(channelId, input) {
      await tracked("チャンネルの情報").publish(
        buildChannelMetadata(channelId, input, input.relays[0]),
        undefined,
        { relays: input.relays },
      );
    },
    async muteInChat(kind, target, reason, relays) {
      await tracked("チャット内のミュート").publish(
        kind === "message"
          ? buildHideMessage(target.messageId, reason)
          : buildMuteUser(target.pubkey, reason),
        undefined,
        { relays },
      );
    },
    favoriteChannelIds: () => favoriteChannels(publicChats()),
    async setFavoriteChannel(id, on) {
      await tracked("お気に入り").replace(
        PUBLIC_CHATS_KIND,
        undefined,
        on ? addFavoriteChannel(id) : removeFavoriteChannel(id),
      );
    },
    broadcastTargets: (event) => ({
      mine: routing.writeRelaysFor(options.viewer),
      author: authorRelays(event, routing),
    }),
    async broadcast(event, relays) {
      await trackSends("ブロードキャスト", (onProgress) =>
        broadcast(manager.pool, event, relays, onProgress),
      );
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
    blossomServers: blossomServers.event,
    searchRelays: searchRelays.event,
    blockedRelays: () => blockedRelays.latest,
    emojiList: emojiList.event,
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
