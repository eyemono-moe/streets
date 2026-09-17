import { type Component, Match, Show, Switch, createSignal } from "solid-js";
import { useEventActions } from "../actions";
import { useSend } from "../note/use-send";

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
  const send = useSend("フォローの状態を保存できませんでした");
  const [hover, setHover] = createSignal(false);
  const following = () => actions?.following(props.pubkey) === true;
  const unfollowing = () => following() && hover();

  return (
    // 自分自身と、ログインしていないときは出さない。押せない操作を置かない。
    <Show when={actions?.viewer !== props.pubkey ? actions : undefined}>
      {(actions) => (
        <button
          type="button"
          class="flex shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-full font-600 text-caption disabled:cursor-default"
          classList={{
            "h-8.5 px-4.5": props.size !== "small",
            "h-7.5 px-3.5": props.size === "small",
            "bg-accent-primary c-white": !following() && !send.sending(),
            "border border-primary bg-primary": following() && !send.sending(),
            "c-danger": unfollowing(),
            "c-primary": following() && !unfollowing(),
            "c-secondary bg-secondary": send.sending(),
          }}
          disabled={send.sending()}
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
          onFocus={() => setHover(true)}
          onBlur={() => setHover(false)}
          onClick={() =>
            void send.run(() => actions().setFollow(props.pubkey, !following()))
          }
        >
          <Switch>
            <Match when={send.sending()}>
              <Label>送信中…</Label>
            </Match>
            <Match when={unfollowing()}>
              <Label icon="i-material-symbols:close-rounded">
                フォロー解除
              </Label>
            </Match>
            <Match when={following()}>
              <Label icon="i-material-symbols:check-rounded">フォロー中</Label>
            </Match>
            <Match when={true}>
              <Label>フォロー</Label>
            </Match>
          </Switch>
        </button>
      )}
    </Show>
  );
};

export default FollowButton;
