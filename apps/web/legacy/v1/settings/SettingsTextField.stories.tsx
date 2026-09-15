import type { Meta, StoryObj } from "storybook-solidjs-vite";
import SettingsTextField from "./SettingsTextField";

const meta = {
  title: "v1/Settings/Patterns/TextField",
  component: SettingsTextField,
  args: {
    label: "リレー URL",
    placeholder: "wss://relay.example",
    rootClass: "w-80",
  },
} satisfies Meta<typeof SettingsTextField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};

export const WithValue: Story = {
  args: { value: "wss://relay.example/" },
};

export const VisibleLabel: Story = {
  args: { labelVisible: true, value: "wss://relay.example/" },
};

export const Invalid: Story = {
  args: {
    value: "https://example.com",
    error: "ws:// または wss:// が必要です",
  },
};

export const Disabled: Story = {
  args: { value: "wss://relay.example/", disabled: true },
};
