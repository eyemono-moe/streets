import assert from "node:assert/strict";
import { test } from "node:test";
import { announcementContent } from "./release-announcement.mjs";

test("見出しを【】に、リンクを「文字 (URL)」にし、日付と余分な空行を落とす", () => {
  const notes = [
    "---",
    "date: 2026-10-02",
    "---",
    "",
    "## 新しくできること",
    "",
    "- [Streets](https://streets.eyemono.moe) で投稿できる",
    "",
    "",
    "## 直したこと",
    "",
    "- nostr:npub1abc さんの報告で直した",
    "",
  ].join("\n");
  assert.equal(
    announcementContent("v1.2.3", notes),
    [
      "Streets v1.2.3 がリリースされました🎉",
      "https://streets.eyemono.moe",
      "",
      "【新しくできること】",
      "- Streets (https://streets.eyemono.moe) で投稿できる",
      "",
      "【直したこと】",
      "- nostr:npub1abc さんの報告で直した",
      "",
      "リリースノート: https://github.com/eyemono-moe/streets/releases/tag/v1.2.3",
      "#Streets",
    ].join("\n"),
  );
});
