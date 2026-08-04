import type { NostrEvent, UnsignedEvent } from "../nostr/event";
import { type Signer, SignerUnavailableError } from "./signer";

type Nip07 = {
  getPublicKey(): Promise<string>;
  signEvent(template: UnsignedEvent): Promise<NostrEvent>;
};

/** `window.nostr` を「今」読む。生成時にキャッシュしない (下記)。 */
const nip07 = (): Nip07 | undefined => (globalThis as { nostr?: Nip07 }).nostr;

export const isNip07Available = (): boolean => nip07() !== undefined;

/**
 * NIP-07 拡張を `Signer` に合わせる。
 *
 * **生成時に `window.nostr` を掴まない。** 拡張機能はページ読み込みの直後には
 * まだ注入されていないことがあり、生成時に掴んで固定すると、後から入った
 * 拡張を永久に見失う。呼び出しのたびに読み直す。
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
});
