import { describe, expect, it } from "vitest";
import { verifyOptimisticInsert } from "./verify-optimistic-insert";

describe("verifyOptimisticInsert", () => {
  it("rejected な verdict は投稿エラーとして throw する", () => {
    // 捕まえる変異: store.put() の戻り値を無視してそのまま進む (元の
    // バグ)。壊れた id/署名の投稿を EventStore に入れないまま楽観表示だけ
    // 出し、publisher.publish() へもそのまま渡してしまう。
    expect(() => verifyOptimisticInsert("rejected")).toThrow();
  });

  it("hidden な verdict は削除済みイベントの再送を止める", () => {
    // 捕まえる変異: hidden を rejected と同じ拡張機能エラーにする。ユーザーが
    // 内容か時刻を変えれば投稿し直せることを判断できなくなる。
    expect(() => verifyOptimisticInsert("hidden")).toThrow(
      "この投稿は削除済みです。内容か投稿時刻を変えて投稿し直してください。",
    );
  });

  it("inserted なら検証済みの verdict をそのまま返す (楽観表示へ進んでよい)", () => {
    // 捕まえる変異: verdict を返さず void のままにする。呼び出し側
    // (writer.ts) が「新規に挿入したのか、既存の再送だったのか」を
    // 区別できなくなり、publish 全滅時に自分より前の書き込みを誤って
    // 巻き戻してしまう。
    expect(verifyOptimisticInsert("inserted")).toBe("inserted");
  });

  it("duplicate はエラーではなく、verdict をそのまま返す (既に手元にあるので表示してよい)", () => {
    // 捕まえる変異: duplicate も rejected と同じ扱いにして誤って投稿を
    // 止めてしまう。
    expect(verifyOptimisticInsert("duplicate")).toBe("duplicate");
  });
});
