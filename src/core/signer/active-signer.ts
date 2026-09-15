import type { NostrEvent, UnsignedEvent } from "../nostr/event";
import { type Signer, SignerUnavailableError } from "./signer";

export type ActiveSigner = Signer & {
  set(signer: Signer | undefined): void;
};

/**
 * `Writer` から見える署名器を、ログイン方式と同時に切り替える。開始時に
 * だけ現在値を読むので、進行中の署名要求は差し替わらず次の操作から新 session。
 */
export const createActiveSigner = (): ActiveSigner => {
  let current: Signer | undefined;
  const requireCurrent = (): Signer => {
    if (!current) throw new SignerUnavailableError("no active signer");
    return current;
  };

  return {
    set(signer) {
      current = signer;
    },
    async getPublicKey(): Promise<string> {
      return requireCurrent().getPublicKey();
    },
    async signEvent(template: UnsignedEvent): Promise<NostrEvent> {
      return requireCurrent().signEvent(template);
    },
    get nip44() {
      const nip44 = current?.nip44;
      return nip44
        ? {
            encrypt: (peerPubkey: string, plaintext: string) =>
              nip44.encrypt(peerPubkey, plaintext),
            decrypt: (peerPubkey: string, ciphertext: string) =>
              nip44.decrypt(peerPubkey, ciphertext),
          }
        : undefined;
    },
    get nip04() {
      const nip04 = current?.nip04;
      return nip04
        ? {
            decrypt: (peerPubkey: string, ciphertext: string) =>
              nip04.decrypt(peerPubkey, ciphertext),
          }
        : undefined;
    },
  };
};
