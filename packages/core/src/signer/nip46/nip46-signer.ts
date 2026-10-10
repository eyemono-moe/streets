import {
  type NostrEvent,
  type UnsignedEvent,
  isNostrEvent,
  verifyEvent,
} from "../../nostr/event";
import type { Signer } from "../signer";
import { type Nip46Client, Nip46SignerRefusedError } from "./client";
import { assertNip46SignPermission, grantsSignEvent } from "./session-storage";

const HEX64 = /^[0-9a-f]{64}$/;

export class InvalidNip46SignatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidNip46SignatureError";
  }
}

/**
 * 接続したときに求めていない種類の署名を、署名器に断られた。繋ぎ直せば
 * 求め直せる。
 */
export class Nip46PermissionMissingError extends Error {
  constructor(readonly kind: number) {
    super(`remote signer refused sign_event:${kind} not granted at connect`);
    this.name = "Nip46PermissionMissingError";
  }
}

const sameTags = (left: string[][], right: string[][]): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

export const createNip46Signer = (
  client: Pick<Nip46Client, "request">,
  userPubkey: string,
  granted: string,
): Signer => {
  if (!HEX64.test(userPubkey)) {
    throw new InvalidNip46SignatureError("invalid user public key");
  }
  return {
    async getPublicKey() {
      return userPubkey;
    },
    async signEvent(template: UnsignedEvent): Promise<NostrEvent> {
      assertNip46SignPermission(template.kind);
      const { pubkey: _pubkey, ...withoutPubkey } = template;
      let result: string;
      try {
        result = await client.request("sign_event", [
          JSON.stringify(withoutPubkey),
        ]);
      } catch (error) {
        if (
          error instanceof Nip46SignerRefusedError &&
          !grantsSignEvent(granted, template.kind)
        ) {
          throw new Nip46PermissionMissingError(template.kind);
        }
        throw error;
      }
      let value: unknown;
      try {
        value = JSON.parse(result);
      } catch {
        throw new InvalidNip46SignatureError(
          "remote signer returned invalid JSON",
        );
      }
      if (!isNostrEvent(value) || !verifyEvent(value)) {
        throw new InvalidNip46SignatureError(
          "remote signer returned an invalid event",
        );
      }
      if (
        value.pubkey !== userPubkey ||
        value.created_at !== template.created_at ||
        value.kind !== template.kind ||
        value.content !== template.content ||
        !sameTags(value.tags, template.tags)
      ) {
        throw new InvalidNip46SignatureError(
          "remote signer changed the event being signed",
        );
      }
      return value;
    },
    nip44: {
      encrypt: (peerPubkey, plaintext) =>
        client.request("nip44_encrypt", [peerPubkey, plaintext]),
      decrypt: (peerPubkey, ciphertext) =>
        client.request("nip44_decrypt", [peerPubkey, ciphertext]),
    },
    nip04: {
      decrypt: (peerPubkey, ciphertext) =>
        client.request("nip04_decrypt", [peerPubkey, ciphertext]),
    },
  };
};
