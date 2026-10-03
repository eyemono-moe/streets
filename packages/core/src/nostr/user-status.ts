import type { NostrEvent } from "./event";

/** ユーザーのステータス（NIP-38）。`d` がステータスの種類。 */
export const USER_STATUS_KIND = 30_315;

/**
 * 画面に出す種類。NIP-38 が決めているのはこの 2 つだけで、ほかの `d`
 * （`presence` など）は、アプリが自分のために置く JSON や機械向けの値が多い
 * （実際に流れているものを調べた結果）。人に見せる前提ではないので出さない。
 */
export const USER_STATUS_TYPES = ["general", "music"] as const;
export type UserStatusType = (typeof USER_STATUS_TYPES)[number];

/**
 * ステータスから開ける先。`r` は http(s) と、Web の URL に置き換えられる
 * `spotify:` だけを使う。
 */
export type UserStatusLink =
  | { type: "url"; url: string }
  | { type: "event"; id: string }
  | { type: "profile"; pubkey: string }
  | { type: "address"; address: string };

export type UserStatus = {
  type: UserStatusType;
  content: string;
  link: UserStatusLink | undefined;
  /** 消える時刻（秒）。聴いている曲は、曲が終わる時刻が入る。 */
  expiresAt: number | undefined;
  /** 本文のカスタム絵文字（NIP-30）を引くためのタグ。 */
  tags: readonly string[][];
};

const HEX_64 = /^[0-9a-f]{64}$/;

const tagValue = (event: NostrEvent, name: string): string | undefined =>
  event.tags.find((tag) => tag[0] === name)?.[1];

const httpUrl = (value: string | undefined): string | undefined => {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
};

const SPOTIFY_ID_PATH = /^[A-Za-z0-9]+(?::[A-Za-z0-9._-]+)+$/;

/**
 * NIP-38 の例どおり `spotify:search:…` を `r` に入れて流すクライアントがある。
 * `spotify:` のままではアプリの無い端末で何も起きないので、open.spotify.com に
 * 置き換える（アプリがあればそちらへ渡る）。
 */
const spotifyUrl = (value: string | undefined): string | undefined => {
  if (!value?.startsWith("spotify:")) return undefined;
  const rest = value.slice("spotify:".length);
  // 検索語には `:` が入りうるので区切らない。`AC/DC` のような、URL の区切りに
  // なる文字だけを符号化して、検索語の外へはみ出させない。
  if (rest.startsWith("search:")) {
    const query = rest
      .slice("search:".length)
      .replace(/[/?#]/g, (char) => encodeURIComponent(char));
    return query === ""
      ? undefined
      : httpUrl(`https://open.spotify.com/search/${query}`);
  }
  if (!SPOTIFY_ID_PATH.test(rest)) return undefined;
  return httpUrl(`https://open.spotify.com/${rest.replaceAll(":", "/")}`);
};

const linkOf = (event: NostrEvent): UserStatusLink | undefined => {
  const r = tagValue(event, "r");
  const url = httpUrl(r) ?? spotifyUrl(r);
  if (url) return { type: "url", url };
  const id = tagValue(event, "e");
  if (id && HEX_64.test(id)) return { type: "event", id };
  const address = tagValue(event, "a");
  if (address && /^\d+:[0-9a-f]{64}:/.test(address)) {
    return { type: "address", address };
  }
  const pubkey = tagValue(event, "p");
  if (pubkey && HEX_64.test(pubkey)) return { type: "profile", pubkey };
  return undefined;
};

/**
 * 今見せてよいステータスを読む。空の本文は「ステータスを消した」（NIP-38）、
 * 期限の過ぎたものは「もう終わった」なので、どちらも出さない。
 */
export const parseUserStatus = (
  event: NostrEvent | undefined,
  nowSeconds: number,
): UserStatus | undefined => {
  if (!event || event.kind !== USER_STATUS_KIND) return undefined;
  const type = tagValue(event, "d");
  if (type !== "general" && type !== "music") return undefined;
  const content = event.content.trim();
  if (content === "") return undefined;
  const expiration = Number(tagValue(event, "expiration"));
  const expiresAt =
    Number.isSafeInteger(expiration) && expiration > 0 ? expiration : undefined;
  if (expiresAt !== undefined && expiresAt <= nowSeconds) return undefined;
  return { type, content, link: linkOf(event), expiresAt, tags: event.tags };
};
