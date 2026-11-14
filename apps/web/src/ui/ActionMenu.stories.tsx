import type { Meta, StoryObj } from "storybook-solidjs-vite";
import ActionMenu from "./ActionMenu";

const items = [
  {
    value: "install",
    label: "インストールする",
    icon: "i-material-symbols:download-rounded",
  },
  {
    value: "install-add",
    label: "インストールしてデッキに追加する",
    icon: "i-material-symbols:add-column-right-outline-rounded",
  },
  {
    value: "uninstall",
    label: "アンインストールする",
    icon: "i-material-symbols:do-not-disturb-on-outline-rounded",
    danger: true,
  },
];

const meta = {
  title: "UI/ActionMenu",
  component: ActionMenu,
  args: { label: "Chronofeed の操作", items, onSelect: () => {} },
  decorators: [
    (Story) => (
      <div class="flex min-h-[280px] justify-end bg-primary p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ActionMenu>;

export default meta;
type S = StoryObj<typeof meta>;

/** カーソルを当てられる端末。⋯ を押すとポップアップで開く。 */
export const ポップアップ: S = { args: { sheet: false } };

/** 触る端末。⋯ を押すと下からシートが出る。 */
export const シート: S = { args: { sheet: true } };
