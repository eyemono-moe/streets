import type { Signer } from "../signer/signer";
import type { NostrEvent } from "./event";

/**
 * NIP-51 のリストの項目の置き場。公開はタグに、非公開はタグと同じ形の配列を
 * 自分宛に暗号化して `content` に置く。
 */
export type ItemVisibility = "private" | "public";

/** 非公開の部分を読み書きできるか。`unavailable` は署名器が NIP-44 を持たない。 */
export type PrivatePartStatus = "ready" | "unavailable" | "invalid";

export class PrivateItemsUnavailableError extends Error {
  constructor(message = "signer cannot access private list items") {
    super(message);
    this.name = "PrivateItemsUnavailableError";
  }
}

export class InvalidPrivateItemsError extends Error {
  constructor(message = "private list items could not be decoded") {
    super(message);
    this.name = "InvalidPrivateItemsError";
  }
}

const parsePrivateTags = (plaintext: string): string[][] | undefined => {
  try {
    const value: unknown = JSON.parse(plaintext);
    return Array.isArray(value) &&
      value.every(
        (tag) =>
          Array.isArray(tag) && tag.every((item) => typeof item === "string"),
      )
      ? (value as string[][])
      : undefined;
  } catch {
    return undefined;
  }
};

/** NIP-04 の暗号文は `?iv=` を含む（NIP-51 が見分け方として定めている）。 */
export const decryptPrivateTags = async (
  event: NostrEvent,
  signer: Signer,
  pubkey: string,
): Promise<
  { status: "ready"; tags: string[][] } | { status: "unavailable" | "invalid" }
> => {
  if (event.content === "") return { status: "ready", tags: [] };
  const legacy = event.content.includes("?iv=");
  const cipher = legacy ? signer.nip04 : signer.nip44;
  if (!cipher) return { status: "unavailable" };
  try {
    const plaintext = await cipher.decrypt(pubkey, event.content);
    const tags = parsePrivateTags(plaintext);
    return tags ? { status: "ready", tags } : { status: "invalid" };
  } catch {
    return { status: "invalid" };
  }
};

/**
 * 非公開の部分を書き換える。読めないときは投げる —— 読めないまま空で書くと、
 * 既存の非公開の項目を黙って消す。書くのは NIP-44 だけ（NIP-04 は読むだけ）。
 */
export const rewritePrivateTags = async (
  current: NostrEvent | undefined,
  signer: Signer,
  pubkey: string,
  next: (tags: string[][]) => string[][],
): Promise<string> => {
  if (!signer.nip44) throw new PrivateItemsUnavailableError();
  const result = current
    ? await decryptPrivateTags(current, signer, pubkey)
    : { status: "ready" as const, tags: [] };
  if (result.status !== "ready") {
    throw result.status === "unavailable"
      ? new PrivateItemsUnavailableError()
      : new InvalidPrivateItemsError();
  }
  return signer.nip44.encrypt(pubkey, JSON.stringify(next(result.tags)));
};
