import type { Page } from "@playwright/test";
import { type EventTemplate, Relay, kinds } from "nostr-tools";
import { finalizeEvent, getPublicKey } from "nostr-tools/pure";

// spec からは import されなくなった (v0 を対象にしていた唯一の e2e を
// 削除したため)。このファイル内でシードの組み立てに使い続けるので残す。
const localRelayUrl =
  process.env.STREETS_E2E_RELAY_URL ?? "ws://127.0.0.1:8080";
const seededNoteText = "streets local e2e seeded note";
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
const debugTimelineSecretKeys = Array.from({ length: 12 }, (_, userIndex) =>
  Uint8Array.from(
    Array.from(
      { length: 32 },
      (_, byteIndex) => 96 + userIndex * 8 + byteIndex,
    ),
  ),
);
const debugFeedViewerSecretKey = Uint8Array.from(
  Array.from({ length: 32 }, (_, index) => 216 + index),
);
const createDeterministicSecretKey = (seed: number) =>
  Uint8Array.from(
    Array.from({ length: 32 }, (_, index) => ((seed + index * 73) % 255) + 1),
  );
const debugFeedMissingProfileSecretKeys = Array.from(
  { length: 40 },
  (_, index) => createDeterministicSecretKey(512 + index * 37),
);

const bytesToHex = (bytes: Uint8Array) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

export const e2eViewerPubkey = getPublicKey(viewerSecretKey);
export const e2eAuthorPubkey = getPublicKey(authorSecretKey);
export const e2eFollowerPubkey = getPublicKey(followerSecretKey);
export const e2eDebugTimelinePubkeys = debugTimelineSecretKeys.map(
  (secretKey) => getPublicKey(secretKey),
);
export const e2eDebugFeedViewerSecretKeyHex = bytesToHex(
  debugFeedViewerSecretKey,
);
export const e2eDebugFeedViewerPubkey = getPublicKey(debugFeedViewerSecretKey);
export const e2eDebugFeedMissingProfilePubkeys =
  debugFeedMissingProfileSecretKeys.map((secretKey) => getPublicKey(secretKey));

const sign = (template: EventTemplate, secretKey: Uint8Array) =>
  finalizeEvent(template, secretKey);

const createDebugTimelineSeedEvents = () => {
  const events = [];
  const debugViewerContacts = sign(
    {
      kind: kinds.Contacts,
      created_at: now + 20,
      tags: e2eDebugTimelinePubkeys.map((pubkey) => ["p", pubkey]),
      content: "",
    },
    viewerSecretKey,
  );
  events.push(debugViewerContacts);

  for (
    let userIndex = 0;
    userIndex < debugTimelineSecretKeys.length;
    userIndex++
  ) {
    const secretKey = debugTimelineSecretKeys[userIndex];
    const pubkey = getPublicKey(secretKey);
    const profile = sign(
      {
        kind: kinds.Metadata,
        created_at: now + 21 + userIndex,
        tags: [],
        content: JSON.stringify({
          name: `streets-debug-${userIndex}`,
          display_name: `streets debug ${userIndex}`,
        }),
      },
      secretKey,
    );
    events.push(profile);

    const previousNoteIds: string[] = [];
    for (let noteIndex = 0; noteIndex < 4; noteIndex++) {
      const note = sign(
        {
          kind: kinds.ShortTextNote,
          created_at: now + 100 + userIndex * 10 + noteIndex,
          tags:
            noteIndex === 0 || previousNoteIds.length === 0
              ? [["t", "streets-debug-timeline"]]
              : [
                  ["e", previousNoteIds[previousNoteIds.length - 1]],
                  ["p", pubkey],
                  ["t", "streets-debug-timeline"],
                ],
          content: `streets debug timeline note ${userIndex}-${noteIndex}`,
        },
        secretKey,
      );
      previousNoteIds.push(note.id);
      events.push(note);

      events.push(
        sign(
          {
            kind: kinds.Reaction,
            created_at: now + 300 + userIndex * 10 + noteIndex,
            tags: [
              ["e", note.id, localRelayUrl],
              ["p", pubkey],
              ["k", String(kinds.ShortTextNote)],
            ],
            content: "+",
          },
          viewerSecretKey,
        ),
      );

      events.push(
        sign(
          {
            kind: kinds.Repost,
            created_at: now + 500 + userIndex * 10 + noteIndex,
            tags: [
              ["e", note.id, localRelayUrl],
              ["p", pubkey],
            ],
            content: "",
          },
          viewerSecretKey,
        ),
      );

      events.push(
        sign(
          {
            kind: kinds.ShortTextNote,
            created_at: now + 700 + userIndex * 10 + noteIndex,
            tags: [
              ["q", note.id, localRelayUrl],
              ["p", pubkey],
              ["t", "streets-debug-timeline-quote"],
            ],
            content: `streets debug quote ${userIndex}-${noteIndex}`,
          },
          viewerSecretKey,
        ),
      );
    }
  }

  return events;
};

