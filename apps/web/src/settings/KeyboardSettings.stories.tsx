import { DEFAULT_KEYMAP, type Keymap } from "@streets/core/settings/keymap";
import { createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { Mediates } from "../ui-events";
import KeyboardSettings from "./KeyboardSettings";

type Args = { keymap: Keymap; width: number };

/** アプリでは DeckScreen が裁定するイベントを、ここで手元の割り当てに当てる。 */
const Story = (props: Args) => {
  const [keymap, setKeymap] = createSignal(props.keymap);
  return (
    <Mediates
      handle={(event) => {
        if (event.type !== "deck/set-shortcut") return false;
        setKeymap((current) => ({
          ...current,
          [event.action]: event.hotkey,
        }));
        return true;
      }}
    >
      <div class="bg-primary p-6" style={{ width: `${props.width}px` }}>
        <KeyboardSettings keymap={keymap()} />
      </div>
    </Mediates>
  );
};

const meta = {
  title: "設定/キーボード",
  render: (args) => <Story {...args} />,
  args: { keymap: DEFAULT_KEYMAP, width: 560 },
} satisfies Meta<Args>;

export default meta;
type S = StoryObj<Args>;

export const 既定のまま: S = {};

export const 変えたあと: S = {
  args: {
    keymap: { ...DEFAULT_KEYMAP, compose: "Mod+[KeyJ]", "add-column": "" },
  },
};

export const 狭い画面: S = { args: { width: 340 } };
