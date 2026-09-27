import { describe, expect, it } from "vite-plus/test";
import { emptyFollowSet } from "./follow-set";
import {
  displayedFollowSets,
  emptyFollowSetEdit,
  followSetEditTransition,
} from "./follow-set-edit";

const VIEWER = "a".repeat(64);
const ALICE = "1".repeat(64);

describe("followSetEditTransition", () => {
  it("送れたものだけを、id で突き合わせて外す", () => {
    // 捕まえる変異: 同じリストへの別の書き込みまで消す
    const written = [
      { id: "1", identifier: "friends", changes: [] },
      { id: "2", identifier: "friends", changes: [] },
    ].reduce(
      (state, write) =>
        followSetEditTransition(state, { type: "follow-sets/write", write }),
      emptyFollowSetEdit(),
    );
    const settled = followSetEditTransition(written, {
      type: "follow-sets/settled",
      id: "1",
    });
    expect(settled.writing.map((write) => write.id)).toEqual(["2"]);
  });
});

describe("displayedFollowSets", () => {
  it("作った直後でまだ届いていないリストも、送っている変更を当てて出す", () => {
    // 捕まえる変異: 届くまで一覧に出さない（作ったのに見えない）
    const state = followSetEditTransition(emptyFollowSetEdit(), {
      type: "follow-sets/write",
      write: {
        id: "1",
        identifier: "new",
        changes: [
          { type: "describe", title: "新しい", description: "", image: "" },
        ],
      },
    });
    expect(displayedFollowSets([], state, VIEWER)).toEqual([
      { ...emptyFollowSet(VIEWER, "new"), title: "新しい" },
    ]);
  });

  it("消している途中のリストは出さない", () => {
    const saved = [
      {
        ...emptyFollowSet(VIEWER, "friends"),
        members: [{ pubkey: ALICE, visibility: "public" as const }],
      },
    ];
    const state = followSetEditTransition(emptyFollowSetEdit(), {
      type: "follow-sets/write",
      write: { id: "1", identifier: "friends", changes: [], deleting: true },
    });
    expect(displayedFollowSets(saved, state, VIEWER)).toEqual([]);
  });
});
