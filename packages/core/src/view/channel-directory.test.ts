import { describe, expect, it } from "vite-plus/test";
import type { Channel } from "../nostr/channel";
import type { NostrEvent } from "../nostr/event";
import {
  channelDirectory,
  channelsFrom,
  searchChannels,
} from "./channel-directory";

const channel = (id: string, name?: string, about?: string): Channel => ({
  id,
  creator: "c".repeat(64),
  metadata: { name, about, relays: [] },
  updatedAt: 0,
});
const id = (n: number) => `${n}`.padStart(64, "0");
const map = (...channels: Channel[]) =>
  new Map(channels.map((item) => [item.id, item]));

describe("channelsFrom", () => {
  it("kind:40 ごとにチャンネルを作り、作った人の kind:41 を当てる", () => {
    const creator = "c".repeat(64);
    const create = {
      id: id(1),
      pubkey: creator,
      kind: 40,
      created_at: 1,
      tags: [],
      content: JSON.stringify({ name: "古い" }),
      sig: "",
    } as NostrEvent;
    const update = {
      ...create,
      id: id(2),
      kind: 41,
      created_at: 2,
      tags: [["e", id(1)]],
      content: JSON.stringify({ name: "新しい" }),
    } as NostrEvent;
    expect(channelsFrom([update, create]).get(id(1))?.metadata.name).toBe(
      "新しい",
    );
  });
});

describe("channelDirectory", () => {
  const channels = map(
    channel(id(1), "A"),
    channel(id(2), "B"),
    channel(id(3), "C"),
  );

  it("お気に入りは最近アクティブから外し、どちらも新しく動いた順にする", () => {
    const result = channelDirectory({
      channels,
      favorites: [id(1), id(2)],
      active: [
        { id: id(3), lastMessageAt: 300 },
        { id: id(2), lastMessageAt: 200 },
      ],
    });
    // 捕まえる変異: お気に入りを最近アクティブにも重ねて出す
    expect(result.active.map((entry) => entry.channel.id)).toEqual([id(3)]);
    expect(result.favorites.map((entry) => entry.channel.id)).toEqual([
      id(2),
      id(1),
    ]);
    expect(result.favorites[1]?.lastMessageAt).toBeUndefined();
  });

  it("情報がまだ届いていないチャンネルは出さない", () => {
    expect(
      channelDirectory({
        channels,
        favorites: [id(9)],
        active: [{ id: id(8), lastMessageAt: 1 }],
      }),
    ).toEqual({ favorites: [], active: [] });
  });
});

describe("searchChannels", () => {
  const channels = map(
    channel(id(1), "さびれたスナック", "夜の話"),
    channel(id(2), "Nostr麻雀開発部"),
    channel(id(3), undefined, "名前なし"),
    channel(id(4), "スナック研究会"),
  );
  const names = (query: string) =>
    searchChannels({ channels, favorites: [], active: [], query }).map(
      (entry) => entry.channel.metadata.name ?? "(なし)",
    );

  it("名前と説明で絞り込み、名前順に並べる", () => {
    expect(names("スナック")).toEqual(["さびれたスナック", "スナック研究会"]);
    expect(names("夜")).toEqual(["さびれたスナック"]);
  });

  it("全角・半角と大文字・小文字の違いを無視する", () => {
    // 捕まえる変異: そのまま比べる（「ｎｏｓｔｒ」で Nostr が見つからない）
    expect(names("ｎｏｓｔｒ")).toEqual(["Nostr麻雀開発部"]);
  });

  it("空なら全部で、名前の無いものは後ろ", () => {
    expect(names("").at(-1)).toBe("(なし)");
    expect(names("")).toHaveLength(4);
  });
});
