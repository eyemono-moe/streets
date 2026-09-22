import { describe, expect, it } from "vitest";
import type { NostrEvent } from "../nostr/event";
import {
  DEFAULT_SEARCH_RELAYS,
  effectiveSearchRelays,
  parseSearchRelays,
  setSearchRelays,
} from "./search-relay-list";

const event = (tags: string[][]): NostrEvent => ({
  id: "0".repeat(64),
  pubkey: "a".repeat(64),
  created_at: 1000,
  kind: 10_007,
  tags,
  content: "",
  sig: "0".repeat(128),
});

describe("検索を投げるリレー（kind:10007）", () => {
  it("relay タグを順番どおりに読み、形をそろえる", () => {
    expect(
      parseSearchRelays(
        event([
          ["relay", "wss://search.example"],
          ["other", "x"],
          ["relay", "wss://another.example/"],
          // 同じものは 1 回だけ。
          ["relay", "wss://search.example/"],
        ]),
      ),
    ).toEqual(["wss://search.example/", "wss://another.example/"]);
  });

  it("読み取れない URL は捨てる", () => {
    expect(parseSearchRelays(event([["relay", "ふつうの文字列"]]))).toEqual([]);
  });

  it("まだ決めていない人には既定を使う", () => {
    expect(effectiveSearchRelays(undefined)).toEqual(DEFAULT_SEARCH_RELAYS);
  });

  it("自分で空にした人には既定を使わない", () => {
    expect(effectiveSearchRelays(event([]))).toEqual([]);
  });

  it("保存する形は kind:10007 の relay タグ", () => {
    const draft = setSearchRelays(["wss://search.example/"])(undefined);
    expect(draft.kind).toBe(10_007);
    expect(draft.tags).toEqual([["relay", "wss://search.example/"]]);
  });
});
