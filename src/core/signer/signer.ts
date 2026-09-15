import type { NostrEvent, UnsignedEvent } from "../nostr/event";

/**
 * 署名する能力だけを表す seam。**秘密鍵を表す変数名・引数名を、このファイルと
 * `nip07-signer.ts` に一切書かないこと** —— 鍵は常に外部の署名器（NIP-07/
 * 将来は NIP-46）が持ち、こちらは署名を依頼するだけ。
 */
export type Signer = {
  getPublicKey(): Promise<string>;
  signEvent(template: UnsignedEvent): Promise<NostrEvent>;
  /**
   * NIP-07 の `window.nostr.nip44`（実装しない署名器もあるので省略可）。
   * NIP-44 は ECDH に秘密鍵が要るので、非公開項目の暗号化も署名器へ委譲する。
   */
  nip44?: {
    encrypt(peerPubkey: string, plaintext: string): Promise<string>;
    decrypt(peerPubkey: string, ciphertext: string): Promise<string>;
  };
  /** 旧 NIP-51 content の読み取り専用。新しい暗号文には NIP-44 を使う。 */
  nip04?: {
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
 * 署名器が NIP-44 を実装していない。**これを握り潰して公開項目として
 * 書いてはならない**——非公開のつもりのミュート対象が公開されるのは巻き戻せない。
 */
export class Nip44UnavailableError extends Error {
  constructor(message = "signer does not implement NIP-44") {
    super(message);
    this.name = "Nip44UnavailableError";
  }
}
