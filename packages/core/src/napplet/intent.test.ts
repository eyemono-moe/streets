import { describe, expect, it } from "vite-plus/test";
import {
  type IntentHandler,
  STREETS_HANDLER_ID,
  appletHandlerId,
  intentAvailability,
  intentCatalog,
  intentHandlers,
  parseIntentRequest,
  resolveIntent,
} from "./intent";
import {
  type AppletLibrary,
  emptyAppletLibrary,
  installApplet,
  setIntentDefault,
} from "./library";
import type { NappletManifest } from "./manifest";

const ALICE = "a".repeat(64);
const BOB = "b".repeat(64);
const CAROL = "c".repeat(64);

const manifest = (
  pubkey: string,
  identifier: string,
  archetypes: string[],
  intents: NappletManifest["intents"],
): NappletManifest => ({
  eventId: `${pubkey.slice(0, 4)}${identifier}`.padEnd(64, "0"),
  kind: 35129,
  pubkey,
  createdAt: 1,
  identifier,
  artifactHash: "e".repeat(64),
  description: identifier,
  title: identifier,
  servers: [],
  requires: [],
  optional: [],
  archetypes,
  intents,
  legacy: false,
});

const profileViewer = {
  applet: { pubkey: ALICE, identifier: "profile-viewer" },
  manifest: manifest(
    ALICE,
    "profile-viewer",
    ["profile"],
    [{ convention: "napplet:profile/open", params: ["pubkey"] }],
  ),
};
const profileEditor = {
  applet: { pubkey: BOB, identifier: "profile-editor" },
  manifest: manifest(
    BOB,
    "profile-editor",
    ["profile"],
    [
      { convention: "napplet:profile/open", params: [] },
      { convention: "napplet:profile/edit", params: [] },
    ],
  ),
};

const libraryOf = (
  ...applets: { applet: { pubkey: string; identifier: string } }[]
) =>
  applets.reduce<AppletLibrary>(
    (library, item) => installApplet(library, item.applet, 1),
    emptyAppletLibrary(),
  );

const request = (convention: string, extra: object = {}) => {
  const [, archetype, action] =
    /^napplet:([^/]+)\/(.+)$/.exec(convention) ?? [];
  return {
    archetype: archetype ?? "",
    action: action ?? "",
    convention,
    ...extra,
  };
};

const ids = (handlers: readonly IntentHandler[]) => handlers.map((h) => h.id);

describe("parseIntentRequest", () => {
  // NAP-INTENT: > The runtime MUST reject a normalized wire request when:
  // > - `convention` contains a query or fragment;
  // > - the convention archetype differs from `request.archetype`; or
  // > - the convention intent differs from `request.action`.
  it("慣習の名前と役割・依頼が食い違う要求を断る", () => {
    expect(
      parseIntentRequest(request("napplet:profile/open?pubkey=abc")).ok,
    ).toBe(false);
    expect(
      parseIntentRequest({
        archetype: "note",
        action: "open",
        convention: "napplet:profile/open",
      }).ok,
    ).toBe(false);
    expect(
      parseIntentRequest({
        archetype: "profile",
        action: "edit",
        convention: "napplet:profile/open",
      }).ok,
    ).toBe(false);
  });

  // NAP-INTENT の「Invoke a convention URI」の例をそのまま読ませる。
  it("仕様の例の要求を読む", () => {
    expect(
      parseIntentRequest({
        archetype: "profile",
        action: "open",
        convention: "napplet:profile/open",
        payload: { pubkey: "abc123..." },
      }),
    ).toEqual({
      ok: true,
      request: {
        archetype: "profile",
        action: "open",
        convention: "napplet:profile/open",
        payload: { pubkey: "abc123..." },
      },
    });
  });

  // > `IntentHandlerHint` accepts kind `35129` only.
  it("勧める受け手は名前付きの napplet の住所だけを受け付ける", () => {
    const base = request("napplet:map/open");
    expect(
      parseIntentRequest({
        ...base,
        handlerHint: { address: `35129:${CAROL}:map`, relays: ["wss://r/"] },
      }),
    ).toEqual({
      ok: true,
      request: {
        ...base,
        handlerHint: { address: `35129:${CAROL}:map`, relays: ["wss://r/"] },
      },
    });
    expect(
      parseIntentRequest({
        ...base,
        handlerHint: { address: `15129:${CAROL}:map` },
      }).ok,
    ).toBe(false);
  });
});

