import { describe, expect, it } from "vitest";
import type { EmojiList } from "../settings/emoji-list";
import type { EmojiSet } from "../settings/emoji-set";
import { customEmojiGroups, findCustomEmoji } from "./emoji-catalog";

const PUBKEY = "a".repeat(64);

const set = (identifier: string, title: string, names: string[]): EmojiSet => ({
  identifier,
  pubkey: PUBKEY,
  title,
  emojis: names.map((name) => ({ shortcode: name, url: `https://${name}` })),
});

const list = (emojis: string[], identifiers: string[] = []): EmojiList => ({
  emojis: emojis.map((name) => ({ shortcode: name, url: `https://${name}` })),
  sets: identifiers.map((identifier) => ({ pubkey: PUBKEY, identifier })),
});

describe("customEmojiGroups", () => {
  it("自分の絵文字を先に、セットを書かれた順に並べる", () => {
    const groups = customEmojiGroups(list(["pika"], ["neko", "kome"]), [
      set("kome", "おこめ", ["kome1"]),
      set("neko", "ねこ", ["neko1"]),
    ]);
    expect(groups.map((group) => group.title)).toEqual([
      "自分の絵文字",
      "ねこ",
      "おこめ",
    ]);
  });

  it("まだ届いていないセットは出さない", () => {
    // 捕まえる変異: 空の見出しを出す（読み込み中と空の区別が付かない）
    expect(customEmojiGroups(list([], ["neko"]), [])).toEqual([]);
  });

  it("中身が空のセットも出さない", () => {
    expect(
      customEmojiGroups(list([], ["neko"]), [set("neko", "ねこ", [])]),
    ).toEqual([]);
  });

  it("自分の絵文字が無ければ、その見出しは出さない", () => {
    const groups = customEmojiGroups(list([], ["neko"]), [
      set("neko", "ねこ", ["neko1"]),
    ]);
    expect(groups.map((group) => group.title)).toEqual(["ねこ"]);
  });

  it("同じ名前が並んでいたら先のものだけ残す", () => {
    // 捕まえる変異: そのまま並べる（同じ名前が 2 つ出て、押し分けられない）
    const groups = customEmojiGroups(list(["pika", "pika"]), []);
    expect(groups[0]?.emojis).toHaveLength(1);
  });

  it("見出しの id はセットの住所（同じ名前のセットを見分けられる）", () => {
    const groups = customEmojiGroups(list([], ["neko"]), [
      set("neko", "ねこ", ["neko1"]),
    ]);
    expect(groups[0]?.id).toBe(`30030:${PUBKEY}:neko`);
  });
});

describe("findCustomEmoji", () => {
  it("同じ名前があれば先のかたまりのものを返す", () => {
    const groups = customEmojiGroups(list(["pika"], ["neko"]), [
      set("neko", "ねこ", ["pika"]),
    ]);
    expect(findCustomEmoji(groups, "pika")?.url).toBe("https://pika");
    expect(findCustomEmoji(groups, "nope")).toBeUndefined();
  });
});
