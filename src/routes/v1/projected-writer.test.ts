import { describe, expect, it, vi } from "vitest";
import type { NostrEvent } from "../../core/nostr/event";
import type { RelayUrl } from "../../core/relay/relay-connection";
import {
  WriteFailedError,
  type WriteHooks,
  type WriteResult,
  type Writer,
} from "../../core/write/writer";
import { createProjectedWriter } from "./projected-writer";

const signed = (id: string): NostrEvent => ({
  id: id.repeat(64),
  pubkey: "a".repeat(64),
  created_at: 1,
  kind: 1,
  tags: [],
  content: id,
  sig: "b".repeat(128),
});

const result = (event: NostrEvent): WriteResult => ({
  event,
  accepted: ["wss://relay/" as RelayUrl],
  rejected: [],
});

const writerWith = (
  implementation: (hooks: WriteHooks | undefined) => Promise<WriteResult>,
): Pick<Writer, "publish"> => ({
  publish: (_draft, hooks) => implementation(hooks),
});

describe("createProjectedWriter", () => {
  it("inserted だけを楽観一覧へ積み、duplicate は二重にしない", async () => {
    const first = signed("1");
    const duplicate = signed("2");
    let call = 0;
    const projected = createProjectedWriter(
      writerWith(async (hooks) => {
        const event = call++ === 0 ? first : duplicate;
        hooks?.onOptimisticInsert?.(
          event,
          performance.now(),
          event === first ? "inserted" : "duplicate",
        );
        return result(event);
      }),
    );

    await projected.publish({ kind: 1, tags: [], content: "first" });
    await projected.publish({ kind: 1, tags: [], content: "duplicate" });

    // 捕まえる変異: putResult を見ず duplicate も一覧へ積む。同じ秒・本文の
    // 再送で同じ id の行が二つ描かれる。
    expect(projected.optimisticEvents()).toEqual([first]);
    expect(projected.optimisticInsertMs()).toBeGreaterThanOrEqual(0);
  });

  it("全リレー失敗時は今回 inserted したイベントだけを戻す", async () => {
    const previous = signed("1");
    const failing = signed("2");
    let call = 0;
    const projected = createProjectedWriter(
      writerWith(async (hooks) => {
        const event = call++ === 0 ? previous : failing;
        hooks?.onOptimisticInsert?.(event, performance.now(), "inserted");
        if (event === failing) {
          throw new WriteFailedError([
            { relay: "wss://relay/" as RelayUrl, reason: "rejected" },
          ]);
        }
        return result(event);
      }),
    );

    await projected.publish({ kind: 1, tags: [], content: "previous" });
    await expect(
      projected.publish({ kind: 1, tags: [], content: "failing" }),
    ).rejects.toBeInstanceOf(WriteFailedError);

    // 捕まえる変異: 失敗時に一覧を全消去する。以前に成功したイベントまで
    // カラムから消える。
    expect(projected.optimisticEvents()).toEqual([previous]);
  });

  it("署名後の楽観挿入を呼び出し側へ知らせる", async () => {
    const event = signed("1");
    const onOptimisticInsert = vi.fn();
    const projected = createProjectedWriter(
      writerWith(async (hooks) => {
        hooks?.onOptimisticInsert?.(event, performance.now(), "duplicate");
        return result(event);
      }),
    );

    await projected.publish(
      { kind: 1, tags: [], content: "clear the form" },
      { onOptimisticInsert },
    );

    // 捕まえる変異: duplicate では callback を呼ばない。同一イベントの再送で
    // publish は進んでいるのに投稿フォームだけがクリアされない。
    expect(onOptimisticInsert).toHaveBeenCalledWith(event);
  });
});
