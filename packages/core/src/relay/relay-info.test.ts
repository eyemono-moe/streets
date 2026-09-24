import { describe, expect, it } from "vite-plus/test";
import type { RelayUrl } from "./relay-connection";
import { fetchRelayInfo, parseRelayInfo, relayInfoUrl } from "./relay-info";

const ADMIN = "a".repeat(64);

describe("parseRelayInfo", () => {
  it("名前・説明・管理者・連絡先・アイコンを読む", () => {
    expect(
      parseRelayInfo({
        name: " yabu.me ",
        description: "日本のリレー",
        pubkey: ADMIN,
        contact: "admin@example.com",
        icon: "https://example.com/icon.png",
        supported_nips: [1, 11],
      }),
    ).toEqual({
      name: "yabu.me",
      description: "日本のリレー",
      pubkey: ADMIN,
      contact: "admin@example.com",
      icon: "https://example.com/icon.png",
    });
  });

  it("型が崩れた項目だけを捨てる", () => {
    expect(
      parseRelayInfo({ name: "ok", pubkey: "npub1xyz", icon: 42 }),
    ).toEqual({ name: "ok" });
  });

  it("http のアイコンは使わない（https の画面から読めない）", () => {
    expect(parseRelayInfo({ icon: "http://example.com/i.png" })).toEqual({});
  });

  it("空の文字列は書いていないのと同じ", () => {
    expect(parseRelayInfo({ name: "", description: "  " })).toEqual({});
  });

  it("オブジェクトでなければ読まない", () => {
    expect(parseRelayInfo("<html>")).toBeUndefined();
    expect(parseRelayInfo(null)).toBeUndefined();
  });
});

describe("relayInfoUrl", () => {
  it("wss は https、ws は http へ読み替える", () => {
    expect(relayInfoUrl("wss://nos.lol/" as RelayUrl)).toBe("https://nos.lol/");
    expect(relayInfoUrl("ws://localhost:8080/" as RelayUrl)).toBe(
      "http://localhost:8080/",
    );
  });
});

describe("fetchRelayInfo", () => {
  it("nostr+json を求め、答えを読む", async () => {
    let accept: string | null = null;
    const info = await fetchRelayInfo(
      "wss://nos.lol/" as RelayUrl,
      (async (_url: string, init?: RequestInit) => {
        accept = new Headers(init?.headers).get("Accept");
        return new Response(JSON.stringify({ name: "nos.lol" }));
      }) as typeof fetch,
    );
    expect(accept).toBe("application/nostr+json");
    expect(info).toEqual({ name: "nos.lol" });
  });

  it("失敗は undefined にする（例外にしない）", async () => {
    const failing = (async () => {
      throw new TypeError("Failed to fetch");
    }) as typeof fetch;
    const notFound = (async () =>
      new Response("", { status: 404 })) as typeof fetch;
    await expect(
      fetchRelayInfo("wss://a/" as RelayUrl, failing),
    ).resolves.toBeUndefined();
    await expect(
      fetchRelayInfo("wss://a/" as RelayUrl, notFound),
    ).resolves.toBeUndefined();
  });
});
