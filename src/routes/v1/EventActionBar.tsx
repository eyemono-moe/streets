import {
  type Component,
  Show,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
} from "solid-js";
import type { NostrEvent } from "../../core/nostr/event";
import { eventEngagements } from "../../core/view/event-engagements";
import { useRender } from "../../core/view/render-context";
import ReplyDialog from "./ReplyDialog";
import {
  eventActionErrorMessage,
  useOptionalEventActions,
} from "./event-actions";

const actionButtonClass =
  "c-secondary flex min-w-10 appearance-none items-center justify-center gap-1 rounded-full bg-transparent px-2 py-1 outline-none enabled:cursor-pointer enabled:hover:bg-alpha-hover focus-visible:ring-2 focus-visible:ring-accent-5 disabled:opacity-60";

const EventActionBar: Component<{ event: NostrEvent }> = (props) => {
  const render = useRender();
  const actions = useOptionalEventActions();
  const [version, setVersion] = createSignal(0);
  const [replyOpen, setReplyOpen] = createSignal(false);
  const [reposting, setReposting] = createSignal(false);
  const [liking, setLiking] = createSignal(false);
  const [error, setError] = createSignal<string>();

  createEffect(() => {
    const id = props.event.id;
    render.engagements.request(id);
    const offRequests = render.engagements.subscribe(() => {
      setVersion((current) => current + 1);
    });
    const offStore = render.store.subscribe((change) => {
      if (change.event.tags.some((tag) => tag[0] === "e" && tag[1] === id)) {
        setVersion((current) => current + 1);
      }
    });
    onCleanup(() => {
      offRequests();
      offStore();
    });
  });

  const engagement = createMemo(() => {
    version();
    return eventEngagements(render.store, props.event.id, render.viewerPubkey);
  });

  const repost = async () => {
    if (!actions || reposting() || engagement().viewerReposted) return;
    setReposting(true);
    setError(undefined);
    try {
      await actions.repost(props.event);
    } catch (cause) {
      setError(eventActionErrorMessage(cause));
    } finally {
      setReposting(false);
    }
  };

  const like = async () => {
    if (!actions || liking() || engagement().viewerLiked) return;
    setLiking(true);
    setError(undefined);
    try {
      await actions.like(props.event);
    } catch (cause) {
      setError(eventActionErrorMessage(cause));
    } finally {
      setLiking(false);
    }
  };

  return (
    <Show when={actions}>
      <div class="pt-1" data-testid="event-actions">
        <div class="flex max-w-76 items-center justify-between">
          <button
            aria-label="返信"
            class={actionButtonClass}
            data-testid="event-reply"
            type="button"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              setReplyOpen(true);
            }}
          >
            <span
              class="i-material-symbols:mode-comment-outline-rounded h-4.5 w-4.5"
              aria-hidden="true"
            />
            <Show when={engagement().replies > 0}>
              <span class="text-caption">{engagement().replies}</span>
            </Show>
          </button>
          <button
            aria-label={
              engagement().viewerReposted ? "リポスト済み" : "リポスト"
            }
            class={actionButtonClass}
            classList={{ "text-green-6": engagement().viewerReposted }}
            data-testid="event-repost"
            disabled={reposting() || engagement().viewerReposted}
            type="button"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              void repost();
            }}
          >
            <span
              class="i-material-symbols:repeat-rounded h-4.5 w-4.5"
              aria-hidden="true"
            />
            <Show when={engagement().reposts > 0}>
              <span class="text-caption">{engagement().reposts}</span>
            </Show>
          </button>
          <button
            aria-label={engagement().viewerLiked ? "Like済み" : "Like"}
            class={actionButtonClass}
            classList={{ "text-accent-5": engagement().viewerLiked }}
            data-testid="event-like"
            disabled={liking() || engagement().viewerLiked}
            type="button"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              void like();
            }}
          >
            <span
              class="h-4.5 w-4.5"
              classList={{
                "i-material-symbols:favorite-outline-rounded":
                  !engagement().viewerLiked,
                "i-material-symbols:favorite-rounded": engagement().viewerLiked,
              }}
              aria-hidden="true"
            />
            <Show when={engagement().likes > 0}>
              <span class="text-caption">{engagement().likes}</span>
            </Show>
          </button>
        </div>
        <Show when={error()}>
          {(message) => (
            <p
              class="mt-1 text-caption text-red-8 dark:text-red-4"
              data-testid="event-action-error"
            >
              {message()}
            </p>
          )}
        </Show>
      </div>
      <Show when={replyOpen()}>
        <ReplyDialog target={props.event} onClose={() => setReplyOpen(false)} />
      </Show>
    </Show>
  );
};

export default EventActionBar;
