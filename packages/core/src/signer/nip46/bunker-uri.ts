import { type Message, MessageError } from "../../i18n/message";
import { normalizeRelayUrl } from "../../relay/relay-url";

const HEX64 = /^[0-9a-f]{64}$/;
export const MAX_NIP46_RELAYS = 5;

export type BunkerConnection = {
  remoteSignerPubkey: string;
  relays: string[];
  secret?: string;
};

export class InvalidBunkerUriError extends MessageError {
  constructor(text: Message) {
    super(text);
    this.name = "InvalidBunkerUriError";
  }
}

export const parseBunkerUri = (input: string): BunkerConnection => {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new InvalidBunkerUriError({ key: "signer.bunker.unparsable" });
  }
  if (url.protocol !== "bunker:") {
    throw new InvalidBunkerUriError({ key: "signer.bunker.notBunker" });
  }
  if (url.username || url.password || url.port || url.hash) {
    throw new InvalidBunkerUriError({ key: "signer.bunker.unsupported" });
  }

  const remoteSignerPubkey = url.hostname.toLowerCase();
  if (!HEX64.test(remoteSignerPubkey)) {
    throw new InvalidBunkerUriError({ key: "signer.bunker.invalidPubkey" });
  }

  const relays: string[] = [];
  for (const value of url.searchParams.getAll("relay")) {
    const normalized = normalizeRelayUrl(value);
    if (!normalized) {
      throw new InvalidBunkerUriError({ key: "signer.bunker.relayScheme" });
    }
    if (!relays.includes(normalized)) relays.push(normalized);
  }
  if (relays.length === 0) {
    throw new InvalidBunkerUriError({ key: "signer.bunker.relayRequired" });
  }
  if (relays.length > MAX_NIP46_RELAYS) {
    throw new InvalidBunkerUriError({
      key: "signer.bunker.relayTooMany",
      args: { max: MAX_NIP46_RELAYS },
    });
  }

  const secret = url.searchParams.get("secret");
  if (secret === "") {
    throw new InvalidBunkerUriError({ key: "signer.bunker.secretEmpty" });
  }
  return {
    remoteSignerPubkey,
    relays,
    ...(secret === null ? {} : { secret }),
  };
};
