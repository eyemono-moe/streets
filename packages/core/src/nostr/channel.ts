import * as v from "valibot";
import type { RelayUrl } from "../relay/relay-connection";
import { normalizeRelayUrl } from "../relay/relay-url";
import type { NostrEvent } from "./event";
import { type EventRef, replyTarget } from "./event-refs";

/** NIP-28 のチャンネル。 */
export const CHANNEL_CREATE_KIND = 40;
export const CHANNEL_METADATA_KIND = 41;
export const CHANNEL_MESSAGE_KIND = 42;
export const CHANNEL_HIDE_MESSAGE_KIND = 43;
export const CHANNEL_MUTE_USER_KIND = 44;
/** NIP-51 の「参加しているチャンネル」。画面では「お気に入り」と呼ぶ。 */
export const PUBLIC_CHATS_KIND = 10005;

const HEX_64 = /^[0-9a-f]{64}$/;

export type ChannelMetadata = {
  name?: string;
  about?: string;
  picture?: string;
  /** 発言を読み書きするリレー。無ければ空。 */
  relays: RelayUrl[];
};

// 1 項目の型違いで他の項目まで捨てないよう、項目ごとに不正値を undefined へ落とす。
const optionalText = v.fallback(v.optional(v.string()), undefined);
const metadataSchema = v.looseObject({
  name: optionalText,
  about: optionalText,
  picture: optionalText,
  relays: v.fallback(v.optional(v.array(v.unknown())), undefined),
});

const nonBlank = (value: string | undefined): string | undefined =>
  value !== undefined && value.trim().length > 0 ? value : undefined;

/** kind:40・41 の `content`。リレー由来で形を保証されないので、壊れていても例外を投げない。 */
export const parseChannelMetadata = (
  content: string,
): ChannelMetadata | undefined => {
  let json: unknown;
  try {
    json = JSON.parse(content);
  } catch {
    return undefined;
  }
  const result = v.safeParse(metadataSchema, json);
  if (!result.success) return undefined;
  const relays = (result.output.relays ?? []).flatMap((relay) => {
    const url =
      typeof relay === "string" ? normalizeRelayUrl(relay) : undefined;
    return url ? [url] : [];
  });
  return {
    name: nonBlank(result.output.name),
    about: nonBlank(result.output.about),
    picture: nonBlank(result.output.picture),
    relays: [...new Set(relays)],
  };
};

export type Channel = {
  /** kind:40 の id。 */
  id: string;
  creator: string;
  metadata: ChannelMetadata;
  /** 情報が最後に変わった時刻（kind:41 が無ければ作った時刻）。 */
  updatedAt: number;
};

/** その kind:41 がこのチャンネルを指しているか。`root` の印が無い古い書き方も受ける。 */
const pointsTo = (event: NostrEvent, channelId: string): boolean =>
  event.tags.some((tag) => tag[0] === "e" && tag[1] === channelId);

/**
 * kind:40 と、届いている kind:41 からチャンネルを組み立てる。kind:41 は作った人の
 * ものだけを採る（NIP-28 の SHOULD）。ほかの人の kind:41 を採ると、誰でも名前を
 * 書き換えられてしまう。書いていない項目は前の値を残す。
 */
export const channelFrom = (
  create: NostrEvent,
  updates: readonly NostrEvent[],
): Channel | undefined => {
  if (create.kind !== CHANNEL_CREATE_KIND) return undefined;
  const latest = updates
    .filter(
      (event) =>
        event.kind === CHANNEL_METADATA_KIND &&
        event.pubkey === create.pubkey &&
        pointsTo(event, create.id),
    )
    .reduce<NostrEvent | undefined>(
      (newest, event) =>
        !newest || event.created_at > newest.created_at ? event : newest,
      undefined,
    );
  const base = parseChannelMetadata(create.content) ?? { relays: [] };
  const update = latest ? parseChannelMetadata(latest.content) : undefined;
  return {
    id: create.id,
    creator: create.pubkey,
    metadata: {
      name: update?.name ?? base.name,
      about: update?.about ?? base.about,
      picture: update?.picture ?? base.picture,
      relays: update && update.relays.length > 0 ? update.relays : base.relays,
    },
    updatedAt: latest?.created_at ?? create.created_at,
  };
};

