import { readFile, writeFile } from "node:fs/promises";

const drivers = {
  manual: () => import("./nip-agents/manual.mjs"),
  copilot: () => import("./nip-agents/copilot.mjs"),
};
const provider = process.env.NIP_AGENT_DRIVER || "manual";
const load = drivers[provider];
if (!load) throw Error(`未対応の NIP agent: ${provider}`);

/** agent の共通契約は report.md を読み、decision.json と必要なコード変更を残すこと。 */
const prompt = await readFile(".github/nip-tracking-prompt.md", "utf8");
await readFile(".nip-tracking/report.json", "utf8");
const model = process.env.NIP_AGENT_MODEL || "auto";
const result = await (await load()).run({ prompt, model });
await writeFile(
  ".nip-tracking/agent.json",
  `${JSON.stringify(result, null, 2)}\n`,
);
console.log(`NIP agent: ${result.provider}（model: ${result.model}）`);
