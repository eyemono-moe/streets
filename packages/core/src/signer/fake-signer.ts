import { schnorr } from "@noble/curves/secp256k1.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { type NostrEvent, computeEventId } from "../nostr/event";
import type { Signer } from "./signer";

/**
 * テストからのみ使う偽の署名器（`fake-relay-connection.ts`/`fake-clock.ts`
 * と同じ位置づけ）。**本物の署名を作る**——`EventStore.put` の schnorr 検証を
 * 通すため。このファイルだけ秘密鍵を引数に取るのは、禁止対象が**アプリが**
 * 鍵を保持することであり、テストが自分で鍵を作ることではないため。
 */
export const createFakeSigner = (secretKey: Uint8Array): Signer => {
  const pubkey = bytesToHex(schnorr.getPublicKey(secretKey));
  return {
    getPublicKey: async () => pubkey,
    signEvent: async (template): Promise<NostrEvent> => {
      const unsigned = { ...template, pubkey };
      const id = computeEventId(unsigned);
      return {
        ...unsigned,
        id,
        sig: bytesToHex(schnorr.sign(hexToBytes(id), secretKey)),
      };
    },
  };
};
