import type { RelayUrl } from "../../relay/relay-connection";
import {
  CHANNEL_CREATE_KIND,
  CHANNEL_HIDE_MESSAGE_KIND,
  CHANNEL_MESSAGE_KIND,
  CHANNEL_METADATA_KIND,
  CHANNEL_MUTE_USER_KIND,
  PUBLIC_CHATS_KIND,
} from "../channel";
import type { NostrEvent } from "../event";
import {
  type EventDraft,
  type Mutation,
  addTagValue,
  removeTagValue,
} from "./draft";

export type ChannelMetadataInput = {
  name: string;
  about?: string;
  picture?: string;
  relays: readonly RelayUrl[];
};

/** 空の項目は書かない。空文字の `about` を書くと、読む側が「説明あり」と扱いうる。 */
const metadataContent = (input: ChannelMetadataInput): string =>
  JSON.stringify({
    name: input.name.trim(),
    ...(input.about?.trim() ? { about: input.about.trim() } : {}),
    ...(input.picture?.trim() ? { picture: input.picture.trim() } : {}),
    relays: [...input.relays],
  });

/** チャンネルを作る（kind:40）。情報は `content` の JSON に入れる（NIP-28 の SHOULD）。 */
export const buildChannelCreate = (
  input: ChannelMetadataInput,
): EventDraft => ({
  kind: CHANNEL_CREATE_KIND,
  tags: [],
  content: metadataContent(input),
});

/**
 * チャンネルの情報を直す（kind:41）。作った人が出したものだけが採られる。
 * 全部の項目を書く —— 読む側が前の値を残すかは実装しだいなので、消したつもりの
 * 項目が残らないよう、今の値をそろえて出す。
 */
export const buildChannelMetadata = (
  channelId: string,
  input: ChannelMetadataInput,
  relayHint: RelayUrl = "",
): EventDraft => ({
  kind: CHANNEL_METADATA_KIND,
  tags: [["e", channelId, relayHint, "root"]],
  content: metadataContent(input),
});

/**
 * チャンネルでの発言（kind:42）。返信なら、返信先を `reply` の印で足し、
 * 返信先の人を `p` に入れる（NIP-28 は NIP-10 の印付きタグを使う）。
 * relay-url は無くても空文字で埋める —— 省くと印が relay-url の位置にずれる。
 */
export const buildChannelMessage = (
  channelId: string,
  content: string,
  options: { relayHint?: RelayUrl; replyTo?: NostrEvent } = {},
): EventDraft => {
  const hint = options.relayHint ?? "";
  const tags: string[][] = [["e", channelId, hint, "root"]];
  const parent = options.replyTo;
  if (parent) {
    tags.push(["e", parent.id, hint, "reply", parent.pubkey]);
    tags.push(["p", parent.pubkey, hint]);
  }
  return { kind: CHANNEL_MESSAGE_KIND, tags, content };
};

const reasonContent = (reason: string | undefined): string =>
  reason?.trim() ? JSON.stringify({ reason: reason.trim() }) : "";

/** この発言をチャット内でミュートする（kind:43）。 */
export const buildHideMessage = (
  messageId: string,
  reason?: string,
): EventDraft => ({
  kind: CHANNEL_HIDE_MESSAGE_KIND,
  tags: [["e", messageId]],
  content: reasonContent(reason),
});

/** この人をチャット内でミュートする（kind:44）。どのチャンネルかは指さない。 */
export const buildMuteUser = (pubkey: string, reason?: string): EventDraft => ({
  kind: CHANNEL_MUTE_USER_KIND,
  tags: [["p", pubkey]],
  content: reasonContent(reason),
});

/** お気に入りに入れる・外す。公開の `e` タグだけを触り、暗号化した `content` はそのまま残す。 */
export const addFavoriteChannel = (channelId: string): Mutation =>
  addTagValue(PUBLIC_CHATS_KIND, "e", channelId);

export const removeFavoriteChannel = (channelId: string): Mutation =>
  removeTagValue(PUBLIC_CHATS_KIND, "e", channelId);
