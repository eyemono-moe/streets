import { formatEventTimeFull } from "@streets/core/view/format-time";
import { createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import DateTimeInput from "./DateTimeInput";

const Story = (props: { initial: number; max?: number }) => {
  const [value, setValue] = createSignal(props.initial);
  return (
    <div class="flex w-80 flex-col gap-2 p-4">
      <DateTimeInput
        label="日時"
        value={value()}
        onChange={setValue}
        max={props.max}
      />
      <p class="c-secondary text-caption">
        {formatEventTimeFull(new Date(value() * 1000))}（{value()}）
      </p>
    </div>
  );
};

const meta = {
  title: "UI/DateTimeInput",
  component: Story,
  args: { initial: Math.floor(new Date(2026, 9, 1, 12, 34).getTime() / 1000) },
} satisfies Meta<typeof Story>;

export default meta;
type S = StoryObj<typeof meta>;

export const Default: S = {};

/** 今より後は選べない。 */
export const UpToNow: S = {
  args: { max: Math.floor(Date.now() / 1000) },
};
