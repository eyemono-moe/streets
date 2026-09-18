import { type Component, Match, Show, Switch, createSignal } from "solid-js";
import { useEventActions } from "../actions";
import { useSending } from "../actions-mediator";
import { useDispatch } from "../ui-events";
import Button from "../ui/Button";

/** 一覧の中では小さい方を使う（Penpot: Follow states の list）。 */
export type FollowButtonSize = "normal" | "small";

const Label: Component<{ icon?: string; children: string }> = (props) => (
  <>
    <Show when={props.icon}>
      {(icon) => (
        <span class={`${icon()} size-4 shrink-0`} aria-hidden="true" />
      )}
    </Show>
    {props.children}
  </>
);

/**
 * フォローの状態と操作を 1 つのボタンに畳む。フォロー中はホバー（とフォーカス）で
 * 「フォロー解除」に変わる —— 押す前に、押したら何が起きるかを出す。
 */
const FollowButton: Component<{
  pubkey: string;
  size?: FollowButtonSize;
}> = (props) => {
  const actions = useEventActions();
  const dispatch = useDispatch();
  const [hover, setHover] = createSignal(false);
  const following = () => actions?.following(props.pubkey) === true;
  const follow = () =>
    ({ type: "user/follow", pubkey: props.pubkey, on: !following() }) as const;
  const sending = useSending(follow);
  const unfollowing = () => following() && hover();

  return (
    // 自分自身と、ログインしていないときは出さない。押せない操作を置かない。
    <Show when={actions !== undefined && actions.viewer !== props.pubkey}>
      <Button
        variant={
          sending()
            ? "muted"
            : unfollowing()
              ? "danger"
              : following()
                ? "secondary"
                : "primary"
        }
        size={props.size === "small" ? "sm" : "md"}
        disabled={sending()}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onFocus={() => setHover(true)}
        onBlur={() => setHover(false)}
        onClick={() => dispatch(follow())}
      >
        <Switch>
          <Match when={sending()}>
            <Label>送信中…</Label>
          </Match>
          <Match when={unfollowing()}>
            <Label icon="i-material-symbols:close-rounded">フォロー解除</Label>
          </Match>
          <Match when={following()}>
            <Label icon="i-material-symbols:check-rounded">フォロー中</Label>
          </Match>
          <Match when={true}>
            <Label>フォロー</Label>
          </Match>
        </Switch>
      </Button>
    </Show>
  );
};

export default FollowButton;
