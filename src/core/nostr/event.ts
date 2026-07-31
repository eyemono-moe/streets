import { schnorr } from "@noble/curves/secp256k1.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";

export type NostrEvent = {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
};

export type UnsignedEvent = Omit<NostrEvent, "id" | "sig">;

const HEX64 = /^[0-9a-f]{64}$/;
const HEX128 = /^[0-9a-f]{128}$/;

/**
 * リレーから来た値が NostrEvent の形をしているかの構造検証 (ADR-0020)。
 * `JSON.stringify` は型を気にしないため、例えば `created_at` が正しく
 * 署名された JSON 文字列でも id/署名は矛盾なく通ってしまう。暗号検証の
 * *前に* 呼ぶことで、そうした「たまたま暗号は通るが形が壊れている」値を
 * 落とす。
 */
export const isNostrEvent = (value: unknown): value is NostrEvent => {
  if (typeof value !== "object" || value === null) return false;
  const event = value as Record<string, unknown>;

  if (typeof event.id !== "string" || !HEX64.test(event.id)) return false;
  if (typeof event.pubkey !== "string" || !HEX64.test(event.pubkey))
    return false;
  if (typeof event.sig !== "string" || !HEX128.test(event.sig)) return false;
  if (typeof event.kind !== "number" || !Number.isInteger(event.kind))
    return false;
  if (
    typeof event.created_at !== "number" ||
    !Number.isInteger(event.created_at)
  )
    return false;
  if (typeof event.content !== "string") return false;
  if (!Array.isArray(event.tags)) return false;
  for (const tag of event.tags) {
    if (!Array.isArray(tag)) return false;
    for (const item of tag) {
      if (typeof item !== "string") return false;
    }
  }

  return true;
};

/**
 * NIP-01 の正規化シリアライズ。
 * [0, pubkey, created_at, kind, tags, content] を空白なしの JSON にして sha256。
 */
export const computeEventId = (event: UnsignedEvent): string => {
  const serialized = JSON.stringify([
    0,
    event.pubkey,
    event.created_at,
    event.kind,
    event.tags,
    event.content,
  ]);
  return bytesToHex(sha256(utf8ToBytes(serialized)));
};

/**
 * リレーは信用できない。構造の検証、id の再計算、schnorr 署名の検証を
 * すべて行う。暗号は @noble/curves に委ねる (ADR-0020)。
 */
export const verifyEvent = (event: NostrEvent): boolean => {
  if (!isNostrEvent(event)) return false;

  const { id, sig, ...unsigned } = event;
  if (computeEventId(unsigned) !== id) return false;
  try {
    return schnorr.verify(
      hexToBytes(sig),
      hexToBytes(id),
      hexToBytes(event.pubkey),
    );
  } catch {
    // 不正な長さや非16進の署名は例外になる
    return false;
  }
};
