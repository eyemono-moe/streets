import type { NostrEvent } from "@streets/core/nostr/event";
import { parsePoll, tallyPoll } from "@streets/core/nostr/poll";
import {
  type Component,
  Show,
  createEffect,
  createSignal,
  onCleanup,
} from "solid-js";
import { useEventActions } from "../actions";
import { useSending } from "../actions-mediator";
import type { EventSize } from "../note/Event";
import { Notice } from "../note/EventFrame";
import { useReadLayer } from "../read-layer";
import { useDispatch } from "../ui-events";
import PollView from "./PollView";

/** 残り時間の表示と締め切りの判定を、この間隔で進める。 */
const CLOCK_MS = 60_000;

/** 投票を読み、回答を集めて `PollView` に渡す。投票は上の段へ渡す。 */
const PollBlock: Component<{ event: NostrEvent; size: EventSize }> = (
  props,
) => {
  const { lookups } = useReadLayer();
  const actions = useEventActions();
  const dispatch = useDispatch();
  const poll = () => parsePoll(props.event);
  const [responses, setResponses] = createSignal<NostrEvent[]>([]);
  const [settled, setSettled] = createSignal(false);
  const [now, setNow] = createSignal(Math.floor(Date.now() / 1000));
  const timer = setInterval(
    () => setNow(Math.floor(Date.now() / 1000)),
    CLOCK_MS,
  );
  onCleanup(() => clearInterval(timer));

  createEffect(() => {
    const current = poll();
    if (!current) return;
    onCleanup(
      lookups.watchPollResponses(current, (list, done) => {
        setResponses(list);
        setSettled(done);
      }),
    );
  });

  const vote = (choices: readonly string[]) =>
    ({ type: "note/vote", target: props.event, choices }) as const;
  const sending = useSending(() => vote([]));

  return (
    <Show
      when={poll()}
      fallback={<Notice>選択肢の無い投票は表示できません</Notice>}
    >
      {(poll) => (
        <PollView
          poll={poll()}
          tally={
            settled() || responses().length > 0
              ? tallyPoll(poll(), responses(), actions?.viewer)
              : undefined
          }
          nowSeconds={now()}
          size={props.size}
          canVote={actions !== undefined}
          sending={sending()}
          onVote={(choices) => dispatch(vote(choices))}
        />
      )}
    </Show>
  );
};

export default PollBlock;
