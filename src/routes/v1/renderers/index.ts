import { defineRenderer } from "../../../core/view/renderer-registry";
import type { EventRenderer } from "../../../core/view/renderer-registry";
import { NoteCompact, NoteFull } from "./Note";
import { ReactionCompact, ReactionFull } from "./Reaction";
import { RepostCompact, RepostFull } from "./Repost";

/**
 * `/v1` が既定で使うレンダラ集合。kind:6 と kind:16 は同じコンポーネント
 * を指す —— 対象の見た目は `EventView` が対象イベント自身の kind から
 * 選ぶので、リポストする側の kind はレンダラの選び方に関係しない。
 */
export const defaultRenderers: readonly EventRenderer[] = [
  defineRenderer({ kind: 1, full: NoteFull, compact: NoteCompact }),
  defineRenderer({ kind: 6, full: RepostFull, compact: RepostCompact }),
  defineRenderer({ kind: 16, full: RepostFull, compact: RepostCompact }),
  defineRenderer({ kind: 7, full: ReactionFull, compact: ReactionCompact }),
];
