import { chacha20 } from "@noble/ciphers/chacha";
import { equalBytes } from "@noble/ciphers/utils";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { expand, extract } from "@noble/hashes/hkdf.js";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import {
  concatBytes,
  hexToBytes,
  randomBytes,
  utf8ToBytes,
} from "@noble/hashes/utils.js";
import { base64 } from "@scure/base";

const VERSION = 2;
const NONCE_BYTES = 32;
const MAC_BYTES = 32;
const MIN_PLAINTEXT_BYTES = 1;
// NIP-46 の RPC は小さい JSON だけを運ぶ。現行 NIP-44 が許す理論上の 4 GiB
// までブラウザで確保せず、旧来の u16 範囲を DoS 上限として採る。
const MAX_PLAINTEXT_BYTES = 65_535;
const MIN_PAYLOAD_CHARS = 132;
const MAX_PAYLOAD_CHARS = 87_472;

const decoder = new TextDecoder("utf-8", { fatal: true });

export class Nip44Error extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Nip44Error";
  }
}

export const conversationKey = (
  clientSecret: Uint8Array,
  peerPubkey: string,
): Uint8Array => {
  const sharedX = secp256k1
    .getSharedSecret(clientSecret, hexToBytes(`02${peerPubkey}`))
    .subarray(1, 33);
  return extract(sha256, sharedX, utf8ToBytes("nip44-v2"));
};

export const paddedLength = (length: number): number => {
  if (!Number.isSafeInteger(length) || length < MIN_PLAINTEXT_BYTES) {
    throw new Nip44Error("plaintext must not be empty");
  }
  if (length <= 32) return 32;
  const nextPower = 2 ** (Math.floor(Math.log2(length - 1)) + 1);
  const chunk = nextPower <= 256 ? 32 : nextPower / 8;
  return chunk * (Math.floor((length - 1) / chunk) + 1);
};

const messageKeys = (key: Uint8Array, nonce: Uint8Array) => {
  if (key.length !== 32 || nonce.length !== NONCE_BYTES) {
    throw new Nip44Error("invalid key or nonce length");
  }
  const keys = expand(sha256, key, nonce, 76);
  return {
    chachaKey: keys.subarray(0, 32),
    chachaNonce: keys.subarray(32, 44),
    hmacKey: keys.subarray(44, 76),
  };
};

const pad = (plaintext: string): Uint8Array => {
  const bytes = utf8ToBytes(plaintext);
  if (
    bytes.length < MIN_PLAINTEXT_BYTES ||
    bytes.length > MAX_PLAINTEXT_BYTES
  ) {
    throw new Nip44Error("plaintext length is outside the supported range");
  }
  const prefix = new Uint8Array(2);
  new DataView(prefix.buffer).setUint16(0, bytes.length, false);
  return concatBytes(
    prefix,
    bytes,
    new Uint8Array(paddedLength(bytes.length) - bytes.length),
  );
};

const unpad = (padded: Uint8Array): string => {
  if (padded.length < 2) throw new Nip44Error("invalid padding");
  const length = new DataView(
    padded.buffer,
    padded.byteOffset,
    padded.byteLength,
  ).getUint16(0, false);
  const plaintext = padded.subarray(2, 2 + length);
  if (
    length < MIN_PLAINTEXT_BYTES ||
    length > MAX_PLAINTEXT_BYTES ||
    plaintext.length !== length ||
    padded.length !== 2 + paddedLength(length)
  ) {
    throw new Nip44Error("invalid padding");
  }
  try {
    return decoder.decode(plaintext);
  } catch {
    throw new Nip44Error("plaintext is not valid UTF-8");
  }
};

export const encryptNip44 = (
  plaintext: string,
  key: Uint8Array,
  nonce: Uint8Array = randomBytes(NONCE_BYTES),
): string => {
  const { chachaKey, chachaNonce, hmacKey } = messageKeys(key, nonce);
  const ciphertext = chacha20(chachaKey, chachaNonce, pad(plaintext));
  const mac = hmac(sha256, hmacKey, concatBytes(nonce, ciphertext));
  return base64.encode(
    concatBytes(new Uint8Array([VERSION]), nonce, ciphertext, mac),
  );
};

export const decryptNip44 = (payload: string, key: Uint8Array): string => {
  if (payload.startsWith("#")) {
    throw new Nip44Error("unsupported encryption version");
  }
  if (
    payload.length < MIN_PAYLOAD_CHARS ||
    payload.length > MAX_PAYLOAD_CHARS
  ) {
    throw new Nip44Error("invalid payload length");
  }

  let data: Uint8Array;
  try {
    data = base64.decode(payload);
  } catch {
    throw new Nip44Error("invalid base64 payload");
  }
  if (data.length < 99 || data[0] !== VERSION) {
    throw new Nip44Error(
      data[0] === VERSION
        ? "invalid payload length"
        : "unsupported encryption version",
    );
  }

  const nonce = data.subarray(1, 33);
  const ciphertext = data.subarray(33, -MAC_BYTES);
  const mac = data.subarray(-MAC_BYTES);
  const { chachaKey, chachaNonce, hmacKey } = messageKeys(key, nonce);
  const expected = hmac(sha256, hmacKey, concatBytes(nonce, ciphertext));
  if (!equalBytes(expected, mac)) throw new Nip44Error("invalid MAC");
  return unpad(chacha20(chachaKey, chachaNonce, ciphertext));
};
