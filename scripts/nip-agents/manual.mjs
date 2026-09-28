import { writeFile } from "node:fs/promises";

/** 評価前の既定動作。更新を人が確認できる Issue へ送る。 */
export const run = async () => {
  await writeFile(
    ".nip-tracking/decision.json",
    `${JSON.stringify(
      {
        impact: "review",
        confidence: "低",
        summary:
          "自動実装用の agent はまだ評価・有効化されていません。NIP の差分と影響候補を人が確認してください。",
      },
      null,
      2,
    )}\n`,
  );
  return { provider: "manual", model: "なし" };
};
