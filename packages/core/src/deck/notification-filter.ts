import type { NostrEvent } from "../nostr/event";

/**
 * 自分の行動を通知から落とす。NIP-01 のフィルタは「著者が自分でない」を
 * 表せない (`authors` は許可リストのみ) ので手元で除外するしかない。
 * kind を問わず著者は `pubkey` に出るため、kind ごとの分岐は不要。
 */
export const excludeOwnActions = (
  events: readonly NostrEvent[],
  viewer: string,
): NostrEvent[] => events.filter((event) => event.pubkey !== viewer);
