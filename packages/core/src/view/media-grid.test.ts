import { describe, expect, it } from "vite-plus/test";
import type { NostrEvent } from "../nostr/event";
import { mediaTilesOf } from "./media-grid";

const event = (
  content: string,
  options: { kind?: number; tags?: string[][] } = {},
): NostrEvent => ({
  id: "0".repeat(64),
  pubkey: "c".repeat(64),
  created_at: 0,
  kind: options.kind ?? 1,
  tags: options.tags ?? [],
  content,
  sig: "0".repeat(128),
});

describe("mediaTilesOf", () => {
  it("添えられた画像・動画を 1 枚ずつ、本文の順にマスにする", () => {
    const tiles = mediaTilesOf(
      event("a https://example.com/a.png https://example.com/b.mp4"),
    );
    expect(tiles.map((tile) => [tile.key, tile.media.type])).toEqual([
      [`${"0".repeat(64)}:0`, "image"],
      [`${"0".repeat(64)}:1`, "video"],
    ]);
  });

  it("同じ URL を 2 度貼っても、マスの key は重ならない", () => {
    // 捕まえる変異: key を URL で作る（<For> の突き合わせで 1 枚が消える）
    const tiles = mediaTilesOf(
      event("https://example.com/a.png https://example.com/a.png"),
    );
    expect(new Set(tiles.map((tile) => tile.key)).size).toBe(2);
  });

  it("音声やリンクだけの投稿はマスにしない", () => {
    expect(
      mediaTilesOf(event("https://example.com/a.mp3 https://example.com/")),
    ).toEqual([]);
  });

  it("画像の投稿（kind:20）は imeta の画像をマスにする", () => {
    const tiles = mediaTilesOf(
      event("説明", {
        kind: 20,
        tags: [["imeta", "url https://example.com/photo", "m image/jpeg"]],
      }),
    );
    expect(tiles.map((tile) => tile.media.url)).toEqual([
      "https://example.com/photo",
    ]);
  });
});
