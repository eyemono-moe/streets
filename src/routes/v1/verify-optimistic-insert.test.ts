import { describe, expect, it } from "vitest";
import { verifyOptimisticInsert } from "./verify-optimistic-insert";

describe("verifyOptimisticInsert (final review, Important 5)", () => {
  it("rejected な verdict は投稿エラーとして throw する", () => {
    // 捕まえる変異: store.put() の戻り値を無視してそのまま進む (元の
    // バグ)。壊れた id/署名の投稿を EventStore に入れないまま楽観表示だけ
    // 出し、publisher.publish() へもそのまま渡してしまう。
    expect(() => verifyOptimisticInsert("rejected")).toThrow();
  });

  it("inserted なら何もしない (楽観表示へ進んでよい)", () => {
    expect(() => verifyOptimisticInsert("inserted")).not.toThrow();
  });

  it("duplicate はエラーではない (既に手元にあるので表示してよい)", () => {
    // 捕まえる変異: duplicate も rejected と同じ扱いにして誤って投稿を
    // 止めてしまう。
    expect(() => verifyOptimisticInsert("duplicate")).not.toThrow();
  });
});
