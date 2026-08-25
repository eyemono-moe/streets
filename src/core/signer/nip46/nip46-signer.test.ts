import { schnorr } from "@noble/curves/secp256k1.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { describe, expect, it, vi } from "vitest";
import { type UnsignedEvent, computeEventId } from "../../nostr/event";
import { InvalidNip46SignatureError, createNip46Signer } from "./nip46-signer";

const secret = new Uint8Array(32).fill(3);
const pubkey = bytesToHex(schnorr.getPublicKey(secret));
const template: UnsignedEvent = {
  pubkey,
  created_at: 123,
  kind: 1,
  tags: [["t", "nostr"]],
  content: "hello",
};
const signed = (overrides: Partial<UnsignedEvent> = {}) => {
  const unsigned = { ...template, ...overrides };
  const id = computeEventId(unsigned);
  return {
    ...unsigned,
    id,
    sig: bytesToHex(schnorr.sign(hexToBytes(id), secret)),
  };
};

describe("Nip46Signer", () => {
  it("pubkeyを除いたtemplateを送り、同じ内容の署名済みeventを返す", async () => {
    const expected = signed();
    const request = vi.fn().mockResolvedValue(JSON.stringify(expected));
    const signer = createNip46Signer({ request }, pubkey);
    await expect(signer.signEvent(template)).resolves.toEqual(expected);
    const sent = JSON.parse(request.mock.calls[0]?.[1][0]);
    expect(sent).toEqual({
      created_at: 123,
      kind: 1,
      tags: [["t", "nostr"]],
      content: "hello",
    });
    expect(sent).not.toHaveProperty("pubkey");
  });

  it("remote signerが内容を変えたeventをpublish経路へ返さない", async () => {
    // 捕まえる変異: template と返却イベントの content 比較を削除する。
    const request = vi
      .fn()
      .mockResolvedValue(JSON.stringify(signed({ content: "changed" })));
    const signer = createNip46Signer({ request }, pubkey);
    await expect(signer.signEvent(template)).rejects.toBeInstanceOf(
      InvalidNip46SignatureError,
    );
  });

  it("署名が不正なeventを返さない", async () => {
    const event = { ...signed(), sig: "0".repeat(128) };
    const signer = createNip46Signer(
      { request: vi.fn().mockResolvedValue(JSON.stringify(event)) },
      pubkey,
    );
    await expect(signer.signEvent(template)).rejects.toBeInstanceOf(
      InvalidNip46SignatureError,
    );
  });
});
