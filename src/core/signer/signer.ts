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
};

/** 署名器が使えない (NIP-07 拡張が入っていない等)。 */
export class SignerUnavailableError extends Error {
  constructor(message = "no NIP-07 signer available") {
    super(message);
    this.name = "SignerUnavailableError";
  }
}
