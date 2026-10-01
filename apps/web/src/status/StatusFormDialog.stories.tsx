import {
  type StatusFormEvent,
  type StatusFormState,
  closedStatusForm,
  statusFormTransition,
} from "@streets/core/view/status-form";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { StaticCustomEmojis } from "../emoji/custom-emojis";
import emojiUrl from "../storybook/emoji-fixture.svg";
import StatusFormDialog from "./StatusFormDialog";

const run = (...events: StatusFormEvent[]): StatusFormState =>
  events.reduce(statusFormTransition, closedStatusForm());

const now = Math.floor(Date.now() / 1000);

const meta = {
  title: "ステータス/設定のダイアログ",
  component: StatusFormDialog,
  // `:` で出る候補と、ピッカーの「自分の絵文字」に出す。
  decorators: [
    (Story) => (
      <StaticCustomEmojis emojis={[{ shortcode: "neko", url: emojiUrl }]}>
        <Story />
      </StaticCustomEmojis>
    ),
  ],
} satisfies Meta<typeof StatusFormDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/** まだステータスが無いとき。消える時刻は 1 時間から始める。 */
export const 新しく設定する: Story = {
  args: { form: run({ type: "status-form/open", current: undefined }) },
};

/** 今のステータスを直すとき。期限は「そのまま」から始め、「ステータスを消す」も出す。 */
export const 今のステータスを直す: Story = {
  args: {
    form: run({
      type: "status-form/open",
      current: {
        type: "general",
        content: "💻 作業中",
        link: { type: "url", url: "https://example.com/schedule" },
        expiresAt: now + 3600,
        tags: [],
      },
    }),
  },
};

/** 書きかけのまま閉じようとしたとき。 */
export const 書きかけで閉じようとした: Story = {
  args: {
    form: run(
      { type: "status-form/open", current: undefined },
      { type: "status-form/input", field: "content", value: "☕ 休憩中" },
      { type: "status-form/close" },
    ),
  },
};

export const 送っている途中: Story = {
  args: {
    form: run(
      { type: "status-form/open", current: undefined },
      { type: "status-form/input", field: "content", value: "🚶 外出中" },
      { type: "status-form/submit" },
    ),
  },
};

/** 本文にカスタム絵文字を書いたとき。欄では `:shortcode:` のまま見え、保存すると絵文字になる。 */
export const カスタム絵文字を入れた: Story = {
  args: {
    form: run(
      { type: "status-form/open", current: undefined },
      { type: "status-form/input", field: "content", value: ":neko: 休憩中" },
    ),
  },
};
