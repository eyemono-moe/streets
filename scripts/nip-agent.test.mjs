import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { copilotArgs } from "./nip-agents/copilot.mjs";

const runner = fileURLToPath(new URL("./run-nip-agent.mjs", import.meta.url));

test("Copilot 固有のモデルと権限は driver 内で指定する", () => {
  const args = copilotArgs("判断して", "auto");
  assert.deepEqual(args.slice(0, 2), ["-p", "判断して"]);
  assert.ok(args.includes("--model=auto"));
  assert.ok(args.includes("--allow-tool=write,shell(vp:*)"));
});

test("既定の manual driver は外部モデルを呼ばず確認用の判断を残す", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "streets-nip-agent-"));
  await mkdir(path.join(directory, ".github"));
  await mkdir(path.join(directory, ".nip-tracking"));
  await writeFile(
    path.join(directory, ".github/nip-tracking-prompt.md"),
    "指示",
  );
  await writeFile(path.join(directory, ".nip-tracking/report.json"), "{}");
  execFileSync("node", [runner], {
    cwd: directory,
    env: { ...process.env, NIP_AGENT_DRIVER: "manual" },
  });
  const decision = JSON.parse(
    await readFile(path.join(directory, ".nip-tracking/decision.json"), "utf8"),
  );
  const agent = JSON.parse(
    await readFile(path.join(directory, ".nip-tracking/agent.json"), "utf8"),
  );
  assert.equal(decision.impact, "review");
  assert.deepEqual(agent, { provider: "manual", model: "なし" });
});
