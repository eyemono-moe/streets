import type { ReactionInput } from "@streets/core/nostr/build/reaction";
import { type Component, Match, Switch, createSignal } from "solid-js";

/**
 * いいねボタンに出す印。`+` はハート（押す前は枠だけ）、それ以外は送る絵文字そのもの。
 * 絵文字は押す前も色を抜かない。元から白黒の絵文字では違いが出ないので、押した後は
 * ボタンの背景で見せる。
 */
const ReactionButtonMark: Component<{
  input: ReactionInput;
  active: boolean;
}> = (props) => {
  const [broken, setBroken] = createSignal(false);
  const emoji = () => (props.input.type === "emoji" ? props.input : undefined);
  const text = () => (props.input.type === "text" ? props.input : undefined);

  return (
    <Switch
      fallback={
        <span
          class={`${props.active ? "i-material-symbols:favorite-rounded" : "i-material-symbols:favorite-outline-rounded"} size-4.5`}
          aria-hidden="true"
        />
      }
    >
      <Match when={text()}>
        {(text) => (
          <span class="text-[17px] leading-[18px]" aria-hidden="true">
            {text().content}
          </span>
        )}
      </Match>
      {/* 画像が読めないときも、何を送るかが消えないようショートコードの文字へ戻す。 */}
      <Match when={emoji()}>
        {(emoji) => (
          <Switch>
            <Match when={broken()}>
              <span class="max-w-20 truncate" aria-hidden="true">
                {`:${emoji().shortcode}:`}
              </span>
            </Match>
            <Match when={!broken()}>
              <img
                src={emoji().url}
                alt=""
                loading="lazy"
                class="h-4.5 w-auto max-w-12 object-contain"
                onError={() => setBroken(true)}
              />
            </Match>
          </Switch>
        )}
      </Match>
    </Switch>
  );
};

export default ReactionButtonMark;
