import { describe, expect, it } from "vite-plus/test";
import {
  emptyAppletLibrary,
  installApplet,
  isInstalled,
  parseAppletLibrary,
  serializeAppletLibrary,
  setIntentDefault,
  uninstallApplet,
} from "./library";

const ALICE = "a".repeat(64);
const BOB = "b".repeat(64);
const profile = { pubkey: ALICE, identifier: "profile" };
const feed = { pubkey: BOB, identifier: "feed" };

describe("アップレットのインストール", () => {
  it("新しく入れたものを先頭に置く", () => {
    const library = installApplet(
      installApplet(emptyAppletLibrary(), profile, 100),
      feed,
      200,
    );
    expect(library.installed.map((item) => item.identifier)).toEqual([
      "feed",
      "profile",
    ]);
    expect(isInstalled(library, profile)).toBe(true);
  });

  it("入っているものをもう一度入れても増やさず、見つけたリレーだけを足す", () => {
    const first = installApplet(
      emptyAppletLibrary(),
      { ...profile, relays: ["wss://a.example/"] },
      100,
    );
    const again = installApplet(
      first,
      { ...profile, relays: ["wss://a.example/", "wss://b.example/"] },
      200,
    );
    expect(again.installed).toEqual([
      {
        ...profile,
        relays: ["wss://a.example/", "wss://b.example/"],
        installedAt: 100,
      },
    ]);
    expect(installApplet(again, profile, 300)).toBe(again);
  });

  it("外したアップレットを既定にしていた役割は、既定を消す", () => {
    let library = installApplet(emptyAppletLibrary(), profile, 100);
    library = setIntentDefault(library, "profile", {
      type: "applet",
      ...profile,
    });
    library = setIntentDefault(library, "note", { type: "streets" });
    library = uninstallApplet(library, profile);
    expect(library.installed).toEqual([]);
    expect(library.defaults).toEqual({ note: { type: "streets" } });
  });

  it("既定には住所だけを保存する", () => {
    const library = setIntentDefault(emptyAppletLibrary(), "profile", {
      type: "applet",
      ...{ ...profile, relays: ["wss://a.example/"], installedAt: 1 },
    });
    expect(library.defaults).toEqual({
      profile: { type: "applet", ...profile },
    });
  });

  it("既定を消すと、その役割の欄が無くなる", () => {
    const library = setIntentDefault(
      setIntentDefault(emptyAppletLibrary(), "note", { type: "streets" }),
      "note",
      undefined,
    );
    expect(library.defaults).toEqual({});
  });
});

describe("保存の形", () => {
  it("書いたものを読み戻せる", () => {
    const library = setIntentDefault(
      installApplet(emptyAppletLibrary(), profile, 100),
      "profile",
      { type: "applet", ...profile },
    );
    expect(parseAppletLibrary(serializeAppletLibrary(library))).toEqual(
      library,
    );
  });

  it("知らない版や壊れた中身は読まない", () => {
    expect(
      parseAppletLibrary('{"version":2,"installed":[],"defaults":{}}'),
    ).toBeUndefined();
    expect(parseAppletLibrary("{")).toBeUndefined();
    expect(
      parseAppletLibrary(
        '{"version":1,"installed":[{"pubkey":"x","identifier":"a","installedAt":1}],"defaults":{}}',
      ),
    ).toBeUndefined();
  });
});
