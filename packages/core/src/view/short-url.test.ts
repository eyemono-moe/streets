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

describe("shortenUrl: 符号化された文字", () => {
  it("戻してから 20 文字を数える", () => {
    // 捕まえる変異: 戻す前の %XX の並びで数える（日本語のパスがすぐ切れる）
    expect(
      shortenUrl(
        "https://ja.wikipedia.org/wiki/%E6%9D%B1%E4%BA%AC%E9%83%BD%E5%BA%81%E8%88%8E",
      ),
    ).toBe("https://ja.wikipedia.org/wiki/東京都庁舎");
    expect(
      shortenUrl(
        "https://example.com/%E3%81%82%E3%81%84%E3%81%86%E3%81%88%E3%81%8A%E3%81%8B%E3%81%8D%E3%81%8F%E3%81%91%E3%81%93%E3%81%95%E3%81%97%E3%81%99%E3%81%9B%E3%81%9D%E3%81%9F%E3%81%A1%E3%81%A4%E3%81%A6%E3%81%A8%E3%81%AA",
      ),
    ).toBe("https://example.com/あいうえおかきくけこさしすせそたちつて…");
  });

  it("絵文字を途中で割らない", () => {
    // 捕まえる変異: UTF-16 やコードポイントの単位で切る（20 文字目の絵文字が壊れる）
    const tail = `/${"a".repeat(18)}🏙️x`;
    expect(shortenUrl(`https://example.com${encodeURI(tail)}`)).toBe(
      `https://example.com/${"a".repeat(18)}🏙️…`,
    );
  });

  it("戻せない符号はそのまま出す", () => {
    expect(shortenUrl("https://example.com/%E6%9D")).toBe(
      "https://example.com/%E6%9D",
    );
  });

  it("空白や書字方向の制御文字に戻るものは戻さない", () => {
    // 捕まえる変異: 何でも戻す（右から左への上書き文字で、見えている URL と飛び先がずれる）
    expect(shortenUrl("https://example.com/a%E2%80%AEb")).toBe(
      "https://example.com/a%E2%80%AEb",
    );
    expect(shortenUrl("https://example.com/a%20b")).toBe(
      "https://example.com/a%20b",
    );
  });

  it("区切りの意味を持つ %2F や %23 は戻さない", () => {
    expect(shortenUrl("https://example.com/a%2Fb%23c")).toBe(
      "https://example.com/a%2Fb%23c",
    );
  });
});
