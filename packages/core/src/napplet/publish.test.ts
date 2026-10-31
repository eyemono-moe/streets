import { describe, expect, it } from "vite-plus/test";
import {
  emptyAppletLibrary,
  grantsOf,
  hasGrant,
  installApplet,
  setGrant,
  uninstallApplet,
} from "./library";
import {
  grantKey,
  overwritesState,
  parseGrantKey,
  parsePublishTemplate,
  rememberable,
} from "./publish";

const applet = { pubkey: "a".repeat(64), identifier: "feed" };

describe("parsePublishTemplate", () => {
  // @napplet/shim の relay.publish の例: { kind: 1, content: 'Hello Nostr!', tags: [], created_at }
  it("頼まれたイベントから、kind・タグ・本文だけを下書きにする", () => {
    expect(
      parsePublishTemplate(
        {
          kind: 1,
          content: "Hello Nostr!",
          tags: [["t", "nostr"]],
          created_at: 1,
          pubkey: "b".repeat(64),
          sig: "c".repeat(128),
        },
        "publish",
      ),
    ).toEqual({
      ok: true,
      draft: { kind: 1, content: "Hello Nostr!", tags: [["t", "nostr"]] },
    });
  });

  it("形の違うイベントは断る", () => {
    for (const raw of [
      null,
      { kind: 1.5, content: "", tags: [] },
      { kind: 1, content: 1, tags: [] },
      { kind: 1, content: "", tags: [["t", 1]] },
      { kind: 1, content: "", tags: [[]] },
    ]) {
      expect(parsePublishTemplate(raw, "publish").ok).toBe(false);
    }
  });

  it("本人として名乗る認証のイベントには署名しない", () => {
    for (const kind of [22242, 24133, 24242, 27235]) {
      expect(
        parsePublishTemplate({ kind, content: "", tags: [] }, "publish").ok,
      ).toBe(false);
    }
  });

  it("暗号文を運ぶ kind は、そのまま署名せず publishEncrypted に回させる", () => {
    const dm = { kind: 4, content: "abc?iv=def", tags: [] };
    expect(parsePublishTemplate(dm, "publish").ok).toBe(false);
    expect(parsePublishTemplate(dm, "publishEncrypted").ok).toBe(true);
  });
});

describe("確かめ方", () => {
  it("置き換える・消す書き込みは、覚えずに毎回確かめる", () => {
    expect(overwritesState(0)).toBe(true);
    expect(overwritesState(3)).toBe(true);
    expect(overwritesState(5)).toBe(true);
    expect(overwritesState(10002)).toBe(true);
    expect(overwritesState(30023)).toBe(true);
    expect(rememberable(1)).toBe(true);
    expect(rememberable(7)).toBe(true);
    expect(rememberable(3)).toBe(false);
  });

  it("覚えた書き込みはアップレットごとに持ち、外したアップレットの分は消す", () => {
    let library = installApplet(emptyAppletLibrary(), applet, 1);
    library = setGrant(library, applet, grantKey("publish", 1), true);
    expect(hasGrant(library, applet, "publish:1")).toBe(true);
    expect(
      hasGrant(library, { ...applet, identifier: "other" }, "publish:1"),
    ).toBe(false);
    expect(parseGrantKey("publishEncrypted:30078")).toEqual({
      operation: "publishEncrypted",
      kind: 30078,
    });
    expect(
      grantsOf(setGrant(library, applet, "publish:1", false), applet),
    ).toEqual([]);
    expect(uninstallApplet(library, applet).grants).toEqual({});
  });
});
