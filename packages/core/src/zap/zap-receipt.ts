import { type NostrEvent, isNostrEvent, verifyEvent } from "../nostr/event";
import { bolt11AmountMsat } from "./bolt11";

/** Zap の受領から読んだこと。 */
export type ZapReceipt = {
  /** 送った人。受領の作者はウォレットのサーバーなので、依頼（kind:9734）の作者を使う。 */
  sender: string;
  amountMsat: number;
  /** 送った人の一言。空なら省く。 */
  message?: string;
  /** Zap された投稿。プロフィールへの Zap なら無い。 */
  targetId?: string;
};

const tagValue = (event: NostrEvent, name: string) =>
  event.tags.find((tag) => tag[0] === name)?.[1];

/** 受領の中の依頼（`description` タグ）を取り出す。署名の壊れたものは読まない。 */
const zapRequestOf = (receipt: NostrEvent): NostrEvent | undefined => {
  const description = tagValue(receipt, "description");
  if (!description) return undefined;
  let json: unknown;
  try {
    json = JSON.parse(description);
  } catch {
    return undefined;
  }
  if (!isNostrEvent(json) || json.kind !== 9734) return undefined;
  return verifyEvent(json) ? json : undefined;
};

/** 依頼の作者（送った人）。自分の Zap を通知から落とすのに使う。 */
export const zapSender = (receipt: NostrEvent): string | undefined =>
  receipt.kind === 9735 ? zapRequestOf(receipt)?.pubkey : undefined;

/**
 * `recipient` が受け取った Zap の受領を読む（NIP-57 の Appendix F）。
 *
 * - 依頼の署名が正しく、依頼と受領の宛先がどちらも `recipient`
 * - 金額は請求書（bolt11）から読み、依頼に `amount` があれば一致する
 * - `nostrPubkey`（自分の受け取り先のサーバーが受領に署名する鍵）が分かっていれば、
 *   受領の作者がそれと一致する。分からないとき（受け取り先を読めない）は確かめない
 *
 * どれかが食い違えば `undefined`（見せない）。
 */
export const parseZapReceipt = (
  receipt: NostrEvent,
  options: { recipient: string; nostrPubkey?: string },
): ZapReceipt | undefined => {
  if (receipt.kind !== 9735) return undefined;
  if (options.nostrPubkey && receipt.pubkey !== options.nostrPubkey) {
    return undefined;
  }
  if (tagValue(receipt, "p") !== options.recipient) return undefined;
  const request = zapRequestOf(receipt);
  if (!request || tagValue(request, "p") !== options.recipient) {
    return undefined;
  }
  const bolt11 = tagValue(receipt, "bolt11");
  const amountMsat = bolt11 ? bolt11AmountMsat(bolt11) : undefined;
  if (amountMsat === undefined) return undefined;
  const requested = tagValue(request, "amount");
  if (requested !== undefined && requested !== String(amountMsat)) {
    return undefined;
  }
  const message = request.content.trim();
  const targetId = tagValue(request, "e") ?? tagValue(receipt, "e");
  return {
    sender: request.pubkey,
    amountMsat,
    ...(message ? { message } : {}),
    ...(targetId ? { targetId } : {}),
  };
};
