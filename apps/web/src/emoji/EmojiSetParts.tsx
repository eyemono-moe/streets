import type { CustomEmoji } from "@streets/core/settings/emoji-list";
import type { EmojiSet } from "@streets/core/settings/emoji-set";
import { type Component, For, Show, createSignal } from "solid-js";
import UserLink from "../note/UserLink";
import { useDispatch } from "../ui-events";
import Button from "../ui/Button";

/**
 * 絵文字 1 つ。読めない URL でも、何が入っているかが消えないようにする。
 * 名前を隣に出している場所（`named`）では、代わりに読めない印だけを出す。
 */
export const EmojiPreview: Component<{
  emoji: CustomEmoji;
  named?: boolean;
}> = (props) => {
  const [broken, setBroken] = createSignal(false);
  return (
    <Show
      when={!broken()}
      fallback={
        <Show
          when={props.named}
          fallback={
            <span class="c-secondary text-caption">{`:${props.emoji.shortcode}:`}</span>
          }
        >
          <span
            class="i-material-symbols:broken-image-outline-rounded c-secondary size-5"
            title="画像を読み込めませんでした"
          />
        </Show>
      }
    >
      <img
        src={props.emoji.url}
        alt={`:${props.emoji.shortcode}:`}
        title={`:${props.emoji.shortcode}:`}
        loading="lazy"
        decoding="async"
        class="size-6 object-contain"
        onError={() => setBroken(true)}
      />
    </Show>
  );
};

/** 閉じているときに並べる数。2〜3 行に収まり、どんなセットかが分かる。 */
const PREVIEW_COUNT = 24;

/** セットの名前と、作った人・数。 */
export const EmojiSetHeading: Component<{
  title: string;
  pubkey: string;
  count: number | undefined;
}> = (props) => (
  <span class="flex min-w-0 flex-col gap-0.5">
    <span class="c-primary break-all font-600 text-body">{props.title}</span>
    <span class="c-secondary flex min-w-0 flex-wrap items-center gap-x-1 text-caption">
      <UserLink pubkey={props.pubkey} class="min-w-0 truncate" />
      <Show when={props.count !== undefined}>
        <span class="shrink-0">・{props.count} 個</span>
      </Show>
    </span>
  </span>
);

/** 絵文字を並べる。多いときは先頭だけ出し、押すと残りを広げる。 */
export const EmojiGrid: Component<{ emojis: readonly CustomEmoji[] }> = (
  props,
) => {
  const [expanded, setExpanded] = createSignal(false);
  const shown = () =>
    expanded() ? props.emojis : props.emojis.slice(0, PREVIEW_COUNT);
  const rest = () => props.emojis.length - PREVIEW_COUNT;
  return (
    <Show
      when={props.emojis.length > 0}
      fallback={
        <span class="c-secondary text-caption">絵文字が入っていません</span>
      }
    >
      <span class="flex flex-wrap items-center gap-1.5">
        <For each={shown()}>{(emoji) => <EmojiPreview emoji={emoji} />}</For>
        <Show when={!expanded() && rest() > 0}>
          <button
            type="button"
            class="cursor-pointer bg-transparent p-0 text-caption text-link"
            onClick={() => setExpanded(true)}
          >
            ほか {rest()} 個
          </button>
        </Show>
      </span>
    </Show>
  );
};

/** 自分の絵文字リストに加える。入っていれば、そう示すだけにする。 */
export const EmojiSetAddButton: Component<{
  set: Pick<EmojiSet, "pubkey" | "identifier">;
  added: boolean;
  disabled: boolean;
}> = (props) => {
  const dispatch = useDispatch();
  return (
    <Show
      when={!props.added}
      fallback={
        <span class="c-secondary flex items-center gap-1 text-caption">
          <span
            class="i-material-symbols:check-rounded size-4"
            aria-hidden="true"
          />
          自分の絵文字リストに入っています
        </span>
      }
    >
      <Button
        variant="secondary"
        size="sm"
        icon="i-material-symbols:add-rounded"
        disabled={props.disabled}
        onClick={() =>
          dispatch({
            type: "emoji-set/add",
            ref: { pubkey: props.set.pubkey, identifier: props.set.identifier },
          })
        }
      >
        自分の絵文字リストに加える
      </Button>
    </Show>
  );
};
