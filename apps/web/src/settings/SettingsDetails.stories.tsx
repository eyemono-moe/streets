import type { Meta, StoryObj } from "storybook-solidjs-vite";
import SettingsDetails from "./SettingsDetails";
import SettingsSection from "./SettingsSection";

type Args = { open: boolean; width: number };

const Story = (props: Args) => (
  <div class="bg-primary p-6" style={{ width: `${props.width}px` }}>
    <div class="flex flex-col gap-7">
      <SettingsSection
        title="よく変える設定"
        description="ページの上に並ぶ設定です。"
      />
      <SettingsDetails
        page="story"
        summary="あまり変えない設定と、いまの様子を見せるもの"
        defaultOpen={props.open}
      >
        <SettingsSection
          title="細かい設定"
          description="開いたときだけ見える設定です。"
        />
        <SettingsSection
          title="いまの様子"
          description="長い一覧はここに置きます。"
        />
      </SettingsDetails>
    </div>
  </div>
);

const meta = {
  title: "設定/詳しく",
  component: Story,
  args: { open: false, width: 660 },
} satisfies Meta<Args>;

export default meta;
type S = StoryObj<typeof meta>;

export const 閉じている: S = {};
export const 開いている: S = { args: { open: true } };
export const 狭い幅: S = { args: { width: 340 } };
