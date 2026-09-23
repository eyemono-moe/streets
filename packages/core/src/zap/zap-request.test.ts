import { describe, expect, it } from "vitest";
import type { NostrEvent } from "../nostr/event";
import {
  buildZapRequest,
  parseInvoiceResponse,
  zapInvoiceUrl,
} from "./zap-request";

const target = {
  id: "e".repeat(64),
  pubkey: "p".repeat(64),
  kind: 1,
  created_at: 1,
  tags: [],
  content: "",
  sig: "",
} as NostrEvent;
const endpoint = {
  url: "https://wallet.example/.well-known/lnurlp/me",
  lnurl: "lnurl1dp68gurn8ghj7",
};

describe("buildZapRequest", () => {
  it("NIP-57 の kind:9734 を組み立てる", () => {
    expect(
      buildZapRequest({
        target,
        endpoint,
        amountMsat: 100_000,
        relays: ["wss://a.example/", "wss://b.example/"],
        message: " ありがとう ",
      }),
    ).toEqual({
      kind: 9734,
      content: "ありがとう",
      tags: [
        ["relays", "wss://a.example/", "wss://b.example/"],
        ["amount", "100000"],
        ["lnurl", endpoint.lnurl],
        ["p", target.pubkey],
        ["e", target.id],
        ["k", "1"],
      ],
    });
  });
});

describe("zapInvoiceUrl", () => {
  const info = {
    callback: "https://wallet.example/cb?existing=1",
    minSendable: 1_000,
    maxSendable: 10_000_000,
    nostrPubkey: "a".repeat(64),
    commentAllowed: 10,
  };
  const zapRequest = { ...target, kind: 9734, content: "short" };

  it("金額・署名した依頼・lnurl を callback に足す", () => {
    const url = new URL(
      zapInvoiceUrl({ info, endpoint, amountMsat: 50_000, zapRequest }),
    );
    expect(url.searchParams.get("existing")).toBe("1");
    expect(url.searchParams.get("amount")).toBe("50000");
    expect(JSON.parse(url.searchParams.get("nostr") ?? "")).toEqual(zapRequest);
    expect(url.searchParams.get("lnurl")).toBe(endpoint.lnurl);
    expect(url.searchParams.get("comment")).toBe("short");
  });

  it("受け付ける文字数を超える一言は comment に入れない", () => {
    const url = new URL(
      zapInvoiceUrl({
        info,
        endpoint,
        amountMsat: 50_000,
        zapRequest: { ...zapRequest, content: "とても長いメッセージです" },
      }),
    );
    // 捕まえる変異: 文字数を見ずに入れる（受け付けないサーバーに断られる）
    expect(url.searchParams.has("comment")).toBe(false);
  });
});

describe("parseInvoiceResponse", () => {
  it("請求書か、断られた理由を返す", () => {
    expect(parseInvoiceResponse({ pr: "lnbc1..." })).toEqual({
      invoice: "lnbc1...",
    });
    expect(
      parseInvoiceResponse({ status: "ERROR", reason: "too small" }),
    ).toEqual({
      error: "too small",
    });
    expect(parseInvoiceResponse({})).toHaveProperty("error");
    expect(parseInvoiceResponse(null)).toHaveProperty("error");
  });
});
