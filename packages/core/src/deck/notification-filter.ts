import type { NostrEvent } from "../nostr/event";
import { zapSender } from "../zap/zap-receipt";

/**
 * 自分の行動を通知から落とす。NIP-01 のフィルタは「著者が自分でない」を
 * 表せない (`authors` は許可リストのみ) ので手元で除外するしかない。
 * 著者は `pubkey` に出る。ただし Zap の受領の作者はウォレットのサーバーなので、
 * 送った人は中の依頼から読む。
 */
export const excludeOwnActions = (
  events: readonly NostrEvent[],
  viewer: string,
): NostrEvent[] =>
  events.filter(
    (event) =>
      event.pubkey !== viewer &&
      (event.kind !== 9735 || zapSender(event) !== viewer),
  );
