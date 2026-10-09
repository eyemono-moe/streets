import type {
  RelayProgress,
  WriteProgress,
} from "@streets/core/write/write-progress";
import { summarizeRelays } from "@streets/core/write/write-progress";
import type { WriteHooks, Writer } from "@streets/core/write/writer";
import { SAVED_DURATION_MS, TROUBLE_DURATION_MS, toaster } from "./toast";
import { actionErrorMessage, markReported } from "./write-errors";
import { showWriteProgress } from "./write-progress-setting";
import type { WriteToastMeta } from "./WriteProgressToast";

type Tracked = Pick<Writer, "publish" | "replace">;

const withProgress = (
  hooks: WriteHooks | undefined,
  onProgress: (progress: WriteProgress) => void,
): WriteHooks => ({
  ...hooks,
  onProgress: (progress) => {
    hooks?.onProgress?.(progress);
    onProgress(progress);
  },
});

const track = async <T>(
  label: string,
  run: (onProgress?: (progress: WriteProgress) => void) => Promise<T>,
): Promise<T> => {
  if (!showWriteProgress()) return run();
  let progress: WriteProgress | undefined;
  const meta = (write: WriteToastMeta["write"]): WriteToastMeta => ({ write });
  let id: string | undefined;
  const show = (
    write: WriteToastMeta["write"],
    type: "loading" | "success" | "error" = "loading",
  ) => {
    if (id) {
      toaster.update(id, { type, meta: meta(write) });
    } else {
      id = toaster.create({
        type,
        title: label,
        duration: Number.POSITIVE_INFINITY,
        meta: meta(write),
      });
    }
  };
  try {
    const result = await run((next) => {
      progress = next;
      if (next.phase === "signing") {
        // 署名器の確認中は承認待ちのトーストに譲り、同じ待ちを 2 枚に重ねない。
        if (id) toaster.remove(id);
        id = undefined;
      } else {
        show({ label, progress });
      }
    });
    const troubled =
      progress?.phase === "sending" &&
      summarizeRelays(progress.relays).rejected > 0;
    show({ label, progress, outcome: { kind: "done" } }, "success");
    if (id)
      toaster.update(id, {
        type: "success",
        duration: troubled ? TROUBLE_DURATION_MS : SAVED_DURATION_MS,
      });
    return result;
  } catch (cause) {
    markReported(cause);
    show(
      {
        label,
        progress,
        outcome: { kind: "failed", message: actionErrorMessage(cause) },
      },
      "error",
    );
    if (id)
      toaster.update(id, {
        type: "error",
        duration: TROUBLE_DURATION_MS,
      });
    throw cause;
  }
};

/**
 * 成功を知らせない書き込み。書いたものは画面に出るので、うまくいったときは何も出さない。
 * 終えた後に届いた残りのリレーの結果も見て、断ったリレーがあればそのときだけ出す。
 */
const trackQuietly = async <T>(
  label: string,
  run: (onProgress?: (progress: WriteProgress) => void) => Promise<T>,
): Promise<T> => {
  if (!showWriteProgress()) return run();
  let progress: WriteProgress | undefined;
  let settled = false;
  let reported = false;
  const reportTrouble = () => {
    if (reported || progress?.phase !== "sending") return;
    const summary = summarizeRelays(progress.relays);
    if (!summary.finished || summary.rejected === 0) return;
    reported = true;
    toaster.create({
      type: "success",
      title: label,
      duration: TROUBLE_DURATION_MS,
      meta: {
        write: { label, progress, outcome: { kind: "done" } },
      } satisfies WriteToastMeta,
    });
  };
  try {
    const result = await run((next) => {
      progress = next;
      if (settled) reportTrouble();
    });
    settled = true;
    reportTrouble();
    return result;
  } catch (cause) {
    markReported(cause);
    toaster.create({
      type: "error",
      title: label,
      duration: TROUBLE_DURATION_MS,
      meta: {
        write: {
          label,
          progress,
          outcome: { kind: "failed", message: actionErrorMessage(cause) },
        },
      } satisfies WriteToastMeta,
    });
    throw cause;
  }
};

const trackedReplace =
  (writer: Pick<Writer, "replace">, label: string): Writer["replace"] =>
  (kind, identifier, mutate, hooks) =>
    track(label, (onProgress) =>
      writer.replace(
        kind,
        identifier,
        mutate,
        onProgress ? withProgress(hooks, onProgress) : hooks,
      ),
    );

/**
 * 書き込みの進み具合をトーストに出す `Writer`。1 回の書き込みにつき 1 枚を出し、
 * リレーごとの結果が届くたびに差し替える。設定で切っているときは、そのまま通す。
 * `label` は何を書いたか（「リアクション」「リレーの設定」など）。
 */
export const trackWrites = (writer: Tracked, label: string): Tracked => ({
  publish: (draft, hooks, options) =>
    track(label, (onProgress) =>
      writer.publish(
        draft,
        onProgress ? withProgress(hooks, onProgress) : hooks,
        options,
      ),
    ),
  replace: trackedReplace(writer, label),
});

/**
 * 投稿・リアクションのように、書いたものがすぐ画面に出る書き込み。1 本のリレーが
 * 受け取った時点で終え、うまくいったときはトーストを出さない。断ったリレーがある・
 * 全部失敗したときだけ、`trackWrites` と同じトーストで知らせる。
 */
export const trackQuickWrites = (
  writer: Pick<Writer, "publish">,
  label: string,
): Pick<Writer, "publish"> => ({
  publish: (draft, hooks, options) =>
    trackQuietly(label, (onProgress) =>
      writer.publish(
        draft,
        onProgress ? withProgress(hooks, onProgress) : hooks,
        { ...options, settle: "first-accept" },
      ),
    ),
});

/**
 * 署名せずに送るもの（見かけたイベントの送り直し）の進み具合を、書き込みと同じ
 * トーストに出す。
 */
export const trackSends = <T>(
  label: string,
  run: (onProgress?: (relays: RelayProgress[]) => void) => Promise<T>,
): Promise<T> =>
  track(label, (onProgress) =>
    run(
      onProgress
        ? (relays) => onProgress({ phase: "sending", relays })
        : undefined,
    ),
  );

/** 置換だけを使う書き手（デッキ・リレーの設定）向け。 */
export const trackReplaces = (
  writer: Pick<Writer, "replace">,
  label: string,
): Pick<Writer, "replace"> => ({ replace: trackedReplace(writer, label) });
