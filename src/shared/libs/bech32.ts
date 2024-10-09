import { bech32 } from "bech32";

const hex2bytes = (hex: string): number[] => {
  if (hex.length % 2 !== 0) {
    throw new Error("hex length must be even");
  }
  const bytes = [];
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(Number.parseInt(hex.slice(i, i + 2), 16));
  }
  return bytes;
};

export const hex2bech32 = (hex: string): string => {
  const words = hex2bytes(hex);
  return bech32.encode("nostr", bech32.toWords(words));
};
