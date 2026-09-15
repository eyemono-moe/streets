import type { NostrEvent, UnsignedEvent } from "../nostr/event";
import { type Signer, SignerUnavailableError } from "./signer";

type Nip07 = {
  getPublicKey(): Promise<string>;
  signEvent(template: UnsignedEvent): Promise<NostrEvent>;
  nip44?: {
    encrypt(peerPubkey: string, plaintext: string): Promise<string>;
    decrypt(peerPubkey: string, ciphertext: string): Promise<string>;
  };
  nip04?: {
    decrypt(peerPubkey: string, ciphertext: string): Promise<string>;
  };
};

/** `window.nostr` を「今」読む。生成時にキャッシュしない (下記)。 */
const nip07 = (): Nip07 | undefined => (globalThis as { nostr?: Nip07 }).nostr;

export const isNip07Available = (): boolean => nip07() !== undefined;

/**
 * NIP-07 拡張を `Signer` に合わせる。生成時に `window.nostr` を掴まない
 * のは、後から注入された拡張を永久に見失わないため（呼び出しのたびに読み直す）。
 */
export const createNip07Signer = (): Signer => ({
  getPublicKey: async () => {
    const api = nip07();
    if (!api) throw new SignerUnavailableError();
    return api.getPublicKey();
  },
  signEvent: async (template) => {
    const api = nip07();
    if (!api) throw new SignerUnavailableError();
    return api.signEvent(template);
  },
  // `window.nostr.nip44` が無い拡張もあるため、無条件にプロパティを
  // 生やすと「未実装」と「呼び出し失敗」を呼び出し側が区別できなくなる。
  get nip44() {
    const api = nip07();
    return api?.nip44
      ? {
          encrypt: (peerPubkey: string, plaintext: string) => {
            const current = nip07();
            if (!current?.nip44) throw new SignerUnavailableError();
            return current.nip44.encrypt(peerPubkey, plaintext);
          },
          decrypt: (peerPubkey: string, ciphertext: string) => {
            const current = nip07();
            if (!current?.nip44) throw new SignerUnavailableError();
            return current.nip44.decrypt(peerPubkey, ciphertext);
          },
        }
      : undefined;
  },
  get nip04() {
    const api = nip07();
    return api?.nip04
      ? {
          decrypt: (peerPubkey: string, ciphertext: string) => {
            const current = nip07();
            if (!current?.nip04) throw new SignerUnavailableError();
            return current.nip04.decrypt(peerPubkey, ciphertext);
          },
        }
      : undefined;
  },
});
