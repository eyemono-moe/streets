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

/** ステータスから開ける先。`r` は http(s) だけを使う（`spotify:` などは開けない）。 */
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

const linkOf = (event: NostrEvent): UserStatusLink | undefined => {
  const url = httpUrl(tagValue(event, "r"));
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
