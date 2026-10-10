import type { EventDraft } from "../nostr/build/draft";
import type { NostrEvent } from "../nostr/event";
import type { RelayUrl } from "../relay/relay-connection";
import type { ZapEndpoint, ZapPayInfo } from "./lnurl";

/** Zap を送る先。投稿に送るか、人（プロフィール）に直接送るか。 */
export type ZapTarget =
  | { type: "event"; event: NostrEvent }
  | { type: "profile"; pubkey: string };

/** Zap を受け取る人。 */
export const zapRecipient = (target: ZapTarget): string =>
  target.type === "event" ? target.event.pubkey : target.pubkey;

/** チャンネルのリレーに割く枠。残りは受取人の通知先に使う。 */
const CHANNEL_RELAY_SLOTS = 2;

/**
 * ウォレットに Zap 受領を公開してもらうリレー。受取人の通知先を優先する。
 * チャンネルの発言（`channel`）は、そのチャンネルの画面にも受領が出るよう、
 * 発言を受け取ったリレーを先頭の 2 本まで先に入れる。
 */
export const zapReceiptRelays = (options: {
  recipientRead: readonly RelayUrl[];
  senderRead: readonly RelayUrl[];
  fallback: readonly RelayUrl[];
  channel?: readonly RelayUrl[];
}): RelayUrl[] => {
  const recipient =
    options.recipientRead.length > 0 ? options.recipientRead : options.fallback;
  const channel = (options.channel ?? []).slice(0, CHANNEL_RELAY_SLOTS);
  return [...new Set([...channel, ...recipient, ...options.senderRead])].slice(
    0,
    5,
  );
};

/**
 * Zap の依頼（NIP-57 の kind:9734）。リレーには送らず、署名して LNURL の
 * callback へ渡す。受け取った側のサーバーは、これを受領（kind:9735）に入れて
 * `relays` へ流す。人への Zap は `e`・`k` を付けない。
 */
export const buildZapRequest = (options: {
  target: ZapTarget;
  endpoint: ZapEndpoint;
  amountMsat: number;
  /** ウォレットが受領を公開する先。受取人の read リレーを優先する。 */
  relays: readonly RelayUrl[];
  message: string;
}): EventDraft => ({
  kind: 9734,
  content: options.message.trim(),
  tags: [
    ["relays", ...options.relays],
    ["amount", String(options.amountMsat)],
    ["lnurl", options.endpoint.lnurl],
    ["p", zapRecipient(options.target)],
    ...(options.target.type === "event"
      ? [
          ["e", options.target.event.id],
          ["k", String(options.target.event.kind)],
        ]
      : []),
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
