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

/**
 * Solid のコンポーネントは (SolidStart/SSR ではなくブラウザ向けの
 * client-side compile では) 呼ぶと実 DOM ノードを返す。
 * `src/routes/debug/v1-core.test.tsx` と同じ手法で、`createRoot` の中で
 * 関数として直接呼び、返ってきたノードを検証する。
 */
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
    // 捕まえる変異: `content.slice(0, 200)` (UTF-16 コードユニット単位)。
    // "a" を 199 個 + 絵文字 (サロゲートペア、2 コードユニット) を content に
    // 置くと、コードユニット単位の slice(0, 200) は絵文字の上位サロゲート
    // だけを含めて下位サロゲートを切り落とし、孤立サロゲートを残す。
    // コードポイント単位 (Array.from) なら 200 要素目に絵文字全体が入り、
    // 割れない。
    const emoji = "😀";
    const content = `${"a".repeat(199)}${emoji}${"z".repeat(50)}`;
    const element = renderFull(noteWith({ content }));
    const shown = element.querySelector(
      '[data-testid="unknown-kind-content"]',
    )?.textContent;
    expect(shown).toBe(`${"a".repeat(199)}${emoji}`);
  });

  it("200 文字未満の content はそのまま出す", () => {
    // このアサーションが実際に保証すること: 短い content が変形されずに
    // そのまま通ること。上の「切り詰める」テストと違い、slice の境界に
    // 触れないので、切り詰め処理そのものを削っても検出できない
    // (検証済み: truncate を素通し (`(content) => content`) に変えても
    // このテスト単体は通る) —— 短い content を壊さないという別の性質を
    // 確かめるためのテスト。
    const element = renderFull(noteWith({ content: "short" }));
    expect(
      element.querySelector('[data-testid="unknown-kind-content"]')
        ?.textContent,
    ).toBe("short");
  });
});

describe("UnknownKindCompact", () => {
  it("kind 番号だけを出し、content は出さない", () => {
    // 捕まえる変異: compact でも content を出す (spec 6 節の表: compact は
    // kind 番号のみ)
    const element = renderCompact(
      noteWith({ kind: 7, content: "should not appear" }),
    );
    expect(element.textContent).toContain("7");
    expect(element.textContent).not.toContain("should not appear");
  });

  it('data-testid="unknown-kind" を持つ', () => {
    // 捕まえる変異: data-testid を落とす (e2e が fallback の描画を
    // 主張できなくなる)
    expect(renderCompact(noteWith()).getAttribute("data-testid")).toBe(
      "unknown-kind",
    );
  });
});
