import type { DeckAppearance } from "@streets/core/deck/deck";
import type { ColorScheme } from "@streets/core/settings/color-scheme";
import { createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { DEFAULT_APPEARANCE, PALETTES, applyColors } from "../theme";
import { Mediates } from "../ui-events";
import SettingsDialog from "./SettingsDialog";

type Props = { wide: boolean; appearance: DeckAppearance };

/**
 * アプリではデッキの段が受け取るイベントを、ここで受けて手元の値に当てる。
 * 色はストーリーの画面全体に当たる（ツールバーのテーマ色より優先される）。
 */
const Story = (props: Props) => {
  const [scheme, setScheme] = createSignal<ColorScheme>("system");
  const [appearance, setAppearance] = createSignal(props.appearance);
  applyColors(props.appearance);
  return (
    <Mediates
      handle={(event) => {
        switch (event.type) {
          case "deck/set-color-scheme":
            setScheme(event.scheme);
            return false;
          case "deck/preview-appearance":
            applyColors(event.appearance);
            return true;
          case "deck/set-appearance":
            applyColors(event.appearance);
            setAppearance(event.appearance);
            return true;
          default:
            return false;
        }
      }}
    >
      <SettingsDialog
        open
        wide={props.wide}
        scheme={scheme()}
        appearance={appearance()}
      />
    </Mediates>
  );
};

const meta = {
  title: "設定/設定のダイアログ",
  component: Story,
  args: { wide: true, appearance: DEFAULT_APPEARANCE },
  argTypes: { appearance: { control: false } },
  parameters: { viewport: { defaultViewport: "responsive" } },
} satisfies Meta<Props>;

export default meta;
type S = StoryObj<typeof meta>;

export const 表示_広い画面: S = {};

export const 表示_狭い画面: S = { args: { wide: false } };

export const 表示_自分で選んだ色: S = {
  args: { appearance: { accent: "#E0457B", ui: "#1F3B4D" } },
};

export const 表示_シアン: S = {
  args: { appearance: { accent: PALETTES.cyan.accent, ui: PALETTES.cyan.ui } },
};
