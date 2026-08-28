import { describe, expect, it, vi } from "vitest";
import type { NostrEvent } from "../../core/nostr/event";
import type { RelayUrl } from "../../core/relay/relay-connection";
import type { RelayFilter } from "../../core/relay/relay-connection";
import {
  WriteFailedError,
  type WriteHooks,
  type WriteResult,
  type Writer,
} from "../../core/write/writer";
import {
  createProjectedWriter,
  mergeProjectedEvents,
} from "./projected-writer";

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

  it("楽観一覧を表示上限に抑え、長いセッションでも照合量を増やし続けない", async () => {
    const events = Array.from({ length: 201 }, (_, index) =>
      signed(index.toString(16)),
    );
    let call = 0;
    const projected = createProjectedWriter(
      writerWith(async (hooks) => {
        const event = events[call++];
        if (!event) throw new Error("テストイベント不足");
        hooks?.onOptimisticInsert?.(event, performance.now(), "inserted");
        return result(event);
      }),
    );

    for (const event of events) {
      await projected.publish({ kind: 1, tags: [], content: event.content });
    }

    // 捕まえる変異: slice を外して成功イベントを無制限に保持する。長時間の
    // セッションで全カラムが送信履歴全体を毎回照合する。
    expect(projected.optimisticEvents()).toHaveLength(200);
    expect(projected.optimisticEvents()[0]).toBe(events.at(-1));
    expect(projected.optimisticEvents()).not.toContain(events[0]);
  });

  it("上限到達後の失敗で、それ以前の成功イベントを追い出さない", async () => {
    const succeeded = Array.from({ length: 200 }, (_, index) =>
      signed(index.toString(16)),
    );
    const failing = signed("failed");
    const events = [...succeeded, failing];
    let call = 0;
    const projected = createProjectedWriter(
      writerWith(async (hooks) => {
        const event = events[call++];
        if (!event) throw new Error("テストイベント不足");
        hooks?.onOptimisticInsert?.(event, performance.now(), "inserted");
        if (event === failing) {
          throw new WriteFailedError([
            { relay: "wss://relay/" as RelayUrl, reason: "rejected" },
          ]);
        }
        return result(event);
      }),
    );

    for (const event of succeeded) {
      await projected.publish({ kind: 1, tags: [], content: event.content });
    }
    const beforeFailure = [...projected.optimisticEvents()];
    await expect(
      projected.publish({ kind: 1, tags: [], content: "failing" }),
    ).rejects.toBeInstanceOf(WriteFailedError);

    // 捕まえる変異: pending の挿入時点で slice(0, 200) する。失敗イベントを
    // 戻した後は、先に追い出した成功イベントも失われて199件になる。
    expect(projected.optimisticEvents()).toEqual(beforeFailure);
  });
});

describe("mergeProjectedEvents", () => {
  it("スレッドに合う楽観返信だけを重ね、リレーエコーとはidで重複排除する", () => {
    const targetId = "f".repeat(64);
    const echoed = { ...signed("1"), tags: [["e", targetId]] };
    const optimisticReply = { ...signed("2"), tags: [["e", targetId]] };
    const otherReply = {
      ...signed("3"),
      tags: [["e", "e".repeat(64)]],
    };
    const filters: RelayFilter[] = [{ kinds: [1], "#e": [targetId] }];

    const merged = mergeProjectedEvents(
      [echoed],
      [echoed, optimisticReply, otherReply],
      filters,
    );

    // 捕まえる変異: thread source の filter 照合または既知 id の除外を外す。
    // 別スレッドの返信か、リレーから戻った同一返信が開いているスレッドへ混ざる。
    expect(merged).toEqual([optimisticReply, echoed]);
  });
});
