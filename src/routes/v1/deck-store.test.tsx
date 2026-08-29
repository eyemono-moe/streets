import { describe, expect, it } from "vitest";
import { type Deck, defaultDeck, saveDeck } from "../../core/deck/deck";
import { DECK_EVENT_IDENTIFIER, deckDocumentDefinition } from "./deck-store";

const pubkey = "11".repeat(32);

describe("deckDocumentDefinition", () => {
  it("デッキ専用の d 識別子を使う", () => {
    // 捕まえる変異: 他の kind:30078 document と同じ識別子へ保存する。
    expect(deckDocumentDefinition.identifier).toBe(DECK_EVENT_IDENTIFIER);
  });

  it("旧 localStorage の Deck を未送信値として移行できる", () => {
    const deck = defaultDeck(pubkey);

    // 捕まえる変異: 汎用 envelope だけを受け付け、既存利用者の Deck を
    // 壊れたキャッシュとして捨てる。
    expect(deckDocumentDefinition.migrateLegacy?.(saveDeck(deck))).toEqual(
      deck,
    );
  });

  it("壊れた値を Deck として採用しない", () => {
    // 捕まえる変異: 検証せず JSON.parse の結果を Deck に cast する。
    expect(deckDocumentDefinition.parse('{"version":2,"columns":{}}')).toBe(
      undefined,
    );
  });

  it("列の内容が違う Deck を同じと判定しない", () => {
    const left = defaultDeck(pubkey);
    const right: Deck = {
      ...left,
      columns: left.columns.map((column, index) =>
        index === 0 ? { ...column, title: "別のホーム" } : column,
      ),
    };

    // 捕まえる変異: version だけで同値判定し、競合を黙って解消する。
    expect(deckDocumentDefinition.equals(left, right)).toBe(false);
  });
});
