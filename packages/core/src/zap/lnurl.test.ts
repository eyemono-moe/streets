import { bech32 } from "@scure/base";
import { describe, expect, it } from "vitest";
import { parseZapPayInfo, zapEndpointOf } from "./lnurl";

const lnurlOf = (url: string) =>
  bech32.encode("lnurl", bech32.toWords(new TextEncoder().encode(url)), 2000);

describe("zapEndpointOf", () => {
  it("ライトニングアドレスを .well-known/lnurlp の URL にする", () => {
    const endpoint = zapEndpointOf(
      JSON.stringify({ lud16: "Me@Wallet.Example" }),
    );
    expect(endpoint?.url).toBe("https://wallet.example/.well-known/lnurlp/me");
    expect(endpoint?.lnurl).toBe(
      lnurlOf("https://wallet.example/.well-known/lnurlp/me"),
    );
  });

  it("lud06 の LNURL を読む", () => {
    const lnurl = lnurlOf("https://pay.example/lnurlp/abc");
    expect(
      zapEndpointOf(JSON.stringify({ lud06: lnurl.toUpperCase() })),
    ).toEqual({
      url: "https://pay.example/lnurlp/abc",
      lnurl,
    });
  });

  it("lud16 を lud06 より優先し、lud16 が読めなければ lud06 を使う", () => {
    const lnurl = lnurlOf("https://pay.example/lnurlp/abc");
    expect(
      zapEndpointOf(
        JSON.stringify({ lud16: "me@wallet.example", lud06: lnurl }),
      )?.url,
    ).toBe("https://wallet.example/.well-known/lnurlp/me");
    expect(
      zapEndpointOf(JSON.stringify({ lud16: "壊れた", lud06: lnurl }))?.url,
    ).toBe("https://pay.example/lnurlp/abc");
  });

  it.each([
    [undefined],
    ["not json"],
    [JSON.stringify({ name: "me" })],
    [JSON.stringify({ lud16: "me" })],
    [JSON.stringify({ lud16: 42 })],
    [JSON.stringify({ lud06: lnurlOf("http://insecure.example/pay") })],
    [JSON.stringify({ lud06: "lnurl1invalid" })],
  ])("%s からは送り先が読めない", (content) => {
    expect(zapEndpointOf(content)).toBeUndefined();
  });
});

describe("parseZapPayInfo", () => {
  const info = {
    tag: "payRequest",
    callback: "https://wallet.example/lnurlp/me/callback",
    minSendable: 1_000,
    maxSendable: 10_000_000,
    allowsNostr: true,
    nostrPubkey: "a".repeat(64),
    commentAllowed: 255,
    metadata: "[]",
  };

  it("Zap に使う項目を読む", () => {
    expect(parseZapPayInfo(info)).toEqual({
      callback: info.callback,
      minSendable: 1_000,
      maxSendable: 10_000_000,
      nostrPubkey: "a".repeat(64),
      commentAllowed: 255,
    });
    expect(
      parseZapPayInfo({ ...info, commentAllowed: undefined })?.commentAllowed,
    ).toBe(0);
  });

  it.each<[unknown, string]>([
    [{ ...info, allowsNostr: false }, "Nostr の Zap を受け付けない"],
    [{ ...info, nostrPubkey: undefined }, "受領に署名する鍵が無い"],
    [{ ...info, tag: "withdrawRequest" }, "支払いの窓口でない"],
    [
      { ...info, callback: "http://wallet.example/cb" },
      "callback が https でない",
    ],
    [{ ...info, minSendable: 10, maxSendable: 1 }, "金額の範囲が逆"],
  ])("%o は使わない（%s）", (json) => {
    // 捕まえる変異: allowsNostr を見ない（受領が届かないただの支払いになる）
    expect(parseZapPayInfo(json)).toBeUndefined();
  });
});
