import { createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import SearchQueryEditor from "./SearchQueryEditor";

type Args = { debounceMs: number; initial: string };

/** 上へ渡った回数を出す。打つたびに渡していないかを、ここで見る。 */
const Story = (props: Args) => {
  const [text, setText] = createSignal(props.initial);
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
  args: { debounceMs: 600, initial: "ねこ #nostr" },
} satisfies Meta<Args>;

export default meta;
type S = StoryObj<typeof meta>;

/** カラムの設定と同じ。打ち終わってから渡す。 */
export const 待ってから渡す: S = {};

/** 「探す」パネルと同じ。渡した先が購読し直さないので、すぐ渡す。 */
export const すぐ渡す: S = { args: { debounceMs: 0 } };

/** 何も書いていない。欄の placeholder で、- で除けることを示す。 */
export const 空: S = { args: { initial: "" } };

/**
 * 除く指定。言葉とハッシュタグはフォームの欄にも - 付きで出る。bot はスイッチ
 * に出る。人は文字列でだけ書け、フォームの欄には出ない。
 */
export const 除く指定: S = {
  args: {
    initial: `あいもの -芋 #nostr -#bot -from:${"a".repeat(64)} -is:bot`,
  },
};
