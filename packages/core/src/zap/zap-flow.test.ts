import { describe, expect, it } from "vitest";
import type { NostrEvent } from "../nostr/event";
import {
  MAX_ZAP_SATS,
  type ZapFlowEvent,
  type ZapFlowState,
  closedZapFlow,
  zapAmountSats,
  zapFlowTransition,
} from "./zap-flow";

const target = { id: "e".repeat(64), pubkey: "p".repeat(64) } as NostrEvent;
const run = (...events: ZapFlowEvent[]): ZapFlowState =>
  events.reduce(zapFlowTransition, closedZapFlow());
const open: ZapFlowEvent = { type: "zap/open", target };

describe("zapFlowTransition", () => {
  it("開くと 100 sat を選んだ入力になる", () => {
    const state = run(open);
    expect(state).toMatchObject({
      phase: "editing",
      draft: { amount: 100, message: "" },
    });
  });

  it("金額と一言を選んで送り、請求書をもらって払う", () => {
    const paying = run(
      open,
      { type: "zap/amount", amount: 500 },
      { type: "zap/message", value: "ありがとう" },
      { type: "zap/submit" },
      { type: "zap/invoice", invoice: "lnbc5u1", wallet: "webln" },
    );
    expect(paying).toMatchObject({
      phase: "paying",
      invoice: "lnbc5u1",
      wallet: "webln",
      draft: { amount: 500, message: "ありがとう" },
    });
    expect(zapFlowTransition(paying, { type: "zap/paid" })).toEqual({
      phase: "closed",
    });
  });

  it("ブラウザのウォレットで払えなければ、QR で払う形に替える", () => {
    const state = run(
      open,
      { type: "zap/submit" },
      { type: "zap/invoice", invoice: "lnbc1", wallet: "webln" },
      { type: "zap/pay-manually" },
    );
    expect(state).toMatchObject({ phase: "paying", wallet: "manual" });
  });

  it("金額が読めなければ送らない", () => {
    // 捕まえる変異: 金額を確かめずに送る（0 sat や桁違いの請求書をもらう）
    const state = run(
      open,
      { type: "zap/custom-amount", value: "abc" },
      { type: "zap/submit" },
    );
    expect(state.phase).toBe("editing");
  });

  it("請求書をもらう前に失敗したら、入力を残して戻る", () => {
    const state = run(
      open,
      { type: "zap/message", value: "残る" },
      { type: "zap/submit" },
      { type: "zap/failed" },
    );
    expect(state).toMatchObject({
      phase: "editing",
      draft: { message: "残る" },
    });
  });

  it("払っている途中の入力や、関係のない知らせでは変わらない", () => {
    const paying = run(
      open,
      { type: "zap/submit" },
      { type: "zap/invoice", invoice: "lnbc1", wallet: "manual" },
    );
    expect(zapFlowTransition(paying, { type: "zap/amount", amount: 50 })).toBe(
      paying,
    );
    expect(zapFlowTransition(paying, { type: "zap/failed" })).toBe(paying);
    expect(zapFlowTransition(run(open), { type: "zap/paid" }).phase).toBe(
      "editing",
    );
  });

  it("閉じるとどこからでも閉じる", () => {
    expect(run(open, { type: "zap/submit" }, { type: "zap/close" })).toEqual({
      phase: "closed",
    });
  });
});

describe("zapAmountSats", () => {
  const draft = (customAmount: string) => ({
    target,
    amount: "custom" as const,
    customAmount,
    message: "",
  });

  it("選んだ金額か、自由に入れた金額を読む", () => {
    expect(zapAmountSats({ ...draft(""), amount: 1000 })).toBe(1000);
    expect(zapAmountSats(draft("2,100"))).toBe(2100);
    expect(zapAmountSats(draft(" 21 "))).toBe(21);
  });

  it.each([[""], ["0"], ["-5"], ["1.5"], ["abc"], [String(MAX_ZAP_SATS + 1)]])(
    "%s は読めない",
    (value) => {
      expect(zapAmountSats(draft(value))).toBeUndefined();
    },
  );
});