describe("intentCatalog と intentAvailability", () => {
  // > Its archetype segment MUST match a `z` value on the same manifest to be eligible
  // > for dispatch by that role.
  it("z に挙げていない役割の依頼は、その役割の候補にしない", () => {
    const stray = {
      applet: { pubkey: CAROL, identifier: "stray" },
      manifest: manifest(
        CAROL,
        "stray",
        ["feed"],
        [{ convention: "napplet:profile/open", params: [] }],
      ),
    };
    const catalog = intentCatalog([profileViewer, stray]);
    const availability = intentAvailability(
      catalog,
      libraryOf(profileViewer, stray),
      "profile",
    );
    expect(availability.candidates.map((c) => c.id)).toEqual([
      appletHandlerId(profileViewer.applet),
      STREETS_HANDLER_ID,
    ]);
  });

  it("候補には受け付ける依頼と、既定かどうかを添える", () => {
    const library = setIntentDefault(libraryOf(profileEditor), "profile", {
      type: "applet",
      ...profileEditor.applet,
    });
    const availability = intentAvailability(
      intentCatalog([profileEditor]),
      library,
      "profile",
    );
    expect(availability.hasDefault).toBe(true);
    expect(availability.candidates[0]).toEqual({
      id: appletHandlerId(profileEditor.applet),
      title: "profile-editor",
      actions: ["open", "edit"],
      conventions: ["napplet:profile/open", "napplet:profile/edit"],
      contracts: profileEditor.manifest.intents,
      isDefault: true,
    });
  });

  it("受け手のいる役割だけを一覧にする", () => {
    const handlers = intentHandlers(
      intentCatalog([profileViewer]),
      libraryOf(profileViewer),
    );
    expect(handlers.map((h) => h.archetype).sort()).toEqual([
      "article",
      "note",
      "profile",
    ]);
  });
});

describe("resolveIntent", () => {
  const catalog = intentCatalog([profileViewer, profileEditor]);
  const library = libraryOf(profileViewer, profileEditor);

  it("候補が 1 つなら、それで開く", () => {
    const result = resolveIntent(
      request("napplet:note/open"),
      catalog,
      library,
    );
    expect(result.type === "open" && result.handler.id).toBe(
      STREETS_HANDLER_ID,
    );
  });

  // > The runtime SHOULD offer a chooser when `handler` is `choose`, or when several
  // > candidates exist and no default is set.
  it("候補が複数で既定が無ければ、選ばせる", () => {
    const result = resolveIntent(
      request("napplet:profile/open"),
      catalog,
      library,
    );
    expect(result.type === "choose" && ids(result.candidates)).toEqual([
      appletHandlerId(profileViewer.applet),
      appletHandlerId(profileEditor.applet),
      STREETS_HANDLER_ID,
    ]);
  });

  it("既定が依頼を受け付けるなら、それで開く", () => {
    const result = resolveIntent(
      request("napplet:profile/open"),
      catalog,
      setIntentDefault(library, "profile", { type: "streets" }),
    );
    expect(result.type === "open" && result.handler.id).toBe(
      STREETS_HANDLER_ID,
    );
  });

  // > Handler resolution MUST match the requested stable convention by exact equality
  it("既定がその依頼を受け付けなければ、受け付けるものから決める", () => {
    const result = resolveIntent(
      request("napplet:profile/edit"),
      catalog,
      setIntentDefault(library, "profile", {
        type: "applet",
        ...profileViewer.applet,
      }),
    );
    expect(result.type === "open" && result.handler.id).toBe(
      appletHandlerId(profileEditor.applet),
    );
  });

  // > 1. An explicit authorized `handler` address or `handler: "choose"` selection.
  // > The runtime MUST NOT let a caller address a handler instance unless the user
  // > explicitly authorized that handler.
  it("choose や受け手の名指しは、既定があっても選ばせる", () => {
    const withDefault = setIntentDefault(library, "profile", {
      type: "streets",
    });
    for (const handler of ["choose", appletHandlerId(profileViewer.applet)]) {
      expect(
        resolveIntent(
          request("napplet:profile/open", { handler }),
          catalog,
          withDefault,
        ).type,
      ).toBe("choose");
    }
  });

  // > 3. The recommended handler, if policy permits and it supports the requested
  // >    archetype, action, and convention.
  it("勧められたものがインストール済みで受け付けるなら、それで開く", () => {
    const result = resolveIntent(
      request("napplet:profile/open", {
        handlerHint: {
          address: `35129:${BOB}:profile-editor`,
        },
      }),
      catalog,
      library,
    );
    expect(result.type === "open" && result.handler.id).toBe(
      appletHandlerId(profileEditor.applet),
    );
  });

  // > If it is not installed, the shell MAY resolve its signed event using the
  // > coordinate and relay hints and offer installation under its policy.
  it("勧められたものがインストールされていなければ、インストールを勧めて選ばせる", () => {
    const result = resolveIntent(
      request("napplet:map/open", {
        handlerHint: { address: `35129:${CAROL}:map`, relays: ["wss://r/"] },
      }),
      catalog,
      library,
    );
    expect(result).toEqual({
      type: "choose",
      candidates: [],
      suggested: {
        applet: { pubkey: CAROL, identifier: "map" },
        relays: ["wss://r/"],
      },
    });
  });

  it("受け手がいなければ断る", () => {
    expect(
      resolveIntent(request("napplet:emoji-list/open"), catalog, library),
    ).toEqual({ type: "error", error: "no handler" });
    expect(
      resolveIntent(request("napplet:note/edit"), catalog, library),
    ).toEqual({ type: "error", error: "unsupported convention" });
  });
});