const createDebugFeedSeedEvents = () => {
  const events = [];

  const debugFeedViewerContacts = sign(
    {
      kind: kinds.Contacts,
      created_at: now + 1_000,
      tags: e2eDebugFeedMissingProfilePubkeys.map((pubkey) => ["p", pubkey]),
      content: "",
    },
    debugFeedViewerSecretKey,
  );
  events.push(debugFeedViewerContacts);

  for (
    let userIndex = 0;
    userIndex < debugFeedMissingProfileSecretKeys.length;
    userIndex++
  ) {
    const secretKey = debugFeedMissingProfileSecretKeys[userIndex];
    const pubkey = getPublicKey(secretKey);
    const noteCount = 8;

    // Intentionally omit kind:0 metadata for these authors. This stresses the
    // feed-plain-event path where EventBase and Avatar both request missing
    // author profiles and can expose profile query fanout.
    for (let noteIndex = 0; noteIndex < noteCount; noteIndex++) {
      const note = sign(
        {
          kind: kinds.ShortTextNote,
          created_at: now + 2_000 + userIndex * noteCount + noteIndex,
          tags: [["t", "streets-debug-feed-missing-profile"]],
          content: `streets debug feed missing profile ${userIndex}-${noteIndex}`,
        },
        secretKey,
      );
      events.push(note);

      events.push(
        sign(
          {
            kind: kinds.Reaction,
            created_at: now + 3_000 + userIndex * noteCount + noteIndex,
            tags: [
              ["e", note.id, localRelayUrl],
              ["p", pubkey],
              ["k", String(kinds.ShortTextNote)],
            ],
            content: "+",
          },
          debugFeedViewerSecretKey,
        ),
      );
    }
  }

  return events;
};

const logSeedDebugInfo = (eventCount: number) => {
  console.log(
    `[streets seed] published ${eventCount} events to ${localRelayUrl}`,
  );
  console.log("[streets seed] smoke viewer");
  console.log(`  pubkey: ${e2eViewerPubkey}`);
  console.log(`  seckey: ${bytesToHex(viewerSecretKey)}`);
  console.log("[streets seed] debug feed viewer");
  console.log(`  pubkey: ${e2eDebugFeedViewerPubkey}`);
  console.log(`  seckey: ${e2eDebugFeedViewerSecretKeyHex}`);
  console.log("[streets seed] debug feed followees without kind:0 metadata");
  for (const [index, pubkey] of e2eDebugFeedMissingProfilePubkeys.entries()) {
    console.log(`  ${index.toString().padStart(2, "0")}: ${pubkey}`);
  }
};

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
    ...createDebugTimelineSeedEvents(),
    ...createDebugFeedSeedEvents(),
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
  const events = createSmokeSeedEvents();
  try {
    for (const event of events) {
      await relay.publish(event);
    }
    logSeedDebugInfo(events.length);
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
