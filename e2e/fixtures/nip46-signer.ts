import { type Event, type EventTemplate, Relay } from "nostr-tools";
import { decrypt, encrypt, getConversationKey } from "nostr-tools/nip44";
import { finalizeEvent, getPublicKey } from "nostr-tools/pure";

const secretKey = (seed: number) =>
  Uint8Array.from(
    Array.from({ length: 32 }, (_, i) => ((seed + i * 7) % 255) + 1),
  );

const remoteSecret = secretKey(90_002);
const userSecret = secretKey(90_003);
export const nip46RemotePubkey = getPublicKey(remoteSecret);
export const nip46UserPubkey = getPublicKey(userSecret);
export const nip46RelayUrl =
  process.env.STREETS_E2E_RELAY_URL ?? "ws://127.0.0.1:8080";

type RpcRequest = { id: string; method: string; params: string[] };

export type Nip46SignerFixture = {
  bunkerUri: string;
  connectPermissions: Promise<string>;
  close(): void;
};

export const startNip46Signer = async (): Promise<Nip46SignerFixture> => {
  const relay = await Relay.connect(nip46RelayUrl);
  const clients = new Set<string>();
  let resolveConnectPermissions = (_permissions: string) => {};
  const connectPermissions = new Promise<string>((resolve) => {
    resolveConnectPermissions = resolve;
  });

  const respond = async (
    clientPubkey: string,
    response: { id: string; result?: string; error?: string },
  ) => {
    const key = getConversationKey(remoteSecret, clientPubkey);
    await relay.publish(
      finalizeEvent(
        {
          kind: 24_133,
          created_at: Math.floor(Date.now() / 1_000),
          tags: [["p", clientPubkey]],
          content: encrypt(JSON.stringify(response), key),
        },
        remoteSecret,
      ),
    );
  };

  const subscription = relay.subscribe(
    [{ kinds: [24_133], "#p": [nip46RemotePubkey] }],
    {
      onevent: (event: Event) => {
        void (async () => {
          const key = getConversationKey(remoteSecret, event.pubkey);
          let request: RpcRequest;
          try {
            request = JSON.parse(decrypt(event.content, key));
          } catch {
            return;
          }

          if (request.method === "connect") {
            resolveConnectPermissions(request.params[2] ?? "");
            clients.add(event.pubkey);
            await respond(event.pubkey, { id: request.id, result: "ack" });
            return;
          }
          if (!clients.has(event.pubkey)) {
            await respond(event.pubkey, {
              id: request.id,
              error: "session not connected",
            });
            return;
          }
          if (request.method === "ping") {
            await respond(event.pubkey, { id: request.id, result: "pong" });
          } else if (request.method === "get_public_key") {
            await respond(event.pubkey, {
              id: request.id,
              result: nip46UserPubkey,
            });
          } else if (request.method === "switch_relays") {
            await respond(event.pubkey, {
              id: request.id,
              result: JSON.stringify([nip46RelayUrl]),
            });
          } else if (request.method === "sign_event") {
            const template = JSON.parse(
              request.params[0] ?? "",
            ) as EventTemplate;
            await respond(event.pubkey, {
              id: request.id,
              result: JSON.stringify(finalizeEvent(template, userSecret)),
            });
          } else if (request.method === "nip44_encrypt") {
            const peerPubkey = request.params[0] ?? "";
            const plaintext = request.params[1] ?? "";
            const conversationKey = getConversationKey(userSecret, peerPubkey);
            await respond(event.pubkey, {
              id: request.id,
              result: encrypt(plaintext, conversationKey),
            });
          } else if (request.method === "nip44_decrypt") {
            const peerPubkey = request.params[0] ?? "";
            const ciphertext = request.params[1] ?? "";
            const conversationKey = getConversationKey(userSecret, peerPubkey);
            await respond(event.pubkey, {
              id: request.id,
              result: decrypt(ciphertext, conversationKey),
            });
          } else if (request.method === "logout") {
            clients.delete(event.pubkey);
            await respond(event.pubkey, { id: request.id, result: "ack" });
          } else {
            await respond(event.pubkey, {
              id: request.id,
              error: "unsupported method",
            });
          }
        })();
      },
    },
  );
  return {
    bunkerUri: `bunker://${nip46RemotePubkey}?relay=${encodeURIComponent(nip46RelayUrl)}&secret=e2e-once`,
    connectPermissions,
    close() {
      subscription.close();
      relay.close();
    },
  };
};
