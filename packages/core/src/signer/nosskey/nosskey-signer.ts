import type { NostrEvent, UnsignedEvent } from "../../nostr/event";
import { checkSignedEvent } from "../signed-event";
import type { Signer } from "../signer";
import { type NosskeyClient, NosskeyError } from "./nosskey-client";

const HEX64 = /^[0-9a-f]{64}$/;

const text = (value: unknown, what: string): string => {
  if (typeof value !== "string") {
    throw new NosskeyError("INVALID_RESPONSE", `${what}: expected a string`);
  }
  return value;
};

/** nosskey.app にいまのアカウントの公開鍵を聞く。初めては同意の画面が出る。 */
export const askNosskeyPublicKey = async (
  client: Pick<NosskeyClient, "request">,
): Promise<string> => {
  const pubkey = text(await client.request("getPublicKey"), "getPublicKey");
  if (!HEX64.test(pubkey)) {
    throw new NosskeyError("INVALID_RESPONSE", "invalid public key");
  }
  return pubkey;
};

/**
 * nosskey.app の側でアカウントが替わっていたら、署名は別の公開鍵になる。
 * 黙って受け取ると、ログインしている人とは別の人として書き込んでしまう。
 */
export class NosskeyAccountChangedError extends Error {
  constructor() {
    super("nosskey signed with a different account");
    this.name = "NosskeyAccountChangedError";
  }
}

export const createNosskeySigner = (
  client: Pick<NosskeyClient, "request">,
  pubkey: string,
): Signer => ({
  getPublicKey: async () => pubkey,
  async signEvent(template: UnsignedEvent): Promise<NostrEvent> {
    const { pubkey: _pubkey, ...withoutPubkey } = template;
    const value = await client.request("signEvent", { event: withoutPubkey });
    const checked = checkSignedEvent(value, template, pubkey);
    if (checked.ok) return checked.event;
    if (
      checked.reason === "changed" &&
      typeof value === "object" &&
      value !== null &&
      (value as { pubkey?: unknown }).pubkey !== pubkey
    ) {
      throw new NosskeyAccountChangedError();
    }
    throw new NosskeyError(
      "INVALID_RESPONSE",
      checked.reason === "invalid"
        ? "nosskey returned an invalid event"
        : "nosskey changed the event being signed",
    );
  },
  nip44: {
    encrypt: async (peerPubkey, plaintext) =>
      text(
        await client.request("nip44_encrypt", {
          pubkey: peerPubkey,
          plaintext,
        }),
        "nip44_encrypt",
      ),
    decrypt: async (peerPubkey, ciphertext) =>
      text(
        await client.request("nip44_decrypt", {
          pubkey: peerPubkey,
          ciphertext,
        }),
        "nip44_decrypt",
      ),
  },
  nip04: {
    decrypt: async (peerPubkey, ciphertext) =>
      text(
        await client.request("nip04_decrypt", {
          pubkey: peerPubkey,
          ciphertext,
        }),
        "nip04_decrypt",
      ),
  },
});
