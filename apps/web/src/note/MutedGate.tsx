import type { NostrEvent } from "@streets/core/nostr/event";
import { type ParentComponent, Show, createSignal } from "solid-js";
import { useMutes } from "../settings/MuteMediator";
import Button from "../ui/Button";

/** 押して出した投稿の id。行の外に持つのは `ContentWarningGate` と同じ理由。 */
const [revealed, setRevealed] = createSignal<ReadonlySet<string>>(new Set());

/**
 * 返信先や引用として出す投稿が、ミュートの対象に当たるときは押すまで 1 行に畳む。
 * 外側の投稿は隠さないので、何かを指していたことは残し、中身だけを伏せる。
 */
const MutedGate: ParentComponent<{ event: NostrEvent }> = (props) => {
  const mutes = useMutes();
  const hidden = () =>
    mutes?.hides(props.event) === true && !revealed().has(props.event.id);

  return (
    <Show when={hidden()} fallback={props.children}>
      <div class="flex items-center gap-2 bg-primary p-2">
        {/* アイコン列の幅に置き、下の返信から伸びる線の位置に揃える。 */}
        <span class="flex w-8 shrink-0 justify-center" aria-hidden="true">
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
