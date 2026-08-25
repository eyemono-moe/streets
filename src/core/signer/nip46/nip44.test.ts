import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { describe, expect, it } from "vitest";
import {
  Nip44Error,
  conversationKey,
  decryptNip44,
  encryptNip44,
  paddedLength,
} from "./nip44";

const SEC1 = hexToBytes(`${"0".repeat(63)}1`);
const SEC2 = hexToBytes(`${"0".repeat(63)}2`);
const PUB2 = "c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5";
const KEY = hexToBytes(
  "c41c775356fd92eadc63ff5a0dc1da211b268cbea22316767095b2871ea1412d",
);
const NONCE = hexToBytes(`${"0".repeat(63)}1`);
const PAYLOAD =
  "AgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABee0G5VSK0/9YypIObAtDKfYEAjD35uVkHyB0F4DwrcNaCXlCWZKaArsGrY6M9wnuTMxWfp1RTN9Xga8no+kF5Vsb";

describe("NIP-44 v2 transport", () => {
  it("公式vectorのconversation keyを作る", () => {
    expect(conversationKey(SEC1, PUB2)).toEqual(KEY);
  });

  it("公式vectorどおり暗号化・復号する", () => {
    expect(encryptNip44("a", KEY, NONCE)).toBe(PAYLOAD);
    expect(decryptNip44(PAYLOAD, KEY)).toBe("a");
  });

  it.each([
    [1, 32],
    [32, 32],
    [33, 64],
    [255, 256],
    [256, 256],
    [257, 320],
  ])("%i byteを%i byteへpaddingする", (input, output) => {
    expect(paddedLength(input)).toBe(output);
  });

  it("改ざんされたMACを復号しない", () => {
    // 捕まえる変異: expected と mac の比較を削除する。
    const changed = `${PAYLOAD.slice(0, -2)}AA`;
    expect(() => decryptNip44(changed, KEY)).toThrow(Nip44Error);
  });

  it("空の平文を暗号化しない", () => {
    expect(() => encryptNip44("", KEY, NONCE)).toThrow(Nip44Error);
  });

  it("双方の鍵から同じconversation keyを作る", async () => {
    const { schnorr } = await import("@noble/curves/secp256k1.js");
    const pub1 = bytesToHex(schnorr.getPublicKey(SEC1));
    expect(conversationKey(SEC2, pub1)).toEqual(KEY);
  });
});
