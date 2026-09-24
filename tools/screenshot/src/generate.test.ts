import { loadDeck } from "@streets/core/deck/deck";
import { verifyEvent } from "@streets/core/nostr/event";
import {
  conversationKey,
  decryptNip44,
} from "@streets/core/signer/nip46/nip44";
import { parseZapReceipt } from "@streets/core/zap/zap-receipt";
import { describe, expect, it } from "vite-plus/test";
import { generate } from "./generate";
import { pubkeyFor, secretKeyFor } from "./keys";
import { scenarios } from "./scenarios";

const options = {
  base: 1_790_157_600,
  relayUrl: "ws://localhost:10547",
  asset: (name: string) => ({
    url: `http://localhost:10548/${name}`,
    sha256: "0".repeat(64),
    size: 1,
    type: "image/svg+xml",
  }),
};

describe.each(Object.entries(scenarios))("シナリオ %s", (_, scenario) => {
  const events = generate(scenario, options);

  it("すべてのイベントの署名が、アプリと同じ検証を通る", () => {
    for (const event of events) expect(verifyEvent(event)).toBe(true);
  });

  it("同じ基準時刻なら、毎回同じイベントになる", () => {
    expect(generate(scenario, options)).toEqual(events);
  });

  it("基準時刻より後の出来事を作らない", () => {
    for (const event of events) {
      expect(event.created_at).toBeLessThanOrEqual(options.base);
    }
  });

  it("Zap の受領は、アプリが通知として読める形", () => {
    for (const receipt of events.filter((event) => event.kind === 9735)) {
      const recipient = receipt.tags.find((tag) => tag[0] === "p")?.[1] ?? "";
      expect(parseZapReceipt(receipt, { recipient })).toBeDefined();
    }
  });

  it("デッキは見る人が復号して読める", () => {
    const deck = events.find((event) => event.kind === 30078);
    if (!scenario.deck) {
      expect(deck).toBeUndefined();
      return;
    }
    const key = conversationKey(
      secretKeyFor(scenario.viewer),
      pubkeyFor(scenario.viewer),
    );
    const loaded = loadDeck(decryptNip44(deck?.content ?? "", key));
    expect(loaded?.columns).toHaveLength(scenario.deck.length);
  });
});

describe("キーの決まり方", () => {
  it("同じ ID なら同じ pubkey", () => {
    expect(pubkeyFor("mio")).toBe(pubkeyFor("mio"));
    expect(pubkeyFor("mio")).not.toBe(pubkeyFor("haru"));
  });
});
