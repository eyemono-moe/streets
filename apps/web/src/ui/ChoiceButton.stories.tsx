import type { Meta, StoryObj } from "storybook-solidjs-vite";
import ChoiceButton, { type ChoiceButtonProps } from "./ChoiceButton";

const meta = {
  title: "UI/ChoiceButton",
  component: (props: ChoiceButtonProps) => (
    <div class="w-90 p-4">
      <ChoiceButton {...props} />
    </div>
  ),
  args: {
    icon: "i-material-symbols:person-add-outline-rounded",
    title: "はじめての方",
    description: "Nostr のアカウントを作るところから案内します",
    trailing: "next",
  },
} satisfies Meta<ChoiceButtonProps>;

export default meta;
type S = StoryObj<typeof meta>;

export const 次へ進む: S = {};
export const その場で開く: S = { args: { trailing: "expand" } };
export const 印なし: S = { args: { trailing: undefined } };
export const 説明なし: S = { args: { description: undefined } };
export const 押せない: S = { args: { disabled: true } };
export const 長い説明: S = {
  args: {
    description:
      "Amber や Primal など、鍵を預かる別のアプリに署名を頼みます。スマートフォンの署名器なら QR コードを読み取ります。",
  },
};
