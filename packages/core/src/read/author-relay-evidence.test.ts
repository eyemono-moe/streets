import { describe, expect, it } from "vite-plus/test";
import {
  AuthorRelayEvidence,
  MISSES_TO_DEMOTE,
  SectionRelayRounds,
} from "./author-relay-evidence";

const A = "wss://a/";
const B = "wss://b/";
const C = "wss://c/";

const ask = (authors: string[], extra: object = {}) => [
  { kinds: [1], authors, ...extra },
];

describe("SectionRelayRounds", () => {
  it("読み終えた 2 本を突き合わせ、片方だけが返した投稿を取りこぼしにする", () => {
    const rounds = new SectionRelayRounds();
    rounds.sent(A, ask(["alice"]));
    rounds.sent(B, ask(["alice"]));
    rounds.received(A, "x", "alice", 200);
    rounds.received(A, "y", "alice", 100);
    rounds.received(B, "y", "alice", 100);

    expect(rounds.completed(A)).toEqual([]);
    expect(rounds.completed(B)).toEqual([
      { author: "alice", relay: B, id: "x" },
    ]);
  });

  it("何も返さなかったリレーは、もう一方が返した投稿をすべて取りこぼしたことになる", () => {
    const rounds = new SectionRelayRounds();
    rounds.sent(A, ask(["alice"]));
    rounds.sent(B, ask(["alice"]));
    rounds.received(A, "x", "alice", 200);
    rounds.received(A, "y", "alice", 100);
    rounds.completed(B);

    expect(
      rounds
        .completed(A)
        .map((miss) => miss.id)
        .sort(),
    ).toEqual(["x", "y"]);
  });

  it("返した中でいちばん古いものより前は、切られただけかもしれないので数えない", () => {
    const rounds = new SectionRelayRounds();
    rounds.sent(A, ask(["alice", "bob"], { limit: 2 }));
    rounds.sent(B, ask(["alice", "bob"], { limit: 2 }));
    rounds.received(A, "new", "alice", 300);
    rounds.received(A, "old", "alice", 100);
    rounds.received(B, "new", "alice", 300);
    rounds.received(B, "bob", "bob", 250);
    rounds.completed(A);

    // B は 250 より前を読み終えていないので old は数えない。A は 100 まで読み終えて
    // いるのに bob の 250 を返していない。
    expect(rounds.completed(B)).toEqual([
      { author: "bob", relay: A, id: "bob" },
    ]);
  });

  it("名指ししていない人の投稿では数えない", () => {
    const rounds = new SectionRelayRounds();
    rounds.sent(A, ask(["alice", "bob"]));
    rounds.sent(B, ask(["alice"]));
    rounds.received(A, "b1", "bob", 200);
    rounds.completed(A);

    expect(rounds.completed(B)).toEqual([]);
  });

  it("EOSE の後に届いた投稿では数えない", () => {
    const rounds = new SectionRelayRounds();
    rounds.sent(A, ask(["alice"]));
    rounds.sent(B, ask(["alice"]));
    rounds.completed(A);
    rounds.completed(B);
    rounds.received(A, "live", "alice", 500);

    expect(rounds.completed(A)).toEqual([]);
  });

  it("送り直したら前の回の答えを捨てる", () => {
    const rounds = new SectionRelayRounds();
    rounds.sent(A, ask(["alice"]));
    rounds.received(A, "x", "alice", 200);
    rounds.completed(A);
    rounds.sent(A, ask(["alice"]));
    rounds.sent(B, ask(["alice"]));
    rounds.completed(A);

    expect(rounds.completed(B)).toEqual([]);
  });

  it("3 本目が読み終えたら、読み終えている 2 本のどちらとも突き合わせる", () => {
    const rounds = new SectionRelayRounds();
    for (const relay of [A, B, C]) rounds.sent(relay, ask(["alice"]));
    rounds.received(A, "x", "alice", 200);
    rounds.received(B, "y", "alice", 200);
    rounds.completed(A);
    rounds.completed(B);

    const misses = rounds.completed(C);
    expect(misses.map((miss) => `${miss.relay}${miss.id}`).sort()).toEqual([
      `${C}x`,
      `${C}y`,
    ]);
  });
});

describe("AuthorRelayEvidence", () => {
  it(`同じ組で ${MISSES_TO_DEMOTE} 件取りこぼしたら、その人の候補から外す`, () => {
    const evidence = new AuthorRelayEvidence();
    expect(evidence.record([{ author: "alice", relay: B, id: "x" }])).toBe(
      false,
    );
    expect(evidence.usable("alice", [A, B, C])).toEqual([A, B, C]);
    expect(evidence.record([{ author: "alice", relay: B, id: "x" }])).toBe(
      false,
    );
    expect(evidence.record([{ author: "alice", relay: B, id: "y" }])).toBe(
      true,
    );
    expect(evidence.usable("alice", [A, B, C])).toEqual([A, C]);
    expect(evidence.usable("bob", [A, B])).toEqual([A, B]);
  });

  it("全部外れたら、外さずに宣言したリレーをそのまま返す", () => {
    const evidence = new AuthorRelayEvidence();
    evidence.record([
      { author: "alice", relay: A, id: "1" },
      { author: "alice", relay: A, id: "2" },
    ]);
    expect(evidence.usable("alice", [A])).toEqual([A]);
  });
});
