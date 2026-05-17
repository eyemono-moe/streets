import type { Page } from "@playwright/test";
import { type EventTemplate, Relay, kinds } from "nostr-tools";
import { finalizeEvent, getPublicKey } from "nostr-tools/pure";

export const localRelayUrl =
  process.env.STREETS_E2E_RELAY_URL ?? "ws://127.0.0.1:8080";
export const seededNoteText = "streets local e2e seeded note";
export const seededDuplicateNoteText = "streets local e2e duplicate check note";
export const e2eAuthorName = "streets-e2e-author";
export const e2eAuthorDisplayName = "streets e2e author";
export const e2eFollowerName = "streets-e2e-follower";
export const e2eFollowerDisplayName = "streets e2e follower";

const now = 1_735_689_600;
const viewerSecretKey = Uint8Array.from(
  Array.from({ length: 32 }, (_, index) => index + 1),
);
const authorSecretKey = Uint8Array.from(
  Array.from({ length: 32 }, (_, index) => 32 - index),
);
const followerSecretKey = Uint8Array.from(
  Array.from({ length: 32 }, (_, index) => index + 65),
);

export const e2eViewerPubkey = getPublicKey(viewerSecretKey);
export const e2eAuthorPubkey = getPublicKey(authorSecretKey);
export const e2eFollowerPubkey = getPublicKey(followerSecretKey);

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

  const viewerContacts = sign(
    {
      kind: kinds.Contacts,
      created_at: now + 2,
      tags: [["p", e2eAuthorPubkey]],
      content: "",
    },
    viewerSecretKey,
  );

  const authorContacts = sign(
    {
      kind: kinds.Contacts,
      created_at: now + 3,
      tags: [["p", e2eViewerPubkey]],
      content: "",
    },
    authorSecretKey,
  );

  const followerProfile = sign(
    {
      kind: kinds.Metadata,
      created_at: now + 4,
      tags: [],
      content: JSON.stringify({
        name: e2eFollowerName,
        display_name: e2eFollowerDisplayName,
      }),
    },
    followerSecretKey,
  );

  const followerContacts = sign(
    {
      kind: kinds.Contacts,
      created_at: now + 5,
      tags: [["p", e2eAuthorPubkey]],
      content: "",
    },
    followerSecretKey,
  );

  const duplicateCheckNote = sign(
    {
      kind: kinds.ShortTextNote,
      created_at: now + 5,
      tags: [["t", "streets-e2e"]],
      content: seededDuplicateNoteText,
    },
    authorSecretKey,
  );

  const emptyContentRepost = sign(
    {
      kind: kinds.Repost,
      created_at: now + 6,
      tags: [
        ["e", note.id, localRelayUrl],
        ["p", e2eAuthorPubkey],
      ],
      content: "",
    },
    viewerSecretKey,
  );

  return [
    profile,
    followerProfile,
    note,
    duplicateCheckNote,
    viewerContacts,
    authorContacts,
    followerContacts,
    emptyContentRepost,
  ];
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

export const setupSeededReadPath = async (
  page: Page,
  options: {
    columns?: { id: string; content: Record<string, unknown>; size?: string }[];
  } = {},
) => {
  await page.addInitScript(
    ({ authorPubkey, columns, relayUrl, viewerPubkey }) => {
      (window as typeof window & { nostr: unknown }).nostr = {
        getPublicKey: async () => viewerPubkey,
        getRelays: async () => ({
          [relayUrl]: { read: true, write: true },
        }),
        signEvent: async (event: Record<string, unknown>) => ({
          ...event,
          id: "playwright-nip07-mock-event-id",
          pubkey: viewerPubkey,
          sig: "playwright-nip07-mock-signature",
        }),
      };

      window.localStorage.setItem(
        "monostr.relays",
        JSON.stringify({
          version: "0.0",
          defaultRelays: {
            [relayUrl]: { read: true, write: true },
          },
        }),
      );
      window.localStorage.setItem(
        "monostr.deckState",
        JSON.stringify({
          version: 0,
          columns: columns ?? [
            {
              id: "local-e2e-user",
              size: "medium",
              content: { type: "user", pubkey: authorPubkey },
            },
          ],
          display: {
            theme: {
              accent: "#8340bb",
              ui: "#302070",
            },
            showLoading: false,
          },
        }),
      );
    },
    {
      authorPubkey: e2eAuthorPubkey,
      columns: options.columns,
      relayUrl: localRelayUrl,
      viewerPubkey: e2eViewerPubkey,
    },
  );
};

if (import.meta.url === `file://${process.argv[1]}`) {
  await seedLocalRelay();
}
