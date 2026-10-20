import type { Meta, StoryObj } from "storybook-solidjs-vite";
import PrivacySettings from "./PrivacySettings";

const meta = {
  title: "設定/プライバシー",
  component: PrivacySettings,
  args: { clientTag: true, notifyQuoted: true, errorReport: false },
  decorators: [
    (Story) => (
      <div class="p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PrivacySettings>;

export default meta;
type S = StoryObj<typeof meta>;

export const 既定: S = {};

/** 引用の通知を切ると、名前の横に「既定に戻す」が出る。 */
export const 既定から変えてある: S = { args: { notifyQuoted: false } };

/** ツールバーの「言語」を切り替えなくても、英語の見え方を確かめられるように並べる。 */
export const 英語: S = {
  args: { notifyQuoted: false },
  globals: { locale: "en" },
};
