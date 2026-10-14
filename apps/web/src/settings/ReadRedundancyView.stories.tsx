import type { ReadRedundancy } from "@streets/core/settings/read-redundancy-setting";
import { createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { Mediates } from "../ui-events";
import ReadRedundancyView from "./ReadRedundancyView";

type Args = {
  value: ReadRedundancy;
  /** 1 本あたりに増えるリレーの数。見込みはこれで作る。 */
  perStep: number;
  loaded: boolean;
  budget: number;
  width: number;
};

const countFor = (args: Args, value: number) =>
  Math.min(args.budget, 6 + args.perStep * value);

/** アプリではデッキが裁定するイベントを、ここで手元の値に当てる。 */
const Story = (props: Args) => {
  const [value, setValue] = createSignal(props.value);
  return (
    <Mediates
      handle={(event) => {
        if (event.type !== "deck/set-read-redundancy") return false;
        setValue(event.value);
        return true;
      }}
    >
      <div class="bg-primary p-6" style={{ width: `${props.width}px` }}>
        <ReadRedundancyView
          value={value()}
          relayCount={props.loaded ? countFor(props, value()) : undefined}
          preview={(redundancy) => countFor(props, redundancy)}
          budget={props.budget}
        />
      </div>
    </Mediates>
  );
};

const meta = {
  title: "設定/投稿を探すリレーの数",
  component: Story,
  args: { value: 2, perStep: 6, loaded: true, budget: 30, width: 660 },
  argTypes: {
    value: { control: "inline-radio", options: [1, 2, 3, 4] },
  },
} satisfies Meta<Args>;

export default meta;
type S = StoryObj<typeof meta>;

/** 既定の 2 本。1 本増やしたときの見込みを出す。 */
export const 既定: S = {};

/** 既定から変えてある。名前の横に「既定に戻す」が出る。 */
export const 変えてある: S = { args: { value: 3 } };

/** 同時につなげる数に届いた。 */
export const 上限に届いた: S = { args: { value: 4 } };

/** 読み取り層がまだ無い。見込みは出さない。 */
export const 読み込み中: S = { args: { loaded: false } };

export const 狭い幅: S = { args: { value: 3, width: 340 } };
