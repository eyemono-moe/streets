import { loadDeckSet } from "@streets/core/deck/deck";
import { FOLLOW_SET_KIND, readFollowSet } from "@streets/core/lists/follow-set";
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
    const loaded = loadDeckSet(decryptNip44(deck?.content ?? "", key));
    expect(loaded?.decks[0]?.columns).toHaveLength(scenario.deck.length);
  });
});

describe("キーの決まり方", () => {
  it("同じ ID なら同じ pubkey", () => {
    expect(pubkeyFor("mio")).toBe(pubkeyFor("mio"));
    expect(pubkeyFor("mio")).not.toBe(pubkeyFor("haru"));
  });
});

describe("チャンネルとユーザーリストの撮影データ", () => {
  const events = generate(scenarios["channels-and-lists"], options);

  it("お気に入りが実在するチャンネルを指し、返信が発言とチャンネルを指す", () => {
    const channels = events.filter((event) => event.kind === 40);
    const cafe = channels.find(
      (event) => JSON.parse(event.content).name === "街の喫茶室",
    );
    const favorite = events.find((event) => event.kind === 10005);
    expect(channels).toHaveLength(2);
    expect(favorite?.tags).toContainEqual(["e", cafe?.id]);

    const messages = events.filter((event) => event.kind === 42);
    expect(messages).toHaveLength(6);
    const reply = messages.find((event) =>
      event.tags.some((tag) => tag[3] === "reply"),
    );
    expect(reply?.tags).toContainEqual([
      "e",
      cafe?.id,
      options.relayUrl,
      "root",
    ]);
    expect(
      messages.some((event) =>
        reply?.tags.some((tag) => tag[3] === "reply" && tag[1] === event.id),
      ),
    ).toBe(true);
  });

  it("公開メンバーと暗号化した非公開メンバーを生成する", () => {
    const set = events.find(
      (event) =>
        event.kind === FOLLOW_SET_KIND &&
        event.tags.some((tag) => tag[0] === "d" && tag[1] === "city-notes"),
    );
    expect(set).toBeDefined();
    if (!set) return;
    expect(readFollowSet(set).members).toHaveLength(3);
    const key = conversationKey(secretKeyFor("mio"), pubkeyFor("mio"));
    expect(JSON.parse(decryptNip44(set.content, key))).toEqual([
      ["p", pubkeyFor("ren")],
    ]);
  });
});

describe("content-warning の撮影データ", () => {
  const events = generate(scenarios["content-warning"], options);
  const warnings = events.flatMap((event) =>
    event.tags.filter((tag) => tag[0] === "content-warning"),
  );

  it("投稿とチャンネルの発言に閲覧注意を付け、理由の無いものは値を持たない", () => {
    expect(warnings).toContainEqual(["content-warning", "映画のネタバレ"]);
    expect(warnings).toContainEqual(["content-warning", "結末のネタバレ"]);
    expect(warnings).toContainEqual(["content-warning"]);
    expect(
      events.some(
        (event) =>
          event.kind === 42 &&
          event.tags.some((tag) => tag[0] === "content-warning"),
      ),
    ).toBe(true);
  });
});

describe("all-in の撮影データ", () => {
  it("個別シナリオのイベントを重複なくすべて含む", () => {
    const combined = generate(scenarios["all-in"], options);
    const ids = new Set(combined.map((event) => event.id));
    expect(ids.size).toBe(combined.length);
    for (const [name, scenario] of Object.entries(scenarios)) {
      if (name === "all-in") continue;
      for (const event of generate(scenario, options)) {
        // デッキだけは各シナリオで構成が異なる。
        if (event.kind !== 30078) expect(ids.has(event.id)).toBe(true);
      }
    }
  });
});
