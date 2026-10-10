import { schnorr } from "@noble/curves/secp256k1.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { describe, expect, it, vi } from "vite-plus/test";
import { type UnsignedEvent, computeEventId } from "../../nostr/event";
import { Nip46RpcError, Nip46SignerRefusedError } from "./client";
import {
  InvalidNip46SignatureError,
  Nip46PermissionMissingError,
  createNip46Signer,
} from "./nip46-signer";
import { NIP46_REQUIRED_PERMISSIONS } from "./session-storage";

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
  it("要求権限のない kind はリモート署名器へ送らない", async () => {
    const request = vi.fn();
    const signer = createNip46Signer(
      { request },
      pubkey,
      NIP46_REQUIRED_PERMISSIONS,
    );
    await expect(
      signer.signEvent({ ...template, kind: 99999 }),
    ).rejects.toThrow("missing NIP-46 permission: sign_event:99999");
    expect(request).not.toHaveBeenCalled();
  });

  it("pubkeyを除いたtemplateを送り、同じ内容の署名済みeventを返す", async () => {
    const expected = signed();
    const request = vi.fn().mockResolvedValue(JSON.stringify(expected));
    const signer = createNip46Signer(
      { request },
      pubkey,
      NIP46_REQUIRED_PERMISSIONS,
    );
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
    const signer = createNip46Signer(
      { request },
      pubkey,
      NIP46_REQUIRED_PERMISSIONS,
    );
    await expect(signer.signEvent(template)).rejects.toBeInstanceOf(
      InvalidNip46SignatureError,
    );
  });

  it("署名が不正なeventを返さない", async () => {
    const event = { ...signed(), sig: "0".repeat(128) };
    const signer = createNip46Signer(
      { request: vi.fn().mockResolvedValue(JSON.stringify(event)) },
      pubkey,
      NIP46_REQUIRED_PERMISSIONS,
    );
    await expect(signer.signEvent(template)).rejects.toBeInstanceOf(
      InvalidNip46SignatureError,
    );
  });

  it("NIP-44 と旧 NIP-04 を remote signer へ委譲する", async () => {
    // 捕まえる変異: NIP-44 encrypt/decrypt の method 名を入れ替える。
    const request = vi.fn().mockResolvedValue("result");
    const signer = createNip46Signer(
      { request },
      pubkey,
      NIP46_REQUIRED_PERMISSIONS,
    );
    await signer.nip44?.encrypt("peer", "plain");
    await signer.nip44?.decrypt("peer", "cipher44");
    await signer.nip04?.decrypt("peer", "cipher04");
    expect(request.mock.calls).toEqual([
      ["nip44_encrypt", ["peer", "plain"]],
      ["nip44_decrypt", ["peer", "cipher44"]],
      ["nip04_decrypt", ["peer", "cipher04"]],
    ]);
  });

  it("接続のときに求めていない種類を断られたら、繋ぎ直せば直ると分かる失敗にする", async () => {
    // 捕まえる変異: 断られた理由を区別せず、署名器の文言のまま返す（繋ぎ直しを案内できない）
    const request = vi
      .fn()
      .mockRejectedValue(new Nip46SignerRefusedError("permission denied"));
    const signer = createNip46Signer({ request }, pubkey, "sign_event:7");
    await expect(signer.signEvent(template)).rejects.toBeInstanceOf(
      Nip46PermissionMissingError,
    );
  });

  it("求めていた種類を断られたときは、署名器の断りをそのまま返す", async () => {
    const refused = new Nip46SignerRefusedError("user rejected");
    const request = vi.fn().mockRejectedValue(refused);
    const signer = createNip46Signer({ request }, pubkey, "sign_event:1");
    await expect(signer.signEvent(template)).rejects.toBe(refused);
  });

  it("届かなかった・時間切れは、権限の不足として扱わない", async () => {
    const timedOut = new Nip46RpcError("remote signer response timed out");
    const request = vi.fn().mockRejectedValue(timedOut);
    const signer = createNip46Signer({ request }, pubkey, "sign_event:7");
    await expect(signer.signEvent(template)).rejects.toBe(timedOut);
  });
});
