// 消してほしいと頼まれた絵文字の URL から、workers/app/src/emoji-denylist.ts に足すハッシュを出す。
import { createHash } from "node:crypto";

const url = process.argv[2];
if (!url?.startsWith("https://emoji.streets.eyemono.moe/v1/")) {
  console.error(
    "使い方: vp run emoji:deny-hash -- https://emoji.streets.eyemono.moe/v1/…",
  );
  process.exit(1);
}
console.log(createHash("sha256").update(url).digest("hex"));
