/** 押すまで読み込まない埋め込み。決め打ちのサイトだけ。ほかはリンクのカードにする。 */
export type Embed =
  | { kind: "youtube"; id: string /** 秒。 */; start?: number }
  | { kind: "x"; id: string };

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
]);
const X_HOSTS = new Set([
  "x.com",
  "www.x.com",
  "mobile.x.com",
  "twitter.com",
  "www.twitter.com",
  "mobile.twitter.com",
]);

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

/** `t=90`・`t=1m30s`・`t=1h2m3s` を秒にする。読めなければ省く。 */
const secondsOf = (value: string | null): number | undefined => {
  if (!value) return undefined;
  if (/^\d+s?$/.test(value)) return Number.parseInt(value, 10);
  const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(value);
  if (!match || !value) return undefined;
  const [, h = "0", m = "0", s = "0"] = match;
  const total = Number(h) * 3600 + Number(m) * 60 + Number(s);
  return total > 0 ? total : undefined;
};

const youtubeIdOf = (url: URL): string | undefined => {
  const host = url.hostname.toLowerCase();
  if (host === "youtu.be") return url.pathname.split("/")[1];
  if (!YOUTUBE_HOSTS.has(host)) return undefined;
  if (url.pathname === "/watch") return url.searchParams.get("v") ?? undefined;
  const [, kind, id] = url.pathname.split("/");
  return kind === "shorts" || kind === "live" || kind === "embed"
    ? id
    : undefined;
};

export const embedOf = (input: string): Embed | undefined => {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return undefined;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;

  const youtube = youtubeIdOf(url);
  if (youtube !== undefined) {
    if (!YOUTUBE_ID.test(youtube)) return undefined;
    const start = secondsOf(
      url.searchParams.get("t") ?? url.searchParams.get("start"),
    );
    return start
      ? { kind: "youtube", id: youtube, start }
      : { kind: "youtube", id: youtube };
  }

  if (X_HOSTS.has(url.hostname.toLowerCase())) {
    const match =
      /^\/(?:[A-Za-z0-9_]{1,15}|i\/web)\/status\/(\d{1,20})(?:\/|$)/.exec(
        url.pathname,
      );
    if (match?.[1]) return { kind: "x", id: match[1] };
  }
  return undefined;
};
