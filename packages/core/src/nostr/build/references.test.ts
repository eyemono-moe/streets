import { describe, expect, it } from "vite-plus/test";
import { encodeBech32, encodeNprofile } from "../nip19";
import { profileEmojiTags, shortcodesIn, withReferences } from "./references";

const alice = "a".repeat(64);
const bob = "b".repeat(64);
const npub = (pubkey: string) => encodeBech32("npub", pubkey);
const emoji = (shortcode: string) =>
  ({ neko: "https://e.example/neko.png", inu: "https://e.example/inu.png" })[
    shortcode
  ];

describe("shortcodesIn", () => {
  it("出てきた順に重ねずに返す", () => {
    expect(shortcodesIn([":neko: と :inu:", ":neko:"])).toEqual([
      "neko",
      "inu",
    ]);
  });

  it("時刻の途中も拾う（自分の絵文字に無ければタグにならないので害は無い）", () => {
    expect(shortcodesIn(["12:30:45 は 1:2"])).toEqual(["30"]);
  });
});

describe("withReferences", () => {
  const note = (content: string, tags: string[][] = []) => ({
    kind: 1,
    content,
    tags,
  });

  it("本文で指した人に p を付ける", () => {
    const draft = withReferences(note(`hi nostr:${npub(alice)}`), {});
    expect(draft.tags).toEqual([["p", alice]]);
  });

  it("nprofile のリレーを p のヒントにする", () => {
    const ref = encodeNprofile({ pubkey: alice, relays: ["wss://r.example"] });
    const draft = withReferences(note(`hi nostr:${ref}`), {});
    expect(draft.tags).toEqual([["p", alice, "wss://r.example"]]);
  });

  it("同じ人を何度指しても p は 1 本", () => {
    const draft = withReferences(
      note(`nostr:${npub(alice)} nostr:${npub(alice)}`),
      {},
    );
    expect(draft.tags).toEqual([["p", alice]]);
  });

  it("既にある p（返信先）は足さない", () => {
    const draft = withReferences(
      note(`nostr:${npub(alice)} nostr:${npub(bob)}`, [["p", alice]]),
      {},
    );
    expect(draft.tags).toEqual([
      ["p", alice],
      ["p", bob],
    ]);
  });

  it("自分の絵文字にあるショートコードに emoji を付ける", () => {
    const draft = withReferences(note("かわいい:neko::neko: :nai:"), {
      emoji,
    });
    expect(draft.tags).toEqual([
      ["emoji", "neko", "https://e.example/neko.png"],
    ]);
  });

  it("引けないときは emoji を付けない", () => {
    expect(withReferences(note(":neko:"), {}).tags).toEqual([]);
  });

  it("元のタグと本文は変えない", () => {
    const original = note(":neko:", [["t", "cat"]]);
    const draft = withReferences(original, { emoji });
    expect(original.tags).toEqual([["t", "cat"]]);
    expect(draft.content).toBe(":neko:");
  });
});

describe("profileEmojiTags", () => {
  it("使っている分だけ足し、ほかのタグは残す", () => {
    expect(
      profileEmojiTags(
        [["alt", "profile"]],
        { name: "えいも:neko:", about: ":inu: です", lud16: "x@y" },
        emoji,
      ),
    ).toEqual([
      ["alt", "profile"],
      ["emoji", "neko", "https://e.example/neko.png"],
      ["emoji", "inu", "https://e.example/inu.png"],
    ]);
  });

  it("前から持っていたものは、自分の絵文字に無くても使っていれば残す", () => {
    const other = ["emoji", "other", "https://o.example/other.png"];
    expect(
      profileEmojiTags([other], { display_name: ":other:" }, emoji),
    ).toEqual([other]);
  });

  it("前から持っていたものを、自分の絵文字の URL で上書きしない", () => {
    const old = ["emoji", "neko", "https://o.example/neko.png"];
    expect(profileEmojiTags([old], { name: ":neko:" }, emoji)).toEqual([old]);
  });

  it("使わなくなったものは外す", () => {
    expect(
      profileEmojiTags(
        [["emoji", "neko", "https://e.example/neko.png"]],
        { name: "えいも" },
        emoji,
      ),
    ).toEqual([]);
  });

  it("文字列でない値は見ない", () => {
    expect(profileEmojiTags([], { bot: true, n: 1 }, emoji)).toEqual([]);
  });
});
