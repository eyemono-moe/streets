import { describe, expect, it } from "vitest";
import { type EventRenderer, rendererFor } from "./renderer-registry";

/** full/compact の中身はこのテストの関心事ではない。identity の比較にだけ使う。 */
const stub = () => null;

const rendererOf = (kind: number): EventRenderer => ({
  kind,
  full: stub,
  compact: stub,
});

describe("rendererFor", () => {
  it("登録済み kind のレンダラを返す", () => {
    // 捕まえる変異: kind を見ずに常に先頭 (または常に末尾) の要素を返す。
    // target を配列の中間に置くことで、位置に頼った実装を区別する
    // (先頭固定なら rendererOf(0) を、末尾固定なら rendererOf(6) を返し、
    // どちらも target とは一致しない)。
    const target = rendererOf(1);
    expect(rendererFor([rendererOf(0), target, rendererOf(6)], 1)).toBe(target);
  });

  it("未登録の kind は undefined を返す", () => {
    // 捕まえる変異: 見つからなければ最初の要素をフォールバックとして返す
    expect(rendererFor([rendererOf(0), rendererOf(1)], 999)).toBeUndefined();
  });

  it("同じ kind が複数登録されていたら先に登録された方を返す", () => {
    // 捕まえる変異: 後勝ちにする (末尾方向から探す・配列を反転して探す等)。
    // このスライスで重複登録を作る呼び出し元は無いので、他のどのテストも
    // この規則を間接的に検証できない —— 直接固定する。
    const first = rendererOf(1);
    const second = rendererOf(1);
    expect(rendererFor([first, second], 1)).toBe(first);
  });
});
