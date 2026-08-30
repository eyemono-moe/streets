import { normalizeRelayUrl } from "../../relay/relay-url";

const HEX64 = /^[0-9a-f]{64}$/;
export const MAX_NIP46_RELAYS = 5;

export type BunkerConnection = {
  remoteSignerPubkey: string;
  relays: string[];
  secret?: string;
};

export class InvalidBunkerUriError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidBunkerUriError";
  }
}

export const parseBunkerUri = (input: string): BunkerConnection => {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new InvalidBunkerUriError("bunker URI を解析できません");
  }
  if (url.protocol !== "bunker:") {
    throw new InvalidBunkerUriError(
      "bunker:// から始まるURIを入力してください",
    );
  }
  if (url.username || url.password || url.port || url.hash) {
    throw new InvalidBunkerUriError("bunker URI に未対応の要素があります");
  }

  const remoteSignerPubkey = url.hostname.toLowerCase();
  if (!HEX64.test(remoteSignerPubkey)) {
    throw new InvalidBunkerUriError("remote signer の公開鍵が不正です");
  }

  const relays: string[] = [];
  for (const value of url.searchParams.getAll("relay")) {
    const normalized = normalizeRelayUrl(value);
    if (!normalized) {
      throw new InvalidBunkerUriError(
        "relay は ws:// または wss:// で指定してください",
      );
    }
    if (!relays.includes(normalized)) relays.push(normalized);
  }
  if (relays.length === 0) {
    throw new InvalidBunkerUriError("relay が1本以上必要です");
  }
  if (relays.length > MAX_NIP46_RELAYS) {
    throw new InvalidBunkerUriError(
      `relay は${MAX_NIP46_RELAYS}本までにしてください`,
    );
  }

  const secret = url.searchParams.get("secret");
  if (secret === "") {
    throw new InvalidBunkerUriError("secret が空です");
  }
  return {
    remoteSignerPubkey,
    relays,
    ...(secret === null ? {} : { secret }),
  };
};
