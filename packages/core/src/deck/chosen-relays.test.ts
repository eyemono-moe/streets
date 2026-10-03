import { describe, expect, it } from "vite-plus/test";
import { chosenRelays } from "./chosen-relays";
import type { ColumnDef, DeckSet } from "./deck";

const deckOf = (columns: ColumnDef[]): DeckSet => ({
  version: 3,
  decks: [{ id: "d", name: "デッキ", columns }],
});

describe("chosenRelays", () => {
  it("自分の relay list・検索リレー・リレーを選んだカラムを集める", () => {
    const relays = chosenRelays({
      relayList: {
        phase: "ready",
        entries: [{ url: "ws://localhost:7777/", read: true, write: true }],
      },
      searchRelays: ["wss://search.example/"],
      decks: deckOf([
        {
          id: "c1",
          title: "ローカル",
          source: {
            kind: "literal",
            filters: [{ kinds: [1] }],
            relays: ["ws://192.168.1.2:7777", "ws://localhost:7777/"],
          },
        },
      ]),
    });

    expect(relays).toEqual([
      "ws://localhost:7777/",
      "wss://search.example/",
      "ws://192.168.1.2:7777/",
    ]);
  });

  it("開いたときのヒントのように、他人が書いたリレーは含めない", () => {
    const relays = chosenRelays({
      relayList: { phase: "loading" },
      searchRelays: [],
      decks: deckOf([
        {
          id: "c1",
          title: "チャンネル",
          source: {
            kind: "channel",
            id: "a".repeat(64),
            relays: ["ws://localhost:7777/"],
          },
          knownRelays: ["ws://localhost:8888/"],
        },
      ]),
    });

    expect(relays).toEqual([]);
  });
});
