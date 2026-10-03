import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const directory = ".nip-tracking";
const report = JSON.parse(await readFile(`${directory}/report.json`, "utf8"));
if (!/^[0-9a-f]{40}$/.test(report.head)) throw Error("NIPs の HEAD が不正です");
const hasAgent = process.env.NIP_AGENT_RESULT === "yes";
const decision = hasAgent
  ? JSON.parse(await readFile(`${directory}/decision.json`, "utf8"))
  : undefined;
const agent = hasAgent
  ? JSON.parse(await readFile(`${directory}/agent.json`, "utf8"))
  : undefined;
const confidence =
  agent?.provider === "manual"
    ? "判断の確信度: 未判定"
    : decision
      ? `判断の確信度（生成モデルの自己評価・未校正）: ${decision.confidence}`
      : "判断の確信度: 未判定";
const verification = hasAgent
  ? (await readFile(`${directory}/verification.txt`, "utf8")).trim()
  : "実装対象なし";
const impact = await readFile(`${directory}/report.md`, "utf8");
const ids = report.changed.map((item) => item.nip);
const title = `NIP-${ids.join("・")} の更新を調べる`;
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const gh = (...args) => execFileSync("gh", args, { encoding: "utf8" }).trim();

git("config", "user.name", "github-actions[bot]");
git(
  "config",
  "user.email",
  "41898282+github-actions[bot]@users.noreply.github.com",
);

const openPrs = JSON.parse(
  gh(
    "pr",
    "list",
    "--state",
    "open",
    "--limit",
    "100",
    "--json",
    "headRefName,url",
  ),
);
const branch = `nip-sync/${report.head.slice(0, 12)}`;
const existingPr = openPrs.find((pr) => pr.headRefName === branch);
const automaticPrs = openPrs.filter((pr) =>
  pr.headRefName.startsWith("nip-sync/"),
);
const prLimitReached = automaticPrs.length >= 2 && !existingPr;

if (decision?.impact === "code" && !prLimitReached && !existingPr) {
  git("switch", "-c", branch);
  git("apply", "--index", `${directory}/changes.patch`);
  const changed = git("diff", "--cached", "--name-only")
    .split("\n")
    .filter(Boolean);
  if (changed.length === 0) throw Error("code と判定されたが差分がありません");
  for (const file of changed) {
    if (
      !file.startsWith("packages/core/src/") &&
      !file.startsWith("apps/web/src/") &&
      file !== "docs/nips.md"
    ) {
      throw Error(`許可されていない変更: ${file}`);
    }
  }
  git("commit", "-m", `NIP-${ids.join("・")} の更新に追従する`);
  git("push", "-u", "origin", branch);
  const bodyFile = path.join(directory, "pr-body.md");
  await writeFile(
    bodyFile,
    [
      "NIPs の変更を受けて作成した **draft PR** です。人が仕様と差分を確認してからマージしてください。",
      "",
      impact,
      "## 対応方針と結果",
      "",
      decision.summary,
      "",
      `agent: ${agent.provider}（model: ${agent.model}）`,
      confidence,
      `検証: ${verification}`,
      "",
      "NIP 本文は第三者が編集できるため、仕様データとして扱っています。",
      "",
    ].join("\n"),
  );
  const url = gh(
    "pr",
    "create",
    "--draft",
    "--base",
    "main",
    "--head",
    branch,
    "--title",
    `NIP-${ids.join("・")} の変更に追従する`,
    "--body-file",
    bodyFile,
  );
  console.log(url);
  try {
    gh("workflow", "run", "ci.yaml", "--ref", branch);
  } catch (error) {
    console.error(
      "CI の起動に失敗しました。PR から手動で実行してください",
      error,
    );
  }
}

if (existingPr) console.log(`既存の draft PR: ${existingPr.url}`);
const needsReview =
  report.changed.some((item) => item.status === "未記載") ||
  decision?.impact === "review" ||
  prLimitReached;
if (needsReview) {
  const bodyFile = path.join(directory, "issue-body.md");
  await writeFile(
    bodyFile,
    [
      impact,
      "## 人が確認すること",
      "",
      prLimitReached
        ? "自動作成した PR が 2 件開いているため、新しい PR を止めました。既存の PR を確認してください。"
        : (decision?.summary ??
          "対応表にない NIP です。Streets への影響を確認してください。"),
      "",
      agent
        ? `agent: ${agent.provider}（model: ${agent.model}）`
        : "agent: 実行なし",
      confidence,
      "",
    ].join("\n"),
  );
  const openIssues = JSON.parse(
    gh(
      "issue",
      "list",
      "--state",
      "open",
      "--limit",
      "100",
      "--json",
      "title,url",
    ),
  );
  const existingIssue = openIssues.find((issue) => issue.title === title);
  console.log(
    existingIssue?.url ??
      gh(
        "issue",
        "create",
        "--title",
        title,
        "--label",
        "P2",
        "--body-file",
        bodyFile,
      ),
  );
}

const temp = await mkdtemp(path.join(tmpdir(), "streets-nip-state-"));
const checkout = path.join(temp, "checkout");
let hasState = true;
try {
  git("fetch", "origin", "refs/heads/nip-tracking-state");
} catch {
  hasState = false;
}
if (hasState) {
  git(
    "worktree",
    "add",
    "-b",
    "nip-tracking-state-local",
    checkout,
    "FETCH_HEAD",
  );
} else {
  git("worktree", "add", "--detach", checkout, "HEAD");
  execFileSync("git", [
    "-C",
    checkout,
    "switch",
    "--orphan",
    "nip-tracking-state-local",
  ]);
}
await mkdir(path.join(checkout, "reports"), { recursive: true });
await writeFile(path.join(checkout, "nips-sha.txt"), `${report.head}\n`);
await writeFile(
  path.join(checkout, "reports", `${report.head}.md`),
  [
    impact,
    decision
      ? `対応判定: ${decision.impact}（確信度: ${decision.confidence}、自己評価・未校正）`
      : "対応判定: 実装対象なし",
    decision?.summary ?? "",
    "",
  ].join("\n"),
);
execFileSync("git", ["-C", checkout, "add", "nips-sha.txt", "reports"]);
execFileSync("git", [
  "-C",
  checkout,
  "-c",
  "core.hooksPath=/dev/null",
  "commit",
  "-m",
  `NIPs ${report.head.slice(0, 12)} まで確認`,
]);
execFileSync("git", [
  "-C",
  checkout,
  "push",
  "origin",
  "HEAD:refs/heads/nip-tracking-state",
]);
console.log(`NIPs の確認地点を ${report.head} に進めました`);
