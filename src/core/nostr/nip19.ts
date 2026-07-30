import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { bech32 } from "@scure/base";

/** NIP-19 の bech32 は 5000 文字まで許容する（既定の 90 では naddr が入らない） */
const LIMIT = 5000;

export const encodeBech32 = (prefix: string, dataHex: string): string =>
  bech32.encode(prefix, bech32.toWords(hexToBytes(dataHex)), LIMIT);

export const decodeBech32 = (
  value: string,
): { prefix: string; dataHex: string } => {
  const { prefix, words } = bech32.decode(value, LIMIT);
  return { prefix, dataHex: bytesToHex(bech32.fromWords(words)) };
};
