import type { NostrEvent } from "@streets/core/nostr/event";
import { eventEngagements } from "@streets/core/view/event-engagements";
import { type Component, Show, createMemo, createSignal } from "solid-js";
import { useEventActions } from "../actions";
import { useReadLayer } from "../read-layer";
import ReplyDialog from "./ReplyDialog";
import { useEngagementChanges } from "./use-engagement-changes";
import { useSend } from "./use-send";

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
        const repost = useSend("リポストできませんでした");
        const like = useSend("リアクションを送れませんでした");
        const bookmark = useSend("ブックマークを保存できませんでした");
        const bookmarked = () => actions().bookmarked(props.event.id);

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
                disabled={repost.sending() || engagement().viewerReposted}
                onClick={() =>
                  void repost.run(() => actions().repost(props.event))
                }
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
                disabled={like.sending() || engagement().viewerLiked}
                onClick={() =>
                  void like.run(() =>
                    actions().react(props.event, { type: "like" }),
                  )
                }
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
                disabled={bookmark.sending()}
                onClick={() =>
                  void bookmark.run(() =>
                    actions().setBookmark(props.event, !bookmarked()),
                  )
                }
              />
            </div>
            <Show when={replyOpen()}>
              <ReplyDialog
                target={props.event}
                onClose={() => setReplyOpen(false)}
              />
            </Show>
          </>
        );
      }}
    </Show>
  );
};

export default ActionBar;
