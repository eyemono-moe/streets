import { secp256k1 } from "@noble/curves/secp256k1.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import type { ConnectionPool } from "../../read/connection-pool";
import { normalizeRelayUrl } from "../../relay/relay-url";
import type { Signer } from "../signer";
import { type BunkerConnection, MAX_NIP46_RELAYS } from "./bunker-uri";
import {
  type Nip46Client,
  type Nip46ClientHooks,
  createNip46Client,
} from "./client";
import { createNip46Signer } from "./nip46-signer";
import type { StoredNip46SessionV1 } from "./session-storage";

const HEX64 = /^[0-9a-f]{64}$/;

export type Nip46Session = {
  client: Nip46Client;
  signer: Signer;
  userPubkey: string;
  stored: StoredNip46SessionV1;
};

const parseRelaySwitch = (result: string): string[] | undefined => {
  try {
    const value: unknown = JSON.parse(result);
    if (!Array.isArray(value) || value.length === 0) return undefined;
    const normalized = value.map((item) =>
      typeof item === "string" ? normalizeRelayUrl(item) : undefined,
    );
    if (
      normalized.some((relay) => relay === undefined) ||
      new Set(normalized).size !== normalized.length ||
      normalized.length > MAX_NIP46_RELAYS
    ) {
      return undefined;
    }
    return normalized as string[];
  } catch {
    return undefined;
  }
};

const finishSession = async (
  client: Nip46Client,
  clientSecret: Uint8Array,
  remoteSignerPubkey: string,
  fallbackRelays: readonly string[],
): Promise<Nip46Session> => {
  const userPubkey = await client.request("get_public_key");
  if (!HEX64.test(userPubkey)) throw new Error("invalid user public key");

  let relays = [...fallbackRelays];
  try {
    const switched = parseRelaySwitch(await client.request("switch_relays"));
    if (switched && client.switchRelays(switched)) relays = switched;
  } catch {
    // connect 自体は成立済み。切替だけの失敗では初期 relay を維持する。
  }
  const stored: StoredNip46SessionV1 = {
    version: 1,
    clientSecret: bytesToHex(clientSecret),
    remoteSignerPubkey,
    userPubkey,
    relays,
  };
  return {
    client,
    signer: createNip46Signer(client, userPubkey),
    userPubkey,
    stored,
  };
};

export const connectNip46 = async (options: {
  pool: ConnectionPool;
  bunker: BunkerConnection;
  hooks?: Nip46ClientHooks;
  metadataUrl: string;
}): Promise<Nip46Session> => {
  const clientSecret = secp256k1.utils.randomSecretKey();
  const client = createNip46Client({
    pool: options.pool,
    clientSecret,
    remoteSignerPubkey: options.bunker.remoteSignerPubkey,
    relays: options.bunker.relays,
    hooks: options.hooks,
  });
  try {
    await client.request("connect", [
      options.bunker.remoteSignerPubkey,
      options.bunker.secret ?? "",
      "sign_event:1",
      JSON.stringify({ name: "streets", url: options.metadataUrl }),
    ]);
    const session = await finishSession(
      client,
      clientSecret,
      options.bunker.remoteSignerPubkey,
      options.bunker.relays,
    );
    return session;
  } catch (error) {
    client.close();
    throw error;
  }
};

export const restoreNip46 = async (options: {
  pool: ConnectionPool;
  stored: StoredNip46SessionV1;
  hooks?: Nip46ClientHooks;
}): Promise<Nip46Session> => {
  const clientSecret = hexToBytes(options.stored.clientSecret);
  const client = createNip46Client({
    pool: options.pool,
    clientSecret,
    remoteSignerPubkey: options.stored.remoteSignerPubkey,
    relays: options.stored.relays,
    hooks: options.hooks,
  });
  try {
    if ((await client.request("ping")) !== "pong") {
      throw new Error("remote signer did not answer ping");
    }
    const userPubkey = await client.request("get_public_key");
    if (userPubkey !== options.stored.userPubkey) {
      throw new Error("remote signer user changed");
    }
    return {
      client,
      signer: createNip46Signer(client, userPubkey),
      userPubkey,
      stored: options.stored,
    };
  } catch (error) {
    client.close();
    throw error;
  }
};
