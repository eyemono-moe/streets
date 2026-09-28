import { contentWarning } from "@streets/core/nostr/content-warning";
import type { NostrEvent } from "@streets/core/nostr/event";
import { hidesUnderWarning } from "@streets/core/settings/content-warning-setting";
import { type ParentComponent, Show, createSignal } from "solid-js";
import { contentWarningMode } from "../content-warning-setting";
import Button from "../ui/Button";
import type { EventSize } from "./Event";

/**
 * 押して出した投稿の id。行の外に持つ —— 仮想リストは画面から離れた行を
 * 作り直すので、行の中に持つと戻ってきたときにまた隠れる。
 */
const [revealed, setRevealed] = createSignal<ReadonlySet<string>>(new Set());

/**
 * 注意書き（NIP-36）の付いた投稿の中身を、押すまで描かない。ぼかさずに描かない
 * のは、隠している間に画像を読みにいかせないため。
 */
const ContentWarningGate: ParentComponent<{
  event: NostrEvent;
  size: EventSize;
}> = (props) => {
  const hidden = () =>
    hidesUnderWarning(contentWarningMode(), props.event) &&
    !revealed().has(props.event.id);

  return (
    <Show when={hidden()} fallback={props.children}>
      <div
        class="flex items-center gap-2 rounded-2 bg-secondary"
        classList={{
          "p-3": props.size === "normal",
          "p-2": props.size === "compact",
        }}
      >
        <span
          class="i-material-symbols:warning-outline-rounded c-secondary size-5 shrink-0"
          aria-hidden="true"
        />
        <p class="c-secondary min-w-0 flex-1 break-words text-caption">
          <Show
            when={contentWarning(props.event)?.reason}
            fallback="注意書きが付いています"
          >
            {(reason) => `注意書き：${reason()}`}
          </Show>
        </p>
        <Button
          size="sm"
          variant="secondary"
          class="shrink-0"
          onClick={() => setRevealed((ids) => new Set(ids).add(props.event.id))}
        >
          表示する
        </Button>
      </div>
    </Show>
  );
};

export default ContentWarningGate;
