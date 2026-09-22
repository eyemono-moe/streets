import { DEFAULT_KEYMAP, type Keymap } from "@streets/core/settings/keymap";
import { createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { Mediates } from "../ui-events";
import KeyboardSettings from "./KeyboardSettings";

type Args = { keymap: Keymap; columnDigits: boolean; width: number };

/** アプリでは DeckScreen が裁定するイベントを、ここで手元の割り当てに当てる。 */
const Story = (props: Args) => {
  const [keymap, setKeymap] = createSignal(props.keymap);
  const [columnDigits, setColumnDigits] = createSignal(props.columnDigits);
  return (
    <Mediates
      handle={(event) => {
        if (event.type === "deck/set-shortcut") {
          setKeymap((current) => ({
            ...current,
            [event.action]: event.hotkey,
          }));
          return true;
        }
        if (event.type === "deck/set-column-digits") {
          setColumnDigits(event.on);
          return true;
        }
        return false;
      }}
    >
      <div class="bg-primary p-6" style={{ width: `${props.width}px` }}>
        <KeyboardSettings keymap={keymap()} columnDigits={columnDigits()} />
      </div>
    </Mediates>
  );
};

const meta = {
  title: "設定/キーボード",
  render: (args) => <Story {...args} />,
  args: { keymap: DEFAULT_KEYMAP, columnDigits: true, width: 560 },
} satisfies Meta<Args>;

export default meta;
type S = StoryObj<Args>;

export const 既定のまま: S = {};

export const 変えたあと: S = {
  args: {
    keymap: { ...DEFAULT_KEYMAP, compose: "Mod+[KeyJ]", "add-column": "" },
  },
};

export const 数字キーを切ったとき: S = { args: { columnDigits: false } };

export const 狭い画面: S = { args: { width: 340 } };
