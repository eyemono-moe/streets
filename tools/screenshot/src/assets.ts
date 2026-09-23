import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { type Server, createServer } from "node:http";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import type { BlobDescriptor } from "@streets/core/media/blossom";
import type { AssetName } from "./define";

/** 画像の置き場所。本番のビルド（apps/web）には入らない。 */
export const ASSET_DIR = fileURLToPath(new URL("../assets/", import.meta.url));

const TYPES: Record<string, string> = {
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

/** SVG は width / height から、それ以外は読まない（imeta の寸法は無くてもよい）。 */
const dimensionsOf = (bytes: Buffer, type: string) => {
  if (type !== "image/svg+xml") return undefined;
  const head = bytes.subarray(0, 400).toString("utf8");
  const width = /width="(\d+)"/.exec(head)?.[1];
  const height = /height="(\d+)"/.exec(head)?.[1];
  return width && height
    ? { width: Number(width), height: Number(height) }
    : undefined;
};

/**
 * `assets/` の画像を、`baseUrl` から配るものとして読む。中身のハッシュと大きさは
 * 投稿の imeta タグに入る。無いファイルを指していたら止める。
 */
export const createAssetReader = (baseUrl: string) => {
  const cache = new Map<AssetName, BlobDescriptor>();
  return (name: AssetName): BlobDescriptor => {
    const cached = cache.get(name);
    if (cached) return cached;
    const path = join(ASSET_DIR, name);
    if (!existsSync(path)) {
      throw new Error(`画像がありません: tools/screenshot/assets/${name}`);
    }
    const bytes = readFileSync(path);
    const type = TYPES[extname(name)] ?? "application/octet-stream";
    const dimensions = dimensionsOf(bytes, type);
    const blob: BlobDescriptor = {
      url: `${baseUrl}/${name}`,
      sha256: bytesToHex(sha256(bytes)),
      size: bytes.length,
      type,
      ...(dimensions ? { dimensions } : {}),
    };
    cache.set(name, blob);
    return blob;
  };
};

/** `assets/` を配る。ブラウザが別のポートから読むので CORS を許す。 */
export const serveAssets = (port: number): Server =>
  createServer((request, response) => {
    const name = decodeURIComponent(
      new URL(request.url ?? "/", "http://localhost").pathname,
    ).replace(/^\//, "");
    const path = join(ASSET_DIR, name);
    if (name.includes("..") || !existsSync(path) || !statSync(path).isFile()) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, {
      "content-type": TYPES[extname(name)] ?? "application/octet-stream",
      "access-control-allow-origin": "*",
      "cache-control": "no-store",
    });
    createReadStream(path).pipe(response);
  }).listen(port);
