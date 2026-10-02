import { describe, expect, it } from "vite-plus/test";
import type { NostrEvent } from "./event";
import { pinNote, pinnedNoteIds, unpinNote } from "./pinned-notes";

const A = "a".repeat(64);
const B = "b".repeat(64);

const pins = (tags: string[][]): NostrEvent => ({
  id: "0".repeat(64),
  pubkey: "c".repeat(64),
  created_at: 0,
  kind: 10_001,
  tags,
  content: "",
  sig: "0".repeat(128),
});

describe("pinnedNoteIds", () => {
  it("後から足したピン留めを先にする", () => {
    // 捕まえる変異: タグの順のまま返し、古いピン留めが上に来る
    expect(
      pinnedNoteIds(
        pins([
          ["e", A],
          ["e", B],
        ]),
      ),
    ).toEqual([B, A]);
  });

  it("壊れた id・重複・e 以外のタグは拾わない", () => {
    expect(
      pinnedNoteIds(
        pins([
          ["e", A],
          ["e", "xyz"],
          ["e", A],
          ["a", `30023:${B}:post`],
        ]),
      ),
    ).toEqual([A]);
  });

  it("リストが無ければ空", () => {
    expect(pinnedNoteIds(undefined)).toEqual([]);
  });
});

describe("pinNote / unpinNote", () => {
  it("kind:10001 の末尾に積み、読むときは新しいものが先になる", () => {
    // 捕まえる変異: 先頭に差し込み、読むと古いピン留めが上に来る
    const next = pinNote(B)(pins([["e", A]]));
    expect(next.kind).toBe(10_001);
    expect(next.tags).toEqual([
      ["e", A],
      ["e", B],
    ]);
  });

  it("外すのは指定した投稿だけ", () => {
    expect(
      unpinNote(A)(
        pins([
          ["e", A],
          ["e", B],
        ]),
      ).tags,
    ).toEqual([["e", B]]);
  });
});
