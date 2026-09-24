import { describe, expect, it } from "vite-plus/test";
import { allowedTarget, charsetOf, parseLinkCard } from "./ogp";

const PAGE = new URL("https://example.com/articles/1");

describe("allowedTarget", () => {
  it("http と https の公開されたホストだけを通す", () => {
    expect(allowedTarget("https://example.com/a#frag")?.toString()).toBe(
      "https://example.com/a",
    );
    expect(allowedTarget("http://example.com:80/")).toBeDefined();
  });

  it.each([
    ["ftp://example.com/", "http 以外"],
    ["https://localhost/", "localhost"],
    ["https://printer.local/", ".local"],
    ["https://127.0.0.1/", "IPv4 の直打ち"],
    ["https://10.0.0.1/", "内部の IPv4"],
    ["https://[::1]/", "IPv6 の直打ち"],
    ["https://intranet/", "ドットの無いホスト"],
    ["https://example.com:8080/", "標準でないポート"],
    ["https://user:pass@example.com/", "認証情報つき"],
    ["not a url", "URL でない"],
  ])("%s は断る（%s）", (input) => {
    // 捕まえる変異: 内部のアドレスを通す（取得口が中を覗く踏み台になる）
    expect(allowedTarget(input)).toBeUndefined();
  });
});

describe("parseLinkCard", () => {
  it("OGP の題名・説明・画像・サイト名を読む", () => {
    const html = `<html><head>
      <meta property="og:title" content="記事の題名">
      <meta property="og:description" content="説明です">
      <meta property="og:image" content="https://cdn.example.com/a.png">
      <meta property="og:site_name" content="Example">
      </head><body></body></html>`;
    expect(parseLinkCard(html, PAGE)).toEqual({
      url: "https://example.com/articles/1",
      title: "記事の題名",
      description: "説明です",
      image: "https://cdn.example.com/a.png",
      siteName: "Example",
    });
  });

  it("OGP が無ければ title と description で補う", () => {
    const html = `<head><title> 題名 </title><meta name="description" content="説明"></head>`;
    expect(parseLinkCard(html, PAGE)).toMatchObject({
      title: "題名",
      description: "説明",
    });
  });

  it("属性の順番と引用符の種類を問わず、実体参照を戻す", () => {
    const html = `<head><meta content='A &amp; B &#x1F600;' property=og:title></head>`;
    expect(parseLinkCard(html, PAGE)?.title).toBe("A & B 😀");
  });

  it("画像の相対パスはページの URL から解決し、http の画像は捨てる", () => {
    const relative = `<head><meta property="og:title" content="t"><meta property="og:image" content="/img/a.png"></head>`;
    expect(parseLinkCard(relative, PAGE)?.image).toBe(
      "https://example.com/img/a.png",
    );
    const insecure = `<head><meta property="og:title" content="t"><meta property="og:image" content="http://example.com/a.png"></head>`;
    // 捕まえる変異: http の画像を返す（https の画面で混在コンテンツになる）
    expect(parseLinkCard(insecure, PAGE)?.image).toBeUndefined();
  });

  it("題名が無ければカードにしない", () => {
    expect(
      parseLinkCard(
        `<head><meta property="og:description" content="説明"></head>`,
        PAGE,
      ),
    ).toBeUndefined();
  });

  it("body に入った後の meta は読まない", () => {
    const html = `<head><title>本物</title></head><body><meta property="og:title" content="偽物"></body>`;
    expect(parseLinkCard(html, PAGE)?.title).toBe("本物");
  });

  it("長すぎる説明は切り詰める", () => {
    const html = `<head><meta property="og:title" content="t"><meta property="og:description" content="${"あ".repeat(1000)}"></head>`;
    expect(parseLinkCard(html, PAGE)?.description?.length).toBe(400);
  });
});

describe("charsetOf", () => {
  it("Content-Type を先に見て、無ければ meta charset を見る", () => {
    expect(charsetOf("text/html; charset=Shift_JIS", "")).toBe("shift_jis");
    expect(charsetOf("text/html", '<meta charset="EUC-JP">')).toBe("euc-jp");
    expect(
      charsetOf(
        "text/html",
        '<meta http-equiv="Content-Type" content="text/html; charset=utf-8">',
      ),
    ).toBe("utf-8");
    expect(charsetOf(null, "")).toBeUndefined();
  });
});
