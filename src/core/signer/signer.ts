import type { NostrEvent, UnsignedEvent } from "../nostr/event";

/**
 * 署名する能力だけを表す seam ([ADR-0008](../../../docs/adr/0008-signer-only-key-handling.md))。
 *
 * **このファイルと `nip07-signer.ts` には、秘密鍵そのものを表す変数名・
 * 引数名を一切書かないこと。** アプリが秘密鍵を持たない、という決定の
 * 実装上の意味はそれである。鍵を持っているのは常に外部の署名器 (NIP-07
 * 拡張、将来は NIP-46 のリモート署名器) であり、こちら側は「署名しても
 * らう」ことしかできない。
 */
export type Signer = {
  getPublicKey(): Promise<string>;
  signEvent(template: UnsignedEvent): Promise<NostrEvent>;
  /**
   * NIP-07 の `window.nostr.nip44`。**実装しない署名器がある**ので省略可能。
   *
   * NIP-51 の非公開リスト項目は NIP-44 で暗号化する。NIP-44 は ECDH に
   * 秘密鍵を要求するので、鍵を持たないこのアプリ (ADR-0008) は署名器へ
   * 委譲するしかない。
   */
  nip44?: {
    encrypt(peerPubkey: string, plaintext: string): Promise<string>;
    decrypt(peerPubkey: string, ciphertext: string): Promise<string>;
  };
};

/** 署名器が使えない (NIP-07 拡張が入っていない等)。 */
export class SignerUnavailableError extends Error {
  constructor(message = "no NIP-07 signer available") {
    super(message);
    this.name = "SignerUnavailableError";
  }
}

/**
 * 署名器が NIP-44 を実装していない。
 *
 * **これを握り潰して公開項目として書いてはならない。** 非公開のつもりの
 * ミュート対象が公開されるのは巻き戻せない。
 */
export class Nip44UnavailableError extends Error {
  constructor(message = "signer does not implement NIP-44") {
    super(message);
    this.name = "Nip44UnavailableError";
  }
}
