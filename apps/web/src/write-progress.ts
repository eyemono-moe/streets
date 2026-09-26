import type { WriteProgress } from "@streets/core/write/write-progress";
import { summarizeRelays } from "@streets/core/write/write-progress";
import type { WriteHooks, Writer } from "@streets/core/write/writer";
import { toaster } from "./toast";
import { actionErrorMessage, markReported } from "./write-errors";
import { showWriteProgress } from "./write-progress-setting";
import type { WriteToastMeta } from "./WriteProgressToast";

type Tracked = Pick<Writer, "publish" | "replace">;

const SAVED_DURATION_MS = 2500;
/** 届かなかったリレーがあるときは、読めるだけ長く出す。 */
const TROUBLE_DURATION_MS = 8000;

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
        // 署名器の確認中は中央の待機表示に譲り、同じ待機をトーストに重ねない。
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

/** 置換だけを使う書き手（デッキ・リレーの設定）向け。 */
export const trackReplaces = (
  writer: Pick<Writer, "replace">,
  label: string,
): Pick<Writer, "replace"> => ({ replace: trackedReplace(writer, label) });
