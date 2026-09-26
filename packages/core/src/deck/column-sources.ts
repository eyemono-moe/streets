import {
  CHANNEL_CREATE_KIND,
  CHANNEL_HIDE_MESSAGE_KIND,
  CHANNEL_MESSAGE_KIND,
  CHANNEL_METADATA_KIND,
  CHANNEL_MUTE_USER_KIND,
} from "../nostr/channel";
import { FALLBACK_RELAYS } from "../read/default-relays";
import type { NostrSource } from "../read/source";
import type { RelayUrl } from "../relay/relay-connection";
import { parseSearchQuery, searchFilter } from "../search/query";
import type { RelayListState } from "../settings/relay-list-state";
import {
  type ColumnSourceOf,
  NOTIFICATION_KINDS,
  TIMELINE_KINDS,
} from "./column-kinds";

/*
 * デッキが保存する「意図」から、読み取り層へ渡す「クエリ」を作る。フォローリストの
 * ような変わる値はデッキへ焼き込まず、ここへ読むたびに渡す。`undefined` は
 * 「まだ分からない」で、ブロックはその間は購読を張らない。
 */

export const literalSource = (
  source: ColumnSourceOf<"literal">,
): NostrSource =>
  // `relays` は指定があるときだけ載せる。`relays: undefined` というキーを
  // 生やすと、明示リレーかどうかを `!== undefined` で見ている側から
  // 「リレー 0 本の明示指定」に見える。
  source.relays
    ? { type: "nostr", filters: source.filters, relays: source.relays }
    : { type: "nostr", filters: source.filters };

// フォロー 0 人でも `authors` を落とさない —— `{ kinds: [1] }` は
// NIP-01 では「誰の投稿でもよい」であり、本物のリレーへの無制限購読に
// なる。空配列は「該当者なし」であって「無制限」ではない。
// 自分をフォローしていなくても自分の投稿はホームに出す。フォロー一覧
// （kind:3）には書き足さず、読むときだけ足す。
export const followeesSource = (
  kinds: readonly number[],
  followees: readonly string[],
  viewer: string,
): NostrSource => ({
  type: "nostr",
  filters: [
    { kinds: [...kinds], authors: [...new Set([...followees, viewer])] },
  ],
});

// 著者を指定しない問い合わせなので Outbox で行き先を決められない。
// 検索に答えるリレー（設定か既定）へ明示的に送る。
export const searchSource = (
  query: string,
  relays: readonly RelayUrl[],
): NostrSource => ({
  type: "nostr",
  filters: [searchFilter(parseSearchQuery(query))],
  relays: [...relays],
});

/**
 * `#p` フィルタには `authors` が無いので Outbox でルーティングできない
 * (`query-plan.ts`: 著者を指定していないフィルタは fallback へ同報)。
 * NIP-65 は publish 側に「`#p` で指した相手の read リレーへも送る」を
 * SHOULD で求めているので、待ち受けるべきはそこ。
 */
export const notificationsSource = (
  viewer: string,
  relayList: RelayListState,
): NostrSource | undefined => {
  // 取得中は待つ。fallback へ一瞬購読してから本来の read リレーへ張り直すことを防ぐ。
  if (relayList.phase === "signed-out" || relayList.phase === "loading") {
    return undefined;
  }
  const readRelays =
    relayList.phase === "ready"
      ? relayList.entries
          .filter((entry) => entry.read)
          .map((entry) => entry.url)
      : [];
  return {
    type: "nostr",
    filters: [{ kinds: [...NOTIFICATION_KINDS], "#p": [viewer] }],
    // settle 後の空リストは永久に 0 本で待たず fallback へ落とす。
    relays: readRelays.length > 0 ? readRelays : [...FALLBACK_RELAYS],
  };
};

// 空配列は「該当なし」。`ids` ごと落とすと無制限購読になる。
export const bookmarksSource = (ids: readonly string[]): NostrSource => ({
  type: "nostr",
  filters: [{ ids: [...ids] }],
});

export const activitySource = (target: string): NostrSource => ({
  type: "nostr",
  filters: [
    { kinds: [6, 7, 16], "#e": [target] },
    { kinds: [1], "#q": [target] },
  ],
});

export const userPostsSource = (pubkey: string): NostrSource => ({
  type: "nostr",
  filters: [{ kinds: [...TIMELINE_KINDS], authors: [pubkey] }],
});

/** その人が付けたリアクション。 */
export const userReactionsSource = (pubkey: string): NostrSource => ({
  type: "nostr",
  filters: [{ kinds: [7], authors: [pubkey] }],
});

export const followListSource = (pubkey: string): NostrSource => ({
  type: "nostr",
  filters: [{ kinds: [3], authors: [pubkey], limit: 1 }],
});

export const followersSource = (pubkey: string): NostrSource => ({
  type: "nostr",
  filters: [{ kinds: [3], "#p": [pubkey] }],
});

/*
 * NIP-28 のチャンネル。著者で行き先が決まらないので、どれもリレーを明示して読む。
 * リレーがまだ 1 本も分からないうちは `undefined`（購読を張らない）。空配列を
 * 渡すと「0 本の明示指定」になり、何も届かないまま終わる。
 */
const withRelays = (
  filters: NostrSource["filters"],
  relays: readonly RelayUrl[],
): NostrSource | undefined =>
  relays.length > 0
    ? { type: "nostr", filters, relays: [...relays] }
    : undefined;

/** チャンネルそのもの（kind:40）と、その情報の書き換え（kind:41）。 */
export const channelSource = (
  channelId: string,
  relays: readonly RelayUrl[],
): NostrSource | undefined =>
  withRelays(
    [
      { ids: [channelId] },
      { kinds: [CHANNEL_METADATA_KIND], "#e": [channelId] },
    ],
    relays,
  );

export const channelMessagesSource = (
  channelId: string,
  relays: readonly RelayUrl[],
): NostrSource | undefined =>
  withRelays([{ kinds: [CHANNEL_MESSAGE_KIND], "#e": [channelId] }], relays);

/**
 * 並んでいる発言に関わるチャット内のミュート。自分のミュートは全部、ほかの人の
 * ミュートは並んでいる発言と書き手に向いたものだけを取る。
 */
export const chatModerationSource = (
  viewer: string,
  messageIds: readonly string[],
  authors: readonly string[],
  relays: readonly RelayUrl[],
): NostrSource | undefined =>
  withRelays(
    [
      {
        kinds: [CHANNEL_HIDE_MESSAGE_KIND, CHANNEL_MUTE_USER_KIND],
        authors: [viewer],
      },
      ...(messageIds.length > 0
        ? [{ kinds: [CHANNEL_HIDE_MESSAGE_KIND], "#e": [...messageIds] }]
        : []),
      ...(authors.length > 0
        ? [{ kinds: [CHANNEL_MUTE_USER_KIND], "#p": [...authors] }]
        : []),
    ],
    relays,
  );

/** いくつかのチャンネルの情報。`ids` が空なら何も取らない。 */
export const channelsSource = (
  channelIds: readonly string[],
  relays: readonly RelayUrl[],
): NostrSource | undefined =>
  channelIds.length > 0
    ? withRelays(
        [
          { kinds: [CHANNEL_CREATE_KIND], ids: [...channelIds] },
          { kinds: [CHANNEL_METADATA_KIND], "#e": [...channelIds] },
        ],
        relays,
      )
    : undefined;
