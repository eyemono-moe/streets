import type { NostrEvent } from "../nostr/event";
import { repostTarget } from "../nostr/event-refs";
import { type ReactionContent, parseReaction } from "../nostr/reaction";

/** まとめられる操作。リアクションとリポストは別々にまとめる（混ぜると何をされたか読めない）。 */
export type NotificationAction = "reaction" | "repost";

export type NotificationRow =
  | { type: "event"; key: string; event: NostrEvent }
  | {
      type: "group";
      key: string;
      action: NotificationAction;
      /** まとめた操作の対象のノート。 */
      targetId: string;
      /** 新しい順。 */
      events: NostrEvent[];
    };

/** リアクション・リポストが何を指しているか。読めないものは undefined。 */
export const actionTarget = (
  event: NostrEvent,
): { action: NotificationAction; targetId: string } | undefined => {
  if (event.kind === 7) {
    const targetId = parseReaction(event)?.targetId;
    return targetId ? { action: "reaction", targetId } : undefined;
  }
  if (event.kind === 6 || event.kind === 16) {
    const targetId = repostTarget(event)?.id;
    return targetId ? { action: "repost", targetId } : undefined;
  }
  return undefined;
};

/**
 * 通知を行に並べる。`group` のときは、並びの上で隣り合う「同じノートへの同じ操作」を
 * 1 行にまとめる（間に別の通知が挟まったら、そこで切る —— いつ何があったかの順を崩さない）。
 * 1 件しか無いまとまりは、まとめずにそのまま出す。
 *
 * `events` は新しい順に並んでいる前提。
 */
export const notificationRows = (
  events: readonly NostrEvent[],
  group: boolean,
): NotificationRow[] => {
  const rows: NotificationRow[] = [];
  let run: {
    action: NotificationAction;
    targetId: string;
    events: NostrEvent[];
  } | null = null;

  const flush = () => {
    if (!run) return;
    const [only] = run.events;
    if (run.events.length === 1 && only) {
      rows.push({ type: "event", key: only.id, event: only });
    } else {
      // 鍵は一番古い通知から作る。新しい通知は上に足されていくので、まとまりが伸びても鍵が変わらない。
      const oldest = run.events.at(-1);
      rows.push({
        type: "group",
        key: `${run.action}:${run.targetId}:${oldest?.id ?? ""}`,
        action: run.action,
        targetId: run.targetId,
        events: run.events,
      });
    }
    run = null;
  };

  for (const event of events) {
    const action = group ? actionTarget(event) : undefined;
    if (!action) {
      flush();
      rows.push({ type: "event", key: event.id, event });
      continue;
    }
    if (
      run &&
      run.action === action.action &&
      run.targetId === action.targetId
    ) {
      run.events.push(event);
      continue;
    }
    flush();
    run = { ...action, events: [event] };
  }
  flush();
  return rows;
};

/** まとまりに付いたリアクションの種類。同じ絵文字は 1 つにまとめる。新しい順。 */
export const groupReactionContents = (
  events: readonly NostrEvent[],
): ReactionContent[] => {
  const seen = new Set<string>();
  const contents: ReactionContent[] = [];
  for (const event of events) {
    const content = parseReaction(event)?.content;
    if (!content) continue;
    const key =
      content.type === "like"
        ? "like"
        : content.type === "emoji"
          ? `emoji:${content.url}`
          : `text:${content.content}`;
    if (seen.has(key)) continue;
    seen.add(key);
    contents.push(content);
  }
  return contents;
};

/** まとまりに加わった人。同じ人が絵文字を変えて 2 回リアクションしても 1 人と数える。新しい順。 */
export const groupActors = (events: readonly NostrEvent[]): string[] => [
  ...new Set(events.map((event) => event.pubkey)),
];
