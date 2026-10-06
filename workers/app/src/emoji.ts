import {
  type FontId,
  type GlyphShard,
  decodeShard,
  shardName,
} from "@streets/core/emoji-maker/glyph-shard";
import { encodePng } from "@streets/core/emoji-maker/png";
import {
  missingChars,
  renderEmoji,
  shardsFor,
} from "@streets/core/emoji-maker/render";
import type { EmojiSpec } from "@streets/core/emoji-maker/spec";
import {
  canonicalSpec,
  emojiKey,
  emojiUrl,
} from "@streets/core/emoji-maker/url";
import { DENIED_EMOJI_HASHES } from "./emoji-denylist";

/** 置いた絵文字は中身が変わらないので、確かめに行かせず使い続けさせる。 */
export const EMOJI_CACHE_CONTROL = "public, max-age=31536000, immutable";

/** R2 のうち、ここで使う分。テストで差し替える。 */
export type EmojiBucket = {
  head: (key: string) => Promise<unknown>;
  put: (
    key: string,
    value: Uint8Array,
    options: { httpMetadata: { contentType: string; cacheControl: string } },
  ) => Promise<unknown>;
};

export type EmojiResult =
  | { type: "ok"; url: string }
  | { type: "denied" }
  | { type: "missing-chars"; chars: string[] }
  | { type: "rate-limited" };

export type EmojiDeps = {
  bucket: EmojiBucket;
  /** 輪郭のファイルを読む（アプリの静的ファイル）。無ければ `undefined`。 */
  readShard: (font: FontId, name: string) => Promise<ArrayBuffer | undefined>;
  /** 新しく描くときだけ呼ぶ。描いてよければ true。 */
  allowRender: () => Promise<boolean>;
};

const sha256Hex = async (text: string) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)),
    ),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");

/** 消してほしいと頼まれた絵文字か。URL のハッシュで照合する（元の文字列をリポジトリに残さない）。 */
export const isDenied = async (spec: EmojiSpec): Promise<boolean> =>
  DENIED_EMOJI_HASHES.has(await sha256Hex(emojiUrl(spec)));

const NO_SHARD: GlyphShard = { get: () => undefined };
/** 読み解いた輪郭。Worker が生きている間は使い回す。 */
const shards = new Map<string, GlyphShard>();

/**
 * 絵文字を描いて R2 に置き、URL を返す。もう置いてあれば描かない。回数の制限は、
 * 新しく描くときだけ数える（同じ絵文字を何度送っても制限に掛からない）。
 * 指定は先に `isValidSpec` で確かめておく。
 */
export const createEmoji = async (
  input: EmojiSpec,
  deps: EmojiDeps,
): Promise<EmojiResult> => {
  const spec = canonicalSpec(input);
  if (await isDenied(spec)) return { type: "denied" };
  const key = emojiKey(spec);
  const url = emojiUrl(spec);
  if (await deps.bucket.head(key)) return { type: "ok", url };

  for (const { font, name } of shardsFor(spec)) {
    const id = `${font}/${name}`;
    if (shards.has(id)) continue;
    const buffer = await deps.readShard(font, name);
    shards.set(id, buffer ? decodeShard(buffer) : NO_SHARD);
  }
  const lookup = (font: FontId, codePoint: number) =>
    shards.get(`${font}/${shardName(codePoint)}`)?.get(codePoint);
  const missing = missingChars(spec, lookup);
  if (missing.length > 0) return { type: "missing-chars", chars: missing };

  if (!(await deps.allowRender())) return { type: "rate-limited" };
  const rendered = renderEmoji(spec, lookup);
  if (!rendered) return { type: "missing-chars", chars: [] };
  const png = await encodePng(rendered.pixels, rendered.width, rendered.height);
  await deps.bucket.put(key, png, {
    httpMetadata: {
      contentType: "image/png",
      cacheControl: EMOJI_CACHE_CONTROL,
    },
  });
  return { type: "ok", url };
};
