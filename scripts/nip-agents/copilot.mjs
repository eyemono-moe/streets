import { execFileSync } from "node:child_process";

export const copilotArgs = (prompt, model) => [
  "-p",
  prompt,
  "--no-ask-user",
  "--no-auto-update",
  "--excluded-tools=web_fetch,web_search",
  "--allow-tool=write,shell(vp:*)",
  `--model=${model}`,
];

/** Copilot 固有のインストール・認証・起動をこのファイルに閉じる。 */
export const run = async ({ prompt, model }) => {
  if (!process.env.GITHUB_TOKEN) {
    throw Error("Copilot の実行には GITHUB_TOKEN が必要です");
  }
  execFileSync("npm", ["install", "-g", "@github/copilot"], {
    stdio: "inherit",
  });
  execFileSync("copilot", copilotArgs(prompt, model), {
    stdio: "inherit",
  });
  return { provider: "copilot", model };
};
