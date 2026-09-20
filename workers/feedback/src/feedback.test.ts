import { describe, expect, it } from "vitest";
import { issueBody, parseFeedback, parseOrganizedFeedback } from "./feedback";

const input = parseFeedback({
  id: "response-1",
  submittedAt: "2026-09-21T00:00:00Z",
  kind: "bug",
  summary: "投稿できない",
  details: "投稿ボタンを押しても完了しません",
  context: "Streets: preview",
});

describe("parseFeedback", () => {
  it("必要な項目だけを受け取る", () => {
    expect(input).toMatchObject({ id: "response-1", kind: "bug" });
  });

  it("未知の種別と長すぎる入力を拒む", () => {
    expect(() => parseFeedback({ ...input, kind: "other" })).toThrow();
    expect(() =>
      parseFeedback({ ...input, details: "a".repeat(8_001) }),
    ).toThrow();
  });
});

describe("parseOrganizedFeedback", () => {
  it("許可していないラベルと長すぎる配列を捨てる", () => {
    const organized = parseOrganizedFeedback(
      {
        title: "投稿に失敗する",
        category: "bug",
        summary: "投稿が完了しない",
        steps: Array.from({ length: 20 }, (_, index) => `${index}`),
        labels: ["bug", "P1", "ui"],
        needsHumanReview: false,
      },
      input,
    );
    expect(organized.labels).toEqual(["feedback", "needs-triage", "bug", "ui"]);
    expect(organized.steps).toHaveLength(10);
  });
});

describe("issueBody", () => {
  it("原文と重複防止IDを必ず残す", () => {
    const detailedInput = {
      ...input,
      details:
        "投稿ボタンを押しても完了しません\n操作を繰り返しました\n補足情報です",
    };
    const body = issueBody(detailedInput, {
      title: "投稿に失敗する",
      category: "bug",
      summary: "整理した概要",
      steps: [],
      labels: ["bug"],
      needsHumanReview: true,
    });
    expect(body).toContain("投稿ボタンを押しても完了しません");
    expect(body).toContain("<!-- streets-feedback-id:response-1 -->");
  });

  it("短い報告を本文内で重複させない", () => {
    const body = issueBody(input, {
      title: input.summary,
      category: "bug",
      summary: input.details,
      steps: [],
      labels: ["bug"],
      needsHumanReview: false,
    });
    expect(body.match(/投稿ボタンを押しても完了しません/g)).toHaveLength(1);
    expect(body).not.toContain("報告内容（原文）");
  });
});
