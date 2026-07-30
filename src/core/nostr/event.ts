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
 * リレーは信用できない。id の再計算と schnorr 署名の両方を検証する。
 * 暗号は @noble/curves に委ねる (ADR-0020)。
 */
export const verifyEvent = (event: NostrEvent): boolean => {
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
