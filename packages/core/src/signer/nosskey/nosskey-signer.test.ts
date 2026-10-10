import { schnorr } from "@noble/curves/secp256k1.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { describe, expect, it, vi } from "vite-plus/test";
import { type UnsignedEvent, computeEventId } from "../../nostr/event";
import { NosskeyError } from "./nosskey-client";
import {
  NosskeyAccountChangedError,
  askNosskeyPublicKey,
  createNosskeySigner,
} from "./nosskey-signer";

const secretOf = (byte: number) => new Uint8Array(32).fill(byte);
const ME = secretOf(3);
const OTHER = secretOf(4);
const pubkeyOf = (secret: Uint8Array) =>
  bytesToHex(schnorr.getPublicKey(secret));

const template: UnsignedEvent = {
  pubkey: pubkeyOf(ME),
  created_at: 123,
  kind: 1,
  tags: [["t", "nostr"]],
  content: "hello",
};

const signAs = (secret: Uint8Array, overrides: Partial<UnsignedEvent> = {}) => {
  const unsigned = { ...template, pubkey: pubkeyOf(secret), ...overrides };
  const id = computeEventId(unsigned);
  return {
    ...unsigned,
    id,
    sig: bytesToHex(schnorr.sign(hexToBytes(id), secret)),
  };
};

describe("createNosskeySigner", () => {
  it("pubkey を除いた template を送り、頼んだとおりの署名済みイベントを返す", async () => {
    const signed = signAs(ME);
    const request = vi.fn().mockResolvedValue(signed);
    const signer = createNosskeySigner({ request }, pubkeyOf(ME));
    await expect(signer.signEvent(template)).resolves.toEqual(signed);
    expect(request).toHaveBeenCalledWith("signEvent", {
      event: {
        created_at: 123,
        kind: 1,
        tags: [["t", "nostr"]],
        content: "hello",
      },
    });
  });

  it("別のアカウントで署名されたら、アカウントが替わったと分かる失敗にする", async () => {
    // 捕まえる変異: 公開鍵を確かめない（nosskey.app で切り替えた別の人として書き込む）
    const request = vi.fn().mockResolvedValue(signAs(OTHER));
    const signer = createNosskeySigner({ request }, pubkeyOf(ME));
    await expect(signer.signEvent(template)).rejects.toBeInstanceOf(
      NosskeyAccountChangedError,
    );
  });

  it("中身を変えて署名されたイベントは返さない", async () => {
    const request = vi
      .fn()
      .mockResolvedValue(signAs(ME, { content: "changed" }));
    const signer = createNosskeySigner({ request }, pubkeyOf(ME));
    await expect(signer.signEvent(template)).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
  });

  it("暗号化は相手の公開鍵と本文を名前付きで渡す", async () => {
    const request = vi.fn().mockResolvedValue("cipher");
    const signer = createNosskeySigner({ request }, pubkeyOf(ME));
    await expect(signer.nip44?.encrypt("peer", "plain")).resolves.toBe(
      "cipher",
    );
    expect(request).toHaveBeenCalledWith("nip44_encrypt", {
      pubkey: "peer",
      plaintext: "plain",
    });
  });
});

describe("askNosskeyPublicKey", () => {
  it("64 桁の16進でない公開鍵は受け取らない", async () => {
    await expect(
      askNosskeyPublicKey({ request: vi.fn().mockResolvedValue("npub1...") }),
    ).rejects.toBeInstanceOf(NosskeyError);
  });
});
