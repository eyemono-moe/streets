import { createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import TextField from "./TextField";

type Args = {
  label: string;
  initial: string;
  placeholder?: string;
  hint?: string;
  error?: string;
  multiline?: boolean;
};

const Story = (props: Args) => {
  const [value, setValue] = createSignal(props.initial);
  return (
    <div class="w-80 p-4">
      <TextField
        label={props.label}
        value={value()}
        onInput={setValue}
        placeholder={props.placeholder}
        hint={props.hint}
        error={props.error}
        multiline={props.multiline}
      />
    </div>
  );
};

const meta = {
  title: "UI/TextField",
  component: Story,
  args: { label: "表示名", initial: "わたし" },
} satisfies Meta<Args>;

export default meta;
type S = StoryObj<typeof meta>;

export const いつもの: S = {};
export const 空と例: S = {
  args: { initial: "", placeholder: "例：わたし" },
};
export const 説明つき: S = {
  args: {
    label: "ドメインでの本人確認（NIP-05）",
    initial: "",
    placeholder: "name@example.com",
    hint: "持っているドメインで、このアカウントが自分のものだと示せます。",
  },
};
export const 誤り: S = {
  args: {
    label: "アイコン画像の URL",
    initial: "example.com/me.png",
    error: "https:// で始まる URL を入力してください",
  },
};
export const 複数行: S = {
  args: {
    label: "自己紹介",
    initial: "Nostr のクライアントを作っています。\n2 行目",
    multiline: true,
  },
};
