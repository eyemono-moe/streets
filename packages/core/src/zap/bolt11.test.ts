import { describe, expect, it } from "vite-plus/test";
import { bolt11AmountMsat } from "./bolt11";

// BOLT-11 の仕様書の例（金額の部分だけを読むので、後ろのデータは省略してよい）
describe("bolt11AmountMsat", () => {
  it.each([
    ["lnbc2500u1pvjluezpp5qqqsyqcyq5rqwzqfqqq", 250_000_000],
    ["lnbc20m1pvjluezpp5qqqsyqcyq5rqwzqfqqq", 2_000_000_000],
    ["lnbc9678785340p1pwmna7lpp5gc3xfm08u9qy06", 967_878_534],
    ["lnbc10n1pvjluezpp5qqq", 1_000],
    [
      "lntb20m1pvjluezhp58yjmdan79s6qqdhdzgynm4zwqd5d7xmw5fk98klysy043l2ahrqs",
      2_000_000_000,
    ],
    ["LNBC100U1PVJLUEZ", 10_000_000],
    ["lightning:lnbc100u1pvjluez", 10_000_000],
  ])("%s は %i msat", (invoice, msat) => {
    expect(bolt11AmountMsat(invoice)).toBe(msat);
  });

  it.each([
    ["lnbc1pvjluezpp5qqqsyqcyq5rqwzqfqqq", "金額が無い"],
    ["lnbc1234567p1pvjluez", "ミリサトシに割り切れない"],
    ["lnxx100u1pvjluez", "知らない通貨"],
    ["not-an-invoice", "請求書でない"],
    ["lnbc0100u1pvjluez", "先頭が 0"],
  ])("%s は読まない（%s）", (invoice) => {
    // 捕まえる変異: 読めない請求書を 0 や別の金額として扱う（違う金額を払わせる）
    expect(bolt11AmountMsat(invoice)).toBeUndefined();
  });
});
