import type { EventDraft } from "../nostr/build/draft";
import type { NostrEvent } from "../nostr/event";
import type { RelayUrl } from "../relay/relay-connection";
import type { ZapEndpoint, ZapPayInfo } from "./lnurl";

/**
 * Zap の依頼（NIP-57 の kind:9734）。リレーには送らず、署名して LNURL の
 * callback へ渡す。受け取った側のサーバーは、これを受領（kind:9735）に入れて
 * `relays` へ流す。
 */
export const buildZapRequest = (options: {
  target: NostrEvent;
  endpoint: ZapEndpoint;
  amountMsat: number;
  /** 受領を流してほしいリレー。自分が読むリレーを入れる（通知で拾えるように）。 */
  relays: readonly RelayUrl[];
  message: string;
}): EventDraft => ({
  kind: 9734,
  content: options.message.trim(),
  tags: [
    ["relays", ...options.relays],
    ["amount", String(options.amountMsat)],
    ["lnurl", options.endpoint.lnurl],
    ["p", options.target.pubkey],
    ["e", options.target.id],
    ["k", String(options.target.kind)],
  ],
});

/**
 * 請求書をもらう URL。署名した Zap の依頼を `nostr` に、金額を `amount` に入れる。
 * LNURL の comment は、受け付ける文字数の中でだけ入れる（超えると断るサーバーがある）。
 */
export const zapInvoiceUrl = (options: {
  info: ZapPayInfo;
  endpoint: ZapEndpoint;
  amountMsat: number;
  zapRequest: NostrEvent;
}): string => {
  const url = new URL(options.info.callback);
  url.searchParams.set("amount", String(options.amountMsat));
  url.searchParams.set("nostr", JSON.stringify(options.zapRequest));
  url.searchParams.set("lnurl", options.endpoint.lnurl);
  const comment = options.zapRequest.content;
  if (comment && comment.length <= options.info.commentAllowed) {
    url.searchParams.set("comment", comment);
  }
  return url.toString();
};

/** callback の答え。請求書（`pr`）か、断られた理由。 */
export const parseInvoiceResponse = (
  json: unknown,
): { invoice: string } | { error: string } => {
  if (typeof json !== "object" || json === null) {
    return { error: "請求書の形が不正です" };
  }
  const record = json as Record<string, unknown>;
  if (record.status === "ERROR") {
    return {
      error:
        typeof record.reason === "string" && record.reason
          ? record.reason
          : "送り先のサーバーに断られました",
    };
  }
  return typeof record.pr === "string" && record.pr
    ? { invoice: record.pr }
    : { error: "請求書が返ってきませんでした" };
};
