import { schnorr } from "@noble/curves/secp256k1.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import type { NostrEvent } from "@streets/core/nostr/event";
import { createFakeSigner } from "@streets/core/signer/fake-signer";
import { RELAY_URL } from "./env";
import { publish } from "./relay";

export type Template = {
  kind: number;
  tags?: string[][];
  content?: string;
  created_at?: number;
};

export type User = {
  name: string;
  secretKey: Uint8Array;
  secretHex: string;
  pubkey: string;
  sign(template: Template): Promise<NostrEvent>;
  /** 別のクライアントから書いたことにして、リレーへ直接送る。 */
  post(template: Template): Promise<NostrEvent>;
};

const now = () => Math.floor(Date.now() / 1000);

/**
 * テストごとに新しい鍵を作る。リレーは走らせている間ずっと同じものを使うので、
 * 鍵を分けることでテスト同士の状態を分ける。
 */
export const createUser = async (name: string): Promise<User> => {
  const secretKey = schnorr.utils.randomSecretKey();
  const signer = createFakeSigner(secretKey);
  const pubkey = await signer.getPublicKey();
  const sign = (template: Template) =>
    signer.signEvent({
      pubkey,
      kind: template.kind,
      tags: template.tags ?? [],
      content: template.content ?? "",
      created_at: template.created_at ?? now(),
    });
  const user: User = {
    name,
    secretKey,
    secretHex: bytesToHex(secretKey),
    pubkey,
    sign,
    post: async (template) => {
      const event = await sign(template);
      await publish(event);
      return event;
    },
  };
  await user.post({ kind: 0, content: JSON.stringify({ name }) });
  await user.post({ kind: 10002, tags: [["r", RELAY_URL]] });
  return user;
};
