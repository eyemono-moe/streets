import { Menu } from "@ark-ui/solid/menu";
import type { ReactionInput } from "@streets/core/nostr/build/reaction";
import type { NostrEvent } from "@streets/core/nostr/event";
import { reactionContentOf } from "@streets/core/settings/default-reaction";
import { eventEngagements } from "@streets/core/view/event-engagements";
import { zapEndpointOf } from "@streets/core/zap/lnurl";
import {
  type Component,
  type JSX,
  Show,
  createMemo,
  createSignal,
} from "solid-js";
import { Portal } from "solid-js/web";
import { useEventActions } from "../actions";
import { useSending } from "../actions-mediator";
import { defaultReaction } from "../default-reaction-setting";
import ReactionPicker from "../emoji/ReactionPicker";
import { useReadLayer } from "../read-layer";
import { useDispatch } from "../ui-events";
import { ComposeMediator } from "./ComposeMediator";
import QuoteDialog from "./QuoteDialog";
import ReactionButtonMark from "./ReactionButtonMark";
import ReplyDialog from "./ReplyDialog";
import { useEngagementChanges } from "./use-engagement-changes";
import { useProfileDetails } from "./use-profile";

const useEngagements = (event: () => NostrEvent, viewer: string) => {
  const { store } = useReadLayer();
  const changed = useEngagementChanges(() => event().id);
  return createMemo(() => {
    changed();
    return eventEngagements(
      store,
      event().id,
      viewer,
      reactionContentOf(defaultReaction()),
    );
  });
};

const reactionLabel = (input: ReactionInput): string =>
  input.type === "like"
    ? "いいね"
    : `${input.type === "text" ? input.content : `:${input.shortcode}:`} でリアクション`;

const Action: Component<{
  label: string;
  /** アイコンの class。`mark` を渡したときは使わない。 */
  icon?: string;
  mark?: JSX.Element;
  active?: boolean;
  count?: number;
  disabled?: boolean;
  onClick?: () => void;
}> = (props) => (
  <button
    type="button"
    aria-label={props.label}
    aria-pressed={props.active}
    class="group flex items-center gap-1 bg-transparent text-caption enabled:cursor-pointer disabled:cursor-default"
    classList={{
      "c-secondary enabled:hover:c-primary": !props.active,
      "c-accent-5": props.active,
      "opacity-50": props.disabled && !props.active,
    }}
    disabled={props.disabled}
    onClick={() => props.onClick?.()}
  >
    {props.mark ?? <span class={`${props.icon} size-4.5`} aria-hidden="true" />}
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
        const [quoteOpen, setQuoteOpen] = createSignal(false);
        const dispatch = useDispatch();
        const bookmarked = () => actions().bookmarked(props.event.id);
        const repost = () =>
          ({ type: "note/repost", target: props.event }) as const;
        const like = () =>
          ({
            type: "note/react",
            target: props.event,
            input: defaultReaction(),
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
        // 送り先（lud16 / lud06）を書いている人にだけ送れる。
        const author = useProfileDetails(() => props.event.pubkey);
        const zappable = () => zapEndpointOf(author()?.content) !== undefined;

        return (
          <>
            <div class="flex items-center justify-between">
              <Action
                label="返信"
                icon="i-material-symbols:mode-comment-outline-rounded"
                count={engagement().replies}
                onClick={() => setReplyOpen(true)}
              />
              <Menu.Root
                lazyMount
                unmountOnExit
                onSelect={(details) => {
                  if (details.value === "repost") dispatch(repost());
                  if (details.value === "quote") setQuoteOpen(true);
                }}
              >
                <Menu.Trigger
                  aria-label={
                    engagement().viewerReposted ? "リポスト済み" : "リポスト"
                  }
                  aria-pressed={engagement().viewerReposted}
                  class="flex cursor-pointer items-center gap-1 bg-transparent text-caption"
                  classList={{
                    "c-secondary hover:c-primary": !engagement().viewerReposted,
                    "c-accent-5": engagement().viewerReposted,
                  }}
                >
                  <span
                    class="i-material-symbols:repeat-rounded size-4.5"
                    aria-hidden="true"
                  />
                  <Show when={engagement().reposts}>
                    {(count) => <span>{count()}</span>}
                  </Show>
                </Menu.Trigger>
                <Portal>
                  <Menu.Positioner>
                    <Menu.Content class="motion-pop c-primary w-44 space-y-1 rounded-2.5 border border-primary bg-primary p-1.5 shadow-lg outline-none">
                      <Menu.Item
                        value="repost"
                        disabled={reposting() || engagement().viewerReposted}
                        class="flex h-8.5 items-center gap-2.5 rounded-1.5 px-2.5 text-body enabled:cursor-pointer data-[highlighted]:bg-secondary data-[disabled]:opacity-50"
                      >
                        <span
                          class="i-material-symbols:repeat-rounded size-4.5"
                          aria-hidden="true"
                        />
                        <span>
                          {engagement().viewerReposted
                            ? "リポスト済み"
                            : "リポスト"}
                        </span>
                      </Menu.Item>
                      <Menu.Item
                        value="quote"
                        class="flex h-8.5 cursor-pointer items-center gap-2.5 rounded-1.5 px-2.5 text-body data-[highlighted]:bg-secondary"
                      >
                        <span
                          class="i-material-symbols:format-quote-rounded size-4.5"
                          aria-hidden="true"
                        />
                        <span>引用</span>
                      </Menu.Item>
                    </Menu.Content>
                  </Menu.Positioner>
                </Portal>
              </Menu.Root>
              <Action
                label={`${reactionLabel(defaultReaction())}${engagement().viewerReacted ? "（済み）" : ""}`}
                mark={
                  <ReactionButtonMark
                    input={defaultReaction()}
                    active={engagement().viewerReacted}
                  />
                }
                active={engagement().viewerReacted}
                count={engagement().reactions}
                disabled={liking() || engagement().viewerReacted}
                onClick={() => dispatch(like())}
              />
              <ReactionPicker
                target={props.event}
                trigger={(triggerProps) => (
                  <button
                    {...triggerProps()}
                    type="button"
                    aria-label="リアクション"
                    class="c-secondary hover:c-primary flex cursor-pointer items-center gap-1 bg-transparent text-caption"
                  >
                    <span
                      class="i-material-symbols:add-reaction-outline-rounded size-4.5"
                      aria-hidden="true"
                    />
                  </button>
                )}
              />
              <Action
                label={
                  zappable() ? "Zap する" : "この人は Zap を受け取れません"
                }
                icon="i-material-symbols:bolt-outline-rounded"
                disabled={!zappable()}
                onClick={() =>
                  dispatch({ type: "zap/open", target: props.event })
                }
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
                send={(text, media, emoji) =>
                  actions().reply(props.event, text, media, emoji)
                }
                failure="返信できませんでした"
                onSent={() => setReplyOpen(false)}
                onClose={() => setReplyOpen(false)}
              >
                {(state) => <ReplyDialog target={props.event} state={state} />}
              </ComposeMediator>
            </Show>
            <Show when={quoteOpen()}>
              <ComposeMediator
                send={(text, media, emoji) =>
                  actions().quote(props.event, text, media, emoji)
                }
                failure="引用できませんでした"
                onSent={() => setQuoteOpen(false)}
                onClose={() => setQuoteOpen(false)}
              >
                {(state) => <QuoteDialog target={props.event} state={state} />}
              </ComposeMediator>
            </Show>
          </>
        );
      }}
    </Show>
  );
};

export default ActionBar;
