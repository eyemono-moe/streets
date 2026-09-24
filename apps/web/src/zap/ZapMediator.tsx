import type { NostrEvent } from "@streets/core/nostr/event";
import type {
  ConnectionPool,
  PooledSubscription,
} from "@streets/core/read/connection-pool";
import type { EventStore } from "@streets/core/read/event-store";
import type { RelayUrl } from "@streets/core/relay/relay-connection";
import type { Signer } from "@streets/core/signer/signer";
import { bolt11AmountMsat } from "@streets/core/zap/bolt11";
import { parseZapPayInfo, zapEndpointOf } from "@streets/core/zap/lnurl";
import {
  type ZapDraft,
  type ZapFlowEvent,
  type ZapFlowState,
  closedZapFlow,
  zapAmountSats,
  zapFlowTransition,
} from "@streets/core/zap/zap-flow";
import {
  buildZapRequest,
  parseInvoiceResponse,
  zapInvoiceUrl,
} from "@streets/core/zap/zap-request";
import { type Accessor, type ParentComponent, Show, onCleanup } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import { lazyPart, onceTrue } from "../lazy-part";
import { notifyError, notifySuccess } from "../toast";
import { Mediates, type UiEvent } from "../ui-events";

const ZapDialog = lazyPart(() => import("./ZapDialog"));

/** ブラウザのライトニングのウォレット（WebLN。Alby などの拡張機能が入れる）。 */
type WebLN = {
  enable(): Promise<void>;
  sendPayment(invoice: string): Promise<unknown>;
};
const webln = (): WebLN | undefined => (globalThis as { webln?: WebLN }).webln;

/** 利用者に見せる理由つきの失敗。 */
class ZapError extends Error {}

const getJson = async (url: string, signal: AbortSignal): Promise<unknown> => {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new ZapError(
      `送り先のサーバーが答えませんでした（${response.status}）`,
    );
  }
  return response.json();
};

/** 受領を待つ上限。これを過ぎても、払えていれば送れている。 */
const RECEIPT_WAIT_MS = 5 * 60_000;

const isZapEvent = (event: UiEvent): event is ZapFlowEvent =>
  event.type.startsWith("zap/");

/**
 * Zap を送る流れを裁定する。送り先への問い合わせ・依頼の署名・請求書の取得・
 * 支払い・受領の待ち受けをここで行い、遷移は `zapFlowTransition` に任せる。
 */
