import { describe, expect, it, vi } from "vitest";
import { fetchLinkCard } from "./fetch-card";

const html = (title: string) =>
  `<html><head><meta property="og:title" content="${title}"></head><body>`;

const page = (body: BodyInit, contentType = "text/html; charset=utf-8") =>
  new Response(body, { status: 200, headers: { "content-type": contentType } });

const redirect = (location: string) =>
  new Response(null, { status: 302, headers: { location } });

describe("fetchLinkCard", () => {
  it("リダイレクトを辿り、行き着いた URL をカードに入れる", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(redirect("/final"))
      .mockResolvedValueOnce(page(html("最後のページ")));
    const card = await fetchLinkCard(new URL("https://example.com/start"), {
      fetch,
    });
    expect(card).toMatchObject({
      url: "https://example.com/final",
      title: "最後のページ",
    });
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({ redirect: "manual" });
  });

  it("内部のアドレスへのリダイレクトは辿らない", async () => {
    // 捕まえる変異: 行き先を確かめずに辿る（公開 URL から内部へ飛ばされる）
    const fetch = vi.fn().mockResolvedValueOnce(redirect("http://127.0.0.1/"));
    expect(
      await fetchLinkCard(new URL("https://example.com/"), { fetch }),
    ).toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("リダイレクトが多すぎたら諦める", async () => {
    const fetch = vi.fn(async () => redirect("https://example.com/loop"));
    expect(
      await fetchLinkCard(new URL("https://example.com/"), {
        fetch,
        maxRedirects: 2,
      }),
    ).toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("HTML でなければ読まない", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(page("{}", "application/json"));
    expect(
      await fetchLinkCard(new URL("https://example.com/"), { fetch }),
    ).toBeUndefined();
  });

  it("上限を超えて読まない", async () => {
    let pulled = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1;
        controller.enqueue(new TextEncoder().encode("x".repeat(1024)));
      },
    });
    const fetch = vi.fn().mockResolvedValueOnce(page(stream));
    await fetchLinkCard(new URL("https://example.com/"), {
      fetch,
      maxBytes: 4 * 1024,
    });
    // 捕まえる変異: 上限を見ずに最後まで読む（巨大なページで止まらない）
    expect(pulled).toBeLessThan(10);
  });

  it("Shift_JIS のページも読める", async () => {
    // 「題名」を Shift_JIS にしたもの
    const bytes = new Uint8Array([
      ...new TextEncoder().encode(
        '<html><head><meta charset="Shift_JIS"><title>',
      ),
      0x91,
      0xe8,
      0x96,
      0xbc,
      ...new TextEncoder().encode("</title></head>"),
    ]);
    const fetch = vi.fn().mockResolvedValueOnce(page(bytes, "text/html"));
    expect(
      (await fetchLinkCard(new URL("https://example.com/"), { fetch }))?.title,
    ).toBe("題名");
  });
});
