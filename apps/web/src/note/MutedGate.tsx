import type { NostrEvent } from "@streets/core/nostr/event";
import { type ParentComponent, Show, createSignal } from "solid-js";
import { useMutes } from "../settings/MuteMediator";
import Button from "../ui/Button";
import type { EventSize } from "./Event";

/** 押して出した投稿の id。行の外に持つのは `ContentWarningGate` と同じ理由。 */
const [revealed, setRevealed] = createSignal<ReadonlySet<string>>(new Set());

/**
 * ミュートに当たる投稿を、押すまで 1 行に畳む。返信先や引用では外側の投稿を残して
 * 中身だけを伏せ、「畳む」にしたカラムでは一覧の行をこれにする。
 */
const MutedGate: ParentComponent<{
  event: NostrEvent;
  /** 偽なら畳まずにそのまま出す。 */
  active?: boolean;
  /** 行の大きさ。アイコンの列を、同じ大きさの投稿のアイコンに揃える。省くと compact。 */
  size?: EventSize;
}> = (props) => {
  const mutes = useMutes();
  const hidden = () =>
    props.active !== false &&
    mutes?.hides(props.event) === true &&
    !revealed().has(props.event.id);
  const normal = () => props.size === "normal";

  return (
    <Show when={hidden()} fallback={props.children}>
      <div
        class="flex items-center bg-primary"
        classList={{ "gap-3 p-3": normal(), "gap-2 p-2": !normal() }}
      >
        {/* アイコン列の幅に置き、下の返信から伸びる線の位置に揃える。 */}
        <span
          class="flex shrink-0 justify-center"
          classList={{ "w-10": normal(), "w-8": !normal() }}
          aria-hidden="true"
        >
          <span class="i-material-symbols:volume-off-outline-rounded c-secondary size-4" />
        </span>
        <p class="c-secondary min-w-0 flex-1 break-words text-caption">
          ミュートしている投稿
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

export default MutedGate;
