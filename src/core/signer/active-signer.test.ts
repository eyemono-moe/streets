import { describe, expect, it, vi } from "vitest";
import { createActiveSigner } from "./active-signer";
import type { Signer } from "./signer";
import { SignerUnavailableError } from "./signer";

const signer = (pubkey: string): Signer => ({
  getPublicKey: vi.fn().mockResolvedValue(pubkey),
  signEvent: vi.fn(),
});

describe("ActiveSigner", () => {
  it("未ログインでは署名器なしを伝える", async () => {
    await expect(createActiveSigner().getPublicKey()).rejects.toBeInstanceOf(
      SignerUnavailableError,
    );
  });

  it("切替後の呼び出しを新しい署名器だけへ渡す", async () => {
    // 捕まえる変異: set() が最初の signer を保持し続ける。
    const active = createActiveSigner();
    const first = signer("a".repeat(64));
    const second = signer("b".repeat(64));
    active.set(first);
    await expect(active.getPublicKey()).resolves.toBe("a".repeat(64));
    active.set(second);
    await expect(active.getPublicKey()).resolves.toBe("b".repeat(64));
    expect(first.getPublicKey).toHaveBeenCalledTimes(1);
    expect(second.getPublicKey).toHaveBeenCalledTimes(1);
  });

  it("logout後は古い署名器へ流さない", async () => {
    const active = createActiveSigner();
    const previous = signer("a".repeat(64));
    active.set(previous);
    active.set(undefined);
    await expect(active.getPublicKey()).rejects.toBeInstanceOf(
      SignerUnavailableError,
    );
    expect(previous.getPublicKey).not.toHaveBeenCalled();
  });
});
