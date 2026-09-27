import { describe, expect, it } from "vite-plus/test";
import { parseRelayRequest } from "./request";

const event = {
  id: "a".repeat(64),
  pubkey: "b".repeat(64),
  sig: "c".repeat(128),
  kind: 1,
  created_at: 1_790_201_999,
  tags: [["t", "streets"]],
  content: "Streets v1.0.3 がリリースされました",
};

describe("parseRelayRequest", () => {
  it("署名済みのイベントと送り先を受け取る", () => {
    expect(
      parseRelayRequest({ event, relays: ["wss://yabu.me/"] }),
    ).toMatchObject({ event: { id: event.id }, relays: ["wss://yabu.me/"] });
  });

  it("署名の無いイベントを拒む", () => {
    const { sig: _, ...unsigned } = event;
    expect(() =>
      parseRelayRequest({ event: unsigned, relays: ["wss://yabu.me/"] }),
    ).toThrow();
  });

  it("wss 以外の送り先と、多すぎる送り先を拒む", () => {
    expect(() =>
      parseRelayRequest({ event, relays: ["https://yabu.me/"] }),
    ).toThrow();
    expect(() =>
      parseRelayRequest({
        event,
        relays: Array.from({ length: 21 }, (_, i) => `wss://r${i}.example/`),
      }),
    ).toThrow();
  });
});
