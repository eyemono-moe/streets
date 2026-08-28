import { type Accessor, createSignal } from "solid-js";
import type { EventDraft } from "../../core/nostr/build/draft";
import type { NostrEvent } from "../../core/nostr/event";
import {
  WriteFailedError,
  type WriteResult,
  type Writer,
} from "../../core/write/writer";

export type ProjectedWriteHooks = {
  /** 署名と EventStore への挿入が済んだ時点。publish の応答はまだ待たない。 */
  onOptimisticInsert?: (event: NostrEvent) => void;
};

/**
 * `Writer` の楽観挿入を、購読由来の一覧へ重ねるための v1 専用 module。
 *
 * `Writer` 自身は Store までを責務にし、SectionReader ごとの表示方法を
 * 知らない。この module が「まだ購読から戻っていない自分のイベント」の
 * 一覧を持つことで、投稿フォームとイベントアクションが同じ投影経路を使う。
 */
export type ProjectedWriter = {
  publish(draft: EventDraft, hooks?: ProjectedWriteHooks): Promise<WriteResult>;
  optimisticEvents: Accessor<readonly NostrEvent[]>;
  optimisticInsertMs: Accessor<number | undefined>;
};

export const createProjectedWriter = (
  writer: Pick<Writer, "publish">,
): ProjectedWriter => {
  const [optimisticEvents, setOptimisticEvents] = createSignal<NostrEvent[]>(
    [],
  );
  const [optimisticInsertMs, setOptimisticInsertMs] = createSignal<number>();

  return {
    optimisticEvents,
    optimisticInsertMs,
    async publish(draft, hooks) {
      let insertedId: string | undefined;
      try {
        return await writer.publish(draft, {
          onOptimisticInsert(event, startedAt, putResult) {
            if (putResult === "inserted") {
              insertedId = event.id;
              setOptimisticEvents((current) => [event, ...current]);
            }
            setOptimisticInsertMs(performance.now() - startedAt);
            hooks?.onOptimisticInsert?.(event);
          },
        });
      } catch (error) {
        // Writer が Store を戻す条件と同じ条件・同じ id だけを投影から戻す。
        // duplicate は今回追加していないので、既存の成功済み表示へ触れない。
        if (error instanceof WriteFailedError && insertedId !== undefined) {
          const id = insertedId;
          setOptimisticEvents((current) =>
            current.filter((event) => event.id !== id),
          );
        }
        throw error;
      }
    },
  };
};
