import { scanNips } from "./nip-tracking.mjs";

const [repo, base, head, output] = process.argv.slice(2);
if (!repo || !base || !head || !output) {
  throw Error(
    "使い方: vp run nips:scan <nips の checkout> <前回 SHA> <今回 SHA> <出力先>",
  );
}
const report = await scanNips({ repo, base, head, output });
console.log(
  JSON.stringify({
    changed: report.changed.length,
    actionable: report.changed.filter(
      (item) => item.status !== "未対応" && item.status !== "未記載",
    ).length,
    unmapped: report.changed.filter((item) => item.status === "未記載").length,
    head: report.head,
  }),
);
