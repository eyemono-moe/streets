import { schnorr } from "@noble/curves/secp256k1.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { describe, expect, it } from "vite-plus/test";
import { type NostrEvent, computeEventId } from "../nostr/event";
import { SignatureGate } from "./signature-gate";

const secretKey = Uint8Array.from({ length: 32 }, (_, i) => i + 1);

const sign = (content: string, auxRand?: Uint8Array): NostrEvent => {
  const unsigned = {
    pubkey: bytesToHex(schnorr.getPublicKey(secretKey)),
    created_at: 1_700_000_000,
    kind: 1,
    tags: [],
    content,
  };
  const id = computeEventId(unsigned);
  return {
    ...unsigned,
    id,
    sig: bytesToHex(schnorr.sign(hexToBytes(id), secretKey, auxRand)),
  };
};

describe("SignatureGate", () => {
  it("検証済みと同じ id と署名は、schnorr 検証を省いて通す", () => {
    // 捕まえる変異: 経路ごとに覚える（別の経路・別のリレーからの再配送で毎回検証する）。
    const gate = new SignatureGate();
    const event = sign("x");

    expect(gate.accept(event)).toBe(true);
    expect(gate.accept({ ...event })).toBe(true);

    expect(gate.stats).toMatchObject({ count: 1, skipped: 1 });
    expect(gate.stats.maxMs).toBeGreaterThan(0);
  });

  it("偽の署名が先に届いても、後から届いた本物を通す", () => {
    // 捕まえる変異: 検証する前に id を覚える（偽物が先に届くと本物を落とす）。
    const gate = new SignatureGate();
    const event = sign("x");

    expect(gate.accept({ ...event, sig: "0".repeat(128) })).toBe(false);
    expect(gate.accept(event)).toBe(true);
    expect(gate.stats).toMatchObject({ count: 2, skipped: 0 });
  });

  it("同じ無効署名の再配送は検証し直さず、別の署名は検証する", () => {
    const gate = new SignatureGate();
    const event = sign("x");
    const forged = { ...event, sig: sign("別の内容").sig };

    expect(gate.accept(forged)).toBe(false);
    expect(gate.accept({ ...forged })).toBe(false);
    expect(gate.accept(event)).toBe(true);
    expect(gate.stats).toMatchObject({
      count: 2,
      rejected: 2,
      rejectedSkipped: 1,
    });
  });

  it("無効署名と同じ id・署名でも、改ざんされた内容は毎回 id を確認する", () => {
    const gate = new SignatureGate();
    const event = sign("x");
    const forged = { ...event, sig: sign("別の内容").sig };

    expect(gate.accept(forged)).toBe(false);
    expect(gate.accept({ ...forged, content: "tampered" })).toBe(false);
    expect(gate.accept({ ...forged, pubkey: "0".repeat(64) })).toBe(false);
    expect(gate.stats).toMatchObject({
      count: 2,
      rejected: 3,
      rejectedSkipped: 0,
    });
  });

  it("検証済みの署名を付けても、本文を書き換えたものは通さない", () => {
    // 捕まえる変異: 覚えた組に当たったら id を計算し直さずに通す。
    const gate = new SignatureGate();
    const event = sign("x");
    gate.accept(event);

    expect(gate.accept({ ...event, content: "tampered" })).toBe(false);
    expect(gate.accept(event, event.sig)).toBe(true);
    expect(gate.accept({ ...event, content: "tampered" }, event.sig)).toBe(
      false,
    );
  });

  it("同じイベントの別の署名は、検証してから通す", () => {
    // BIP-340 の署名は補助乱数で変わり、同じイベントに妥当な署名が複数ありうる。
    const gate = new SignatureGate();
    const event = sign("x");
    const resigned = sign("x", new Uint8Array(32).fill(7));
    expect(resigned.sig).not.toBe(event.sig);

    gate.accept(event);
    expect(gate.accept(resigned)).toBe(true);
    expect(gate.stats).toMatchObject({ count: 2, skipped: 0 });
  });
});