/**
 * 発言（kind:42）がどのチャンネルのものか。`root` の印の `e` タグを見る。印の
 * 無い古い書き方では、最初の `e` タグをチャンネルとみなす。
 */
export const channelOf = (message: NostrEvent): string | undefined => {
  if (message.kind !== CHANNEL_MESSAGE_KIND) return undefined;
  const eTags = message.tags.filter(
    (tag) => tag[0] === "e" && HEX_64.test(tag[1] ?? ""),
  );
  return (eTags.find((tag) => tag[3] === "root") ?? eTags[0])?.[1];
};

/** 発言が返信している発言。チャンネルそのもの（`root`）は返信先に数えない。 */
export const channelReplyTarget = (
  message: NostrEvent,
): Extract<EventRef, { form: "id" }> | undefined => {
  const target = replyTarget(message);
  return target && target.id !== channelOf(message) ? target : undefined;
};

/**
 * チャット内のミュート（kind:43・44）。誰がミュートしたかも持つ ——
 * 自分でミュートしたか、ほかの人がミュートしたかで見せ方を変えるため。
 */
export type ChatModeration = {
  /** 発言の id → ミュートした人。 */
  hiddenMessages: Map<string, Set<string>>;
  /** ミュートされた人 → ミュートした人。 */
  mutedUsers: Map<string, Set<string>>;
};

const addTo = (map: Map<string, Set<string>>, key: string, who: string) => {
  const set = map.get(key) ?? new Set<string>();
  set.add(who);
  map.set(key, set);
};

export const chatModeration = (
  events: readonly NostrEvent[],
): ChatModeration => {
  const hiddenMessages = new Map<string, Set<string>>();
  const mutedUsers = new Map<string, Set<string>>();
  for (const event of events) {
    const tagName =
      event.kind === CHANNEL_HIDE_MESSAGE_KIND
        ? "e"
        : event.kind === CHANNEL_MUTE_USER_KIND
          ? "p"
          : undefined;
    if (!tagName) continue;
    const target = event.tags.find(
      (tag) => tag[0] === tagName && HEX_64.test(tag[1] ?? ""),
    )?.[1];
    if (!target) continue;
    addTo(tagName === "e" ? hiddenMessages : mutedUsers, target, event.pubkey);
  }
  return { hiddenMessages, mutedUsers };
};

/**
 * 発言をどう見せるか。畳む理由は、自分でミュートした人・自分でミュートした
 * メッセージ・ほかの人のミュート、の順に強い。自分の発言は畳まない。
 */
export type MessageVisibility =
  | "visible"
  | "muted-user"
  | "muted-by-me"
  | "muted-by-others";

export const messageVisibility = (
  message: NostrEvent,
  moderation: ChatModeration,
  viewer: string | undefined,
): MessageVisibility => {
  if (viewer !== undefined && message.pubkey === viewer) return "visible";
  const mutedAuthor = moderation.mutedUsers.get(message.pubkey);
  const hidden = moderation.hiddenMessages.get(message.id);
  if (viewer !== undefined && mutedAuthor?.has(viewer)) return "muted-user";
  if (viewer !== undefined && hidden?.has(viewer)) return "muted-by-me";
  if ((mutedAuthor?.size ?? 0) > 0 || (hidden?.size ?? 0) > 0) {
    return "muted-by-others";
  }
  return "visible";
};

/** お気に入りのチャンネル（kind:10005 の公開の `e` タグ）。暗号化した非公開の項目は読まない。 */
export const favoriteChannels = (list: NostrEvent | undefined): string[] => [
  ...new Set(
    (list?.tags ?? []).flatMap((tag) =>
      tag[0] === "e" && HEX_64.test(tag[1] ?? "") ? [tag[1]] : [],
    ),
  ),
];

/**
 * 最近の発言から、動いているチャンネルを新しく動いた順に並べる。
 * 返すのはチャンネルの id と、最後の発言の時刻。
 */
export const activeChannels = (
  messages: readonly NostrEvent[],
): { id: string; lastMessageAt: number }[] => {
  const latest = new Map<string, number>();
  for (const message of messages) {
    const id = channelOf(message);
    if (!id) continue;
    latest.set(id, Math.max(latest.get(id) ?? 0, message.created_at));
  }
  return [...latest]
    .map(([id, lastMessageAt]) => ({ id, lastMessageAt }))
    .sort((a, b) => b.lastMessageAt - a.lastMessageAt);
};
