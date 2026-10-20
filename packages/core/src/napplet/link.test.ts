import { describe, expect, it } from "vite-plus/test";
import { encodeBech32 } from "../nostr/nip19";
import { parseLinkUrl } from "./link";

describe("parseLinkUrl", () => {
  // NAP-LINK の「Open an external page」の例。
  it("Web のページは、開く URL とホスト名にする", () => {
    expect(parseLinkUrl("https://example.com/post/123")).toEqual({
      ok: true,
      target: {
        type: "web",
        url: "https://example.com/post/123",
        hostname: "example.com",
      },
    });
  });

  // > Shells SHOULD treat IDN, punycode, redirects, and lookalike hostnames as phishing risks
  it("国際化ドメインは punycode のホスト名で見せる", () => {
    const result = parseLinkUrl("https://exаmple.com/");
    expect(
      result.ok && result.target.type === "web" && result.target.hostname,
    ).toBe("xn--exmple-4nf.com");
  });

  // > The shell MUST reject relative URLs.
  // > The shell MUST reject `javascript:`, `data:`, `blob:`, `file:`, and other local or
  // > code-bearing schemes.
  it("相対の URL と、手元やコードを指す scheme は断る", () => {
    expect(parseLinkUrl("/post/123")).toEqual({
      ok: false,
      error: "invalid-url",
    });
    for (const url of [
      "javascript:alert(1)",
      "data:text/html,hi",
      "blob:https://example.com/x",
      "file:///etc/passwd",
    ]) {
      expect(parseLinkUrl(url)).toEqual({
        ok: false,
        error: "unsupported-scheme",
      });
    }
  });

  // > The shell MAY support non-web schemes such as `nostr:` ... by policy.
  it("nostr: は Streets で開くものとして読み、読めない中身は断る", () => {
    const npub = encodeBech32("npub", "a".repeat(64));
    expect(parseLinkUrl(`nostr:${npub}`)).toEqual({
      ok: true,
      target: { type: "nostr", entity: npub },
    });
    expect(parseLinkUrl("nostr:npub1broken")).toEqual({
      ok: false,
      error: "invalid-url",
    });
  });
});
