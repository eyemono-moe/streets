import { describe, expect, it } from "vite-plus/test";
import { shortenUrl } from "./short-url";

describe("shortenUrl", () => {
  it("ホストの後ろ（先頭の / を含む）が 20 文字以下ならそのまま返す", () => {
    // 捕まえる変異: 境界を < にして、ちょうど 20 文字の URL にも … を付ける
    expect(shortenUrl("https://example.com/1234567890123456789")).toBe(
      "https://example.com/1234567890123456789",
    );
    expect(shortenUrl("https://example.com/12345678901234567890")).toBe(
      "https://example.com/1234567890123456789…",
    );
  });

  it("ホストの後ろが 20 文字を超えたら 20 文字で切って … を付ける", () => {
    expect(
      shortenUrl("https://example.com/articles/2026/09/streets?ref=nostr#top"),
    ).toBe("https://example.com/articles/2026/09/st…");
  });

  it("ホストは長くても切らない", () => {
    expect(
      shortenUrl(
        "https://a-very-long-subdomain.of-some-long-host.example.co.jp:8443/short",
      ),
    ).toBe(
      "https://a-very-long-subdomain.of-some-long-host.example.co.jp:8443/short",
    );
  });

  it("パスが無くクエリで始まる URL もホストまでを残す", () => {
    expect(shortenUrl("http://example.com?q=aaaaaaaaaaaaaaaaaaaaaaaa")).toBe(
      "http://example.com?q=aaaaaaaaaaaaaaaaa…",
    );
  });
});
