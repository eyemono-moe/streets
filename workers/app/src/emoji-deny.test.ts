import type { EmojiSpec } from "@streets/core/emoji-maker/spec";
import { emojiUrl } from "@streets/core/emoji-maker/url";
import { expect, it, vi } from "vite-plus/test";
import { createEmoji } from "./emoji";

const { spec } = vi.hoisted(() => ({
  spec: {
    lines: ["A"],
    shape: "square",
    fit: "stretch",
    align: "left", // そろえた形（center）の URL で照合されることも確かめる
    color: "#3EE0F0",
    outline: null,
    outlineWidth: 0,
    font: "gothic",
  } as EmojiSpec,
}));

vi.mock("./emoji-denylist", async () => {
  const { emojiUrl: url } = await import("@streets/core/emoji-maker/url");
  const canonical = { ...spec, align: "center", color: "#3ee0f0" } as EmojiSpec;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(url(canonical)),
  );
  const hex = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return { DENIED_EMOJI_HASHES: new Set([hex]) };
});

it("消してほしいと頼まれた絵文字は、もう置いてあっても作らない", async () => {
  const head = vi.fn(async () => ({}));
  const put = vi.fn(async () => {});
  expect(
    await createEmoji(spec, {
      bucket: { head, put },
      readShard: async () => undefined,
      allowRender: async () => true,
    }),
  ).toEqual({ type: "denied" });
  expect(head).not.toHaveBeenCalled();
  expect(emojiUrl(spec)).toContain("-center-3ee0f0-");
});
