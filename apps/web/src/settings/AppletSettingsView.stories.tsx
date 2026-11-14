import type { Meta, StoryObj } from "storybook-solidjs-vite";
import AppletSettingsView from "./AppletSettingsView";

const meta = {
  title: "設定/アップレット",
  component: AppletSettingsView,
  args: {
    roles: [
      {
        archetype: "profile",
        options: [
          { value: "35129:a:simple-profile", title: "Simple Profile" },
          { value: "streets", title: "Streets のカラム" },
        ],
        current: "35129:a:simple-profile",
      },
      {
        archetype: "note",
        options: [{ value: "streets", title: "Streets のカラム" }],
      },
      {
        archetype: "map",
        options: [
          {
            value: "35129:b:map",
            title:
              "とても長い名前の地図のアップレットで、ボタンに収まらないもの",
          },
        ],
        current: "35129:b:map",
      },
    ],
    onChange: () => {},
  },
  decorators: [
    (Story) => (
      <div class="w-[480px] bg-primary p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AppletSettingsView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ふつう: Story = {};

export const 選べるものが無い: Story = { args: { roles: [] } };
