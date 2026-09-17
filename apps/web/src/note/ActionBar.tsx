import type { NostrEvent } from "@streets/core/nostr/event";
import { eventEngagements } from "@streets/core/view/event-engagements";
import { type Component, Show, createMemo, createSignal } from "solid-js";
import { useEventActions } from "../actions";
import { useSending } from "../actions-mediator";
import { useReadLayer } from "../read-layer";
import { useDispatch } from "../ui-events";
import { ComposeMediator } from "./ComposeMediator";
import ReplyDialog from "./ReplyDialog";
import { useEngagementChanges } from "./use-engagement-changes";

const useEngagements = (event: () => NostrEvent, viewer: string) => {
  const { store } = useReadLayer();
  const changed = useEngagementChanges(() => event().id);
  return createMemo(() => {
    changed();
    return eventEngagements(store, event().id, viewer);
  });
};

const Action: Component<{
  label: string;
  icon: string;
  active?: boolean;
  count?: number;
  disabled?: boolean;
  onClick?: () => void;
}> = (props) => (
  <button
    type="button"
    aria-label={props.label}
    aria-pressed={props.active}
    class="flex items-center gap-1 bg-transparent text-caption enabled:cursor-pointer disabled:cursor-default"
    classList={{
      "c-secondary enabled:hover:c-primary": !props.active,
      "c-accent-5": props.active,
      "opacity-50": props.disabled && !props.active,
    }}
    disabled={props.disabled}
    onClick={() => props.onClick?.()}
  >
    <span class={`${props.icon} size-4.5`} aria-hidden="true" />
    <Show when={props.count}>{(count) => <span>{count()}</span>}</Show>
  </button>
);

const ActionBar: Component<{ event: NostrEvent }> = (props) => {
  const actions = useEventActions();

  return (
    <Show when={actions}>
      {(actions) => {
        const engagement = useEngagements(() => props.event, actions().viewer);
        const [replyOpen, setReplyOpen] = createSignal(false);
        const dispatch = useDispatch();
        const bookmarked = () => actions().bookmarked(props.event.id);
        const repost = () =>
          ({ type: "note/repost", target: props.event }) as const;
        const like = () =>
          ({
            type: "note/react",
            target: props.event,
            input: { type: "like" },
          }) as const;
        const bookmark = () =>
          ({
            type: "note/bookmark",
            target: props.event,
            on: !bookmarked(),
          }) as const;
        const reposting = useSending(repost);
        const liking = useSending(like);
        const bookmarking = useSending(bookmark);

        return (
          <>
            <div class="flex items-center justify-between">
              <Action
                label="返信"
                icon="i-material-symbols:mode-comment-outline-rounded"
                count={engagement().replies}
                onClick={() => setReplyOpen(true)}
              />
              <Action
                label={
                  engagement().viewerReposted ? "リポスト済み" : "リポスト"
                }
                icon="i-material-symbols:repeat-rounded"
                active={engagement().viewerReposted}
                // 取り消し（kind:5）はまだ作らないので、一度押したら押せなくする。
                disabled={reposting() || engagement().viewerReposted}
                onClick={() => dispatch(repost())}
              />
              <Action
                label={engagement().viewerLiked ? "いいね済み" : "いいね"}
                icon={
                  engagement().viewerLiked
                    ? "i-material-symbols:favorite-rounded"
                    : "i-material-symbols:favorite-outline-rounded"
                }
                active={engagement().viewerLiked}
                count={engagement().likes}
                disabled={liking() || engagement().viewerLiked}
                onClick={() => dispatch(like())}
              />
              <Action
                label="Zap（未対応）"
                icon="i-material-symbols:bolt-outline-rounded"
                disabled
              />
              <Action
                label={bookmarked() ? "ブックマークを外す" : "ブックマーク"}
                icon={
                  bookmarked()
                    ? "i-material-symbols:bookmark-rounded"
                    : "i-material-symbols:bookmark-outline-rounded"
                }
                active={bookmarked()}
                disabled={bookmarking()}
                onClick={() => dispatch(bookmark())}
              />
            </div>
            <Show when={replyOpen()}>
              <ComposeMediator
                send={(text) => actions().reply(props.event, text)}
                failure="返信できませんでした"
                onSent={() => setReplyOpen(false)}
                onClose={() => setReplyOpen(false)}
              >
                {(state) => <ReplyDialog target={props.event} state={state} />}
              </ComposeMediator>
            </Show>
          </>
        );
      }}
    </Show>
  );
};

export default ActionBar;
