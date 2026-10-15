import { createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import SearchQueryEditor from "./SearchQueryEditor";

type Args = { debounceMs: number; initial: string; signedIn: boolean };

/** 上へ渡った回数を出す。打つたびに渡していないかを、ここで見る。 */
const Story = (props: Args) => {
  const [text, setText] = createSignal(props.initial);
  const [sent, setSent] = createSignal(0);
  return (
    <div class="flex w-100 flex-col gap-3 bg-secondary p-4">
      <SearchQueryEditor
        text={text()}
        signedIn={props.signedIn}
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
  args: { debounceMs: 600, initial: "ねこ #nostr", signedIn: true },
} satisfies Meta<Args>;

export default meta;
type S = StoryObj<typeof meta>;

/** カラムの設定と同じ。打ち終わってから渡す。 */
export const 待ってから渡す: S = {};

/** 「探す」パネルと同じ。パネル側で購読だけを遅らせる。 */
export const すぐ渡す: S = { args: { debounceMs: 0 } };

/** 何も書いていない。欄の placeholder で、- で除けることを示す。 */
export const 空: S = { args: { initial: "" } };

/**
 * 除く指定。言葉・ハッシュタグ・人はそれぞれの欄にも - 付きで出る。bot は
 * スイッチに出る。
 */
export const 除く指定: S = {
  args: {
    initial: `あいもの -芋 #nostr -#bot from:${"a".repeat(64)} -from:${"b".repeat(64)} -to:${"c".repeat(64)} -is:bot`,
  },
};

export const フォロー中に限定: S = {
  args: { initial: "ねこ from:follows" },
  play: ({ canvasElement }) => {
    canvasElement
      .querySelector<HTMLButtonElement>(
        '[data-scope="collapsible"][data-part="trigger"]',
      )
      ?.click();
  },
};

export const 未ログイン: S = {
  args: { signedIn: false },
  play: ({ canvasElement }) => {
    canvasElement
      .querySelector<HTMLButtonElement>(
        '[data-scope="collapsible"][data-part="trigger"]',
      )
      ?.click();
  },
};

const openDetails = (canvasElement: HTMLElement) =>
  canvasElement
    .querySelector<HTMLButtonElement>(
      '[data-scope="collapsible"][data-part="trigger"]',
    )
    ?.click();

/** 入れた kind の名前を欄の下に出す。一覧に無い番号は、そうと分かるように書く。 */
export const kindの指定: S = {
  args: { initial: "ねこ kind:1 kind:6 kind:99999" },
  play: ({ canvasElement }) => openDetails(canvasElement),
};

/** kind の欄で呼び名を打つと、番号と呼び名の候補が出る。 */
export const kindの候補: S = {
  args: { initial: "" },
  play: async ({ canvasElement }) => {
    openDetails(canvasElement);
    let field: HTMLInputElement | null = null;
    for (let i = 0; i < 20 && !field; i++) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      field = canvasElement.querySelector("#search-kinds");
    }
    if (!field) return;
    field.focus();
    field.value = "りぽ";
    field.setSelectionRange(2, 2);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  },
};
