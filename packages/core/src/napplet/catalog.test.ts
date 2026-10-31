import { describe, expect, it } from "vite-plus/test";
import { catalogSnapshot } from "./catalog";
import { appletHandlerId } from "./intent";
import { emptyAppletLibrary, setIntentDefault } from "./library";
import type { NappletManifest } from "./manifest";

const A = "a".repeat(64);
const noteview = { pubkey: A, identifier: "noteview" };

const manifest = (
  overrides: Partial<NappletManifest> = {},
): NappletManifest => ({
  eventId: "b".repeat(64),
  kind: 35129,
  pubkey: A,
  createdAt: 1,
  identifier: "noteview",
  artifactHash: "c".repeat(64),
  description: "Displays a Nostr note.",
  title: "Note View",
  servers: [],
  requires: ["relay"],
  optional: ["theme"],
  archetypes: ["note"],
  intents: [{ convention: "napplet:note/open", params: ["id"] }],
  legacy: false,
  ...overrides,
});

describe("catalogSnapshot", () => {
  // NAP-CATALOG の「Get the current catalog」の例と同じ中身を返す。
  it("インストールしたアップレットを、確かめた身元と役割・依頼で並べる", () => {
    const snapshot = catalogSnapshot(
      [{ applet: noteview, manifest: manifest() }],
      emptyAppletLibrary(),
      new Set(),
    );
    const id = appletHandlerId(noteview);
    expect(snapshot).toEqual({
      napplets: [
        {
          id,
          identity: {
            kind: 35129,
            pubkey: A,
            eventId: "b".repeat(64),
            dTag: "noteview",
            artifactHash: "c".repeat(64),
          },
          title: "Note View",
          description: "Displays a Nostr note.",
          requires: ["relay"],
          optional: ["theme"],
          archetypes: [
            {
              archetype: "note",
              intents: [
                {
                  intent: "open",
                  convention: "napplet:note/open",
                  parameters: ["id"],
                },
              ],
            },
          ],
        },
      ],
      handlers: [{ archetype: "note", currentHandler: id }],
    });
  });

  // > When a required field cannot be verified ..., it MUST omit the entire napplet entry.
  it("マニフェストの届いていないものは並べない", () => {
    expect(
      catalogSnapshot([{ applet: noteview }], emptyAppletLibrary(), new Set())
        .napplets,
    ).toEqual([]);
  });

  // > A current handler is the napplet the runtime would select for an implicit archetype
  // > dispatch ... or null when no such target is available to report.
  it("Streets のカラムで開くか選ばせる役割は、受け手を null にする", () => {
    const entries = [{ applet: noteview, manifest: manifest() }];
    expect(
      catalogSnapshot(entries, emptyAppletLibrary(), new Set(["note"]))
        .handlers,
    ).toEqual([{ archetype: "note", currentHandler: null }]);
    expect(
      catalogSnapshot(
        entries,
        setIntentDefault(emptyAppletLibrary(), "note", {
          type: "applet",
          ...noteview,
        }),
        new Set(["note"]),
      ).handlers,
    ).toEqual([
      { archetype: "note", currentHandler: appletHandlerId(noteview) },
    ]);
  });

  // > roles with no matching intent have an empty `intents` list.
  it("依頼を挙げていない役割は、依頼の一覧を空にする", () => {
    const snapshot = catalogSnapshot(
      [
        {
          applet: noteview,
          manifest: manifest({ archetypes: ["feed"], intents: [] }),
        },
      ],
      emptyAppletLibrary(),
      new Set(),
    );
    expect(snapshot.napplets[0]?.archetypes).toEqual([
      { archetype: "feed", intents: [] },
    ]);
  });
});
