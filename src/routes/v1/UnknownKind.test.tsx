import { createRoot } from "solid-js";
import { describe, expect, it } from "vitest";
import type { NostrEvent } from "../../core/nostr/event";
import { UnknownKindCompact, UnknownKindFull } from "./UnknownKind";

const noteWith = (overrides: Partial<NostrEvent> = {}): NostrEvent => ({
  id: "a".repeat(64),
  pubkey: "b".repeat(64),
  created_at: 1_700_000_000,
  kind: 9999,
  tags: [],
  content: "hello",
  sig: "1".repeat(128),
  ...overrides,
});

/** ブラウザ向け client-side compile では呼ぶと実 DOM ノードを返すので、`createRoot` の中で直接呼ぶ。 */
const renderFull = (event: NostrEvent): HTMLElement => {
  let element: HTMLElement | undefined;
  createRoot((dispose) => {
    element = UnknownKindFull({ event }) as unknown as HTMLElement;
    dispose();
  });
  if (!element) throw new Error("failed to render UnknownKindFull");
  return element;
};

const renderCompact = (event: NostrEvent): HTMLElement => {
  let element: HTMLElement | undefined;
  createRoot((dispose) => {
    element = UnknownKindCompact({ event }) as unknown as HTMLElement;
    dispose();
  });
  if (!element) throw new Error("failed to render UnknownKindCompact");
  return element;
};

describe("UnknownKindFull", () => {
  it("kind 番号・未対応メッセージ・content を出す", () => {
    // 捕まえる変異: kind 番号を出さない / 「未対応の種類です」を出さない
    const element = renderFull(noteWith({ kind: 42, content: "plain body" }));
    expect(element.textContent).toContain("42");
    expect(element.textContent).toContain("未対応の種類です");
    expect(
      element.querySelector('[data-testid="unknown-kind-content"]')
        ?.textContent,
    ).toBe("plain body");
  });

  it("content を 200 文字で切り詰める", () => {
    // 捕まえる変異: 切り詰めをしない (slice を削る)
    const element = renderFull(noteWith({ content: "x".repeat(250) }));
    const shown = element.querySelector(
      '[data-testid="unknown-kind-content"]',
    )?.textContent;
    expect(shown).toHaveLength(200);
    expect(shown).toBe("x".repeat(200));
  });

  it("サロゲートペアを割らずに切り詰める", () => {
    // 捕まえる変異: `content.slice(0, 200)` (UTF-16 コードユニット単位だと
    // サロゲートペアの絵文字を上位だけ残して割ってしまう。コードポイント
    // 単位 (Array.from) なら割れない)。
    const emoji = "😀";
    const content = `${"a".repeat(199)}${emoji}${"z".repeat(50)}`;
    const element = renderFull(noteWith({ content }));
    const shown = element.querySelector(
      '[data-testid="unknown-kind-content"]',
    )?.textContent;
    expect(shown).toBe(`${"a".repeat(199)}${emoji}`);
  });

  it("200 文字未満の content はそのまま出す", () => {
    // slice の境界に触れないので truncate を素通しにしてもこのテスト単体
    // は通る —— 短い content を壊さないという別の性質を確かめる。
    const element = renderFull(noteWith({ content: "short" }));
    expect(
      element.querySelector('[data-testid="unknown-kind-content"]')
        ?.textContent,
    ).toBe("short");
  });
});

describe("UnknownKindCompact", () => {
  it("kind 番号だけを出し、content は出さない", () => {
    // 捕まえる変異: compact でも content を出す (compact は kind 番号のみ)
    const element = renderCompact(
      noteWith({ kind: 7, content: "should not appear" }),
    );
    expect(element.textContent).toContain("7");
    expect(element.textContent).not.toContain("should not appear");
  });

  it('data-testid="unknown-kind" を持つ', () => {
    // 捕まえる変異: data-testid を落とす (e2e が fallback を主張できない)
    expect(renderCompact(noteWith()).getAttribute("data-testid")).toBe(
      "unknown-kind",
    );
  });
});
