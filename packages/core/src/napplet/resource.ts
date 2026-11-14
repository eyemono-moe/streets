/*
 * NAP-RESOURCE（napplet/naps PR #13）。napplet の CSP は外への通信を止めるので、画像などは
 * ランチャーが取って Blob で渡す。呼び方と結果の形は @napplet/shim（napplet/web、2026-10）に
 * 合わせる。
 *
 * > `blossom:<sha256>.<ext>` (BUD-10 Blossom URI to bytes)
 */
import { fetchVerifiedBlob } from "./artifact";

export type NappletResourceError =
  | "invalid-request"
  | "not-found"
  | "blocked-by-policy"
  | "timeout"
  | "too-large"
  | "unsupported-scheme"
  | "decode-failed"
  | "network-error"
  | "quota-exceeded";

export type NappletResourceResult =
  | { ok: true; blob: Blob; mime: string }
  | { ok: false; error: NappletResourceError; message?: string };

/** 1 つの napplet が 1 回で受け取れる大きさ。動画を丸ごと渡す用途は考えない。 */
export const NAPPLET_RESOURCE_MAX_BYTES = 10 * 1024 * 1024;
// > Recommended caps: 5 MiB input, 4096 x 4096 output, 2 s raster time.
export const NAPPLET_SVG_MAX_BYTES = 5 * 1024 * 1024;
/** `bytesMany` で一度に頼める数と、URL ごとに添えられる Blossom のサーバーの数。 */
export const NAPPLET_RESOURCE_MAX_URLS = 20;
export const NAPPLET_RESOURCE_MAX_SERVERS = 4;

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

/**
 * SVG を PNG などの画像に描き直す。描けなければ `undefined`。
 *
 * > Raw `image/svg+xml` MUST NOT be delivered. Rasterize to PNG/WebP in a no-network sandboxed Worker.
 */
export type RasterizeSvg = (
  bytes: Uint8Array,
  signal?: AbortSignal,
) => Promise<Blob | undefined>;

const HEX_64 = /^[0-9a-f]{64}$/;

