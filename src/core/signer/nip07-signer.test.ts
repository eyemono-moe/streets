import { afterEach, describe, expect, it, vi } from "vitest";
import { createNip07Signer, isNip07Available } from "./nip07-signer";
import { SignerUnavailableError } from "./signer";

const setNostr = (value: unknown) => {
  (globalThis as { nostr?: unknown }).nostr = value;
};

afterEach(() => {
  (globalThis as { nostr?: unknown }).nostr = undefined;
});

describe("createNip07Signer", () => {
  it("拡張機能が無ければ isNip07Available が false", () => {
    // 捕まえる変異: 存在確認を省いて常に true を返す
    setNostr(undefined);
    expect(isNip07Available()).toBe(false);
  });

  it("拡張機能があれば true", () => {
    setNostr({
      getPublicKey: async () => "x",
      signEvent: async (e: unknown) => e,
    });
    expect(isNip07Available()).toBe(true);
  });

  it("拡張機能が無い状態で getPublicKey を呼ぶと SignerUnavailableError", async () => {
    // 捕まえる変異: undefined へのアクセスを素通しして TypeError を投げる
    // (呼び出し側が「拡張が無い」と「拡張が壊れている」を区別できなくなる)
    setNostr(undefined);
    const signer = createNip07Signer();
    await expect(signer.getPublicKey()).rejects.toBeInstanceOf(
      SignerUnavailableError,
    );
  });

  it("signer の生成時点では拡張機能の有無を確かめない", async () => {
    // 捕まえる変異: createNip07Signer() の中で window.nostr を掴んで固定する
    // (ページ読み込み直後は拡張がまだ注入されていないことがあり、
    //  生成時に掴むと「後から入った拡張」を永久に見失う)
    setNostr(undefined);
    const signer = createNip07Signer();
    setNostr({
      getPublicKey: async () => "a".repeat(64),
      signEvent: async (e: unknown) => e,
    });
    await expect(signer.getPublicKey()).resolves.toBe("a".repeat(64));
  });

  it("getPublicKey が返した値をそのまま通す", async () => {
    const pubkey = "b".repeat(64);
    setNostr({
      getPublicKey: async () => pubkey,
      signEvent: async (e: unknown) => e,
    });
    await expect(createNip07Signer().getPublicKey()).resolves.toBe(pubkey);
  });

  it("signEvent は拡張機能が返した署名済みイベントをそのまま返す", async () => {
    // 捕まえる変異: 拡張の戻り値を捨てて template を返す (sig が付かない)
    const signed = {
      id: "c".repeat(64),
      pubkey: "b".repeat(64),
      created_at: 1,
      kind: 1,
      tags: [],
      content: "hi",
      sig: "d".repeat(128),
    };
    const signEvent = vi.fn(async () => signed);
    setNostr({ getPublicKey: async () => "b".repeat(64), signEvent });
    const result = await createNip07Signer().signEvent({
      pubkey: "b".repeat(64),
      created_at: 1,
      kind: 1,
      tags: [],
      content: "hi",
    });
    expect(result).toEqual(signed);
    expect(signEvent).toHaveBeenCalledTimes(1);
  });

  it("拡張機能が nip44 を実装していなければ nip44 プロパティ自体が無い", () => {
    // 捕まえる変異: 常に nip44 オブジェクトを生やす
    // (「未実装」と「呼び出し失敗」を呼び出し側が区別できなくなる)
    setNostr({
      getPublicKey: async () => "a".repeat(64),
      signEvent: async (e: unknown) => e,
    });
    expect(createNip07Signer().nip44).toBeUndefined();
  });

  it("拡張機能が nip44 を実装していれば通す", async () => {
    // 捕まえる変異: encrypt/decrypt の戻り値や引数を落とす・入れ替える
    const encrypt = vi.fn(
      async (_peer: string, plaintext: string) => `enc:${plaintext}`,
    );
    const decrypt = vi.fn(async (_peer: string, ciphertext: string) =>
      ciphertext.replace("enc:", ""),
    );
    setNostr({
      getPublicKey: async () => "a".repeat(64),
      signEvent: async (e: unknown) => e,
      nip44: { encrypt, decrypt },
    });
    const signer = createNip07Signer();
    await expect(signer.nip44?.encrypt("peer", "hello")).resolves.toBe(
      "enc:hello",
    );
    await expect(signer.nip44?.decrypt("peer", "enc:hello")).resolves.toBe(
      "hello",
    );
    expect(encrypt).toHaveBeenCalledWith("peer", "hello");
    expect(decrypt).toHaveBeenCalledWith("peer", "enc:hello");
  });
});
