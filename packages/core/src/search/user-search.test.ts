import { describe, expect, it } from "vite-plus/test";
import { encodeBech32, encodeNprofile } from "../nostr/nip19";
import { USER_SEARCH_LIMIT, userSearchFilter } from "./user-search";

const pubkey = "a".repeat(64);

describe("userSearchFilter", () => {
  it("打った言葉でプロフィールを探す", () => {
    expect(userSearchFilter("  jack ")).toEqual({
      kinds: [0],
      search: "jack",
      limit: USER_SEARCH_LIMIT,
    });
  });

  it("日本語は 2 文字から探す", () => {
    expect(userSearchFilter("あ")).toBeUndefined();
    expect(userSearchFilter("あい")?.search).toBe("あい");
  });

  it("空や 1 文字では問い合わせない", () => {
    expect(userSearchFilter("")).toBeUndefined();
    expect(userSearchFilter(" j ")).toBeUndefined();
  });

  it("ID を貼ったときは問い合わせない", () => {
    expect(userSearchFilter(encodeBech32("npub", pubkey))).toBeUndefined();
    const nprofile = encodeNprofile({ pubkey });
    expect(nprofile).toBeDefined();
    expect(userSearchFilter(`nostr:${nprofile}`)).toBeUndefined();
  });
});
