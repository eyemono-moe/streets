import { encodeGlyph } from "@streets/core/emoji-maker/glyph-shard";
import type { EmojiSpec } from "@streets/core/emoji-maker/spec";
import { emojiKey, emojiUrl } from "@streets/core/emoji-maker/url";
import { describe, expect, it, vi } from "vite-plus/test";
import type { EmojiResponse } from "./app";
import { createApp } from "./app";
import { EMOJI_CACHE_CONTROL, createEmoji } from "./emoji";

/** ゴシックに「A」だけがある輪郭のファイル（A は 0x41 なので名前は "1"）。 */
const shardA = () =>
  encodeGlyph(0x41, {
    advance: 1000,
    box: [0, -1000, 1000, 0],
    contours: [[0, -1000, 1000, -1000, 1000, 0, 0, 0]],
  }).buffer as ArrayBuffer;

const spec: EmojiSpec = {
  lines: ["A"],
  shape: "square",
  fit: "stretch",
  align: "center",
  color: "#3ee0f0",
  outline: "#1b1b1f",
  outlineWidth: 7,
  font: "gothic",
};

const fakeBucket = () => {
  const objects = new Map<string, { value: Uint8Array; options: unknown }>();
  return {
    objects,
    head: vi.fn(async (key: string) => objects.get(key) ?? null),
    put: vi.fn(async (key: string, value: Uint8Array, options: unknown) => {
      objects.set(key, { value, options });
    }),
  };
};

const deps = (bucket = fakeBucket(), allow = true) => ({
  bucket,
  readShard: vi.fn(async (font: string, name: string) =>
    font === "gothic" && name === "1" ? shardA() : undefined,
  ),
  allowRender: vi.fn(async () => allow),
});

describe("createEmoji", () => {
  it("描いて R2 に置き、URL を返す", async () => {
    const d = deps();
    expect(await createEmoji(spec, d)).toEqual({
      type: "ok",
      url: emojiUrl(spec),
    });
    const stored = d.bucket.objects.get(emojiKey(spec));
    expect([...(stored?.value.subarray(0, 4) ?? [])]).toEqual([
      137, 80, 78, 71,
    ]);
    expect(stored?.options).toEqual({
      httpMetadata: {
        contentType: "image/png",
        cacheControl: EMOJI_CACHE_CONTROL,
      },
    });
  });

  it("もう置いてあれば描かず、回数も数えない", async () => {
    const bucket = fakeBucket();
    bucket.objects.set(emojiKey(spec), {
      value: new Uint8Array(),
      options: {},
    });
    const d = deps(bucket);
    expect(await createEmoji(spec, d)).toEqual({
      type: "ok",
      url: emojiUrl(spec),
    });
    expect(d.allowRender).not.toHaveBeenCalled();
    expect(bucket.put).not.toHaveBeenCalled();
  });

  it("描けない字があれば、その字を返して置かない", async () => {
    const d = deps();
    expect(await createEmoji({ ...spec, lines: ["A?"] }, d)).toEqual({
      type: "missing-chars",
      chars: ["?"],
    });
    expect(d.bucket.put).not.toHaveBeenCalled();
  });

  it("回数を超えたら描かない", async () => {
    const d = deps(fakeBucket(), false);
    expect(await createEmoji(spec, d)).toEqual({ type: "rate-limited" });
    expect(d.bucket.put).not.toHaveBeenCalled();
  });
});

const ORIGIN = "https://streets.example";
const env = (bucket = fakeBucket()) =>
  ({
    EMOJI_BUCKET: bucket,
    EMOJI_LIMITER: { limit: async () => ({ success: true }) },
    ASSETS: {
      fetch: async (input: URL) =>
        input.pathname === "/emoji-glyphs/v1/gothic/1.bin"
          ? new Response(shardA(), {
              headers: { "content-type": "application/octet-stream" },
            })
          : // 無いファイルは、一枚の画面の index.html が返る。
            new Response("<!doctype html>", {
              headers: { "content-type": "text/html" },
            }),
    },
  }) as unknown as Env;

const post = (
  body: unknown,
  headers: Record<string, string> = { "sec-fetch-site": "same-origin" },
) =>
  createApp().request(
    `${ORIGIN}/api/emoji`,
    {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    },
    env(),
  );

describe("POST /api/emoji", () => {
  it("作って URL を返す", async () => {
    const response = await post(spec);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual<EmojiResponse>({
      url: emojiUrl(spec),
    });
  });

  it("描けない字（無い輪郭のファイル）は 400 で字を返す", async () => {
    const response = await post({ ...spec, lines: ["Aあ"] });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual<EmojiResponse>({
      error: "missing-chars",
      chars: ["あ"],
    });
  });

  it("形の違う指定は 400", async () => {
    for (const body of [
      { ...spec, lines: ["あ".repeat(13)] },
      { ...spec, color: "red" },
      { ...spec, font: "comic" },
    ]) {
      expect((await post(body)).status).toBe(400);
    }
  });

  it("他のサイトのページからの呼び出しは断る", async () => {
    expect((await post(spec, { "sec-fetch-site": "cross-site" })).status).toBe(
      403,
    );
  });
});
