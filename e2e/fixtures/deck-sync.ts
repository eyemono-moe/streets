import type { Page } from "@playwright/test";
import type { EventTemplate } from "nostr-tools";
import { finalizeEvent, getPublicKey } from "nostr-tools/pure";

const secretKey = (seed: number) =>
  Uint8Array.from(
    Array.from({ length: 32 }, (_, i) => ((seed + i * 7) % 255) + 1),
  );

const deckSyncSecret = secretKey(90_004);
export const deckSyncPubkey = getPublicKey(deckSyncSecret);

export const signAsDeckSyncViewer = (template: EventTemplate) =>
  finalizeEvent(template, deckSyncSecret);

/**
 * 暗号方式そのものではなく NIP-07 の委譲と同期配線を測るための決定的な
 * self-encryption stub。署名は EventStore の検証を通る本物を返す。
 */
export const installDeckSyncSigner = async (page: Page): Promise<void> => {
  await page.exposeFunction(
    "__streetsSignDeckSync",
    (template: EventTemplate) => signAsDeckSyncViewer(template),
  );
  await page.addInitScript((pubkey: string) => {
    const prefix = "deck-sync-nip44:";
    const win = window as typeof window & {
      nostr: unknown;
      __streetsSignDeckSync(template: unknown): Promise<unknown>;
    };
    win.nostr = {
      getPublicKey: async () => pubkey,
      signEvent: (template: unknown) => win.__streetsSignDeckSync(template),
      nip44: {
        encrypt: async (_peer: string, plaintext: string) =>
          `${prefix}${encodeURIComponent(plaintext)}`,
        decrypt: async (_peer: string, ciphertext: string) => {
          if (!ciphertext.startsWith(prefix)) throw new Error("invalid NIP-44");
          return decodeURIComponent(ciphertext.slice(prefix.length));
        },
      },
    };
  }, deckSyncPubkey);
};
