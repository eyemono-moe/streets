import { describe, expect, it } from "vite-plus/test";
import { buildUserStatus } from "../nostr/build/user-status";
import type { UserStatus } from "../nostr/user-status";
import {
  type StatusFormEvent,
  type StatusFormState,
  canSubmitStatusForm,
  closedStatusForm,
  statusExpiresAt,
  statusFormInput,
  statusFormTransition,
} from "./status-form";

const run = (...events: StatusFormEvent[]): StatusFormState =>
  events.reduce(statusFormTransition, closedStatusForm());

const current: UserStatus = {
  type: "general",
  content: "作業中",
  link: { type: "url", url: "https://example.com/" },
  expiresAt: 5000,
  tags: [],
};

describe("statusFormTransition", () => {
  it("今のステータスから開き、期限はそのまま", () => {
    const state = run({ type: "status-form/open", current });
    expect(state.phase === "editing" && state.draft).toEqual({
      content: "作業中",
      link: "https://example.com/",
      expiry: "keep",
    });
  });

  it("何も変えていなければ保存できず、閉じられる", () => {
    const opened = run({ type: "status-form/open", current });
    expect(canSubmitStatusForm(opened)).toBe(false);
    expect(
      statusFormTransition(opened, { type: "status-form/close" }).phase,
    ).toBe("closed");
  });

  it("書きかけで閉じようとしたら閉じず、知らせる", () => {
    // 捕まえる変異: 書きかけを黙って捨てて閉じる
    const state = run(
      { type: "status-form/open", current: undefined },
      { type: "status-form/input", field: "content", value: "休憩中" },
      { type: "status-form/close" },
    );
    expect(state.phase === "editing" && state.blocked).toBe(true);
    expect(
      statusFormTransition(state, { type: "status-form/discard" }).phase,
    ).toBe("closed");
  });

  it("本文が無ければ保存できない", () => {
    const state = run(
      { type: "status-form/open", current: undefined },
      { type: "status-form/input", field: "link", value: "https://a.example" },
    );
    expect(canSubmitStatusForm(state)).toBe(false);
  });

  it("消すのは今のステータスがあるときだけで、空の本文を送る", () => {
    expect(
      run(
        { type: "status-form/open", current: undefined },
        { type: "status-form/clear" },
      ).phase,
    ).toBe("editing");
    const clearing = run(
      { type: "status-form/open", current },
      { type: "status-form/clear" },
    );
    if (clearing.phase === "closed") throw new Error("closed");
    expect(statusFormInput(clearing, new Date(0))).toEqual({ content: "" });
  });

  it("失敗したら書き直せる状態に戻る", () => {
    const state = run(
      { type: "status-form/open", current: undefined },
      { type: "status-form/input", field: "content", value: "外出中" },
      { type: "status-form/submit" },
      { type: "status-form/failed" },
    );
    expect(state.phase).toBe("editing");
  });
});

describe("statusExpiresAt", () => {
  const now = new Date(2026, 9, 1, 10, 0, 0);
  const seconds = Math.floor(now.getTime() / 1000);

  it("選んだ期限を秒にする", () => {
    expect(statusExpiresAt("never", now, 1)).toBeUndefined();
    expect(statusExpiresAt("keep", now, 123)).toBe(123);
    expect(statusExpiresAt("1h", now, undefined)).toBe(seconds + 3600);
  });

  it("今日中は、その日の終わり", () => {
    const end = Math.floor(new Date(2026, 9, 1, 23, 59, 59).getTime() / 1000);
    expect(statusExpiresAt("today", now, undefined)).toBe(end);
  });
});

describe("buildUserStatus", () => {
  it("d=general に本文・リンク・期限を書く", () => {
    expect(
      buildUserStatus({
        content: " 作業中 ",
        link: "https://example.com/",
        expiresAt: 99,
      }),
    ).toEqual({
      kind: 30_315,
      content: "作業中",
      tags: [
        ["d", "general"],
        ["r", "https://example.com/"],
        ["expiration", "99"],
      ],
    });
  });

  it("消すときは、リンクや期限を残さない", () => {
    expect(
      buildUserStatus({ content: "", link: "https://x", expiresAt: 1 }).tags,
    ).toEqual([["d", "general"]]);
  });
});
