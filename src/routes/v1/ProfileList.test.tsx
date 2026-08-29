import { createRoot } from "solid-js";
import { describe, expect, it } from "vitest";
import ProfileList from "./ProfileList";

const mountEmpty = (status: Parameters<typeof ProfileList>[0]["status"]) => {
  let element: HTMLElement | undefined;
  createRoot((dispose) => {
    element = ProfileList({
      kind: "followers-list",
      items: () => [],
      status,
    }) as unknown as HTMLElement;
    dispose();
  });
  if (!element) throw new Error("ProfileList did not mount");
  return element;
};

describe("ProfileList", () => {
  it("取得が完了した空一覧だけを0人と断定する", () => {
    // 捕まえる変異: settled を見ず、取得中から0人と表示する。
    expect(mountEmpty(() => ({ phase: "settled" })).textContent).toContain(
      "該当するユーザーはいません。",
    );
    expect(mountEmpty(() => ({ phase: "initial" })).textContent).not.toContain(
      "該当するユーザーはいません。",
    );
  });

  it("不完全取得を0人と断定せず、開き直す手段を示す", () => {
    // 捕まえる変異: incomplete を無視して settled の空表示へ落とす。
    const element = mountEmpty(() => ({
      phase: "settled",
      incomplete: {
        unreachableRelays: 1,
        unroutableAuthors: 0,
        uncoveredAuthors: 0,
      },
    }));
    expect(element.textContent).toContain("一覧を取得できませんでした");
    expect(element.textContent).toContain("カラムを開き直してください");
    expect(element.textContent).not.toContain("該当するユーザーはいません。");
    expect(element.querySelector('[role="alert"]')).not.toBeNull();
  });
});
