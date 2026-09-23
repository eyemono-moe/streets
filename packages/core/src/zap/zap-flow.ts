import type { NostrEvent } from "../nostr/event";

/** 選べる金額（sat）。ほかは自由に入れる。 */
export const ZAP_AMOUNTS = [50, 100, 500, 1000] as const;

/** 自由に入れる金額の上限（sat）。桁を打ち間違えて大金を払わないように。 */
export const MAX_ZAP_SATS = 1_000_000;

export type ZapDraft = {
  target: NostrEvent;
  /** 選んだ金額。`custom` なら `customAmount` を使う。 */
  amount: number | "custom";
  customAmount: string;
  /** 一言。任意。 */
  message: string;
};

export type ZapFlowState =
  | { phase: "closed" }
  | { phase: "editing"; draft: ZapDraft }
  /** 送り先に問い合わせ、依頼に署名し、請求書をもらっている間。 */
  | { phase: "preparing"; draft: ZapDraft }
  /**
   * 請求書をもらった。`webln` はブラウザのウォレット（拡張機能）に払ってもらって
   * いる間、`manual` は QR やリンクで利用者に払ってもらう間。
   */
  | {
      phase: "paying";
      draft: ZapDraft;
      invoice: string;
      wallet: "webln" | "manual";
    };

export type ZapFlowEvent =
  | { type: "zap/open"; target: NostrEvent }
  | { type: "zap/amount"; amount: number | "custom" }
  | { type: "zap/custom-amount"; value: string }
  | { type: "zap/message"; value: string }
  | { type: "zap/submit" }
  /** 裁定する段が請求書をもらった。 */
  | { type: "zap/invoice"; invoice: string; wallet: "webln" | "manual" }
  /** ブラウザのウォレットが払えなかった・断られた。QR で払ってもらう。 */
  | { type: "zap/pay-manually" }
  /** 払えた（ウォレットが答えた、または受領が届いた）。 */
  | { type: "zap/paid" }
  /** 請求書をもらうまでに失敗した。入力に戻す（理由は裁定する段がトーストで出す）。 */
  | { type: "zap/failed" }
  | { type: "zap/close" };

/** 呼ぶたびに新しく作る。 */
export const closedZapFlow = (): ZapFlowState => ({ phase: "closed" });

/** 入力から金額（sat）を読む。読めない・範囲外なら `undefined`。 */
export const zapAmountSats = (draft: ZapDraft): number | undefined => {
  if (draft.amount !== "custom") return draft.amount;
  const text = draft.customAmount.trim().replace(/[,，_\s]/g, "");
  if (!/^\d+$/.test(text)) return undefined;
  const sats = Number(text);
  return sats >= 1 && sats <= MAX_ZAP_SATS ? sats : undefined;
};

const editing = (
  state: ZapFlowState,
  update: (draft: ZapDraft) => ZapDraft,
): ZapFlowState =>
  state.phase === "editing"
    ? { phase: "editing", draft: update(state.draft) }
    : state;

export const zapFlowTransition = (
  state: ZapFlowState,
  event: ZapFlowEvent,
): ZapFlowState => {
  switch (event.type) {
    case "zap/open":
      return {
        phase: "editing",
        draft: {
          target: event.target,
          amount: ZAP_AMOUNTS[1],
          customAmount: "",
          message: "",
        },
      };
    case "zap/amount":
      return editing(state, (draft) => ({ ...draft, amount: event.amount }));
    case "zap/custom-amount":
      return editing(state, (draft) => ({
        ...draft,
        amount: "custom",
        customAmount: event.value,
      }));
    case "zap/message":
      return editing(state, (draft) => ({ ...draft, message: event.value }));
    case "zap/submit":
      return state.phase === "editing" &&
        zapAmountSats(state.draft) !== undefined
        ? { phase: "preparing", draft: state.draft }
        : state;
    case "zap/invoice":
      return state.phase === "preparing"
        ? {
            phase: "paying",
            draft: state.draft,
            invoice: event.invoice,
            wallet: event.wallet,
          }
        : state;
    case "zap/pay-manually":
      return state.phase === "paying" ? { ...state, wallet: "manual" } : state;
    case "zap/failed":
      return state.phase === "preparing"
        ? { phase: "editing", draft: state.draft }
        : state;
    case "zap/paid":
      return state.phase === "paying" ? closedZapFlow() : state;
    case "zap/close":
      // 請求書をもらっている途中で閉じても、まだ何も払っていない。
      return closedZapFlow();
  }
};
