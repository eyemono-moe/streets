import {
  type ProgressSummary,
  type WriteProgress,
  summarizeRelays,
} from "../write/write-progress";

export type QueuedWrite = {
  id: string;
  /** 何を書いたか（「投稿」「リアクション」など）。 */
  label: string;
  /** 書いたものがすぐ画面に出る書き込み。うまくいったときは知らせない。 */
  quiet: boolean;
  /** 列に入った時刻（ミリ秒）。 */
  startedAt: number;
  progress?: WriteProgress;
  /** 呼び出し側へ返した（1 本のリレーが受け取った）。 */
  returned: boolean;
};

export type WriteQueueState = {
  writes: QueuedWrite[];
  /** 列が空になるまでの間に保存できた、知らせる書き込みの名前。 */
  saved: string[];
};

export type WriteQueueEvent =
  | {
      type: "write-queue/start";
      id: string;
      label: string;
      quiet: boolean;
      at: number;
    }
  | { type: "write-queue/progress"; id: string; progress: WriteProgress }
  | { type: "write-queue/returned"; id: string }
  /** 全部のリレーの結果が揃った。 */
  | { type: "write-queue/finished"; id: string }
  /** どのリレーにも届かなかった、署名できなかったなど。 */
  | { type: "write-queue/failed"; id: string }
  /** 保存できたことを知らせ終えた。 */
  | { type: "write-queue/acknowledged" };

export const emptyWriteQueue = (): WriteQueueState => ({
  writes: [],
  saved: [],
});

const without = (state: WriteQueueState, id: string) =>
  state.writes.filter((write) => write.id !== id);

export const writeQueueTransition = (
  state: WriteQueueState,
  event: WriteQueueEvent,
): WriteQueueState => {
  switch (event.type) {
    case "write-queue/start":
      return {
        ...state,
        writes: [
          ...state.writes,
          {
            id: event.id,
            label: event.label,
            quiet: event.quiet,
            startedAt: event.at,
            returned: false,
          },
        ],
      };
    case "write-queue/progress":
      return {
        ...state,
        writes: state.writes.map((write) =>
          write.id === event.id
            ? { ...write, progress: event.progress }
            : write,
        ),
      };
    case "write-queue/returned":
      return {
        ...state,
        writes: state.writes.map((write) =>
          write.id === event.id ? { ...write, returned: true } : write,
        ),
      };
    case "write-queue/finished": {
      const write = state.writes.find((entry) => entry.id === event.id);
      if (!write) return state;
      // 断ったリレーがあった書き込みは、理由を添えて別に知らせるので数えない。
      return {
        writes: without(state, event.id),
        saved:
          write.quiet || hasRejections(write)
            ? [...state.saved]
            : [...state.saved, write.label],
      };
    }
    case "write-queue/failed":
      return { ...state, writes: without(state, event.id) };
    case "write-queue/acknowledged":
      return { ...state, saved: [] };
  }
};

const relaySummary = (write: QueuedWrite): ProgressSummary | undefined =>
  write.progress?.phase === "sending"
    ? summarizeRelays(write.progress.relays)
    : undefined;

/** 断ったリレーがある。終えたときに、理由を添えて別に知らせる。 */
export const hasRejections = (write: QueuedWrite): boolean =>
  (relaySummary(write)?.rejected ?? 0) > 0;

/**
 * 全部のリレーの結果が揃ったか。呼び出し側へ返す前は揃っていても終えない
 * （返す前に列から消すと、返した知らせが行き場を失う）。
 */
export const isWriteFinished = (write: QueuedWrite): boolean => {
  if (!write.returned) return false;
  const summary = relaySummary(write);
  return summary === undefined || summary.finished;
};

/** まだどのリレーにも届いていない。ここでタブを閉じると、書いたものが残らない。 */
export const isWriteUnsaved = (write: QueuedWrite): boolean =>
  !(relaySummary(write)?.saved ?? false);

export type LabelCount = { label: string; count: number };

/** 同じ名前の書き込みを数える。出てきた順に並べる。 */
export const countLabels = (labels: readonly string[]): LabelCount[] => {
  const counts = new Map<string, number>();
  for (const label of labels) counts.set(label, (counts.get(label) ?? 0) + 1);
  return [...counts].map(([label, count]) => ({ label, count }));
};

/**
 * 列のトーストに出す書き込み。署名を待っている書き込みは署名器の承認待ちの
 * トーストが知らせているので、ここには出さない。
 */
export const visibleWrites = (state: WriteQueueState): QueuedWrite[] =>
  state.writes.filter((write) => write.progress?.phase !== "signing");

/**
 * 列のトーストを出すか。知らせる書き込みはすぐに出す。知らせない書き込み
 * （投稿・リアクション）は、`delayMs` 経っても残っているときだけ出す。
 * 速く終わる書き込みのたびにトーストがちらつかないようにするため。
 */
export const shouldShowWriteQueue = (
  state: WriteQueueState,
  now: number,
  delayMs: number,
): boolean =>
  visibleWrites(state).some(
    (write) => !write.quiet || now - write.startedAt >= delayMs,
  );

export type WriteQueueSummary =
  | {
      tone: "working";
      /** 送っている件数。 */
      total: number;
      /** そのうち、まだどのリレーにも届いていない件数。 */
      unsaved: number;
      labels: LabelCount[];
      /** 輪に出す、全部の書き込みのリレーの数の合計。 */
      counts?: { done: number; failed: number; pending: number };
    }
  | { tone: "saved"; labels: LabelCount[] };

export const summarizeWriteQueue = (
  state: WriteQueueState,
): WriteQueueSummary | undefined => {
  const writes = visibleWrites(state);
  if (writes.length === 0) {
    if (state.saved.length === 0) return undefined;
    return { tone: "saved", labels: countLabels(state.saved) };
  }
  const counts = writes.reduce(
    (sum, write) => {
      const summary = relaySummary(write);
      return summary
        ? {
            done: sum.done + summary.accepted,
            failed: sum.failed + summary.rejected,
            pending: sum.pending + summary.pending,
          }
        : sum;
    },
    { done: 0, failed: 0, pending: 0 },
  );
  return {
    tone: "working",
    total: writes.length,
    unsaved: writes.filter(isWriteUnsaved).length,
    labels: countLabels(writes.map((write) => write.label)),
    counts:
      counts.done + counts.failed + counts.pending > 0 ? counts : undefined,
  };
};