/** 中身の先頭から種類を決める。返ってきた Content-Type は信用しない。 */
export const sniffMime = (bytes: Uint8Array): string | undefined => {
  const starts = (...signature: number[]) =>
    signature.every((byte, index) => bytes[index] === byte);
  if (starts(0x89, 0x50, 0x4e, 0x47)) return "image/png";
  if (starts(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (starts(0x47, 0x49, 0x46, 0x38)) return "image/gif";
  if (
    starts(0x52, 0x49, 0x46, 0x46) &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  if (
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70
  ) {
    const brand = String.fromCharCode(...bytes.slice(8, 12));
    return brand.startsWith("avi") ? "image/avif" : "video/mp4";
  }
  const head = new TextDecoder().decode(bytes.slice(0, 256)).trimStart();
  if (
    head.startsWith("<svg") ||
    (head.startsWith("<?xml") && head.includes("<svg"))
  ) {
    return "image/svg+xml";
  }
  return undefined;
};

// data: URL が名乗る種類は使わない。種類は中身から決める（`toResult`）。
const decodeDataUrl = (url: string): Uint8Array | undefined => {
  const match = /^data:[^,]*?(;base64)?,(.*)$/s.exec(url);
  if (!match) return undefined;
  const [, base64, body = ""] = match;
  try {
    return base64
      ? Uint8Array.from(atob(decodeURIComponent(body)), (char) =>
          char.charCodeAt(0),
        )
      : new TextEncoder().encode(decodeURIComponent(body));
  } catch {
    return undefined;
  }
};

/** BUD-10 の `blossom:<sha256>.<ext>?xs=<server>`。ハッシュと、添えられたサーバー。 */
export const parseBlossomUri = (
  url: string,
): { hash: string; servers: string[] } | undefined => {
  const match = /^blossom:([0-9a-f]{64})(?:\.[a-z0-9]+)?(?:\?(.*))?$/i.exec(
    url,
  );
  if (!match) return undefined;
  const hash = (match[1] ?? "").toLowerCase();
  if (!HEX_64.test(hash)) return undefined;
  const params = new URLSearchParams(match[2] ?? "");
  const servers = params.getAll("xs").flatMap((server) => {
    try {
      const parsed = new URL(
        server.includes("://") ? server : `https://${server}`,
      );
      return parsed.protocol === "https:" ? [parsed.origin] : [];
    } catch {
      return [];
    }
  });
  return { hash, servers };
};

const readLimited = async (
  response: Response,
): Promise<Uint8Array | "too-large"> => {
  const length = Number(response.headers.get("content-length"));
  if (length > NAPPLET_RESOURCE_MAX_BYTES) return "too-large";
  const bytes = new Uint8Array(await response.arrayBuffer());
  return bytes.byteLength > NAPPLET_RESOURCE_MAX_BYTES ? "too-large" : bytes;
};

/*
 * > Classify bytes by sniffing. Enforce scheme-appropriate allowlists. Never pass upstream `Content-Type` through.
 */
const toResult = async (
  bytes: Uint8Array,
  rasterize: RasterizeSvg | undefined,
  signal: AbortSignal | undefined,
): Promise<NappletResourceResult> => {
  const mime = sniffMime(bytes);
  if (mime === "image/svg+xml") {
    if (bytes.byteLength > NAPPLET_SVG_MAX_BYTES) {
      return { ok: false, error: "too-large" };
    }
    const raster = await rasterize?.(bytes, signal);
    if (!raster) {
      return { ok: false, error: "decode-failed", message: "svg" };
    }
    const rasterMime = raster.type || "image/png";
    return { ok: true, blob: raster, mime: rasterMime };
  }
  const type = mime ?? "application/octet-stream";
  return {
    ok: true,
    blob: new Blob([bytes as BlobPart], { type }),
    mime: type,
  };
};

/**
 * napplet が頼んだ URL の中身を取る。https は直接取り、CORS で断られたら `proxy` が
 * 返す URL（Streets の画像の中継）で取り直す。blossom はハッシュを照合する。
 */
export const fetchNappletResource = async (
  url: string,
  options: {
    fetch: Fetch;
    servers?: readonly string[];
    /** 直接取れなかった https の取り直し先。無ければ取り直さない。 */
    proxy?: (url: string) => string | undefined;
    /** 無ければ SVG は渡さない。 */
    rasterizeSvg?: RasterizeSvg;
    signal?: AbortSignal;
  },
): Promise<NappletResourceResult> => {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, error: "invalid-request", message: "invalid URL" };
  }
  switch (parsed.protocol) {
    case "data:": {
      const bytes = decodeDataUrl(url);
      if (!bytes) return { ok: false, error: "decode-failed" };
      return toResult(bytes, options.rasterizeSvg, options.signal);
    }
    case "blossom:": {
      const blossom = parseBlossomUri(url);
      if (!blossom) return { ok: false, error: "invalid-request" };
      const servers = [
        ...new Set([...(options.servers ?? []), ...blossom.servers]),
      ].slice(0, NAPPLET_RESOURCE_MAX_SERVERS * 2);
      const result = await fetchVerifiedBlob(
        blossom.hash,
        servers,
        options.fetch,
        options.signal,
      );
      if (!result.ok) {
        return {
          ok: false,
          error:
            result.error === "unavailable" || result.error === "no-server"
              ? "not-found"
              : "decode-failed",
          message: result.error,
        };
      }
      return toResult(result.bytes, options.rasterizeSvg, options.signal);
    }
    case "https:": {
      const init: RequestInit = {
        mode: "cors",
        credentials: "omit",
        referrerPolicy: "no-referrer",
        signal: options.signal,
      };
      let response: Response;
      try {
        response = await options.fetch(url, init);
      } catch (error) {
        if (options.signal?.aborted) return { ok: false, error: "timeout" };
        const proxied = options.proxy?.(url);
        if (!proxied) {
          return { ok: false, error: "network-error", message: String(error) };
        }
        try {
          response = await options.fetch(proxied, {
            ...init,
            mode: "same-origin",
          });
        } catch (retry) {
          return { ok: false, error: "network-error", message: String(retry) };
        }
      }
      if (response.status === 404) return { ok: false, error: "not-found" };
      if (!response.ok) {
        return {
          ok: false,
          error: "network-error",
          message: `HTTP ${response.status}`,
        };
      }
      const bytes = await readLimited(response);
      if (bytes === "too-large") return { ok: false, error: "too-large" };
      return toResult(bytes, options.rasterizeSvg, options.signal);
    }
    default:
      return { ok: false, error: "unsupported-scheme" };
  }
};
