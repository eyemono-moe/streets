import { createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import SearchQueryEditor from "./SearchQueryEditor";

type Args = { debounceMs: number };

/** 上へ渡った回数を出す。打つたびに渡していないかを、ここで見る。 */
const Story = (props: Args) => {
  const [text, setText] = createSignal("ねこ #nostr");
  const [sent, setSent] = createSignal(0);
  return (
    <div class="flex w-100 flex-col gap-3 bg-secondary p-4">
      <SearchQueryEditor
        text={text()}
        debounceMs={props.debounceMs}
        onChange={(next) => {
          setText(next);
          setSent((count) => count + 1);
        }}
      />
      <p class="c-secondary text-caption">
        上へ渡った回数: <span data-testid="sent">{sent()}</span>
      </p>
    </div>
  );
};

const meta = {
  title: "デッキ/検索の条件",
  component: Story,
  args: { debounceMs: 600 },
} satisfies Meta<Args>;

export default meta;
type S = StoryObj<typeof meta>;

/** カラムの設定と同じ。打ち終わってから渡す。 */
export const 待ってから渡す: S = {};

/** 「探す」パネルと同じ。渡した先が購読し直さないので、すぐ渡す。 */
export const すぐ渡す: S = { args: { debounceMs: 0 } };
