import { describe, expect, it } from "vite-plus/test";
import type { NostrEvent } from "../nostr/event";
import { MAX_COMMENT_DEPTH, commentTree } from "./comment-tree";

const ARTICLE = `30023:${"8".repeat(64)}:post`;

let seq = 0;
const comment = (parent: string | undefined, createdAt: number): NostrEvent => {
  seq += 1;
  return {
    id: seq.toString(16).padStart(64, "0"),
    pubkey: "b".repeat(64),
    created_at: createdAt,
    kind: 1111,
    tags: [
      ["A", ARTICLE],
      ["K", "30023"],
      parent ? ["e", parent, "", "c".repeat(64)] : ["a", ARTICLE],
      ["k", parent ? "1111" : "30023"],
    ],
    content: "",
    sig: "",
  };
};

const shape = (events: NostrEvent[]) =>
  commentTree(events).map((row) => [row.event.id, row.depth]);

describe("commentTree", () => {
  it("記事への直接のコメントを古い順に並べ、返信をその下に入れる", () => {
    const first = comment(undefined, 10);
    const second = comment(undefined, 20);
    const reply = comment(first.id, 30);
    // 捕まえる変異: 届いた順や新しい順に並べる / 返信を親の下に入れない
    expect(shape([second, reply, first])).toEqual([
      [first.id, 0],
      [reply.id, 1],
      [second.id, 0],
    ]);
  });

  it("深い返信は同じ段で止める", () => {
    let parent: NostrEvent = comment(undefined, 0);
    const events = [parent];
    for (let i = 1; i <= MAX_COMMENT_DEPTH + 2; i++) {
      parent = comment(parent.id, i);
      events.push(parent);
    }
    // 捕まえる変異: 深さを止めない（狭いカラムで本文の幅が無くなる）
    expect(Math.max(...commentTree(events).map((row) => row.depth))).toBe(
      MAX_COMMENT_DEPTH,
    );
  });

  it("親が手元に無いコメントも一番上の段に出す", () => {
    const orphan = comment("f".repeat(64), 5);
    // 捕まえる変異: 親が見つからないものを落とす
    expect(shape([orphan])).toEqual([[orphan.id, 0]]);
  });

  it("互いを親として指す壊れたコメントでも止まらず、落とさない", () => {
    const a = comment("0".repeat(63) + "f", 1);
    const b = comment(a.id, 2);
    a.tags[2] = ["e", b.id, "", "c".repeat(64)];
    // 捕まえる変異: 訪問済みを持たない（無限に辿る）/ 上から辿れないものを捨てる
    expect(commentTree([a, b])).toHaveLength(2);
  });

  it("コメントでないものは並べない", () => {
    expect(commentTree([{ ...comment(undefined, 0), kind: 1 }])).toEqual([]);
  });
});