export const ZapMediator: ParentComponent<{
  signer: Signer;
  viewer: string;
  store: EventStore;
  pool: Pick<ConnectionPool, "subscribe">;
  /** 受領を流してもらい、待ち受けるリレー（自分が読むリレー）。 */
  relays: Accessor<readonly RelayUrl[]>;
}> = (props) => {
  const [state, setState] = createStore({ flow: closedZapFlow() });
  let abort: AbortController | undefined;
  let receipts: PooledSubscription[] = [];
  let receiptTimer: ReturnType<typeof setTimeout> | undefined;

  const stopWaiting = () => {
    abort?.abort();
    abort = undefined;
    clearTimeout(receiptTimer);
    for (const handle of receipts) handle.close();
    receipts = [];
  };
  onCleanup(stopWaiting);

  // await をまたいで読むので、その時点の段階を関数で読む（TS の絞り込みを持ち越さない）。
  const phase = (): ZapFlowState["phase"] => state.flow.phase;

  const apply = (event: ZapFlowEvent) => {
    // 当てる前の値で判断する（reconcile は元のオブジェクトを書き換える）。
    const next = zapFlowTransition(state.flow, event);
    setState("flow", reconcile(next));
    return next;
  };

  const paid = () => {
    if (phase() !== "paying") return;
    stopWaiting();
    apply({ type: "zap/paid" });
    notifySuccess("Zap を送りました");
  };

  const waitForReceipt = (
    target: NostrEvent,
    invoice: string,
    relays: readonly RelayUrl[],
  ) => {
    const since = Math.floor(Date.now() / 1000) - 60;
    for (const relay of relays) {
      const handle = props.pool.subscribe(
        relay,
        [{ kinds: [9735], "#e": [target.id], since }],
        {
          onEvent: (receipt) => {
            const bolt11 = receipt.tags.find((tag) => tag[0] === "bolt11")?.[1];
            if (bolt11?.toLowerCase() === invoice.toLowerCase()) paid();
          },
          onEose: () => {},
          onClosed: () => {},
        },
      );
      if (handle) receipts.push(handle);
    }
    receiptTimer = setTimeout(() => {
      for (const handle of receipts) handle.close();
      receipts = [];
    }, RECEIPT_WAIT_MS);
  };

  const prepare = async (draft: ZapDraft, signal: AbortSignal) => {
    const sats = zapAmountSats(draft);
    if (sats === undefined) throw new ZapError("金額を読めませんでした");
    const amountMsat = sats * 1000;
    const endpoint = zapEndpointOf(
      props.store.latestReplaceable(0, draft.target.pubkey)?.content,
    );
    if (!endpoint) {
      throw new ZapError("この人は Zap の受け取り先を設定していません");
    }
    const info = parseZapPayInfo(await getJson(endpoint.url, signal));
    if (!info) throw new ZapError("この送り先は Zap を受け付けていません");
    if (amountMsat < info.minSendable || amountMsat > info.maxSendable) {
      const min = Math.ceil(info.minSendable / 1000);
      const max = Math.floor(info.maxSendable / 1000);
      throw new ZapError(`この送り先に送れるのは ${min}〜${max} sats です`);
    }
    const relays = props.relays();
    const zapRequest = await props.signer.signEvent({
      ...buildZapRequest({
        target: draft.target,
        endpoint,
        amountMsat,
        relays,
        message: draft.message,
      }),
      pubkey: props.viewer,
      created_at: Math.floor(Date.now() / 1000),
    });
    const answer = parseInvoiceResponse(
      await getJson(
        zapInvoiceUrl({ info, endpoint, amountMsat, zapRequest }),
        signal,
      ),
    );
    if ("error" in answer) throw new ZapError(answer.error);
    // 選んだ金額と違う請求書は払わせない。
    if (bolt11AmountMsat(answer.invoice) !== amountMsat) {
      throw new ZapError("請求書の金額が、選んだ金額と合いません");
    }
    return { invoice: answer.invoice, relays };
  };

  const submit = async (draft: ZapDraft) => {
    stopWaiting();
    const controller = new AbortController();
    abort = controller;
    let prepared: Awaited<ReturnType<typeof prepare>>;
    try {
      prepared = await prepare(draft, controller.signal);
    } catch (error) {
      if (controller.signal.aborted) return;
      apply({ type: "zap/failed" });
      notifyError(error, "Zap を送れませんでした");
      return;
    }
    if (controller.signal.aborted || phase() !== "preparing") return;
    const wallet = webln();
    apply({
      type: "zap/invoice",
      invoice: prepared.invoice,
      wallet: wallet ? "webln" : "manual",
    });
    waitForReceipt(draft.target, prepared.invoice, prepared.relays);
    if (!wallet) return;
    try {
      await wallet.enable();
      await wallet.sendPayment(prepared.invoice);
      paid();
    } catch {
      // 断られた・払えなかったときは、QR で払ってもらう。
      if (phase() === "paying") apply({ type: "zap/pay-manually" });
    }
  };

  const handle = (event: UiEvent): boolean => {
    if (!isZapEvent(event)) return false;
    switch (event.type) {
      case "zap/close":
        stopWaiting();
        apply(event);
        return true;
      case "zap/submit": {
        const next = apply(event);
        if (next.phase === "preparing") void submit(next.draft);
        return true;
      }
      default:
        apply(event);
        return true;
    }
  };

  // 閉じる動きを見せるため、一度開いたら残す。
  const dialogMounted = onceTrue(() => state.flow.phase !== "closed");

  return (
    <Mediates handle={handle}>
      {props.children}
      <Show when={dialogMounted()}>
        <ZapDialog state={state.flow} />
      </Show>
    </Mediates>
  );
};
