import { createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import SplitButton from "./SplitButton";

type Way = "draft" | "now" | "later";

const Story = (props: { initial: Way; open: boolean; disabled: boolean }) => {
  const [way, setWay] = createSignal<Way>(props.initial);
  return (
    <div class="flex h-60 w-96 items-start justify-end p-4">
      <SplitButton
        icon={
          way() === "now"
            ? "i-material-symbols:send-rounded"
            : "i-material-symbols:edit-note-rounded"
        }
        menuLabel="送り方を選ぶ"
        value={way()}
        onChange={setWay}
        disabled={props.disabled}
        defaultOpen={props.open}
        options={[
          {
            value: "draft",
            label: "下書きに残す",
            icon: "i-material-symbols:edit-note-rounded",
            description: "あとで見直してから送ります。",
          },
          {
            value: "now",
            label: "すぐ送る",
            icon: "i-material-symbols:send-rounded",
            description: "押したらその場で送ります。",
          },
          {
            value: "later",
            label: "時間を決めて送る",
            icon: "i-material-symbols:schedule-outline-rounded",
            disabled: true,
            hint: "今は選べない理由をここに出します",
          },
        ]}
      >
        {way() === "now" ? "すぐ送る" : "下書きに残す"}
      </SplitButton>
    </div>
  );
};

const meta = {
  title: "UI/SplitButton",
  component: Story,
  args: { initial: "draft", open: false, disabled: false },
} satisfies Meta<{ initial: Way; open: boolean; disabled: boolean }>;

export default meta;
type S = StoryObj<typeof meta>;

export const 単体: S = {};
export const メニューを開いた: S = { args: { open: true } };
export const 別のやり方を選んだ: S = { args: { initial: "now" } };
export const 押せない: S = { args: { disabled: true } };
