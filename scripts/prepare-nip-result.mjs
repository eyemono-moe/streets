import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";

const directory = ".nip-tracking";
const decision = JSON.parse(
  await readFile(`${directory}/decision.json`, "utf8"),
);
const report = JSON.parse(await readFile(`${directory}/report.json`, "utf8"));
if (!["code", "none", "review"].includes(decision.impact)) {
  throw Error("decision.json の impact が不正です");
}
if (!["高", "中", "低"].includes(decision.confidence)) {
  throw Error("decision.json の confidence が不正です");
}
if (
  typeof decision.summary !== "string" ||
  !decision.summary.trim() ||
  decision.summary.length > 3000
) {
  throw Error("decision.json の summary が不正です");
}
if (!Array.isArray(report.changed) || report.changed.length === 0) {
  throw Error("差分がないのに agent が実行されました");
}
const allowed = (file) =>
  file.startsWith("packages/core/src/") ||
  file.startsWith("apps/web/src/") ||
  file === "docs/nips.md";
const touched = [
  ...execFileSync("git", ["diff", "--name-only", "HEAD"], {
    encoding: "utf8",
  })
    .trim()
    .split("\n")
    .filter(Boolean),
  ...execFileSync("git", ["ls-files", "--others", "--exclude-standard"], {
    encoding: "utf8",
  })
    .trim()
    .split("\n")
    .filter(Boolean),
];
for (const file of touched) {
  if (!allowed(file) && !file.startsWith(`${directory}/`)) {
    throw Error(`許可されていない変更: ${file}`);
  }
}
execFileSync("git", [
  "add",
  "-A",
  "--",
  "packages/core/src",
  "apps/web/src",
  "docs/nips.md",
]);
const names = execFileSync("git", ["diff", "--cached", "--name-only", "-z"], {
  encoding: "utf8",
})
  .split("\0")
  .filter(Boolean);
if (names.length > 0 && decision.impact !== "code") {
  throw Error("コードを変更したのに impact が code ではありません");
}
if (names.length === 0 && decision.impact === "code") {
  decision.impact = "review";
  decision.summary += "（変更ファイルがないため、人による確認が必要）";
  await writeFile(
    `${directory}/decision.json`,
    `${JSON.stringify(decision, null, 2)}\n`,
  );
}
const patch = execFileSync("git", ["diff", "--cached", "--binary"], {
  maxBuffer: 5_000_000,
});
await writeFile(`${directory}/changes.patch`, patch);
console.log(JSON.stringify({ changed: names.length, impact: decision.impact }));
