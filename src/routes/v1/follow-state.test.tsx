import { createRoot } from "solid-js";
import { describe, expect, it, vi } from "vitest";
import type { EventDraft } from "../../core/nostr/build/draft";
import type { NostrEvent } from "../../core/nostr/event";
import type { ReplaceableChange } from "../../core/read/event-store";
import type { RelayUrl } from "../../core/relay/relay-connection";
import type { Replacement, WriteResult } from "../../core/write/writer";
import { WriteFailedError } from "../../core/write/writer";
import { createFollowState, followeesFrom } from "./follow-state";

const VIEWER = "a".repeat(64);
const TARGET = "b".repeat(64);
const OTHER = "c".repeat(64);

const event = (tags: string[][]): NostrEvent => ({
  id: "d".repeat(64),
  pubkey: VIEWER,
  created_at: 1,
  kind: 3,
  tags,
  content: "",
  sig: "e".repeat(128),
});

const result = (
  next: NostrEvent,
  rejected: WriteResult["rejected"] = [],
): WriteResult => ({
  event: next,
  accepted: ["wss://ok/" as RelayUrl],
  rejected,
});

describe("FollowState", () => {
  it("kind:3 の有効な p タグを重複なく読む", () => {
    // 捕まえる変異: p 以外・壊れた公開鍵を含める、または同じ相手を重複表示する。
    expect(
      followeesFrom(
        event([
          ["p", TARGET],
          ["p", TARGET, "wss://relay/"],
          ["e", OTHER],
          ["p", "invalid"],
          ["p", OTHER],
        ]),
      ),
    ).toEqual([TARGET, OTHER]);
  });

  it("現在の kind:3 の置き換えをホーム用アクセサへ反映する", () => {
    // 捕まえる変異: onReplaceableChanged を購読せず、起動時の一覧を固定する。
    createRoot((dispose) => {
      let current = event([["p", TARGET]]);
      let listener: ((change: ReplaceableChange) => void) | undefined;
      const state = createFollowState({
        viewer: VIEWER,
        store: {
          latestReplaceable: () => current,
          onReplaceableChanged: (next) => {
            listener = next;
            return () => {};
          },
        },
        writer: { replace: vi.fn() },
      });
      expect(state.followees()).toEqual([TARGET]);
      current = event([["p", OTHER]]);
      listener?.({ kind: 3, pubkey: VIEWER });
      expect(state.followees()).toEqual([OTHER]);
      dispose();
    });
  });

  it("フォローと解除を Writer.replace の kind:3 mutation へ渡す", async () => {
    // 捕まえる変異: follow と unfollow の mutation を逆にする、または
    // kind:3 以外へ保存する。
    await new Promise<void>((resolve, reject) => {
      createRoot((dispose) => {
        void (async () => {
          try {
            let current: NostrEvent | undefined = event([]);
            const replace = vi.fn(
              async (
                _kind: number,
                _identifier: string | undefined,
                mutation: Replacement,
              ) => {
                const draft = await mutation(current);
                current = event(draft.tags);
                return result(current);
              },
            );
            const state = createFollowState({
              viewer: VIEWER,
              store: {
                latestReplaceable: () => current,
                onReplaceableChanged: () => () => {},
              },
              writer: { replace },
            });
            await state.follow(TARGET);
            expect(replace).toHaveBeenLastCalledWith(
              3,
              undefined,
              expect.any(Function),
            );
            expect(current?.tags).toContainEqual(["p", TARGET, "", ""]);
            await state.unfollow(TARGET);
            expect(current?.tags).not.toContainEqual(
              expect.arrayContaining(["p", TARGET]),
            );
            resolve();
          } catch (error) {
            reject(error);
          } finally {
            dispose();
          }
        })();
      });
    });
  });

  it("部分失敗を保存済み状態と区別し、同じ操作を再試行する", async () => {
    // 捕まえる変異: rejected があっても成功としてエラーを消す、または
    // 再試行で現在の状態を反転する。
    await new Promise<void>((resolve, reject) => {
      createRoot((dispose) => {
        void (async () => {
          try {
            const drafts: EventDraft[] = [];
            const replace = vi.fn(
              async (
                _kind: number,
                _identifier: string | undefined,
                mutation: Replacement,
              ) => {
                const draft = await mutation(event([["p", TARGET]]));
                drafts.push(draft);
                return result(
                  event(draft.tags),
                  drafts.length === 1
                    ? [{ relay: "wss://ng/" as RelayUrl, reason: "ng" }]
                    : [],
                );
              },
            );
            const state = createFollowState({
              viewer: VIEWER,
              store: {
                latestReplaceable: () => event([["p", TARGET]]),
                onReplaceableChanged: () => () => {},
              },
              writer: { replace },
            });
            await state.follow(TARGET);
            expect(state.error(TARGET)?.kind).toBe("partial");
            await state.retry(TARGET);
            expect(drafts).toHaveLength(2);
            expect(drafts[1]?.tags).toContainEqual(["p", TARGET]);
            expect(state.error(TARGET)).toBeUndefined();
            resolve();
          } catch (error) {
            reject(error);
          } finally {
            dispose();
          }
        })();
      });
    });
  });

  it("全失敗を再試行可能なエラーとして残す", async () => {
    // 捕まえる変異: WriteFailedError を握りつぶし、画面を成功状態にする。
    await new Promise<void>((resolve, reject) => {
      createRoot((dispose) => {
        void (async () => {
          try {
            const replace = vi
              .fn()
              .mockRejectedValue(
                new WriteFailedError([
                  { relay: "wss://ng/" as RelayUrl, reason: "ng" },
                ]),
              );
            const state = createFollowState({
              viewer: VIEWER,
              store: {
                latestReplaceable: () => event([]),
                onReplaceableChanged: () => () => {},
              },
              writer: { replace },
            });
            await state.follow(TARGET);
            expect(state.error(TARGET)).toMatchObject({ kind: "failed" });
            await state.retry(TARGET);
            expect(replace).toHaveBeenCalledTimes(2);
            resolve();
          } catch (error) {
            reject(error);
          } finally {
            dispose();
          }
        })();
      });
    });
  });
});
