import { describe, expect, it } from "vite-plus/test";
import { type SearchableEmoji, searchEmojis } from "./emoji-search";

const cat: SearchableEmoji & { id: string } = {
  id: "cat",
  label: "ねこ",
  tags: ["どうぶつ", "ねこ"],
  shortcodes: ["cat", "cat_face"],
};
const kitten: SearchableEmoji & { id: string } = {
  id: "kitten",
  label: "こねこ",
  tags: ["どうぶつ"],
  shortcodes: ["kitten"],
};
const dog: SearchableEmoji & { id: string } = {
  id: "dog",
  label: "いぬ",
  tags: ["どうぶつ"],
  shortcodes: ["dog"],
};
const pika: SearchableEmoji & { id: string } = {
  id: "pika",
  shortcodes: ["pika_chan"],
};

const ids = (query: string) =>
  searchEmojis([cat, kitten, dog, pika], query).map((emoji) => emoji.id);

describe("searchEmojis", () => {
  it("空なら全部そのままの並びで返す", () => {
    expect(ids("")).toEqual(["cat", "kitten", "dog", "pika"]);
    expect(ids("   ")).toEqual(["cat", "kitten", "dog", "pika"]);
  });

  it("日本語の名前で引ける", () => {
    expect(ids("いぬ")).toEqual(["dog"]);
  });

  it("日本語のタグで引ける", () => {
    expect(ids("どうぶつ")).toEqual(["cat", "kitten", "dog"]);
  });

  it("英語のショートコードで引ける", () => {
    expect(ids("cat")).toEqual(["cat"]);
  });

  it("前から一致するものを先に出す", () => {
    // 捕まえる変異: 一致する場所を見ない（「ねこ」で「こねこ」が先に出る）
    expect(ids("ねこ")).toEqual(["cat", "kitten"]);
  });

  it("ショートコードの一致を、名前やタグの一致より先に出す", () => {
    // 捕まえる変異: 手がかりを区別しない（狙って打ったショートコードが埋もれる）
    expect(ids("dog")[0]).toBe("dog");
  });

  it("大文字と小文字、下線と空白は区別しない", () => {
    // 捕まえる変異: そのまま比べる（`cat face` や `CAT_FACE` で引けなくなる）
    expect(ids("CAT FACE")).toEqual(["cat"]);
    expect(ids("catface")).toEqual(["cat"]);
  });

  it("名前を持たないもの（カスタム絵文字）も引ける", () => {
    expect(ids("pika")).toEqual(["pika"]);
  });

  it("ひらがなで打ってもカタカナの名前に当たる", () => {
    // 捕まえる変異: そのまま比べる（絵文字の名前は「ネコ」で、打つ人は
    // 「ねこ」と打つので引けなくなる）
    const neko: SearchableEmoji & { id: string } = {
      id: "neko",
      label: "ネコの顔",
      tags: ["ペット"],
    };
    expect(searchEmojis([neko], "ねこ").map((e) => e.id)).toEqual(["neko"]);
    expect(searchEmojis([neko], "ペット").map((e) => e.id)).toEqual(["neko"]);
  });

  it("全角の英数字でも引ける", () => {
    expect(ids("ｃａｔ")).toEqual(["cat"]);
  });

  it("当たらなければ空", () => {
    expect(ids("みつからない")).toEqual([]);
  });
});
