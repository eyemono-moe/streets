import { bytesToHex, randomBytes } from "@noble/hashes/utils.js";
import type { BlossomServer } from "./blossom";
import { parseNip96ApiUrl } from "./nip96";

/** アップロード先と、そこへ上げる方式。 */
export type UploadServer = {
  protocol: "blossom" | "nip96";
  url: BlossomServer;
};

/**
 * 試す順に並べたアップロード先。一覧は方式ごとに別のイベントに保存するので、方式をまたいだ
 * 順は持てない。非推奨の NIP-96 は、Blossom で上げられなかったときの後ろに回す。
 */
export const uploadServers = (
  blossom: readonly BlossomServer[],
  nip96: readonly BlossomServer[],
): UploadServer[] => [
  ...blossom.map((url) => ({ protocol: "blossom" as const, url })),
  ...nip96
    .filter((url) => !blossom.includes(url))
    .map((url) => ({ protocol: "nip96" as const, url })),
];

/**
 * アップロード先として足してよいか。`unknown` は応答を読めなかったもの（落ちている・
 * ブラウザからの読み取りを許していない）で、使えないとは言い切れない。
 */
export type ServerCheck = "blossom" | "nip96" | "not-blossom" | "unknown";

/** 確かめるのを待つ長さ。足す操作が止まって見えないうちに諦める。 */
const CHECK_TIMEOUT_MS = 8000;

/**
 * 足そうとしているサーバーが、Blossom か NIP-96 のアップロード先として応答するかを確かめる。Blossom には「自分は
 * Blossom だ」と名乗る窓口が無いので、BUD-01 で必須の `HEAD /<sha256>` を、どこにも
 * 無いハッシュで聞く。`PUT /upload` を空で送れば受け取りの可否まで分かるが、認可なしで
 * 受け取るサーバーに 0 バイトのファイルを置いてしまう。BUD-06 の `HEAD /upload` は
 * 実装が任意で、既定のサーバーにも答えないものがある。
 */
export const checkUploadServer = async (options: {
  server: BlossomServer;
  fetcher?: typeof fetch;
}): Promise<ServerCheck> => {
  const fetcher = options.fetcher ?? fetch;
  let response: Response;
  try {
    response = await fetcher(
      `${options.server}/${bytesToHex(randomBytes(32))}`,
      { method: "HEAD", signal: AbortSignal.timeout(CHECK_TIMEOUT_MS) },
    );
  } catch {
    // NIP-96 だけのサーバーは、Blossom の窓口にブラウザからの読み取りを許していないことがある。
    return (await offersNip96(options.server, fetcher)) ? "nip96" : "unknown";
  }
  const html = (response.headers.get("content-type") ?? "").includes(
    "text/html",
  );
  // 認可が要るサーバー（BUD-11）は、無いハッシュにも 401 などを返す。
  if (!html && [401, 402, 403, 404].includes(response.status)) return "blossom";
  if (response.status === 429 || response.status >= 500) return "unknown";
  return (await offersNip96(options.server, fetcher)) ? "nip96" : "not-blossom";
};

/** Blossom としても NIP-96 としても応答しなかったので、アップロード先に足さなかった。 */
export class NotUploadServerError extends Error {
  readonly server: BlossomServer;
  constructor(server: BlossomServer) {
    super(`${server} は画像のアップロード先ではありません`);
    this.name = "NotUploadServerError";
    this.server = server;
  }
}

const offersNip96 = async (
  server: BlossomServer,
  fetcher: typeof fetch,
): Promise<boolean> => {
  try {
    const response = await fetcher(`${server}/.well-known/nostr/nip96.json`, {
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
    });
    return (
      response.ok &&
      parseNip96ApiUrl(server, await response.json()) !== undefined
    );
  } catch {
    return false;
  }
};
