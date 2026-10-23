import {
  type WriteQueueEvent,
  emptyWriteQueue,
  hasRejections,
  isWriteFinished,
  isWriteUnsaved,
  shouldShowWriteQueue,
  summarizeWriteQueue,
  visibleWrites,
  writeQueueTransition,
} from "@streets/core/view/write-queue";
import type { WriteProgress } from "@streets/core/write/write-progress";
import { createStore, reconcile, unwrap } from "solid-js/store";
import { SAVED_DURATION_MS, TROUBLE_DURATION_MS, toaster } from "../toast";
import type { WriteToastMeta } from "../WriteProgressToast";
import type { WriteQueueToastMeta } from "./WriteQueueToast";

/** 投稿・リアクションの列を出すまで待つ時間。たいていはこの間に終わる。 */
const QUIET_DELAY_MS = 1000;

const [queue, setQueue] = createStore(emptyWriteQueue());

let toastId: string | undefined;
/** 出ている列のトーストが「保存しました」を出し、消えるのを待っている。 */
let showingSaved = false;
/** 送っている間に閉じられた。列が空になるまで出し直さない。 */
let closedByUser = false;

const apply = (event: WriteQueueEvent) =>
  setQueue(
    reconcile(writeQueueTransition(unwrap(queue), event), { key: "id" }),
  );

const put = (
  type: "loading" | "success",
  duration: number,
  meta: WriteQueueToastMeta,
) => {
  if (toastId) {
    toaster.update(toastId, { type, duration, meta });
  } else {
    toastId = toaster.create({
      type,
      duration,
      meta,
    });
  }
};

const sync = () => {
  if (toastId && !toaster.isVisible(toastId)) {
    // 「保存しました」が時間で消えたのでなければ、送っている間に閉じられた。
    if (!showingSaved) closedByUser = true;
    toastId = undefined;
    showingSaved = false;
  }
  if (queue.writes.length === 0) closedByUser = false;

  const summary = summarizeWriteQueue(queue);
  if (summary?.tone === "saved") {
    apply({ type: "write-queue/acknowledged" });
    put("success", SAVED_DURATION_MS, { writeQueue: { summary, writes: [] } });
    showingSaved = true;
    return;
  }
  if (
    summary &&
    !closedByUser &&
    shouldShowWriteQueue(queue, performance.now(), QUIET_DELAY_MS)
  ) {
    const writes = structuredClone(visibleWrites(unwrap(queue)));
    put("loading", Number.POSITIVE_INFINITY, {
      writeQueue: { summary, writes },
    });
    showingSaved = false;
    return;
  }
  // 知らせない書き込みだけが終えた、署名待ちだけになった。出ている「保存しました」は消えるまで残す。
  if (toastId && !showingSaved) {
    toaster.remove(toastId);
    toastId = undefined;
  }
};

const dispatch = (event: WriteQueueEvent) => {
  apply(event);
  // 全部のリレーの結果が揃った書き込みを列から外す。断ったリレーがあれば、
  // 列のトーストとは別に、理由を読めるだけ長く残す。
  for (const write of structuredClone(unwrap(queue).writes)) {
    if (!isWriteFinished(write)) continue;
    if (hasRejections(write)) {
      toaster.create({
        type: "success",
        title: write.label,
        duration: TROUBLE_DURATION_MS,
        meta: {
          write: {
            label: write.label,
            progress: write.progress,
            outcome: { kind: "done" },
          },
        } satisfies WriteToastMeta,
      });
    }
    apply({ type: "write-queue/finished", id: write.id });
  }
  sync();
};

let nextId = 0;

export type QueuedWriteHandle = {
  progress: (progress: WriteProgress) => void;
  /** 呼び出し側へ返した。残りのリレーの結果は `progress` で届き続ける。 */
  returned: () => void;
  failed: () => void;
};

/**
 * 書き込みを列に積む。`quiet` は、書いたものがすぐ画面に出るので、うまく
 * いったときは知らせない書き込み。
 */
export const enqueueWrite = (
  label: string,
  quiet: boolean,
): QueuedWriteHandle => {
  nextId += 1;
  const id = String(nextId);
  dispatch({
    type: "write-queue/start",
    id,
    label,
    quiet,
    at: performance.now(),
  });
  if (quiet) setTimeout(sync, QUIET_DELAY_MS);
  return {
    progress: (progress) =>
      dispatch({ type: "write-queue/progress", id, progress }),
    returned: () => dispatch({ type: "write-queue/returned", id }),
    failed: () => dispatch({ type: "write-queue/failed", id }),
  };
};

// どのリレーにも届いていない書き込みがある間にタブを閉じると、書いたものが
// どこにも残らない。1 本でも届いていれば、残りへ送れなくても止めない。
window.addEventListener("beforeunload", (event) => {
  if (queue.writes.some(isWriteUnsaved)) event.preventDefault();
});
