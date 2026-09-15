import { type Accessor, createSignal } from "solid-js";
import type { EventDraft } from "../../core/nostr/build/draft";
import type { NostrEvent } from "../../core/nostr/event";
import type { EventStore } from "../../core/read/event-store";
import { matchesAnyFilter } from "../../core/read/filter-match";
import { MAX_ITEMS_PER_SECTION } from "../../core/read/source";
import type { RelayFilter } from "../../core/relay/relay-connection";
import {
  WriteFailedError,
  type WriteResult,
  type Writer,
} from "../../core/write/writer";

export type ProjectedWriteHooks = {
  /** 署名と EventStore への挿入が済んだ時点。publish の応答はまだ待たない。 */
  onOptimisticInsert?: (event: NostrEvent) => void;
};

// SectionReader の表示上限と同じ件数に抑える。成功直後に消すと、先にエコーを
// 受けたカラムを契機に、まだ受けていない別カラムから一瞬消えるため、直近分を
// 保持しつつ履歴と各カラムの照合コストだけを固定する。
const PROJECTED_EVENT_LIMIT = MAX_ITEMS_PER_SECTION;

type ProjectedEntry = {
  event: NostrEvent;
  pending: boolean;
  hidden: boolean;
};

/** 未確定分は残し、成功が確定したイベントだけを表示上限までに切り詰める。 */
const trimSucceededEntries = (
  entries: readonly ProjectedEntry[],
): ProjectedEntry[] => {
  let succeeded = 0;
  return entries.filter((entry) => {
    if (entry.pending) return true;
    succeeded += 1;
    return succeeded <= PROJECTED_EVENT_LIMIT;
  });
};

/**
 * 購読本体へ、まだリレーエコーに載っていない楽観イベントを重ねる。
 * 呼び出し側は根カラムとスレッドの違いを filter だけで表す。
 */
export const mergeProjectedEvents = (
  fromSection: readonly NostrEvent[],
  optimisticEvents: readonly NostrEvent[],
  filters: readonly RelayFilter[],
): NostrEvent[] => {
  const knownIds = new Set(fromSection.map((event) => event.id));
  const optimistic = optimisticEvents.filter(
    (event) => !knownIds.has(event.id) && matchesAnyFilter(event, filters),
  );
  return [...optimistic, ...fromSection];
};

/**
 * `Writer` の楽観挿入を購読由来の一覧へ重ねる module。`Writer` は Store
 * までが責務なので、ここで一覧を持つことで投稿とアクションが経路を共有する。
 */
export type ProjectedWriter = {
  publish(draft: EventDraft, hooks?: ProjectedWriteHooks): Promise<WriteResult>;
  optimisticEvents: Accessor<readonly NostrEvent[]>;
  optimisticInsertMs: Accessor<number | undefined>;
  dispose(): void;
};

export const createProjectedWriter = (
  writer: Pick<Writer, "publish">,
  store: Pick<EventStore, "subscribe">,
): ProjectedWriter => {
  const [entries, setEntries] = createSignal<ProjectedEntry[]>([]);
  const optimisticEvents = () =>
    entries()
      .filter((entry) => !entry.hidden)
      .map((entry) => entry.event);
  const [optimisticInsertMs, setOptimisticInsertMs] = createSignal<number>();
  const offStore = store.subscribe((change) => {
    if (change.type !== "hide" && change.type !== "show") return;
    const hidden = change.type === "hide";
    setEntries((current) =>
      current.map((entry) =>
        entry.event.id === change.event.id ? { ...entry, hidden } : entry,
      ),
    );
  });

  return {
    optimisticEvents,
    optimisticInsertMs,
    dispose: offStore,
    async publish(draft, hooks) {
      let insertedId: string | undefined;
      try {
        const result = await writer.publish(draft, {
          onOptimisticInsert(event, startedAt, putResult) {
            if (putResult === "inserted") {
              insertedId = event.id;
              // ここでは古い成功イベントを追い出さない。今回の publish が
              // 失敗した場合に、無関係な成功イベントを復元できなくなるため。
              setEntries((current) => [
                { event, pending: true, hidden: false },
                ...current,
              ]);
            }
            setOptimisticInsertMs(performance.now() - startedAt);
            hooks?.onOptimisticInsert?.(event);
          },
        });
        if (insertedId !== undefined) {
          const id = insertedId;
          setEntries((current) =>
            trimSucceededEntries(
              current.map((entry) =>
                entry.event.id === id ? { ...entry, pending: false } : entry,
              ),
            ),
          );
        }
        return result;
      } catch (error) {
        // Writer が Store を戻す条件と同じ条件・同じ id だけを投影から戻す。
        // duplicate は今回追加していないので、既存の成功済み表示へ触れない。
        if (error instanceof WriteFailedError && insertedId !== undefined) {
          const id = insertedId;
          setEntries((current) =>
            current.filter((entry) => entry.event.id !== id),
          );
        }
        throw error;
      }
    },
  };
};
