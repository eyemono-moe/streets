import type {
  RelayProgress,
  WriteProgress,
} from "@streets/core/write/write-progress";
import type { WriteHooks, Writer } from "@streets/core/write/writer";
import { TROUBLE_DURATION_MS, toaster } from "./toast";
import { actionErrorMessage, markReported } from "./write-errors";
import { showWriteProgress } from "./write-progress-setting";
import { enqueueWrite } from "./write-queue/queue";
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
  quiet: boolean,
  run: (onProgress?: (progress: WriteProgress) => void) => Promise<T>,
): Promise<T> => {
  if (!showWriteProgress()) return run();
  const write = enqueueWrite(label, quiet);
  let progress: WriteProgress | undefined;
  try {
    const result = await run((next) => {
      progress = next;
      write.progress(next);
    });
    write.returned();
    return result;
  } catch (cause) {
    markReported(cause);
    write.failed();
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
  (kind, identifier, mutate, hooks, options) =>
    track(label, false, (onProgress) =>
      writer.replace(
        kind,
        identifier,
        mutate,
        onProgress ? withProgress(hooks, onProgress) : hooks,
        { ...options, settle: "first-accept" },
      ),
    );

/**
 * 書き込みを列に積み、進み具合を列のトーストに出す `Writer`。1 本のリレーが
 * 受け取った時点で返すので、呼び出し側（ダイアログ・ボタン）は遅いリレーを
 * 待たない。全部のリレーの結果が揃ったら「保存しました」と知らせる。
 * `label` は何を書いたか（「リアクション」「リレーの設定」など）。
 */
export const trackWrites = (writer: Tracked, label: string): Tracked => ({
  publish: (draft, hooks, options) =>
    track(label, false, (onProgress) =>
      writer.publish(
        draft,
        onProgress ? withProgress(hooks, onProgress) : hooks,
        { ...options, settle: "first-accept" },
      ),
    ),
  replace: trackedReplace(writer, label),
});

/**
 * 投稿・リアクションのように、書いたものがすぐ画面に出る書き込み。`trackWrites` と
 * 同じく列に積むが、うまくいったときは知らせず、すぐ終われば列のトーストも出さない。
 */
export const trackQuickWrites = (
  writer: Pick<Writer, "publish">,
  label: string,
): Pick<Writer, "publish"> => ({
  publish: (draft, hooks, options) =>
    track(label, true, (onProgress) =>
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
  track(label, false, (onProgress) =>
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
