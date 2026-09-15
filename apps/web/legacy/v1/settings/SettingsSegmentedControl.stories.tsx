import { type Component, createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import SettingsSegmentedControl, {
  type SettingsSegmentedOption,
} from "./SettingsSegmentedControl";

type ControlledProps = {
  ariaLabel: string;
  options: readonly SettingsSegmentedOption[];
  initialValue: readonly string[];
  multiple?: boolean;
  block?: boolean;
  compact?: boolean;
  disabled?: boolean;
};

const Controlled: Component<ControlledProps> = (props) => {
  const [value, setValue] = createSignal([...props.initialValue]);
  return (
    <SettingsSegmentedControl
      ariaLabel={props.ariaLabel}
      options={props.options}
      value={value()}
      multiple={props.multiple}
      block={props.block}
      compact={props.compact}
      disabled={props.disabled}
      onValueChange={setValue}
    />
  );
};

const directionOptions = [
  { value: "read", label: "read" },
  { value: "write", label: "write" },
];

const meta = {
  title: "v1/Settings/Patterns/SegmentedControl",
  component: Controlled,
  args: {
    ariaLabel: "リレーの用途",
    options: directionOptions,
    initialValue: ["read", "write"],
    multiple: true,
  },
} satisfies Meta<typeof Controlled>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Multiple: Story = {};

export const Single: Story = {
  args: {
    ariaLabel: "公開範囲",
    options: [
      { value: "private", label: "非公開" },
      { value: "public", label: "公開" },
    ],
    initialValue: ["private"],
    multiple: false,
  },
};

export const FourColumns: Story = {
  args: {
    ariaLabel: "ミュート対象の種類",
    options: [
      { value: "pubkey", label: "著者" },
      { value: "thread", label: "スレッド" },
      { value: "hashtag", label: "ハッシュタグ" },
      { value: "word", label: "単語" },
    ],
    initialValue: ["pubkey"],
    multiple: false,
    block: true,
  },
};

export const Disabled: Story = {
  args: { disabled: true },
};
