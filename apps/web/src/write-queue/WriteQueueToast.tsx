import { Collapsible } from "@ark-ui/solid/collapsible";
import type {
  LabelCount,
  QueuedWrite,
  WriteQueueSummary,
} from "@streets/core/view/write-queue";
import { writeStatus } from "@streets/core/view/write-status";
import { summarizeRelays } from "@streets/core/write/write-progress";
import { type Component, For, Show } from "solid-js";
import { t } from "../i18n/locale";
import Button from "../ui/Button";
import ProgressRing, { type RingCounts } from "../ui/ProgressRing";

/** 列のトーストが持つ中身。`toaster.update` で丸ごと差し替える。 */
export type WriteQueueToastMeta = {
  writeQueue: { summary: WriteQueueSummary; writes: QueuedWrite[] };
};

const labelsText = (labels: readonly LabelCount[]) =>
  labels
    .map(({ label, count }) =>
      count > 1 ? t("write-queue.labelCount", { label, count }) : label,
    )
    .join(t("write-queue.labelSeparator"));

const ringOf = (write: QueuedWrite): RingCounts | undefined => {
  if (write.progress?.phase !== "sending") return undefined;
  const summary = summarizeRelays(write.progress.relays);
  return {
    done: summary.accepted,
    failed: summary.rejected,
    pending: summary.pending,
  };
};

/** 送っている書き込みをまとめた 1 枚。開くと 1 件ずつの様子を並べる。 */
const WriteQueueToast: Component<{
  meta: WriteQueueToastMeta["writeQueue"];
  /** 内訳を開いた状態で出す。ストーリーで中身を並べるため。 */
  defaultDetailsOpen?: boolean;
}> = (props) => {
  const working = () =>
    props.meta.summary.tone === "working" ? props.meta.summary : undefined;
  return (
    <div class="flex min-w-0 flex-col gap-1">
      <div class="flex items-center gap-2">
        <Show
          when={working()}
          fallback={
            <span
              class="i-material-symbols:check-circle-outline-rounded c-accent-5 size-4.5 shrink-0"
              aria-hidden="true"
            />
          }
        >
          {(summary) => <ProgressRing counts={summary().counts} />}
        </Show>
        <span class="c-primary min-w-0 flex-1 truncate font-600 text-body">
          {working()
            ? t("write-queue.sending", { count: working()?.total ?? 0 })
            : t("write-queue.saved")}
        </span>
      </div>
      <p class="c-secondary pl-6.5 text-caption break-anywhere">
        {labelsText(props.meta.summary.labels)}
      </p>
      <Show when={working()}>
        {(summary) => (
          <p class="c-secondary pl-6.5 text-caption" aria-live="polite">
            {summary().unsaved > 0
              ? t("write-queue.unsaved", { count: summary().unsaved })
              : t("write-queue.delivering")}
          </p>
        )}
      </Show>
      <Show when={props.meta.writes.length > 0}>
        <Collapsible.Root
          lazyMount
          unmountOnExit
          defaultOpen={props.defaultDetailsOpen}
          class="pl-6.5"
        >
          <Collapsible.Trigger
            asChild={(trigger) => (
              <Button {...trigger()} size="sm" variant="ghost">
                {t("write-queue.details")}
              </Button>
            )}
          />
          <Collapsible.Content class="motion-collapse">
            <ul class="flex flex-col gap-1.5 pt-1 text-caption">
              <For each={props.meta.writes}>
                {(write) => (
                  <li class="flex items-start gap-2">
                    <ProgressRing counts={ringOf(write)} />
                    <div class="flex min-w-0 flex-1 flex-col">
                      <span class="c-primary truncate">{write.label}</span>
                      <span class="c-secondary">
                        {writeStatus(write.progress).text}
                      </span>
                    </div>
                  </li>
                )}
              </For>
            </ul>
          </Collapsible.Content>
        </Collapsible.Root>
      </Show>
    </div>
  );
};

export default WriteQueueToast;
