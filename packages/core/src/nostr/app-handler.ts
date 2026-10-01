import * as v from "valibot";
import type { RelayUrl } from "../relay/relay-connection";
import { APP_HANDLER_KIND } from "./build/client-tag";
import type { NostrEvent } from "./event";
import { relayOf } from "./event-refs";
import { encodeBech32, encodeNevent } from "./nip19";
import { type Profile, parseProfile } from "./profile";

/** 投稿の `client` タグ（NIP-89）が指すアプリ。 */
export type ClientRef = {
  name: string;
  /** そのアプリを説明する kind:31990 の座標。名前だけのタグには無い。 */
  handler?: { pubkey: string; identifier: string };
  /** その kind:31990 があるリレーの手がかり。 */
  relay?: RelayUrl;
};

const HEX_PUBKEY = /^[0-9a-f]{64}$/;

/** 投稿を送ったアプリを読む。タグが無い・名前が空なら `undefined`。 */
export const clientOf = (event: NostrEvent): ClientRef | undefined => {
  const tag = event.tags.find((entry) => entry[0] === "client");
  const name = tag?.[1]?.trim();
  if (!tag || !name) return undefined;
  const [kind, pubkey, ...rest] = (tag[2] ?? "").split(":");
  const identifier = rest.join(":");
  const handler =
    kind === String(APP_HANDLER_KIND) && pubkey && HEX_PUBKEY.test(pubkey)
      ? { pubkey, identifier }
      : undefined;
  const relay = handler ? relayOf(tag[3]) : undefined;
  return {
    name,
    ...(handler ? { handler } : {}),
    ...(relay ? { relay } : {}),
  };
};

/**
 * 誰でも書ける値なので、開いてよいのは http(s) の URL だけ。`javascript:` などを
 * そのまま開かせない。
 */
export const httpUrlOf = (value: string | undefined): string | undefined => {
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

/** kind:31990 に書かれた、アプリの説明と開き方。 */
export type AppHandler = {
  /** 名前・アイコン・説明。書いていなければ、出した人の kind:0 を見る。 */
  profile?: Profile;
  website?: string;
  /** `web` タグ。`<bech32>` を差し替えて開く。`entity` が無いものは何でも受ける。 */
  web: { template: string; entity?: string }[];
};

const websiteSchema = v.looseObject({
  website: v.fallback(v.optional(v.string()), undefined),
});

const websiteOf = (content: string): string | undefined => {
  try {
    const parsed = v.safeParse(websiteSchema, JSON.parse(content));
    return parsed.success ? httpUrlOf(parsed.output.website) : undefined;
  } catch {
    return undefined;
  }
};

export const parseAppHandler = (event: NostrEvent): AppHandler => {
  const website = websiteOf(event.content);
  return {
    ...(event.content.trim() ? { profile: parseProfile(event.content) } : {}),
    ...(website ? { website } : {}),
    web: event.tags.flatMap((tag) =>
      tag[0] === "web" && tag[1]?.includes("<bech32>")
        ? [{ template: tag[1], ...(tag[2] ? { entity: tag[2] } : {}) }]
        : [],
    ),
  };
};

/**
 * その投稿を、アプリの `web` タグで開く URL。`nevent` を受けるものを先に、次に
 * `note`、最後に種類を問わないものを使う。どれも無ければ `undefined`。
 */
export const handlerUrlFor = (
  handler: AppHandler,
  event: NostrEvent,
  relays: readonly RelayUrl[] = [],
): string | undefined => {
  const nevent = encodeNevent({
    id: event.id,
    author: event.pubkey,
    eventKind: event.kind,
    relays: relays.slice(0, 2),
  });
  const candidates: [string | undefined, string | undefined][] = [
    ["nevent", nevent],
    ["note", encodeBech32("note", event.id)],
    [undefined, nevent],
  ];
  for (const [entity, value] of candidates) {
    const web = handler.web.find((entry) => entry.entity === entity);
    if (!web || !value) continue;
    const url = httpUrlOf(web.template.replaceAll("<bech32>", value));
    if (url) return url;
  }
  return undefined;
};
