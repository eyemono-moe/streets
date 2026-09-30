import {
  type Poll,
  type PollTally,
  isPollClosed,
  pollDeadlineLabel,
} from "@streets/core/nostr/poll";
import { type Component, For, Show, createSignal } from "solid-js";
import type { EventSize } from "../note/Event";
import Button from "../ui/Button";

export type PollViewProps = {
  poll: Poll;
  /** 取り終える前は undefined。「集計中」と「まだ誰も投票していない」を分ける。 */
  tally: PollTally | undefined;
  nowSeconds: number;
  size: EventSize;
  /** 投票できる人（ログインしている）か。 */
  canVote: boolean;
  sending: boolean;
  onVote: (choices: string[]) => void;
};

const percent = (count: number, voters: number) =>
  voters === 0 ? 0 : Math.round((count / voters) * 100);

/**
 * 投票（NIP-88）。選んでから「投票する」を押す。投票した後・締め切った後・
 * 引用の中では、選択肢ごとの割合を出す。
 */
const PollView: Component<PollViewProps> = (props) => {
  const [picked, setPicked] = createSignal<string[]>([]);
  const closed = () => isPollClosed(props.poll, props.nowSeconds);
  const voting = () =>
    props.size === "normal" &&
    props.canVote &&
    !closed() &&
    props.tally?.mine === undefined;
  const toggle = (id: string, on: boolean) =>
    setPicked((current) =>
      props.poll.multiple
        ? on
          ? [...current, id]
          : current.filter((other) => other !== id)
        : [id],
    );
  const summary = () => {
    const parts: string[] = [];
    parts.push(
      props.tally === undefined ? "集計中…" : `${props.tally.voters} 人が投票`,
    );
    const deadline = pollDeadlineLabel(props.poll, props.nowSeconds);
    if (deadline) parts.push(deadline);
    if (voting()) parts.push(props.poll.multiple ? "いくつでも" : "1 つ選ぶ");
    return parts.join(" · ");
  };
  const leading = () => {
    const counts = props.tally?.counts;
    if (!counts) return undefined;
    const max = Math.max(...Object.values(counts));
    return max > 0 ? max : undefined;
  };

  return (
    <div class="flex flex-col gap-1.5">
      <Show
        when={voting()}
        fallback={
          <For each={props.poll.options}>
            {(option) => {
              const count = () => props.tally?.counts[option.id] ?? 0;
              const mine = () =>
                props.tally?.mine?.includes(option.id) ?? false;
              const share = () => percent(count(), props.tally?.voters ?? 0);
              return (
                <div class="relative flex min-h-9 items-center gap-2 overflow-hidden rounded-2 bg-secondary px-3 py-1.5">
                  <Show when={props.tally}>
                    <span
                      class="absolute inset-y-0 left-0"
                      classList={{
                        "bg-accent-5/25": mine(),
                        "bg-tertiary": !mine(),
                      }}
                      style={{ width: `${share()}%` }}
                      aria-hidden="true"
                    />
                  </Show>
                  <span
                    class="c-primary relative min-w-0 flex-1 break-words text-body"
                    classList={{ "font-600": count() === leading() }}
                  >
                    {option.label}
                  </span>
                  <Show when={mine()}>
                    <span
                      class="i-material-symbols:check-circle-rounded c-accent-5 relative size-4 shrink-0"
                      role="img"
                      aria-label="あなたの票"
                    />
                  </Show>
                  <Show when={props.tally}>
                    <span
                      class="c-secondary relative shrink-0 text-caption"
                      classList={{ "font-600": count() === leading() }}
                    >
                      {share()}%
                    </span>
                  </Show>
                </div>
              );
            }}
          </For>
        }
      >
        <fieldset class="m-0 flex flex-col gap-1.5 border-none p-0">
          <legend class="sr-only">{props.poll.question || "投票"}</legend>
          <For each={props.poll.options}>
            {(option) => {
              const on = () => picked().includes(option.id);
              return (
                <label
                  class="flex min-h-9 cursor-pointer items-center gap-2 rounded-2 border px-2.5 py-1.5 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent-5"
                  classList={{
                    "border-accent-5 bg-accent-5/10": on(),
                    "border-primary": !on(),
                  }}
                >
                  <input
                    type={props.poll.multiple ? "checkbox" : "radio"}
                    name={`poll-${props.poll.id}`}
                    class="size-4 shrink-0 accent-accent-5"
                    checked={on()}
                    disabled={props.sending}
                    onChange={(event) =>
                      toggle(option.id, event.currentTarget.checked)
                    }
                  />
                  <span class="c-primary min-w-0 flex-1 break-words text-body">
                    {option.label}
                  </span>
                </label>
              );
            }}
          </For>
        </fieldset>
      </Show>
      <div class="flex flex-wrap items-center justify-between gap-2">
        <span class="c-secondary text-caption">{summary()}</span>
        <Show when={voting()}>
          <Button
            variant="primary"
            size="sm"
            class="ms-auto"
            disabled={picked().length === 0 || props.sending}
            onClick={() => props.onVote(picked())}
          >
            {props.sending ? "送っています…" : "投票する"}
          </Button>
        </Show>
      </div>
    </div>
  );
};

export default PollView;
