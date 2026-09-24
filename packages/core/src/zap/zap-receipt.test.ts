import { schnorr } from "@noble/curves/secp256k1.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { describe, expect, it } from "vite-plus/test";
import { type NostrEvent, computeEventId } from "../nostr/event";
import { parseZapReceipt, zapSender } from "./zap-receipt";

const keyFor = (byte: number) => new Uint8Array(32).fill(byte);
const pub = (byte: number) => bytesToHex(schnorr.getPublicKey(keyFor(byte)));
const sign = (
  byte: number,
  fields: Pick<NostrEvent, "kind" | "tags" | "content">,
): NostrEvent => {
  const unsigned = { ...fields, pubkey: pub(byte), created_at: 1_700_000_000 };
  const id = computeEventId(unsigned);
  return {
    ...unsigned,
    id,
    sig: bytesToHex(schnorr.sign(hexToBytes(id), keyFor(byte))),
  };
};

const SENDER = 1;
const SERVER = 2;
const RECIPIENT = pub(3);
const TARGET = "e".repeat(64);
// 100 sats（BOLT-11 の仕様書の例の金額部分）
const INVOICE = "lnbc1u1pvjluezpp5qqqsyqcyq5rqwzqfqqq";

const request = (tags: string[][] = [], content = "ありがとう") =>
  sign(SENDER, {
    kind: 9734,
    content,
    tags: [
      ["relays", "wss://a.example/"],
      ["amount", "100000"],
      ["p", RECIPIENT],
      ["e", TARGET],
      ...tags,
    ],
  });

const receipt = (
  zapRequest: NostrEvent | string = request(),
  overrides: { tags?: string[][]; server?: number } = {},
) =>
  sign(overrides.server ?? SERVER, {
    kind: 9735,
    content: "",
    tags: overrides.tags ?? [
      ["p", RECIPIENT],
      ["e", TARGET],
      ["bolt11", INVOICE],
      [
        "description",
        typeof zapRequest === "string"
          ? zapRequest
          : JSON.stringify(zapRequest),
      ],
    ],
  });

describe("parseZapReceipt", () => {
  it("送った人・金額・一言・対象の投稿を読む", () => {
    expect(
      parseZapReceipt(receipt(), {
        recipient: RECIPIENT,
        nostrPubkey: pub(SERVER),
      }),
    ).toEqual({
      sender: pub(SENDER),
      amountMsat: 100_000,
      message: "ありがとう",
      targetId: TARGET,
    });
  });

  it("一言が無ければ省く", () => {
    expect(
      parseZapReceipt(receipt(request([], "  ")), { recipient: RECIPIENT }),
    ).not.toHaveProperty("message");
  });

  it("受け取り先のサーバーの鍵と違う作者の受領は見せない", () => {
    // 捕まえる変異: 受領の作者を確かめない（誰でも偽の Zap の通知を作れる）
    expect(
      parseZapReceipt(receipt(request(), { server: 9 }), {
        recipient: RECIPIENT,
        nostrPubkey: pub(SERVER),
      }),
    ).toBeUndefined();
  });

  it("サーバーの鍵が分からないときは、ほかの確認だけで見せる", () => {
    expect(
      parseZapReceipt(receipt(request(), { server: 9 }), {
        recipient: RECIPIENT,
      }),
    ).toBeDefined();
  });

  it("依頼の金額と請求書の金額が食い違えば見せない", () => {
    const mismatched = sign(SENDER, {
      ...request(),
      tags: request().tags.map((tag) =>
        tag[0] === "amount" ? ["amount", "999000"] : tag,
      ),
    });
    expect(
      parseZapReceipt(receipt(mismatched), { recipient: RECIPIENT }),
    ).toBeUndefined();
  });

  it("署名の壊れた依頼・別の人宛・依頼の無い受領は見せない", () => {
    const broken = { ...request(), sig: "0".repeat(128) };
    expect(
      parseZapReceipt(receipt(broken), { recipient: RECIPIENT }),
    ).toBeUndefined();
    expect(parseZapReceipt(receipt(), { recipient: pub(7) })).toBeUndefined();
    expect(
      parseZapReceipt(receipt("not json"), { recipient: RECIPIENT }),
    ).toBeUndefined();
  });
});

describe("zapSender", () => {
  it("受領の中の依頼の作者を返す", () => {
    expect(zapSender(receipt())).toBe(pub(SENDER));
    expect(zapSender(receipt("broken"))).toBeUndefined();
  });
});
