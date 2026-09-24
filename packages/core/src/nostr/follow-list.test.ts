import { describe, expect, it } from "vite-plus/test";
import { followeesFrom, followersFrom, followsPubkey } from "./follow-list";

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

describe("followsPubkey", () => {
  const me = "a".repeat(64);

  it("p タグに自分がいればフォローされている", () => {
    expect(
      followsPubkey(
        {
          tags: [
            ["p", "b".repeat(64)],
            ["p", me],
          ],
        },
        me,
      ),
    ).toBe(true);
  });

  it("p 以外のタグに自分がいてもフォローではない", () => {
    expect(followsPubkey({ tags: [["e", me]] }, me)).toBe(false);
  });

  it("kind:3 が無いときは分からない", () => {
    expect(followsPubkey(undefined, me)).toBeUndefined();
  });
});
