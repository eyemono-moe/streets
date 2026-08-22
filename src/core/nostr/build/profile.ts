import type { EventDraft, Mutation } from "./draft";

const PROFILE_KIND = 0;

/**
 * kind:0 の差分更新。**`current` に有って `changes` に無いキーを残す** ——
 * 他クライアントが入れた `lud16` (Zap の宛先) などを消さない。
 *
 * `current.content` が JSON として読めなければ `changes` だけにする。
 * 壊れた JSON を保っても誰も得をせず、投げるとプロフィールが永久に
 * 編集できなくなる。
 */
export const mergeProfile =
  (changes: Record<string, unknown>): Mutation =>
  (current): EventDraft => {
    let base: Record<string, unknown> = {};
    if (current) {
      try {
        const parsed: unknown = JSON.parse(current.content);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          base = parsed as Record<string, unknown>;
        }
      } catch {
        // 壊れた JSON。changes だけで作り直す。
      }
    }
    return {
      kind: PROFILE_KIND,
      tags: current?.tags ?? [],
      content: JSON.stringify({ ...base, ...changes }),
    };
  };
