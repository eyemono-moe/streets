import { relayLabel } from "@streets/core/settings/relay-edit";
import type { WriteOutcome } from "@streets/core/view/write-status";
import { writeStatus } from "@streets/core/view/write-status";
import type { WriteProgress } from "@streets/core/write/write-progress";
import { type Component, For, Show } from "solid-js";
import ProgressRing from "./ui/ProgressRing";

/** 書き込みのトーストが持つ中身。`toaster.update` で丸ごと差し替える。 */
export type WriteToastMeta = {
  write: {
    label: string;
    progress?: WriteProgress;
    outcome?: WriteOutcome;
  };
};

/** 書き込みの進み具合。リレーごとの区画の輪と、今の様子と、届かなかったリレー。 */
const WriteProgressToast: Component<{ meta: WriteToastMeta["write"] }> = (
  props,
) => {
  const status = () => writeStatus(props.meta.progress, props.meta.outcome);
  return (
    <div class="flex min-w-0 flex-col gap-1">
      <div class="flex items-center gap-2">
        <Show
          when={status().tone !== "failed"}
          fallback={
            <span
              class="i-material-symbols:error-outline-rounded c-danger size-4.5 shrink-0"
              aria-hidden="true"
            />
          }
        >
          <ProgressRing
            segments={status().relays?.map((entry) =>
              entry.state === "accepted"
                ? "done"
                : entry.state === "rejected"
                  ? "failed"
                  : "pending",
            )}
          />
        </Show>
        <span class="c-primary min-w-0 flex-1 truncate font-600 text-body">
          {props.meta.label}
        </span>
      </div>
      <p class="c-secondary pl-6.5 text-caption" aria-live="polite">
        {status().text}
      </p>
      <Show when={status().failures.length > 0}>
        <ul class="flex flex-col gap-0.5 pl-6.5 text-caption">
          <For each={status().failures}>
            {(failure) => (
              <li class="c-danger break-all">
                {relayLabel(failure.relay)}
                <Show when={failure.reason}>
                  <span class="c-secondary">：{failure.reason}</span>
                </Show>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </div>
  );
};

export default WriteProgressToast;
