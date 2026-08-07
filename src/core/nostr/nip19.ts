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

/** 小文字 hex のみ。NIP-01 の pubkey は 32 バイトの hex 表現である。 */
const HEX_PUBKEY = /^[0-9a-f]{64}$/;

/**
 * ユーザーが打ち込んだ文字列から pubkey (hex) を取り出す。npub と hex の
 * 両方を受ける。**不正な入力に対して例外を投げない** —— `decodeBech32` は
 * 投げるが、これはフォームの入力を受ける関数であり、呼び出し側が
 * try/catch を書く前提にすると書き忘れがそのまま画面の破壊になる。
 *
 * `npub` 以外の prefix は受け付けない。とくに `nsec` を弾くことには意味が
 * ある —— 貼り間違いを黙って著者フィルタとして扱うと、ADR-0008 の
 * 「秘密鍵をアプリに渡さない」を入力の側から破ることになる。
 */
export const decodeNpub = (input: string): string | undefined => {
  const trimmed = input.trim();
  if (HEX_PUBKEY.test(trimmed)) return trimmed;

  try {
    const { prefix, dataHex } = decodeBech32(trimmed);
    return prefix === "npub" && HEX_PUBKEY.test(dataHex) ? dataHex : undefined;
  } catch {
    return undefined;
  }
};
