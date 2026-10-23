import type {
  LabelCount,
  WriteQueueSummary,
} from "@streets/core/view/write-queue";
import { type Component, For, Match, Switch } from "solid-js";
import { t } from "../i18n/locale";
import ProgressRing from "../ui/ProgressRing";

/** 列のトーストが持つ中身。`toaster.update` で丸ごと差し替える。 */
export type WriteQueueToastMeta = { writeQueue: WriteQueueSummary };

const labelText = ({ label, count }: LabelCount) =>
  count > 1 ? t("write-queue.labelCount", { label, count }) : label;

/**
 * 送っている書き込みをまとめた 1 枚。種類ごとのチップに、その種類の輪を付ける。
 * 1 件ずつの行は並べない。件数が増えると、トーストが画面からはみ出す。
 */
const WriteQueueToast: Component<{ summary: WriteQueueSummary }> = (props) => (
  <Switch>
    <Match when={props.summary.tone === "working" ? props.summary : undefined}>
      {(summary) => (
        <div class="flex min-w-0 flex-col gap-2">
          <div class="flex items-center gap-2">
            <ProgressRing counts={summary().counts} />
            <span
              class="c-primary min-w-0 flex-1 truncate font-600 text-body"
              aria-live="polite"
            >
              {t("write-queue.sending", { count: summary().total })}
            </span>
          </div>
          <ul class="flex flex-wrap gap-1.5">
            <For each={summary().labels}>
              {(group) => (
                <li class="c-primary flex max-w-full items-center gap-1 rounded-full border border-control py-0.5 pr-2 pl-1.5 text-caption">
                  <ProgressRing counts={group.counts} size="sm" />
                  <span class="truncate">{labelText(group)}</span>
                </li>
              )}
            </For>
          </ul>
        </div>
      )}
    </Match>
    <Match when={props.summary.tone === "saved"}>
      <div class="flex min-w-0 flex-col gap-1">
        <div class="flex items-center gap-2">
          <span
            class="i-material-symbols:check-circle-outline-rounded c-accent-5 size-4.5 shrink-0"
            aria-hidden="true"
          />
          <span class="c-primary min-w-0 flex-1 truncate font-600 text-body">
            {t("write-queue.saved")}
          </span>
        </div>
        <p class="c-secondary pl-6.5 text-caption break-anywhere">
          {props.summary.labels
            .map(labelText)
            .join(t("write-queue.labelSeparator"))}
        </p>
      </div>
    </Match>
  </Switch>
);

export default WriteQueueToast;
