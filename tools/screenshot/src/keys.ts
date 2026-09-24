import { schnorr } from "@noble/curves/secp256k1.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

/**
 * ID から秘密鍵を決める。ローカルのスクリーンショット専用で、本番の鍵には使わない。
 * 同じ ID なら毎回同じ鍵・同じ pubkey になるので、イベントの id も変わらない。
 */
export const secretKeyFor = (id: string): Uint8Array =>
  sha256(utf8ToBytes(`streets-screenshot/${id}`));

export const pubkeyFor = (id: string): string =>
  bytesToHex(schnorr.getPublicKey(secretKeyFor(id)));
