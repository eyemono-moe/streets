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

/** 押して中身を出す。一覧に戻っても、同じ投稿は出したままにする。 */
export const revealWarning = (id: string) =>
  setRevealed((ids) => new Set(ids).add(id));

/** 今の設定で中身を隠しているか。押して出したものは隠さない。 */
export const hiddenUnderWarning = (event: NostrEvent): boolean =>
  hidesUnderWarning(contentWarningMode(), event) && !revealed().has(event.id);

/** 中身の代わりに出す 1 行。 */
export const warningLabel = (event: NostrEvent): string => {
  const reason = contentWarning(event)?.reason;
  return reason ? `閲覧注意：${reason}` : "閲覧注意";
};

/**
 * 閲覧注意（NIP-36）の付いた投稿の中身を、押すまで描かない。ぼかさずに描かない
 * のは、隠している間に画像を読みにいかせないため。
 */
const ContentWarningGate: ParentComponent<{
  event: NostrEvent;
  size: EventSize;
}> = (props) => {
  return (
    <Show when={hiddenUnderWarning(props.event)} fallback={props.children}>
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
          {warningLabel(props.event)}
        </p>
        <Button
          size="sm"
          variant="secondary"
          class="shrink-0"
          onClick={() => revealWarning(props.event.id)}
        >
          表示する
        </Button>
      </div>
    </Show>
  );
};

export default ContentWarningGate;
