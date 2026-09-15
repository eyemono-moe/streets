import type { EventDraft, Mutation } from "./draft";

const PROFILE_KIND = 0;

/**
 * kind:0 の差分更新。`current` にあり `changes` に無いキーを残す（`lud16` など
 * 他クライアントの値を消さない）。JSON として読めない content は `changes` だけで作り直す。
 */
export const mergeProfile =
  (changes: Record<string, unknown>): Mutation =>
  (current): EventDraft => {
    let base: Record<string, unknown> = {};
    // Stryker disable next-line ConditionalExpression: current が偽になるのは
    // undefined のときだけで、その場合 current.content への参照が例外を
    // 投げても直後の catch がそれを黙って飲み込む (壊れた JSON と同じ扱いに
    // なる) ため、このガードを外しても base は {} のまま変わらない —— 等価。
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
