import { Menu } from "@ark-ui/solid/menu";
import { buildRepost } from "@streets/core/nostr/build/repost";
import type { NostrEvent } from "@streets/core/nostr/event";
import type { EventActionId } from "@streets/core/settings/action-layout";
import { canBroadcast } from "@streets/core/write/broadcast";
import { zapEndpointOf } from "@streets/core/zap/lnurl";
import { type Component, For, type JSX, Show } from "solid-js";
import { Portal } from "solid-js/web";
import { actionLayout } from "../action-layout-setting";
import { useEventActions } from "../actions";
import { useSending } from "../actions-mediator";
import { defaultReaction } from "../default-reaction-setting";
import ReactionPicker from "../emoji/ReactionPicker";
import { useDispatch } from "../ui-events";
import { menuContentClass, menuItemClass } from "../ui/menu";
import {
  EVENT_ACTION_META,
  createEventDialogs,
  canPin,
  muteEventLook,
  pinLook,
  reactionLabel,
  useEngagements,
  useEventLevelOps,
} from "./event-ops";
import ReactionButtonMark from "./ReactionButtonMark";
import { useProfileDetails } from "./use-profile";

const Action: Component<{
  label: string;
  /** アイコンの class。`mark` を渡したときは使わない。 */
  icon?: string;
  mark?: JSX.Element;
  active?: boolean;
  /**
   * 押した後に背景を敷く。絵文字には色を付けられず、元から白黒の絵文字だと押す前と
   * 見分けがつかないため。押す前も同じ箱にして、押しても並びがずれないようにする。
   * 箱は上下へはみ出させ、ハートのときと行の高さを揃える。
   */
  filled?: boolean;
  count?: number;
  disabled?: boolean;
  onClick?: () => void;
}> = (props) => (
  <button
    type="button"
    aria-label={props.label}
    aria-pressed={props.active}
    class="group flex items-center gap-1 text-caption enabled:cursor-pointer disabled:cursor-default"
    classList={{
      "-my-0.75 h-6 min-w-6 justify-center rounded-full px-0.75 transition-colors":
        props.filled,
      "bg-accent-5/50": props.filled && props.active,
      "bg-transparent": !(props.filled && props.active),
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

/** 投稿の下の操作。並べるものと順は、表示の設定で選ぶ（残りは右上のメニューに入る）。 */
const ActionBar: Component<{ event: NostrEvent }> = (props) => {
  const actions = useEventActions();

  return (
    <Show when={actions && actionLayout().bar.length > 0 && actions}>
      {(actions) => {
        const engagement = useEngagements(() => props.event, actions().viewer);
        const dialogs = createEventDialogs(() => props.event);
        const ops = useEventLevelOps(() => props.event);
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
        const pinned = () => actions().pinned(props.event.id);
        const pin = () =>
          ({ type: "note/pin", target: props.event, on: !pinned() }) as const;
        const pinning = useSending(pin);
        const broadcasting = useSending(() => ({
          type: "note/broadcast",
          target: props.event,
          relays: [],
        }));
        const reposting = useSending(repost);
        const liking = useSending(like);
        const bookmarking = useSending(bookmark);
        // 送り先（lud16 / lud06）を書いている人にだけ送れる。
        const author = useProfileDetails(() => props.event.pubkey);
        const zappable = () => zapEndpointOf(author()?.content) !== undefined;

        const views: Record<EventActionId, () => JSX.Element> = {
          reply: () => (
            <Action
              label="返信"
              icon={EVENT_ACTION_META.reply.icon}
              count={engagement().replies}
              onClick={() => dialogs.open("reply")}
            />
          ),
          repost: () => (
            <Menu.Root
              lazyMount
              unmountOnExit
              onSelect={(details) => {
                if (details.value === "repost") dispatch(repost());
                if (details.value === "quote") dialogs.open("quote");
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
                  <Menu.Content class={`${menuContentClass} w-40`}>
                    <Menu.Item
                      value="repost"
                      disabled={
                        reposting() ||
                        engagement().viewerReposted ||
                        !buildRepost(props.event)
                      }
                      class={menuItemClass}
                    >
                      <span
                        class="i-material-symbols:repeat-rounded size-4 shrink-0"
                        aria-hidden="true"
                      />
                      <span>
                        {engagement().viewerReposted
                          ? "リポスト済み"
                          : "リポスト"}
                      </span>
                    </Menu.Item>
                    <Menu.Item value="quote" class={menuItemClass}>
                      <span
                        class="i-material-symbols:format-quote-rounded size-4 shrink-0"
                        aria-hidden="true"
                      />
                      <span>引用</span>
                    </Menu.Item>
                  </Menu.Content>
                </Menu.Positioner>
              </Portal>
            </Menu.Root>
          ),
          like: () => (
            <Action
              label={`${reactionLabel(defaultReaction())}${engagement().viewerReacted ? "（済み）" : ""}`}
              mark={
                <ReactionButtonMark
                  input={defaultReaction()}
                  active={engagement().viewerReacted}
                />
              }
              active={engagement().viewerReacted}
              filled={defaultReaction().type !== "like"}
              disabled={liking() || engagement().viewerReacted}
              onClick={() => dispatch(like())}
            />
          ),
          react: () => (
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
                    class={`${EVENT_ACTION_META.react.icon} size-4.5`}
                    aria-hidden="true"
                  />
                </button>
              )}
            />
          ),
          zap: () => (
            <Action
              label={zappable() ? "Zap する" : "この人は Zap を受け取れません"}
              icon={EVENT_ACTION_META.zap.icon}
              disabled={!zappable()}
              onClick={() =>
                dispatch({ type: "zap/open", target: props.event })
              }
            />
          ),
          bookmark: () => (
            <Action
              label={bookmarked() ? "ブックマークを外す" : "ブックマーク"}
              icon={
                bookmarked()
                  ? "i-material-symbols:bookmark-rounded"
                  : EVENT_ACTION_META.bookmark.icon
              }
              active={bookmarked()}
              disabled={bookmarking()}
              onClick={() => dispatch(bookmark())}
            />
          ),
          pin: () => (
            <Action
              label={pinLook(props.event, pinned()).label}
              icon={pinLook(props.event, pinned()).icon}
              active={pinned()}
              // 外すことは kind によらずできる。入ってしまったものを残さないため。
              disabled={pinning() || (!pinned() && !canPin(props.event))}
              onClick={() => dispatch(pin())}
            />
          ),
          activity: () => (
            <Action
              label={EVENT_ACTION_META.activity.label}
              icon={EVENT_ACTION_META.activity.icon}
              onClick={ops.activity}
            />
          ),
          "copy-link": () => (
            <Action
              label={EVENT_ACTION_META["copy-link"].label}
              icon={EVENT_ACTION_META["copy-link"].icon}
              onClick={() => void ops.copyLink()}
            />
          ),
          details: () => (
            <Action
              label={EVENT_ACTION_META.details.label}
              icon={EVENT_ACTION_META.details.icon}
              onClick={() => dialogs.open("details")}
            />
          ),
          broadcast: () => (
            <Action
              label={EVENT_ACTION_META.broadcast.label}
              icon={EVENT_ACTION_META.broadcast.icon}
              disabled={broadcasting() || !canBroadcast(props.event)}
              onClick={() => dialogs.open("broadcast")}
            />
          ),
          "mute-event": () => (
            <Action
              label={muteEventLook(ops.muted()).label}
              icon={muteEventLook(ops.muted()).icon}
              active={ops.muted()}
              disabled={!ops.canMute}
              onClick={ops.toggleMute}
            />
          ),
        };

        return (
          <>
            <div class="flex items-center justify-between">
              <For each={actionLayout().bar}>{(id) => views[id]()}</For>
            </div>
            {dialogs.view}
          </>
        );
      }}
    </Show>
  );
};

export default ActionBar;
