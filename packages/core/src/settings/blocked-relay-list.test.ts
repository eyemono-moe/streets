import { describe, expect, it } from "vite-plus/test";
import type { NostrEvent } from "../nostr/event";
import {
  loadBlockedRelaysCache,
  parseBlockedRelays,
  saveBlockedRelaysCache,
  setBlockedRelays,
} from "./blocked-relay-list";

const event = (tags: string[][], content = ""): NostrEvent => ({
  id: "0".repeat(64),
  pubkey: "a".repeat(64),
  created_at: 1000,
  kind: 10_006,
  tags,
  content,
  sig: "0".repeat(128),
});

describe("繋がないリレー（kind:10006）", () => {
  it("relay タグを読み、形をそろえて重複を落とす", () => {
    expect(
      parseBlockedRelays(
        event([
          ["relay", "wss://Spam.example"],
          ["p", "b".repeat(64)],
          ["relay", "wss://spam.example/"],
          ["relay", "ふつうの文字列"],
          ["relay", "https://not-a-relay.example"],
        ]),
      ),
    ).toEqual(["wss://spam.example/"]);
  });

  it("一覧が無ければ何も止めない", () => {
    expect(parseBlockedRelays(undefined)).toEqual([]);
  });

  it("保存は relay タグの差し替えで、ほかのタグと非公開の項目は残す", () => {
    const draft = setBlockedRelays(["wss://new.example/"])(
      event(
        [
          ["relay", "wss://old.example"],
          ["client", "other"],
        ],
        "encrypted",
      ),
    );
    expect(draft.kind).toBe(10_006);
    expect(draft.tags).toEqual([
      ["relay", "wss://new.example/"],
      ["client", "other"],
    ]);
    expect(draft.content).toBe("encrypted");
  });
});

describe("端末に控える繋がないリレー", () => {
  it("控えた一覧をそのまま読み戻す", () => {
    const relays = ["wss://a.example/", "wss://b.example/"];
    expect(loadBlockedRelaysCache(saveBlockedRelaysCache(relays))).toEqual(
      relays,
    );
  });

  it("控えが無い・壊れているなら何も止めない", () => {
    expect(loadBlockedRelaysCache(null)).toEqual([]);
    expect(loadBlockedRelaysCache("{")).toEqual([]);
    expect(loadBlockedRelaysCache('{"a":1}')).toEqual([]);
    expect(loadBlockedRelaysCache('[1, "wss://ok.example"]')).toEqual([
      "wss://ok.example/",
    ]);
  });
});
