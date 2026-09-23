import { type LinkCard, allowedTarget, charsetOf, parseLinkCard } from "./ogp";

export type FetchCardOptions = {
  fetch: typeof fetch;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
};

/**
 * 取得口であることを名乗る。サイトによっては、ブラウザを名乗るとログイン画面を
 * 返し、名乗らないと OGP を返さないので、ボットとして素直に名乗る。
 */
export const USER_AGENT =
  "Mozilla/5.0 (compatible; StreetsLinkPreview/1.0; +https://github.com/eyemono-moe/streets)";

const HTML_TYPES = /^(text\/html|application\/xhtml\+xml)\b/i;

/** head を読み終えたか。body が始まったら、その先に OGP は無い。 */
const headDone = (latin1: string) => /<\/head\s*>|<body\b/i.test(latin1);

const readHead = async (
  response: Response,
  maxBytes: number,
): Promise<Uint8Array> => {
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  // head の目印は ASCII なので、文字コードを決める前に latin1 のつもりで探してよい。
  const latin1 = new TextDecoder("latin1");
  let seen = "";
  try {
    while (size < maxBytes) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      chunks.push(value);
      size += value.byteLength;
      seen += latin1.decode(value, { stream: true });
      if (headDone(seen)) break;
    }
  } finally {
    void reader.cancel().catch(() => {});
  }
  const bytes = new Uint8Array(Math.min(size, maxBytes));
  let offset = 0;
  for (const chunk of chunks) {
    const part = chunk.subarray(0, bytes.length - offset);
    bytes.set(part, offset);
    offset += part.length;
    if (offset >= bytes.length) break;
  }
  return bytes;
};

const decode = (bytes: Uint8Array, contentType: string | null): string => {
  const guess = charsetOf(contentType, new TextDecoder("latin1").decode(bytes));
  try {
    return new TextDecoder(guess ?? "utf-8").decode(bytes);
  } catch {
    // 知らない文字コード名は UTF-8 として読む。題名が化けても、取れないよりよい。
    return new TextDecoder("utf-8").decode(bytes);
  }
};

/**
 * リンク先の head だけを読んでカードにする。リダイレクトは自分で辿り、行き先を
 * 1 回ずつ確かめ直す（外の URL から内部のアドレスへ飛ばされないように）。
 * 取れなかったとき・HTML でないとき・題名が無いときは `undefined`。
 */
export const fetchLinkCard = async (
  target: URL,
  options: FetchCardOptions,
): Promise<LinkCard | undefined> => {
  // Workers の fetch は、オブジェクトのメソッドとして呼ぶと this が食い違って落ちる。
  const { fetch: doFetch } = options;
  const signal = AbortSignal.timeout(options.timeoutMs ?? 5_000);
  let url = target;
  for (let hop = 0; hop <= (options.maxRedirects ?? 3); hop += 1) {
    const response = await doFetch(url.toString(), {
      redirect: "manual",
      signal,
      headers: {
        "user-agent": USER_AGENT,
        accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
        "accept-language": "ja,en;q=0.8",
      },
    });
    if (response.status >= 300 && response.status < 400) {
      void response.body?.cancel().catch(() => {});
      const location = response.headers.get("location");
      const next = location
        ? allowedTarget(new URL(location, url).toString())
        : undefined;
      if (!next) return undefined;
      url = next;
      continue;
    }
    if (!response.ok) {
      void response.body?.cancel().catch(() => {});
      return undefined;
    }
    const contentType = response.headers.get("content-type");
    if (!contentType || !HTML_TYPES.test(contentType)) {
      void response.body?.cancel().catch(() => {});
      return undefined;
    }
    // YouTube は head にスクリプトを積んでおり、og:title が 700KB 付近にある。
    const bytes = await readHead(response, options.maxBytes ?? 1024 * 1024);
    return parseLinkCard(decode(bytes, contentType), url);
  }
  return undefined;
};
