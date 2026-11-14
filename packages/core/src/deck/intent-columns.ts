/*
 * Streets のカラムと NAP-INTENT の依頼の対応。アップレットから頼まれたものを Streets の
 * カラムで開くときと、Streets の中で押したものを既定のアップレットで開くときに使う。
 *
 * 依頼の中身（payload）の形は NAP-INTENT が決めていない。
 * > Payload requirements and validation belong to the convention and the target.
 * 公開されているアップレットの書き方がそろっていないので、読むときは名前の揺れ
 * （`pubkey`・`npub`、`id`・`event` など）と、hex・NIP-19 の両方を受け付ける。
 */
import { type NostrEvent, isNostrEvent, verifyEvent } from "../nostr/event";
import { LONG_FORM_KIND } from "../nostr/long-form";
import { decodeNip19, encodeNaddr } from "../nostr/nip19";
import type { RelayUrl } from "../relay/relay-connection";
import {
  buildArticleColumn,
  buildThreadColumn,
  buildUserColumn,
} from "./column-presets";
import type { ColumnDef } from "./deck";

const HEX_64 = /^[0-9a-f]{64}$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const strings = (payload: unknown, keys: readonly string[]): string[] => {
  if (!isRecord(payload)) return [];
  return keys.flatMap((key) => {
    const value = payload[key];
    if (typeof value === "string") return [value.trim()];
    // `{ target: { type: "event", id } }` のように 1 段包んだ形（NAP-INTENT の例）。
    if (isRecord(value) && typeof value.id === "string") return [value.id];
    return [];
  });
};

const stripScheme = (value: string) => value.replace(/^nostr:/, "");

const pubkeyOf = (payload: unknown): string | undefined => {
  for (const raw of strings(payload, ["pubkey", "npub", "nprofile", "user"])) {
    const value = stripScheme(raw);
    if (HEX_64.test(value)) return value;
    const ref = decodeNip19(value);
    if (ref?.kind === "npub" || ref?.kind === "nprofile") return ref.pubkey;
  }
  return undefined;
};

const eventIdOf = (payload: unknown): string | undefined => {
  for (const raw of strings(payload, [
    "id",
    "event",
    "eventId",
    "note",
    "nevent",
    "target",
  ])) {
    const value = stripScheme(raw);
    if (HEX_64.test(value)) return value;
    const ref = decodeNip19(value);
    if (ref?.kind === "note" || ref?.kind === "nevent") return ref.id;
  }
  return undefined;
};

const articleOf = (payload: unknown) => {
  for (const raw of strings(payload, ["naddr", "address", "article"])) {
    const value = stripScheme(raw);
    const ref = decodeNip19(value);
    if (ref?.kind === "naddr" && ref.eventKind === LONG_FORM_KIND) {
      return {
        pubkey: ref.pubkey,
        identifier: ref.identifier,
        relays: ref.relays as RelayUrl[],
      };
    }
    const match = /^30023:([0-9a-f]{64}):(.*)$/.exec(value);
    if (match) {
      return {
        pubkey: match[1] as string,
        identifier: match[2] as string,
        relays: [],
      };
    }
  }
  return undefined;
};

/** 作者の長文記事を並べるカラム。 */
const authorArticlesColumn = (pubkey: string): ColumnDef => ({
  id: `articles:${pubkey}`,
  title: "長文記事",
  source: {
    kind: "literal",
    filters: [{ kinds: [LONG_FORM_KIND], authors: [pubkey] }],
  },
});

/** 依頼を Streets のカラムにする。開けない依頼や、読めない中身なら undefined。 */
export const streetsIntentColumn = (
  convention: string,
  payload: unknown,
): ColumnDef | undefined => {
  switch (convention) {
    case "napplet:profile/open": {
      const pubkey = pubkeyOf(payload);
      return pubkey ? buildUserColumn(pubkey) : undefined;
    }
    case "napplet:note/open": {
      const id = eventIdOf(payload);
      return id ? buildThreadColumn(id) : undefined;
    }
    // 公開されているアップレット（Noris・Chronofeed）は `{ pubkey, npub, relays }` を送る。
    case "napplet:article/author": {
      const pubkey = pubkeyOf(payload);
      return pubkey ? authorArticlesColumn(pubkey) : undefined;
    }
    case "napplet:article/open": {
      const article = articleOf(payload);
      return article
        ? buildArticleColumn(article.pubkey, article.identifier, article.relays)
        : undefined;
    }
    default:
      return undefined;
  }
};

export type ColumnIntent = {
  archetype: string;
  convention: string;
  payload: Record<string, string>;
};

/**
 * Streets の中で開こうとしたカラムを、依頼の形にする。既定がアップレットなら、こちらで
 * 開く。依頼にできない種類なら undefined。
 */
export const intentForColumn = (
  column: ColumnDef,
): ColumnIntent | undefined => {
  const source = column.source;
  switch (source.kind) {
    case "user":
      return {
        archetype: "profile",
        convention: "napplet:profile/open",
        payload: { pubkey: source.pubkey },
      };
    case "thread":
      return {
        archetype: "note",
        convention: "napplet:note/open",
        payload: { id: source.focus },
      };
    case "article": {
      const naddr = encodeNaddr({
        identifier: source.identifier,
        pubkey: source.pubkey,
        eventKind: LONG_FORM_KIND,
        ...(source.relays?.length ? { relays: source.relays } : {}),
      });
      return naddr
        ? {
            archetype: "article",
            convention: "napplet:article/open",
            payload: { naddr },
          }
        : undefined;
    }
    default:
      return undefined;
  }
};

export type ComposeRequest = {
  content: string;
  target?: { type: "reply" | "quote"; event: NostrEvent };
};

/**
 * `napplet:composer/open` の中身を、Streets の投稿欄に入れるものにする。公開されている
 * アップレット（Composer・Chronofeed）は `{ content, replyTo?, quote? }` を送り、
 * `replyTo`・`quote` には投稿そのものを入れる。
 *
 * 宛先の投稿は署名を確かめる。アップレットが作った偽の投稿に返信させない。
 */
export const composeRequestOf = (payload: unknown): ComposeRequest => {
  const record = isRecord(payload) ? payload : {};
  const content = typeof record.content === "string" ? record.content : "";
  const signed = (value: unknown) =>
    isNostrEvent(value) && verifyEvent(value) ? value : undefined;
  const replyTo = signed(record.replyTo);
  if (replyTo) return { content, target: { type: "reply", event: replyTo } };
  const quote = signed(record.quote);
  if (quote) return { content, target: { type: "quote", event: quote } };
  return { content };
};
