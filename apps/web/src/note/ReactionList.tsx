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
  type JSX,
  Match,
  Show,
  Switch,
  createMemo,
  createSignal,
} from "solid-js";
import { useEventActions } from "../actions";
import { useSending } from "../actions-mediator";
import ReactionPicker from "../emoji/ReactionPicker";
import { useReadLayer } from "../read-layer";
import { useDispatch } from "../ui-events";
import { useEngagementChanges } from "./use-engagement-changes";
import UserLink from "./UserLink";

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

/** リアクションの中身。いいねはハート、カスタム絵文字は画像、それ以外は文字で出す。 */
export const Mark: Component<{ content: ReactionContent; mine: boolean }> = (
  props,
) => {
  const [broken, setBroken] = createSignal(false);
  const emoji = () =>
    props.content.type === "emoji" ? props.content : undefined;

  return (
    <Switch
      fallback={<span class="max-w-30 truncate">{titleOf(props.content)}</span>}
    >
      {/* いいね（`+`）はハートで出す。文字の「+」では何の反応か読めない。 */}
      <Match when={props.content.type === "like"}>
        <span
          class="i-material-symbols:favorite-rounded size-4.5"
          classList={{ "c-white": props.mine, "c-accent-5": !props.mine }}
          aria-hidden="true"
        />
      </Match>
      {/* 画像が読めないときも、何の反応かが消えないようショートコードの文字へ戻す。 */}
      <Match when={!broken() && emoji()}>
        {(emoji) => (
          <img
            src={emoji().url}
            alt={`:${emoji().name}:`}
            loading="lazy"
            decoding="async"
            class="h-4.5 w-auto max-w-12 object-contain"
            onError={() => setBroken(true)}
          />
        )}
      </Match>
    </Switch>
  );
};

/** イベント内と一覧表示で共通して使うリアクションのチップ。 */
export const ReactionChip: Component<{
  content: ReactionContent;
  count: number;
  mine?: boolean;
  disabled?: boolean;
  onClick?: JSX.EventHandlerUnion<HTMLButtonElement, MouseEvent>;
}> = (props) => {
  const mine = () => props.mine === true;
  return (
    <button
      type="button"
      title={titleOf(props.content)}
      aria-label={`${titleOf(props.content)} ${props.count} 件${mine() ? "（リアクション済み）" : ""}`}
      aria-pressed={props.onClick ? mine() : undefined}
      class="flex h-6 w-fit shrink-0 items-center gap-1 rounded-1.5 px-1 py-0.5 text-caption enabled:cursor-pointer disabled:cursor-default"
      classList={{
        "bg-accent-primary": mine(),
        "border border-primary bg-primary enabled:hover:bg-secondary": !mine(),
      }}
      disabled={props.onClick === undefined || props.disabled}
      onClick={props.onClick}
    >
      <Mark content={props.content} mine={mine()} />
      <span classList={{ "c-white": mine(), "c-secondary": !mine() }}>
        {props.count}
      </span>
    </button>
  );
};

const Reactors: Component<{ users: Map<string, number> }> = (props) => (
  <span class="c-secondary text-caption">
    <For each={[...props.users]}>
      {([pubkey, count], index) => (
        <>
          <Show when={index() > 0}>{", "}</Show>
          <UserLink pubkey={pubkey} />
          <Show when={count > 1}>{` (${count})`}</Show>
        </>
      )}
    </For>
  </span>
);

/** 本文の下の絵文字チップ。左のキャレットを押すと、誰が付けたかを縦に開く。 */
const ReactionList: Component<{ event: NostrEvent }> = (props) => {
  const { store } = useReadLayer();
  const actions = useEventActions();
  const changed = useEngagementChanges(() => props.event.id);
  const groups = createMemo(
    (): ReactionGroup[] => {
      changed();
      return eventReactionGroups(store, props.event.id);
    },
    [],
    { equals: sameReactionGroups },
  );
  const dispatch = useDispatch();
  // 送っている途中は、どの絵文字も押せなくする（1 件の投稿に kind:7 を 1 件ずつ送る）。
  const sending = useSending(() => ({
    type: "note/react",
    target: props.event,
    input: { type: "like" },
  }));
  const [expanded, setExpanded] = createSignal(false);

  return (
    <Show when={groups().length > 0}>
      <div class="flex items-start gap-1.5">
        <button
          type="button"
          aria-label="誰が付けたかを表示"
          aria-expanded={expanded()}
          class="c-secondary flex h-6 shrink-0 cursor-pointer items-center bg-transparent"
          onClick={() => setExpanded((current) => !current)}
        >
          <span
            class="i-material-symbols:arrow-drop-down-rounded size-6 transition-transform"
            classList={{ "rotate-180": expanded() }}
            aria-hidden="true"
          />
        </button>
        <div
          class="flex min-w-0 flex-1 gap-1.5"
          classList={{ "flex-wrap": !expanded(), "flex-col": expanded() }}
        >
          <For each={groups()}>
            {(group) => {
              const mine = () =>
                actions !== undefined && group.users.has(actions.viewer);
              return (
                <div class="flex min-w-0 items-center gap-1.5">
                  <ReactionChip
                    content={group.content}
                    count={group.count}
                    mine={mine()}
                    // 取り消し（kind:5）はまだ作らないので、自分が付けた絵文字は押せない。
                    disabled={!actions || mine() || sending()}
                    onClick={() =>
                      dispatch({
                        type: "note/react",
                        target: props.event,
                        input: inputOf(group.content),
                      })
                    }
                  />
                  {/* 開いたときだけ、そのリアクションを押した人を右に並べる。 */}
                  <Show when={expanded()}>
                    <Reactors users={group.users} />
                  </Show>
                </div>
              );
            }}
          </For>
          <Show when={actions !== undefined}>
            <ReactionPicker
              target={props.event}
              trigger={(triggerProps) => (
                <button
                  {...triggerProps()}
                  type="button"
                  aria-label="リアクションを選ぶ"
                  class="c-secondary flex h-6 w-fit cursor-pointer items-center rounded-1.5 border border-primary bg-primary px-1 hover:bg-secondary"
                >
                  <span
                    class="i-material-symbols:add-rounded size-3.5"
                    aria-hidden="true"
                  />
                </button>
              )}
            />
          </Show>
        </div>
      </div>
    </Show>
  );
};

export default ReactionList;
