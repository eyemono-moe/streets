import { type Component, createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { Mediates } from "../ui-events";
import Button from "../ui/Button";
import SidePanel, { SidePanelMotion } from "./SidePanel";

type Props = { full: boolean };

/** 開閉の動きを見る。パネルの「閉じる」も、上のボタンも同じ開閉を切り替える。 */
const Demo: Component<Props> = (props) => {
  const [open, setOpen] = createSignal(true);
  return (
    <Mediates
      handle={(event) => {
        if (event.type !== "deck/close-panel") return false;
        setOpen(false);
        return true;
      }}
    >
      <div class="flex flex-col gap-2">
        <div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setOpen(!open())}
          >
            {open() ? "閉じる" : "開く"}
          </Button>
        </div>
        <div
          class="flex h-[480px] border border-primary"
          classList={{
            "relative w-[360px] overflow-hidden": props.full,
            "w-[720px]": !props.full,
          }}
        >
          <SidePanelMotion open={open()} full={props.full}>
            <SidePanel
              title="検索する"
              icon="i-material-symbols:search-rounded"
              full={props.full}
            >
              <p class="c-secondary p-4 text-caption">パネルの中身</p>
            </SidePanel>
          </SidePanelMotion>
          <div class="c-secondary flex-1 bg-tertiary p-4 text-caption">
            カラム
          </div>
        </div>
      </div>
    </Mediates>
  );
};

const meta = {
  title: "デッキ/パネルの開閉",
  component: Demo,
  args: { full: false },
} satisfies Meta<Props>;

export default meta;
type S = StoryObj<typeof meta>;

export const 広い画面: S = {};
export const 狭い画面: S = { args: { full: true } };
