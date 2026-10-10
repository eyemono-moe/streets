import {
  type NostrEvent,
  type UnsignedEvent,
  isNostrEvent,
  verifyEvent,
} from "../nostr/event";

/**
 * 外の署名器が返したイベントが、頼んだとおりに署名されているか。署名器が中身を
 * 書き換えたり、別のアカウントで署名したりしたものを、書き込みへ渡さない。
 */
export const checkSignedEvent = (
  value: unknown,
  template: UnsignedEvent,
  pubkey: string,
):
  | { ok: true; event: NostrEvent }
  | { ok: false; reason: "invalid" | "changed" } => {
  if (!isNostrEvent(value) || !verifyEvent(value)) {
    return { ok: false, reason: "invalid" };
  }
  if (
    value.pubkey !== pubkey ||
    value.created_at !== template.created_at ||
    value.kind !== template.kind ||
    value.content !== template.content ||
    JSON.stringify(value.tags) !== JSON.stringify(template.tags)
  ) {
    return { ok: false, reason: "changed" };
  }
  return { ok: true, event: value };
};
