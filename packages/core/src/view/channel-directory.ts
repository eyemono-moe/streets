import {
  CHANNEL_CREATE_KIND,
  CHANNEL_METADATA_KIND,
  type Channel,
  channelFrom,
} from "../nostr/channel";
import type { NostrEvent } from "../nostr/event";

export type ChannelEntry = {
  channel: Channel;
  /** 最後の発言の時刻。直近に発言が無ければ無い。 */
  lastMessageAt?: number;
  favorite: boolean;
};

/** 届いている kind:40・41 からチャンネルを組み立てる。 */
export const channelsFrom = (
  events: readonly NostrEvent[],
): Map<string, Channel> => {
  const updates = events.filter(
    (event) => event.kind === CHANNEL_METADATA_KIND,
  );
  const channels = new Map<string, Channel>();
  for (const event of events) {
    if (event.kind !== CHANNEL_CREATE_KIND) continue;
    const channel = channelFrom(event, updates);
    if (channel) channels.set(channel.id, channel);
  }
  return channels;
};

const newestFirst = (a: ChannelEntry, b: ChannelEntry) =>
  (b.lastMessageAt ?? 0) - (a.lastMessageAt ?? 0);

/**
 * 一覧の普段の表示。お気に入りと、最近アクティブなチャンネル（お気に入りを除く）を、
 * どちらも新しく動いた順に並べる。情報がまだ届いていないチャンネルは出さない ——
 * 名前の無い行を出しても、何のチャンネルか分からない。
 */
export const channelDirectory = (input: {
  channels: ReadonlyMap<string, Channel>;
  favorites: readonly string[];
  active: readonly { id: string; lastMessageAt: number }[];
}): { favorites: ChannelEntry[]; active: ChannelEntry[] } => {
  const last = new Map(
    input.active.map((item) => [item.id, item.lastMessageAt]),
  );
  const favoriteSet = new Set(input.favorites);
  const entry = (id: string): ChannelEntry[] => {
    const channel = input.channels.get(id);
    return channel
      ? [
          {
            channel,
            lastMessageAt: last.get(id),
            favorite: favoriteSet.has(id),
          },
        ]
      : [];
  };
  return {
    favorites: input.favorites.flatMap(entry).sort(newestFirst),
    active: input.active
      .filter((item) => !favoriteSet.has(item.id))
      .flatMap((item) => entry(item.id)),
  };
};

/** 大文字・小文字と全角・半角の違いを無視して比べる。 */
const normalize = (text: string) => text.normalize("NFKC").toLowerCase();

/**
 * すべてのチャンネルから探す。名前と説明に、打った文字を含むものを名前順に並べる。
 * 空なら全部。名前の無いチャンネルは後ろに回す。
 */
export const searchChannels = (input: {
  channels: ReadonlyMap<string, Channel>;
  favorites: readonly string[];
  active: readonly { id: string; lastMessageAt: number }[];
  query: string;
}): ChannelEntry[] => {
  const words = normalize(input.query).split(/\s+/).filter(Boolean);
  const last = new Map(
    input.active.map((item) => [item.id, item.lastMessageAt]),
  );
  const favoriteSet = new Set(input.favorites);
  const collator = new Intl.Collator("ja");
  return [...input.channels.values()]
    .filter((channel) => {
      const text = normalize(
        `${channel.metadata.name ?? ""} ${channel.metadata.about ?? ""}`,
      );
      return words.every((word) => text.includes(word));
    })
    .sort((a, b) => {
      if (!a.metadata.name !== !b.metadata.name)
        return a.metadata.name ? -1 : 1;
      return collator.compare(a.metadata.name ?? "", b.metadata.name ?? "");
    })
    .map((channel) => ({
      channel,
      lastMessageAt: last.get(channel.id),
      favorite: favoriteSet.has(channel.id),
    }));
};
