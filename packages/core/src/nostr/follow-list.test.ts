import { describe, expect, it } from "vitest";
import { followeesFrom, followersFrom } from "./follow-list";

describe("followeesFrom", () => {
  it("p タグの順序を保ったまま pubkey を取り出す", () => {
    const a = "a".repeat(64);
    const b = "b".repeat(64);
    expect(
      followeesFrom({
        tags: [
          ["p", a, "wss://relay.example/", "someone"],
          ["e", "e".repeat(64)],
          ["p", b],
        ],
      }),
    ).toEqual([a, b]);
  });

  it("同じ pubkey が 2 回書かれていても 1 人として数える", () => {
    const a = "a".repeat(64);
    expect(
      followeesFrom({
        tags: [
          ["p", a],
          ["p", a],
        ],
      }),
    ).toEqual([a]);
  });

  it("pubkey として読めない値は落とす", () => {
    expect(
      followeesFrom({
        tags: [["p", "npub1xxx"], ["p", ""], ["p", "A".repeat(64)], ["p"]],
      }),
    ).toEqual([]);
  });

  it("kind:3 がまだ無ければ空", () => {
    expect(followeesFrom(undefined)).toEqual([]);
  });
});

describe("followersFrom", () => {
  it("同じ人の kind:3 が複数届いても 1 人として数える", () => {
    expect(
      followersFrom([{ pubkey: "a" }, { pubkey: "b" }, { pubkey: "a" }]),
    ).toEqual(["a", "b"]);
  });
});
