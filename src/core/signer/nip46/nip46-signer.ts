import {
  type NostrEvent,
  type UnsignedEvent,
  isNostrEvent,
  verifyEvent,
} from "../../nostr/event";
import type { Signer } from "../signer";
import type { Nip46Client } from "./client";

const HEX64 = /^[0-9a-f]{64}$/;

export class InvalidNip46SignatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidNip46SignatureError";
  }
}

const sameTags = (left: string[][], right: string[][]): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

export const createNip46Signer = (
  client: Pick<Nip46Client, "request">,
  userPubkey: string,
): Signer => {
  if (!HEX64.test(userPubkey)) {
    throw new InvalidNip46SignatureError("invalid user public key");
  }
  return {
    async getPublicKey() {
      return userPubkey;
    },
    async signEvent(template: UnsignedEvent): Promise<NostrEvent> {
      const { pubkey: _pubkey, ...withoutPubkey } = template;
      const result = await client.request("sign_event", [
        JSON.stringify(withoutPubkey),
      ]);
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
  };
};
