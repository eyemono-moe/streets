import assert from "node:assert/strict";
import test from "node:test";
import {
  categoryQuestion,
  diagnostics,
  leafQuestion,
  oneShotQuestion,
  parseChoiceResponse,
  routeHierarchical,
  selectFixtures,
  summarize,
  validateFixtures,
} from "./signal-eval.mjs";

const responseFor = (question, choice) => ({
  model: "jev-1.13.0",
  usage: { input_tokens: 123, output_tokens: 4 },
  answers: {
    route: {
      type: "choice",
      choice,
      confidence: 0.8,
      probabilities: Object.fromEntries(
        Object.keys(question.criteria).map((option) => [
          option,
          option === choice ? 1 : 0,
        ]),
      ),
    },
  },
});

test("未知の選択肢や壊れた使用量を分類結果として採用しない", () => {
  const question = oneShotQuestion();
  assert.throws(
    () => parseChoiceResponse(responseFor(question, "secret-key"), question),
    /応答形式/,
  );
  const broken = responseFor(question, "post.create");
  broken.usage.input_tokens = -1;
  assert.throws(() => parseChoiceResponse(broken, question), /応答形式/);
  assert.equal(
    parseChoiceResponse(responseFor(question, "post.create"), question).choice,
    "post.create",
  );
});

test("二段階分類は枝が複数あるときだけ追加で呼び、低い確信度を採用する", async () => {
  const questions = [];
  const call = async (_query, question) => {
    questions.push(question);
    const result = parseChoiceResponse(
      responseFor(
        question,
        questions.length === 1 ? "login" : "login.remote-signer",
      ),
      question,
    );
    return {
      ...result,
      confidence: questions.length === 1 ? 0.9 : 0.6,
      latencyMs: 20,
    };
  };
  const result = await routeHierarchical("Amber でログイン", call);
  assert.equal(result.guide, "login.remote-signer");
  assert.equal(result.calls, 2);
  assert.equal(result.confidence, 0.6);
  assert.deepEqual(questions[0], categoryQuestion());
  assert.deepEqual(questions[1], leafQuestion("login"));
});

test("対象外の誤案内と正答への棄権を分けて数える", () => {
  const fixtures = validateFixtures([
    { id: "a", group: "基本", query: "投稿する", expected: "post.create" },
    { id: "b", group: "対象外", query: "天気", expected: null },
  ]);
  const results = new Map([
    [
      "a",
      {
        guide: "post.create",
        confidence: 0.4,
        calls: 1,
        inputTokens: 100,
        outputTokens: 0,
        latencyMs: 10,
      },
    ],
    [
      "b",
      {
        guide: "post.create",
        confidence: 0.9,
        calls: 1,
        inputTokens: 100,
        outputTokens: 0,
        latencyMs: 20,
      },
    ],
  ]);
  const report = summarize(fixtures, results, 0.5);
  assert.equal(report.correct, 0);
  assert.equal(report.abstained, 1);
  assert.equal(report.wrongGuide, 1);
  assert.equal(report.calls, 2);
  assert.deepEqual(report.mismatches, ["a", "b"]);
  assert.deepEqual(diagnostics(fixtures, results), [
    {
      id: "a",
      group: "基本",
      expected: "post.create",
      predicted: "post.create",
      confidence: 0.4,
    },
    {
      id: "b",
      group: "対象外",
      expected: null,
      predicted: "post.create",
      confidence: 0.9,
    },
  ]);
});

test("指定した fixture だけを評価し、未知の ID を拒否する", () => {
  const fixtures = validateFixtures([
    { id: "a", group: "基本", query: "投稿する", expected: "post.create" },
    { id: "b", group: "対象外", query: "天気", expected: null },
  ]);
  assert.deepEqual(selectFixtures(fixtures, "b"), [fixtures[1]]);
  assert.throws(() => selectFixtures(fixtures, "unknown"), /fixture ID/);
  assert.throws(() => selectFixtures(fixtures, "b,b"), /fixture ID/);
});
