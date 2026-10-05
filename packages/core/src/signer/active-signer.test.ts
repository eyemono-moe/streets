import { describe, expect, it, vi } from "vite-plus/test";
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

describe("ActiveSigner の復元中と未接続", () => {
  const withNip44 = (pubkey: string): Signer => ({
    ...signer(pubkey),
    nip44: {
      encrypt: vi.fn().mockResolvedValue("cipher"),
      decrypt: vi.fn().mockResolvedValue("plain"),
    },
  });

  it("復元中の署名は、署名器が戻ってから渡す", async () => {
    const active = createActiveSigner();
    active.expect();
    const waiting = active.getPublicKey();
    active.set(signer("a".repeat(64)));
    await expect(waiting).resolves.toBe("a".repeat(64));
  });

  it("戻せなかったら、待っていた署名をすぐ断る", async () => {
    const active = createActiveSigner();
    active.expect();
    const waiting = active.getPublicKey();
    active.disconnect();
    await expect(waiting).rejects.toBeInstanceOf(SignerUnavailableError);
    await expect(active.getPublicKey()).rejects.toBeInstanceOf(
      SignerUnavailableError,
    );
  });

  it("未接続の間の復号は断らず、繋ぎ直したら読む", async () => {
    // 捕まえる変異: disconnect() が復号の待ちまで断り、非公開の項目が読めないまま残る。
    const active = createActiveSigner();
    active.expect();
    const decrypting = active.nip44?.decrypt("b".repeat(64), "cipher");
    active.disconnect();
    active.expect();
    const real = withNip44("a".repeat(64));
    active.set(real);
    await expect(decrypting).resolves.toBe("plain");
    expect(real.nip44?.decrypt).toHaveBeenCalledWith("b".repeat(64), "cipher");
  });

  it("未接続の間の暗号化は断る", async () => {
    const active = createActiveSigner();
    active.disconnect();
    await expect(
      active.nip44?.encrypt("b".repeat(64), "plain"),
    ).rejects.toBeInstanceOf(SignerUnavailableError);
  });

  it("ログアウトしたら、待っていた復号も断る", async () => {
    const active = createActiveSigner();
    active.disconnect();
    const decrypting = active.nip44?.decrypt("b".repeat(64), "cipher");
    active.set(undefined);
    await expect(decrypting).rejects.toBeInstanceOf(SignerUnavailableError);
    expect(active.nip44).toBeUndefined();
  });

  it("戻った署名器が NIP-44 を持たなければ、待っていた復号を断る", async () => {
    const active = createActiveSigner();
    active.expect();
    const decrypting = active.nip44?.decrypt("b".repeat(64), "cipher");
    active.set(signer("a".repeat(64)));
    await expect(decrypting).rejects.toBeInstanceOf(SignerUnavailableError);
    expect(active.nip44).toBeUndefined();
  });

  it("connected() は署名器が戻るまで待つ", async () => {
    const active = createActiveSigner();
    active.disconnect();
    let done = false;
    const waiting = active.connected().then(() => {
      done = true;
    });
    await Promise.resolve();
    expect(done).toBe(false);
    active.set(signer("a".repeat(64)));
    await waiting;
    expect(done).toBe(true);
  });
});
