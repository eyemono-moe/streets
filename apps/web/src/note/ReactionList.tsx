import type { ReactionInput } from "@streets/core/nostr/build/reaction";
import type { NostrEvent } from "@streets/core/nostr/event";
import type { ReactionContent } from "@streets/core/nostr/reaction";
import {
  type ReactionGroup,
  eventReactionGroups,
  sameReactionGroups,
} from "@streets/core/view/reaction-groups";
import {
  type Component,
  For,
  Match,
  Show,
  Switch,
  createMemo,
  createSignal,
} from "solid-js";
import { useEventActions } from "../actions";
import { useReadLayer } from "../read-layer";
import { useEngagementChanges } from "./use-engagement-changes";
import { useSend } from "./use-send";

const inputOf = (content: ReactionContent): ReactionInput =>
  content.type === "emoji"
    ? { type: "emoji", shortcode: content.name, url: content.url }
    : content;

const titleOf = (content: ReactionContent): string =>
  content.type === "emoji"
    ? `:${content.name}:`
    : content.type === "text"
      ? content.content
      : "+";

const Mark: Component<{ content: ReactionContent }> = (props) => {
  const [broken, setBroken] = createSignal(false);
  const emoji = () =>
    props.content.type === "emoji" ? props.content : undefined;

  return (
    <Switch
      fallback={<span class="max-w-30 truncate">{titleOf(props.content)}</span>}
    >
      {/* 画像が読めないときも、何の反応かが消えないようショートコードの文字へ戻す。 */}
      <Match when={!broken() && emoji()}>
        {(emoji) => (
          <img
            src={emoji().url}
            alt={`:${emoji().name}:`}
            loading="lazy"
            class="h-4.5 w-auto max-w-12 object-contain"
            onError={() => setBroken(true)}
          />
        )}
      </Match>
    </Switch>
  );
};

/**
 * 本文の下の絵文字チップ。いいね（+）はアクション列のハートで数えるので、ここには出さない。
 */
const ReactionList: Component<{ event: NostrEvent }> = (props) => {
  const { store } = useReadLayer();
  const actions = useEventActions();
  const changed = useEngagementChanges(() => props.event.id);
  const groups = createMemo(
    (): ReactionGroup[] => {
      changed();
      return eventReactionGroups(store, props.event.id).filter(
        (group) => group.content.type !== "like",
      );
    },
    [],
    { equals: sameReactionGroups },
  );
  const send = useSend();

  return (
    <Show when={groups().length > 0}>
      <div class="flex flex-wrap items-start gap-1.5">
        <For each={groups()}>
          {(group) => {
            const mine = () =>
              actions !== undefined && group.users.has(actions.viewer);
            return (
              <button
                type="button"
                title={titleOf(group.content)}
                aria-label={`${titleOf(group.content)} ${group.count} 件${mine() ? "（リアクション済み）" : ""}`}
                aria-pressed={mine()}
                class="flex h-6 items-center gap-1 rounded-1.5 px-2 py-0.5 text-caption enabled:cursor-pointer disabled:cursor-default"
                classList={{
                  "bg-accent-primary": mine(),
                  "border border-primary bg-primary enabled:hover:bg-secondary":
                    !mine(),
                }}
                // 取り消し（kind:5）はまだ作らないので、自分が付けた絵文字は押せない。
                disabled={!actions || mine() || send.sending()}
                onClick={() =>
                  void send.run(async () =>
                    actions?.react(props.event, inputOf(group.content)),
                  )
                }
              >
                <Mark content={group.content} />
                <span classList={{ "c-white": mine(), "c-secondary": !mine() }}>
                  {group.count}
                </span>
              </button>
            );
          }}
        </For>
        <button
          type="button"
          aria-label="リアクションを選ぶ（未対応）"
          class="c-secondary flex h-4.5 items-center rounded-1.5 border border-primary bg-primary px-2 opacity-50"
          disabled
        >
          <span
            class="i-material-symbols:add-rounded size-3.5"
            aria-hidden="true"
          />
        </button>
      </div>
      <Show when={send.error()}>
        {(message) => <p class="c-danger text-caption">{message()}</p>}
      </Show>
    </Show>
  );
};

export default ReactionList;
