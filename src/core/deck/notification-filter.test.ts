import { describe, expect, it } from "vitest";
import type { NostrEvent } from "../nostr/event";
import { excludeOwnActions } from "./notification-filter";

const VIEWER = "a".repeat(64);
const OTHER = "b".repeat(64);

const evt = (id: string, pubkey: string): NostrEvent =>
  ({
    id,
    pubkey,
    created_at: 1,
    kind: 1,
    tags: [],
    content: "",
    sig: "",
  }) as NostrEvent;

describe("excludeOwnActions", () => {
  it("閲覧者が著者のイベントだけを落とす", () => {
    // 捕まえる変異: 比較の向きを逆にする (他人の反応が全部消えてカラムが
    // 空になる) / 何も落とさない (自分の投稿に自分でリアクションすると
    // 通知に自分が並ぶ)
    expect(
      excludeOwnActions(
        [evt("mine", VIEWER), evt("theirs", OTHER)],
        VIEWER,
      ).map((event) => event.id),
    ).toEqual(["theirs"]);
  });

  it("順序を変えない", () => {
    // 捕まえる変異: sort や reverse を挟む。並び順はセクションが
    // created_at 降順で決めており、ここは通すだけの層である。
    expect(
      excludeOwnActions(
        [evt("c", OTHER), evt("a", OTHER), evt("b", OTHER)],
        VIEWER,
      ).map((event) => event.id),
    ).toEqual(["c", "a", "b"]);
  });
});
