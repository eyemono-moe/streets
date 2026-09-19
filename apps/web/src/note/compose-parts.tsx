import { type Component, Show } from "solid-js";
import Button from "../ui/Button";

const graphemes = new Intl.Segmenter("ja", { granularity: "grapheme" });

/** 見た目の文字数。サロゲートペアや結合絵文字を 1 文字として数える。 */
export const countCharacters = (text: string) =>
  [...graphemes.segment(text)].length;

const ToolButton: Component<{ label: string; icon: string }> = (props) => (
  <button
    type="button"
    aria-label={`${props.label}（未対応）`}
    class="c-secondary grid size-8 place-items-center rounded-2 bg-transparent opacity-50"
    disabled
  >
    <span class={`${props.icon} size-5`} aria-hidden="true" />
  </button>
);

/** 投稿と返信で同じ足まわり。画像・追加・公開範囲はまだ作っていない。 */
export const ComposeTools: Component<{
  count: string;
  label: string;
  sending: boolean;
  disabled: boolean;
}> = (props) => (
  <div class="flex h-13 items-center gap-1.5 py-2.5 pr-3 pl-4">
    <ToolButton label="画像" icon="i-material-symbols:image-outline-rounded" />
    <ToolButton label="追加" icon="i-material-symbols:add-rounded" />
    <ToolButton label="公開範囲" icon="i-material-symbols:globe" />
    <span class="flex-1" />
    <span class="c-secondary text-caption">{props.count}</span>
    <Button
      type="submit"
      variant="primary"
      disabled={props.sending || props.disabled}
    >
      <Show when={!props.sending} fallback="送信中…">
        {props.label}
      </Show>
    </Button>
  </div>
);
