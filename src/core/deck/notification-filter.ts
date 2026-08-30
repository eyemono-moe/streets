import type { NostrEvent } from "../nostr/event";

/**
 * 自分の行動を通知から落とす (仕様 2.2 節)。
 *
 * NIP-01 のフィルタは「著者が自分**でない**」を表せない (`authors` は
 * 許可リストであって拒否リストではない) ので、リレーから届いたものを
 * 手元で捨てるしかない。
 *
 * kind ごとに分岐しないのは、返信者・リポストした人・リアクションした人が
 * いずれもそのイベントの著者だから —— 「誰がやったか」は kind:1/6/7 の
 * どれでも `pubkey` に出る。
 *
 * **UI から切り出しているのは、「誰を落とすか」をブラウザ無しで固定する
 * ため** (`column-presets.ts` と同じ理由)。
 */
export const excludeOwnActions = (
  events: readonly NostrEvent[],
  viewer: string,
): NostrEvent[] => events.filter((event) => event.pubkey !== viewer);
