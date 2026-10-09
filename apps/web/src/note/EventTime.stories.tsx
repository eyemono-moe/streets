import type { TimeFormat } from "@streets/core/settings/time-format-setting";
import { For } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { setTimeFormat } from "../time-format-setting";
import EventTime from "./EventTime";

const AGES: { label: string; ms: number }[] = [
  { label: "30 秒前", ms: 30_000 },
  { label: "5 分前", ms: 5 * 60_000 },
  { label: "59 分前", ms: 59 * 60_000 },
  { label: "3 時間前", ms: 3 * 3_600_000 },
  { label: "23 時間前", ms: 23 * 3_600_000 },
  { label: "2 日前", ms: 2 * 86_400_000 },
  { label: "400 日前", ms: 400 * 86_400_000 },
  { label: "端末の時計より 2 分先", ms: -2 * 60_000 },
];

const Times = (props: { format: TimeFormat }) => {
  setTimeFormat(props.format);
  const now = Date.now();
  return (
    <dl class="grid w-80 grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-caption">
      <For each={AGES}>
        {(age) => (
          <>
            <dt class="c-primary">{age.label}</dt>
            <dd>
              <EventTime at={new Date(now - age.ms)} />
            </dd>
          </>
        )}
      </For>
    </dl>
  );
};

const meta = {
  title: "イベント/投稿の時刻",
  component: Times,
} satisfies Meta<typeof Times>;

export default meta;
type Story = StoryObj<typeof meta>;

export const 時刻: Story = { args: { format: "absolute" } };

export const 経過時間: Story = { args: { format: "relative" } };
