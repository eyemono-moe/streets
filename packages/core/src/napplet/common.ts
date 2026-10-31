/*
 * NAP-COMMON（napplet/naps PR #67）の、Streets の状態に触れない部分。NIP-19 の変換、
 * リアクションの中身の読み方、プロフィールの形。
 */
import {
  decodeNip19,
  decodeUserInput,
  encodeBech32,
  encodeNaddr,
  encodeNevent,
  encodeNprofile,
} from "../nostr/nip19";
import type { ReactionInput } from "../nostr/reaction";

const HEX_64 = /^[0-9a-f]{64}$/;
// > SHOULD reject strings longer than 5000 chars.
const MAX_NIP19_LENGTH = 5000;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const relayList = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((relay): relay is string => typeof relay === "string")
    : [];

type Result =
  | { ok: true; [key: string]: unknown }
  | { ok: false; error: string };

/**
 * > Encodes public NIP-19 identifiers: `npub`, `note`, `nprofile`, `nevent`, `naddr`, `nrelay`.
 * > MUST reject `nsec`.
 *
 * `nrelay` は NIP-19 で非推奨になっているので作らない。
 */
export const encodeCommonNip19 = (input: unknown): Result => {
  if (!isRecord(input)) return { ok: false, error: "invalid-nip19" };
  const done = (value: string | undefined, type: string): Result =>
    value
      ? { ok: true, value, nip19Type: type }
      : { ok: false, error: "invalid-nip19" };
  switch (input.type) {
    case "npub":
    case "note":
      return typeof input.hex === "string" && HEX_64.test(input.hex)
        ? done(encodeBech32(input.type, input.hex), input.type)
        : { ok: false, error: "invalid-nip19" };
    case "nprofile":
      return typeof input.pubkey === "string"
        ? done(
            encodeNprofile({
              pubkey: input.pubkey,
              relays: relayList(input.relays),
            }),
            "nprofile",
          )
        : { ok: false, error: "invalid-pubkey" };
    case "nevent":
      return typeof input.eventId === "string"
        ? done(
            encodeNevent({
              id: input.eventId,
              relays: relayList(input.relays),
              ...(typeof input.author === "string"
                ? { author: input.author }
                : {}),
              ...(typeof input.kind === "number"
                ? { eventKind: input.kind }
                : {}),
            }),
            "nevent",
          )
        : { ok: false, error: "invalid-nip19" };
    case "naddr":
      return typeof input.identifier === "string" &&
        typeof input.pubkey === "string" &&
        HEX_64.test(input.pubkey) &&
        typeof input.kind === "number"
        ? done(
            encodeNaddr({
              identifier: input.identifier,
              pubkey: input.pubkey,
              eventKind: input.kind,
              relays: relayList(input.relays),
            }),
            "naddr",
          )
        : { ok: false, error: "invalid-nip19" };
    default:
      return { ok: false, error: "unsupported-nip19-type" };
  }
};

/** > Decodes the same public types. MUST reject `nsec`, ignore unknown TLVs */
export const decodeCommonNip19 = (value: unknown): Result => {
  if (typeof value !== "string" || value.length > MAX_NIP19_LENGTH) {
    return { ok: false, error: "invalid-nip19" };
  }
  const trimmed = value.trim().replace(/^nostr:/, "");
  if (trimmed.startsWith("nsec")) {
    return { ok: false, error: "unsupported-nip19-type" };
  }
  const ref = decodeNip19(trimmed);
  if (!ref) return { ok: false, error: "invalid-nip19" };
  switch (ref.kind) {
    case "npub":
      return {
        ok: true,
        nip19Type: "npub",
        hex: ref.pubkey,
        pubkey: ref.pubkey,
      };
    case "note":
      return { ok: true, nip19Type: "note", hex: ref.id, eventId: ref.id };
    case "nprofile":
      return {
        ok: true,
        nip19Type: "nprofile",
        pubkey: ref.pubkey,
        relays: ref.relays,
      };
    case "nevent":
      return {
        ok: true,
        nip19Type: "nevent",
        eventId: ref.id,
        relays: ref.relays,
        ...(ref.author ? { author: ref.author } : {}),
        ...(ref.eventKind !== undefined ? { kind: ref.eventKind } : {}),
      };
    case "naddr":
      return {
        ok: true,
        nip19Type: "naddr",
        identifier: ref.identifier,
        pubkey: ref.pubkey,
        kind: ref.eventKind,
        relays: ref.relays,
      };
  }
};

/** > Accepts hex pubkey, `npub`, or `nprofile`. Normalizes to hex, treats `nprofile` relay TLVs as hints */
export const profileTarget = (
  target: unknown,
): { pubkey: string; relays: string[] } | undefined => {
  if (typeof target !== "string") return undefined;
  const pubkey = decodeUserInput(target);
  if (!pubkey) return undefined;
  const ref = decodeNip19(target.trim().replace(/^nostr:/, ""));
  return { pubkey, relays: ref?.kind === "nprofile" ? ref.relays : [] };
};

/** `CommonProfileData`。kind:0 の欄を、決まった名前に直して返す。知らない欄はそのまま残す。 */
export const commonProfileData = (
  content: string,
): Record<string, unknown> | null => {
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    return null;
  }
  if (!isRecord(raw)) return null;
  const { display_name: displayNameRaw, ...rest } = raw;
  const displayName = rest.displayName ?? displayNameRaw;
  return {
    ...rest,
    ...(typeof displayName === "string" ? { displayName } : {}),
  };
};

/**
 * > `reaction` is `+`, `-`, one Unicode emoji, or one NIP-30 shortcode. `customEmojiHref`
 * > requires one matching `emoji` tag.
 */
export const commonReaction = (
  reaction: unknown,
  customEmojiHref: unknown,
): ReactionInput | undefined => {
  if (typeof reaction !== "string" || reaction === "" || reaction.length > 64) {
    return undefined;
  }
  if (reaction === "+") return { type: "like" };
  const shortcode = /^:([a-zA-Z0-9_-]+):$/.exec(reaction)?.[1];
  if (shortcode) {
    if (typeof customEmojiHref !== "string") return undefined;
    try {
      const url = new URL(customEmojiHref);
      if (url.protocol !== "https:") return undefined;
      return { type: "emoji", shortcode, url: url.href };
    } catch {
      return undefined;
    }
  }
  if (customEmojiHref !== undefined) return undefined;
  return { type: "text", content: reaction };
};
