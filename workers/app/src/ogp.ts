/** 画面へ返すリンクのカード。取れなかった項目は省く。 */
export type LinkCard = {
  /** リダイレクトを辿った後の URL。 */
  url: string;
  title: string;
  description?: string;
  /** https の画像だけ。http の画像は混在コンテンツになるので返さない。 */
  image?: string;
  siteName?: string;
};

const MAX_TITLE = 200;
const MAX_DESCRIPTION = 400;

/**
 * 取りに行ってよい URL か。ローカルのアドレスや内部のホストを取りに行かせると、
 * この取得口が外から中を覗く踏み台になる。IP の直打ちは、名前で見分けられない
 * 内部のアドレスを含むので一律に断る。
 */
export const allowedTarget = (input: string): URL | undefined => {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return undefined;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
  if (url.username || url.password) return undefined;
  if (url.port && url.port !== "80" && url.port !== "443") return undefined;
  const host = url.hostname.toLowerCase();
  if (host.startsWith("[") || /^[0-9.]+$/.test(host)) return undefined;
  if (!host.includes(".")) return undefined;
  if (/(^|\.)(localhost|local|internal|home\.arpa|lan)$/.test(host)) {
    return undefined;
  }
  url.hash = "";
  return url;
};

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

const decodeEntities = (text: string): string =>
  text.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (whole, name: string) => {
    if (name[0] === "#") {
      const code =
        name[1] === "x" || name[1] === "X"
          ? Number.parseInt(name.slice(2), 16)
          : Number.parseInt(name.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : whole;
    }
    return ENTITIES[name.toLowerCase()] ?? whole;
  });

const clean = (text: string | undefined, max: number): string | undefined => {
  if (text === undefined) return undefined;
  const value = decodeEntities(text).replace(/\s+/g, " ").trim();
  if (!value) return undefined;
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
};

const ATTRIBUTE_RE =
  /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;

const attributesOf = (tag: string): Map<string, string> => {
  const attributes = new Map<string, string>();
  for (const match of tag.matchAll(ATTRIBUTE_RE)) {
    const name = match[1]?.toLowerCase();
    if (!name || attributes.has(name)) continue;
    attributes.set(name, match[3] ?? match[4] ?? match[5] ?? "");
  }
  return attributes;
};

/** head の中の `<meta>` を、property / name をキーにして集める。先に出たものを採る。 */
const metaOf = (head: string): Map<string, string> => {
  const meta = new Map<string, string>();
  for (const match of head.matchAll(/<meta\b[^>]*>/gi)) {
    const attributes = attributesOf(match[0]);
    const key = (
      attributes.get("property") ?? attributes.get("name")
    )?.toLowerCase();
    const content = attributes.get("content");
    if (key && content !== undefined && !meta.has(key)) meta.set(key, content);
  }
  return meta;
};

const resolveImage = (
  raw: string | undefined,
  pageUrl: URL,
): string | undefined => {
  if (!raw) return undefined;
  try {
    const url = new URL(decodeEntities(raw.trim()), pageUrl);
    return url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
};

/**
 * ページの head から OGP を読む。題名が無ければカードにしない（題名の無いカードは
 * 何のリンクか分からない）。OGP が無いページは `<title>` と description で補う。
 */
export const parseLinkCard = (
  html: string,
  pageUrl: URL,
): LinkCard | undefined => {
  const headEnd = html.search(/<\/head\s*>|<body\b/i);
  const head = headEnd === -1 ? html : html.slice(0, headEnd);
  const meta = metaOf(head);
  const title = clean(
    meta.get("og:title") ??
      meta.get("twitter:title") ??
      /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1],
    MAX_TITLE,
  );
  if (!title) return undefined;
  const description = clean(
    meta.get("og:description") ??
      meta.get("twitter:description") ??
      meta.get("description"),
    MAX_DESCRIPTION,
  );
  const image = resolveImage(
    meta.get("og:image:secure_url") ??
      meta.get("og:image") ??
      meta.get("og:image:url") ??
      meta.get("twitter:image"),
    pageUrl,
  );
  const siteName = clean(meta.get("og:site_name"), MAX_TITLE);
  return {
    url: pageUrl.toString(),
    title,
    ...(description ? { description } : {}),
    ...(image ? { image } : {}),
    ...(siteName ? { siteName } : {}),
  };
};

/** `Content-Type` か `<meta charset>` から文字コードを読む。 */
export const charsetOf = (
  contentType: string | null,
  head: string,
): string | undefined =>
  /charset\s*=\s*["']?([\w-]+)/i.exec(contentType ?? "")?.[1]?.toLowerCase() ??
  /<meta\b[^>]*charset\s*=\s*["']?([\w-]+)/i.exec(head)?.[1]?.toLowerCase();
