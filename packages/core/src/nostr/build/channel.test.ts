import { describe, expect, it } from "vite-plus/test";
import type { NostrEvent } from "../event";
import {
  addFavoriteChannel,
  buildChannelCreate,
  buildChannelMessage,
  buildChannelMetadata,
  buildHideMessage,
  buildMuteUser,
  removeFavoriteChannel,
} from "./channel";

const CHANNEL = "1".repeat(64);
const AUTHOR = "b".repeat(64);

const evt = (fields: Partial<NostrEvent>): NostrEvent =>
  ({
    id: "a".repeat(64),
    pubkey: AUTHOR,
    created_at: 1_700_000_000,
    kind: 42,
    tags: [],
    content: "",
    sig: "c".repeat(128),
    ...fields,
  }) as NostrEvent;

describe("buildChannelCreate / buildChannelMetadata", () => {
  it("空の項目は書かない", () => {
    // 捕まえる変異: 空文字の about を書く（読む側が「説明あり」と扱う）
    expect(
      JSON.parse(
        buildChannelCreate({
          name: " 部屋 ",
          about: " ",
          relays: ["wss://yabu.me/"],
        }).content,
      ),
    ).toEqual({ name: "部屋", relays: ["wss://yabu.me/"] });
  });

  it("kind:41 は root の印でチャンネルを指す", () => {
    const draft = buildChannelMetadata(
      CHANNEL,
      { name: "部屋", relays: [] },
      "wss://yabu.me/",
    );
    expect(draft.kind).toBe(41);
    expect(draft.tags).toEqual([["e", CHANNEL, "wss://yabu.me/", "root"]]);
  });
});

describe("buildChannelMessage", () => {
  it("返信でなければ、チャンネルを root で指すだけ", () => {
    expect(buildChannelMessage(CHANNEL, "こんばんは")).toEqual({
      kind: 42,
      tags: [["e", CHANNEL, "", "root"]],
      content: "こんばんは",
    });
  });

  it("返信は reply の印で返信先を指し、返信先の人を p に入れる", () => {
    const parent = evt({ id: "2".repeat(64) });
    // 捕まえる変異: relay-url を省いて印を relay-url の位置にずらす
    expect(
      buildChannelMessage(CHANNEL, "わたしも", { replyTo: parent }).tags,
    ).toEqual([
      ["e", CHANNEL, "", "root"],
      ["e", parent.id, "", "reply", AUTHOR],
      ["p", AUTHOR, ""],
    ]);
  });
});

describe("buildHideMessage / buildMuteUser", () => {
  it("理由があれば JSON で添え、無ければ空", () => {
    expect(buildHideMessage("3".repeat(64), "宣伝")).toEqual({
      kind: 43,
      tags: [["e", "3".repeat(64)]],
      content: JSON.stringify({ reason: "宣伝" }),
    });
    expect(buildMuteUser(AUTHOR).content).toBe("");
    expect(buildMuteUser(AUTHOR).tags).toEqual([["p", AUTHOR]]);
  });
});

describe("addFavoriteChannel / removeFavoriteChannel", () => {
  it("公開の e タグだけを触り、暗号化した content を残す", () => {
    // 捕まえる変異: content を空にする（ほかのクライアントが入れた非公開の項目が消える）
    const current = evt({
      kind: 10005,
      tags: [["e", "4".repeat(64)]],
      content: "暗号化された非公開の項目",
    });
    const added = addFavoriteChannel(CHANNEL)(current);
    expect(added.kind).toBe(10005);
    expect(added.tags).toEqual([
      ["e", "4".repeat(64)],
      ["e", CHANNEL],
    ]);
    expect(added.content).toBe("暗号化された非公開の項目");
    expect(
      removeFavoriteChannel("4".repeat(64))({ ...current, ...added }).tags,
    ).toEqual([["e", CHANNEL]]);
  });
});
