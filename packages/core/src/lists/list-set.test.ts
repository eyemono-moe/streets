import { describe, expect, it } from "vite-plus/test";
import type { NostrEvent } from "../nostr/event";
import { readListSet } from "./list-set";

const A = "a".repeat(64);
const B = "b".repeat(64);

const event = (tags: string[][], kind = 30_002): NostrEvent => ({
  id: "0".repeat(64),
  pubkey: A,
  created_at: 0,
  kind,
  tags,
  content: "",
  sig: "0".repeat(128),
});

describe("readListSet", () => {
  it("題名・説明・画像を読み、古い name も題名として読む", () => {
    expect(
      readListSet(
        event([
          ["d", "jp"],
          ["name", "日本語のリレー"],
          ["description", "  よく読む  "],
          ["image", "https://example.com/a.png"],
        ]),
      ),
    ).toMatchObject({
      identifier: "jp",
      title: "日本語のリレー",
      description: "よく読む",
      image: "https://example.com/a.png",
    });
  });

  it("リレーは URL を揃えて同じものを 1 つに数え、読めない URL を捨てる", () => {
    const set = readListSet(
      event([
        ["relay", "wss://yabu.me"],
        ["relay", "wss://yabu.me/"],
        ["relay", "https://example.com"],
        ["relay", "wss://nos.lol/"],
      ]),
    );
    expect(set.relays).toEqual(["wss://yabu.me/", "wss://nos.lol/"]);
  });

  it("投稿と住所を書かれた順に読み、形の違うものを捨てる", () => {
    const set = readListSet(
      event(
        [
          ["e", B, "wss://nos.lol/"],
          ["a", `30023:${A}:hello`],
          ["e", "not-an-id"],
          ["a", "30023:short:hello"],
        ],
        30_003,
      ),
    );
    expect(set.events).toEqual([
      { form: "id", id: B, relay: "wss://nos.lol/" },
      { form: "address", address: `30023:${A}:hello` },
    ]);
  });

  it("人とハッシュタグは同じものを 1 つに数える", () => {
    const set = readListSet(
      event(
        [
          ["p", B],
          ["p", B],
          ["p", "xyz"],
          ["t", "nostr"],
          ["t", "nostr"],
        ],
        39_089,
      ),
    );
    expect(set.pubkeys).toEqual([B]);
    expect(set.hashtags).toEqual(["nostr"]);
  });
});
