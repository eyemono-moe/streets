import { type EventTemplate, Relay, kinds } from "nostr-tools";
import { finalizeEvent, getPublicKey } from "nostr-tools/pure";

export const localRelayUrl =
  process.env.STREETS_E2E_RELAY_URL ?? "ws://127.0.0.1:8080";
export const seededNoteText = "streets local e2e seeded note";

const now = 1_735_689_600;
const viewerSecretKey = Uint8Array.from(
  Array.from({ length: 32 }, (_, index) => index + 1),
);
const authorSecretKey = Uint8Array.from(
  Array.from({ length: 32 }, (_, index) => 32 - index),
);

export const e2eViewerPubkey = getPublicKey(viewerSecretKey);
export const e2eAuthorPubkey = getPublicKey(authorSecretKey);

const sign = (template: EventTemplate, secretKey: Uint8Array) =>
  finalizeEvent(template, secretKey);

export const createSmokeSeedEvents = () => {
  const profile = sign(
    {
      kind: kinds.Metadata,
      created_at: now,
      tags: [],
      content: JSON.stringify({
        name: "streets-e2e-author",
        display_name: "streets e2e author",
      }),
    },
    authorSecretKey,
  );

  const note = sign(
    {
      kind: kinds.ShortTextNote,
      created_at: now + 1,
      tags: [["t", "streets-e2e"]],
      content: seededNoteText,
    },
    authorSecretKey,
  );

  const contacts = sign(
    {
      kind: kinds.Contacts,
      created_at: now + 2,
      tags: [["p", e2eAuthorPubkey]],
      content: "",
    },
    viewerSecretKey,
  );

  const emptyContentRepost = sign(
    {
      kind: kinds.Repost,
      created_at: now + 3,
      tags: [
        ["e", note.id, localRelayUrl],
        ["p", e2eAuthorPubkey],
      ],
      content: "",
    },
    viewerSecretKey,
  );

  return [profile, note, contacts, emptyContentRepost];
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const connectWithRetry = async () => {
  const attempts = 30;
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await Relay.connect(localRelayUrl);
    } catch (error) {
      lastError = error;
      await delay(500);
    }
  }

  throw lastError;
};

export const seedLocalRelay = async () => {
  const relay = await connectWithRetry();
  try {
    for (const event of createSmokeSeedEvents()) {
      await relay.publish(event);
    }
  } finally {
    relay.close();
  }
};

if (import.meta.url === `file://${process.argv[1]}`) {
  await seedLocalRelay();
}
