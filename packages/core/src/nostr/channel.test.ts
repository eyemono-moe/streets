import { describe, expect, it } from "vite-plus/test";
import {
  activeChannels,
  channelFrom,
  channelOf,
  channelReplyTarget,
  chatModeration,
  favoriteChannels,
  messageVisibility,
  parseChannelMetadata,
} from "./channel";
import type { NostrEvent } from "./event";

const CREATOR = "c".repeat(64);
const OTHER = "d".repeat(64);
const VIEWER = "f".repeat(64);
const CHANNEL = "1".repeat(64);

const evt = (fields: Partial<NostrEvent>): NostrEvent =>
  ({
    id: "a".repeat(64),
    pubkey: CREATOR,
    created_at: 1_700_000_000,
    kind: 1,
    tags: [],
    content: "",
    sig: "e".repeat(128),
    ...fields,
  }) as NostrEvent;

const create = evt({
  id: CHANNEL,
  kind: 40,
  content: JSON.stringify({
    name: "さびれたスナック",
    about: "夜の話",
    relays: ["wss://yabu.me", "not a url"],
  }),
});

describe("parseChannelMetadata", () => {
  it("読めない値は捨て、リレーは URL の形にそろえる", () => {
    // 捕まえる変異: リレーを検証せずに素通しする（壊れた URL へ接続しにいく）
    expect(parseChannelMetadata(create.content)).toEqual({
      name: "さびれたスナック",
      about: "夜の話",
      picture: undefined,
      relays: ["wss://yabu.me/"],
    });
  });

  it("JSON でなければ undefined", () => {
    expect(parseChannelMetadata("こんにちは")).toBeUndefined();
  });

  it("項目の型が違っても、ほかの項目は残す", () => {
    expect(
      parseChannelMetadata(JSON.stringify({ name: 1, about: "説明" })),
    ).toMatchObject({ name: undefined, about: "説明" });
  });
});

describe("channelFrom", () => {
  it("作った人の kind:41 のうち最新のものを採る", () => {
    const update = (pubkey: string, created_at: number, name: string) =>
      evt({
        id: `${created_at}`.padStart(64, "0"),
        kind: 41,
        pubkey,
        created_at,
        tags: [["e", CHANNEL, "", "root"]],
        content: JSON.stringify({ name }),
      });
    const channel = channelFrom(create, [
      update(CREATOR, 1_700_000_100, "古い名前"),
      update(CREATOR, 1_700_000_200, "新しい名前"),
      // 捕まえる変異: 作った人でない kind:41 を採る（誰でも名前を書き換えられる）
      update(OTHER, 1_700_000_300, "乗っ取り"),
    ]);
    expect(channel?.metadata.name).toBe("新しい名前");
    expect(channel?.updatedAt).toBe(1_700_000_200);
  });

  it("kind:41 に書いていない項目は kind:40 の値を残す", () => {
    const channel = channelFrom(create, [
      evt({
        id: "2".repeat(64),
        kind: 41,
        created_at: 1_700_000_100,
        tags: [["e", CHANNEL]],
        content: JSON.stringify({ name: "改名" }),
      }),
    ]);
    expect(channel?.metadata).toEqual({
      name: "改名",
      about: "夜の話",
      picture: undefined,
      relays: ["wss://yabu.me/"],
    });
  });

  it("別のチャンネルを指す kind:41 は採らない", () => {
    const channel = channelFrom(create, [
      evt({
        kind: 41,
        created_at: 1_700_000_100,
        tags: [["e", "9".repeat(64), "", "root"]],
        content: JSON.stringify({ name: "よそ" }),
      }),
    ]);
    expect(channel?.metadata.name).toBe("さびれたスナック");
  });
});

describe("channelOf / channelReplyTarget", () => {
  const PARENT = "3".repeat(64);
  const reply = evt({
    kind: 42,
    tags: [
      ["e", CHANNEL, "", "root"],
      ["e", PARENT, "", "reply", OTHER],
      ["p", OTHER],
    ],
  });

  it("root の印の e をチャンネルとする", () => {
    expect(channelOf(reply)).toBe(CHANNEL);
  });

  it("印の無い古い書き方では最初の e をチャンネルとする", () => {
    expect(channelOf(evt({ kind: 42, tags: [["e", CHANNEL]] }))).toBe(CHANNEL);
  });

  it("返信先はチャンネルそのものではなく、reply の印の発言", () => {
    expect(channelReplyTarget(reply)?.id).toBe(PARENT);
    // 捕まえる変異: root（チャンネル）を返信先として返す
    expect(
      channelReplyTarget(evt({ kind: 42, tags: [["e", CHANNEL, "", "root"]] })),
    ).toBeUndefined();
  });
});

describe("messageVisibility", () => {
  const message = evt({ id: "4".repeat(64), kind: 42, pubkey: OTHER });
  const hide = (by: string) =>
    evt({ kind: 43, pubkey: by, tags: [["e", message.id]] });
  const mute = (by: string) =>
    evt({ kind: 44, pubkey: by, tags: [["p", OTHER]] });

  it("誰もミュートしていなければそのまま出す", () => {
    expect(messageVisibility(message, chatModeration([]), VIEWER)).toBe(
      "visible",
    );
  });

  it("ほかの人のミュートと、自分のミュートを見分ける", () => {
    expect(
      messageVisibility(message, chatModeration([hide(CREATOR)]), VIEWER),
    ).toBe("muted-by-others");
    expect(
      messageVisibility(message, chatModeration([mute(CREATOR)]), VIEWER),
    ).toBe("muted-by-others");
    expect(
      messageVisibility(message, chatModeration([hide(VIEWER)]), VIEWER),
    ).toBe("muted-by-me");
  });

  it("自分がその人をミュートしていれば、メッセージのミュートより優先する", () => {
    expect(
      messageVisibility(
        message,
        chatModeration([hide(VIEWER), mute(VIEWER)]),
        VIEWER,
      ),
    ).toBe("muted-user");
  });

  it("自分の発言は畳まない", () => {
    // 捕まえる変異: 自分の発言も、ほかの人のミュートで畳む（自分で書いたものが読めない）
    expect(
      messageVisibility(
        { ...message, pubkey: VIEWER },
        chatModeration([
          evt({ kind: 44, pubkey: CREATOR, tags: [["p", VIEWER]] }),
        ]),
        VIEWER,
      ),
    ).toBe("visible");
  });
});

describe("favoriteChannels", () => {
  it("公開の e タグの id を、重ねずに返す", () => {
    expect(
      favoriteChannels(
        evt({
          kind: 10005,
          tags: [
            ["e", CHANNEL],
            ["e", CHANNEL],
            ["e", "not-hex"],
            ["t", "nostr"],
          ],
          content: "暗号化された非公開の項目",
        }),
      ),
    ).toEqual([CHANNEL]);
  });
});

describe("activeChannels", () => {
  it("チャンネルごとに最後の発言の時刻をとり、新しい順に並べる", () => {
    const other = "5".repeat(64);
    const message = (channel: string, created_at: number) =>
      evt({ kind: 42, created_at, tags: [["e", channel, "", "root"]] });
    expect(
      activeChannels([
        message(CHANNEL, 100),
        message(other, 300),
        message(CHANNEL, 200),
      ]),
    ).toEqual([
      { id: other, lastMessageAt: 300 },
      { id: CHANNEL, lastMessageAt: 200 },
    ]);
  });
});
