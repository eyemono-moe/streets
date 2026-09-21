import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { Mediates } from "../ui-events";
import SearchPanel from "./SearchPanel";
import SidePanel from "./SidePanel";

type Props = { width: number };

const meta = {
  title: "デッキ/探す",
  component: (props: Props) => (
    // 開いたカラムはデッキが受け取る。ここでは受け取って捨てる。
    <Mediates handle={(event) => event.type === "deck/add-column"}>
      <div class="flex h-[560px]" style={{ width: `${props.width}px` }}>
        <SidePanel title="探す" icon="i-material-symbols:search-rounded">
          <SearchPanel />
        </SidePanel>
      </div>
    </Mediates>
  ),
  args: { width: 360 },
} satisfies Meta<Props>;

export default meta;
type S = StoryObj<typeof meta>;

export const 空: S = {};
export const 狭い幅: S = { args: { width: 300 } };
