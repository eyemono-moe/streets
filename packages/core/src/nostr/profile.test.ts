import { describe, expect, it } from "vite-plus/test";
import { parseProfile, profileLabel, shortNpub } from "./profile";

const PUBKEY =
  "3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d";

describe("parseProfile", () => {
  it("display_name を displayName として読む", () => {
    expect(
      parseProfile(
        JSON.stringify({
          name: "alice",
          display_name: "Alice",
          picture: "https://example.com/a.png",
        }),
      ),
    ).toEqual({
      name: "alice",
      displayName: "Alice",
      picture: "https://example.com/a.png",
    });
  });

  it("壊れた JSON やオブジェクトでない値は undefined", () => {
    expect(parseProfile("{")).toBeUndefined();
    expect(parseProfile("null")).toBeUndefined();
    expect(parseProfile('"alice"')).toBeUndefined();
  });

  it("型が違う項目だけを捨て、他の項目は残す", () => {
    expect(
      parseProfile(JSON.stringify({ name: 42, display_name: "Alice" })),
    ).toEqual({
      name: undefined,
      displayName: "Alice",
      picture: undefined,
    });
  });

  it("空白だけの値は無いものとして扱う", () => {
    expect(
      parseProfile(JSON.stringify({ name: "alice", display_name: "  " })),
    ).toEqual({
      name: "alice",
      displayName: undefined,
      picture: undefined,
    });
  });
});

describe("profileLabel", () => {
  it("display_name → name → npub の順に落ちる", () => {
    expect(profileLabel({ displayName: "Alice", name: "alice" }, PUBKEY)).toBe(
      "Alice",
    );
    expect(profileLabel({ name: "alice" }, PUBKEY)).toBe("alice");
    expect(profileLabel(undefined, PUBKEY)).toBe(shortNpub(PUBKEY));
  });
});

describe("shortNpub", () => {
  it("npub の先頭 12 文字を返す", () => {
    expect(shortNpub(PUBKEY)).toMatch(/^npub1[02-9ac-hj-np-z]{7}$/);
  });

  it("hex でない pubkey でも投げない", () => {
    expect(shortNpub("not-a-pubkey")).toBe("not-a-pu…");
  });
});
