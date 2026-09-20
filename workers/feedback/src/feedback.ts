import type { FeedbackInput, FeedbackKind, OrganizedFeedback } from "./types";

const KINDS = new Set<FeedbackKind>(["bug", "request", "question"]);
const ALLOWED_LABELS = new Set([
  "bug",
  "enhancement",
  "question",
  "ui",
  "documentation",
]);

const CATEGORY_LABELS: Record<FeedbackKind, string> = {
  bug: "bug",
  request: "enhancement",
  question: "question",
};

const text = (
  value: unknown,
  name: string,
  maximum: number,
  required = false,
): string | undefined => {
  if (value === undefined || value === null || value === "") {
    if (required) throw new Error(`${name}は必須です`);
    return undefined;
  }
  if (typeof value !== "string")
    throw new Error(`${name}が文字列ではありません`);
  const normalized = value.trim();
  if (required && normalized.length === 0) throw new Error(`${name}は必須です`);
  if (normalized.length > maximum) throw new Error(`${name}が長すぎます`);
  return normalized;
};

export const parseFeedback = (value: unknown): FeedbackInput => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("入力がオブジェクトではありません");
  }
  const input = value as Record<string, unknown>;
  const kind = text(input.kind, "kind", 20, true);
  if (!KINDS.has(kind as FeedbackKind)) throw new Error("kindが不正です");
  const optional = (name: string, maximum: number) =>
    text(input[name], name, maximum);
  return {
    id: text(input.id, "id", 100, true) as string,
    submittedAt: text(input.submittedAt, "submittedAt", 100, true) as string,
    kind: kind as FeedbackKind,
    summary: text(input.summary, "summary", 300, true) as string,
    details: text(input.details, "details", 8_000, true) as string,
    steps: optional("steps", 4_000),
    expected: optional("expected", 4_000),
    actual: optional("actual", 4_000),
    context: optional("context", 2_000),
  };
};

const clean = (value: unknown, maximum: number): string | undefined =>
  typeof value === "string" && value.trim()
    ? value.trim().slice(0, maximum)
    : undefined;

export const parseOrganizedFeedback = (
  value: unknown,
  fallback: FeedbackInput,
): OrganizedFeedback => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("AI出力がオブジェクトではありません");
  }
  const output = value as Record<string, unknown>;
  const category = KINDS.has(output.category as FeedbackKind)
    ? (output.category as FeedbackKind)
    : fallback.kind;
  const steps = Array.isArray(output.steps)
    ? output.steps
        .map((step) => clean(step, 500))
        .filter((step): step is string => step !== undefined)
        .slice(0, 10)
    : [];
  const labels = Array.isArray(output.labels)
    ? output.labels
        .filter((label): label is string => typeof label === "string")
        .filter((label) => ALLOWED_LABELS.has(label))
    : [];
  return {
    title: clean(output.title, 100) ?? fallback.summary.slice(0, 100),
    category,
    summary: clean(output.summary, 2_000) ?? fallback.details,
    steps,
    expected: clean(output.expected, 2_000),
    actual: clean(output.actual, 2_000),
    labels: [...new Set([CATEGORY_LABELS[category], ...labels])],
    needsHumanReview: output.needsHumanReview !== false,
  };
};

const section = (title: string, body: string | undefined): string =>
  body ? `## ${title}\n\n${body}\n\n` : "";

const comparable = (value: string): string => value.replace(/\s+/g, " ").trim();

const originalReport = (input: FeedbackInput): string =>
  input.details.includes(input.summary)
    ? input.details
    : `${input.summary}\n\n${input.details}`;

export const benefitsFromOrganization = (input: FeedbackInput): boolean =>
  input.details.length >= 240 || input.details.split(/\r?\n/).length >= 3;

export const issueBody = (
  input: FeedbackInput,
  organized: OrganizedFeedback,
): string => {
  const original = originalReport(input);
  const preserveOriginal =
    benefitsFromOrganization(input) &&
    comparable(organized.summary) !== comparable(original);
  return (
    `${section("概要", organized.summary)}` +
    `${section("再現手順", organized.steps.length > 0 ? organized.steps.map((step, index) => `${index + 1}. ${step}`).join("\n") : input.steps)}` +
    `${section("期待した結果", organized.expected ?? input.expected)}` +
    `${section("実際の結果", organized.actual ?? input.actual)}` +
    `${section("報告内容（原文）", preserveOriginal ? original : undefined)}` +
    `${section("環境", input.context)}` +
    `${organized.needsHumanReview ? "> AIによる整理結果を人が確認する必要があります。\n\n" : ""}` +
    `<!-- streets-feedback-id:${input.id} -->`
  );
};

export const fallbackOrganization = (
  input: FeedbackInput,
  needsHumanReview = true,
): OrganizedFeedback => ({
  title: input.summary.slice(0, 100),
  category: input.kind,
  summary: input.details,
  steps: [],
  expected: input.expected,
  actual: input.actual,
  labels: [CATEGORY_LABELS[input.kind]],
  needsHumanReview,
});
